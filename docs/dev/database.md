# 数据库设计

本文按 **V1.4.1-beta2** 代码（`com.mtxgdn.db` 包）说明服务端数据库：SQLite/MySQL 双方言与选择、启动建表顺序、42 张业务表清单与用途、迁移机制、连接池与方言差异，以及玩家数据的 JSON 文件化方案。所有表名/列名/默认值取自 `DatabaseSchema`、`DatabaseMigration`、`PermissionService` 的实际建表 SQL。

## 数据库选择与初始化

`config/application.yml` 的 `database.type` 决定方言：**默认 `sqlite`（零依赖，单机/测试推荐）；生产可选 `mysql`**。注意代码空值回退为 `mysql`（`Main.initializeDatabase`），删除该键会意外切到 MySQL 模式。详见 [配置说明](./config)。

| 项 | SQLite | MySQL |
|----|--------|-------|
| 连接 | `jdbc:sqlite:<sqlite_path>`（默认 `xiuxian.db`，相对工作目录） | `database.url`（默认 `jdbc:mysql://localhost:3306/xiuxian?...`）+ username/password |
| 建库 | 文件不存在自动创建 | **需预先建库**（建议 `utf8mb4`/`utf8mb4_unicode_ci`）；指向本机且端口未就绪时 `MySqlLauncher` 尝试自动拉起（Windows 找 `mysqld.exe`；Linux/macOS 依次 `systemctl`/`service`/`brew services`，失败则直接拉起二进制），远程地址不做拉起 |
| 驱动 | `org.sqlite.JDBC`（sqlite-jdbc 3.49.1） | `com.mysql.cj.jdbc.Driver`（mysql-connector-j 9.7.0） |
| 建表/迁移 | 启动自动完成（见下），无需手工执行 DDL | 同左；两套 DDL 由方言类输出差异 |
| 适用 | 单机/测试/小服（写并发低） | 多玩家/高并发生产 |

启动初始化链路（`DatabaseManager.init`）：

1. 加载驱动 → 按 `database.pool_max` 建 **HikariCP** 连接池 → `getConnection()` 探活；
2. `initTable()`：按固定顺序执行 **39 张基础表**建表 SQL（`CREATE TABLE IF NOT EXISTS`）；
3. `DatabaseMigration.executeMigrations()`：补列迁移 + 补建 `player_buffs`、`farm_plots`；
4. `PermissionService.initDefaultData()`：补建 `user_permissions` 表并幂等写入 5 个默认角色与权限码数据。

**合计 42 张业务表**（39 基础 + 迁移补建 2 + 权限表 1；SQLite/MySQL 相同，已按全新库核对）。

### 连接池（HikariCP）

| 参数 | 取值（代码固定，非配置） | 说明 |
|------|--------------------------|------|
| 池名 | `xiuxian-db` | — |
| 最大连接 | `database.pool_max`（模板默认 4）：MySQL `max(4, 值)`；SQLite 夹在 2~8（`min(8, max(2, 值))`，单写者模型减少写锁争用） | 建议 SQLite 2~8、MySQL 8~32 |
| 最小空闲 | 1 | — |
| 连接超时 / 校验超时 | 10 000 ms / 3 000 ms | `connectionTimeout` / `validationTimeout` |
| 空闲回收 / 最长存活 | 300 000 ms / 1 800 000 ms | `idleTimeout` / `maxLifetime` |
| 事务隔离 | `TRANSACTION_READ_COMMITTED` | 每次取连接设置 |
| 事务工具 | `executeInTransaction` / `runTransaction` | 显式 `setAutoCommit(false)` + commit/rollback |
| 关闭 | `DatabaseManager.shutdown()`（停机钩子最后一步） | 关闭连接池 |

SQLite 每条连接初始化（`SQLiteDialect.initConnection`）：`PRAGMA foreign_keys = ON`、`PRAGMA busy_timeout = 5000`（等写锁 5 秒避免立即 SQLITE_BUSY）、`PRAGMA journal_mode = WAL`（并发读 + 降写写阻塞）。MySQL 连接初始化为空操作。

