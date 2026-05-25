use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor, state::AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/pools", get(list_pools).post(create_pool))
        // Static routes BEFORE dynamic ones
        .route("/api/v1/pools/importable", get(list_importable_pools))
        .route("/api/v1/pools/:name", get(get_pool).delete(destroy_pool))
        .route("/api/v1/pools/:name/status",      get(pool_status))
        .route("/api/v1/pools/:name/vdevs",        get(pool_vdevs))
        .route("/api/v1/pools/:name/scrub",        post(start_scrub).delete(stop_scrub))
        .route("/api/v1/pools/:name/scrub-status", get(scrub_status))
        .route("/api/v1/pools/:name/export",       post(export_pool))
        .route("/api/v1/pools/:name/import",       post(import_pool))
        .route("/api/v1/pools/:name/history",      get(pool_history))
        .route("/api/v1/pools/:name/iostat",       get(pool_iostat))
        .route("/api/v1/pools/:name/upgrade",      post(upgrade_pool))
        .route("/api/v1/pools/:name/resilver",     post(resilver_pool))
        .route("/api/v1/pools/:name/expand",       post(expand_pool))
        .route("/api/v1/pools/:name/replace",      post(replace_disk))
        .route("/api/v1/pools/:name/events",       get(pool_events))
        .route("/api/v1/pools/:name/settings",     get(get_pool_settings).put(set_pool_setting))
        .with_state(state)
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetPoolSettingBody {
    pub prop:  String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct CreatePoolBody {
    pub name: String,
    pub vdevs: Vec<String>,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct ExpandBody {
    pub disk:      Option<String>,
    pub disks:     Option<Vec<String>>,
    pub vdev_type: Option<String>,
    pub target_vdev: Option<String>,
    #[serde(default)]
    pub force:     bool,
}

#[derive(Deserialize)]
pub struct ReplaceBody {
    pub old_disk: String,
    pub new_disk: String,
    #[serde(default)]
    pub force: bool,
}

#[derive(Deserialize, Default)]
pub struct ImportQuery {
    pub dir: Option<String>,
}

// ── Vdev parsing helpers ──────────────────────────────────────────────────────

fn classify_vdev(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("mirror")      { "mirror" }
    else if n.contains("raidz3") { "raidz3" }
    else if n.contains("raidz2") { "raidz2" }
    else if n.contains("raidz1") || n.starts_with("raidz") { "raidz1" }
    else if n.contains("log")    { "log" }
    else if n.contains("cache")  { "cache" }
    else if n.contains("spare")  { "spare" }
    else { "stripe" }
}

fn parse_vdev_config(status_output: &str) -> Vec<Value> {
    let config_idx = match status_output.find("\nconfig:") {
        Some(i) => i,
        None    => return vec![],
    };

    let mut vdevs: Vec<Value> = Vec::new();
    let mut cur_type  = String::new();
    let mut cur_name  = String::new();
    let mut cur_disks: Vec<Value> = Vec::new();
    let mut in_vdev   = false;
    let mut past_pool = false;

    for line in status_output[config_idx..].lines() {
        if line.trim() == "config:" { continue; }
        if line.trim().is_empty()   { continue; }
        if !line.starts_with('\t')  {
            if past_pool { break; }
            continue;
        }

        let after_tab = &line[1..];
        if after_tab.trim_start().starts_with("NAME") { continue; }
        if after_tab.trim_start().starts_with("errors:") { break; }

        let leading = after_tab.len() - after_tab.trim_start().len();
        let tokens: Vec<&str> = after_tab.split_whitespace().collect();
        let name  = tokens.first().copied().unwrap_or("");
        let state = tokens.get(1).copied().unwrap_or("ONLINE");

        match leading {
            0 => {
                past_pool = true;  // pool root line
            }
            2 => {
                // Flush previous vdev group
                if in_vdev && !cur_disks.is_empty() {
                    vdevs.push(json!({ "name": cur_name, "type": cur_type, "disks": cur_disks.clone() }));
                }
                cur_disks = Vec::new();

                let vtype = classify_vdev(name);
                if vtype == "stripe" {
                    vdevs.push(json!({ "name": name, "type": "stripe", "disks": [{"path": name, "state": state}] }));
                    in_vdev    = false;
                    cur_type   = String::new();
                    cur_name   = String::new();
                } else {
                    cur_type = vtype.to_string();
                    cur_name = name.to_string();
                    in_vdev  = true;
                }
            }
            4 if in_vdev => {
                cur_disks.push(json!({ "path": name, "state": state }));
            }
            _ => {}
        }
    }
    if in_vdev && !cur_disks.is_empty() {
        vdevs.push(json!({ "name": cur_name, "type": cur_type, "disks": cur_disks }));
    }
    vdevs
}

// ── Scrub helpers ─────────────────────────────────────────────────────────────

fn parse_human_size(s: &str) -> f64 {
    let s = s.trim();
    if s.is_empty() { return 0.0; }
    let bytes = s.as_bytes();
    let last   = *bytes.last().unwrap_or(&b'0') as char;
    if last.is_alphabetic() {
        let mult = match last.to_ascii_uppercase() {
            'T' => 1_099_511_627_776.0_f64,
            'G' => 1_073_741_824.0_f64,
            'M' => 1_048_576.0_f64,
            'K' => 1_024.0_f64,
            _ => 1.0,
        };
        s[..s.len()-1].parse::<f64>().unwrap_or(0.0) * mult
    } else {
        s.parse::<f64>().unwrap_or(0.0)
    }
}

fn parse_scan_progress(detail: &str) -> f64 {
    // Try to find "% done" (e.g., "0.00% done" or "14.5% done")
    if let Some(idx) = detail.find("% done") {
        let before = &detail[..idx];
        let num_str = before.split_whitespace().last().unwrap_or("0");
        if let Ok(val) = num_str.parse::<f64>() {
            return val;
        }
    }
    
    // Fallback to older ZFS format "scanned out of"
    if let Some(oo_idx) = detail.find("scanned out of") {
        let scanned = detail[..oo_idx].split_whitespace().last().unwrap_or("0");
        let rest    = &detail[oo_idx + "scanned out of".len()..];
        let total   = rest.split_whitespace().next().unwrap_or("0");
        let s = parse_human_size(scanned);
        let t = parse_human_size(total);
        if t > 0.0 { return (s / t * 100.0).min(99.5); }
    }
    
    0.0
}

fn extract_time_remaining(detail: &str) -> String {
    // Looks for " to go" in the entire raw output, e.g., "1 days 00:25:45 to go"
    if let Some(idx) = detail.find(" to go") {
        let before = &detail[..idx];
        // before ends with something like "0B repaired, 0.00% done, 1 days 00:25:45"
        if let Some(time_part) = before.rsplit(", ").next() {
            return time_part.to_string();
        }
    }
    String::new()
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_pools() -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&["list", "-H", "-p", "-o", "name,size,alloc,free,frag,cap,dedup,health,altroot"]).await?;

    let avail_raw = executor::zfs(&["get", "-H", "-p", "-o", "name,value", "available"])
        .await
        .unwrap_or_default();
    let avail_map: std::collections::HashMap<&str, u64> = avail_raw.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\t');
            let name = parts.next()?;
            let val: u64 = parts.next()?.trim().parse().ok()?;
            Some((name, val))
        })
        .collect();

    let used_raw = executor::zfs(&["get", "-H", "-p", "-o", "name,value", "used"])
        .await
        .unwrap_or_default();
    let used_map: std::collections::HashMap<&str, u64> = used_raw.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\t');
            let name = parts.next()?;
            let val: u64 = parts.next()?.trim().parse().ok()?;
            Some((name, val))
        })
        .collect();

    let pools: Vec<Value> = raw.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            let name = c.first().copied().unwrap_or("");
            let available_bytes = avail_map.get(name).copied().unwrap_or(0);
            let used_bytes = used_map.get(name).copied().unwrap_or(0);
            json!({
                "name":            name,
                "size":            c.get(1).unwrap_or(&""),
                "alloc":           c.get(2).unwrap_or(&""),
                "free":            c.get(3).unwrap_or(&""),
                "frag":            c.get(4).unwrap_or(&""),
                "cap":             c.get(5).unwrap_or(&""),
                "dedup":           c.get(6).unwrap_or(&""),
                "health":          c.get(7).unwrap_or(&""),
                "altroot":         c.get(8).unwrap_or(&""),
                "available_bytes": available_bytes,
                "used_bytes":      used_bytes,
            })
        })
        .collect();
    Ok(Json(json!({ "pools": pools })))
}

