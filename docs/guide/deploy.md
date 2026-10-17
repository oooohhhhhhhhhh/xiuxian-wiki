# 生产部署与运维

本页讲**已经在跑之后**的事：部署形态怎么选、怎么升级、怎么备份、日志在哪、
后台有哪些定时任务在动数据，以及出问题先看哪里。
安装见[安装与首次启动](/guide/install)，配置项含义见[配置详解](/guide/config)。

## 生产环境建议

### JDK 与启动方式

| 项目 | 建议 |
| --- | --- |
| 运行时 | **Java 23 或更高**（`maven.compiler.release=23`），低版本直接 `UnsupportedClassVersionError` |
| Maven | 仅构建机需要（3.8+），生产机不需要 |
| 启动方式 | `--nogui` + 进程守护（systemd / Windows 服务 / 容器）；交互模式会等回车，不适合守护进程 |
| 工作目录 | **必须**设为 jar 所在目录 |

```bash
cd /opt/xiuxian
java -Xms512m -Xmx2g -Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8 \
     -jar main-0.1.0.jar --nogui
```

::: danger 工作目录 ≠ JAR 目录会踩大坑
`xiuxian.db`、`config/`、`data/`、`log/`、`plugins/` 全是**相对路径**，
相对的是**进程工作目录**。启动日志会打印实际取值并在不一致时告警：

```
=== 部署路径 ===
JAR 目录: /opt/xiuxian
工作目录: /root
[WARN] 工作目录与 JAR 目录不一致：config/adapters.json、数据库文件、data/、log/、plugins/ 等相对路径会落在工作目录（/root）。
```

systemd 部署请显式指定 `WorkingDirectory=/opt/xiuxian`。
:::

### 内存

| 场景 | 建议堆 | 说明 |
| --- | --- | --- |
| 小内存 VPS（1–2 GB） | `-Xmx256m` ~ `-Xmx512m` | 配合 `performance.low_memory: true`；`start-low-memory.bat` 用 `-Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m` |
| 常规生产 | `-Xms512m -Xmx2g` | `start.sh` 默认 `-Xms128m -Xmx512m` |
| 玩家 / 挂单较多 | `-Xmx2g` 以上 | 主要吃在 Grizzly 线程栈与 HikariCP 连接 |
| 线程与缓存 | `performance.*` | `grizzly_io_threads`（默认 2）、`grizzly_worker_cores`（4）、`grizzly_worker_max`（8）、`memory_log_entries`（默认 200） |

### 监听地址与反向代理

`server.host` 默认 `127.0.0.1`，外网访问不到。生产推荐**反向代理 + TLS**：转发到
`http://127.0.0.1:8080`，并对 WebSocket 透传升级头（`proxy_http_version 1.1`、
`Upgrade: $http_upgrade`、`Connection: "upgrade"`）。

若直接绑定 `0.0.0.0`，必须同时改掉默认管理员凭据（模板哈希对应明文 `admin123`）
并配置固定的 `jwt.secret`，否则启动时会打印：

```
[Main] ⚠ 严重安全警告: 服务绑定到公网 (0.0.0.0) 但 admin 凭据未配置或仍为默认！
```

另外 `/install/*` 的配置写入与重置端点默认只允许本机调用
（`install.allow_remote: true` 可显式放行）。

### SQLite 还是 MySQL

| 维度 | SQLite（默认） | MySQL |
| --- | --- | --- |
| 部署成本 | 零依赖，一个文件 | 需独立服务、账号、备份方案 |
| 并发 | 单写者模型，写入串行 | 真并发写 |
| 适用规模 | 单机、中小玩家量 | 多实例 / 高并发 / 需外部分析工具 |
| 连接池 | `database.pool_max` 被夹到 2–8（代码强制 `min(8, max(2, pool_max))`） | 建议 8–32 |
| 备份 | 拷 `xiuxian.db`（注意 WAL 侧车文件） | `mysqldump` |

SQLite 路径已经做过并发调优：`SQLiteDialect.initConnection()` 在每条连接上设置
`PRAGMA foreign_keys = ON`、`PRAGMA busy_timeout = 5000`（写锁等 5 秒）、
`PRAGMA journal_mode = WAL`（读写不互斥），单机中小规模是官方推荐路径。