## 表清单与用途（42 张）

### 账号 / 角色 / 绑定（7）

| 表 | 用途与要点 |
|----|-----------|
| `users` | 用户账号：`username UNIQUE`、`password`（bcrypt 哈希）、`email`、`failed_attempts`/`locked_until`（登录锁定） |
| `verification_codes` | 注册邮箱验证码：`email` + `code(6)` + `expires_at`（迁移补 `sent_at`） |
| `players` | 玩家主表：`user_id UNIQUE`（一账号一角色）、灵根 `spiritual_root`、`realm`/`sub_realm` 境界、五维属性（hp/mp/attack/defense/speed/spirit）、金币、闭关状态与起止、离线时间、地图位置等；迁移陆续补 `battle_strategy`、`current_location_id`/`last_travel_time`、`last_breakthrough_time` 与称号计数列 |
| `qq_bindings` | OneBot QQ 号 ↔ 用户：`qq_number UNIQUE` + `user_id UNIQUE`（双向唯一） |
| `qq_official_bindings` | QQ 官方 openid ↔ 用户（独立于 OneBot；历史误存 openid 由迁移自动搬入，见下） |
| `mc_bindings` | Minecraft：`mc_uuid UNIQUE` + `mc_name` + `user_id UNIQUE` |
| `player_action_logs` | 玩家行为日志：user_id/player_name/action/detail/qq_number/created_at（管理台「玩家轨迹」） |

### RBAC（5）

| 表 | 用途与要点 |
|----|-----------|
| `roles` | 角色/权限组定义：`name UNIQUE`、`display_name`、`level`（100/80/50/10/0 五档内置） |
| `permissions` | 权限码字典：`code UNIQUE`、`name`、`category`（内置 70 码 + 插件注册码） |
| `role_permissions` | 角色→权限：`UNIQUE(role_name, permission_code)` |
| `user_roles` | 用户→角色：`UNIQUE(user_id, role_name)` |
| `user_permissions` | 用户直接授权：`UNIQUE(user_id, permission_code)`（由 `PermissionService.initDefaultData` 补建，不在基础 39 张内） |

### 成长 / 养成（8）

| 表 | 用途与要点 |
|----|-----------|
| `skills` | 技能定义库（伤害/蓝耗/冷却/类型/境界要求/学习费用/等级上限） |
| `players_skills` | 已学技能：`UNIQUE(player_id, skill_id)`、level/proficiency |
| `techniques` | 功法定义库（六维加成 + 修炼/经验/战斗百分比加成、升级费用） |
| `players_techniques` | 已学功法：`UNIQUE(player_id, technique_id)`、level/proficiency、`is_equipped`（最多同时装备 3 门由服务层控制） |
| `player_daily` | 每日数据：**PK=player_id**，晨修/连续与累计活跃天数/各玩法每日计数与奖励标记/灵根共鸣 7/30 天标记；迁移补 `pvp_count` |
| `player_economy` | 经济统计：**PK=player_id**，上次签到、连续签到、修炼加速次数、灵石累计支出/收入 |
| `player_energy` | 能量转化值：**PK=player_id**、`energy` |
| `player_bank` | 灵庄存款：deposit_type（活期/定期）、principal、interest_earned、rate、deposited_at/matures_at、status |

### 物品 / 制造 / 市场（8）

| 表 | 用途与要点 |
|----|-----------|
| `players_items` | 背包：`UNIQUE(player_id, item_key)`、quantity（MySQL 迁移升级为 BIGINT） |
| `players_equipment` | 装备栏：`UNIQUE(player_id, slot)`、item_key、`enhance_level`（迁移补列，强化 +15 上限在服务层） |
| `recipes` | 制造配方：材料 1~3、费用、`success_rate`、经验区间；迁移补 `high_quality_rate`/`max_quality_rate`/`quality_bonus_rate` |
| `trade_listings` | 坊市挂单：seller_player_id、item_key、quantity、`price_spirit_stones`、`fee`、status |
| `auction_listings` | 拍卖挂单：start_price、current_bid/current_bidder_id、`fee_rate`（默认 0.07 = 7%）、status、end_time |
| `auction_bids` | 拍卖出价记录：listing_id、bidder_player_id、amount |
| `player_titles` | 玩家称号：`UNIQUE(player_id, title_key)`、`is_equipped` |
| `player_buffs` | 临时 Buff（迁移补建）：buff_id、四项加成、`expire_time` |

