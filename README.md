<div align="center">
  <h1>ZFS Manager</h1>
  <p>A modern, high-performance web dashboard for managing ZFS storage pools.</p>
  
  ![Rust](https://img.shields.io/badge/Rust-Axum-orange?style=flat-square) 
  ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square) 
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square)
  ![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square)
  ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square)
</div>

---

## 🌟 Overview

ZFS Manager is a completely reimagined, dark-themed control panel designed to bring enterprise-grade ZFS administration into a sleek, user-friendly interface. 

Built with a lightning-fast **Rust/Axum** backend and a dynamic **React + Tailwind** frontend, it provides real-time metrics, historical performance data, global notification rules, and complete control over your storage arrays.

---

## ✨ Key Features

### 📊 Advanced Performance Tracking (New)
- **Time-Series Metrics**: Integrated **PostgreSQL** database securely persists historical performance data (IOPS, Throughput, ARC hit ratio, Capacity).
- **Sub-second Real-time Monitoring**: High-frequency **Redis** caching pipeline fuels the live dashboard with real-time CPU, RAM, and disk utilization data without blocking ZFS commands.
- **Dynamic Forecasting**: Smart predictive algorithms estimate when your storage pools will run out of space based on historical consumption trends.

### 🔔 Global Notification System
- Completely customizable **Notification Rules Engine**.
- Native support for **Discord, Telegram, and Email** webhooks.
- Get instant alerts on ZFS scrubs, dataset rewrites, disk replacements, and pool health degradation.

### 💽 Storage Pools & Disks
- Live pool list with health status, RAID-type badges (Mirror, RAIDZ-1/2/3, Stripe), fragmentation, and capacity.
- Deep disk inspection with **per-disk SMART data** viewer.
- **Action Menu**: Trigger ZFS Rewrites (rebalance), Expand Pools, Replace Disks, or run Scrubs with live progress tracking.
- **Pool Creation**: Intuitive VDEV type selector, ashift configuration, and force flags with a live terminal command preview.

### 📁 Datasets & Volumes
- Unified **Settings Popout**: Edit compression (lz4, zstd, gzip), quota, atime, dedup, and readonly attributes in a single, beautiful menu.
- **In-place Dataset Rewrite**: Rebalance datasets after compression changes with one click.
- Detects busy mounts/children when destroying datasets, offering safe Force + Recursive options.

### 📸 Snapshots
- Auto-naming schemas (`Pool-Dataset-YYYY-MM-DD`).
- One-click Snapshot Rollbacks and granular deletions.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Rust, Axum 0.7, Tokio, Serde, SQLx |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4, Recharts, Framer Motion |
| **Datastore** | PostgreSQL 16 (Metrics History), Redis 7 (Live Cache & PubSub) |
| **Deployment**| Docker Compose, Alpine 3.20 (ZFS 2.2.5 ABI) |

---

## 🚀 Quick Start

Getting started is incredibly easy. The entire stack (Backend, Frontend, PostgreSQL, Redis) is orchestrated via Docker Compose.

### Prerequisites
- A Linux host with the ZFS kernel module loaded (`zfs-kmod` ≥ 2.0).
- Docker and Docker Compose installed.

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ZFS-Manager/ZFS-Manager.git
cd ZFS-Manager

# 2. Start the entire stack in the background
docker compose up -d --build
```

Open **http://localhost:8080** in your browser. 
*(The default API Key is `admin123`)*

---

## ⚙️ Configuration

Environment variables can be adjusted directly in the `compose.yaml` or via a `.env` file.

| Variable | Default | Description |
|---|---|---|
| `ZFS_API_KEY` | `admin123` | Security key for all backend REST API requests. |
| `POSTGRES_PASSWORD` | `zfs_secret` | Password for the integrated PostgreSQL metrics database. |
| `ZFS_BACKEND_PORT` | `3000` | Port for the Rust API. |
| `ZFS_WEB_PORT` | `8080` | Port for the Nginx frontend. |

---

## ⚠️ Important Notes & Limitations

- **Kernel Compatibility**: The container uses Alpine 3.20 (which ships ZFS 2.2.5). This provides the best compatibility for 2.2.x host kernels. If your host kernel module is 2.4.x, you should change `FROM alpine:3.20` to `FROM alpine:latest` in `rust-backend/Dockerfile`.
- **Privileged Mode**: The backend container runs as `privileged: true` and mounts host paths (`/dev`, `/proc`, `/sys/module/zfs`) to allow the ZFS utilities inside the container to interact with your host's kernel and block devices.

---

## 📜 License

MIT License. See `LICENSE` for more information.
