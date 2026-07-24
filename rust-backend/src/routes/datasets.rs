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
use redis::AsyncCommands;

const CACHE_KEY: &str = "zfs:datasets";
const CACHE_TTL: u64 = 30;

async fn bust_cache(state: &AppState) {
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let _: redis::RedisResult<()> = conn.del(CACHE_KEY).await;
    }
}

use serde::Serialize;

pub struct RewriteInfo {
    pub total_bytes: u64,
    pub processed_bytes: Arc<AtomicU64>,
    pub last_processed_bytes: Arc<AtomicU64>,
    pub started_at_secs: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedRewriteInfo {
    pub name: String,
    pub pool: String,
    pub total_files: usize,
    pub duration_secs: u64,
    pub size_before_bytes: u64,
    pub size_after_bytes: u64,
    pub du_before_blocks: u64,
    pub du_after_blocks: u64,
}

pub fn completed_rewrites() -> &'static TokioMutex<Vec<CompletedRewriteInfo>> {
    static COMPLETED: OnceLock<TokioMutex<Vec<CompletedRewriteInfo>>> = OnceLock::new();
    COMPLETED.get_or_init(|| TokioMutex::new(Vec::new()))
}

pub async fn pop_rewrite_deltas() -> HashMap<String, u64> {
    let lock = active_rewrites().lock().await;
    let mut deltas = HashMap::new();
    for (name, info) in lock.iter() {
        let pool = name.split('/').next().unwrap_or(name).to_string();
        let current = info.processed_bytes.load(Ordering::Relaxed);
        let last = info.last_processed_bytes.load(Ordering::Relaxed);
        let delta = current.saturating_sub(last);
        info.last_processed_bytes.store(current, Ordering::Relaxed);
        *deltas.entry(pool).or_insert(0) += delta;
    }
    deltas
}

async fn pop_completed_rewrites() -> Result<Json<Value>, ApiError> {
    let mut lock = completed_rewrites().lock().await;
    let completed = std::mem::take(&mut *lock);
    Ok(Json(json!({ "completed": completed })))
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // Collection
        .route("/api/v1/datasets", get(list_datasets).post(create_dataset))
        // Single item  – GET/DELETE by wildcard name (e.g. "tank/data")
        .route("/api/v1/datasets/*name", get(get_dataset).delete(destroy_dataset))
        // Actions – name is passed in the request body
        .route("/api/v1/datasets/mount",  post(mount_dataset))
        .route("/api/v1/datasets/persistent-mount", post(persistent_mount_dataset))
        .route("/api/v1/datasets/unmount", post(unmount_dataset))
        .route("/api/v1/datasets/rename", post(rename_dataset))
        .route("/api/v1/datasets/space",  get(dataset_space))
        .route("/api/v1/datasets/rewrite", post(rewrite_dataset))
        .route("/api/v1/datasets/rewrite/status", get(rewrite_status))
        .route("/api/v1/datasets/rewrite/active", get(list_active_rewrites))
        .route("/api/v1/datasets/rewrite/completed", get(pop_completed_rewrites))
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
pub struct PersistentMountBody {
    pub name: String,
    pub mountpoint: String,
    #[serde(default)]
    pub encrypted: bool,
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

async fn list_datasets(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let cached: redis::RedisResult<Option<String>> = conn.get(CACHE_KEY).await;
        if let Ok(Some(hit)) = cached {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Ok(Json(val));
            }
        }
    }

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
    let result = json!({ "datasets": datasets });
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        if let Ok(json_str) = serde_json::to_string(&result) {
            let set_res: redis::RedisResult<()> = conn.set_ex(CACHE_KEY, json_str, CACHE_TTL).await;
            if let Err(e) = set_res { warn!("Redis SET failed for {CACHE_KEY}: {e}"); }
        }
    }
    Ok(Json(result))
}

