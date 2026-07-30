# Immich Stats Module

Collects statistics from an [Immich](https://immich.app) server and writes
them as ZFS Dashboard metrics. This module doubles as the **reference
template** for writing your own modules.

## What it does

Every scheduled run it calls `GET /api/server/statistics` on your Immich
server and writes the selected metrics:

| Metric | Meaning |
|---|---|
| `immich.photos` | Total number of photos |
| `immich.videos` | Total number of videos |
| `immich.usage_bytes` | Storage used by Immich |
| `immich.users` | Number of users |

## Configuration

| Field | Type | Description |
|---|---|---|
| `immich_url` | url | Base URL, e.g. `http://immich.local:2283` |
| `immich_api_key` | secret | API key from Immich Account Settings → API Keys |
| `stats_to_fetch` | multiselect | Which of the metrics to write |
| `schedule` | schedule | Interval (`300`, `15m`, `2h`) or cron (`0 0 * * * *`) |

---

# Writing your own module

A module is a Rust crate compiled to a **WebAssembly component**
(`wasm32-wasip2`) that runs sandboxed inside the ZFS Dashboard backend. It has
**no** filesystem, network, or environment access — only the explicit
capability API the host provides.

## 1. Repository layout

```
my-module/
├── Cargo.toml        # crate-type = ["cdylib"], dep: wit-bindgen
├── module.toml       # manifest: identity, permissions, config schema
├── wit/module.wit    # copy of the host interface (see rust-backend/wit/)
└── src/lib.rs        # your logic
```

## 2. The capability API (`wit/module.wit`)

The host offers exactly four functions:

- `http-fetch(url, headers)` — GET a URL. **Host-enforced allowlist**: only
  hosts named in your manifest's `permissions.network_allowlist` or taken from
  `url`-typed config fields are reachable. Redirects are disabled, responses
  capped at 5 MiB, max 32 requests per run.
- `db-write-metric(metric-name, value)` — write one metric. The host binds it
  to your module id; max 1000 per run.
- `get-secret(key)` — read a secret the user configured for your module.
  Secrets are stored AES-256-GCM encrypted and never appear in `config-json`.
- `log(level, message)` — log line, shown in the run history.

Your module exports one function: `run(config-json) -> run-result`.

## 3. Manifest (`module.toml`)

See this module's `module.toml` for a complete example. Notable fields:

- `id` — lowercase `[a-z0-9-_]`, unique, max 64 chars
- `wasm_entrypoint` — plain file name of your built component
- `permissions.network_allowlist` — static extra hosts (`api.example.com`,
  `host:1234`). Hosts from `url`-typed config fields are allowed automatically.
- `config_schema` — array of fields the UI renders as a form. Types: `text`,
  `url`, `secret`, `number`, `select`, `multiselect`, `schedule`.

Include a `schedule`-typed field with key `schedule` if your module should run
automatically.

## 4. Build

```bash
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
# → target/wasm32-wasip2/release/<crate_name>.wasm
```

## 5. Install

- **Sideload (local/dev)**: `POST /api/v1/modules/sideload` with
  `{"manifest_toml": "<module.toml contents>", "wasm_base64": "<base64 of .wasm>"}`.
- **Registry**: publish the `.wasm` as a release artifact plus your
  `module.toml`, and add an entry (URLs + SHA-256) to a registry index JSON.
  Users add your registry URL in the Store UI. The server verifies the
  checksum and **never compiles source code**.

## 6. Resource limits

Runs are bounded by instruction fuel, a memory cap (default 64 MiB), and a
wall-clock timeout (default 30 s). Exceeding any limit aborts the run and
records it as failed — an infinite loop or memory bomb cannot harm the host.
