# 数据库设计

服务端支持 **SQLite**（默认，零配置）与 **MySQL** 两种数据库，由 `database.type` 切换。
两种数据库共用同一套建表与迁移代码，方言差异通过 `DatabaseDialect` 抽象屏蔽。

## 建表与迁移流程

每次启动都会完整执行一遍下面的流程：

```
DatabaseManager.initTable()
    │
    ├─ 1. 建表          CREATE TABLE IF NOT EXISTS ...     ← 43 张表，逐条执行
    ├─ 2. 迁移          DatabaseMigration.executeMigrations(conn)
    │                      ALTER TABLE ... ADD COLUMN ...   ← 捕获"已存在"异常
    │                      （另有 2 张表由迁移创建：player_buffs、farm_plots）
    ├─ 3. 建索引        CREATE INDEX IF NOT EXISTS ...      ← 幂等，共 4 条
    └─ 4. 初始化权限数据  PermissionService.initDefaultData()
```

::: danger 索引必须在迁移之后创建
顺序不能颠倒。老库的 `trade_listings` 没有 `expires_at` 列，该列是由 `executeMigrations` 里的
`ALTER TABLE` 补上的；如果索引先于迁移执行，任何"升级上来的库"都会在启动时直接抛
`no such column: expires_at` —— 表建好了、服务却起不来。

建表用的是 `CREATE TABLE IF NOT EXISTS`，对老库是空操作，真正补列的是迁移，
所以"先迁移、后建索引"才是唯一正确的顺序。回归测试：`LegacySchemaUpgradeTest`。
:::

::: danger 写迁移必须幂等
老库和新库走的是**同一套语句**，且**每次启动**都会执行。
因此新增表用 `IF NOT EXISTS`，新增列要捕获"列已存在"异常。

非幂等的迁移会在第二次启动时直接崩掉服务端。
:::

### 新增列是怎么做的

`DatabaseMigration` 里的写法统一为「尝试执行 + 吞掉已存在异常」：

```java
private void addTradeListingsExpiresAtColumn(Connection conn) {
    try (Statement stmt = conn.createStatement()) {
        stmt.execute("ALTER TABLE trade_listings ADD COLUMN expires_at TIMESTAMP DEFAULT NULL");
    } catch (SQLException e) {
        // 列已存在，忽略
    }
}
```

### 升级是自动的

因为流程在**每次启动**都跑一遍，所以：

- 新版本新增的表/列/索引，**老库重启一次就自动补齐**，不需要手工执行 SQL
- 新增列对旧版本代码无害，所以**回滚只需换回旧 jar**，不需要还原数据库

## 方言差异

`DatabaseDialect` 提供的能力（`SQLiteDialect` / `MySQLDialect` 各自实现）：

| 能力 | 作用 |
| --- | --- |
| `supportsForeignKeysInCreateTable()` | 是否在 `CREATE TABLE` 里写外键约束 |
| `supportsIndexInCreateTable()` | 是否支持在建表语句里内联 `INDEX` |
| `disableForeignKeyChecks()` / `enableForeignKeyChecks()` | 批量删表时临时关外键检查 |
| 自增主键类型、时间戳默认值 | `pk` / `tsDefault` / `tsUpdate` 参数 |

::: tip 一个真实差异
`chat_messages` 表的 `idx_chat_channel`、`idx_chat_receiver` 两个索引
只在 `supportsIndexInCreateTable()` 为真时才会写进建表语句
（MySQL 支持内联 `INDEX`，SQLite 不支持）。
:::

## 数据表总览

共 **45 张表**，按领域分组如下：`DatabaseManager.initTable()` 逐条执行 **43** 条 `CREATE TABLE IF NOT EXISTS`，另有 **2** 张（`player_buffs`、`farm_plots`）由 `DatabaseMigration` 创建。

### 账号与鉴权

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `users` | 用户账号 | `username`(唯一)、`password`、`email`、`failed_attempts`、`locked_until` |
| `verification_codes` | 邮箱验证码 | `email`、`code`、`expires_at`、`sent_at` |
| `token_blacklist` | JWT 吊销名单 | `token_hash`(SHA-256，唯一)、`expires_at` |
| `qq_bindings` | OneBot 的 QQ 号绑定 | `qq_number`(唯一)、`user_id`(唯一) |
| `qq_official_bindings` | QQ 官方平台绑定 | `app_id`、`openid`、`user_id`；唯一键 `(app_id, openid)` 与 `(app_id, user_id)` |
| `mc_bindings` | Minecraft 账号绑定 | `mc_uuid`(唯一)、`mc_name`、`user_id`(唯一) |

