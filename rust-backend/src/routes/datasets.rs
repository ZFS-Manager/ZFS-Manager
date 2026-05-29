use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Mutex as TokioMutex;

use crate::{error::ApiError, executor, state::AppState};
use tracing::{info, warn};

struct RewriteInfo {
    total_bytes: u64,
    processed_bytes: Arc<AtomicU64>,
    started_at_secs: u64,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn active_rewrites() -> &'static TokioMutex<HashMap<String, RewriteInfo>> {
    static REWRITES: OnceLock<TokioMutex<HashMap<String, RewriteInfo>>> = OnceLock::new();
    REWRITES.get_or_init(|| TokioMutex::new(HashMap::new()))
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // Collection
        .route("/api/v1/datasets", get(list_datasets).post(create_dataset))
        // Single item  – GET/DELETE by wildcard name (e.g. "tank/data")
        .route("/api/v1/datasets/*name", get(get_dataset).delete(destroy_dataset))
        // Actions – name is passed in the request body
        .route("/api/v1/datasets/mount",  post(mount_dataset))
        .route("/api/v1/datasets/unmount", post(unmount_dataset))
        .route("/api/v1/datasets/rename", post(rename_dataset))
        .route("/api/v1/datasets/space",  get(dataset_space))
        .route("/api/v1/datasets/rewrite", post(rewrite_dataset))
        .route("/api/v1/datasets/rewrite/status", get(rewrite_status))
        .route("/api/v1/datasets/rewrite/active", get(list_active_rewrites))
        .with_state(state)
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDatasetBody {
    pub name: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct NameBody {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub name: String,
    pub new_name: String,
    #[serde(default)]
    pub recursive: bool,
}

#[derive(Deserialize)]
pub struct SpaceQuery {
    pub name: String,
}

#[derive(Deserialize, Default)]
pub struct DestroyQuery {
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub recursive: bool,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_datasets() -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&[
        "list", "-H", "-p", "-t", "filesystem",
        "-o", "name,used,avail,refer,mountpoint,compression,dedup,readonly",
    ])
    .await?;
    let datasets: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            let name = c.first().unwrap_or(&"");

            if name.contains("/.system") || name.contains("/ix-apps") {
                return None;
            }

            Some(json!({
                "name":        name,
                "used":        c.get(1).unwrap_or(&""),
                "available":   c.get(2).unwrap_or(&""),
                "refer":       c.get(3).unwrap_or(&""),
                "mountpoint":  c.get(4).unwrap_or(&""),
                "compression": c.get(5).unwrap_or(&"off"),
                "dedup":       c.get(6).unwrap_or(&"off"),
                "readonly":    c.get(7).unwrap_or(&"off"),
            }))
        })
        .collect();
    Ok(Json(json!({ "datasets": datasets })))
}

async fn create_dataset(Json(body): Json<CreateDatasetBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::validate_zfs_name(&body.name, "dataset")?;

    // Extract custom mountpoint from options (e.g. ["-o", "mountpoint=/mnt/abc/ad"])
    // and pre-create the directory so ZFS can mount there.
    let mut i = 0;
    while i + 1 < body.options.len() {
        if body.options[i] == "-o" {
            let opt = &body.options[i + 1];
            if let Some(mp) = opt.strip_prefix("mountpoint=") {
                if mp.starts_with('/') && mp != "/" {
                    let _ = std::fs::create_dir_all(mp);
                }
            }
        }
        i += 1;
    }

    let mut args = vec!["create".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;

    // Explicitly mount so the dataset is active and propagates via rshared /mnt
    let _ = executor::zfs(&["mount", &body.name]).await;

    Ok(Json(json!({ "message": format!("Dataset '{}' created", body.name) })))
}

async fn get_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "dataset")?;
    let raw = executor::zfs(&[
        "list", "-H", "-p",
        "-o", "name,used,avail,refer,mountpoint",
        &name,
    ])
    .await?;
    let line = raw
        .lines()
        .next()
        .ok_or_else(|| ApiError::NotFound(format!("Dataset '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":       c.first().unwrap_or(&""),
        "used":       c.get(1).unwrap_or(&""),
        "available":  c.get(2).unwrap_or(&""),
        "refer":      c.get(3).unwrap_or(&""),
        "mountpoint": c.get(4).unwrap_or(&""),
    })))
}