### 社交 / 宗门 / 地图（9）

| 表 | 用途与要点 |
|----|-----------|
| `chat_messages` | 聊天：channel（world/私聊 receiver_player_id）、content；**仅 MySQL** 在建表内联索引 `idx_chat_channel`/`idx_chat_receiver` |
| `friends` | 好友：`UNIQUE(player_id, friend_player_id)`，双向两行，status pending/accepted |
| `sects` | 宗门：`name UNIQUE`、leader_player_id、level、prestige、max_members（默认 20） |
| `sect_members` | 宗门成员：`UNIQUE(player_id)`（一人一宗）、role 职位、contribution、joined_at |
| `sect_applications` | 入宗申请：sect_id、player_id、message、status |
| `sect_warehouse` | 宗门仓库：`UNIQUE(sect_id, item_key)`、quantity、donated_by_player_id |
| `sect_wars` | 宗门战：attacker/defender/winner_sect_id、双方胜场、prestige_stake、battle_log TEXT |
| `map_locations` | 世界地图地点：**PK=id（手工指定）**、name/description/region/min_realm/is_safe_zone |
| `map_connections` | 地点连接：from/to_location_id、travel_time_seconds |

### 玩法 / 运营（5）

| 表 | 用途与要点 |
|----|-----------|
| `caves` | 洞府：`UNIQUE(player_id)`、level、spirit_energy/max、修炼/储存加成、last_collect_time |
| `formations` | 阵法：formation_key、level、各类加成、duration_minutes、placed_at/expires_at、active |
| `farm_plots` | 农田地块（迁移补建）：`(player_id, plot_index)`、state/seed_key/crop_key/生长阶段、水肥/病虫害/品质列（迁移补 `root_bonus`、`season_modifier`、`pest_state`、`crop_quality` 等） |
| `redeem_codes` | 兑换码：`code UNIQUE`、奖励（items_json/gold/spirit_stones/exp）、max_uses/current_uses、`status`（迁移由 `is_active` 演进）、expires_at |
| `redeemed_codes` | 兑换记录：`UNIQUE(code_id, player_id)` |

> 多数带 `player_id`/`user_id`/`sect_id` 外键的表在建表时声明 `FOREIGN KEY ... ON DELETE CASCADE`（两种方言 `supportsForeignKeysInCreateTable` 均为 true；SQLite 依赖每连接 `PRAGMA foreign_keys=ON`）。

## 迁移机制（DatabaseMigration）

迁移在建 39 张基础表之后、写默认权限之前执行（`executeMigrations`，顺序与代码一致）。策略是**尽力迁移**：每步独立 `try/catch` 静默跳过失败（`ALTER TABLE` 重复加列、旧库缺列等场景），因此幂等可重复执行：

