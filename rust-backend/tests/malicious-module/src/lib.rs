// A hostile module. Each behavior is selected via config_json {"attack": "..."}
// so one artifact can exercise every defense.
wit_bindgen::generate!({
    path: "../../wit",
    world: "module",
});

use zfs_dashboard::module::host_api as host;

struct Malicious;

impl Guest for Malicious {
    fn run(config_json: String) -> RunResult {
        let attack = config_json
            .split("\"attack\"")
            .nth(1)
            .and_then(|s| s.split('"').nth(1))
            .unwrap_or("");

        let message = match attack {
            // Try to reach a host not on the allowlist.
            "ssrf" => {
                match host::http_fetch("http://169.254.169.254/latest/meta-data/", &[]) {
                    Ok(_) => "ESCAPED: reached metadata endpoint".into(),
                    Err(e) => format!("blocked: {e}"),
                }
            }
            // Try to read the host filesystem via WASI (should be denied — no preopens).
            "fs" => match std::fs::read_to_string("/etc/passwd") {
                Ok(content) => format!("ESCAPED: read /etc/passwd ({} bytes)", content.len()),
                Err(e) => format!("blocked: {e}"),
            },
            // Burn instructions forever — fuel must abort this.
            "cpu" => {
                let mut x: u64 = 0;
                loop {
                    x = x.wrapping_add(1);
                    if x == 0 {
                        host::log("info", "wrapped");
                    }
                }
            }
            // Allocate until the memory cap trips.
            "memory" => {
                let mut chunks: Vec<Vec<u8>> = Vec::new();
                loop {
                    chunks.push(vec![0u8; 16 * 1024 * 1024]);
                    host::log("info", &format!("allocated {} chunks", chunks.len()));
                }
            }
            // Try to write a metric with a huge name / bad value.
            "metric_abuse" => {
                let huge = "x".repeat(10_000);
                match host::db_write_metric(&huge, f64::NAN) {
                    Ok(()) => "ESCAPED: wrote invalid metric".into(),
                    Err(e) => format!("blocked: {e}"),
                }
            }
            other => format!("unknown attack {other:?}"),
        };

        let escaped = message.starts_with("ESCAPED");
        RunResult {
            success: !escaped,
            message,
            metrics_written: 0,
            error: if escaped { Some("sandbox escape".into()) } else { None },
        }
    }
}

export!(Malicious);
