use axum::{extract::Path, routing::get, Json, Router};
use serde_json::{json, Value};
use crate::error::ApiError;

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/stats/system", get(get_system_stats))
        .route("/api/v1/system/disks", get(list_disks))
        .route("/api/v1/system/smart/:device", get(get_smart_data))
}

fn parse_arc_stats(raw: &str) -> (f64, i64) {
    let mut hits:     u64 = 0;
    let mut misses:   u64 = 0;
    let mut arc_size: i64 = 0;

    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            match parts[0] {
                "hits"   => hits     = parts[2].parse().unwrap_or(0),
                "misses" => misses   = parts[2].parse().unwrap_or(0),
                "size"   => arc_size = parts[2].parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    let total = hits + misses;
    let hit_ratio = if total > 0 { (hits as f64 / total as f64) * 100.0 } else { 0.0 };
    (hit_ratio, arc_size)
}

fn parse_loadavg(raw: &str) -> [f64; 3] {
    let parts: Vec<&str> = raw.trim().split_whitespace().collect();
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

async fn get_system_stats() -> Result<Json<Value>, ApiError> {
    let arc_raw     = std::fs::read_to_string("/proc/spl/kstat/zfs/arcstats").unwrap_or_default();
    let loadavg_raw = std::fs::read_to_string("/proc/loadavg").unwrap_or_default();
    let meminfo_raw = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let uptime_raw  = std::fs::read_to_string("/proc/uptime").unwrap_or_default();

    let (arc_hit_ratio, arc_size) = parse_arc_stats(&arc_raw);
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

    Ok(Json(json!({
        "uptime":         uptime_formatted,
        "uptime_secs":    uptime_secs,
        "timestamp":      chrono::Utc::now().to_rfc3339(),
        "cpu_load":       cpu_load,
        "arc_size":       arc_size,
        "arc_hit_ratio":  arc_hit_ratio,
        "memory": {
            "total":     mem_total,
            "free":      mem_free,
            "available": mem_available,
            "used":      mem_total - mem_available
        }
    })))
}

async fn get_smart_data(Path(device): Path<String>) -> Result<Json<Value>, ApiError> {
    let dev_path = if device.starts_with('/') { device.clone() } else { format!("/dev/{}", device) };
    let output = tokio::process::Command::new("smartctl")
        .args(["-H", "-A", "--json=c", &dev_path])
        .output()
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    let json_str = String::from_utf8_lossy(&output.stdout);
    if let Ok(parsed) = serde_json::from_str::<Value>(&json_str) {
        Ok(Json(parsed))
    } else {
        Ok(Json(json!({ "smart_status": { "passed": null }, "message": "No SMART data available" })))
    }
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
        // Only return actual disks (type == "disk"), not loops, roms, partitions
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
        // lsblk not available or failed — return empty list gracefully
        Ok(Json(json!({ "blockdevices": [] })))
    }
}
