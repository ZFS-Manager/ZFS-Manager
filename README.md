# ZFS Manager

> A modern, self-hosted web UI for managing ZFS storage pools, datasets and
> snapshots — no terminal commands required.

---

## Features

- **Dashboard** — live overview: pool health, total storage, available space
  with fill-date prediction, I/O activity chart, system resources, recent activity
- **Performance** — live and historical read/write throughput, IOPS, latency,
  storage space history with per-pool fill-date prediction
- **Storage Pools** — create, scrub, snapshot and monitor pools with vdev topology,
  disk usage status shown when selecting disks
- **Datasets** — tree view, create and manage datasets and snapshots with
  compression and property editing
- **System Logs** — real-time log viewer with INFO / WARN / ERROR filtering
- **Settings** — change password, create and manage API keys with permission levels
  (Read Only / Read+Write / Admin)
- **Customizable layout** — drag, remove and re-add widgets on Dashboard and
  Performance page, layout saved server-side.
- **Responsive** — desktop, tablet and mobile support with collapsible sidebar

---

## Requirements

- Docker and Docker Compose v2
- Linux host with ZFS installed and kernel module loaded (`modprobe zfs`)
- The backend container runs privileged to access ZFS and disk devices

---

## Quick Start

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/EinNiki/ZFS-Manager/main/compose.yaml

# 2. Start the stack
docker compose up -d

# 3. Open the web UI
http://<your-host-ip>:8080
```

Default login:
- Password: `admin123`

> ⚠️ **Change your password immediately after first login.**
> Settings → Change Password

---

## Configuration

Create a `.env` file next to `compose.yaml` to override defaults:

```env
ZFS_API_KEY=your-secure-password
POSTGRES_PASSWORD=your-db-password
ZFS_WEB_PORT=8080
ZFS_BACKEND_PORT=3000
```

| Variable | Default | Description |
|---|---|---|
| `ZFS_API_KEY` | `admin123` | Initial admin password |
| `POSTGRES_PASSWORD` | `zfs_secret` | PostgreSQL password |
| `ZFS_WEB_PORT` | `8080` | Web UI port |
| `ZFS_BACKEND_PORT` | `3000` | Backend API port |

---

## Data Persistence

| Volume | Purpose |
|---|---|
| `redis_data` | Live metrics cache |
| `postgres_data` | Historical metrics, layout config, user data |

Data survives container restarts and updates.

---

## Updating

```bash
docker compose pull
docker compose up -d
```

---

## Security Notes

- Change the default password on first login
- The backend requires privileged mode for ZFS access — run on a trusted network
- API keys are hashed in the database and shown only once on creation
- All sessions are invalidated when the password is changed

---

## License

MIT
