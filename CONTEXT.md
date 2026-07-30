# CONTEXT.md — Ubiquitous Language

Glossary of domain terms for ZFS Dashboard. Terms here are canonical — use them
exactly as defined in code, UI, issues, and docs.

## Module system

- **Module**: A community-buildable extension, written in Rust and compiled to
  a WebAssembly artifact, that runs sandboxed inside the backend and may fetch
  external data and write metrics. Never native code.
- **Install**: Downloading (from the Store) or receiving (via Sideload) a
  finished Wasm artifact plus its Manifest, validating it, and registering it
  in the database. Installing **never** compiles anything server-side.
- **Sideload**: Installing a locally built module by uploading its artifact
  directly, bypassing the Store. Validated and sandboxed identically to
  Store-installed modules.
- **Store**: The UI surface listing modules available for installation, fed by
  the Registry Index.
- **Registry**: A source of installable modules — a JSON index referencing
  each module's artifact URL, checksum, and manifest metadata. The **Default
  Registry** ships built-in (index file in the canonical GitHub repo); users
  can add **Custom Registries** by URL via the UI. The Store shows the merged
  view of all configured registries, and each installed module records which
  registry it came from.
- **Manifest** (`module.toml`): A module's self-description: identity,
  entrypoint, requested permissions, and config schema.