/// Scan /proc (which is the HOST's /proc via bind-mount) for processes that
/// have open file descriptors pointing inside `mount_path`, then kill them
/// via nsenter into the host PID namespace so the ZFS dataset can be freed.
async fn kill_procs_at_path(mount_path: &str) {
    let Ok(proc_dir) = std::fs::read_dir("/proc") else { return };
    let mut pids: Vec<String> = Vec::new();

    for entry in proc_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.chars().all(|c: char| c.is_ascii_digit()) { continue; }

        let fd_dir = format!("/proc/{}/fd", name);
        let Ok(fds) = std::fs::read_dir(&fd_dir) else { continue };
        for fd_entry in fds.flatten() {
            if let Ok(target) = std::fs::read_link(fd_entry.path()) {
                if target.to_string_lossy().starts_with(mount_path) {
                    pids.push(name.clone());
                    break;
                }
            }
        }
    }

    for pid in pids {
        // nsenter -t 1 --pid enters the host's root PID namespace (host PID 1
        // is in /proc since we bind-mount the host's /proc). This lets us send
        // SIGKILL to the host process even from within the container's PID namespace.
        let _ = tokio::process::Command::new("nsenter")
            .args(["-t", "1", "--pid", "--", "kill", "-9", &pid])
            .output()
            .await;
    }

    // Brief wait for the killed processes to release their file handles
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
}

async fn destroy_dataset(
    Path(name): Path<String>,
    Query(q): Query<DestroyQuery>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "dataset")?;

    // Fetch mountpoint before destroying so we have it for cleanup steps
    let mountpoint: Option<String> = executor::zfs(&["get", "-H", "-p", "-o", "value", "mountpoint", &name])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with('/'));

    // Step 1: force-unmount (ZFS -f flag uses MNT_FORCE via the kernel)
    let _ = executor::zfs(&["unmount", "-f", &name]).await;

    // Step 2: with force flag — lazy-umount + iterative VFS cache flush.
    // The container cannot kill host-PID-namespace processes (PID namespace
    // barrier), so instead we flush the kernel's VFS caches repeatedly and
    // force ZFS to sync its transactions, which allows ZFS to release its
    // internal "dataset is busy" lock even with open file descriptors.
    let drop_caches_cmd = || async {
        let _ = tokio::process::Command::new("nsenter")
            .args(["-t", "1", "-m", "--", "sh", "-c",
                   "echo 2 > /proc/sys/vm/drop_caches"])
            .output()
            .await;
    };

    if q.force {
        if let Some(ref mp) = mountpoint {
            // Lazy detach removes the mountpoint from the directory tree so
            // processes can no longer open NEW files, though existing FDs remain.
            let _ = tokio::process::Command::new("umount")
                .args(["-l", mp])
                .output()
                .await;

            // First cache flush + ZFS pool sync via host tools to commit all
            // pending ZFS transactions (clears ZFS internal open-dataset locks).
            drop_caches_cmd().await;
            let pool_name = name.split('/').next().unwrap_or("");
            if !pool_name.is_empty() {
                let _ = tokio::process::Command::new("nsenter")
                    .args(["-t", "1", "-m", "--", "zpool", "sync", pool_name])
                    .output().await;
            }
            let _ = tokio::process::Command::new("sync").output().await;

            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

            // Final force-unmount attempt now that VFS caches are partially cleared
            let _ = executor::zfs(&["unmount", "-f", &name]).await;
        }
    }

    // Step 3: destroy with retry loop.
    // On each retry, run drop_caches again — some VFS dentries are temporarily
    // pinned by kernel threads and only become freeable after a short delay.
    // Running drop_caches repeatedly with 800ms gaps covers the ~3-5s window
    // ZFS needs to fully release its dataset reference after lazy unmount.
    let mut args = vec!["destroy".to_string()];
    if q.recursive { args.push("-r".to_string()); }
    args.push("-f".to_string());
    args.push(name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let max_attempts: u32 = if q.force { 12 } else { 1 };
    let mut last_err: Option<ApiError> = None;

    for attempt in 0..max_attempts {
        if attempt > 0 {
            // Re-flush caches on each retry: some kernel VFS entries become
            // unpinned only after previous drop_caches pass has been processed.
            drop_caches_cmd().await;
            tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

            // Bail early if ZFS async-destroyed the dataset in the background
            if executor::zfs(&["list", &name]).await.is_err() {
                last_err = None;
                break;
            }
        }
        match executor::zfs(&refs).await {
            Ok(_) => { last_err = None; break; }
            Err(ApiError::CommandFailed { ref stderr, .. })
                if stderr.contains("dataset is busy") =>
            {
                last_err = Some(ApiError::CommandFailed {
                    stderr: stderr.clone(),
                    code: Some(1),
                });
            }
            Err(e) => { last_err = Some(e); break; }
        }
    }

    // Final check: ZFS may have destroyed the dataset asynchronously even
    // if the last destroy call returned "dataset is busy".
    if last_err.is_some() && q.force {
        if executor::zfs(&["list", &name]).await.is_err() {
            last_err = None;
        }
    }

    match last_err {
        None => Ok(Json(json!({ "message": format!("Dataset '{name}' destroyed") }))),
        Some(ApiError::CommandFailed { ref stderr, .. })
            if (stderr.contains("has children") || stderr.contains("filesystem has children"))
               && !q.recursive =>
        {
            Err(ApiError::BadRequest(
                "Dataset has children. Enable 'Recursive' to delete all child datasets.".into()
            ))
        }
        Some(e) => Err(e),
    }
}

