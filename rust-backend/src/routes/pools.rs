use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{error::ApiError, executor, state::AppState};

// ── Pool import config storage ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindMount {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DatasetKey {
    pub dataset: String,
    pub key_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolImportConfig {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_file: Option<String>,
    #[serde(default)]
    pub encrypted: bool,
    #[serde(default)]
    pub import_on_startup: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub bind_mounts: Vec<BindMount>,
    #[serde(default)]
    pub dataset_keys: Vec<DatasetKey>,
    // When set, the pool's ZFS mountpoint property is changed to this path before mounting.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mountpoint_override: Option<String>,
}

fn default_true() -> bool { true }

pub fn get_imports_file() -> String {
    let data_dir = std::env::var("ZFS_MANAGER_DATA")
        .unwrap_or_else(|_| "/home/docker/zfs-manager".to_string());
    format!("{}/pool_imports.json", data_dir)
}

pub fn load_import_configs() -> Vec<PoolImportConfig> {
    let path = get_imports_file();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_import_configs(configs: &[PoolImportConfig]) -> Result<(), ApiError> {
    let path = get_imports_file();
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiError::InternalError(format!("Cannot create data dir: {e}")))?;
    }
    let json = serde_json::to_string_pretty(configs)
        .map_err(|e| ApiError::InternalError(format!("Serialize error: {e}")))?;
    std::fs::write(&path, json)
        .map_err(|e| ApiError::InternalError(format!("Write error: {e}")))?;
    Ok(())
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/pools", get(list_pools).post(create_pool))
        // Static routes BEFORE dynamic ones
        .route("/api/v1/pools/importable",                              get(list_importable_pools))
        .route("/api/v1/pools/import-configs",                          get(list_import_configs).post(save_import_config))
        .route("/api/v1/pools/import-configs/:config_name",             put(update_import_config).delete(delete_import_config))
        .route("/api/v1/pools/import-configs/:config_name/run",         post(run_import_config_now))
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
        .route("/api/v1/pools/:name/remove-device", post(remove_device))
        .route("/api/v1/pools/:name/events",       get(pool_events))
        .route("/api/v1/pools/:name/settings",     get(get_pool_settings).put(set_pool_setting))
        // raidz_expansion static route handles both GET and PUT (fixes 405 when toggling feature)
        .route("/api/v1/pools/:name/feature/raidz_expansion",
            get(get_raidz_expansion_feature).put(toggle_raidz_expansion))
        .route("/api/v1/pools/:name/feature/raidz_expansion/enable", post(enable_raidz_expansion_feature))
        .route("/api/v1/pools/:name/features",                        get(list_pool_features))
        .route("/api/v1/pools/:name/feature/:feature_name",           put(toggle_pool_feature))
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
    let mut cur_type     = String::new();
    let mut cur_name     = String::new();
    let mut cur_disks: Vec<Value> = Vec::new();
    let mut in_vdev      = false;
    let mut past_pool    = false;
    // Track an active "replacing-N" or "spare-N" sub-vdev: collect old and new disk names.
    let mut in_replacing       = false;
    let mut repl_is_spare      = false; // true when sub-vdev is spare-N, false for replacing-N
    let mut repl_old           = String::new();
    let mut repl_old_state     = String::new();
    let mut repl_new           = String::new();
    // Nested case: spare-N { failed_disk, replacing-N { spare_disk, new_disk } }
    // repl_in_nested  = we are inside the inner replacing-N
    // repl_final_disk = the actual new replacement disk (depth-8 second child)
    let mut repl_in_nested     = false;
    let mut repl_final_disk    = String::new();
    // Track top-level sections ("spares", "logs", "cache") so entries get the right type.
    let mut in_spares    = false;
    let mut in_logs      = false;
    let mut in_cache_sec = false;

    // Emit any buffered replacing pair into cur_disks, then reset state.
    #[allow(clippy::too_many_arguments)]
    let flush_replacing = |in_replacing: &mut bool,
                                repl_is_spare: &mut bool,
                                repl_old: &mut String,
                                repl_old_state: &mut String,
                                repl_new: &mut String,
                                repl_in_nested: &mut bool,
                                repl_final_disk: &mut String,
                                cur_disks: &mut Vec<Value>| {
        if *in_replacing && !repl_old.is_empty() {
            let old_state = if repl_old_state.is_empty() { "DEGRADED" } else { repl_old_state.as_str() };
            if repl_new.is_empty() {
                cur_disks.push(json!({ "path": repl_old.clone(), "state": old_state }));
            } else {
                let mut entry = json!({
                    "path": repl_old.clone(),
                    "state": old_state,
                    "replacing_with": repl_new.clone(),
                    "via_spare": *repl_is_spare,
                });
                // Nested spare-N { failed, replacing-N { spare, new_disk } }:
                // repl_new = spare, repl_final_disk = the actual new replacement disk.
                if !repl_final_disk.is_empty() {
                    entry["being_replaced_by"] = json!(repl_final_disk.clone());
                }
                cur_disks.push(entry);
            }
            *in_replacing   = false;
            *repl_is_spare  = false;
            *repl_in_nested = false;
            repl_old.clear();
            repl_old_state.clear();
            repl_new.clear();
            repl_final_disk.clear();
        }
    };

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
        // ZFS prefixes hot-spare disks with "spare-" in status output; strip it.
        let disk_name = name.strip_prefix("spare-").unwrap_or(name);

        match leading {
            0 => {
                past_pool = true;
                // Detect top-level section headers (spares, logs/log, cache); flush current vdev group first.
                let n_lower = name.to_lowercase();
                let is_section = n_lower == "spares" || n_lower == "logs" || n_lower == "log" || n_lower == "cache";
                if is_section {
                    flush_replacing(&mut in_replacing, &mut repl_is_spare, &mut repl_old, &mut repl_old_state, &mut repl_new, &mut repl_in_nested, &mut repl_final_disk, &mut cur_disks);
                    if in_vdev && !cur_disks.is_empty() {
                        vdevs.push(json!({ "name": cur_name, "type": cur_type, "disks": cur_disks.clone() }));
                    }
                    cur_disks = Vec::new();
                    in_vdev   = false;
                    in_spares    = n_lower == "spares";
                    in_logs      = n_lower == "logs" || n_lower == "log";
                    in_cache_sec = n_lower == "cache";
                } else {
                    in_spares = false;
                    in_logs   = false;
                    in_cache_sec = false;
                }
            }
            2 if in_spares => {
                // Each disk in the spares section is a standalone "spare" vdev.
                vdevs.push(json!({ "name": disk_name, "type": "spare", "disks": [{"path": disk_name, "state": state}] }));
            }
            2 if in_logs => {
                // Each disk in the logs section is a standalone "log" vdev.
                vdevs.push(json!({ "name": disk_name, "type": "log", "disks": [{"path": disk_name, "state": state}] }));
            }
            2 if in_cache_sec => {
                // Each disk in the cache section is a standalone "cache" vdev.
                vdevs.push(json!({ "name": disk_name, "type": "cache", "disks": [{"path": disk_name, "state": state}] }));
            }
            2 => {
                flush_replacing(&mut in_replacing, &mut repl_is_spare, &mut repl_old, &mut repl_old_state, &mut repl_new, &mut repl_in_nested, &mut repl_final_disk, &mut cur_disks);
                if in_vdev && !cur_disks.is_empty() {
                    vdevs.push(json!({ "name": cur_name, "type": cur_type, "disks": cur_disks.clone() }));
                }
                cur_disks = Vec::new();
                // Entering a regular data vdev resets any section context.
                in_spares = false; in_logs = false; in_cache_sec = false;

                let vtype = classify_vdev(name);
                if vtype == "stripe" {
                    vdevs.push(json!({ "name": disk_name, "type": "stripe", "disks": [{"path": disk_name, "state": state}] }));
                    in_vdev  = false;
                    cur_type = String::new();
                    cur_name = String::new();
                } else {
                    cur_type = vtype.to_string();
                    cur_name = name.to_string();
                    in_vdev  = true;
                }
            }
            4 if in_vdev => {
                flush_replacing(&mut in_replacing, &mut repl_is_spare, &mut repl_old, &mut repl_old_state, &mut repl_new, &mut repl_in_nested, &mut repl_final_disk, &mut cur_disks);
                if name.starts_with("replacing") || name.starts_with("spare-") {
                    // Enter a replacing or spare-activated sub-vdev; actual disks arrive at depth 6.
                    // "spare-N" means a hot spare took over; "replacing-N" means a manual replace.
                    in_replacing  = true;
                    repl_is_spare = name.starts_with("spare-");
                } else {
                    cur_disks.push(json!({ "path": disk_name, "state": state }));
                }
            }
            6 if in_vdev && in_replacing => {
                // First child is the old (outgoing) disk, second is the new (incoming) disk.
                // Special case: spare-N { failed_disk, replacing-N { spare_disk, new_disk } }
                // In this nested layout the second child at depth-6 is a sub-vdev name like
                // "replacing-4", not an actual disk. Detect it and enter nested mode so we
                // can collect the real disks at depth-8.
                if name.starts_with("replacing") && repl_is_spare && !repl_old.is_empty() {
                    // The spare sub-vdev has a nested replacing sub-vdev:
                    //   spare-N { failed, replacing-N { spare_disk, new_disk } }
                    // repl_old is already set (the failed disk). Now we drill into the nested
                    // replacing sub-vdev whose children appear at leading=8.
                    repl_in_nested = true;
                } else if repl_old.is_empty() {
                    repl_old       = disk_name.to_string();
                    repl_old_state = state.to_string();
                } else if repl_new.is_empty() {
                    repl_new = disk_name.to_string();
                }
            }
            8 if in_vdev && in_replacing && repl_in_nested => {
                // Inside spare-N → replacing-N: first child=spare covering disk,
                // second child=actual new replacement disk.
                if repl_new.is_empty() {
                    repl_new = disk_name.to_string();         // spare disk (e.g. sdh)
                } else if repl_final_disk.is_empty() {
                    repl_final_disk = disk_name.to_string();  // new replacement disk (e.g. sda)
                }
            }
            _ => {}
        }
    }
    flush_replacing(&mut in_replacing, &mut repl_is_spare, &mut repl_old, &mut repl_old_state, &mut repl_new, &mut repl_in_nested, &mut repl_final_disk, &mut cur_disks);
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

    // If user didn't specify a mountpoint, default to /mnt/<name> so the pool
    // is mounted under the rshared bind-mount and is visible on the host.
    let user_set_mountpoint = body.options.iter().any(|o| o == "-m")
        || body.options.iter().any(|o| o.starts_with("mountpoint="));

    let mut args = vec!["create".to_string()];
    args.extend(body.options);

    let pool_mp = if user_set_mountpoint {
        None
    } else {
        let mp = format!("/mnt/{}", body.name);
        let _ = std::fs::create_dir_all(&mp);
        args.push("-m".to_string());
        args.push(mp.clone());
        Some(mp)
    };

    args.push(body.name.clone());
    args.extend(body.vdevs);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&refs).await?;

    // Explicitly mount after creation so the dataset is immediately active and
    // the rshared /mnt propagation makes it visible on the host.
    if let Some(ref mp) = pool_mp {
        let _ = std::fs::create_dir_all(mp);
    }
    let _ = executor::zfs(&["mount", &body.name]).await;

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

    // Remove any import configs for the destroyed pool so they don't linger.
    {
        let mut configs = load_import_configs();
        configs.retain(|c| c.name != name);
        let _ = save_import_configs(&configs);
    }

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
    let raw = executor::zpool_status_host(&name).await?;
    Ok(Json(json!({ "name": name, "status": raw })))
}

