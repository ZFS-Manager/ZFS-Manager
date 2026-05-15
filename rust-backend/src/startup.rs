use std::fs;
use std::process::Command;
use tracing::{info, warn, error};

pub async fn run_startup_checks() {
    info!("🚀 Starting ZFS-Manager Diagnostic Checks...");

    // ─── System Access ──────────────────────────────────────────────────────────
    info!("--- System Resources ---");
    
    // 1. Check Binaries
    let binaries = ["zfs", "zpool", "smartctl", "lsblk"];
    for bin in binaries {
        match Command::new(bin).arg("--version").output() {
            Ok(_) => info!("  ✅ Binary found: {}", bin),
            Err(_) => error!("  ❌ Binary NOT found: {}. Some features will fail!", bin),
        }
    }

    // 2. Check ZFS Kernel Device
    let zfs_dev = "/dev/zfs";
    if fs::metadata(zfs_dev).is_ok() {
        match fs::OpenOptions::new().read(true).write(true).open(zfs_dev) {
            Ok(_) => info!("  ✅ Device access: {} is Read/Write", zfs_dev),
            Err(_) => {
                // Try read only if RW fails
                if fs::OpenOptions::new().read(true).open(zfs_dev).is_ok() {
                    warn!("  ⚠️ Device access: {} is READ-ONLY. Management tasks might fail!", zfs_dev);
                } else {
                    error!("  ❌ Device access: {} is NOT accessible.", zfs_dev);
                }
            }
        }
    } else {
        error!("  ❌ Device NOT found: {}. ZFS management will NOT work!", zfs_dev);
    }

    // 3. Check /proc entries
    let proc_files = [
        "/proc/stat",
        "/proc/meminfo",
        "/proc/loadavg",
        "/proc/uptime",
        "/proc/spl/kstat/zfs/arcstats",
    ];
    for file in proc_files {
        match fs::read_to_string(file) {
            Ok(_) => info!("  ✅ ProcFS: {} is readable", file),
            Err(e) => warn!("  ⚠️ ProcFS: {} is NOT readable ({})", file, e),
        }
    }

    // 4. Check Storage
    let data_dir = std::env::var("ZFS_MANAGER_DATA").unwrap_or_else(|_| "/home/docker/zfs-manager".to_string());
    let test_file = format!("{}/.startup_test", data_dir);
    if fs::create_dir_all(&data_dir).is_ok() && fs::write(&test_file, "test").is_ok() {
        info!("  ✅ Storage: {} is writable", data_dir);
        let _ = fs::remove_file(&test_file);
    } else {
        error!("  ❌ Storage: {} is NOT writable!", data_dir);
    }

    // ─── Service Connectivity ──────────────────────────────────────────────────
    info!("--- Infrastructure Connectivity ---");

    // 5. Check Redis
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    match redis::Client::open(redis_url.as_str()) {
        Ok(client) => {
            match client.get_connection() {
                Ok(_) => info!("  ✅ Redis: Connected successfully to {}", redis_url),
                Err(e) => error!("  ❌ Redis: Could not connect to {} ({})", redis_url, e),
            }
        }
        Err(e) => error!("  ❌ Redis: Invalid URL {} ({})", redis_url, e),
    }

    // 6. Check PostgreSQL
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://zfs:zfs_secret@127.0.0.1:5432/zfs_metrics".to_string());
    match tokio_postgres::connect(&db_url, tokio_postgres::NoTls).await {
        Ok(_) => info!("  ✅ PostgreSQL: Connected successfully"),
        Err(e) => error!("  ❌ PostgreSQL: Could not connect ({})", e),
    }

    info!("🏁 Diagnostic Checks finished.");
}
