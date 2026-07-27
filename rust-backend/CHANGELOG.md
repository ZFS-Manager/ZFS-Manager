# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0](https://github.com/ZFS-Manager/ZFS-Manager/releases/tag/v1.0.0) - 2026-07-27

### Added
- initial setup for automatic releases and docker builds
- live rewrite speed, popup modal, I/O stats exclusion, and instant page transitions
- improve disk display, add status code view, implement real-time updates
- improve disk status and replace display
- auto-mount config per pool, fixed byte scaling, settings tabs, cleanup
- toggleable pool features, hot spare activation banner
- all pool features in modal, fragmentation info tooltip
- add raidz_expansion feature toggle in pool settings
- mark system disk in create pool, expand and replace disk selection
- mark system disk in create pool, expand and replace disk selection
- show complete zpool status output with all fields and all disks
- add resilver progress bar with time remaining
- add rewrite progress bar identical to scrub progress
- show expand progress bar identical to scrub progress
- show RAIDZ expansion progress in dashboard
- allow manual target vdev selection for pool expansion
- implement raidz expansion via zpool attach
- add /api/v1/disks endpoint and DiskPicker UI component
- multi-pool selector on dashboard and performance, default pool setting, fix 1h totals, fix disk column shift, fix toast position
- add automated pool scrub scheduling
- per-notification mark-read/delete, slide-in page animations with settings toggle, redesign pool settings and datasets UI
- per-disk totals card, backend+frontend live I/O at 1s
- 100ms real-time live I/O via two-tier tick, add per-disk speed and IOPS card
- optimize database writes for performance totals
- persist performance totals in database
- *(sidebar)* display ZFS-Manager version and update status indicator in footer
- update notify system for better customisable
- add test button to notifications
- implement persistent stats, capacity growth rate, and comprehensive notifications system
- *(zfs)* implement native zfs rewrite and optimize scrub progress UI
- *(zfs)* implement native zfs rewrite and optimize scrub progress UI
- Responsive layout + split IOPS into Read/Write
- restructure to rust-backend + react-web dashboard, alpine base, configurable compose

### Fixed
- move release-plz.toml to root
- configure release-plz to support unpublished crates
- change PostgreSQL sync interval to 5 minutes (300s) and average 1s samples before database insertion
- restore 100% clamping capacity, track live rewrite speed_bps, and consolidate cache queries
- resolve query pileup with dedicated sequential cache warming loop, add ascending index, and build beautiful startup screen for pending checks
- pre-warm 7d, 1m, and 1y history intervals in background worker, trigger loading capacity indicators immediately
- background refresh for metric history & prediction cache, clamp rewrite progress and classify events as info
- command timeouts, restore physical telemetry graphs, capacity-based growth rate forecast
- implement redis caching, pre-warming, and prevent chart skeleton flashing
- cache fill-prediction in Redis and add PostgreSQL query timeouts
- add Redis timeouts and fix performance graph time sync
- dataset sorting, mount persistence, 1h graph range, dashboard fill prediction
- mount propagation, SMART status, dataset destroy, spare/cache display
- move pool search to features modal, fix resilver toast, rewrite blocks with find+dd
- remove zfs rewrite, fix raidz expansion 405, add pool search, global byte scaling, pool import UI
- resilver uses zpool resilver via nsenter, restore scrub btn, live badge right
- use dataset name for rewrite nsenter call and truncate error toast
- use host ZFS tools via nsenter for raidz_expansion feature read/write
- use nsenter host mount namespace for system disk detection
- show dataset rewrite success message as success not error
- include vdev name in pool_vdevs API response for correct zpool attach target
- resolve zpool status scrub parsing
- implement graceful shutdown for web and backend containers
- disk in-use detection from zpool only (no cache), simplify expand pool to extend and cache options
- labelclear disks after pool destroy, invalidate cache, re-fetch disk list in frontend
- clear disk labels after pool destroy, add vdev role selector to expand pool
- invalidate disk and pool cache after destroy, disks show as free immediately
- raidz expand vdev, inline disk pickers, pool badges, destroy pool dialog, dataset/snapshot pool dividers, default pool persistence, pool selector pills
- extend chart lines flat to now for all intervals, fix 1y axis direction, pool capacity flat extension, strip partition suffix only when unambiguous
- persist disk totals across restarts, strip partition suffix, SCSI names in storage pools, charts fill full time window, pool capacity flat-line extension, brighter grid, unified disk card
- chart full domain on load, Redis warm from PostgreSQL on startup, short disk names, load-more for logs/notifications/snapshots, staggered row animations
- throughput time windows, per-disk totals, unified live I/O source, correct pool free size, notification buttons, empty volume init
- pool capacity uses zpool list RAID-aware size, per-disk totals from kstat cumulative counters
- notifications threshold eval, per-disk live totals, RAID-aware pool size, audit redundant DB calls
- per-disk totals update live, pool capacity uses correct RAID-aware size
- live total read/write updates every 1s, remove redundant fetches, add disk card to dashboard
- revert chart labels, 500ms live updates, fix all-time total accumulation
- correct total read/write accumulation and persist all-time counters
- Performance tab - Live I/O labels, faster refresh, and dynamic capacity forecast
- resolve ToSql type mismatch in worker.rs and unused variable warning
- make worker batch params Send to satisfy tokio::spawn bound
- security and code quality audit fixes
- *(backend)* add /api/v1 prefix to all notification routes
- *(backend)* fix remaining Json type inference errors in match arms
- *(backend)* resolve docker build compilation errors in notifications module
- *(stats)* read ZFS version from sysfs or kmod line to display true host version
- fix bug
- fix Available Space
- password change now invalidates old password and all sessions
- resolve merge conflicts in main.rs
- scrub, performance values, delete error handling + README
- internal run -> command in executor.rs
- backend build errors (chrono and executor)
- auth bypass, responsive sidebar, and enriched stats

### Other
- improve UI clarity for pool expansion
- Merge pull request [#14](https://github.com/ZFS-Manager/ZFS-Manager/pull/14) from ZFS-Manager/feature/realtime-live-io-and-per-disk-metrics
- Potential fix for pull request finding
- Potential fix for pull request finding
- update total storage display to raw numbers
- Revert "Merge pull request [#5](https://github.com/ZFS-Manager/ZFS-Manager/pull/5) from Panda260/dev"
- Merge origin/main into dev and resolve all conflicts
- Massive ZFS Dashboard Upgrade: Backend Fixes + UI Overhaul
