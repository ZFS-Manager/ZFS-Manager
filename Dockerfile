# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.77-slim AS builder

WORKDIR /app

# Cache dependencies first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# Build the real binary
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# Install ZFS userspace tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        zfsutils-linux \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/zfs-manager /usr/local/bin/zfs-manager

EXPOSE 3000

ENV ZFS_API_PORT=3000
ENV RUST_LOG=info

ENTRYPOINT ["/usr/local/bin/zfs-manager"]
