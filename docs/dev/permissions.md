# 权限系统

服务端采用 **RBAC + 权限码** 模型：用户 → 角色（权限组）→ 权限码，另支持用户级直接权限分配。权限码由 `PermissionCode` 枚举定义（共 **70 个**：game.* 42 + qq.* 6 + admin.* 22）。

## 角色层级

| 角色 | level | 权限 |
|------|:---:|------|
| SUPER_ADMIN | 100 | 全部 70 个权限码 |
| ADMIN | 80 | 除用户 / 权限管理、数据库清除 / 重置外的全部 |
| MODERATOR | 50 | 玩家权限 + 管理后台查看（status / logs / 黑名单查看 / qq.command.admin） |
| PLAYER | 10 | 全部 game.* + 除 qq.command.admin 外的 qq.* |
| GUEST | 0 | 仅 qq.command.basic |

> 注：**不存在**「高等级角色自动继承低等级角色权限」的代码逻辑；实际权限 = **用户全部角色的权限并集 + 直接分配权限**（无角色用户回退 PLAYER）。

## 权限码

### game.*（游戏功能，42 个）

`game.player.info`、`game.player.create`、`game.cultivate`、`game.explore`、`game.secret_realm`、`game.realm.breakthrough`、`game.item.use`、`game.inventory.view`、`game.item.registry`、`game.realm.config`、`game.skill.learn`、`game.item.add`、`game.pvp.challenge`、`game.technique.learn`、`game.technique.equip`、`game.technique.upgrade`、`game.crafting.recipes`、`game.crafting.craft`、`game.equipment.enhance`、`game.equipment.equip`、`game.market.trade`、`game.chat.world`、`game.chat.private`、`game.rank.view`、`game.friend.manage`、`game.sect.manage`、`game.sect.donate`、`game.sect.warehouse`、`game.cave.manage`、`game.daily`、`game.market.view`、`game.market.list`、`game.market.buy`、`game.market.cancel`、`game.secretrealm.enter`、`game.title.view`、`game.title.equip`、`game.stone.purify`、`game.redeem.code`、`game.team.manage`、`game.team.view`、`game.secret_realm.enter`

### qq.*（QQ 指令，6 个）

`qq.bind`、`qq.unbind`、`qq.command.basic`、`qq.command.game`、`qq.command.admin`、`qq.command.trace`

### admin.*（管理后台，22 个）

`admin.login`、`admin.status`、`admin.logs.view`、`admin.shutdown`、`admin.users.manage`、`admin.roles.manage`、`admin.database.clear_players`、`admin.database.reset_all`、`admin.database.access`、`admin.redeem.code.manage`、`admin.blacklist.view`、`admin.blacklist.manage`、`admin.onebot.group.config`、`admin.plugins.manage`、`admin.titles.manage`、`admin.debug`、`admin.fix.equipment`、`admin.oauth.manage`、`admin.adapters`、`admin.config.manage`、`admin.economy`、`admin.items.give`

## 校验流程

| 场景 | 校验 |
|------|------|
| REST 端点 | `@RequirePermission("game.xxx")` 注解 + PermissionFilter；管理员 JWT 通过视为全权限 |
| QQ 指令 | 指令构造时声明权限码，执行时 `PermissionService.hasPermission` |
| WebSocket | 消息处理时按 type 声明权限 |
| 插件 | `registerPermission()` 注册自定义码（不自动分配） |

## 动态授权

| 操作 | API |
|------|-----|
| 分配 / 移除角色 | `POST/DELETE /api/admin/user/{userId}/role...` |
| 直接分配权限 | `POST/DELETE /api/admin/user/{userId}/permissions...` |
| 权限组管理 | `/api/admin/groups...`（创建 / 删除 / 组权限） |
| 创建管理员 | `POST /api/admin/user/create-admin` |

保护规则：移除角色时仅当操作者最高角色等级 ≤ 目标角色等级才允许（防止自降 / 移除同级以上角色）。

## 默认角色初始化

启动时自动补写默认角色 → 权限映射（`INSERT OR IGNORE`）：

- 新增的 `game.*` / `qq.*` 前缀权限码（**枚举内**）自动授予 PLAYER
- SUPER_ADMIN 拥有全部权限；ADMIN 排除用户 / 权限管理与数据清除
- 插件注册的权限码不会自动分配，需管理员手动授权

## 相关文档

- 权限码在 API 上的应用 → [REST API](./rest-api)、[QQ 指令](./qq-commands)
- 插件权限注册 → [插件开发](./plugin-development)