::: warning token_blacklist 为什么必须落库
早期实现只把已登出的 token 放在内存 `ConcurrentHashMap` 里，**进程重启即清空**，
导致"已登出"的 7 天有效期 token 全部复活。

落库后重启不再丢失吊销信息。表里只存 token 的 **SHA-256 摘要**（不存明文），
避免数据库泄露后被直接冒用。
:::

::: tip qq_official_bindings 为什么不能复用 qq_bindings
QQ 官方平台下发的是 **openid**，与真实 QQ 号不是同一身份体系，且**按 AppID 隔离** ——
同一个真人在不同机器人下的 openid 不同。

所以唯一键必须带 `app_id` 维度，否则会出现"在 A 机器人绑定、在 B 机器人显示未绑定"，
且在 B 上重新绑定会因 `user_id` 被占用而失败。
:::

### 权限

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `roles` | 角色定义 | `name`(唯一)、`display_name`、`level` |
| `permissions` | 权限码字典 | `code`(唯一)、`name`、`category` |
| `role_permissions` | 角色→权限 | `(role_name, permission_code)` 唯一 |
| `user_roles` | 用户→角色 | `(user_id, role_name)` 唯一 |

详见[权限系统](/dev/permissions)。

### 角色与养成

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `players` | 角色主表 | `user_id`(唯一)、`name`、`spiritual_root`、`level`、`realm`、`sub_realm`、属性六维、`gold`、`cultivation_progress`、`is_cultivating`、`cultivation_start_time` |
| `players_items` | 背包 | `(player_id, item_key)` 唯一、`quantity` |
| `players_equipment` | 已装备物品 | `(player_id, slot)` 唯一、`item_key`、`enhance_level` |
| `skills` / `players_skills` | 技能定义 / 已学技能 | `required_realm`、`damage`、`mp_cost`、`cooldown_seconds` / `level`、`proficiency` |
| `techniques` / `players_techniques` | 功法定义 / 已学功法 | 各类 `*_bonus`、`cultivation_speed_bonus`、`exp_bonus` / `level`、`is_equipped` |
| `recipes` | 炼制配方 | `result_item_key`、`material1..3_key/count`、`success_rate` |
| `player_titles` | 已获称号 | `(player_id, title_key)` 唯一、`is_equipped` |
| `player_buffs` | 生效中的 Buff | `buff_id`、各类 `*_bonus`、`expire_time` |
| `player_energy` | 能量 | `player_id`(主键)、`energy` |

::: tip 闭关状态的两个字段必须成对写入
`players.is_cultivating` 与 `players.cultivation_start_time` 是一组状态：

- 只有 `is_cultivating=1` **且** `cultivation_start_time>0` 才是"正常闭关中"
- 若 `is_cultivating=1` 但 `cultivation_start_time<=0`，属于**脏数据**（算不出闭关时长）

服务端对脏数据的处理是**自愈**：玩家再发一次 `/打坐` 会按当前时间重新开始闭关，
而不是把他挡住、逼他先 `/停止`（那会白丢一段闭关时间）。
:::

### 经济与交易

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `trade_listings` | 坊市挂单 | `seller_player_id`、`item_key`、`quantity`、`price_spirit_stones`、`fee`、`status`、`expires_at` |
| `trade_price_history` | 坊市成交价格历史 | `item_key`、`unit_price`、`quantity`、`total_price`、`sold_at` |
| `auction_listings` | 拍卖行拍品 | `start_price`、`current_bid`、`current_bidder_id`、`fee_rate`(默认 0.07)、`status`、`end_time` |
| `auction_bids` | 出价记录 | `listing_id`、`bidder_player_id`、`amount` |
| `player_economy` | 签到与流水统计 | `last_sign_in`、`streak`、`total_stones_spent`、`total_stones_earned` |
| `player_bank` | 灵庄存单 | `deposit_type`、`principal`、`interest_earned`、`rate`、`matures_at`、`status` |
| `redeem_codes` / `redeemed_codes` | 兑换码 / 已兑换记录 | `code`(唯一)、`items_json`、`max_uses`、`current_uses` / `(code_id, player_id)` 唯一 |

::: warning trade_price_history.unit_price 存的是单价
同一物品的挂单**数量不同**，只有**单价**之间才可比，所以历史表专门存
`unit_price`（= `total_price` ÷ `quantity`），行情统计（均价/最低/最高）都基于它。
:::

::: tip trade_listings.expires_at 允许为 NULL
`NULL` 表示**历史遗留挂单**（旧版本没有过期概念）。

