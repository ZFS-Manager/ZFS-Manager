# ZFS Manager

A modern, dark-themed web dashboard for managing ZFS storage pools — built with a Rust/Axum REST backend and a React + Tailwind frontend, deployed via Docker Compose.

![ZFS Manager Dashboard](https://img.shields.io/badge/ZFS-Manager-blue?style=flat-square) ![Rust](https://img.shields.io/badge/Rust-Axum-orange?style=flat-square) ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square) ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square)

---

## Features

### Storage Pools
- Live pool list with health status, RAID-type badge (Mirror, RAIDZ-1/2/3, Stripe), fragmentation and capacity
- **X von Y** capacity display with color-coded utilization bar (sky / amber / rose)
- Disk list per pool with SMART data viewer per disk
- **Action menu** per pool: Show Status, ZFS Rewrite (scrub), Expand Pool, Replace Disk
- **Replace Disk** — 2-step flow: select old disk from pool's own disk list, then pick the replacement
- **Expand Pool** — shows pool's actual disks (not system block devices)
- **Import Pool** — auto-detects importable pools, supports custom search directory
- **Create Pool** — VDEV type selector (Stripe / Mirror / RAIDZ-1/2/3), device path picker, ashift, force flag, live command preview
- Scrub with live progress bar and polling

### Datasets & Volumes
- Hierarchical dataset list with sort, search, compression and usage display
- **Create dataset** with inline name input inside the panel header
- **Delete dataset** — detects children / busy mounts and offers Force + Recursive buttons with clear error messages
- **Properties editor** — compression, quota (with MB/GB/TB unit selector), atime, dedup, readonly toggles
- **Rewrite** button per dataset row (triggers pool scrub on parent pool)

### Snapshots
- Full snapshot list with dataset grouping and formatted timestamps
- **Auto-name** on dataset select: `Pool-Dataset-YYYY-MM-DD`
- Create, rollback, delete snapshots

### Performance (real-time charts)
- **Throughput** — Read/Write in MB/s (correct iostat column mapping)
- **IOPS** — combined read+write ops/s
- **System Resources** — real CPU% (two `/proc/stat` readings, 250 ms apart) + ARC hit ratio
- **Storage Trends** — pool alloc/free history
- Clickable legend to toggle individual series on/off

### Dashboard
- Summary cards: pools, datasets, snapshots, volumes
- Utilization bar with `X GB von Y GB` label
- Live IOPS / Throughput / ARC hit / CPU metrics (shows `0` instead of `—` when idle)
- Event feed from pool history
- System stats: uptime, memory, ARC size

### System Logs
- Pool history parsed into structured log entries with timestamp, type and command

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust · Axum 0.7 · Tokio · serde_json · chrono |
| Frontend | React 19 · TypeScript · Vite 6 · Tailwind CSS 4 |
| Charts | Recharts 3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Container | Docker Compose · Alpine 3.20 (ZFS 2.2.5) |

---

## Requirements

- Linux host with ZFS kernel module loaded (`zfs-kmod` ≥ 2.0)
- Docker + Docker Compose
- The container runtime stage uses **Alpine 3.20** (ZFS 2.2.5) for ABI compatibility with the 2.2.x kernel module. If your host runs ZFS 2.4.x, change `FROM alpine:3.20` to `FROM alpine:latest` in `rust-backend/Dockerfile`.

---

## Quick Start

```bash
git clone https://github.com/EinNiki/zfs-manager.git
cd zfs-manager

docker compose up -d --build
```

Open **http://localhost:8080** — default API key is `admin123`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ZFS_API_KEY` | `admin123` | API key for all backend requests |
| `ZFS_BACKEND_PORT` | `3000` | Port for the Rust API |
| `ZFS_WEB_PORT` | `8080` | Port for the nginx frontend |

Override via a `.env` file in the project root or by editing `compose.yaml`.

---

## Demo Pool Setup (testing without real disks)

```bash
# Create two 500 MB image files as virtual disks
dd if=/dev/zero of=/tmp/zfs_disk1.img bs=1M count=500
dd if=/dev/zero of=/tmp/zfs_disk2.img bs=1M count=500

# Create a mirrored demo pool
sudo zpool create -f demo_pool mirror /tmp/zfs_disk1.img /tmp/zfs_disk2.img

# Populate with some datasets
sudo zfs create demo_pool/data
sudo zfs create demo_pool/backups
sudo zfs create demo_pool/data/documents
```

---

## API Overview

Base URL: `http://localhost:3000/api/v1`  
Auth header: `X-API-Key: <key>`

### Pools
| Method | Path | Description |
|---|---|---|
| GET | `/pools` | List all pools |
| POST | `/pools` | Create pool |
| DELETE | `/pools/:name` | Destroy pool |
| GET | `/pools/:name/status` | Raw `zpool status` output |
| GET | `/pools/:name/vdevs` | Parsed vdev/disk structure |
| POST | `/pools/:name/scrub` | Start scrub |
| DELETE | `/pools/:name/scrub` | Stop scrub |
| GET | `/pools/:name/scrub-status` | Scrub progress |
| POST | `/pools/:name/resilver` | ZFS Rewrite (scrub restart) |
| POST | `/pools/:name/expand` | `zpool online -e` |
| POST | `/pools/:name/replace` | `zpool replace` |
| GET | `/pools/:name/events` | Parsed pool history events |
| GET | `/pools/importable` | List importable pools |
| POST | `/pools/:name/import` | Import pool |

### Datasets
| Method | Path | Description |
|---|---|---|
| GET | `/datasets` | List datasets |
| POST | `/datasets` | Create dataset |
| DELETE | `/datasets/*name` | Destroy (`?force=true&recursive=true`) |

### Snapshots
| Method | Path | Description |
|---|---|---|
| GET | `/snapshots` | List snapshots |
| POST | `/snapshots` | Create (`{"name": "pool/ds@snap"}`) |
| DELETE | `/snapshots/*name` | Destroy snapshot |
| POST | `/snapshots/rollback` | Rollback |

### Properties
| Method | Path | Description |
|---|---|---|
| GET | `/properties/*name` | Get properties (`?prop=compression,quota,...`) |
| PUT | `/properties/*name` | Set property (`{"prop": "...", "value": "..."}`) |

### System
| Method | Path | Description |
|---|---|---|
| GET | `/stats/system` | CPU%, ARC, memory, uptime |
| GET | `/pools/:name/iostat` | Read/write bandwidth + IOPS |
| GET | `/system/disks` | Block device list (lsblk) |
| GET | `/system/smart/:device` | SMART data for device |

---

## Project Structure

```
zfs-manager/
├── compose.yaml
├── rust-backend/
│   ├── Dockerfile
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── error.rs
│       ├── executor.rs
│       └── routes/
│           ├── pools.rs
│           ├── datasets.rs
│           ├── snapshots.rs
│           ├── properties.rs
│           ├── stats.rs
│           ├── volumes.rs
│           └── health.rs
└── web/
    ├── Dockerfile
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── types.ts
        └── components/
            ├── Dashboard.tsx
            ├── StoragePools.tsx
            ├── DatasetList.tsx
            ├── SnapshotManager.tsx
            ├── Performance.tsx
            ├── SystemLogs.tsx
            └── Sidebar.tsx
```

---

## Known Limitations

- **Scrub requires kernel/userland version match.** Alpine 3.20 ships ZFS 2.2.5. If your host kernel module is 2.4.x, change the runtime `FROM` in `rust-backend/Dockerfile` to `alpine:latest`.
- **SMART data** requires a SMART-capable device — virtual disk images return no data.
- The backend runs **privileged** and mounts `/dev`, `/proc`, and `/tmp` from the host to access ZFS devices and pool image files.

---

## License

MIT
