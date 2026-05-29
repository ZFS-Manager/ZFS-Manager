use axum::{extract::{Path, State}, routing::get, Json, Router};
use redis::AsyncCommands;
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::warn;

use crate::error::ApiError;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/stats/system", get(get_system_stats))
        .route("/api/v1/system/disks", get(list_disks))
        .route("/api/v1/system/smart/:device", get(get_smart_data))
        .route("/api/v1/time", get(get_server_time))
        .route("/api/v1/disks", get(list_enriched_disks))
        .with_state(state)
}

async fn get_server_time() -> Json<Value> {
    Json(json!({
        "now": chrono::Utc::now().to_rfc3339(),
        "timezone": "UTC",
    }))
}

fn parse_arc_stats(raw: &str) -> (f64, i64, i64, i64, i64) {
    let mut hits:      u64 = 0;
    let mut misses:    u64 = 0;
    let mut arc_size:  i64 = 0;
    let mut meta_used: i64 = 0;
    let mut target:    i64 = 0;

    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            match parts[0] {
                "hits"          => hits      = parts[2].parse().unwrap_or(0),
                "misses"        => misses    = parts[2].parse().unwrap_or(0),
                "size"          => arc_size  = parts[2].parse().unwrap_or(0),
                "arc_meta_used" => meta_used = parts[2].parse().unwrap_or(0),
                "c"             => target    = parts[2].parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    let total = hits + misses;
    let hit_ratio = if total > 0 { (hits as f64 / total as f64) * 100.0 } else { 0.0 };
    let data_size = (arc_size - meta_used).max(0);
    
    (hit_ratio, arc_size, meta_used, data_size, target)
}

fn parse_loadavg(raw: &str) -> [f64; 3] {
    let parts: Vec<&str> = raw.split_whitespace().collect();
    [
        parts.first().and_then(|s| s.parse().ok()).unwrap_or(0.0),
        parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0.0),
        parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0),
    ]
}

fn parse_meminfo(raw: &str) -> (i64, i64, i64) {
    let mut total:     i64 = 0;
    let mut free:      i64 = 0;
    let mut available: i64 = 0;

    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let value: i64 = parts[1].parse::<i64>().unwrap_or(0) * 1024;
            match parts[0] {
                "MemTotal:"     => total     = value,
                "MemFree:"      => free      = value,
                "MemAvailable:" => available = value,
                _ => {}
            }
        }
    }
    (total, free, available)
}

fn read_cpu_jiffies() -> (u64, u64) {
    let content = std::fs::read_to_string("/proc/stat").unwrap_or_default();
    for line in content.lines() {
        if line.starts_with("cpu ") {
            let vals: Vec<u64> = line
                .split_whitespace()
                .skip(1)
                .map(|s| s.parse().unwrap_or(0))
                .collect();
            let user = vals.get(0).copied().unwrap_or(0);
            let nice = vals.get(1).copied().unwrap_or(0);
            let system = vals.get(2).copied().unwrap_or(0);
            let idle = vals.get(3).copied().unwrap_or(0);
            let iowait = vals.get(4).copied().unwrap_or(0);
            let irq = vals.get(5).copied().unwrap_or(0);
            let softirq = vals.get(6).copied().unwrap_or(0);
            let steal = vals.get(7).copied().unwrap_or(0);
            
            // Do not sum all values because guest (8) and guest_nice (9) are already included in user and nice.
            let total = user + nice + system + idle + iowait + irq + softirq + steal;
            let idle_time = idle + iowait;
            return (total, idle_time);
        }
    }
    (0, 0)
}