## systemd / Docker 部署

仓库自带一套可直接落地的守护与容器文件，路径解析都对齐了 `Main.reportDeploymentPaths()`
的「jar 目录 / 工作目录」规则：

| 文件 | 用途 |
| --- | --- |
| `deploy/xiuxian-server.service` | systemd 服务单元（含安全加固与自动拉起） |
| `Dockerfile` | 容器镜像（Maven wrapper 构建 + 运行时镜像） |
| `docker-compose.yml` | Compose 编排（命名卷持久化 + 健康检查） |
| `docker/entrypoint.sh` | 容器入口（把镜像内 jar 同步到 `/app` 再启动） |

### systemd（推荐 Linux 物理机/VM）

```bash
# 建用户与目录
useradd --system --create-home --shell /usr/sbin/nologin xiuxian
install -d -o xiuxian -g xiuxian /opt/xiuxian-server

# 放入 jar，并建一个不带版本号的软链接方便升级
cp target/main-0.1.0.jar /opt/xiuxian-server/
ln -sfn main-0.1.0.jar /opt/xiuxian-server/main.jar
chown -R xiuxian:xiuxian /opt/xiuxian-server

# 装单元并启动
cp deploy/xiuxian-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now xiuxian-server

# 看日志 / 看状态
journalctl -u xiuxian-server -f
systemctl status xiuxian-server
```

单元文件的几个关键点：

- `WorkingDirectory=/opt/xiuxian-server`（== jar 目录），两套路径基准才一致；
- `Environment=JAVA_OPTS=-Xmx512m -XX:MaxMetaspaceSize=256m -Xss1m`，小内存默认保守，
  可用 `EnvironmentFile=-/etc/xiuxian-server.env` 覆盖；
- `Restart=on-failure` + `RestartSec=5s`，崩溃/OOM 自动拉起；
- `KillSignal=SIGTERM` + `TimeoutStopSec=120`，优雅停服（落盘玩家数据、关连接池）；
- `ProtectSystem=strict` 但显式 `ReadWritePaths=/opt/xiuxian-server` 放开 `config/ data/ log/ plugins/` 与 `xiuxian.db`。

升级 = 上传新 `main-<版本>.jar` → `ln -sfn` 指到它 → `chown` → `systemctl restart`。
回滚只需把软链接指回旧 jar 再 restart。

### Docker / Compose

```bash
docker build -t xiuxian-server .
docker compose up -d        # 首次启动后打开 http://127.0.0.1:8080/install 完成安装向导
docker compose logs -f
docker compose down          # 停，保留数据卷
docker compose down -v       # 停并删除数据（慎用）
```

Compose 的要点：

- 命名卷 `xiuxian-state:/app` 挂住整个 `/app`，`config/ data/ log/ plugins/ xiuxian.db` 全部持久化，
  jar 会随镜像自动更新、不会残留在卷里（`entrypoint.sh` 每次启动把镜像内 jar 覆盖复制到 `/app/main.jar`）；
- 健康检查探 `GET /api/game/status`（401 = 正常就绪，连接被拒才判失败）；
- 安装向导提交后会重启容器一次，属正常现象；
- 若改了 `server.port`，要同步改 `XIUXIAN_PORT` 与 `docker-compose.yml` 的端口映射；
- 改用 MySQL 时，镜像内服务端只从 `config/application.yml` 读配置（不支持环境变量覆盖），
  用 `--network container:xiuxian-server` 共享 localhost 的方式拉一个 MySQL，再手工改卷内 `application.yml` 的 `database` 段。

::: tip 三条部署方式共用的铁律
无论 systemd 还是容器，**jar 所在目录 == 工作目录** 都要成立，否则
`config/adapters.json`、`xiuxian.db`、`data/`、`log/`、`plugins/` 会落到意料之外的位置，
启动日志会打印 `[WARN] 工作目录与 JAR 目录不一致`。systemd 用 `WorkingDirectory` 钉死，
容器里 `entrypoint.sh` 把 jar 复制到 `/app` 并 `cd /app` 保证一致。
:::

## 需要备份的东西