async fn mount_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["mount", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' mounted", body.name) })))
}

async fn unmount_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["unmount", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' unmounted", body.name) })))
}

async fn rename_dataset(Json(body): Json<RenameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() || body.new_name.is_empty() {
        return Err(ApiError::BadRequest("'name' and 'new_name' are required".into()));
    }
    let mut args = vec!["rename".to_string()];
    if body.recursive {
        args.push("-r".to_string());
    }
    args.push(body.name.clone());
    args.push(body.new_name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;
    Ok(Json(json!({ "message": format!("Renamed '{}' -> '{}'", body.name, body.new_name) })))
}

async fn dataset_space(Query(q): Query<SpaceQuery>) -> Result<Json<Value>, ApiError> {
    if q.name.is_empty() {
        return Err(ApiError::BadRequest("query param 'name' is required".into()));
    }
    let raw = executor::zfs(&[
        "list", "-H", "-p",
        "-o", "name,used,avail,refer,quota,reservation",
        &q.name,
    ])
    .await?;
    let line = raw
        .lines()
        .next()
        .ok_or_else(|| ApiError::NotFound(format!("Dataset '{}' not found", q.name)))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":        c.first().unwrap_or(&""),
        "used":        c.get(1).unwrap_or(&""),
        "available":   c.get(2).unwrap_or(&""),
        "refer":       c.get(3).unwrap_or(&""),
        "quota":       c.get(4).unwrap_or(&""),
        "reservation": c.get(5).unwrap_or(&""),
    })))
}