新上架的单子一律写入具体到期时间（上架时刻 + `market.listing_duration_hours`），
由后台回收任务处理。启动时会对遗留挂单做一次**回填**（见下文「并发与定时任务」）。
:::

### 社交与宗门

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `chat_messages` | 聊天记录 | `channel`(默认 `world`)、`sender_player_id`、`receiver_player_id`、`content` |
| `friends` | 好友关系 | `(player_id, friend_player_id)` 唯一、`status`(默认 `pending`) |
| `sects` | 宗门 | `name`(唯一)、`leader_player_id`、`level`、`prestige`、`max_members`(默认 20) |
| `sect_members` | 宗门成员 | `(player_id)` 唯一、`role`(默认 `MEMBER`)、`contribution` |
| `sect_applications` | 入宗申请 | `sect_id`、`player_id`、`status`(默认 `pending`) |
| `sect_warehouse` | 宗门仓库 | `(sect_id, item_key)` 唯一、`quantity`、`donated_by_player_id` |
| `sect_wars` | 宗门战 | `attacker_sect_id`、`defender_sect_id`、`winner_sect_id`、`prestige_stake`、`battle_log` |

### 世界与玩法

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `map_locations` | 地图地点 | `id`(手工指定)、`name`、`description`、`region`、`min_realm`、`is_safe_zone`、`cultivation_bonus`、`exploration_bonus`、`danger_level`(0~4)、`is_wilderness`、`expires_at`、`entry_location_id` |
| `map_connections` | 地点连接 | `from_location_id`、`to_location_id`、`travel_time_seconds`(默认 5) |
| `caves` | 洞府 | `(player_id)` 唯一、`level`、`spirit_energy`、`max_spirit_energy`、`cultivation_bonus`、`last_collect_time` |
| `formations` | 阵法 | `formation_key`、`level`、`spirit_energy_boost`、`cultivation_bonus`、`defense_bonus`、`heart_demon_resist`、`expires_at`、`active` |
| `farm_plots` | 灵田地块 | `(player_id, plot_index)`、`state`、`seed_key`、`crop_key`、`planted_time`、`harvest_time`、`growth_stage`、`water_level`、`fertilizer_level`、`wilted_time`、`yield`、`settled_time`、`root_bonus`、`season_modifier`、`pest_state`、`pest_time`、`crop_quality` |
| `player_map_exploration` | 玩家探索记录 | `(player_id, location_id)` 唯一、`first_visited_at`；只记"首次"，重复到达不写 |
| `map_location_event_bias` | 地界 → 探索事件权重偏置 | `(location_id, event_key)` 唯一、`weight_multiplier`；让"落霞山产落霞草"这类地点描述真正作用于事件抽取 |
| `player_daily` | 每日计数 | `player_id`(主键)、`last_morning_cultivation`、`consecutive_days`、`exploration_count`、`battle_count`、`secret_realm_count`、`pvp_count` 等 |

### 日志

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `player_action_logs` | 玩家行为审计 | `user_id`、`player_name`、`action`、`detail`、`qq_number` |

::: warning `map_wilderness_resources` 已废弃
野外资源改为**文件存储**（每个分片一个 JSON，见 `com.mtxgdn.game.map.WildernessChunkStore`），`DatabaseManager` 已不再创建该表。表定义仍保留在 `DatabaseSchema` 里以便追溯，已存在的库会留下一张空表——无害，且刻意不去 `DROP`（删库的风险远大于留一张空表）。
:::

## 索引

| 索引 | 表 | 列 | 覆盖的查询 |
| --- | --- | --- | --- |
| `idx_trade_price_item_time` | `trade_price_history` | `(item_key, sold_at)` | 行情查询（按物品+时间） |
| `idx_trade_listings_status_expires` | `trade_listings` | `(status, expires_at)` | 到期回收任务、在售筛选 |
| `idx_trade_listings_seller_status` | `trade_listings` | `(seller_player_id, status)` | `/我的挂单` |
| `idx_player_buffs_expire` | `player_buffs` | `(expire_time)` | Buff 过期兜底回收任务（见 [Buff 系统](/player/buff)）；有了它，单次代价只与"已过期的行数"相关 |
| `idx_chat_channel` | `chat_messages` | `(channel)` | 世界频道拉取（仅 MySQL） |
| `idx_chat_receiver` | `chat_messages` | `(receiver_player_id)` | 私聊拉取（仅 MySQL） |

::: warning 这三个索引是后补的，不是一开始就有
`trade_listings` 早期**一个索引都没有**，但它有两处高频访问：