async fn pool_vdevs(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool(&["status", "-v", &name]).await?;
    let raw_vdevs = parse_vdev_config(&raw);

    // Pass 1: resolve SCSI IDs / full paths to short kernel device names.
    // Disk tuple: (short_name, state, replacing_with_short, via_spare, being_replaced_by_short)
    let mut vdev_data: Vec<(String, String, Vec<(String, String, Option<String>, bool, Option<String>)>)> = Vec::with_capacity(raw_vdevs.len());
    for vdev in raw_vdevs {
        let vtype     = vdev["type"].as_str().unwrap_or("stripe").to_string();
        let vname     = vdev["name"].as_str().unwrap_or("").to_string();
        let raw_disks = vdev["disks"].as_array().cloned().unwrap_or_default();
        let mut disks: Vec<(String, String, Option<String>, bool, Option<String>)> = Vec::with_capacity(raw_disks.len());
        for disk in raw_disks {
            let raw_path   = disk["path"].as_str().unwrap_or("").to_string();
            let short      = crate::worker::resolve_disk_short_name(&raw_path).await;
            let state      = disk["state"].as_str().unwrap_or("ONLINE").to_string();
            let via_spare  = disk["via_spare"].as_bool().unwrap_or(false);
            let replacing_with = if let Some(rw) = disk["replacing_with"].as_str() {
                Some(crate::worker::resolve_disk_short_name(rw).await)
            } else {
                None
            };
            let being_replaced_by = if let Some(rb) = disk["being_replaced_by"].as_str() {
                Some(crate::worker::resolve_disk_short_name(rb).await)
            } else {
                None
            };
            disks.push((short, state, replacing_with, via_spare, being_replaced_by));
        }
        vdev_data.push((vtype, vname, disks));
    }

    // Pass 2: strip partition suffixes across the full disk list when unambiguous.
    // Include replacing_with AND being_replaced_by names in the set.
    let mut all_names: Vec<String> = vdev_data.iter()
        .flat_map(|(_, _, disks)| disks.iter().flat_map(|(n, _, rw, _, rb)| {
            std::iter::once(n.clone())
                .chain(rw.iter().cloned())
                .chain(rb.iter().cloned())
        }))
        .collect();
    crate::worker::strip_partition_suffix_list(&mut all_names);

    // Rebuild vdevs — iterate names in the same order as all_names was built.
    let mut name_iter = all_names.into_iter();
    let vdevs: Vec<Value> = vdev_data.into_iter().map(|(vtype, vname, disks)| {
        let resolved: Vec<Value> = disks.into_iter().map(|(_, state, replacing_with, via_spare, being_replaced_by)| {
            let path  = name_iter.next().unwrap_or_default();
            if replacing_with.is_some() {
                let rw_path = name_iter.next().unwrap_or_default();
                let mut entry = json!({
                    "path": path, "state": state,
                    "replacing_with": rw_path,
                    "via_spare": via_spare,
                });
                if being_replaced_by.is_some() {
                    let rb_path = name_iter.next().unwrap_or_default();
                    entry["being_replaced_by"] = json!(rb_path);
                }
                entry
            } else {
                json!({ "path": path, "state": state })
            }
        }).collect();
        json!({ "type": vtype, "name": vname, "disks": resolved })
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
    let raw = executor::zpool_status_host(&name).await?;

    let lines: Vec<&str> = raw.lines().collect();
    let mut scan_line   = String::new();
    let mut scan_detail = String::new();
    let mut expand_line   = String::new();
    let mut expand_detail = String::new();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if line.trim_start().starts_with("scan:") {
            scan_line = line.trim().to_string();
            let mut j = i + 1;
            while j < lines.len() {
                let next = lines[j];
                if next.starts_with('\t') || next.starts_with("  ") {
                    if !scan_detail.is_empty() { scan_detail.push(' '); }
                    scan_detail.push_str(next.trim());
                    j += 1;
                } else { break; }
            }
        }
        if line.trim_start().starts_with("expand:") {
            expand_line = line.trim().to_string();
            let mut j = i + 1;
            while j < lines.len() {
                let next = lines[j];
                if next.starts_with('\t') || next.starts_with("  ") {
                    if !expand_detail.is_empty() { expand_detail.push(' '); }
                    expand_detail.push_str(next.trim());
                    j += 1;
                } else { break; }
            }
        }
        i += 1;
    }

    let in_progress = scan_line.contains("in progress");
    let is_resilver = scan_line.contains("resilver in progress");
    let done        = scan_line.contains("repaired") || scan_line.contains("canceled");

    let progress = if in_progress { parse_scan_progress(&scan_detail) }
                   else if done   { 100.0 }
                   else           { 0.0 };

    let time_remaining = if in_progress { extract_time_remaining(&scan_detail) }
                         else           { String::new() };

    // Extract issued speed for resilver: "456M issued at 89.5M/s" → "89.5M/s"
    let scan_speed: String = if in_progress && is_resilver {
        scan_detail.split("issued at ").nth(1)
            .and_then(|s| s.split(',').next())
            .unwrap_or("").trim().to_string()
    } else if in_progress {
        // For scrub, look for "at X/s"
        scan_detail.split(" at ").nth(1)
            .and_then(|s| s.split(',').next())
            .unwrap_or("").trim().to_string()
    } else {
        String::new()
    };

    // ── Expansion status ────────────────────────────────────────────────────────
    // Format: "expand: expansion of raidz2-0 in progress since ..."
    // Detail: "35.7G / 41.5T copied at 563M/s, 0.08% done, 21:27:01 to go"
    let expand_in_progress = expand_line.contains("in progress");
    let expand_vdev = if expand_in_progress {
        // extract "raidz2-0" from "expansion of raidz2-0 in progress"
        expand_line
            .trim_start_matches("expand:")
            .trim()
            .strip_prefix("expansion of ")
            .and_then(|s| s.split(" in progress").next())
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    };

    // Parse "35.7G / 41.5T copied at 563M/s, 0.08% done, 21:27:01 to go"
    let expand_progress: f64 = if expand_in_progress {
        // find "X% done"
        expand_detail.split(',')
            .find(|s| s.trim().ends_with("% done"))
            .and_then(|s| s.trim().strip_suffix("% done"))
            .and_then(|s| s.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    } else { 0.0 };

    let expand_eta: String = if expand_in_progress {
        expand_detail.split(',')
            .find(|s| s.trim().ends_with("to go"))
            .map(|s| s.trim().trim_end_matches("to go").trim().to_string())
            .unwrap_or_default()
    } else { String::new() };

    let expand_speed: String = if expand_in_progress {
        expand_detail.split("at ").nth(1)
            .and_then(|s| s.split(',').next())
            .unwrap_or("").trim().to_string()
    } else { String::new() };

    let expand_copied: String = if expand_in_progress {
        expand_detail.split(" copied").next().unwrap_or("").trim().to_string()
    } else { String::new() };

    Ok(Json(json!({
        "name":           name,
        "in_progress":    in_progress,
        "is_resilver":    is_resilver,
        "done":           done,
        "progress":       progress,
        "scan":           scan_line,
        "scan_detail":    scan_detail,
        "scan_speed":     scan_speed,
        "time_remaining": time_remaining,
        "expansion": {
            "in_progress": expand_in_progress,
            "vdev":        expand_vdev,
            "progress":    expand_progress,
            "eta":         expand_eta,
            "speed":       expand_speed,
            "copied":      expand_copied,
            "detail":      expand_detail,
        }
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
    // Use host ZFS tools via nsenter — `zpool resilver` was added in OpenZFS 2.1.0
    // and may not be available in the container's older Alpine ZFS userland.
    match executor::zpool_host(&["resilver", &name]).await {
        Ok(_) => Ok(Json(json!({ "message": format!("Resilver started on pool '{name}'") }))),
        Err(ApiError::CommandFailed { ref stderr, .. }) if stderr.contains("already in progress") => {
            // Restart: stop current resilver then kick a new one
            let _ = executor::zpool_host(&["resilver", &name]).await;
            Ok(Json(json!({ "message": format!("Resilver restarted on pool '{name}'") })))
        }
        Err(ApiError::CommandFailed { ref stderr, .. })
            if stderr.contains("unrecognized command") || stderr.contains("does not support") =>
        {
            Err(ApiError::BadRequest(
                "zpool resilver is not supported by this ZFS version (requires OpenZFS ≥ 2.1.0).".into()
            ))
        }
        Err(e) => Err(e),
    }
}

async fn list_pool_features(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    let raw = executor::zpool_host(&["get", "-H", "all", &name]).await?;
    let features: Vec<Value> = raw.lines()
        .filter_map(|line| {
            let cols: Vec<&str> = line.splitn(4, '\t').collect();
            if cols.len() < 3 { return None; }
            let prop = cols[1].trim();
            if !prop.starts_with("feature@") { return None; }
            let feature_name = prop.strip_prefix("feature@").unwrap_or(prop);
            let value = cols[2].trim();
            let enabled = matches!(value, "active" | "enabled");
            Some(json!({
                "name":     feature_name,
                "property": prop,
                "value":    value,
                "enabled":  enabled,
            }))
        })
        .collect();
    Ok(Json(json!({ "pool": name, "features": features })))
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

    let vdev_type_str = body.vdev_type.as_deref().unwrap_or("").trim().to_string();
    // Spare/cache/log adds always use -f: ZFS rejects disks with existing labels otherwise.
    let needs_force = body.force || matches!(vdev_type_str.as_str(), "spare" | "cache" | "log");
    let mut args = vec!["add".to_string()];
    if needs_force { args.push("-f".to_string()); }
    args.push(name.clone());
    if !vdev_type_str.is_empty() && vdev_type_str != "stripe" {
        // Validate vdev type
        if !["mirror", "raidz", "raidz1", "raidz2", "raidz3", "spare", "log", "cache"].contains(&vdev_type_str.as_str()) {
            return Err(ApiError::BadRequest(format!("Invalid vdev_type: {vdev_type_str}")));
        }
        args.push(vdev_type_str.clone());
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
    match executor::zpool(&refs).await {
        Ok(_) => Ok(Json(json!({ "message": format!("Replacing '{}' -> '{}' on pool '{name}'", body.old_disk, body.new_disk) }))),
        // L2ARC cache devices cannot be replaced directly — remove old, add new.
        Err(ApiError::CommandFailed { ref stderr, .. }) if stderr.contains("device is in use as a cache") => {
            executor::zpool(&["remove", &name, &body.old_disk]).await?;
            executor::zpool(&["add", "-f", &name, "cache", &body.new_disk]).await?;
            Ok(Json(json!({ "message": format!("Cache disk '{}' swapped for '{}' on pool '{name}'", body.old_disk, body.new_disk) })))
        }
        // Hot spare devices cannot be replaced directly — remove old, add new.
        Err(ApiError::CommandFailed { ref stderr, .. }) if stderr.contains("device is reserved as a hot spare") => {
            executor::zpool(&["remove", &name, &body.old_disk]).await?;
            executor::zpool(&["add", "-f", &name, "spare", &body.new_disk]).await?;
            Ok(Json(json!({ "message": format!("Spare disk '{}' swapped for '{}' on pool '{name}'", body.old_disk, body.new_disk) })))
        }
        Err(e) => Err(e),
    }
}

#[derive(Deserialize)]
pub struct RemoveDeviceBody {
    pub device: String,
}

async fn remove_device(
    Path(name): Path<String>,
    Json(body): Json<RemoveDeviceBody>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    if body.device.is_empty() {
        return Err(ApiError::BadRequest("'device' is required".into()));
    }
    executor::zpool(&["remove", &name, &body.device]).await?;
    Ok(Json(json!({ "message": format!("Device '{}' removed from pool '{name}'", body.device) })))
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

// ── Pool import configs ───────────────────────────────────────────────────────

async fn list_import_configs() -> Result<Json<Value>, ApiError> {
    let configs = load_import_configs();
    Ok(Json(json!({ "configs": configs })))
}

async fn save_import_config(
    Json(body): Json<PoolImportConfig>,
) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::validate_zfs_name(&body.name, "pool")?;
    let mut configs = load_import_configs();
    // Upsert by name
    if let Some(pos) = configs.iter().position(|c| c.name == body.name) {
        configs[pos] = body.clone();
    } else {
        configs.push(body.clone());
    }
    save_import_configs(&configs)?;
    Ok(Json(json!({ "message": format!("Import config '{}' saved", body.name), "config": body })))
}

async fn update_import_config(
    Path(config_name): Path<String>,
    Json(body): Json<PoolImportConfig>,
) -> Result<Json<Value>, ApiError> {
    let mut configs = load_import_configs();
    match configs.iter().position(|c| c.name == config_name) {
        Some(pos) => {
            configs[pos] = body.clone();
            save_import_configs(&configs)?;
            Ok(Json(json!({ "message": format!("Import config '{}' updated", config_name), "config": body })))
        }
        None => Err(ApiError::NotFound(format!("Import config '{}' not found", config_name))),
    }
}

async fn delete_import_config(
    Path(config_name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let mut configs = load_import_configs();
    let len_before = configs.len();
    configs.retain(|c| c.name != config_name);
    if configs.len() == len_before {
        return Err(ApiError::NotFound(format!("Import config '{}' not found", config_name)));
    }
    save_import_configs(&configs)?;
    Ok(Json(json!({ "message": format!("Import config '{}' deleted", config_name) })))
}

async fn run_import_config_now(
    Path(config_name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let configs = load_import_configs();
    let config = configs.iter().find(|c| c.name == config_name)
        .ok_or_else(|| ApiError::NotFound(format!("Import config '{}' not found", config_name)))?
        .clone();

    execute_pool_import(&config).await?;
    Ok(Json(json!({ "message": format!("Import executed for pool '{}'", config_name) })))
}

pub async fn execute_pool_import(config: &PoolImportConfig) -> Result<(), ApiError> {
    use tracing::{info, warn};

    // Check if pool is already imported
    let already_imported = executor::zpool(&["list", &config.name]).await
        .map(|out| !out.trim().is_empty())
        .unwrap_or(false);

    if !already_imported {
        executor::zpool(&["import", &config.name]).await?;
        info!("Imported pool '{}'", config.name);
    } else {
        info!("Pool '{}' already imported, skipping", config.name);
    }

    // Load pool-level encryption key if needed
    if config.encrypted {
        if let Some(ref kf) = config.key_file {
            let key_loc = format!("file://{}", kf);
            executor::zfs(&["load-key", "-L", &key_loc, &config.name]).await
                .unwrap_or_else(|e| { warn!("load-key failed for '{}': {:?}", config.name, e); String::new() });
        }
    }

    // Load per-dataset encryption keys (e.g. pool/nas, pool/s3)
    for dk in &config.dataset_keys {
        if dk.dataset.is_empty() || dk.key_file.is_empty() { continue; }
        let key_loc = format!("file://{}", dk.key_file);
        executor::zfs(&["load-key", "-L", &key_loc, &dk.dataset]).await
            .unwrap_or_else(|e| { warn!("load-key failed for dataset '{}': {:?}", dk.dataset, e); String::new() });
        info!("Loaded key for dataset '{}'", dk.dataset);
    }

    // If a custom mountpoint is configured, set it on the pool dataset directly.
    // This makes files written to the path go into the ZFS pool, not just a host directory.
    if let Some(ref mp) = config.mountpoint_override {
        let mp = mp.trim();
        if !mp.is_empty() {
            let _ = std::fs::create_dir_all(mp);
            executor::zfs(&["set", &format!("mountpoint={}", mp), &config.name]).await
                .unwrap_or_else(|e| { warn!("set mountpoint for '{}' failed: {:?}", config.name, e); String::new() });
            info!("Set mountpoint of '{}' to '{}'", config.name, mp);
        }
    }

    // Create mountpoint directories so zfs mount -a doesn't fail on missing dirs
    if let Ok(output) = executor::zfs(&["list", "-H", "-o", "name,mountpoint"]).await {
        for line in output.lines() {
            let mut parts = line.splitn(2, '\t');
            let _name = parts.next().unwrap_or("");
            let mp = parts.next().unwrap_or("").trim();
            if mp.starts_with('/') && mp != "/" {
                let _ = std::fs::create_dir_all(mp);
            }
        }
    }

    // Mount all datasets
    executor::zfs(&["mount", "-a"]).await
        .unwrap_or_else(|e| { warn!("zfs mount -a failed: {:?}", e); String::new() });

    // Apply bind mounts — mirrors the user's bash script pattern:
    //   mkdir -p $TARGET && mount --rbind /Pool/dataset $TARGET
    for bm in &config.bind_mounts {
        if bm.source.is_empty() || bm.target.is_empty() { continue; }

        // Create target directory (e.g. /mnt/nas)
        let _ = std::fs::create_dir_all(&bm.target);

        // Source must exist and be a mounted ZFS path (e.g. /Toshiba/nas).
        // Skip if not present to avoid silent errors.
        if !std::path::Path::new(&bm.source).exists() {
            warn!("Bind mount source '{}' does not exist — skipping", bm.source);
            continue;
        }

        // Skip if target is already bind-mounted (idempotent re-runs)
        let already = tokio::process::Command::new("mount")
            .output().await
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(bm.target.as_str()))
            .unwrap_or(false);
        if already {
            info!("Bind mount target '{}' already active — skipping", bm.target);
            continue;
        }

        let out = tokio::process::Command::new("mount")
            .args(["--rbind", &bm.source, &bm.target])
            .output().await;
        match out {
            Ok(o) if o.status.success() => info!("Bind mounted {} → {}", bm.source, bm.target),
            Ok(o) => warn!("Bind mount {} → {} failed: {}", bm.source, bm.target,
                           String::from_utf8_lossy(&o.stderr).trim()),
            Err(e) => warn!("Bind mount error: {:?}", e),
        }
    }

    Ok(())
}

// ── RAIDZ Expansion feature ───────────────────────────────────────────────────

// Delegates to toggle_pool_feature with hardcoded feature name — needed so the
// static route "/feature/raidz_expansion" can serve PUT without returning 405.
async fn toggle_raidz_expansion(
    Path(name): Path<String>,
    Json(body): Json<ToggleFeatureBody>,
) -> Result<Json<Value>, ApiError> {
    toggle_pool_feature(Path((name, "raidz_expansion".to_string())), Json(body)).await
}

async fn get_raidz_expansion_feature(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    // Use host ZFS tools via nsenter — the container's Alpine zpool may be older
    // and return wrong results or not support newer features like raidz_expansion.
    let raw = executor::zpool_host(&["get", "-H", "feature@raidz_expansion", &name]).await?;
    let value = raw.lines()
        .next()
        .and_then(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            c.get(2).map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| "disabled".to_string());
    let enabled = matches!(value.as_str(), "active" | "enabled");
    Ok(Json(json!({
        "pool":    name,
        "feature": "raidz_expansion",
        "value":   value,
        "enabled": enabled,
    })))
}

async fn enable_raidz_expansion_feature(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;
    // Use host ZFS tools via nsenter so newer features unsupported by the container's
    // Alpine zpool binary (e.g. feature@raidz_expansion) can be set correctly.
    executor::zpool_host(&["set", "feature@raidz_expansion=enabled", &name]).await?;
    Ok(Json(json!({
        "message": format!("raidz_expansion feature enabled on pool '{name}'"),
        "pool":    name,
        "feature": "raidz_expansion",
        "enabled": true,
    })))
}

#[derive(Deserialize)]
struct ToggleFeatureBody {
    enabled: bool,
}

async fn toggle_pool_feature(
    Path((name, feature_name)): Path<(String, String)>,
    Json(body): Json<ToggleFeatureBody>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "pool")?;

    // Feature names are alphanumeric + underscores only
    if feature_name.is_empty() || !feature_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(ApiError::BadRequest("Invalid feature name".into()));
    }

    let prop  = format!("feature@{feature_name}");
    let value = if body.enabled { "enabled" } else { "disabled" };

    // Check current state first — refuse to disable active features
    if !body.enabled {
        let raw = executor::zpool_host(&["get", "-H", &prop, &name]).await.unwrap_or_default();
        let current = raw.lines().next()
            .and_then(|l| l.split('\t').nth(2))
            .map(|v| v.trim().to_string())
            .unwrap_or_default();
        if current == "active" {
            return Err(ApiError::BadRequest(
                format!("Feature '{feature_name}' is active (data is using it) and cannot be disabled.")
            ));
        }
    }

    executor::zpool_host(&["set", &format!("{prop}={value}"), &name]).await?;

    Ok(Json(json!({
        "message": format!("Feature '{feature_name}' set to '{value}' on pool '{name}'"),
        "pool":    name,
        "feature": feature_name,
        "enabled": body.enabled,
    })))
}
