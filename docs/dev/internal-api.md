# 内部服务 API

内部业务逻辑封装在 `com.mtxgdn.game.service` 服务层，通过 `ServiceRegistry`（26 个懒加载单例 getter）统一获取。指令层、REST 层与插件层都经由服务注册表访问。

## ServiceRegistry

| Getter | 返回类型 | 职责 |
|--------|----------|------|
| getPlayerService | PlayerService | 角色创建 / 属性 / 经验 / 排行榜 |
| getRealmService | RealmService | 境界突破 / 天劫 |
| getItemService | ItemService | 背包 / 物品使用 / 装备 / 灵石 |
| getSecretRealmService | SecretRealmService | 秘境探索 / 团队副本 |
| getExplorationService | ExplorationService | 游历探索 |
| getGuideService | NewbieGuideService | 新手引导 |
| getSkillService | SkillService | 技能学习 / 熟练度 |
| getCombatService | CombatService | PVP / PVE 战斗 |
| getDailyService | DailyService | 每日系统（晨修 / 天象 / 机缘） |
| getTradeService | TradeService | 坊市交易 |
| getHeartDemonService | HeartDemonService | 心魔判定 |
| getChatService | ChatService | 聊天 |
| getFriendService | FriendService | 好友 |
| getEnhanceService | EnhanceService | 装备强化 |
| getCraftingService | CraftingService | 制造 |
| getTechniqueService | TechniqueService | 功法 |
| getSectService | SectService | 宗门 |
| getEconomyService | EconomyService | 经济（签到 / 回收 / 灵庄 / 拍卖 / 提纯） |
| getEnergyService | EnergyService | 能量转化 |
| getTitleService | TitleService | 称号 |
| getCaveService | CaveService | 洞府 |
| getFormationService | FormationService | 阵法 |
| getBuffService | BuffService | Buff |
| getFarmService | FarmService | 农场 |
| getMcBindingService | MinecraftPlayerBindingService | MC 绑定 |
| getMapService | MapService | 世界地图 |

## 玩家数据文件化（PlayerDataService）

| 能力 | 说明 |
|------|------|
| 文件路径 | `data/players/<playerId>.json` |
| 内容 | 玩家主行 + 16 张个人表行快照（JSON，原子写入） |
| 自动落盘 | `player-data.auto-sync-seconds`（默认 30 秒）定期同步脏数据 |
| 导出 | 玩家自助（`POST /api/game/player/data/export`）/ 管理员（`/api/admin/player-data/*`） |
| 还原 | 管理员 `restoreFromFile`；玩家自助还原需 `self-restore=true` |

## 工具类

| 类 | 说明 |
|------|------|
| `JwtUtil` | 用户 JWT（HS256，7 天；无 refresh token） |
| `RateLimiter` | 固定时间窗口频率限制 |
| `TokenBlacklist` | 登出令牌黑名单（内存） |
| `LangManager` | i18n（JSON 语言文件，插件可合并） |
| `GameLogger` | 日志（控制台 + 文件 + 内存环形日志） |
| `PlayerActionLogger` | 玩家行为日志（控制台 + 文件 + DB） |
| `StatsCollector` | 消息 / 指令统计（内存） |
| `TextSanitizer` | 文本清理（HTML 转义 / 昵称净化） |
| `EmailService` / `VerificationCodeService` | 邮件验证码 |
| `OAuthService` | OAuth2 client_credentials |

## 事件总线（插件）

10 种事件：`COMMAND` / `PLAYER_LOGIN` / `PLAYER_LOGOUT` / `ITEM_USED` / `COMBAT_ENDED` / `EXPLORATION_START` / `EXPLORATION_END` / `SCHEDULED` / `SERVER_READY` / `CUSTOM`。支持优先级与取消。详见 [插件开发](./plugin-development)。

## 相关文档

- 插件如何访问这些服务 → [插件开发](./plugin-development)
- 服务对应的玩法 → [玩家指南](../player/spiritual-root)
