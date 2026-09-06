# 权限系统

本文按 **V1.4.1-beta2** 代码（`com.mtxgdn.permission` 包 + 各层调用点）说明服务端 RBAC 权限模型、角色与权限码清单、各接入层（REST / WebSocket / OneBot / QQ 官方）的校验方式，以及新增指令/端点如何声明权限。全文以代码为准。

## 模型与术语

| 概念 | 说明 |
|------|------|
| 权限组 / 角色（role） | 一组权限码的集合：名称（唯一）、显示名、等级（用于排序与层级判断）。`PermissionService` 注释明确「原有系统中的角色在逻辑上等同于权限组」，代码中二者混用（表名为 `roles`，DB 字段 `role_name`） |
| 权限（permission） | 细粒度操作许可，如 `game.player.info`、`admin.users.manage`。内置权限由枚举 `PermissionCode` 定义（70 个）；插件可用 `registerPluginPermission` 注册自定义码 |
| 用户（user） | 可属于多个权限组；**有效权限 = 所有角色权限的并集 + 直接分配的权限**（`user_permissions` 表） |
| 默认角色 | `getDefaultRoleName()`：取等级 ≤ `permission.default.role.level`（默认 10）的最高角色 → 内置 `PLAYER`；用户无任何角色时按默认角色计算权限 |
| 多角色 | `PermissionService.getUserRoles` 全量返回；`hasPermission` 对角色并集 + 直接分配逐项判断。**不存在「高等级自动继承低等级」逻辑** |

数据模型落库为 5 张 RBAC 表：`roles`（角色名/显示名/等级）、`permissions`（权限码字典：code/name/category）、`role_permissions`（角色→码）、`user_roles`（用户→角色）、`user_permissions`（用户直接授权，`PermissionService.initDefaultData` 创建）。见 [数据库设计](./database)。

## 默认角色层级

启动时 `PermissionService.initDefaultData()` 以 `INSERT OR IGNORE`（SQLite/MySQL 方言各异）幂等写入 5 个内置角色与映射；内置角色**不可删除**（`deleteGroup` 拒绝）：

| 角色 | level | 权限构成（`buildDefaultGroupPermissions()` 代码原文语义） |
|------|:---:|------|
| `SUPER_ADMIN` | 100 | 全部 70 个权限码 |
| `ADMIN` | 80 | 全部权限码，**去掉** `admin.roles.manage`、`admin.users.manage`、`admin.database.clear_players`、`admin.database.reset_all` |
| `MODERATOR` | 50 | PLAYER 的全部 + `admin.login`、`admin.status`、`admin.logs.view`、`qq.command.admin`、`admin.blacklist.view` |
| `PLAYER` | 10 | 所有 `game.*` 与 `qq.*` 前缀码，**排除** `admin.*`、`qq.command.admin`、`game.item.add`（发放类归管理员，玩家不可自刷） |
| `GUEST` | 0 | 仅 `qq.command.basic` |

> 权限生效按**并集**计算，等级只用于排序/默认角色/移除保护，不产生继承。运行时 `refreshGroupCache()` 若发现内置角色在 DB 中缺少默认权限码（例如新版本新增枚举码），会自动补写 `role_permissions`（仍按各自构成规则：如新增 `game.*` 码自动进 PLAYER）。

## 权限码清单（共 70 个，来源：PermissionCode 枚举）

### game.*（游戏功能，42 个）

