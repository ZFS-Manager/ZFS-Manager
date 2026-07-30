wit_bindgen::generate!({
    path: "../../rust-backend/wit",
    world: "module",
});

use serde::Deserialize;
use zfs_dashboard::module::host_api as host;

#[derive(Deserialize)]
struct Config {
    immich_url: String,
    #[serde(default = "default_stats")]
    stats_to_fetch: Vec<String>,
}

fn default_stats() -> Vec<String> {
    vec!["photos".into(), "videos".into(), "usage".into(), "users".into()]
}

/// Shape of Immich's GET /api/server/statistics response (fields we use).
#[derive(Deserialize)]
struct ServerStatistics {
    #[serde(default)]
    photos: f64,
    #[serde(default)]
    videos: f64,
    #[serde(default)]
    usage: f64,
    #[serde(default, rename = "usageByUser")]
    usage_by_user: Vec<serde_json::Value>,
}

struct ImmichModule;

impl Guest for ImmichModule {
    fn run(config_json: String) -> RunResult {
        match collect(&config_json) {
            Ok(written) => RunResult {
                success: true,
                message: format!("collected {written} Immich metrics"),
                metrics_written: written,
                error: None,
            },
            Err(e) => {
                host::log("error", &e);
                RunResult {
                    success: false,
                    message: String::new(),
                    metrics_written: 0,
                    error: Some(e),
                }
            }
        }
    }
}

fn collect(config_json: &str) -> Result<u32, String> {
    let config: Config =
        serde_json::from_str(config_json).map_err(|e| format!("invalid config: {e}"))?;
    let api_key = host::get_secret("immich_api_key").ok_or("immich_api_key secret is not set")?;

    let base = config.immich_url.trim_end_matches('/');
    let url = format!("{base}/api/server/statistics");
    host::log("info", &format!("fetching {url}"));

    let response = host::http_fetch(&url, &[("x-api-key".to_string(), api_key)])?;
    if response.status != 200 {
        return Err(format!("Immich returned HTTP {}", response.status));
    }
    let stats: ServerStatistics =
        serde_json::from_str(&response.body).map_err(|e| format!("unexpected response: {e}"))?;

    let mut written = 0u32;
    for stat in &config.stats_to_fetch {
        let (metric, value) = match stat.as_str() {
            "photos" => ("immich.photos", stats.photos),
            "videos" => ("immich.videos", stats.videos),
            "usage" => ("immich.usage_bytes", stats.usage),
            "users" => ("immich.users", stats.usage_by_user.len() as f64),
            other => {
                host::log("warn", &format!("unknown stat {other:?} — skipping"));
                continue;
            }
        };
        host::db_write_metric(metric, value)?;
        written += 1;
    }
    Ok(written)
}

export!(ImmichModule);