- 到期回收任务**每 60 秒**执行一次 `WHERE status='active' AND expires_at <= ?`
- `/坊市` 每次都执行 `WHERE status='active' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`

没有索引时两者都是**全表扫描**，挂单量涨起来后每 60 秒一次的扫描会持续占用数据库。
升级到本版本后这三个索引会在启动时自动创建。
:::

## 并发：先抢占，再执行

::: danger 这是本项目最重要的一条并发约定
凡是「**改状态 + 发放物品/货币**」的操作，都必须用**条件更新**抢占，
只有更新影响行数 `> 0` 的一方才能继续发放。
:::

### 反例：先读后写

```java
// ❌ 危险：检查与更新之间存在时间窗口
Listing l = getListing(id);
if (l.getStatus().equals("active")) {
    setStatus(id, "cancelled");
    refundItem(l);   // 并发下可能被执行两次 → 物品复制
}
```

两个并发请求可能都读到 `active`，于是都执行了 `setStatus` 与 `refundItem`。

### 正例：条件更新抢占

```java
// ✅ 正确：用 WHERE 条件把"检查"和"更新"合并成一次原子操作
int claimed = stmt.executeUpdate(
    "UPDATE trade_listings SET status = 'cancelled' WHERE id = ? AND status = 'active'");
if (claimed == 0) {
    return fail("挂单状态已变化");   // 没抢到，直接返回，不发放任何东西
}
refundItem(listing);                 // 只有抢到的一方才发放
```

这套写法在项目里用于：

| 场景 | 抢占语句 |
| --- | --- |
| 取消坊市挂单 | `UPDATE trade_listings SET status='cancelled' WHERE id=? AND status='active'` |
| 坊市到期回收 | `UPDATE trade_listings SET status='expired' WHERE id=? AND status='active'` |
| 拍卖结束结算 | `UPDATE auction_listings SET status='ended' WHERE id=? AND status='active'` |

::: tip 参与同一事务
需要「抢占 + 发放」原子完成的场景，把两条语句放在同一个 `Connection` 事务里
（`DatabaseManager.runTransaction(...)`）。
部分 service 方法接受 `Connection` 参数正是为此，详见[内部服务 API](/dev/internal-api)。
:::

## 定时后台任务

| 任务 | 周期 | 说明 |
| --- | --- | --- |
| 坊市到期回收 | **60 秒** | 扫描 `status='active' AND expires_at <= now()`，抢占后把物品退回卖家 |
| 价格历史清理 | `market.price_history_cleanup_interval_hours`（默认 6 小时） | 删除超过 `market.price_history_keep_days`（默认 30 天）的成交记录 |
| 玩家数据落盘 | `player-data.auto-sync-seconds`（默认 30 秒） | 把脏玩家数据写入 `data/players/*.json` |
| 限流窗口 / Token 黑名单清理 | **5 分钟** | `RateLimiter.cleanupExpired` 与 `TokenBlacklist.cleanupExpired` |

前两个任务共用同一个守护调度线程 `trade-market-sweeper`。

::: warning 升级到本版本时的首次启动行为
`trade_listings` 里 `expires_at IS NULL` 的历史挂单会在启动时被**回填**为
`created_at + market.listing_duration_hours`（默认 72 小时）。

因此**上架超过 72 小时的旧挂单会在首次启动时集中到期**，
物品被批量退回卖家，玩家会收到一批到期通知。

这是预期行为，但升级前最好提前告知玩家。
:::

## 玩家数据的第二份存储

除了数据库，服务端还会把玩家数据**额外导出为 JSON 文件**
（`config/player-data.*` 控制，默认 `data/players/`，每 30 秒同步一次脏数据）。

::: warning 数据库是唯一事实来源
JSON 文件是**导出副本**，用于备份与人工排查，
**不参与**游戏逻辑读取（`self-restore` 默认关闭，玩家不能自助恢复）。
所以改 JSON 文件不会影响游戏内数据 —— 要改数据请直接改数据库或走管理后台。
:::

## 清除玩家数据

管理后台提供「清除玩家数据」功能，实现见 `DatabaseManager.clearPlayerData()`：
它会临时关闭外键检查，然后按**固定顺序** `DELETE FROM` 26 张玩家相关表
（先删子表如 `players_skills`、`sect_members`，最后删 `players`）。

::: danger 不可恢复
该操作会清空全部玩家进度（账号 `users` 表**不在**清除范围内，所以玩家还能登录，
但角色会重建）。执行前务必备份数据库文件。
:::