`game.player.info` 查看角色信息 · `game.player.create` 创建角色 · `game.cultivate` 修炼 · `game.explore` 探索 · `game.secret_realm` 秘境探索 · `game.realm.breakthrough` 境界突破 · `game.item.use` 使用物品 · `game.inventory.view` 查看背包 · `game.item.registry` 查看物品图鉴 · `game.realm.config` 查看境界配置 · `game.skill.learn` 学习技能 · `game.item.add` 添加物品 · `game.pvp.challenge` PVP挑战 · `game.technique.learn` 学习功法 · `game.technique.equip` 装备功法 · `game.technique.upgrade` 升级功法 · `game.crafting.recipes` 查看配方 · `game.crafting.craft` 制造物品 · `game.equipment.enhance` 装备强化 · `game.equipment.equip` 装备物品 · `game.market.trade` 坊市交易 · `game.chat.world` 世界聊天 · `game.chat.private` 私聊 · `game.rank.view` 查看排行榜 · `game.friend.manage` 好友管理 · `game.sect.manage` 宗门管理 · `game.sect.donate` 宗门捐献 · `game.sect.warehouse` 宗门仓库 · `game.cave.manage` 洞府管理 · `game.daily` 每日系统 · `game.market.view` 查看坊市 · `game.market.list` 坊市上架 · `game.market.buy` 坊市购买 · `game.market.cancel` 坊市撤单 · `game.secretrealm.enter` 进入秘境 · `game.title.view` 查看称号 · `game.title.equip` 装备称号 · `game.stone.purify` 提纯灵石 · `game.redeem.code` 兑换码 · `game.team.manage` 团队管理 · `game.team.view` 查看团队 · `game.secret_realm.enter` 进入秘境

> 注意枚举中存在三个“秘境”相关码：`game.secret_realm`（秘境探索）、`game.secretrealm.enter` 与 `game.secret_realm.enter`（均为「进入秘境」，下划线写法不同，是两个独立码）。

### qq.*（QQ 通道，6 个）

`qq.bind` 绑定QQ · `qq.unbind` 解绑QQ · `qq.command.basic` 基本查询指令 · `qq.command.game` 游戏操作指令 · `qq.command.admin` 管理指令 · `qq.command.trace` 查看玩家轨迹

> `qq.*` 主要为角色构成与权限字典保留（`qq.command.admin` 明确从 PLAYER 排除、GUEST 只配 `qq.command.basic`）；实际指令校验大多直接声明更具体的 `game.*` / `admin.*` 码。指令级直接引用示例：`TraceCommand` 声明 `qq.command.trace`。

### admin.*（管理后台，22 个）

`admin.login` 登录管理后台 · `admin.status` 查看服务器状态 · `admin.logs.view` 查看日志 · `admin.shutdown` 关闭服务器 · `admin.users.manage` 管理用户 · `admin.roles.manage` 管理权限 · `admin.database.clear_players` 清除玩家数据 · `admin.database.reset_all` 重置全部数据 · `admin.database.access` 数据库访问 · `admin.redeem.code.manage` 管理兑换码 · `admin.blacklist.view` 查看黑名单 · `admin.blacklist.manage` 管理黑名单 · `admin.onebot.group.config` 管理OneBot群组配置 · `admin.plugins.manage` 管理插件 · `admin.titles.manage` 管理称号 · `admin.debug` 调试指令 · `admin.fix.equipment` 修复装备数据 · `admin.oauth.manage` 管理OAuth2配置 · `admin.adapters` 管理适配器 · `admin.config.manage` 管理配置 · `admin.economy` 管理经济 · `admin.items.give` 发放物品

## 权限校验链路（各接入层）

| 场景 | 校验点 | 行为 |
|------|--------|------|
| REST：`/api/game/*` 显式端点（`GameResource` 等） | `@RequirePermission("game.xxx")`（类或方法级注解）+ `PermissionFilter` | `JwtAuthFilter` 先验玩家 JWT 注入 `userId`；`PermissionFilter` 读取注解码，缺失则 401「未登录」，`hasPermission(userId, 码)` 不通过则 403「权限不足: <码>」。`super_admin` 角色（管理 JWT 的 role claim）直接放行 |
| REST：`/api/admin/*` | `AdminAuthFilter`（`POST /admin/login` 放行；验管理 JWT 或玩家自我端点）+ `@RequirePermission("admin.xxx")` + `PermissionFilter` | 管理 JWT 12 小时（claim：userId/username/role）；角色白名单 `admin / super_admin / moderator`。`PermissionFilter` 对注解码校验，`userId` 优先取 `userId`、其次 `adminUserId` |
| REST：指令即路由（`UnifiedRestResource`，`/game/{path}` 动态分发） | `RouteDefinition` 声明的指令级 permission | 分发前 `PermissionService.hasPermission(userId, 码)`；`admin/` 前缀路径允许 admin JWT（哨兵 userId=0） |
| 管理后台 / 管理 REST 端点 | `AdminResource` 方法级 `@RequirePermission` | 覆盖 `admin.status`、`admin.users.manage`、`admin.roles.manage`、`admin.database.*`、`admin.adapters` 等（见下表） |
| WebSocket（游戏网关） | `GameWebSocketApp`：消息 `type` → `checkWsPermission(socket, msgId, userId, 码)` | 每个动作 case 显式映射所需码，如 `sect_*` → `game.sect.manage`（`sect_donate` → `game.sect.donate`、`sect_take` → `game.sect.warehouse`）、`map_*` → `game.player.info`；不通过回 `error` 帧「权限不足: <码>」 |
| OneBot QQ 通道 | `OneBotWebSocketServer.dispatchCommand` | 取 `command.getPermission()`，绑定的用户无此码即回「权限不足」；随后 `Command.execute()` 内再用 `CommandContext.checkPermission/requirePermission` 二次校验 |
| QQ 官方通道 | `QqOfficialAdapter` 消息路由 | 同样的指令级码预检 + `CommandContext` 内校验（平台感知绑定：openid ↔ 用户） |
| Minecraft 通道 | `MinecraftCommandContext`（复用 `CommandContext`） | 绑定用户 UUID ↔ user_id 后走同一套校验 |