async fn list_importable_pools() -> Result<Json<Value>, ApiError> {
    let output = tokio::process::Command::new("zpool")
        .args(["import"])
        .output()
        .await?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pools: Vec<Value> = Vec::new();
    let mut cur_name  = String::new();
    let mut cur_id    = String::new();
    let mut cur_state = String::new();

    for line in stdout.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("pool:") {
            if !cur_name.is_empty() {
                pools.push(json!({ "name": cur_name, "id": cur_id, "state": cur_state }));
            }
            cur_name  = rest.trim().to_string();
            cur_id    = String::new();
            cur_state = String::new();
        } else if let Some(rest) = t.strip_prefix("id:") {
            cur_id = rest.trim().to_string();
        } else if let Some(rest) = t.strip_prefix("state:") {
            cur_state = rest.trim().to_string();
        }
    }
    if !cur_name.is_empty() {
        pools.push(json!({ "name": cur_name, "id": cur_id, "state": cur_state }));
    }
    Ok(Json(json!({ "pools": pools })))
}

async fn create_pool(Json(body): Json<CreatePoolBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    if body.vdevs.is_empty() {
        return Err(ApiError::BadRequest("'vdevs' must not be empty".into()));
    }
    executor::validate_zfs_name(&body.name, "pool")?;
    for v in &body.vdevs {
        // vdev paths like /dev/sda are valid; skip validation for device paths
        if !v.starts_with('/') {
            executor::validate_zfs_name(v, "vdev")?;
        }
    }
    let mut args = vec!["create".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    args.extend(body.vdevs);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&refs).await?;
    Ok(Json(json!({ "message": format!("Pool '{}' created", body.name) })))
}

