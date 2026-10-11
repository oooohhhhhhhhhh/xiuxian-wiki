# 社交系统

社交模块覆盖四件事：**好友**（关系维护 + 每日拜访收益）、**聊天**（世界频道与私聊）、**组队**（2~5 人团队副本）、
**排行榜与玩家搜索**（找人与比较）。所有社交指令都要求已绑定账号并已创建角色。

| 子玩法 | 玩法模块 | 主要数据 | QQ 指令 |
| --- | --- | --- | --- |
| 好友 | `friend` | `friends` 表 | `/好友` |
| 聊天 | `chat` | `chat_messages` 表 | `/私聊` |
| 组队 | `team` | **内存态**（无表） | `/组队` |
| 排行榜 | `rank` | `players` / `players_items` | `/排行榜` |
| 玩家搜索 | `search` | `players` | `/查人` |

::: warning 模块门控
以上模块名对应 `config/plugins.yml` 的 `built_in_plugins.*` 开关。模块停用后：
指令在 `/帮助` 中隐藏，且 `CommandRegistry.get` 直接返回 `null`（指令不可用）。
:::

## 好友系统

数据表 `friends`，服务 `com.mtxgdn.game.service.FriendService`，指令 `com.mtxgdn.onebot.command.social.FriendCommand`。

### 指令

| 指令 | 说明 |
| --- | --- |
| `/好友 add <玩家名>` | 发送好友申请（写入 `status = 'pending'`） |
| `/好友 accept <玩家名>` | 接受对方申请（同时补写一条反向关系） |
| `/好友 reject <玩家名>` | 拒绝并删除申请行 |
| `/好友 remove <玩家名>` | 双向删除好友关系 |
| `/好友 visit <玩家名>` | 拜访好友，双方各得经验与灵石（每日每位好友一次） |
| `/好友 list` | 好友列表 |
| `/好友 pending` | 待处理申请列表（附带接受/拒绝指令提示） |

- 权限：`game.friend.manage`；分类"社交"。
- 玩家名匹配走 `PlayerService.searchPlayersByName(name, 1, 0)`，即**模糊匹配取第一条**（`LIKE %name%`）。
- 不能添加自己为好友（提示"不能添加自己为好友"）。

### 关系模型

| 状态 | 含义 |
| --- | --- |
| `pending` | 已发出申请，等待对方接受 |
| `accepted` | 已成为好友（**双向两行**） |
| `self` | `sendRequest` 检测到自己给自己发申请时返回的伪状态（不落库） |

接受申请时 `acceptRequest` 会把"申请方→被申请方"的行更新为 `accepted`，再用
`insertReverseRelationship` 补一条反向行（SQLite 用 `INSERT OR REPLACE`，MySQL 用 `ON DUPLICATE KEY UPDATE`）。
`getFriends` 查询时按 `friend_player_id` 去重，因此双向两行不会重复显示。

`checkExistingRelationship` 在发申请前检查任意方向是否已有关系：已存在时不会重复插入，而是把已有状态原样返回。

### 拜访收益

`FriendService.visitFriend` 的奖励按**各自境界**计算：

| 项目 | 公式 | 说明 |
| --- | --- | --- |
| 拜访者经验 | `(自己境界 + 1) × 30` | 主动方 |
| 好友经验 | `(好友境界 + 1) × 30` | 被动方同样获益 |
| 拜访者灵石 | `(自己境界 + 1) × 5` | |
| 好友灵石 | `(好友境界 + 1) × 5` | |

限制与校验：

- 必须是**已接受**的好友关系，否则提示"你们不是好友，无法拜访"。
- **每日每位好友只能拜访一次**，第二次提示"今日已拜访过该好友，明日再来吧"。
- 不能拜访自己。

::: warning 拜访记录是内存态
`DAILY_VISITS` 是 `ConcurrentHashMap`，跨天时整体清空（`ensureVisitDate` 比对 `LocalDate`）。
**服务重启会丢失当天记录**，玩家可重复拜访；多实例部署时各实例独立计数。
:::

