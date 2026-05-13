# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:alpine AS builder

# Required for building some async/network crates on musl
RUN apk add --no-cache musl-dev gcc perl make

WORKDIR /app

# Cache dependencies first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# ARG CACHEBUST: pass a new value (e.g. git commit hash) to force recompile
ARG CACHEBUST=1
RUN echo "Cache bust: $CACHEBUST"

# Build the real binary
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# alpine:3.20 ships ZFS 2.2.5 which is ABI-compatible with the 2.2.x kernel module.
# alpine:latest/edge ships ZFS 2.4.x which breaks scrub against older kernel modules.
FROM alpine:3.20

# Install ZFS tools
RUN apk add --no-cache zfs util-linux smartmontools

COPY --from=builder /app/target/release/zfs-manager /usr/local/bin/zfs-manager

# Create data directory
RUN mkdir -p /home/docker/zfs-manager

EXPOSE 3000

ENV ZFS_API_PORT=3000
ENV RUST_LOG=info
ENV ZFS_MANAGER_DATA=/home/docker/zfs-manager

WORKDIR /home/docker/zfs-manager

ENTRYPOINT ["/usr/local/bin/zfs-manager"]