async fn get_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["list", "-H", "-p", "-o",
        "name,size,alloc,free,frag,cap,dedup,health,altroot", &name]).await?;
    let line = raw.lines().next()
        .ok_or_else(|| ApiError::NotFound(format!("Pool '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":    c.first().unwrap_or(&""),
        "size":    c.get(1).unwrap_or(&""),
        "alloc":   c.get(2).unwrap_or(&""),
        "free":    c.get(3).unwrap_or(&""),
        "frag":    c.get(4).unwrap_or(&""),
        "cap":     c.get(5).unwrap_or(&""),
        "dedup":   c.get(6).unwrap_or(&""),
        "health":  c.get(7).unwrap_or(&""),
        "altroot": c.get(8).unwrap_or(&""),
    })))
}

async fn destroy_pool(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;

    // Collect disk paths before destroy so we can wipe ZFS labels afterward
    let disk_paths: Vec<String> = if let Ok(status) = executor::zpool(&["status", "-P", &name]).await {
        parse_vdev_config(&status)
            .into_iter()
            .flat_map(|v| {
                v["disks"].as_array()
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|d| d["path"].as_str().map(|s| s.to_string()))
            })
            .collect()
    } else {
        vec![]
    };

    executor::zpool(&["destroy", &name]).await?;

    // Wipe all ZFS labels AND partition signatures so disks appear free immediately.
    // labelclear removes ZFS super-blocks; wipefs clears the GPT/MBR table that
    // OpenZFS creates on whole-disk vdevs — otherwise lsblk still shows children
    // and list_enriched_disks returns in_use:true.
    for disk in &disk_paths {
        let _ = executor::zpool(&["labelclear", "-f", disk]).await;
        let _ = tokio::process::Command::new("wipefs")
            .args(["-a", disk])
            .output()
            .await;
    }

    // Bust caches so disks immediately appear free and the pool list is stale
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let _: redis::RedisResult<()> = conn.del(&["zfs:disks-enriched", "zfs:system-stats"][..]).await;
    }

    Ok(Json(json!({ "message": format!("Pool '{name}' destroyed") })))
}

async fn pool_status(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["status", &name]).await?;
    Ok(Json(json!({ "name": name, "status": raw })))
}