async fn get_system_stats(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    // Check Redis cache first (TTL 3s)
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let cached: redis::RedisResult<Option<String>> = conn.get("zfs:system-stats").await;
        if let Ok(Some(hit)) = cached {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Ok(Json(val));
            }
        }
    }

    let (t1, i1) = read_cpu_jiffies();
    tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
    let (t2, i2) = read_cpu_jiffies();

    let cpu_percent = if t2 > t1 {
        let dt = (t2 - t1) as f64;
        let di = (i2.saturating_sub(i1)) as f64;
        ((dt - di) / dt * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let arc_raw     = std::fs::read_to_string("/proc/spl/kstat/zfs/arcstats").unwrap_or_default();
    let loadavg_raw = std::fs::read_to_string("/proc/loadavg").unwrap_or_default();
    let meminfo_raw = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let uptime_raw  = std::fs::read_to_string("/proc/uptime").unwrap_or_default();

    let (arc_hit_ratio, arc_size, arc_meta, arc_data, arc_target) = parse_arc_stats(&arc_raw);
    let cpu_load = parse_loadavg(&loadavg_raw);
    let (mem_total, mem_free, mem_available) = parse_meminfo(&meminfo_raw);

    let uptime_secs: f64 = uptime_raw
        .split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let uptime_formatted = {
        let s = uptime_secs as u64;
        let days  = s / 86400;
        let hours = (s % 86400) / 3600;
        let mins  = (s % 3600) / 60;
        if days > 0       { format!("{days}d {hours}h {mins}m") }
        else if hours > 0 { format!("{hours}h {mins}m") }
        else              { format!("{mins}m") }
    };

    // ZFS version (prefer kernel module version over container userland version)
    let mut zfs_version = std::fs::read_to_string("/sys/module/zfs/version")
        .map(|s| {
            let v = s.trim();
            if v.starts_with("zfs-") { v.to_string() } else { format!("zfs-{}", v) }
        })
        .unwrap_or_default();

    if zfs_version.is_empty() {
        zfs_version = tokio::process::Command::new("zfs")
            .arg("--version")
            .output()
            .await
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout);
                out.lines()
                    .find(|l| l.contains("zfs-kmod-"))
                    .or_else(|| out.lines().next())
                    .map(|l| l.trim().strip_prefix("zfs-kmod-").map(|s| format!("zfs-{}", s)).unwrap_or_else(|| l.trim().to_string()))
                    .unwrap_or_else(|| "unknown".to_string())
            })
            .unwrap_or_else(|_| "unavailable".to_string());
    }

    let result = json!({
        "uptime":         uptime_formatted,
        "uptime_secs":    uptime_secs,
        "timestamp":      chrono::Utc::now().to_rfc3339(),
        "cpu_load":       cpu_load,
        "cpu_percent":    cpu_percent,
        "arc_size":       arc_size,
        "arc_metadata":   arc_meta,
        "arc_data":       arc_data,
        "arc_target":     arc_target,
        "arc_hit_ratio":  arc_hit_ratio,
        "zfs_version":    zfs_version,
        "memory": {
            "total":     mem_total,
            "free":      mem_free,
            "available": mem_available,
            // Subtract ARC size because it is kernel memory but effectively cache
            "used":      (mem_total - mem_available).saturating_sub(arc_size as i64)
        }
    });

    // Cache in Redis with 3s TTL
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        if let Ok(json_str) = serde_json::to_string(&result) {
            let _: redis::RedisResult<()> = conn.set_ex("zfs:system-stats", json_str, 3u64).await;
        }
    }

    Ok(Json(result))
}

struct DiskZfsInfo {
    state: String,
    /// Role in the pool: "data", "cache", "spare", or "log"
    role: String,
    /// Name of the pool this disk belongs to
    pool: String,
}

/// Query `zpool status -P` to find a disk's state, role, and pool name.
async fn find_zfs_disk_info(short_name: &str) -> Option<DiskZfsInfo> {
    let out = tokio::process::Command::new("zpool")
        .args(["status", "-P"])
        .output()
        .await
        .ok()?;
    if !out.status.success() { return None; }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut in_config    = false;
    let mut section      = "data";
    let mut current_pool = String::new();

    for line in text.lines() {
        let t = line.trim();

        // Pool name line (outside config block)
        if let Some(p) = t.strip_prefix("pool:") {
            current_pool = p.trim().to_string();
            in_config    = false;
            section      = "data";
            continue;
        }
        if t == "config:" { in_config = true; continue; }
        if t.starts_with("errors:") { in_config = false; continue; }
        if !in_config || t.is_empty() { continue; }

        if !line.starts_with('\t') { continue; }
        let after_tab = &line[1..];
        let leading = after_tab.len() - after_tab.trim_start().len();

        // leading=0 inside config: pool name row or section header (spares/cache/logs)
        if leading == 0 {
            let n = t.to_lowercase();
            section = if n == "spares" { "spare" }
                      else if n == "cache" { "cache" }
                      else if n == "logs" || n == "log" { "log" }
                      else { "data" };  // pool-name row resets to data
            continue;
        }
        if leading < 2 { continue; }

        let tokens: Vec<&str> = t.split_whitespace().collect();
        let raw_name  = tokens.first().copied().unwrap_or("");
        let state     = tokens.get(1).copied().unwrap_or("ONLINE");
        let disk_name = raw_name.strip_prefix("spare-").unwrap_or(raw_name);

        let disk_short = if disk_name.starts_with('/') {
            std::fs::canonicalize(disk_name)
                .ok()
                .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                .unwrap_or_else(|| disk_name.trim_start_matches("/dev/").to_string())
        } else {
            disk_name.to_string()
        };

        if disk_short == short_name
            || disk_short.trim_end_matches(|c: char| c.is_ascii_digit()) == short_name
        {
            return Some(DiskZfsInfo {
                state: state.to_string(),
                role:  section.to_string(),
                pool:  current_pool.clone(),
            });
        }
    }
    None
}