| 迁移步骤 | 内容 |
|----------|------|
| `addVerificationCodesSentAtColumn` | `verification_codes` 补 `sent_at TIMESTAMP` |
| `addPlayersBattleStrategyColumn` | `players` 补 `battle_strategy VARCHAR(16) DEFAULT 'balanced'` |
| `addPlayersLocationColumns` | `players` 补 `current_location_id BIGINT DEFAULT 1`、`last_travel_time BIGINT DEFAULT 0` |
| `addPlayersBreakthroughTimeColumn` | `players` 补 `last_breakthrough_time BIGINT DEFAULT 0` |
| `addEquipmentEnhanceLevelColumn` | `players_equipment` 补 `enhance_level INT DEFAULT 0` |
| `migrateRedeemCodesStatusColumn` | `redeem_codes` 补 `status VARCHAR(16) DEFAULT 'active'`；**仅 MySQL** 由 `is_active` 回填 status 并 `DROP COLUMN is_active` |
| `migratePlayersItemsQuantityType` | **仅 MySQL**：`players_items.quantity MODIFY BIGINT` |
| `addRecipesQualityColumns` | `recipes` 补 `high_quality_rate`/`max_quality_rate`/`quality_bonus_rate DOUBLE DEFAULT 0` |
| `createPlayerBuffsTable` | 补建 `player_buffs`（`CREATE TABLE IF NOT EXISTS`，含 player_id 外键级联） |
| `createFarmPlotsTable` | 补建 `farm_plots`（state/seed/crop/时间/水肥/产量列） |
| `addFarmPlotsAdditionalColumns` | `farm_plots` 补 `wilted_time`、`root_bonus`、`season_modifier`（默认 1）、`pest_state`（默认 CLEAN）、`pest_time`、`crop_quality` |
| `migrateQqOfficialBindings` | 数据修复：把 `qq_bindings.qq_number` 中**非纯数字**（openid 特征）的行搬入 `qq_official_bindings(openid, user_id)`（`INSERT OR IGNORE`）并从 `qq_bindings` 删除；非数字判定 SQLite 用 `GLOB '*[^0-9]*'`、MySQL 用 `REGEXP '[^0-9]'` |
| `addPlayersTitleCounterColumns` | `players` 补 `secret_realm_count`、`pvp_wins`、`craft_count INT DEFAULT 0` |
| `addPlayerDailyPvpCountColumn` | `player_daily` 补 `pvp_count INT DEFAULT 0` |

> 新表/新列直接追加到 `DatabaseMigration` 即可随旧库升级，无需整库重建；破坏性 SQL（删列、改类型）目前只对 MySQL 执行，SQLite 侧跳过。

## 方言差异（SQLiteDialect / MySQLDialect）

| 项目 | MySQL | SQLite |
|------|-------|--------|
| 自增主键 | `BIGINT AUTO_INCREMENT PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| 布尔列 | `BOOLEAN DEFAULT FALSE` | `INTEGER DEFAULT 0` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | 同左 |
| `updated_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 仅 `DEFAULT CURRENT_TIMESTAMP`（无 ON UPDATE，由服务层显式更新） |
| 建表内联索引 | 支持（`chat_messages` 的 channel/receiver 索引） | 不支持（`supportsIndexInCreateTable=false`） |
| 建表内联外键 | 支持 | 支持（连接级 `PRAGMA foreign_keys=ON` 生效） |
| 表/列引用 | 反引号 `` ` `` | 双引号 `"` |
| 取表名 | `SHOW TABLES` / JDBC metadata | `sqlite_master` |
| 表列信息 | `DESCRIBE` / JDBC metadata（`Field`/`Type`/`Null`/`Key`） | `PRAGMA table_info`（`name`/`type`/`notnull`/`pk`） |
| 关/开外键检查 | `SET FOREIGN_KEY_CHECKS = 0/1` | `PRAGMA foreign_keys = OFF/ON` |
| SELECT 行锁 | 支持 `FOR UPDATE` | 不支持（返回空串，靠事务内写锁） |
| `INSERT OR IGNORE` | `INSERT IGNORE` | `INSERT OR IGNORE` |
| 非数字匹配 | `REGEXP '[^0-9]'` | `GLOB '*[^0-9]*'` |

## 数据清除 / 重置 / 备份

由 `DatabaseManager` 提供（管理台对应按钮需 `admin.database.clear_players` / `admin.database.reset_all` / `admin.database.access` 权限码，见 [权限体系](./permissions)）：