| 路径 | 内容 | 重要性 |
| --- | --- | --- |
| `xiuxian.db`（+ `-wal`、`-shm`）/ MySQL 库 | 全部业务数据 | **最高** |
| `config/` | `application.yml`（含 `jwt.secret`）、`plugins.yml`、`adapters.json`、黑名单与群配置 | **高** |
| `data/players/` | 每玩家一个 JSON 快照 | 中 |
| `plugins/` | 第三方插件 jar | 中 |
| `log/` | 运行日志 | 低 |

数据库启用了 WAL，写入可能还在 `xiuxian.db-wal` 里没合并进主库，**在线只拷 `xiuxian.db`
可能拿到不完整状态**：停服后拷贝（推荐），或不停服时把 `xiuxian.db`、`xiuxian.db-wal`、
`xiuxian.db-shm` **三个一起**拷贝。

## 升级流程

### 1. 停服

等日志出现 `服务器已关闭` 再继续。停机钩子依次执行：停适配器 → 关 WebSocket →
停 MOTD → 停坊市回收与价格历史任务 → **玩家数据 flush 落盘** → 停内置插件 → 关连接池。

### 2. 备份数据库与配置

```bash
cd /opt/xiuxian
cp xiuxian.db xiuxian.db.bak-$(date +%F)          # SQLite
[ -f xiuxian.db-wal ] && cp xiuxian.db-wal xiuxian.db-wal.bak-$(date +%F)
cp -r config       config.bak-$(date +%F)
cp -r data/players players.bak-$(date +%F)
mysqldump -uroot -p xiuxian > xiuxian-$(date +%F).sql   # MySQL
```

### 3. 替换 jar 并启动

```bash
mv main-旧版本.jar main-旧版本.jar.rollback   # 旧 jar 留档，不要删
cp /tmp/main-0.1.0.jar .
java -Xms512m -Xmx2g -jar main-0.1.0.jar --nogui
```

`config/`、`data/`、`plugins/` 不在 jar 里，是运行期数据，替换时原地保留。

### 4. 核对日志

| 应出现 | 含义 |
| --- | --- |
| `[Config] 配置加载完成 (N 项)` | 外部配置已合并 |
| `所有数据库表创建完成` | 建表 + 迁移成功（**关键**） |
| `已为 N 个历史坊市挂单补齐到期时间（72 小时）` | 老挂单回填（见下节） |
| `坊市已回收到期挂单 N 个，物品已退回卖家` | 集中退回发生 |
| `服务已启动` / `API路由启动在 http://...` | HTTP 就绪 |
| `管理控制台启动在 http://...` | 管理台就绪 |

随后抽查：后台「坊市管理」页能列出在售挂单（需 `admin.economy` 权限）；
游戏内 `/坊市` 显示剩余时间、`/行情 <物品>` 返回成交统计。

## 自动迁移：不需要手工执行 SQL

`Main.initializeDatabase()` → `DatabaseManager.init()` → `DatabaseManager.initTable()`
会**先建表、再迁移**，全部语句幂等（`CREATE TABLE IF NOT EXISTS`、
`ALTER TABLE ... ADD COLUMN` 失败即忽略），每次启动都跑一遍，重复执行无副作用。

`initTable()` 先发约 40 条 `CREATE TABLE IF NOT EXISTS`，覆盖 `users`、
`verification_codes`、`players`、`players_items`、`players_equipment`、
`skills`/`players_skills`、`techniques`/`players_techniques`、`recipes`、
`trade_listings`、`player_daily`、`qq_bindings`、`qq_official_bindings`、`mc_bindings`、
`roles`/`permissions`/`role_permissions`/`user_roles`、`chat_messages`、`friends`、
`player_action_logs`、`sects` 系列、`map_locations`/`map_connections`、
`redeem_codes`/`redeemed_codes`、`caves`、`formations`、`player_economy`、`player_bank`、
`auction_listings`/`auction_bids`、`player_energy`、`player_titles`、`token_blacklist`，
以及本版本新增的 `trade_price_history`；随后建立 3 个索引（均 `IF NOT EXISTS`）：