/// Thin wrapper kept for callers that only need the state string.
async fn find_zfs_disk_state(short_name: &str) -> Option<String> {
    find_zfs_disk_info(short_name).await.map(|i| i.state)
}

async fn get_smart_data(
    State(state): State<AppState>,
    Path(device): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let dev_path = if device.starts_with('/') { device.clone() } else { format!("/dev/{}", device) };
    let cache_key = format!("zfs:smart:{}", device.replace('/', "_"));

    // Check Redis cache (TTL 60s)
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let cached: redis::RedisResult<Option<String>> = conn.get(&cache_key).await;
        if let Ok(Some(hit)) = cached {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Ok(Json(val));
            }
        }
    }

    // Virtual/loop devices don't support SMART — return immediately without
    // spawning smartctl (which would hang or fail slowly for these device types).
    let short_name = device.trim_start_matches('/').trim_start_matches("dev/");
    let is_virtual = short_name.starts_with("loop")
        || short_name.starts_with("ram")
        || short_name.starts_with("zram")
        || short_name.starts_with("nbd");
    if is_virtual {
        let zfs_info  = find_zfs_disk_info(short_name).await;
        let zfs_state = zfs_info.as_ref().map(|i| i.state.as_str()).unwrap_or("NOT_IN_POOL");
        let zfs_role  = zfs_info.as_ref().map(|i| i.role.as_str());
        let zfs_pool  = zfs_info.as_ref().map(|i| i.pool.as_str()).filter(|s| !s.is_empty());
        let result = json!({
            "smart_status": { "passed": null },
            "device": { "name": dev_path, "type": "virtual" },
            "message": "SMART not supported for virtual/loop devices",
            "zfs_disk_state": zfs_state,
            "zfs_disk_role":  zfs_role,
            "zfs_disk_pool":  zfs_pool,
        });
        // Cache for 5 minutes — virtual devices won't suddenly gain SMART support
        if let Some(ref redis_conn) = state.redis {
            let mut conn = redis_conn.clone();
            if let Ok(s) = serde_json::to_string(&result) {
                let _: redis::RedisResult<()> = conn.set_ex(&cache_key, s, 300u64).await;
            }
        }
        return Ok(Json(result));
    }

    // Run smartctl with a 10-second timeout to prevent blocking slow drives
    let smartctl_future = tokio::process::Command::new("smartctl")
        .args(["-i", "-H", "-A", "--json=c", &dev_path])
        .output();

    let mut result = match tokio::time::timeout(
        tokio::time::Duration::from_secs(10),
        smartctl_future,
    ).await {
        Ok(Ok(out)) => {
            let json_str = String::from_utf8_lossy(&out.stdout);
            serde_json::from_str::<Value>(&json_str)
                .unwrap_or_else(|_| json!({ "smart_status": { "passed": null }, "message": "No SMART data available" }))
        }
        Ok(Err(e)) => {
            json!({ "smart_status": { "passed": null }, "message": format!("smartctl error: {}", e) })
        }
        Err(_) => {
            warn!("smartctl timed out for device {}", device);
            json!({ "smart_status": { "passed": null }, "message": "SMART query timed out after 10s" })
        }
    };

    // Enrich result with ZFS pool state, role (data/cache/spare/log), and pool name.
    let zfs_info  = find_zfs_disk_info(short_name).await;
    let zfs_state = zfs_info.as_ref().map(|i| i.state.as_str()).unwrap_or("NOT_IN_POOL");
    let zfs_role  = zfs_info.as_ref().map(|i| i.role.as_str());
    let zfs_pool  = zfs_info.as_ref().map(|i| i.pool.as_str()).filter(|s| !s.is_empty());
    if let Value::Object(ref mut map) = result {
        map.insert("zfs_disk_state".to_string(), json!(zfs_state));
        map.insert("zfs_disk_role".to_string(),  json!(zfs_role));
        map.insert("zfs_disk_pool".to_string(),  json!(zfs_pool));
    }

    // Cache in Redis with 60s TTL
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        if let Ok(json_str) = serde_json::to_string(&result) {
            let set_result: redis::RedisResult<()> = conn.set_ex(&cache_key, json_str, 60u64).await;
            if let Err(e) = set_result {
                warn!("Redis SET failed for {cache_key}: {e}");
            }
        }
    }

    Ok(Json(result))
}