async fn pool_vdevs(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["status", "-v", &name]).await?;
    let raw_vdevs = parse_vdev_config(&raw);

    // Pass 1: resolve SCSI IDs / full paths to short kernel device names.
    let mut vdev_data: Vec<(String, Vec<(String, String)>)> = Vec::with_capacity(raw_vdevs.len());
    for vdev in raw_vdevs {
        let vtype = vdev["type"].as_str().unwrap_or("stripe").to_string();
        let raw_disks = vdev["disks"].as_array().cloned().unwrap_or_default();
        let mut disks: Vec<(String, String)> = Vec::with_capacity(raw_disks.len());
        for disk in raw_disks {
            let raw_path = disk["path"].as_str().unwrap_or("").to_string();
            let short    = crate::worker::resolve_disk_short_name(&raw_path).await;
            let state    = disk["state"].as_str().unwrap_or("ONLINE").to_string();
            disks.push((short, state));
        }
        vdev_data.push((vtype, disks));
    }

    // Pass 2: strip partition suffixes across the full disk list when unambiguous
    // (sdb1 → sdb only if no sdb2 also exists in the pool).
    let mut all_names: Vec<String> = vdev_data.iter()
        .flat_map(|(_, disks)| disks.iter().map(|(n, _)| n.clone()))
        .collect();
    crate::worker::strip_partition_suffix_list(&mut all_names);

    // Rebuild vdevs with stripped names.
    let mut name_iter = all_names.into_iter();
    let vdevs: Vec<Value> = vdev_data.into_iter().map(|(vtype, disks)| {
        let resolved: Vec<Value> = disks.into_iter().map(|(_, state)| {
            json!({ "path": name_iter.next().unwrap_or_default(), "state": state })
        }).collect();
        json!({ "type": vtype, "disks": resolved })
    }).collect();

    Ok(Json(json!({ "name": name, "vdevs": vdevs })))
}

async fn start_scrub(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    match executor::zpool(&["scrub", &name]).await {
        Ok(_) => Ok(Json(json!({ "message": format!("Scrub started on pool '{name}'") }))),
        Err(ApiError::CommandFailed { ref stderr, .. })
            if stderr.contains("does not support") || stderr.contains("module version") =>
        {
            Err(ApiError::BadRequest(format!(
                "Scrub not supported: ZFS userland/kernel version mismatch. \
                 Kernel module: {stderr}"
            )))
        }
        Err(e) => Err(e),
    }
}

async fn stop_scrub(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    executor::zpool(&["scrub", "-s", &name]).await?;
    Ok(Json(json!({ "message": format!("Scrub stopped on pool '{name}'") })))
}

async fn scrub_status(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["status", &name]).await?;

    let lines: Vec<&str> = raw.lines().collect();
    let mut scan_line   = String::new();
    let mut scan_detail = String::new();

    for (i, line) in lines.iter().enumerate() {
        if line.trim_start().starts_with("scan:") {
            scan_line = line.trim().to_string();
            let mut j = i + 1;
            while j < lines.len() {
                let next = lines[j];
                if next.starts_with('\t') || next.starts_with("  ") {
                    if !scan_detail.is_empty() {
                        scan_detail.push_str(" ");
                    }
                    scan_detail.push_str(next.trim());
                    j += 1;
                } else {
                    break;
                }
            }
            break;
        }
    }

    let in_progress = scan_line.contains("in progress");
    let done        = scan_line.contains("repaired") || scan_line.contains("canceled");

    let progress = if in_progress { parse_scan_progress(&scan_detail) }
                   else if done   { 100.0 }
                   else           { 0.0 };

    let time_remaining = if in_progress { extract_time_remaining(&scan_detail) }
                         else           { String::new() };

    Ok(Json(json!({
        "name":           name,
        "in_progress":    in_progress,
        "done":           done,
        "progress":       progress,
        "scan":           scan_line,
        "scan_detail":    scan_detail,
        "time_remaining": time_remaining,
    })))
}

async fn export_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    executor::zpool(&["export", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' exported") })))
}

async fn import_pool(Path(name): Path<String>, Query(q): Query<ImportQuery>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let mut args = vec!["import".to_string()];
    if let Some(dir) = q.dir {
        args.push("-d".to_string());
        args.push(dir);
    }
    args.push(name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&refs).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' imported") })))
}

async fn pool_history(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["history", &name]).await?;
    let lines: Vec<&str> = raw.lines().collect();
    Ok(Json(json!({ "name": name, "history": lines })))
}