| 索引 | 列 | 用途 |
| --- | --- | --- |
| `idx_trade_price_item_time` | `trade_price_history(item_key, sold_at)` | 行情查询 |
| `idx_trade_listings_status_expires` | `trade_listings(status, expires_at)` | 到期回收任务（每 60 秒一次）与在售筛选 |
| `idx_trade_listings_seller_status` | `trade_listings(seller_player_id, status)` | 查询某卖家的挂单 |

`DatabaseMigration.executeMigrations()` 再补历史库缺的列与表：

| 变更 | 目标 |
| --- | --- |
| 补列 | `verification_codes.sent_at` |
| 补列 | `players.battle_strategy`、`current_location_id`、`last_travel_time`、`last_breakthrough_time` |
| 补列 | `players.secret_realm_count`、`pvp_wins`、`craft_count`（称号计数） |
| 补列 | `players_equipment.enhance_level` |
| 补列 | `recipes.high_quality_rate`、`max_quality_rate`、`quality_bonus_rate` |
| 补列 | `player_daily.pvp_count` |
| 补列 | `farm_plots.wilted_time`、`root_bonus`、`season_modifier`、`pest_state`、`pest_time`、`crop_quality` |
| 补列 | `trade_listings.expires_at`（本版本新增） |
| 建表 | `player_buffs`、`farm_plots` |
| 数据迁移 | `redeem_codes` 由 `is_active` 布尔列改为 `status` 字符串列（MySQL 会 DROP 旧列）；`players_items.quantity` 提升为 `BIGINT`（仅 MySQL）；把 `qq_bindings` 里含非数字字符的行（QQ 官方 openid）搬到 `qq_official_bindings` |
| 表重建 | `qq_official_bindings` 增加 `app_id` 维度（建新表 → 拷数据 → 删旧表 → 改名，失败保留原表） |

::: tip 结论
**不需要手工执行任何 SQL**，也不需要提前改配置。新增配置键（如 `market.*`）
会自动从 jar 内置模板继承默认值，外部 `config/application.yml` 只作为覆盖层。

但迁移会真实 `ALTER TABLE`，`qq_official_bindings` 的 `app_id` 升级甚至**会重建表**，
所以升级前备份数据库是唯一不可省略的步骤。
:::

## 本版本升级必读：老挂单会集中到期

`trade_listings.expires_at` 是本版本新增列。对历史库的处理顺序是：

1. 迁移只加列，老行 `expires_at` 保持 `NULL`（= 不过期），不会在升级瞬间清空；
2. 服务端启动后由后台任务**回填**到期时间，规则为
   `created_at + market.listing_duration_hours`（默认 72 小时）；
3. 回填后立刻执行一次到期扫描，**已超过 72 小时的旧挂单集中到期**，
   物品退回卖家背包，挂单状态置为 `expired`。

::: danger 这是预期行为，请提前告知玩家
表现是升级后几分钟内一批历史挂单同时消失、卖家背包突然多出物品，日志出现：

```
已为 N 个历史坊市挂单补齐到期时间（72 小时）
坊市已回收到期挂单 N 个，物品已退回卖家
```

这**不是数据丢失**，而是挂单时限对老数据同样生效。想多留一段时间，就在**升级前**
把 `market.listing_duration_hours` 临时调大（例如 `720`），升级完成后再改回 72。
回填只做一次（成功后进程内标志置位）；若首次因数据库未就绪而失败，下一次 tick 会重试。
:::

## 回滚

停服后换回旧 jar 再启动即可：`mv main-旧版本.jar.rollback main-旧版本.jar`。

**回滚不需要还原数据库**，新增内容对旧版本完全无害：

| 新增物 | 旧版本的行为 |
| --- | --- |
| `trade_listings.expires_at` 列 | 不读该列，挂单恢复"永不过期"语义 |
| `trade_price_history` 表 | 不查询，表空着不影响 |
| 3 个新索引 | 只占少量磁盘，不影响正确性 |

::: warning 已发生的业务变更不会自己回退
老挂单已经退回并标记 `expired`，换回旧 jar **不会**把它们重新上架。
要回到升级前状态，必须从升级前的数据库备份恢复。
:::

## 备份策略与建议频率