async fn list_disks() -> Result<Json<Value>, ApiError> {
    let output = tokio::process::Command::new("lsblk")
        .args(["-J", "-d", "-o", "NAME,SIZE,TYPE,MODEL,ROTA,TRAN", "--bytes"])
        .output()
        .await?;

    if output.status.success() {
        let json_str = String::from_utf8_lossy(&output.stdout);
        let parsed: Value = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| json!({ "blockdevices": [] }));
        let filtered = if let Some(devs) = parsed["blockdevices"].as_array() {
            devs.iter()
                .filter(|d| d["type"].as_str() == Some("disk"))
                .cloned()
                .collect::<Vec<_>>()
        } else {
            vec![]
        };
        Ok(Json(json!({ "blockdevices": filtered })))
    } else {
        Ok(Json(json!({ "blockdevices": [] })))
    }
}

// ── Enriched disk list ────────────────────────────────────────────────────────

fn format_size_human(bytes: u64) -> String {
    if bytes == 0 { return "0 B".to_string(); }
    const UNITS: &[(u64, &str)] = &[
        (1_099_511_627_776, "TB"),
        (1_073_741_824, "GB"),
        (1_048_576, "MB"),
        (1_024, "KB"),
    ];
    for &(threshold, unit) in UNITS {
        if bytes >= threshold {
            let val = bytes as f64 / threshold as f64;
            return if val >= 100.0 { format!("{:.0} {}", val, unit) }
                   else if val >= 10.0 { format!("{:.1} {}", val, unit) }
                   else { format!("{:.2} {}", val, unit) };
        }
    }
    format!("{} B", bytes)
}

fn lsblk_has_system_mount(node: &serde_json::Value) -> bool {
    if let Some(mounts) = node["mountpoints"].as_array() {
        for m in mounts {
            if let Some(mp) = m.as_str() {
                if mp == "/" || mp.starts_with("/boot") {
                    return true;
                }
            }
        }
    }
    if let Some(children) = node["children"].as_array() {
        for child in children {
            if lsblk_has_system_mount(child) {
                return true;
            }
        }
    }
    false
}

async fn detect_system_disks() -> std::collections::HashSet<String> {
    let mut system_disks = std::collections::HashSet::new();
    // Run lsblk in the host mount namespace so container bind-mounts don't hide
    // real mountpoints like / and /boot.
    let output = tokio::process::Command::new("nsenter")
        .args(["-t", "1", "-m", "--", "lsblk", "-J", "-o", "NAME,MOUNTPOINTS,TYPE,PKNAME"])
        .output()
        .await;
    let out = match output {
        Ok(o) if o.status.success() => o,
        _ => return system_disks,
    };
    let json: serde_json::Value = match serde_json::from_slice(&out.stdout) {
        Ok(v) => v,
        Err(_) => return system_disks,
    };
    if let Some(blockdevices) = json["blockdevices"].as_array() {
        for dev in blockdevices {
            // Only top-level disks (type=disk, pkname=null/absent)
            if dev["type"].as_str() != Some("disk") { continue; }
            if dev["pkname"].is_string() { continue; } // has a parent — skip
            if lsblk_has_system_mount(dev) {
                let name = dev["name"].as_str().unwrap_or("").to_string();
                if !name.is_empty() {
                    system_disks.insert(name);
                }
            }
        }
    }
    system_disks
}