### 指令如何声明权限

指令继承 `Command`，在构造器中传入权限码（第 5 参）；无码传 null。默认 `execute()` 的校验顺序：绑定 → **指令级权限码** → 取角色 → 子命令分发：

```java
// com.mtxgdn.onebot.command.combat.LearnSkillCommand
public LearnSkillCommand() {
    super(new String[]{"学习", "learn"}, "学习指定技能（支持名称或ID）",
          "/学习 <技能名称或ID>", "战斗", "game.skill.learn");   // 分类"战斗"，权限码 game.skill.learn
}
```

常见声明示例：`/背包` `game.inventory.view`、`/装备` `game.equipment.equip`、`/上架` `game.player.info`（+ `setModule("trade")` 模块门控）、管理类指令 `admin.status` / `admin.logs.view` / `admin.economy` / `admin.fix.equipment` / `admin.debug` 等。指令也可在 `execute` 内按需二次 `PermissionService.hasPermission`（如 `GiveCommand`）。帮助列表按 `shouldShowInHelp` 过滤：无权限的指令不展示。

### 内置玩法模块门控与权限的关系

指令/路由还带 `module`（如 `farm`、`sect`）属性；模块停用（`built_in_plugins.*=false`）时 `CommandRegistry` 直接取不到该指令（三层门控一致），与权限码检查是**两条独立正交的门**。

## 管理后台与 QQ 管理指令的权限分布（示例）

| 权限码 | 典型用途（代码内真实标注，非穷举） |
|--------|------------------------------------|
| `admin.status` | `/admin/status`、玩家列表、物品/境界/称号查询、`GET /admin/status`、`GET /admin/players*` 等大量只读端点；QQ 侧 `StatusCommand` / `UsersRolesCommand` / `GiveCommand` 等 |
| `admin.logs.view` | `GET /admin/logs`、QQ `LogsCommand` |
| `admin.users.manage` | `POST /admin/user/{id}/role`、`DELETE .../role/{name}`、`POST /admin/user/create-admin`、用户直接权限增删、删除用户、改密、`/admin/authority` |
| `admin.roles.manage` | 角色/权限组 CRUD：`GET/POST /admin/roles`、`/admin/permissions`、`/admin/groups*`（含整组权限 set） |
| `admin.database.clear_players` / `admin.database.reset_all` | `/admin/database/clear_players`、`/admin/database/reset_all`、按玩家清除接口 |
| `admin.database.access` | `/admin/db/tables*` 表浏览/增删改（行级白名单校验，见[数据库设计](./database)） |
| `admin.plugins.manage` | `/admin/plugins/*`（list/reload/enable/disable/load、watcher start/stop） |
| `admin.adapters` | `/admin/adapters`（get/update/reload） |
| `admin.blacklist.manage` / `admin.blacklist.view` | `/admin/blacklist*`（增删查；view 入 MODERATOR） |
| `admin.onebot.group.config` | `/admin/onebot/groups*` |
| `admin.titles.manage` | 称号目录与玩家称号发放/撤销 |
| `admin.config.manage` | `/admin/newbie-reward/config`（新人奖励配置读写） |
| `admin.oauth.manage` | `/admin/oauth*` |
| `admin.items.give` | `POST /game/admin/give`（GameResource 内）等发放端点 |
| `admin.economy` | QQ `EconomyStatsCommand`（全服经济） |
| `admin.shutdown` | `POST /admin/shutdown` |
| `admin.fix.equipment` | 装备数据一致性修复（管理端点与 QQ `FixEquipmentCommand`） |
| `admin.debug` | QQ `DebugCommand` |