| 对象 | 频率 | 保留 | 备注 |
| --- | --- | --- | --- |
| 数据库（`xiuxian.db` / `mysqldump`） | **每日**至少一次；大服每 6 小时 | 7–30 天 | 升级、改配置、装插件**之前**各额外做一次 |
| `config/` | 每次改动前后 | 全部历史 | 很小，全量留档 |
| `data/players/` | 每日 | 7 天 | 后台可一键导出 |
| `plugins/` | 每次新增 / 更新 | 全部历史 | 与 jar 版本对应留存 |
| `log/` | 归档 | 14 天 | 排障用，量大 |

后台也提供整库导出与还原：`GET /api/admin/backup`（导出 JSON）、
`POST /api/admin/backup/import`（单事务还原，失败自动回滚）、
`POST /api/admin/player-data/export-all`。另外 `POST /api/admin/database/clear_players`
与 `reset_all` 会真实 `DELETE FROM` 且**没有回收站**，需要对应的 `admin.database.*` 权限。

## 日志位置与轮转

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `logging.dir` | `log` | 日志目录（相对工作目录） |
| `logging.level` | `DEBUG` | `TRACE`/`DEBUG`/`INFO`/`WARN`/`ERROR`；生产建议 `INFO` |
| `logging.color` | `true` | 控制台 ANSI 着色；重定向到文件时建议关掉 |

文件名规则（`GameLogger.initSharedFileWriter()`）是 `log/server-yyyyMMdd-HHmmss.log`，
时间戳取**启动时刻**：即**每次启动一个新文件**，追加写入并**每行 flush**。

::: warning 服务端不做日志轮转
代码里没有按大小或按天切分的逻辑，也没有自动清理旧日志。单次运行时间很长时
单个文件会持续增长，历史文件会一直堆积。请自行处理，例如用 logrotate 的
`daily / rotate 14 / compress / copytruncate` 规则处理 `log/server-*.log` ——
`copytruncate` 是关键，进程持有文件句柄且持续追加，重命名不会让它换文件。
:::

## 定时后台任务清单

全部由 daemon 线程承载，**不阻止 JVM 退出**。

| 任务 | 线程名 | 首次执行 | 周期 | 相关配置 |
| --- | --- | --- | --- | --- |
| 坊市到期挂单回收 | `trade-market-sweeper` | 启动后 **20 秒** | **每 60 秒**（硬编码） | `market.listing_duration_hours` |
| 坊市价格历史清理 | `trade-market-sweeper` | 启动后 5 分钟 | 每 `market.price_history_cleanup_interval_hours` 小时（默认 6） | `market.price_history_keep_days`（默认 30） |
| 玩家数据文件落盘 | `player-data-sync` | 启动后 N 秒 | 每 `player-data.auto-sync-seconds` 秒（默认 30，设 0 关闭） | `player-data.enabled`、`player-data.dir` |
| 限流窗口 / Token 黑名单清理 | `cleanup-scheduler` | 启动后 5 分钟 | **每 5 分钟**（硬编码） | 分别清理 1 小时前的限流记录与 24 小时前的吊销记录 |
| 季节更替检查 | — | 启动后 10 秒 | 每 10 秒 | `season.mode`、`season.cycle_hours` |
| 自动疗伤 / 洞府灵力 | — | 启动后 10 秒 | 每 10 秒 | 受 `player`、`cave` 模块开关门控 |
| 阵法 tick | — | 启动后 60 秒 | 每 60 秒 | 受 `formation` 模块开关门控 |
| 农田地块更新 / Buff 过期检查 | — | 启动后 1 秒 | 每 1 秒 | 受 `farm`、`buff` 模块开关门控 |
| Buff 内存缓存清理 | — | 启动后 30 秒 | 每 30 秒 | 同上 |
| OneBot 黑名单禁言续期 | — | 启动后 12 小时 | 每 12 小时 | 仅 OneBot 通道运行时 |
| QQ 官方心跳 | `QQBot-Heartbeat` | 立即 | 每 `heartbeatIntervalMs`（缺省 40 秒） | 仅 QQ 官方通道启用时 |
| 插件 jar 文件监听 | `plugin-file-watcher` | 启动后 3 秒 | 每 3 秒 | **仅当 `plugins.hot_swap: true`** |