async fn pool_iostat(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["iostat", "-H", "-p", &name, "1", "2"]).await?;
    let rows: Vec<Vec<String>> = raw.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.split('\t').map(|s| s.to_string()).collect())
        .collect();
    let stat = rows.into_iter().last().unwrap_or_default();
    Ok(Json(json!({ "name": name, "iostat": [stat] })))
}

async fn upgrade_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    executor::zpool(&["upgrade", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' upgraded") })))
}

// ZFS Rewrite = zpool scrub (validates & rewrites checksums for all blocks)
async fn resilver_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    match executor::zpool(&["scrub", &name]).await {
        Ok(_) => Ok(Json(json!({ "message": format!("Rewrite (scrub) started on pool '{name}'") }))),
        Err(ApiError::CommandFailed { ref stderr, .. }) if stderr.contains("already in progress") => {
            let _ = executor::zpool(&["scrub", "-s", &name]).await;
            executor::zpool(&["scrub", &name]).await?;
            Ok(Json(json!({ "message": format!("Rewrite (scrub) restarted on pool '{name}'") })))
        }
        Err(ApiError::CommandFailed { ref stderr, .. })
            if stderr.contains("does not support") || stderr.contains("module version") =>
        {
            Err(ApiError::BadRequest(
                "Scrub not supported: ZFS userland/kernel version mismatch. Upgrade kernel module or downgrade ZFS tools.".into()
            ))
        }
        Err(e) => Err(e),
    }
}

async fn pool_events(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["history", &name]).await?;
    let events: Vec<Value> = raw
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with("History") && t.len() > 19
        })
        .rev()
        .take(30)
        .map(|line| {
            let line = line.trim();
            // Format: "2024-01-15.10:30:00 zpool create tank ..."
            let (ts, cmd) = if line.len() > 19 {
                let (a, b) = line.split_at(19);
                (a.trim().replace('.', " "), b.trim())
            } else {
                (line.to_string(), "")
            };
            let etype = if cmd.contains("scrub")   { "scrub" }
                else if cmd.contains("create")      { "create" }
                else if cmd.contains("destroy")     { "destroy" }
                else if cmd.contains("import")      { "import" }
                else if cmd.contains("export")      { "export" }
                else if cmd.contains("upgrade")     { "upgrade" }
                else if cmd.contains("replace")     { "replace" }
                else if cmd.contains("online")      { "online" }
                else if cmd.contains("offline")     { "offline" }
                else if cmd.contains("set")         { "set" }
                else                                { "command" };
            json!({ "timestamp": ts, "type": etype, "command": cmd })
        })
        .collect();
    Ok(Json(json!({ "name": name, "events": events })))
}