| 操作 | 范围 |
|------|------|
| `clearPlayerData()` | **26 张表** DELETE：`players` 及个人数据（背包/装备/技能/功法/每日/经济/灵庄/能量/Buff/称号/农田/洞府/阵法）、坊市/拍卖、好友/聊天/日志、宗门及成员/申请/仓库/战争、兑换记录。**保留** `users`、验证码、QQ/MC 绑定与 RBAC 表 |
| `resetAllData()` | **35 张表** DELETE：在 clear 基础上再加 QQ/MC 绑定、`user_roles`/`role_permissions`/`roles`/`permissions`/验证码/兑换码等；**保留 `users` 账号与 `user_permissions` 直接授权**，随后重新执行 `PermissionService.initDefaultData()` 重建默认角色/权限 |
| 表浏览/编辑 | `getAllTableNames/queryTable/insertRow/updateRow/deleteRow`：表名格式白名单（`^[a-z_]+$` + 41 张硬编码表名集合 + 缓存校验）与列名标识符白名单，防 SQL 标识符注入；管理台「数据库」页、备份下载/导入均走此白名单 |
| `exportAllData()` | 整库导出为 JSON（`{表名: [行…]}`），管理台「备份下载」 |
| `importData()` | 整库还原：逐表清空后按显式列插入（含 id），**单事务**，失败回滚；表名/列名白名单校验 |

## 玩家数据 JSON 文件化（data/players/）

除数据库外，每个玩家另持一份**独立 JSON 快照**（一用户一文件，`com.mtxgdn.playerdata`）：

| 项 | 说明 |
|----|------|
| 开关/参数 | `player-data.enabled`（默认 true）、`player-data.dir`（默认 `data/players`）、`player-data.auto-sync-seconds`（默认 30，0 关闭）、`player-data.self-restore`（默认 false，防刷） |
| 文件 | `data/players/<playerId>.json`（工作目录下；写入走 `.tmp` + 原子改名） |
| 文件结构 | `PlayerData`：`playerId`/`userId`/`playerName`/`exportedAt` + `tables: {表名: [行…]}`（快照式多表） |
| 覆盖范围 | `players` 主行 + **15 张个人关联表**：`players_items`、`players_equipment`、`players_skills`、`players_techniques`、`player_daily`、`player_economy`、`player_bank`、`player_energy`、`player_titles`、`player_buffs`、`farm_plots`、`caves`、`formations`、`trade_listings`（按 `seller_player_id`）、`redeemed_codes`；另含 `friends`（`player_id OR friend_player_id` 双向收录）与 `sect_members` |
| 值编码 | JDBC 值先转 JSON 安全类型：`Date` → 字符串 `"ts:<毫秒>"`（还原时还原为 `Timestamp`）；`byte[]` → Base64 |
| 触发落盘 | 各玩法服务写入后调 `PlayerDataService.markDirty(playerId)`；后台单线程调度按 `auto-sync-seconds` 调 `flushDirty()`（失败重排队）；停机钩子 `shutdown()` 先停调度再全量 flush |
| 还原 | `restorePlayer`：校验文件内 `playerId` 与目标一致；`players` 行做 UPDATE 且**跳过 `id`/`user_id`/`created_at`/`updated_at`**（防止数据文件把玩家挂到他人账号）；其余个人表先删后插；`sect_members` 不删重建（避免破坏宗门关系）；单事务、失败回滚。管理台单/全量导出与还原走 `AdminResource` |
| 防刷 | 玩家自助恢复默认关闭（`self-restore: false`）；管理端还原需相应权限 |

> 定位：`players` 行及其个人表是**运行时权威**，文件是**可导出/备份/还原的快照**（数据库删除或迁移时仍可从文件恢复玩家）。整套启动/落盘流程见 [架构总览 · 数据持久化](./architecture#数据持久化)。

## 相关文档

- 配置键与连接池参数 → [配置说明](./config)
- 建表/迁移/权限默认数据在启动流程中的位置 → [架构总览](./architecture)
- 权限表与默认角色数据 → [权限体系](./permissions)
- 部署时 SQLite/MySQL 的选择与建库 → [部署指南](./deployment)
- 管理台数据库操作接口 → [REST API](./rest-api)