::: tip 关于「坊市回收周期」的常见误解
`market.price_history_cleanup_interval_hours` 控制的是**价格历史清理**任务的间隔，
**不是**到期挂单回收的间隔。到期挂单回收**固定每 60 秒扫描一次**
（首个 tick 延迟 20 秒等数据库就绪），周期在 `TradeService` 静态块里硬编码，
不通过配置项调整。
:::

WebUI 里停用模块后，其指令与接口**立刻**失效，但**已启动的定时任务需要重启进程
才会彻底停止**；清理动作本身会查模块开关，所以不产生副作用，只是线程仍在空转。

## 常见故障排查

### 端口被占用

**现象**：启动即失败，日志出现 `Address already in use` / `BindException`。

```bash
ss -lntp | grep -E '8080|6700|25565'          # Linux
netstat -ano | findstr ":8080"                 # Windows
```

| 端口 | 来源 | 改哪里 |
| --- | --- | --- |
| 8080 | `server.port` | `config/application.yml` |
| 6700 | OneBot 实例 `config.port` | `config/adapters.json` |
| 25565 | `motd.port` | `config/application.yml` |

`AdapterManager.startOneBot()` 固定用 `0.0.0.0:6700` 起监听，与 MC 服务端默认端口相同，
同机部署注意错开。

### JWT 密钥缺失或过短

`JwtUtil.init(isInstallMode)` 的四种结局：

| 情况 | 结果 |
| --- | --- |
| 已配置且 ≥ 32 字节 | 正常启动，打印 `✓ JWT 密钥已从配置加载` |
| 已配置但 < 32 字节 | **拒绝启动**：`jwt.secret 长度不足！需要至少 32 字节` |
| 为空 + 未完成安装（无 `config/.installed`） | 生成临时密钥启动并告警；重启后 Token 全失效 |
| 为空 + 已完成安装（`config/.installed` 存在） | **拒绝启动**：`jwt.secret 未配置！` → `System.exit(1)` |

用 `openssl rand -base64 48` 生成一个 ≥ 32 字节的密钥。

::: danger 已安装的服务器不要把 jwt.secret 清空
常见说法"清空 `jwt.secret` 重启就回到安装向导"在本版本**不成立**：
安装锁存在时服务端直接拒绝启动。要重装请用带管理员密码校验的
`POST /api/install/reset`（仅本机可调用），它会同时清除 `config/application.yml`
与安装锁 —— 注意这会**丢掉端口、数据库连接、密钥等全部配置**。
:::

### 数据库锁定

**现象**：日志出现 `database is locked` / `SQLITE_BUSY`，写入失败。排查要点：

- 确认没有**第二个进程**在跑同一个 `xiuxian.db`（最常见原因）
- `SQLiteDialect` 已设 `busy_timeout = 5000`，短时争用会自动等 5 秒
- `database.pool_max` 在 SQLite 下会被夹到 2–8，调再大也没用
- 数据库放网络盘（NFS / SMB）会显著放大锁问题，且避免与拷库工具同时进行

### 内存不足

**现象**：`java.lang.OutOfMemoryError: Java heap space`，或进程被 OOM Killer 杀掉。

1. 加大 `-Xmx`（`XIUXIAN_MEM=-Xmx1g ./start.sh`）
2. 设 `performance.low_memory: true`，并把 `logging.level` 从 `DEBUG` 调到 `INFO`
3. 调小 `performance.memory_log_entries`
4. 检查 `log/` 里是否有同名 WARN 反复刷屏

## 停机与重启

| 方式 | 行为 |
| --- | --- |
| 交互模式按 Enter | 停适配器 → 停 MOTD → `server.shutdownNow()` |
| `--nogui` 下 Ctrl+C / `SIGTERM` | 触发停机钩子（含玩家数据 flush、连接池关闭） |
| `POST /api/admin/shutdown` | 需 `admin.database.reset_all` 权限；异步停服并 `System.exit(0)` |
| 安装向导保存配置后 | 自动重启：先起新进程，轮询 `/api/game/status` 就绪（最多 60 秒）再退出旧进程，避免端口空窗 |

停机钩子调用 `PlayerDataService.shutdown()`，先 `scheduler.shutdown()` 再 `flushDirty()`，
把待同步玩家数据写进 `data/players/`。请给它几秒钟，**不要 `kill -9`**。
