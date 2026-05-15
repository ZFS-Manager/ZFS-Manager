use std::fs;
use std::process::Command;
use tracing::{info, warn, error};

pub async fn run_startup_checks() {
    info!("🚀 Starting ZFS-Manager Diagnostic Checks...");

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
        info!("  ✅ Device found: {}", zfs_dev);
        // Check if we can open it for reading (requires privileged/cap_sys_admin)
        match fs::OpenOptions::new().read(true).open(zfs_dev) {
            Ok(_) => info!("  ✅ Device access: {} is readable", zfs_dev),
            Err(e) => error!("  ❌ Device access: {} is NOT readable ({})", zfs_dev, e),
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
            Ok(_) => info!("  ✅ ProcFS access: {} is readable", file),
            Err(e) => warn!("  ⚠️ ProcFS access: {} is NOT readable ({})", file, e),
        }
    }

    // 4. Check ZFS Module in /sys
    if fs::metadata("/sys/module/zfs").is_ok() {
        info!("  ✅ ZFS Kernel Module: Detected in /sys/module/zfs");
    } else {
        warn!("  ⚠️ ZFS Kernel Module: NOT detected in /sys/module/zfs");
    }

    // 5. Check Data Directory Permissions
    let data_dir = std::env::var("ZFS_MANAGER_DATA").unwrap_or_else(|_| "/home/docker/zfs-manager".to_string());
    match fs::create_dir_all(&data_dir) {
        Ok(_) => {
            // Try creating a test file
            let test_file = format!("{}/.startup_test", data_dir);
            match fs::write(&test_file, "test") {
                Ok(_) => {
                    info!("  ✅ Storage access: {} is writable", data_dir);
                    let _ = fs::remove_file(&test_file);
                }
                Err(e) => error!("  ❌ Storage access: {} is NOT writable ({})", data_dir, e),
            }
        }
        Err(e) => error!("  ❌ Storage access: Could not create data directory {} ({})", data_dir, e),
    }

    info!("🏁 Diagnostic Checks finished.");
}
