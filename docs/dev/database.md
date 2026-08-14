# 数据库设计

服务端支持 **MySQL / SQLite** 双数据库（`DatabaseManager` + 方言适配），启动时自动建表与迁移。共 **41 张表**。

> 注：数据库连接使用 `DriverManager` 直连（**无连接池**）；启动时逐条执行建表语句并运行「尽力迁移」（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，失败静默跳过）。

## 核心表

| 表 | 说明 |
|------|------|
| `users` | 用户账户（用户名、BCrypt 密码、邮箱、锁定状态） |
| `verification_codes` | 邮箱验证码 |
| `players` | 玩家主表（属性、境界、修炼状态、灵根、地图位置、战斗策略） |
| `players_items` | 背包（UNIQUE(player_id, item_key)） |
| `players_equipment` | 装备栏（player_id, slot, item_key, enhance_level） |
| `players_skills` | 已学技能（等级、熟练度） |
| `players_techniques` | 已学功法（等级、熟练度、是否装备） |
| `player_buffs` | 临时 Buff（过期时间、四项加成） |
| `player_daily` | 每日数据（晨修、机缘计数、活跃天数、共鸣奖励标记） |
| `player_economy` | 经济统计（签到、修炼加速次数、灵石收支） |
| `player_bank` | 灵庄存款（类型、本金、利息、到期时间） |
| `player_energy` | 能量转化值 |
| `player_titles` | 玩家称号 |
| `player_action_logs` | 玩家行为日志 |

## 内容定义表

| 表 | 说明 |
|------|------|
| `skills` | 技能定义（伤害、蓝耗、境界要求、类型） |
| `techniques` | 功法定义（六维加成、百分比加成、升级费用） |
| `recipes` | 制造配方（材料、费用、成功率、品质概率） |
| `map_locations` | 地图地点（名称、区域、境界门槛、安全区） |
| `map_connections` | 地点连接（路程耗时） |
| `caves` | 洞府（等级、灵气、加成） |
| `formations` | 阵法（等级、各类加成、到期时间） |
| `farm_plots` | 农田地块（状态、水分、肥力、病虫害、品质） |

## 社交与经济表

| 表 | 说明 |
|------|------|
| `friends` | 好友关系（双向两行，pending/accepted） |
| `chat_messages` | 聊天消息（世界 / 私聊） |
| `sects` | 宗门（等级、声望、成员上限） |
| `sect_members` | 宗门成员（职位、贡献） |
| `sect_applications` | 入宗申请 |
| `sect_warehouse` | 宗门仓库（UNIQUE(sect_id, item_key)） |
| `sect_wars` | 宗门战记录 |
| `trade_listings` | 坊市挂单（价格、手续费、状态） |
| `auction_listings` | 拍卖挂单（起价、当前价、7% 费率、结束时间） |
| `auction_bids` | 拍卖出价 |
| `redeem_codes` | 兑换码 |
| `redeemed_codes` | 兑换码使用记录（UNIQUE(code_id, player_id)） |

## 认证与权限表

| 表 | 说明 |
|------|------|
| `qq_bindings` | QQ 与用户绑定（双向唯一） |
| `mc_bindings` | Minecraft 与用户绑定 |
| `roles` | 角色（权限组）定义 |
| `permissions` | 权限码字典 |
| `role_permissions` | 角色 → 权限关联 |
| `user_roles` | 用户 → 角色关联 |
| `user_permissions` | 用户直接权限（由 PermissionService 创建） |

## 方言差异

| 项目 | MySQL | SQLite |
|------|-------|--------|
| 主键 | `BIGINT AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| 布尔 | `BOOLEAN DEFAULT FALSE` | `INTEGER DEFAULT 0` |
| updated_at | `ON UPDATE CURRENT_TIMESTAMP` | 无 ON UPDATE |
| 建表内联索引 | 支持（chat_messages） | 不支持 |
| 外键开关 | `SET FOREIGN_KEY_CHECKS` | `PRAGMA foreign_keys` |

## 迁移机制

启动时在 38 张基础表后执行迁移：补列（`battle_strategy`、`last_travel_time`、`enhance_level`、配方品质列等）、建表（`player_buffs`、`farm_plots` 及扩展列）。迁移语句 `try/catch` 静默，属尽力迁移。

## 数据清除

- `clearPlayerData`：删除 26 张玩家相关表（保留 users 与权限）
- `resetAllData`：删除 34 张表并重建默认角色 / 权限

## 玩家数据文件

玩家数据可导出为 `data/players/<playerId>.json` 文件（16 张个人表快照），支持定期自动落盘与管理员导出 / 还原。详见 [内部服务 API](./internal-api) 与 [REST API](./rest-api)。

## 相关文档

- 表结构与业务逻辑对照 → 各玩法页面
- 配置 → [配置说明](./config)