管理后台登录双轨：`admin.username + admin.password_hash`（bcrypt）已配置则优先；否则回退数据库用户认证（拥有 `admin.login` 权限或 ADMIN/SUPER_ADMIN/MODERATOR 角色者，`AdminAuthFilter.validateDbCredentials`），角色字符串由 `getAdminRole` 推导（内置账号配置存在时登录者即 `super_admin`）。

**角色移除保护**：`AdminResource.removeRole` 与 `PermissionService.removeRole` 均检查——被移除角色等级 ≥ 该用户当前最高角色等级时不执行移除（防止把用户自持的最高权限角色摘掉；低等级角色可正常移除）。

## 权限码的动态管理（管理台）

| 操作 | 说明 |
|------|------|
| 查看用户与角色 | `GET /admin/users`（含每用户直接权限码）；`GET /admin/roles`、`/admin/permissions`、`/admin/groups` |
| 分配/移除角色 | `POST/DELETE /admin/user/{userId}/role[/{roleName}]`（`admin.users.manage`） |
| 用户直接授权 | `GET/POST /admin/user/{userId}/permissions`、`DELETE .../permissions/{permissionCode}`（`admin.users.manage`；`assignPermission` 需码有效） |
| 权限组管理 | `POST /admin/groups`（建组：name/displayName/level）、`POST/DELETE /admin/groups/{name}`、`POST /admin/groups/{name}/permissions`、`DELETE .../permissions/{code}`、`POST .../permissions/set`（整组覆盖，`admin.roles.manage`）；内置组不可删 |
| 创建管理员 | `POST /admin/user/create-admin`（建用户 + 指定角色 + 自动补 PLAYER，`admin.users.manage`） |
| QQ 管理指令 | `/用户列表`（admin.status）、`/日志`（admin.logs.view）、`/发放`、`/修为`、`/调试` 等（管理分类，私聊限定常见） |

## 插件自定义权限码

插件在 `onLoad/onEnable` 阶段调用 `PermissionService.registerPluginPermission(code, name, category)`：写入 `permissions` 表（`INSERT OR IGNORE`）、进入 `hasPermission / assignPermission / isValidPermissionCode` 等全部校验路径。**注意：插件权限码不会自动分配给任何角色/用户**，需管理员在管理台手动分配；与内置枚举同码或重复注册会抛异常。另见 [插件开发](./plugin-development)。

## 新增指令 / 端点如何声明权限

1. 从 `PermissionCode` 枚举选用一个语义匹配的内置码（或先用 `registerPluginPermission` 注册自定义码）。
2. 指令：构造器 `super(names, desc, usage, category, "权限码")`；需要模块门控再加 `setModule("xxx")`。
3. REST 端点：方法（或类）上加 `@RequirePermission("权限码")`；过滤器自动生效，无需手写校验。
4. WebSocket 动作：在 `GameWebSocketApp` 动作分发处 `checkWsPermission(..., "权限码")`。
5. 若该码应默认授予玩家：确认前缀为 `game.`/`qq.`（非 `qq.command.admin`/`game.item.add`），`refreshGroupCache` 会自动补进 PLAYER 等默认组；`admin.*` 码则需显式授权给管理员角色。

## 相关文档

- 默认角色数据如何初始化 → [数据库设计](./database)
- 鉴权分层与令牌 → [架构总览](./architecture#鉴权分层)
- REST 端点完整清单 → [REST API](./rest-api)
- QQ 指令清单 → [QQ 指令](./qq-commands)
- 插件注册权限 → [插件开发](./plugin-development)