async fn expand_pool(
    Path(name): Path<String>,
    Json(body): Json<ExpandBody>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;

    // Collect all disks from disk (legacy) and disks fields
    let mut all_disks: Vec<String> = Vec::new();
    if let Some(d) = &body.disk { if !d.is_empty() { all_disks.push(d.clone()); } }
    if let Some(ds) = &body.disks { all_disks.extend(ds.iter().filter(|d| !d.is_empty()).cloned()); }
    // Deduplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    all_disks.retain(|d| seen.insert(d.clone()));

    if all_disks.is_empty() {
        return Err(ApiError::BadRequest("'disk' or 'disks' is required".into()));
    }

    let is_capacity_expansion = match &body.vdev_type {
        Some(vt) => vt.trim().is_empty() || vt.trim() == "stripe",
        None => true,
    };

    let target_vdev_opt = body.target_vdev.as_deref().filter(|s| !s.is_empty());

    if is_capacity_expansion {
        // We are doing capacity expansion. Check pool topology for RAIDZ.
        if let Ok(raw_status) = executor::zpool(&["status", "-v", &name]).await {
            let parsed_vdevs = parse_vdev_config(&raw_status);
            
            if let Some(target) = target_vdev_opt {
                if target == "STRIPE_NEW" {
                    // User explicitly requested to create a new vdev. Skip auto-detect and let it fall through to zpool add.
                } else {
                    // Perform expansion on user-specified target vdev (RAIDZ or Mirror attach)
                    for disk in &all_disks {
                        let mut args = vec!["attach".to_string()];
                        if body.force { args.push("-f".to_string()); }
                        args.push(name.clone());
                        args.push(target.to_string());
                        args.push(disk.clone());
                        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                        executor::zpool(&refs).await?;
                    }
                    return Ok(Json(json!({ "message": format!("{} disk(s) attached to vdev '{}' in pool '{}'", all_disks.len(), target, name) })));
                }
            } else {
                // Filter out cache, log, spare, etc. Just get data vdevs
                let data_vdevs: Vec<&Value> = parsed_vdevs.iter().filter(|v| {
                    if let Some(t) = v["type"].as_str() {
                        !["log", "cache", "spare"].contains(&t)
                    } else {
                        false
                    }
                }).collect();

                // Check if there is EXACTLY ONE data vdev and it's a raidz
                if data_vdevs.len() == 1 {
                    let vdev = data_vdevs[0];
                    if let Some(vtype) = vdev["type"].as_str() {
                        if vtype.starts_with("raidz") {
                            if let Some(vdev_name) = vdev["name"].as_str() {
                                if !vdev_name.is_empty() {
                                    // Perform RAIDZ expansion using zpool attach
                                    for disk in &all_disks {
                                        let mut args = vec!["attach".to_string()];
                                        if body.force { args.push("-f".to_string()); }
                                        args.push(name.clone());
                                        args.push(vdev_name.to_string());
                                        args.push(disk.clone());
                                        
                                        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                                        executor::zpool(&refs).await?;
                                    }
                                    return Ok(Json(json!({ "message": format!("{} disk(s) attached to RAIDZ vdev '{}' in pool '{}'", all_disks.len(), vdev_name, name) })));
                                }
                            }
                        }
                    }
                } else if data_vdevs.iter().any(|v| v["type"].as_str().unwrap_or("").starts_with("raidz")) {
                    // There are multiple vdevs and at least one is raidz. Refuse automatic expansion to prevent mistakes.
                    return Err(ApiError::BadRequest(
                        "Multiple data vdevs detected including RAIDZ. Automatic expansion requires exactly one RAIDZ vdev. Please specify target vdev manually (not yet supported via UI).".into()
                    ));
                }
            }


        }
    }

    let mut args = vec!["add".to_string()];
    if body.force { args.push("-f".to_string()); }
    args.push(name.clone());
    if let Some(vt) = &body.vdev_type {
        let vt = vt.trim();
        if !vt.is_empty() && vt != "stripe" {
            // Validate vdev type
            if !["mirror", "raidz", "raidz1", "raidz2", "raidz3", "spare", "log", "cache"].contains(&vt) {
                return Err(ApiError::BadRequest(format!("Invalid vdev_type: {vt}")));
            }
            args.push(vt.to_string());
        }
    }
    args.extend(all_disks.clone());

    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&refs).await?;
    Ok(Json(json!({ "message": format!("{} disk(s) added to pool '{name}'", all_disks.len()) })))
}

async fn replace_disk(
    Path(name): Path<String>,
    Json(body): Json<ReplaceBody>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    if body.old_disk.is_empty() || body.new_disk.is_empty() {
        return Err(ApiError::BadRequest("'old_disk' and 'new_disk' are required".into()));
    }
    let mut args = vec!["replace".to_string()];
    if body.force { args.push("-f".to_string()); }
    args.push(name.clone());
    args.push(body.old_disk.clone());
    args.push(body.new_disk.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&refs).await?;
    Ok(Json(json!({ "message": format!("Replacing '{}' -> '{}' on pool '{name}'", body.old_disk, body.new_disk) })))
}

// ── Pool settings ─────────────────────────────────────────────────────────────

const ZPOOL_PROPS: &[&str] = &["autoreplace", "autotrim", "autoexpand", "failmode", "comment"];
const ZFS_PROPS:   &[&str] = &[
    "compression", "atime", "relatime", "dedup", "recordsize",
    "xattr", "quota", "reservation", "snapdir", "sync",
    "zfsmanager:scrub_schedule",
];

