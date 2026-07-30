# Security Model — ZFS Dashboard Module System

The module system lets anyone run third-party code inside a backend container
that runs `privileged: true` with host ZFS access. This document explains the
threat model, the controls in place, and how they are verified.

## Threat model

The backend container has host kernel access (`/dev`, `/proc`,
`/sys/module/zfs`) — it is effectively root on the host. Therefore **module
code is treated as fully untrusted and hostile**. A module must never be able
to run native code on the host, reach the host filesystem or network freely,
read another module's secrets, or exhaust host resources.

## Controls

### 1. No native code execution — ever

Modules are WebAssembly components (`wasm32-wasip2`), executed sandboxed with
[wasmtime](https://wasmtime.dev). The server **never compiles module source
code** — not on install, not on sideload. There is no `dlopen`, no `.so`, no
native dynamic loading. Installing means downloading or receiving a finished
`.wasm` artifact and validating it.

### 2. Locked-down WASI

The guest gets a WASI context built with no preopened directories, no sockets,
no environment variables, and no inherited stdio
([`runtime.rs`](rust-backend/src/modules/runtime.rs)). The guest's standard
library sees an empty world; the only way out is the four explicit host
functions below.

### 3. Minimal, host-enforced capability API

Defined in [`module.wit`](rust-backend/wit/module.wit):

- **`http-fetch(url, headers)`** — the host checks every URL against the
  module's allowlist (manifest `network_allowlist` entries plus the hosts of
  `url`-typed config fields). Matching is **port-precise**: a bare `host` entry
  matches only the default port (80/443), and a `host:port` entry only that
  port — so an entry for a LAN host can never be abused to reach other services
  (Postgres, SSH, …) on the same host. Only `http`/`https` schemes; redirects
  disabled. After the allowlist check, the resolved target IP is screened and
  **loopback / link-local (incl. the 169.254.169.254 metadata endpoint) /
  unspecified / multicast** addresses are refused (private LAN ranges stay
  allowed — reaching self-hosted LAN services is the intended use). Responses
  are capped at 5 MiB and 32 requests per run.
- **`db-write-metric(name, value)`** — the host binds the metric to the
  **calling module's id**; a module cannot write under another id. Names are
  validated (`[a-zA-Z0-9._-]`, ≤128 chars), values must be finite, max 1000
  per run.
- **`get-secret(key)`** — returns only secrets configured for **this** module,
  decrypted in the host. The guest never receives the master key or a DB
  connection.
- **`log(level, message)`** — bounded (500 lines, 2 KiB each).

### 4. Resource limits per run

Enforced by the host, configurable via env (`ZFS_MODULE_FUEL`,
`ZFS_MODULE_MEMORY_BYTES`, `ZFS_MODULE_TIMEOUT_SECS`):

- **Fuel metering** — an instruction budget aborts infinite loops.
- **Memory cap** — default 64 MiB via wasmtime `StoreLimits`.
- **Wall-clock timeout** — default 30 s via epoch interruption, plus an outer
  `tokio::time::timeout` backstop in case a host call hangs.

Exceeding any limit aborts the run and records it as `failed` with the reason.

### 5. Secrets at rest

Module secrets (API keys, DB passwords) are encrypted with **AES-256-GCM**
([`secrets.rs`](rust-backend/src/modules/secrets.rs)). The master key comes
from `ZFS_SECRETS_MASTER_KEY` (base64, 32 bytes) or is generated once into the
data dir with `0600` permissions (created owner-only from the start — no
world-readable window). Secrets are **never** logged and **never** returned to
the frontend — the API exposes only which secret keys are set, and the UI
allows replace-only, never reveal.

### 6. Manifest validation before install

[`manifest.rs`](rust-backend/src/modules/manifest.rs) validates every
`module.toml`: size limit (64 KiB), id charset (`[a-z0-9-_]`), `wasm_entrypoint`
must be a plain `.wasm` file name (no `/`, no `..` — path-traversal safe),
allowlist and config-schema well-formedness. The `.wasm` itself is size-capped
(32 MiB) and compiled by wasmtime as a validation step before it is stored.

### 7. Registry trust anchor: checksums

Store installs verify the downloaded `.wasm` against the **SHA-256 in the
registry index** and refuse on mismatch. Only registries the user has
explicitly configured are valid install sources.

### 8. API hardening

Module-management endpoints sit behind the existing session/API-key auth,
are **rate-limited** per IP (30/min), and every install / uninstall / config
change / enable / disable / manual run / registry change writes a row to
`module_audit_log` with the acting identity (`admin` or `api-key:<name>`).

### 9. SQL safety

All database access uses parameterized `tokio-postgres` queries (`$1, $2, …`).
No string concatenation into SQL.

### 10. Supply chain

CI runs [`cargo deny check`](.github/workflows/security.yml) on every push and
PR — covering RustSec advisories, yanked crates, license policy, and source
policy (see [`deny.toml`](rust-backend/deny.toml)).

## Verification

- **Automated sandbox pentest**:
  [`tests/sandbox_escape.rs`](rust-backend/tests/sandbox_escape.rs) drives a
  deliberately hostile module
  ([`tests/malicious-module`](rust-backend/tests/malicious-module)) that tries
  to reach the cloud-metadata endpoint (SSRF), read `/etc/passwd`, spin an
  infinite loop, allocate a memory bomb, and write invalid metrics. Each attack
  is proven blocked.
- **End-to-end sandbox smoke**:
  [`tests/module_smoke.rs`](rust-backend/tests/module_smoke.rs) runs the real
  immich module and confirms the allowlist and secret handling.
- **Unit tests** cover allowlist matching, manifest validation, and
  secret encrypt/decrypt round-trips (including tamper detection).

## Known limitations

- **Rate-limit IP source**: per-IP rate limiting derives the client IP from the
  `X-Forwarded-For` header (a codebase-wide convention, also used by the login
  limiter). Behind an untrusted network this header is spoofable, so the limit
  is a courtesy control, not a hard defense. Deploy behind a reverse proxy that
  sets a trustworthy forwarded header.
- **Registry SSRF**: the server refuses to fetch registry artifacts whose host
  resolves to a private/loopback/link-local address, but registries are
  admin-configured trust boundaries — only add registries you trust.

## Reporting

Found a vulnerability? Please open a private security advisory on the GitHub
repository rather than a public issue.