async fn rewrite_dataset(
    State(state): State<AppState>,
    Json(body): Json<NameBody>,
) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    
    executor::validate_zfs_name(&body.name, "dataset")?;

    // Get the mountpoint of the dataset
    let raw = match executor::zfs(&[
        "list", "-H", "-p",
        "-o", "mountpoint",
        &body.name,
    ]).await {
        Ok(out) => out,
        Err(e) => return Err(e),
    };

    let mountpoint = raw.trim().to_string();
    if mountpoint.is_empty() || mountpoint == "none" || mountpoint == "legacy" {
        return Err(ApiError::BadRequest(format!(
            "Dataset '{}' does not have a valid active mountpoint (mountpoint='{}')",
            body.name, mountpoint
        )));
    }

    // Get dataset refer size for progress estimation
    let total_bytes: u64 = executor::zfs(&["get", "-H", "-p", "-o", "value", "refer", &body.name])
        .await
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);

    let processed = Arc::new(AtomicU64::new(0));

    let mut lock = active_rewrites().lock().await;
    if lock.contains_key(&body.name) {
        return Ok(Json(json!({ "message": format!("Rewrite already running for '{}'", body.name) })));
    }
    lock.insert(body.name.clone(), RewriteInfo {
        total_bytes,
        processed_bytes: Arc::clone(&processed),
        started_at_secs: now_secs(),
    });
    drop(lock);

    let ds_name      = body.name.clone();
    let state_clone  = state.clone();
    let mountpoint_c = mountpoint.clone();

    // Spawn background task: re-apply compression property then rewrite every block
    // on disk by reading and writing each file in-place (copy-on-write rewrites with
    // current compression settings). Uses nsenter to access the host mount namespace.
    tokio::spawn(async move {
        // 1. Re-apply current compression so future writes use it
        let comp = executor::zfs(&["get", "-H", "-p", "-o", "value", "compression", &ds_name])
            .await
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && s != "-")
            .unwrap_or_else(|| "on".to_string());
        let _ = executor::zfs(&["set", &format!("compression={}", comp), &ds_name]).await;

        info!("Dataset rewrite starting for '{}' at '{}'", ds_name, mountpoint_c);

        // 2. Enumerate all regular files via find (host namespace)
        let find_out = tokio::process::Command::new("nsenter")
            .args(["-t", "1", "-m", "--", "find", &mountpoint_c, "-type", "f", "-print0"])
            .output()
            .await;

        let files_raw = match find_out {
            Ok(out) if out.status.success() => out.stdout,
            _ => {
                // Fallback: try without nsenter (dataset visible in container namespace)
                tokio::process::Command::new("find")
                    .args([&mountpoint_c, "-type", "f", "-print0"])
                    .output()
                    .await
                    .map(|o| o.stdout)
                    .unwrap_or_default()
            }
        };

        // 3. For each file, dd it in-place so ZFS rewrites blocks with new compression
        let files: Vec<&[u8]> = files_raw.split(|&b| b == 0)
            .filter(|s| !s.is_empty())
            .collect();

        let total_files = files.len();
        info!("Dataset rewrite '{}': found {} files to process", ds_name, total_files);

        let mut done = 0usize;
        for file_bytes in &files {
            let path = match std::str::from_utf8(file_bytes) {
                Ok(s) => s,
                Err(_) => { done += 1; continue; }
            };

            // Get file size for progress tracking
            let size: u64 = tokio::process::Command::new("nsenter")
                .args(["-t", "1", "-m", "--", "stat", "-c", "%s", path])
                .output().await
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            // dd if=<file> of=<file> conv=notrunc — reads+rewrites every block in-place
            let dd_res = tokio::process::Command::new("nsenter")
                .args(["-t", "1", "-m", "--", "dd",
                    &format!("if={}", path),
                    &format!("of={}", path),
                    "conv=notrunc", "bs=131072", "status=none"])
                .output().await;

            if let Err(e) = dd_res {
                warn!("Dataset rewrite '{}': dd failed for '{}': {}", ds_name, path, e);
            }

            processed.fetch_add(size, Ordering::Relaxed);
            done += 1;

            if done % 100 == 0 {
                info!("Dataset rewrite '{}': {}/{} files done", ds_name, done, total_files);
            }
        }

        info!("Dataset rewrite completed for '{}' ({} files)", ds_name, total_files);
        crate::routes::notifications::trigger_rules_for_event(
            &state_clone,
            "dataset_rewrite_success",
            &format!("Dataset rewrite completed for '{}' ({} files)", ds_name, total_files)
        ).await;

        active_rewrites().lock().await.remove(&ds_name);
    });

    Ok(Json(json!({ "message": format!("Rewrite started in background for '{}'", body.name) })))
}

#[derive(Deserialize)]
pub struct StatusQuery {
    pub name: String,
}

async fn rewrite_status(Query(q): Query<StatusQuery>) -> Result<Json<Value>, ApiError> {
    if q.name.is_empty() {
        return Err(ApiError::BadRequest("query param 'name' is required".into()));
    }
    let lock = active_rewrites().lock().await;
    let is_running = lock.contains_key(&q.name);

    Ok(Json(json!({
        "in_progress": is_running,
        "name": q.name,
    })))
}

async fn list_active_rewrites() -> Result<Json<Value>, ApiError> {
    let now = now_secs();
    let lock = active_rewrites().lock().await;
    let active: Vec<Value> = lock.iter().map(|(name, info)| {
        let pool = name.split('/').next().unwrap_or(name);
        let elapsed_secs = now.saturating_sub(info.started_at_secs);
        let processed = info.processed_bytes.load(Ordering::Relaxed);
        json!({
            "name":            name,
            "pool":            pool,
            "total_bytes":     info.total_bytes,
            "processed_bytes": processed,
            "elapsed_secs":    elapsed_secs,
        })
    }).collect();

    Ok(Json(json!({ "active": active })))
}