### `friends` 表字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 记录 ID |
| `player_id` | BIGINT | 关系持有者 |
| `friend_player_id` | BIGINT | 好友角色 ID |
| `status` | VARCHAR(16) | `pending` / `accepted`，默认 `pending` |
| `created_at` / `updated_at` | TIMESTAMP | 时间戳 |
| 唯一键 | `(player_id, friend_player_id)` | 同一对关系不会重复 |

源码中**没有好友数量上限**。

## 聊天系统

服务 `com.mtxgdn.game.service.ChatService`，数据表 `chat_messages`。

### 世界频道

世界频道**没有 QQ 指令**，只通过 REST / WebSocket / Web 管理台使用：

REST 服务挂在 `/api/` 前缀下（`GameResource` 的 `@Path("/game")`）：

| 方法 | 完整路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/game/chat/world?limit=50` | `game.chat.world` | 读取世界频道历史 |
| POST | `/api/game/chat/world` | `game.chat.world` | 发送世界消息（body：`{"content": "..."}`） |

限制（`ChatService`）：

| 项目 | 规则 |
| --- | --- |
| 限流 | **每玩家 30 秒最多 5 条**（`RateLimiter.allow("chat_world:<playerId>", 5, 30)`），超限抛"发言过于频繁，请稍后再试" |
| 内容净化 | `TextSanitizer.sanitizeChatContent` |
| 长度上限 | `MAX_CONTENT_LENGTH = 500` 字符，超出直接截断 |
| 空内容 | 空白内容直接返回 `null`（不落库） |
| 历史读取 | 请求 `limit` ≤ 0 或 > 100 时按 50 处理；单次最多返回 `MAX_WORLD_HISTORY = 100` 条 |

### 私聊

| 方式 | 用法 |
| --- | --- |
| QQ 指令 | `/私聊 <玩家名> <消息内容>` |
| REST | GET `/api/game/chat/private/{targetPlayerId}`（读）、POST `/api/game/chat/private`（发） |

`/私聊` 规则：

- 权限：`permission = null`（不额外校验权限，但需已绑定 + 已有角色）。
- 参数按第一个空格切成"玩家名 + 内容"两段，缺任一段都提示用法。
- 不能给自己发（"不能给自己发私聊消息"）。
- 找不到玩家时提示 `找不到玩家: <名字>`。
- 发送成功后写入 `chat_messages` 并把内容记入玩家行为日志（`PlayerActionLogger.logChat`）。

限制（`ChatService.sendPrivateMessage`）：

| 项目 | 规则 |
| --- | --- |
| 限流 | **每玩家 30 秒最多 10 条** |
| 长度上限 | 500 字符 |
| 历史读取 | `MAX_PRIVATE_HISTORY = 50`，`limit` 越界时按 50 处理 |
| 会话查询 | 同时匹配"我发给对方"和"对方发给我"两个方向 |

::: tip 私聊不要求互为好友
`sendPrivateMessage` 只校验目标玩家存在，源码中**没有好友关系校验**。
:::

### `chat_messages` 表字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 消息 ID |
| `channel` | VARCHAR(16) | `world` 或 `private`，默认 `world` |
| `sender_player_id` | BIGINT | 发送者角色 ID |
| `receiver_player_id` | BIGINT | 接收者角色 ID（世界消息为 `NULL`） |
| `content` | VARCHAR(1024) | 消息内容（服务层已截断到 500） |
| `created_at` | TIMESTAMP | 发送时间 |
| 索引 | `idx_chat_channel(channel)`、`idx_chat_receiver(receiver_player_id)` | 按频道与接收者查询 |

## 组队系统

服务 `com.mtxgdn.game.service.TeamService`（单例，**纯内存**），指令 `com.mtxgdn.onebot.command.team.TeamCommand`。

| 指令 | 说明 |
| --- | --- |
| `/组队 创建` | 创建队伍，返回队伍 ID；已在队伍中会失败 |
| `/组队 邀请 <玩家名>` | 队长邀请玩家（需为队长、队伍未满、对方不在其他队伍） |
| `/组队 接受` | 接受邀请并加入队伍 |
| `/组队 拒绝` | 拒绝邀请 |
| `/组队 退出` | 退出队伍 |
| `/组队 信息` | 查看队伍 ID、队长 ID、人数（`n/5`）、成员列表 |
| `/组队 副本 <秘境名>` | 以团队形式进入秘境（如 `/组队 副本 暗黑森林`） |

规则与限制：

| 项目 | 值 |
| --- | --- |
| 队伍人数 | 最少 2 人、最多 5 人（`MIN_TEAM_SIZE = 2`、`MAX_TEAM_SIZE = 5`） |
| 分类 | "宗门"（源码中 `TeamCommand` 的 category 为"宗门"） |
| 模块 | `team` |
| 副本入口 | 转发到 `SecretRealmService.enterRaid`，由秘境侧校验人数与秘境名 |

::: warning 队伍状态不持久化
`TeamService` 用 `ConcurrentHashMap` 保存队伍与待处理邀请，**服务重启后所有队伍消失**，
且多实例部署时各实例的队伍互不可见。
:::

## 排行榜

指令 `/排行榜 [power|wealth|境界|战力]`，别名 `排行`、`rank`、`rank2`；模块 `rank`，分类"社交"。
每类固定取**前 10 名**，无参数时默认境界榜。

| 参数 | 榜单 | 排序规则（SQL） | 展示附带说明 |
| --- | --- | --- | --- |
| 无 / `境界` / 其他 | 境界排行榜 | `ORDER BY realm DESC, experience DESC` | — |
| `power` / `战力` | 战力排行榜 | `ORDER BY (attack + defense + speed + max_hp) DESC` | 战力 = 攻击 + 防御 + 速度 + 生命上限 |
| `wealth` / `财富` | 财富排行榜 | `ORDER BY (gold + 折算灵石) DESC` | 财富 = 金币 + 灵石 |

灵石折算按品质加权（`getTopByWealth`）：

| 物品 key | 折算价值 |
| --- | --- |
| `mtxgdn:spirit_stone` / `mtxgdn:spirit_stone_low` | ×1 |
| `mtxgdn:spirit_stone_mid` | ×1000 |
| `mtxgdn:spirit_stone_high` | ×1000000 |
| `mtxgdn:spirit_stone_supreme` | ×1000000000 |

::: tip 战力榜读的是数据库原始列
`getTopByPower` 排序用的是 `players` 表的 `attack/defense/speed/max_hp` **裸值**，
不含称号、装备强化、功法装备带来的最终属性（那些是运行时计算的）。
:::

## 玩家搜索

指令 `/查人 <名称>`，别名 `查找`、`search`、`playersearch`；模块 `search`，分类"社交"。

| 项目 | 规则 |
| --- | --- |
| 匹配方式 | `name LIKE %关键字%`（`PlayerService.searchPlayersByName`） |
| 结果上限 | `PlayerSearchCommand.MAX_RESULTS = 10` |
| 排序 | `ORDER BY level DESC, experience DESC` |
| 展示字段 | 名称、境界名（`realmName`，空则显示"凡人"）、等级等 |

搜索也是其他玩法的"选人"基础设施：`/私聊`、`/好友`、`/组队 邀请`、`/挑战`、`/发放` 都通过它把名字解析为角色 ID
（均取**第一条**匹配结果，因此重名或名字相似时可能选到非预期目标）。

## 相关页面

- [PVP 对战](./pvp) —— 切磋挑战与每日次数限制
- [宗门系统](./sect) —— 宗门内的成员关系
- [秘境探索](./secret-realm) —— 团队副本入口
- [玩家玩法总览与全指令表](./)
