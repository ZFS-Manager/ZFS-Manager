use axum::{extract::{Path, State}, routing::get, Json, Router};
use redis::AsyncCommands;
use serde_json::{json, Value};
use tracing::warn;

use crate::error::ApiError;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/stats/system", get(get_system_stats))
        .route("/api/v1/system/disks", get(list_disks))
        .route("/api/v1/system/smart/:device", get(get_smart_data))
        .route("/api/v1/time", get(get_server_time))
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
            let idle  = vals.get(3).copied().unwrap_or(0)
                      + vals.get(4).copied().unwrap_or(0);
            let total: u64 = vals.iter().sum();
            return (total, idle);
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
            "used":      mem_total - mem_available
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

    let output = tokio::process::Command::new("smartctl")
        .args(["-H", "-A", "--json=c", &dev_path])
        .output()
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    let json_str = String::from_utf8_lossy(&output.stdout);
    let result = if let Ok(parsed) = serde_json::from_str::<Value>(&json_str) {
        parsed
    } else {
        json!({ "smart_status": { "passed": null }, "message": "No SMART data available" })
    };

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
