# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/ZFS-Manager/ZFS-Manager/compare/v1.0.0...v1.1.0) (2026-07-27)


### Features

* 100ms real-time live I/O via two-tier tick, add per-disk speed and IOPS card ([a25434e](https://github.com/ZFS-Manager/ZFS-Manager/commit/a25434ee8586bac2477b7d2e492179320beaa689))
* add /api/v1/disks endpoint and DiskPicker UI component ([8605a71](https://github.com/ZFS-Manager/ZFS-Manager/commit/8605a715bb6c42dadac621ac90df76f6f53d52ab))
* add automated pool scrub scheduling ([28b902a](https://github.com/ZFS-Manager/ZFS-Manager/commit/28b902a99b075a6e0a8e30fc3a80c1fb2f9c0dd8))
* add automated pool scrub scheduling ([c07b41d](https://github.com/ZFS-Manager/ZFS-Manager/commit/c07b41d5c0b239fb175f1d691ca2fa82d05aeae5))
* add detailed ARC diagnostics and fix build dependencies ([376132d](https://github.com/ZFS-Manager/ZFS-Manager/commit/376132d5717ffdb9a77713d1d9138f46d7bc2159))
* add raidz_expansion feature toggle in pool settings ([e79f86a](https://github.com/ZFS-Manager/ZFS-Manager/commit/e79f86aca4738247ccfbc3cda75c3dd13238ad04))
* add resilver progress bar with time remaining ([10680b3](https://github.com/ZFS-Manager/ZFS-Manager/commit/10680b367c4d918677f158a989626be1aace9000))
* add rewrite progress bar identical to scrub progress ([36a29b0](https://github.com/ZFS-Manager/ZFS-Manager/commit/36a29b06b84268272feede52b49aa377d7042756))
* add startup diagnostic checks to backend ([ae3c941](https://github.com/ZFS-Manager/ZFS-Manager/commit/ae3c9412399d9e54b3393ce175d2e1cb5330042d))
* add test button to notifications ([ec8ca3c](https://github.com/ZFS-Manager/ZFS-Manager/commit/ec8ca3c805f0ff74917e53137c6349147a09001b))
* all pool features in modal, fragmentation info tooltip ([e518f85](https://github.com/ZFS-Manager/ZFS-Manager/commit/e518f853346a6a43ace3d23358315cc05985d92e))
* allow manual target vdev selection for pool expansion ([5294ddd](https://github.com/ZFS-Manager/ZFS-Manager/commit/5294ddd15c9772cdb572987512376116081081b8))
* auto-mount config per pool, fixed byte scaling, settings tabs, cleanup ([25e00e2](https://github.com/ZFS-Manager/ZFS-Manager/commit/25e00e212ce129e848a5db0cf1a4635792165a45))
* expand startup diagnostics with infrastructure pings and UI contact logging ([05c6496](https://github.com/ZFS-Manager/ZFS-Manager/commit/05c6496c374a3ecb7a24a94071831e87d8a18f91))
* implement persistent stats, capacity growth rate, and comprehensive notifications system ([47fbf99](https://github.com/ZFS-Manager/ZFS-Manager/commit/47fbf99b84cfbd05a17e2501f8ee80c959941dd6))
* implement raidz expansion via zpool attach ([8921a68](https://github.com/ZFS-Manager/ZFS-Manager/commit/8921a68d5241428494b030706962d3d52adeb626))
* improve disk display, add status code view, implement real-time updates ([b3a287c](https://github.com/ZFS-Manager/ZFS-Manager/commit/b3a287cfe594828dbbfa5907a7d7b0a698be7ccb))
* improve disk status and replace display ([7a36f0f](https://github.com/ZFS-Manager/ZFS-Manager/commit/7a36f0f04358b1d742ecf4502c89a361db0c4929))
* initial setup for automatic releases and docker builds ([2330291](https://github.com/ZFS-Manager/ZFS-Manager/commit/2330291c9f4aca63c76e38128ce386454628a881))
* live rewrite speed, popup modal, I/O stats exclusion, and instant page transitions ([0d83a5f](https://github.com/ZFS-Manager/ZFS-Manager/commit/0d83a5fa63f0bfbab3d5507cc4942b2e9015ec99))
* mark system disk in create pool, expand and replace disk selection ([907a640](https://github.com/ZFS-Manager/ZFS-Manager/commit/907a640193547e30a2229f225168f3ce7b63e01f))
* mark system disk in create pool, expand and replace disk selection ([3334503](https://github.com/ZFS-Manager/ZFS-Manager/commit/3334503acdb05065f96375d48c480f43d52fea6a))
* multi-pool selector on dashboard and performance, default pool setting, fix 1h totals, fix disk column shift, fix toast position ([97073be](https://github.com/ZFS-Manager/ZFS-Manager/commit/97073bec0f381d8c8fb709125104f54f4c5f54b6))
* optimize database writes for performance totals ([237d35b](https://github.com/ZFS-Manager/ZFS-Manager/commit/237d35ba6c8750c3f2e250d3dc4d8cff45bcc9c5))
* per-disk totals card, backend+frontend live I/O at 1s ([fecafc4](https://github.com/ZFS-Manager/ZFS-Manager/commit/fecafc49b7cda6941f9b6bf3d8dae8f2f7992e51))
* per-notification mark-read/delete, slide-in page animations with settings toggle, redesign pool settings and datasets UI ([2ad1eb4](https://github.com/ZFS-Manager/ZFS-Manager/commit/2ad1eb441e45f85b28c28ec7827e6cb59165baa8))
* persist performance totals in database ([605a87d](https://github.com/ZFS-Manager/ZFS-Manager/commit/605a87de866dafb8c44e302949bafc225974a103))
* Responsive layout + split IOPS into Read/Write ([294c474](https://github.com/ZFS-Manager/ZFS-Manager/commit/294c474fc9dfbfebbd8ead77fc57035f69afafd6))
* restructure to rust-backend + react-web dashboard, alpine base, configurable compose ([f53030d](https://github.com/ZFS-Manager/ZFS-Manager/commit/f53030ddda9d920224e9e34adecd4237bf8eb8a7))
* **rewrite:** integrate rewrite background task with notification alerts and add compression change warning banners ([cf3621f](https://github.com/ZFS-Manager/ZFS-Manager/commit/cf3621fe7866471075ef5857f0082dacb66d45d9))
* show complete zpool status output with all fields and all disks ([b5089f7](https://github.com/ZFS-Manager/ZFS-Manager/commit/b5089f739b1ff04ddba1f60574cef2221034b77a))
* show expand progress bar identical to scrub progress ([36054e0](https://github.com/ZFS-Manager/ZFS-Manager/commit/36054e021676f7e9e65aeb8e5a02b08677b12f16))
* show RAIDZ expansion progress in dashboard ([1b68234](https://github.com/ZFS-Manager/ZFS-Manager/commit/1b68234808fd14d51d9614a98f87adfbd99da72c))
* **sidebar:** display ZFS-Manager version and update status indicator in footer ([2097247](https://github.com/ZFS-Manager/ZFS-Manager/commit/2097247e51064345b938aef11b40cbf519a4b790))
* toggleable pool features, hot spare activation banner ([23712e9](https://github.com/ZFS-Manager/ZFS-Manager/commit/23712e99c50dc167df7be6b2c9a33a7b11b0ab60))
* trigger release-please workflow for version 1.0.1 ([a56e8c4](https://github.com/ZFS-Manager/ZFS-Manager/commit/a56e8c49b87da58540ffbfe2a391ce2d3a35820a))
* update notify system for better customisable ([b75be91](https://github.com/ZFS-Manager/ZFS-Manager/commit/b75be917f823c05e229a592d4d65e22cdf2232d3))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([8223cb3](https://github.com/ZFS-Manager/ZFS-Manager/commit/8223cb3f44bd18ddb66102249ff18dedeffba7b0))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([e7515f8](https://github.com/ZFS-Manager/ZFS-Manager/commit/e7515f8bfd86a8ea58fcde11a7fab60231cabba5))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([ab4687f](https://github.com/ZFS-Manager/ZFS-Manager/commit/ab4687f5793844f658eb4ffcc2e7006c0fd44330))


### Bug Fixes

* add Redis timeouts and fix performance graph time sync ([8af2908](https://github.com/ZFS-Manager/ZFS-Manager/commit/8af2908b7518bfd9b3c669d5e8982792a7a68b4b))
* auth bypass, responsive sidebar, and enriched stats ([ccbdb7e](https://github.com/ZFS-Manager/ZFS-Manager/commit/ccbdb7e810b042f8cc3cd33bf4777f7b75f2b4bd))
* backend build errors (chrono and executor) ([43e9b36](https://github.com/ZFS-Manager/ZFS-Manager/commit/43e9b3663932050123c96ba9d5ca5ad9e9eabb7c))
* **backend:** add /api/v1 prefix to all notification routes ([3ac73d5](https://github.com/ZFS-Manager/ZFS-Manager/commit/3ac73d53a42daed199a490b8bf755516ec756ea0))
* **backend:** fix remaining Json type inference errors in match arms ([b17fa03](https://github.com/ZFS-Manager/ZFS-Manager/commit/b17fa03db080f7a120cb247662786de621125164))
* **backend:** resolve docker build compilation errors in notifications module ([d056363](https://github.com/ZFS-Manager/ZFS-Manager/commit/d056363ae4b5e6c0e2c584747171fad08c9a5e88))
* background refresh for metric history & prediction cache, clamp rewrite progress and classify events as info ([53e21f5](https://github.com/ZFS-Manager/ZFS-Manager/commit/53e21f5fefe2cb8dea07d7956cc4a6fc995f15ca))
* cache fill-prediction in Redis and add PostgreSQL query timeouts ([a5aacd8](https://github.com/ZFS-Manager/ZFS-Manager/commit/a5aacd87d1229e89cbacfd303e52d2a96e35a836))
* change PostgreSQL sync interval to 5 minutes (300s) and average 1s samples before database insertion ([654bf11](https://github.com/ZFS-Manager/ZFS-Manager/commit/654bf11457ffd782b1fc246be6760b42965940e5))
* chart full domain on load, Redis warm from PostgreSQL on startup, short disk names, load-more for logs/notifications/snapshots, staggered row animations ([b22ca65](https://github.com/ZFS-Manager/ZFS-Manager/commit/b22ca65fb54b73a889dee5c2ce8ea615535a0050))
* clear disk labels after pool destroy, add vdev role selector to expand pool ([e89d627](https://github.com/ZFS-Manager/ZFS-Manager/commit/e89d627efc81c5da573d5bf6bf38fe9c85e0f0bb))
* command timeouts, restore physical telemetry graphs, capacity-based growth rate forecast ([c50d542](https://github.com/ZFS-Manager/ZFS-Manager/commit/c50d5427852c03426cf00fa19dd8219d68fbb105))
* configure release-plz to support unpublished crates ([44c079c](https://github.com/ZFS-Manager/ZFS-Manager/commit/44c079cc110f5915aa42d946c7130c19dcb821ee))
* configure valid release-plz fields for private crate releases ([6e31305](https://github.com/ZFS-Manager/ZFS-Manager/commit/6e313050ba9fce79e8aa143e5a3fc74dc249814e))
* correct CPU jiffies parsing to exclude double-counted guest time and subtract ARC from used RAM ([d88b47a](https://github.com/ZFS-Manager/ZFS-Manager/commit/d88b47a557c089f57829dfefd5d06a1984af8949))
* correct total read/write accumulation and persist all-time counters ([7b9436e](https://github.com/ZFS-Manager/ZFS-Manager/commit/7b9436ebba56f5b9302c43bfff92d3f66750be1d))
* dataset sorting, mount persistence, 1h graph range, dashboard fill prediction ([9fa79db](https://github.com/ZFS-Manager/ZFS-Manager/commit/9fa79dbe8d7e81f10ee776c923fe41abce0f3e45))
* disk in-use detection from zpool only (no cache), simplify expand pool to extend and cache options ([83f88b2](https://github.com/ZFS-Manager/ZFS-Manager/commit/83f88b23c45a1e40c65595b895deba2517bada5f))
* extend chart lines flat to now for all intervals, fix 1y axis direction, pool capacity flat extension, strip partition suffix only when unambiguous ([43f0dcb](https://github.com/ZFS-Manager/ZFS-Manager/commit/43f0dcb7ca3ee36f24ab9dd15a8e1ca2b33632fe))
* implement graceful shutdown for web and backend containers ([f15c68e](https://github.com/ZFS-Manager/ZFS-Manager/commit/f15c68eea53e8f184c0211b8d8419977400f6ed9))
* implement redis caching, pre-warming, and prevent chart skeleton flashing ([52b2aaa](https://github.com/ZFS-Manager/ZFS-Manager/commit/52b2aaadc3644f93dbd142af26e8c9ce5a827820))
* improve startup log message for version 1.0.1 ([dbfdf62](https://github.com/ZFS-Manager/ZFS-Manager/commit/dbfdf62221d26cec59c51c5c54951ef41c86bcf5))
* include vdev name in pool_vdevs API response for correct zpool attach target ([678cac9](https://github.com/ZFS-Manager/ZFS-Manager/commit/678cac9efb44bc21b52410312e8e39884c1ea85e))
* internal run -&gt; command in executor.rs ([e6bb330](https://github.com/ZFS-Manager/ZFS-Manager/commit/e6bb3302afd44806d1449751f0be09ea6b756afb))
* invalidate disk and pool cache after destroy, disks show as free immediately ([2b8b780](https://github.com/ZFS-Manager/ZFS-Manager/commit/2b8b7802a2a1cd921134e977eef7183982bee886))
* labelclear disks after pool destroy, invalidate cache, re-fetch disk list in frontend ([9c50828](https://github.com/ZFS-Manager/ZFS-Manager/commit/9c50828607f8907b61c2ba442ccb19cef87a81bb))
* live total read/write updates every 1s, remove redundant fetches, add disk card to dashboard ([c8210a8](https://github.com/ZFS-Manager/ZFS-Manager/commit/c8210a8389e6632585c34b0c696afcbc93af748a))
* make worker batch params Send to satisfy tokio::spawn bound ([48f94a5](https://github.com/ZFS-Manager/ZFS-Manager/commit/48f94a553004d111b889cb6d5c8c4dd23ab3e4d1))
* mount propagation, SMART status, dataset destroy, spare/cache display ([2929c6a](https://github.com/ZFS-Manager/ZFS-Manager/commit/2929c6aa9bab93ad3152379674e394d7129cb996))
* move pool search to features modal, fix resilver toast, rewrite blocks with find+dd ([fd64dfb](https://github.com/ZFS-Manager/ZFS-Manager/commit/fd64dfb14c6ce4455655a0081fd43e9bd64cd420))
* notifications threshold eval, per-disk live totals, RAID-aware pool size, audit redundant DB calls ([74c0f2e](https://github.com/ZFS-Manager/ZFS-Manager/commit/74c0f2ede78d634b8aca8efcf17f31e35b69cb41))
* password change now invalidates old password and all sessions ([96e7a54](https://github.com/ZFS-Manager/ZFS-Manager/commit/96e7a54d4216f64c433df2f31e95bfb43384f7da))
* per-disk totals update live, pool capacity uses correct RAID-aware size ([b09cf6e](https://github.com/ZFS-Manager/ZFS-Manager/commit/b09cf6ea9530d4b4ad85c33dd166af44ad9b1d0a))
* Performance tab - Live I/O labels, faster refresh, and dynamic capacity forecast ([b1610d6](https://github.com/ZFS-Manager/ZFS-Manager/commit/b1610d6441d569de8de9b9d2e2e5ff248148223d))
* persist disk totals across restarts, strip partition suffix, SCSI names in storage pools, charts fill full time window, pool capacity flat-line extension, brighter grid, unified disk card ([f310773](https://github.com/ZFS-Manager/ZFS-Manager/commit/f3107738fce73a04c7a834e7e0fdbaad464f0c70))
* pool capacity uses zpool list RAID-aware size, per-disk totals from kstat cumulative counters ([4b1105b](https://github.com/ZFS-Manager/ZFS-Manager/commit/4b1105be736147d981a07ec935e07d0ae013277c))
* pre-warm 7d, 1m, and 1y history intervals in background worker, trigger loading capacity indicators immediately ([15673db](https://github.com/ZFS-Manager/ZFS-Manager/commit/15673db0fbea8c1f780dae95f849253edbf34ee2))
* raidz expand vdev, inline disk pickers, pool badges, destroy pool dialog, dataset/snapshot pool dividers, default pool persistence, pool selector pills ([0d04add](https://github.com/ZFS-Manager/ZFS-Manager/commit/0d04add5302d85f9b45be89341b6d47a25e98002))
* remove publish=false to allow release-plz processing ([e1b96bf](https://github.com/ZFS-Manager/ZFS-Manager/commit/e1b96bfce6a5dd0dfec3c5d17d76ecd8e73acf10))
* remove zfs rewrite, fix raidz expansion 405, add pool search, global byte scaling, pool import UI ([f30096a](https://github.com/ZFS-Manager/ZFS-Manager/commit/f30096ab4b63a6d5fa91f7df93acd074374cd27e))
* resilver uses zpool resilver via nsenter, restore scrub btn, live badge right ([32bc527](https://github.com/ZFS-Manager/ZFS-Manager/commit/32bc52703e4edce9737f6272e630f4375a121222))
* resolve merge conflicts in main.rs ([efa1feb](https://github.com/ZFS-Manager/ZFS-Manager/commit/efa1feb2bf6e8ecc62a80163f5cbc3eecd4d25e0))
* resolve query pileup with dedicated sequential cache warming loop, add ascending index, and build beautiful startup screen for pending checks ([1e238a1](https://github.com/ZFS-Manager/ZFS-Manager/commit/1e238a1a2352734935e546ec49b247b80b65754e))
* resolve ToSql type mismatch in worker.rs and unused variable warning ([3e52ffa](https://github.com/ZFS-Manager/ZFS-Manager/commit/3e52ffa01c7f3a243af0842ebb4f460b34930240))
* resolve zpool status scrub parsing ([d417bf4](https://github.com/ZFS-Manager/ZFS-Manager/commit/d417bf41ba35df8bb3bc2fe07ef211328514c6f8))
* resolve zpool status scrub parsing ([fd6e89b](https://github.com/ZFS-Manager/ZFS-Manager/commit/fd6e89b6dc34127573be7447601b91724c4dc875))
* restore 100% clamping capacity, track live rewrite speed_bps, and consolidate cache queries ([d9b3552](https://github.com/ZFS-Manager/ZFS-Manager/commit/d9b3552477d34911fdae066c28757829ca8af39e))
* revert chart labels, 500ms live updates, fix all-time total accumulation ([22c7b03](https://github.com/ZFS-Manager/ZFS-Manager/commit/22c7b03f7bc6bdb5f4fe2865ca7191183263e8fd))
* scrub, performance values, delete error handling + README ([901af99](https://github.com/ZFS-Manager/ZFS-Manager/commit/901af9905502aeef0241b8250bc2475183dbb3be))
* security and code quality audit fixes ([845b323](https://github.com/ZFS-Manager/ZFS-Manager/commit/845b32316b6eecd9236eceb4394eeeceab23ba18))
* set publish to false again ([de356bf](https://github.com/ZFS-Manager/ZFS-Manager/commit/de356bf2b4bf7c77ffdb06e662c3d1f3459c376f))
* show dataset rewrite success message as success not error ([e3ae034](https://github.com/ZFS-Manager/ZFS-Manager/commit/e3ae0347c2e3cac783850ffd4111155b8e33b754))
* **stats:** read ZFS version from sysfs or kmod line to display true host version ([6c8c3db](https://github.com/ZFS-Manager/ZFS-Manager/commit/6c8c3db60c9d64b0abdbc65514ca5e756690854b))
* throughput time windows, per-disk totals, unified live I/O source, correct pool free size, notification buttons, empty volume init ([a541444](https://github.com/ZFS-Manager/ZFS-Manager/commit/a5414440a80f3e48948ecc61f2e700c33d26b7e7))
* trigger new release 1.0.1 ([2d3aa78](https://github.com/ZFS-Manager/ZFS-Manager/commit/2d3aa78c1fb6d1505fdfc694cefe44607a02b052))
* trigger new release for version 1.0.1 ([4721782](https://github.com/ZFS-Manager/ZFS-Manager/commit/472178202baebf766615686df6f803280e9c66f4))
* upgrade release-plz to v0.5.131 and enable git_only mode ([1fbad17](https://github.com/ZFS-Manager/ZFS-Manager/commit/1fbad17e93e33cae7387ad2501cecff1623e405a))
* use [[package]] in release-plz.toml with publish=false in Cargo.toml ([aefec7a](https://github.com/ZFS-Manager/ZFS-Manager/commit/aefec7a95e90f171eab2bf9a282ac67f421cf2a3))
* use dataset name for rewrite nsenter call and truncate error toast ([0f79d6d](https://github.com/ZFS-Manager/ZFS-Manager/commit/0f79d6dfb5ab7864a6feaf6c73f981f02d01dc73))
* use host ZFS tools via nsenter for raidz_expansion feature read/write ([2c4d7d7](https://github.com/ZFS-Manager/ZFS-Manager/commit/2c4d7d7495ec6b9c67f03ba2e09af6b5c4325d7f))
* use nsenter host mount namespace for system disk detection ([7ab7066](https://github.com/ZFS-Manager/ZFS-Manager/commit/7ab7066307eb67768e14905cf28064deb0db3449))

## [1.1.0](https://github.com/ZFS-Manager/ZFS-Manager/compare/zfs-manager-v1.0.0...zfs-manager-v1.1.0) (2026-07-27)


### Features

* 100ms real-time live I/O via two-tier tick, add per-disk speed and IOPS card ([a25434e](https://github.com/ZFS-Manager/ZFS-Manager/commit/a25434ee8586bac2477b7d2e492179320beaa689))
* add /api/v1/disks endpoint and DiskPicker UI component ([8605a71](https://github.com/ZFS-Manager/ZFS-Manager/commit/8605a715bb6c42dadac621ac90df76f6f53d52ab))
* add automated pool scrub scheduling ([28b902a](https://github.com/ZFS-Manager/ZFS-Manager/commit/28b902a99b075a6e0a8e30fc3a80c1fb2f9c0dd8))
* add automated pool scrub scheduling ([c07b41d](https://github.com/ZFS-Manager/ZFS-Manager/commit/c07b41d5c0b239fb175f1d691ca2fa82d05aeae5))
* add detailed ARC diagnostics and fix build dependencies ([376132d](https://github.com/ZFS-Manager/ZFS-Manager/commit/376132d5717ffdb9a77713d1d9138f46d7bc2159))
* add raidz_expansion feature toggle in pool settings ([e79f86a](https://github.com/ZFS-Manager/ZFS-Manager/commit/e79f86aca4738247ccfbc3cda75c3dd13238ad04))
* add resilver progress bar with time remaining ([10680b3](https://github.com/ZFS-Manager/ZFS-Manager/commit/10680b367c4d918677f158a989626be1aace9000))
* add rewrite progress bar identical to scrub progress ([36a29b0](https://github.com/ZFS-Manager/ZFS-Manager/commit/36a29b06b84268272feede52b49aa377d7042756))
* add startup diagnostic checks to backend ([ae3c941](https://github.com/ZFS-Manager/ZFS-Manager/commit/ae3c9412399d9e54b3393ce175d2e1cb5330042d))
* add test button to notifications ([ec8ca3c](https://github.com/ZFS-Manager/ZFS-Manager/commit/ec8ca3c805f0ff74917e53137c6349147a09001b))
* all pool features in modal, fragmentation info tooltip ([e518f85](https://github.com/ZFS-Manager/ZFS-Manager/commit/e518f853346a6a43ace3d23358315cc05985d92e))
* allow manual target vdev selection for pool expansion ([5294ddd](https://github.com/ZFS-Manager/ZFS-Manager/commit/5294ddd15c9772cdb572987512376116081081b8))
* auto-mount config per pool, fixed byte scaling, settings tabs, cleanup ([25e00e2](https://github.com/ZFS-Manager/ZFS-Manager/commit/25e00e212ce129e848a5db0cf1a4635792165a45))
* expand startup diagnostics with infrastructure pings and UI contact logging ([05c6496](https://github.com/ZFS-Manager/ZFS-Manager/commit/05c6496c374a3ecb7a24a94071831e87d8a18f91))
* implement persistent stats, capacity growth rate, and comprehensive notifications system ([47fbf99](https://github.com/ZFS-Manager/ZFS-Manager/commit/47fbf99b84cfbd05a17e2501f8ee80c959941dd6))
* implement raidz expansion via zpool attach ([8921a68](https://github.com/ZFS-Manager/ZFS-Manager/commit/8921a68d5241428494b030706962d3d52adeb626))
* improve disk display, add status code view, implement real-time updates ([b3a287c](https://github.com/ZFS-Manager/ZFS-Manager/commit/b3a287cfe594828dbbfa5907a7d7b0a698be7ccb))
* improve disk status and replace display ([7a36f0f](https://github.com/ZFS-Manager/ZFS-Manager/commit/7a36f0f04358b1d742ecf4502c89a361db0c4929))
* initial setup for automatic releases and docker builds ([2330291](https://github.com/ZFS-Manager/ZFS-Manager/commit/2330291c9f4aca63c76e38128ce386454628a881))
* live rewrite speed, popup modal, I/O stats exclusion, and instant page transitions ([0d83a5f](https://github.com/ZFS-Manager/ZFS-Manager/commit/0d83a5fa63f0bfbab3d5507cc4942b2e9015ec99))
* mark system disk in create pool, expand and replace disk selection ([907a640](https://github.com/ZFS-Manager/ZFS-Manager/commit/907a640193547e30a2229f225168f3ce7b63e01f))
* mark system disk in create pool, expand and replace disk selection ([3334503](https://github.com/ZFS-Manager/ZFS-Manager/commit/3334503acdb05065f96375d48c480f43d52fea6a))
* multi-pool selector on dashboard and performance, default pool setting, fix 1h totals, fix disk column shift, fix toast position ([97073be](https://github.com/ZFS-Manager/ZFS-Manager/commit/97073bec0f381d8c8fb709125104f54f4c5f54b6))
* optimize database writes for performance totals ([237d35b](https://github.com/ZFS-Manager/ZFS-Manager/commit/237d35ba6c8750c3f2e250d3dc4d8cff45bcc9c5))
* per-disk totals card, backend+frontend live I/O at 1s ([fecafc4](https://github.com/ZFS-Manager/ZFS-Manager/commit/fecafc49b7cda6941f9b6bf3d8dae8f2f7992e51))
* per-notification mark-read/delete, slide-in page animations with settings toggle, redesign pool settings and datasets UI ([2ad1eb4](https://github.com/ZFS-Manager/ZFS-Manager/commit/2ad1eb441e45f85b28c28ec7827e6cb59165baa8))
* persist performance totals in database ([605a87d](https://github.com/ZFS-Manager/ZFS-Manager/commit/605a87de866dafb8c44e302949bafc225974a103))
* Responsive layout + split IOPS into Read/Write ([294c474](https://github.com/ZFS-Manager/ZFS-Manager/commit/294c474fc9dfbfebbd8ead77fc57035f69afafd6))
* restructure to rust-backend + react-web dashboard, alpine base, configurable compose ([f53030d](https://github.com/ZFS-Manager/ZFS-Manager/commit/f53030ddda9d920224e9e34adecd4237bf8eb8a7))
* **rewrite:** integrate rewrite background task with notification alerts and add compression change warning banners ([cf3621f](https://github.com/ZFS-Manager/ZFS-Manager/commit/cf3621fe7866471075ef5857f0082dacb66d45d9))
* show complete zpool status output with all fields and all disks ([b5089f7](https://github.com/ZFS-Manager/ZFS-Manager/commit/b5089f739b1ff04ddba1f60574cef2221034b77a))
* show expand progress bar identical to scrub progress ([36054e0](https://github.com/ZFS-Manager/ZFS-Manager/commit/36054e021676f7e9e65aeb8e5a02b08677b12f16))
* show RAIDZ expansion progress in dashboard ([1b68234](https://github.com/ZFS-Manager/ZFS-Manager/commit/1b68234808fd14d51d9614a98f87adfbd99da72c))
* **sidebar:** display ZFS-Manager version and update status indicator in footer ([2097247](https://github.com/ZFS-Manager/ZFS-Manager/commit/2097247e51064345b938aef11b40cbf519a4b790))
* toggleable pool features, hot spare activation banner ([23712e9](https://github.com/ZFS-Manager/ZFS-Manager/commit/23712e99c50dc167df7be6b2c9a33a7b11b0ab60))
* trigger release-please workflow for version 1.0.1 ([a56e8c4](https://github.com/ZFS-Manager/ZFS-Manager/commit/a56e8c49b87da58540ffbfe2a391ce2d3a35820a))
* update notify system for better customisable ([b75be91](https://github.com/ZFS-Manager/ZFS-Manager/commit/b75be917f823c05e229a592d4d65e22cdf2232d3))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([8223cb3](https://github.com/ZFS-Manager/ZFS-Manager/commit/8223cb3f44bd18ddb66102249ff18dedeffba7b0))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([e7515f8](https://github.com/ZFS-Manager/ZFS-Manager/commit/e7515f8bfd86a8ea58fcde11a7fab60231cabba5))
* **zfs:** implement native zfs rewrite and optimize scrub progress UI ([ab4687f](https://github.com/ZFS-Manager/ZFS-Manager/commit/ab4687f5793844f658eb4ffcc2e7006c0fd44330))


### Bug Fixes

* add Redis timeouts and fix performance graph time sync ([8af2908](https://github.com/ZFS-Manager/ZFS-Manager/commit/8af2908b7518bfd9b3c669d5e8982792a7a68b4b))
* auth bypass, responsive sidebar, and enriched stats ([ccbdb7e](https://github.com/ZFS-Manager/ZFS-Manager/commit/ccbdb7e810b042f8cc3cd33bf4777f7b75f2b4bd))
* backend build errors (chrono and executor) ([43e9b36](https://github.com/ZFS-Manager/ZFS-Manager/commit/43e9b3663932050123c96ba9d5ca5ad9e9eabb7c))
* **backend:** add /api/v1 prefix to all notification routes ([3ac73d5](https://github.com/ZFS-Manager/ZFS-Manager/commit/3ac73d53a42daed199a490b8bf755516ec756ea0))
* **backend:** fix remaining Json type inference errors in match arms ([b17fa03](https://github.com/ZFS-Manager/ZFS-Manager/commit/b17fa03db080f7a120cb247662786de621125164))
* **backend:** resolve docker build compilation errors in notifications module ([d056363](https://github.com/ZFS-Manager/ZFS-Manager/commit/d056363ae4b5e6c0e2c584747171fad08c9a5e88))
* background refresh for metric history & prediction cache, clamp rewrite progress and classify events as info ([53e21f5](https://github.com/ZFS-Manager/ZFS-Manager/commit/53e21f5fefe2cb8dea07d7956cc4a6fc995f15ca))
* cache fill-prediction in Redis and add PostgreSQL query timeouts ([a5aacd8](https://github.com/ZFS-Manager/ZFS-Manager/commit/a5aacd87d1229e89cbacfd303e52d2a96e35a836))
* change PostgreSQL sync interval to 5 minutes (300s) and average 1s samples before database insertion ([654bf11](https://github.com/ZFS-Manager/ZFS-Manager/commit/654bf11457ffd782b1fc246be6760b42965940e5))
* chart full domain on load, Redis warm from PostgreSQL on startup, short disk names, load-more for logs/notifications/snapshots, staggered row animations ([b22ca65](https://github.com/ZFS-Manager/ZFS-Manager/commit/b22ca65fb54b73a889dee5c2ce8ea615535a0050))
* clear disk labels after pool destroy, add vdev role selector to expand pool ([e89d627](https://github.com/ZFS-Manager/ZFS-Manager/commit/e89d627efc81c5da573d5bf6bf38fe9c85e0f0bb))
* command timeouts, restore physical telemetry graphs, capacity-based growth rate forecast ([c50d542](https://github.com/ZFS-Manager/ZFS-Manager/commit/c50d5427852c03426cf00fa19dd8219d68fbb105))
* configure release-plz to support unpublished crates ([44c079c](https://github.com/ZFS-Manager/ZFS-Manager/commit/44c079cc110f5915aa42d946c7130c19dcb821ee))
* configure valid release-plz fields for private crate releases ([6e31305](https://github.com/ZFS-Manager/ZFS-Manager/commit/6e313050ba9fce79e8aa143e5a3fc74dc249814e))
* correct CPU jiffies parsing to exclude double-counted guest time and subtract ARC from used RAM ([d88b47a](https://github.com/ZFS-Manager/ZFS-Manager/commit/d88b47a557c089f57829dfefd5d06a1984af8949))
* correct total read/write accumulation and persist all-time counters ([7b9436e](https://github.com/ZFS-Manager/ZFS-Manager/commit/7b9436ebba56f5b9302c43bfff92d3f66750be1d))
* dataset sorting, mount persistence, 1h graph range, dashboard fill prediction ([9fa79db](https://github.com/ZFS-Manager/ZFS-Manager/commit/9fa79dbe8d7e81f10ee776c923fe41abce0f3e45))
* disk in-use detection from zpool only (no cache), simplify expand pool to extend and cache options ([83f88b2](https://github.com/ZFS-Manager/ZFS-Manager/commit/83f88b23c45a1e40c65595b895deba2517bada5f))
* extend chart lines flat to now for all intervals, fix 1y axis direction, pool capacity flat extension, strip partition suffix only when unambiguous ([43f0dcb](https://github.com/ZFS-Manager/ZFS-Manager/commit/43f0dcb7ca3ee36f24ab9dd15a8e1ca2b33632fe))
* implement graceful shutdown for web and backend containers ([f15c68e](https://github.com/ZFS-Manager/ZFS-Manager/commit/f15c68eea53e8f184c0211b8d8419977400f6ed9))
* implement redis caching, pre-warming, and prevent chart skeleton flashing ([52b2aaa](https://github.com/ZFS-Manager/ZFS-Manager/commit/52b2aaadc3644f93dbd142af26e8c9ce5a827820))
* improve startup log message for version 1.0.1 ([dbfdf62](https://github.com/ZFS-Manager/ZFS-Manager/commit/dbfdf62221d26cec59c51c5c54951ef41c86bcf5))
* include vdev name in pool_vdevs API response for correct zpool attach target ([678cac9](https://github.com/ZFS-Manager/ZFS-Manager/commit/678cac9efb44bc21b52410312e8e39884c1ea85e))
* internal run -&gt; command in executor.rs ([e6bb330](https://github.com/ZFS-Manager/ZFS-Manager/commit/e6bb3302afd44806d1449751f0be09ea6b756afb))
* invalidate disk and pool cache after destroy, disks show as free immediately ([2b8b780](https://github.com/ZFS-Manager/ZFS-Manager/commit/2b8b7802a2a1cd921134e977eef7183982bee886))
* labelclear disks after pool destroy, invalidate cache, re-fetch disk list in frontend ([9c50828](https://github.com/ZFS-Manager/ZFS-Manager/commit/9c50828607f8907b61c2ba442ccb19cef87a81bb))
* live total read/write updates every 1s, remove redundant fetches, add disk card to dashboard ([c8210a8](https://github.com/ZFS-Manager/ZFS-Manager/commit/c8210a8389e6632585c34b0c696afcbc93af748a))
* make worker batch params Send to satisfy tokio::spawn bound ([48f94a5](https://github.com/ZFS-Manager/ZFS-Manager/commit/48f94a553004d111b889cb6d5c8c4dd23ab3e4d1))
* mount propagation, SMART status, dataset destroy, spare/cache display ([2929c6a](https://github.com/ZFS-Manager/ZFS-Manager/commit/2929c6aa9bab93ad3152379674e394d7129cb996))
* move pool search to features modal, fix resilver toast, rewrite blocks with find+dd ([fd64dfb](https://github.com/ZFS-Manager/ZFS-Manager/commit/fd64dfb14c6ce4455655a0081fd43e9bd64cd420))
* notifications threshold eval, per-disk live totals, RAID-aware pool size, audit redundant DB calls ([74c0f2e](https://github.com/ZFS-Manager/ZFS-Manager/commit/74c0f2ede78d634b8aca8efcf17f31e35b69cb41))
* password change now invalidates old password and all sessions ([96e7a54](https://github.com/ZFS-Manager/ZFS-Manager/commit/96e7a54d4216f64c433df2f31e95bfb43384f7da))
* per-disk totals update live, pool capacity uses correct RAID-aware size ([b09cf6e](https://github.com/ZFS-Manager/ZFS-Manager/commit/b09cf6ea9530d4b4ad85c33dd166af44ad9b1d0a))
* Performance tab - Live I/O labels, faster refresh, and dynamic capacity forecast ([b1610d6](https://github.com/ZFS-Manager/ZFS-Manager/commit/b1610d6441d569de8de9b9d2e2e5ff248148223d))
* persist disk totals across restarts, strip partition suffix, SCSI names in storage pools, charts fill full time window, pool capacity flat-line extension, brighter grid, unified disk card ([f310773](https://github.com/ZFS-Manager/ZFS-Manager/commit/f3107738fce73a04c7a834e7e0fdbaad464f0c70))
* pool capacity uses zpool list RAID-aware size, per-disk totals from kstat cumulative counters ([4b1105b](https://github.com/ZFS-Manager/ZFS-Manager/commit/4b1105be736147d981a07ec935e07d0ae013277c))
* pre-warm 7d, 1m, and 1y history intervals in background worker, trigger loading capacity indicators immediately ([15673db](https://github.com/ZFS-Manager/ZFS-Manager/commit/15673db0fbea8c1f780dae95f849253edbf34ee2))
* raidz expand vdev, inline disk pickers, pool badges, destroy pool dialog, dataset/snapshot pool dividers, default pool persistence, pool selector pills ([0d04add](https://github.com/ZFS-Manager/ZFS-Manager/commit/0d04add5302d85f9b45be89341b6d47a25e98002))
* remove publish=false to allow release-plz processing ([e1b96bf](https://github.com/ZFS-Manager/ZFS-Manager/commit/e1b96bfce6a5dd0dfec3c5d17d76ecd8e73acf10))
* remove zfs rewrite, fix raidz expansion 405, add pool search, global byte scaling, pool import UI ([f30096a](https://github.com/ZFS-Manager/ZFS-Manager/commit/f30096ab4b63a6d5fa91f7df93acd074374cd27e))
* resilver uses zpool resilver via nsenter, restore scrub btn, live badge right ([32bc527](https://github.com/ZFS-Manager/ZFS-Manager/commit/32bc52703e4edce9737f6272e630f4375a121222))
* resolve merge conflicts in main.rs ([efa1feb](https://github.com/ZFS-Manager/ZFS-Manager/commit/efa1feb2bf6e8ecc62a80163f5cbc3eecd4d25e0))
* resolve query pileup with dedicated sequential cache warming loop, add ascending index, and build beautiful startup screen for pending checks ([1e238a1](https://github.com/ZFS-Manager/ZFS-Manager/commit/1e238a1a2352734935e546ec49b247b80b65754e))
* resolve ToSql type mismatch in worker.rs and unused variable warning ([3e52ffa](https://github.com/ZFS-Manager/ZFS-Manager/commit/3e52ffa01c7f3a243af0842ebb4f460b34930240))
* resolve zpool status scrub parsing ([d417bf4](https://github.com/ZFS-Manager/ZFS-Manager/commit/d417bf41ba35df8bb3bc2fe07ef211328514c6f8))
* resolve zpool status scrub parsing ([fd6e89b](https://github.com/ZFS-Manager/ZFS-Manager/commit/fd6e89b6dc34127573be7447601b91724c4dc875))
* restore 100% clamping capacity, track live rewrite speed_bps, and consolidate cache queries ([d9b3552](https://github.com/ZFS-Manager/ZFS-Manager/commit/d9b3552477d34911fdae066c28757829ca8af39e))
* revert chart labels, 500ms live updates, fix all-time total accumulation ([22c7b03](https://github.com/ZFS-Manager/ZFS-Manager/commit/22c7b03f7bc6bdb5f4fe2865ca7191183263e8fd))
* scrub, performance values, delete error handling + README ([901af99](https://github.com/ZFS-Manager/ZFS-Manager/commit/901af9905502aeef0241b8250bc2475183dbb3be))
* security and code quality audit fixes ([845b323](https://github.com/ZFS-Manager/ZFS-Manager/commit/845b32316b6eecd9236eceb4394eeeceab23ba18))
* set publish to false again ([de356bf](https://github.com/ZFS-Manager/ZFS-Manager/commit/de356bf2b4bf7c77ffdb06e662c3d1f3459c376f))
* show dataset rewrite success message as success not error ([e3ae034](https://github.com/ZFS-Manager/ZFS-Manager/commit/e3ae0347c2e3cac783850ffd4111155b8e33b754))
* **stats:** read ZFS version from sysfs or kmod line to display true host version ([6c8c3db](https://github.com/ZFS-Manager/ZFS-Manager/commit/6c8c3db60c9d64b0abdbc65514ca5e756690854b))
* throughput time windows, per-disk totals, unified live I/O source, correct pool free size, notification buttons, empty volume init ([a541444](https://github.com/ZFS-Manager/ZFS-Manager/commit/a5414440a80f3e48948ecc61f2e700c33d26b7e7))
* trigger new release 1.0.1 ([2d3aa78](https://github.com/ZFS-Manager/ZFS-Manager/commit/2d3aa78c1fb6d1505fdfc694cefe44607a02b052))
* trigger new release for version 1.0.1 ([4721782](https://github.com/ZFS-Manager/ZFS-Manager/commit/472178202baebf766615686df6f803280e9c66f4))
* upgrade release-plz to v0.5.131 and enable git_only mode ([1fbad17](https://github.com/ZFS-Manager/ZFS-Manager/commit/1fbad17e93e33cae7387ad2501cecff1623e405a))
* use [[package]] in release-plz.toml with publish=false in Cargo.toml ([aefec7a](https://github.com/ZFS-Manager/ZFS-Manager/commit/aefec7a95e90f171eab2bf9a282ac67f421cf2a3))
* use dataset name for rewrite nsenter call and truncate error toast ([0f79d6d](https://github.com/ZFS-Manager/ZFS-Manager/commit/0f79d6dfb5ab7864a6feaf6c73f981f02d01dc73))
* use host ZFS tools via nsenter for raidz_expansion feature read/write ([2c4d7d7](https://github.com/ZFS-Manager/ZFS-Manager/commit/2c4d7d7495ec6b9c67f03ba2e09af6b5c4325d7f))
* use nsenter host mount namespace for system disk detection ([7ab7066](https://github.com/ZFS-Manager/ZFS-Manager/commit/7ab7066307eb67768e14905cf28064deb0db3449))

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