fn validate_pool_setting(prop: &str, value: &str) -> Result<(), ApiError> {
    match prop {
        "autoreplace" | "autotrim" | "autoexpand" | "atime" | "relatime" => {
            if !["on", "off"].contains(&value) {
                return Err(ApiError::BadRequest(format!("'{prop}' must be 'on' or 'off'")));
            }
        }
        "failmode" => {
            if !["wait", "continue", "panic"].contains(&value) {
                return Err(ApiError::BadRequest("'failmode' must be 'wait', 'continue', or 'panic'".into()));
            }
        }
        "compression" => {
            let valid = ["on", "off", "lz4", "gzip", "gzip-1", "gzip-9", "zle", "lzjb", "zstd", "zstd-fast"];
            if !valid.contains(&value) {
                return Err(ApiError::BadRequest(format!("Invalid compression value: {value}")));
            }
        }
        "dedup" => {
            let valid = ["off", "on", "verify", "sha256", "sha512", "skein", "edonr,verify"];
            if !valid.contains(&value) {
                return Err(ApiError::BadRequest(format!("Invalid dedup value: {value}")));
            }
        }
        "recordsize" => {
            let valid = ["512", "1K", "2K", "4K", "8K", "16K", "32K", "64K", "128K", "256K", "512K", "1M"];
            if !valid.contains(&value) {
                return Err(ApiError::BadRequest(format!("Invalid recordsize: {value}")));
            }
        }
        "xattr" => {
            if !["on", "off", "sa"].contains(&value) {
                return Err(ApiError::BadRequest("'xattr' must be 'on', 'off', or 'sa'".into()));
            }
        }
        "quota" | "reservation" => {
            if value != "none" && !value.chars().all(|c| c.is_ascii_alphanumeric()) {
                return Err(ApiError::BadRequest(format!("Invalid {prop} value: {value}")));
            }
        }
        "snapdir" => {
            if !["hidden", "visible"].contains(&value) {
                return Err(ApiError::BadRequest("'snapdir' must be 'hidden' or 'visible'".into()));
            }
        }
        "sync" => {
            if !["standard", "always", "disabled"].contains(&value) {
                return Err(ApiError::BadRequest("'sync' must be 'standard', 'always', or 'disabled'".into()));
            }
        }
        "comment" => {} // free text, no validation needed
        "zfsmanager:scrub_schedule" => {
            if value != "off" && serde_json::from_str::<serde_json::Value>(value).is_err() {
                return Err(ApiError::BadRequest("zfsmanager:scrub_schedule must be valid JSON or 'off'".into()));
            }
        }
        _ => return Err(ApiError::BadRequest(format!("Unknown property: {prop}"))),
    }
    Ok(())
}

async fn get_pool_settings(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;

    let pool_props_raw = executor::zpool(&["get", "-H", "autoreplace,autotrim,autoexpand,failmode,comment", &name])
        .await
        .unwrap_or_default();
    let ds_props_raw = executor::zfs(&["get", "-H", "compression,atime,relatime,dedup,recordsize,xattr,quota,reservation,snapdir,sync,zfsmanager:scrub_schedule", &name])
        .await
        .unwrap_or_default();

    let pool_props: Vec<Value> = pool_props_raw.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 4 { return None; }
            Some(json!({ "name": c[1], "value": c[2], "source": c[3].trim(), "scope": "pool" }))
        })
        .collect();

    let dataset_props: Vec<Value> = ds_props_raw.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 4 { return None; }
            Some(json!({ "name": c[1], "value": c[2], "source": c[3].trim(), "scope": "dataset" }))
        })
        .collect();

    Ok(Json(json!({
        "pool":          name,
        "pool_props":    pool_props,
        "dataset_props": dataset_props,
    })))
}

async fn set_pool_setting(
    Path(name): Path<String>,
    Json(body): Json<SetPoolSettingBody>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    if body.prop.is_empty() {
        return Err(ApiError::BadRequest("'prop' is required".into()));
    }
    validate_pool_setting(&body.prop, &body.value)?;

    if ZPOOL_PROPS.contains(&body.prop.as_str()) {
        let kv = format!("{}={}", body.prop, body.value);
        executor::zpool(&["set", &kv, &name]).await?;
    } else if ZFS_PROPS.contains(&body.prop.as_str()) {
        let kv = format!("{}={}", body.prop, body.value);
        executor::zfs(&["set", &kv, &name]).await?;
    } else {
        return Err(ApiError::BadRequest(format!("Unknown property: {}", body.prop)));
    }

    Ok(Json(json!({
        "message": format!("Set {}={} on {}", body.prop, body.value, name),
        "pool":  name,
        "prop":  body.prop,
        "value": body.value,
    })))
}