async fn list_enriched_disks(State(_state): State<AppState>) -> Result<Json<Value>, ApiError> {
    // Detect which disks back the OS — walks lsblk tree recursively
    let system_disk_names = detect_system_disks().await;

    // Build ZFS pool membership map — ZFS is the single source of truth for in_use.
    // Using `zpool status -P` gives full /dev/... paths which we normalize to short
    // kernel names (sda, loop10, nvme0n1) so they match lsblk output.
    let mut disk_pool_map: HashMap<String, String> = HashMap::new();
    if let Ok(out) = tokio::process::Command::new("zpool").args(["status", "-P"]).output().await {
        let text = String::from_utf8_lossy(&out.stdout);
        let mut current_pool = String::new();
        let mut in_config = false;
        for line in text.lines() {
            let trimmed = line.trim();
            if let Some(pool) = trimmed.strip_prefix("pool:") {
                current_pool = pool.trim().to_string();
                in_config = false;
            } else if trimmed == "config:" {
                in_config = true;
            } else if in_config && (line.starts_with('\t') || line.starts_with("  ")) {
                let tok = trimmed.split_whitespace().next().unwrap_or("");
                if tok.is_empty() || tok == "NAME" || tok == current_pool
                    || ["logs", "cache", "spares", "special", "dedup", "errors:"].contains(&tok)
                {
                    continue;
                }
                // Resolve full path → short kernel name.
                // canonicalize follows symlinks (handles /dev/disk/by-id/...).
                // Falls back to stripping /dev/ for simple paths.
                let short = if tok.starts_with('/') {
                    std::fs::canonicalize(tok)
                        .ok()
                        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                        .unwrap_or_else(|| tok.strip_prefix("/dev/").unwrap_or(tok).to_string())
                } else {
                    tok.to_string()
                };
                disk_pool_map.insert(short.clone(), current_pool.clone());
                // Also map the base name without numeric suffix (e.g. "sda" from "sda1")
                let base = short.trim_end_matches(|c: char| c.is_ascii_digit());
                if base.len() < short.len() {
                    disk_pool_map.insert(base.to_string(), current_pool.clone());
                }
            }
        }
    }

    // Enumerate block devices with -d (no children/partitions in output — we don't need them).
    // Include physical disks AND loop devices (used for testing / virtual environments).
    let lsblk_out = tokio::process::Command::new("lsblk")
        .args(["-Jbdo", "NAME,SIZE,TYPE,MODEL"])
        .output()
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;

    let lsblk_json: Value = serde_json::from_slice(&lsblk_out.stdout)
        .unwrap_or_else(|_| json!({"blockdevices": []}));

    let mut disks: Vec<Value> = Vec::new();
    if let Some(blockdevices) = lsblk_json["blockdevices"].as_array() {
        for dev in blockdevices {
            let dev_type = dev["type"].as_str().unwrap_or("");
            let name = dev["name"].as_str().unwrap_or("");
            // Accept physical disks and loop devices; skip optical/tape/other
            if !matches!(dev_type, "disk" | "loop") || name.starts_with("sr") || name == "rom" {
                continue;
            }

            let size_bytes = dev["size"].as_u64().unwrap_or(0);
            if size_bytes == 0 { continue; }

            // Model from lsblk, then sysfs fallback for physical disks
            let model_raw = dev["model"].as_str().unwrap_or("").trim().to_string();
            let model: Option<String> = if !model_raw.is_empty() {
                Some(model_raw)
            } else {
                std::fs::read_to_string(format!("/sys/block/{}/device/model", name))
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };

            let serial: Option<String> =
                std::fs::read_to_string(format!("/sys/block/{}/device/serial", name))
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());

            // in_use is determined solely by ZFS pool membership — no lsblk FSTYPE / partition detection
            let pool = disk_pool_map.get(name).cloned();
            let in_use = pool.is_some();
            let is_system = system_disk_names.contains(name);

            disks.push(json!({
                "name":       name,
                "size_bytes": size_bytes,
                "size_human": format_size_human(size_bytes),
                "in_use":     in_use,
                "pool":       pool,
                "partitions": false,  // kept for API compat; always false with ZFS-only detection
                "model":      model,
                "serial":     serial,
                "is_system":  is_system,
            }));
        }
    }

    Ok(Json(json!({ "disks": disks })))
}