async fn create_dataset(State(state): State<AppState>, Json(body): Json<CreateDatasetBody>) -> Result<Json<Value>, ApiError> {
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

    bust_cache(&state).await;
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
    State(state): State<AppState>,
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
        None => {
            bust_cache(&state).await;
            Ok(Json(json!({ "message": format!("Dataset '{name}' destroyed") })))
        }
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

async fn persistent_mount_dataset(Json(body): Json<PersistentMountBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    if body.mountpoint.is_empty() {
        return Err(ApiError::BadRequest("'mountpoint' is required".into()));
    }

    executor::validate_zfs_name(&body.name, "dataset")?;

    let mp = body.mountpoint.trim_end_matches('/');
    let mut steps: Vec<String> = Vec::new();

    // 1. Pre-create the mountpoint directory
    tokio::fs::create_dir_all(mp).await
        .map_err(|e| ApiError::InternalError(format!("Failed to create mountpoint {}: {}", mp, e)))?;
    steps.push(format!("Created directory {}", mp));

    // 2. Set the mountpoint property permanently
    executor::zfs(&["set", &format!("mountpoint={}", mp), &body.name]).await?;
    steps.push(format!("Set mountpoint={}", mp));

    // 3. Enable auto-mount at boot
    executor::zfs(&["set", "canmount=on", &body.name]).await?;
    steps.push("Set canmount=on".into());

    // 4. Handle encryption key setup for persistent pre-boot mounting
    if body.encrypted {
        // Derive a safe filename from the dataset name (replace / with -)
        let safe_name = body.name.replace('/', "-");
        let key_path = format!("/root/{}.key", safe_name);

        // Generate a random 32-byte keyfile if one doesn't exist yet
        if !std::path::Path::new(&key_path).exists() {
            let output = tokio::process::Command::new("dd")
                .args(["if=/dev/urandom", &format!("of={}", key_path), "bs=32", "count=1"])
                .output().await
                .map_err(|e| ApiError::InternalError(format!("dd failed: {}", e)))?;
            if !output.status.success() {
                return Err(ApiError::InternalError(
                    String::from_utf8_lossy(&output.stderr).to_string()
                ));
            }

            // Restrict permissions to root only
            tokio::process::Command::new("chmod")
                .args(["600", &key_path])
                .status().await.ok();
            steps.push(format!("Generated keyfile {}", key_path));
        } else {
            steps.push(format!("Using existing keyfile {}", key_path));
        }

        // Bind the key to the dataset
        let key_location = format!("keylocation=file://{}", key_path);
        executor::zfs(&[
            "change-key",
            "-o", "keyformat=raw",
            "-o", &key_location,
            &body.name,
        ]).await?;
        steps.push("Configured encryption key location".into());

        // Write the ZFS early-mount key-load script for initramfs/dracut hooks.
        // This script is called by the ZFS initramfs during early boot to load the
        // encryption key before datasets are mounted.
        let script_path = format!("/etc/zfs/zfs-load-key-{}.sh", safe_name);
        let script_content = format!(
            "#!/bin/sh\n\
             # Auto-generated by ZFS Manager — loads encryption key for {name}\n\
             # Called by ZFS initramfs hooks before datasets are mounted at boot.\n\
             if [ -f \"{key}\" ]; then\n\
             \tzfs load-key -L file://{key} \"{name}\"\n\
             fi\n\
             zfs mount \"{name}\"\n",
            name = body.name,
            key  = key_path,
        );

        // Ensure the directory exists
        tokio::fs::create_dir_all("/etc/zfs").await.ok();

        tokio::fs::write(&script_path, script_content).await
            .map_err(|e| ApiError::InternalError(format!("Failed to write {}: {}", script_path, e)))?;

        // Make script executable
        tokio::process::Command::new("chmod")
            .args(["755", &script_path])
            .status().await.ok();

        steps.push(format!("Wrote early-mount script {}", script_path));
    }

    // 5. Mount the dataset immediately
    executor::zfs(&["mount", &body.name]).await?;
    steps.push(format!("Mounted {} at {}", body.name, mp));

    Ok(Json(json!({
        "message": format!("Dataset '{}' mounted persistently at {}", body.name, mp),
        "steps": steps,
    })))
}

async fn unmount_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["unmount", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' unmounted", body.name) })))
}

async fn rename_dataset(State(state): State<AppState>, Json(body): Json<RenameBody>) -> Result<Json<Value>, ApiError> {
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
    bust_cache(&state).await;
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
    let last_processed = Arc::new(AtomicU64::new(0));

    let mut lock = active_rewrites().lock().await;
    if lock.contains_key(&body.name) {
        return Ok(Json(json!({ "message": format!("Rewrite already running for '{}'", body.name) })));
    }
    lock.insert(body.name.clone(), RewriteInfo {
        total_bytes,
        processed_bytes: Arc::clone(&processed),
        last_processed_bytes: Arc::clone(&last_processed),
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
        let started_at = now_secs();
        let size_before_bytes: u64 = executor::zfs(&["get", "-H", "-p", "-o", "value", "refer", &ds_name])
            .await
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        let du_before_blocks = get_du_blocks(&mountpoint_c).await;

        crate::routes::notifications::trigger_rules_for_event(
            &state_clone,
            "dataset_rewrite_start",
            &format!("Dataset rewrite started for '{}'", ds_name)
        ).await;

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

        let size_after_bytes: u64 = executor::zfs(&["get", "-H", "-p", "-o", "value", "refer", &ds_name])
            .await
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        let du_after_blocks = get_du_blocks(&mountpoint_c).await;

        let duration_secs = now_secs().saturating_sub(started_at);
        let pool = ds_name.split('/').next().unwrap_or(&ds_name).to_string();

        completed_rewrites().lock().await.push(CompletedRewriteInfo {
            name: ds_name.clone(),
            pool,
            total_files,
            duration_secs,
            size_before_bytes,
            size_after_bytes,
            du_before_blocks,
            du_after_blocks,
        });

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

async fn get_du_blocks(mountpoint: &str) -> u64 {
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new("nsenter")
            .args(["-t", "1", "-m", "--", "du", "-s", mountpoint])
            .output()
    ).await;
    let stdout = match out {
        Ok(Ok(o)) if o.status.success() => o.stdout,
        _ => {
            let fallback = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                tokio::process::Command::new("du")
                    .args(["-s", mountpoint])
                    .output()
            ).await;
            match fallback {
                Ok(Ok(o)) if o.status.success() => o.stdout,
                _ => Vec::new(),
            }
        }
    };
    let s = String::from_utf8_lossy(&stdout);
    s.split_whitespace().next().and_then(|w| w.parse().ok()).unwrap_or(0)
}
