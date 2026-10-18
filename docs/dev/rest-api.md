# REST API

服务端使用 Jersey 4 + Grizzly 提供 REST 接口。所有接口挂在**同一个 HTTP 端口**上
（`server.host` / `server.port`，默认 `127.0.0.1:8080`）。

## 基路径

Jersey 的 `ResourceConfig` 扫描 `com.mtxgdn.rest` 包，
Grizzly 把服务绑定在：

```java
GrizzlyHttpServerFactory.createHttpServer(
    URI.create("http://" + serverHost + ":" + serverPort + "/api/"), config);
```

::: tip 所以所有路径都要加 `/api` 前缀
资源类上的 `@Path("/game")` 实际访问地址是 **`/api/game/...`**，
`@Path("/admin")` 是 **`/api/admin/...`**。

本页下面所有路径都已省略 `/api` 前缀，实际请求请自行补上。
:::

| 分组 | 前缀 | 说明 |
| --- | --- | --- |
| 玩家游戏接口 | `/api/game/**` | 玩法操作，需要玩家 JWT |
| 账号接口 | `/api/auth/**` | 注册、登录、改密、找回密码 |
| 管理后台接口 | `/api/admin/**` | 需要管理员 Token + 权限码 |
| OAuth2 | `/api/auth/oauth/**` | 独立授权端点 |
| 安装向导 | `/api/install/**` | 仅未完成安装时可用 |
| 其他 | `/api/mc-command`、`/api/test/test` | Minecraft 指令通道、连通性测试 |

## 鉴权

| 接口组 | 鉴权方式 | 过滤器 |
| --- | --- | --- |
| `/api/game/**`、`/api/auth/**` | 玩家 JWT（`Authorization: Bearer <token>`） | `JwtAuthFilter` |
| `/api/admin/**` | 管理员 Token | `AdminAuthFilter` |
| 业务权限 | 方法/类上的 `@RequirePermission` | `PermissionFilter` |

::: danger 默认只监听本机
`server.host` 默认 `127.0.0.1`，**外网访问不到**。要对公网提供接口，
必须改成 `0.0.0.0`，并自行配置反向代理、TLS 与防火墙。
:::

### 权限校验

管理端接口逐个方法声明了 `@RequirePermission(PermissionCode.XXX)`。
`PermissionFilter` 的判定顺序：

1. 取**方法**上的注解，没有则取**类**上的
2. `adminRole == "super_admin"` → **直接放行**（内置管理员账号恒为此角色）
3. 未登录 → `401`
4. 无权限 → `403`

```json
{"code":401,"message":"未登录"}
{"code":403,"message":"权限不足: admin.economy"}
```

详见[权限系统](/dev/permissions)。

### 模块门控

`ModuleGateFilter` 会拦截被**停用插件**所属的接口。
若某个模块在 `config/plugins.yml` 里为 `false`，其接口即使权限足够也会被拒绝。

## 统一响应格式

成功与失败使用同一套信封（`ApiResponse` / `GameMessage.restOk`）：

```json
{
  "code": 0,
  "message": "ok",
  "data": { }
}
```

| 字段 | 说明 |
| --- | --- |
| `code` | 业务码，**`0` 表示成功**（`GameErrorCode.OK`），非 0 为错误码 |
| `message` | 提示信息 |
| `data` | 业务数据，可能是对象、数组或 `null` |

::: danger 成功码是 0，不是 200
判定成功请用 `code == 0`（即 `ApiResponse.isSuccess()`），**不要**判断 `code == 200`。

HTTP 状态码与业务码是两套东西：请求成功时 **HTTP 状态是 200，而响应体里的 `code` 是 0**。
:::

### 错误码

错误码定义在 `GameErrorCode` 枚举里，按业务域分段：

| 区段 | 领域 |
| --- | --- |
| `0` | 成功 |
| `1001~1005` | 认证与账号 |
| `2001~2002` | 参数 |
| `3001~3002` | 角色 |
| `4001~4003` | 物品 |
| `5001~5005` | 境界与修炼 |
| `6001~6003` | 消息与限流 |
| `6101~6104` | 技能 |
| `7101~7102` | PVP |
| `8101~8104` | 秘境 |
| `8201~8202` | 游历 |
| `8301~8302` | 聊天 |
| `8401~8404` | 好友 |
| `9001~9002` | 系统 |

| 错误码 | 常量 | 含义 |
| --- | --- | --- |
| 0 | `OK` | ok |
| 1001 | `AUTH_INVALID_TOKEN` | token 无效或已过期 |
| 1002 | `AUTH_NOT_LOGGED_IN` | 请先登录 |
| 1003 | `AUTH_USERNAME_EXISTS` | 用户名已存在 |
| 1004 | `AUTH_EMAIL_EXISTS` | 邮箱已被注册 |
| 1005 | `AUTH_WRONG_PASSWORD` | 用户名或密码错误 |
| 2001 | `PARAM_MISSING` | 缺少必要参数 |
| 2002 | `PARAM_INVALID` | 参数格式错误 |
| 3001 | `PLAYER_NOT_FOUND` | 角色不存在，请先创建角色 |
| 3002 | `PLAYER_ALREADY_EXISTS` | 角色已存在 |
| 4001 | `ITEM_NOT_FOUND` | 物品不存在 |
| 4002 | `ITEM_COUNT_NOT_ENOUGH` | 物品数量不足 |
| 4003 | `ITEM_USE_FAILED` | 使用物品失败 |
| 5001 | `REALM_BREAKTHROUGH_FAILED` | 境界突破失败 |
| 5002 | `REALM_EXP_NOT_ENOUGH` | 经验不足 |
| 5003 | `REALM_SPIRIT_STONES_NOT_ENOUGH` | 灵石不足 |
| 5004 | `REALM_MAX` | 已达最高境界 |
| 5005 | `REALM_NOT_CULTIVATING` | 未在修炼状态 |
| 6001 | `UNKNOWN_TYPE` | 未知的消息类型 |
| 6002 | `MESSAGE_PARSE_ERROR` | 消息格式错误 |
| 6003 | `RATE_LIMITED` | 操作太频繁，请稍后再试 |
| 6101 | `SKILL_NOT_FOUND` | 技能不存在 |
| 6102 | `SKILL_ALREADY_LEARNED` | 技能已学习 |
| 6103 | `SKILL_REALM_TOO_LOW` | 境界不足，无法学习该技能 |
| 6104 | `SKILL_LEARN_FAILED` | 学习技能失败 |
| 7101 | `PVP_TARGET_NOT_FOUND` | 对手不存在 |
| 7102 | `PVP_SELF_TARGET` | 不能挑战自己 |
| 8101 | `SECRET_REALM_NOT_FOUND` | 秘境不存在 |
| 8102 | `SECRET_REALM_REALM_TOO_LOW` | 境界不足，无法进入该秘境 |
| 8103 | `SECRET_REALM_COOLDOWN` | 秘境冷却中，请稍后再试 |
| 8104 | `SECRET_REALM_HP_NOT_ENOUGH` | 生命值不足，无法进入秘境 |
| 8201 | `EXPLORATION_COOLDOWN` | 游历冷却中 |
| 8202 | `EXPLORATION_NO_EVENT` | 暂无可用游历事件 |
| 8301 | `CHAT_RECEIVER_NOT_FOUND` | 接收者不存在 |
| 8302 | `CHAT_SELF_MESSAGE` | 不能给自己发消息 |
| 8401 | `FRIEND_NOT_FOUND` | 好友不存在 |
| 8402 | `FRIEND_ALREADY_EXISTS` | 已经是好友或已发送过申请 |
| 8403 | `FRIEND_REQUEST_NOT_FOUND` | 好友申请不存在 |
| 8404 | `FRIEND_SELF_TARGET` | 不能添加自己为好友 |
| 9001 | `INTERNAL_ERROR` | 服务器内部错误 |
| 9002 | `NETWORK_ERROR` | 网络请求失败 |

::: warning 鉴权失败用的是 HTTP 风格码
`PermissionFilter` 返回的 `{"code":401,...}` 与 `{"code":403,...}` 属于**过滤器层的状态码**，
与上面的业务错误码不是一套。它们对应"未登录"与"权限不足"，HTTP 状态码同样是 401 / 403。
:::

异常由 `GenericExceptionMapper` 与 `EofExceptionMapper` 统一转成上述结构，
不会把 Java 堆栈直接吐给客户端。

## 玩家游戏接口 `/api/game/**`

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `GET` | `/game/buff` | `game.player.info` |
| `POST` | `/game/chat/private` | `game.chat.private` |
| `GET` | `/game/chat/private/{targetPlayerId}` | `game.chat.private` |
| `GET` | `/game/chat/world` | `game.chat.world` |
| `POST` | `/game/chat/world` | `game.chat.world` |
| `POST` | `/game/crafting/craft` | `game.crafting.craft` |
| `GET` | `/game/crafting/recipes` | `game.crafting.recipes` |
| `POST` | `/game/cultivate/start` | `game.cultivate` |
| `POST` | `/game/cultivate/stop` | `game.cultivate` |
| `GET` | `/game/daily` | `game.daily` |
| `POST` | `/game/daily/morning_cultivation` | `game.daily` |
| `POST` | `/game/economy/currency-exchange` | `game.player.info` |
| `GET` | `/game/equipment` | `game.inventory.view` |
| `POST` | `/game/equipment/enhance` | `game.equipment.enhance` |
| `POST` | `/game/equipment/equip` | `game.equipment.equip` |
| `POST` | `/game/equipment/unequip` | `game.equipment.equip` |
| `POST` | `/game/exploration` | `game.explore` |
| `POST` | `/game/farm/clear` | `game.player.info` |
| `POST` | `/game/farm/expand` | `game.player.info` |
| `POST` | `/game/farm/fertilize` | `game.player.info` |
| `POST` | `/game/farm/fertilize-all` | `game.player.info` |
| `POST` | `/game/farm/harvest` | `game.player.info` |
| `POST` | `/game/farm/harvest-all` | `game.player.info` |
| `POST` | `/game/farm/pesticide` | `game.player.info` |
| `POST` | `/game/farm/plant` | `game.player.info` |
| `GET` | `/game/farm/plots` | `game.player.info` |
| `POST` | `/game/farm/water` | `game.player.info` |
| `POST` | `/game/farm/water-all` | `game.player.info` |
| `POST` | `/game/friend/accept` | `game.friend.manage` |
| `POST` | `/game/friend/add` | `game.friend.manage` |
| `GET` | `/game/friend/list` | `game.friend.manage` |
| `GET` | `/game/friend/pending` | `game.friend.manage` |
| `POST` | `/game/friend/reject` | `game.friend.manage` |
| `POST` | `/game/friend/remove` | `game.friend.manage` |
| `POST` | `/game/heal` | `game.player.info` |
| `GET` | `/game/inventory` | `game.inventory.view` |
| `POST` | `/game/item/add` | `admin.items.give` |
| `GET` | `/game/item/registry` | `game.item.registry` |
| `POST` | `/game/item/use` | `game.item.use` |
| `GET` | `/game/map` | `game.player.info` |
| `POST` | `/game/map/gather` | `game.player.info` |
| `GET` | `/game/map/locations` | `game.player.info` |
| `POST` | `/game/map/travel/{locationId}` | `game.player.info` |
| `GET` | `/game/map/wilderness` | `game.player.info` |
| `GET` | `/game/market` | `game.market.view` |
| `POST` | `/game/market/buy` | `game.market.buy` |
| `POST` | `/game/market/cancel` | `game.market.cancel` |
| `POST` | `/game/market/list` | `game.market.list` |
| `GET` | `/game/market/my_listings` | `game.market.view` |
| `GET` | `/game/market/price` | `game.market.view` |
| `GET` | `/game/player` | `game.player.info` |
| `POST` | `/game/player/create` | `game.player.create` |
| `POST` | `/game/player/data/export` | `game.player.info` |
| `POST` | `/game/player/data/restore` | `game.player.info` |
| `GET` | `/game/players` | `game.player.info` |
| `GET` | `/game/players/search` | — |
| `POST` | `/game/pvp/challenge` | `game.pvp.challenge` |
| `POST` | `/game/raid/enter` | `game.secretrealm.enter` |
| `GET` | `/game/raid/realms` | `game.secretrealm.enter` |
| `GET` | `/game/rank` | `game.rank.view` |
| `POST` | `/game/realm/breakthrough` | `game.realm.breakthrough` |
| `GET` | `/game/realm/breakthrough/preview` | `game.realm.breakthrough` |
| `GET` | `/game/realm/config` | `game.realm.config` |
| `POST` | `/game/realm/consolidate` | `game.realm.breakthrough` |
| `GET` | `/game/season` | — |
| `GET` | `/game/secret_realm/areas` | `game.secret_realm` |
| `POST` | `/game/secret_realm/enter` | `game.secret_realm` |
| `GET` | `/game/sect/applications` | `game.sect.manage` |
| `POST` | `/game/sect/appoint` | `game.sect.manage` |
| `POST` | `/game/sect/approve/{appId}` | `game.sect.manage` |
| `POST` | `/game/sect/create` | `game.sect.manage` |
| `POST` | `/game/sect/disband` | `game.sect.manage` |
| `POST` | `/game/sect/donate` | `game.sect.donate` |
| `POST` | `/game/sect/join/{sectId}` | `game.sect.manage` |
| `POST` | `/game/sect/kick/{targetPlayerId}` | `game.sect.manage` |
| `POST` | `/game/sect/leave` | `game.sect.manage` |
| `POST` | `/game/sect/levelup` | `game.sect.manage` |
| `GET` | `/game/sect/members` | `game.sect.manage` |
| `POST` | `/game/sect/reject/{appId}` | `game.sect.manage` |
| `POST` | `/game/sect/take` | `game.sect.warehouse` |
| `GET` | `/game/sect/top` | `game.sect.manage` |
| `POST` | `/game/sect/transfer/{targetPlayerId}` | `game.sect.manage` |
| `POST` | `/game/sect/war/{targetSectId}` | `game.sect.manage` |
| `GET` | `/game/sect/warehouse` | `game.sect.manage` |
| `POST` | `/game/skill/learn` | `game.skill.learn` |
| `GET` | `/game/skill/my` | `game.inventory.view` |
| `GET` | `/game/skills` | `game.item.registry` |
| `GET` | `/game/spiritual_roots` | `game.player.info` |
| `GET` | `/game/status` | — |
| `POST` | `/game/team/accept` | `game.team.manage` |
| `POST` | `/game/team/create` | `game.team.manage` |
| `GET` | `/game/team/info` | `game.team.view` |
| `POST` | `/game/team/invite` | `game.team.manage` |
| `POST` | `/game/team/leave` | `game.team.manage` |
| `POST` | `/game/technique/equip` | `game.technique.equip` |
| `POST` | `/game/technique/learn` | `game.technique.learn` |
| `GET` | `/game/technique/my` | `game.technique.learn` |
| `POST` | `/game/technique/unequip` | `game.technique.equip` |
| `POST` | `/game/technique/upgrade` | `game.technique.upgrade` |
| `GET` | `/game/techniques` | `game.technique.learn` |
| `GET` | `/game/title/active` | `game.title.view` |
| `GET` | `/game/title/all` | `game.title.view` |
| `POST` | `/game/title/equip` | `game.title.equip` |
| `GET` | `/game/title/my` | `game.title.view` |
| `POST` | `/game/title/unequip` | `game.title.equip` |
| `POST` | `/game/worldboss/challenge` | `game.pvp.challenge` |
| `GET` | `/game/worldboss/list` | `game.player.info` |

::: warning 注意权限码与路径不完全对应
`/api/game/farm/*`、`/api/game/buff`、`/api/game/map/*` 等一批接口
统一使用 `game.player.info`，而不是各自独立的权限码；
`/api/game/item/add` 用的是 **`admin.items.give`**（发放物品属于管理员操作）。

判断某个接口需要什么权限，请以本表为准，不要按路径猜。
:::

## 账号接口 `/api/auth/**`

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `DELETE` | `/auth/account` | — |
| `POST` | `/auth/change-password` | — |
| `POST` | `/auth/forgot-password/reset` | — |
| `POST` | `/auth/forgot-password/send-code` | — |
| `POST` | `/auth/login` | — |
| `POST` | `/auth/logout` | — |
| `POST` | `/auth/register` | — |
| `POST` | `/auth/send-code` | — |

::: tip 注册流程
`POST /api/auth/send-code` 发送邮箱验证码 →
`POST /api/auth/register` 提交注册（需带验证码）。

验证码相关行为由 `verify_code.*` 配置控制（是否强制、允许的邮箱域名、发送冷却）。
:::

## 管理后台接口 `/api/admin/**`

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `PUT` | `/admin/adapters` | `admin.adapters` |
| `GET` | `/admin/adapters` | `admin.adapters` |
| `POST` | `/admin/adapters/reload` | `admin.adapters` |
| `POST` | `/admin/announce` | `admin.announce` |
| `POST` | `/admin/authority` | `admin.users.manage` |
| `GET` | `/admin/backup` | `admin.database.access` |
| `POST` | `/admin/backup/import` | `admin.database.reset_all` |
| `POST` | `/admin/blacklist` | `admin.blacklist.manage` |
| `GET` | `/admin/blacklist` | `admin.blacklist.manage` |
| `DELETE` | `/admin/blacklist/qq/{qqNumber}` | `admin.blacklist.manage` |
| `DELETE` | `/admin/blacklist/user/{userId}` | `admin.blacklist.manage` |
| `POST` | `/admin/database/clear_players` | `admin.database.clear_players` |
| `POST` | `/admin/database/reset_all` | `admin.database.reset_all` |
| `GET` | `/admin/db/tables` | `admin.database.access` |
| `GET` | `/admin/db/tables/{tableName}` | `admin.database.access` |
| `POST` | `/admin/db/tables/{tableName}` | `admin.database.access` |
| `GET` | `/admin/db/tables/{tableName}/{id}` | `admin.database.access` |
| `POST` | `/admin/db/tables/{tableName}/{id}` | `admin.database.access` |
| `DELETE` | `/admin/db/tables/{tableName}/{id}` | `admin.database.access` |
| `POST` | `/admin/groups` | `admin.roles.manage` |
| `GET` | `/admin/groups` | `admin.roles.manage` |
| `DELETE` | `/admin/groups/{name}` | `admin.roles.manage` |
| `POST` | `/admin/groups/{name}` | `admin.roles.manage` |
| `POST` | `/admin/groups/{name}/permissions` | `admin.roles.manage` |
| `DELETE` | `/admin/groups/{name}/permissions/{permissionCode}` | `admin.roles.manage` |
| `POST` | `/admin/groups/{name}/permissions/set` | `admin.roles.manage` |
| `GET` | `/admin/items` | `admin.status` |
| `POST` | `/admin/login` | — |
| `GET` | `/admin/logs` | — |
| `GET` | `/admin/market/listings` | `admin.economy` |
| `GET` | `/admin/market/price` | `admin.economy` |
| `GET` | `/admin/map/wilderness` | `admin.database.access` |
| `POST` | `/admin/map/wilderness/restock` | `admin.database.access` |
| `GET` | `/admin/me` | — |
| `GET` | `/admin/newbie-reward/config` | `admin.config.manage` |
| `POST` | `/admin/newbie-reward/config` | `admin.config.manage` |
| `GET` | `/admin/oauth/config` | `admin.oauth.manage` |
| `POST` | `/admin/oauth/config` | `admin.oauth.manage` |
| `GET` | `/admin/onebot/groups` | `admin.onebot.group.config` |
| `DELETE` | `/admin/onebot/groups/{groupId}` | `admin.onebot.group.config` |
| `POST` | `/admin/onebot/groups/{groupId}/autoMute` | `admin.onebot.group.config` |
| `POST` | `/admin/onebot/groups/{groupId}/muteDuration` | `admin.onebot.group.config` |
| `GET` | `/admin/permissions` | `admin.roles.manage` |
| `POST` | `/admin/player-data/export-all` | `admin.database.clear_players` |
| `POST` | `/admin/player-data/export/{playerId}` | `admin.database.clear_players` |
| `GET` | `/admin/player-data/list` | `admin.database.clear_players` |
| `GET` | `/admin/player-traces` | `admin.logs.view` |
| `GET` | `/admin/players` | — |
| `DELETE` | `/admin/players/{id}` | `admin.users.manage` |
| `GET` | `/admin/players/{id}` | `admin.status` |
| `POST` | `/admin/players/{id}/edit` | `admin.users.manage` |
| `POST` | `/admin/players/{id}/give` | `admin.users.manage` |
| `POST` | `/admin/players/{id}/rename` | `admin.users.manage` |
| `POST` | `/admin/players/{id}/spiritual-root` | `admin.users.manage` |
| `POST` | `/admin/players/{id}/title` | `admin.users.manage` |
| `POST` | `/admin/players/{id}/title/add` | `admin.users.manage` |
| `GET` | `/admin/players/{playerId}/titles` | `admin.titles.manage` |
| `POST` | `/admin/players/{playerId}/titles` | `admin.titles.manage` |
| `DELETE` | `/admin/players/{playerId}/titles/{titleKey}` | `admin.titles.manage` |
| `GET` | `/admin/plugins` | — |
| `POST` | `/admin/plugins/disable/{name}` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/enable/{name}` | `admin.plugins.manage` |
| `GET` | `/admin/plugins/list` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/load/{jarName}` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/reload/{name}` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/unload/{name}` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/watcher/start` | `admin.plugins.manage` |
| `POST` | `/admin/plugins/watcher/stop` | `admin.plugins.manage` |
| `GET` | `/admin/realms` | `admin.status` |
| `POST` | `/admin/redeem-codes` | `admin.redeem.code.manage` |
| `GET` | `/admin/redeem-codes` | `admin.redeem.code.manage` |
| `POST` | `/admin/redeem-codes/{id}` | `admin.redeem.code.manage` |
| `DELETE` | `/admin/redeem-codes/{id}` | `admin.redeem.code.manage` |
| `GET` | `/admin/roles` | `admin.roles.manage` |
| `POST` | `/admin/shutdown` | `admin.database.reset_all` |
| `GET` | `/admin/spiritual-roots` | `admin.status` |
| `GET` | `/admin/stats/commands` | `admin.status` |
| `GET` | `/admin/stats/messages` | `admin.status` |
| `GET` | `/admin/status` | `admin.status` |
| `GET` | `/admin/system/info` | `admin.status` |
| `GET` | `/admin/titles` | `admin.status` |
| `GET` | `/admin/titles/catalog` | `admin.titles.manage` |
| `DELETE` | `/admin/user/{userId}` | `admin.users.manage` |
| `POST` | `/admin/user/{userId}/password` | `admin.users.manage` |
| `GET` | `/admin/user/{userId}/permissions` | `admin.users.manage` |
| `POST` | `/admin/user/{userId}/permissions` | `admin.users.manage` |
| `DELETE` | `/admin/user/{userId}/permissions/{permissionCode}` | `admin.users.manage` |
| `POST` | `/admin/user/{userId}/role` | `admin.users.manage` |
| `DELETE` | `/admin/user/{userId}/role/{roleName}` | `admin.users.manage` |
| `POST` | `/admin/user/create-admin` | `admin.users.manage` |
| `GET` | `/admin/users` | `admin.users.manage` |
| `GET` | `/admin/whoami` | — |
| `GET` | `/admin/world-boss` | `admin.database.access` |
| `POST` | `/admin/world-boss/refresh` | `admin.database.access` |

::: warning 三个接口不需要权限码
`GET /api/admin/players`、`GET /api/admin/plugins`、`GET /api/admin/logs`
在注解层面没有 `@RequirePermission`，它们依赖 `AdminAuthFilter` 的登录校验
（以及 `admin.login` 权限）。
:::

::: tip 野外的两个管理端点
- `GET /api/admin/map/wilderness`：野外分片只读总览（读 `data/wilderness/*.json`，野外不进数据库）；
  带 `?cx=&cy=` 可看指定分片，否则以原点为中心展示一圈。
- `POST /api/admin/map/wilderness/restock`：给已采空的分片**原地补货**（只补资源，不换地形、不删探索记录）。

两者都需要 `admin.database.access` 权限。
:::

::: tip 世界 Boss 的两个管理端点
- `GET /api/admin/world-boss`：当前 Boss 池的管理员视图（含血量、预算、到期时间、击杀者）。
- `POST /api/admin/world-boss/refresh`：**强制重建整池** —— 先清旧池的伤害台账再生成新一批，
  等价于 QQ 侧的 `/世界boss 刷新`。

两者都需要 `admin.database.access` 权限。详见 [世界 Boss](/player/world-boss)。
:::

::: tip 野外玩家侧的两个端点
`/野外`（`WildernessCommand`）与 `/采集`（`GatherCommand`）按「指令即路由」同时暴露 HTTP 路由：

| 方法 | 路径 | 权限 | 等价指令 |
| --- | --- | --- | --- |
| `GET` | `/api/game/map/wilderness` | `game.player.info` | `/野外` |
| `POST` | `/api/game/map/gather` | `game.player.info` | `/采集` |

`GET /api/game/map/wilderness` 是**只读**视图：站在已知世界时返回 `gateways`（各出境口 → 野外入口分片）；
站在野外时返回 `chunk`（分片坐标、地形、是否已固化、补货剩余秒数）与 `nodes`
（每个节点的 id / 名称 / 危险度 / 境界门槛 / 灵气与地界加成 / 剩余资源 `resources` 与译名 `resourceNames`），
外加当前所在节点的 `exits` 邻接表。

`POST /api/game/map/gather` 成功时除 `message` 外返回 `data`：
`itemKey` / `itemName` / `quantity` / `remaining`。

两者与 OneBot 侧共用同一份 `MapService` 实现和同一权限码，所以冷却、境界门槛、采空与补货行为完全一致。
详见[野外（无限分片世界）](/player/wilderness)。
:::

## OAuth2 接口

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `GET` | `/auth/oauth/authorize` | — |
| `POST` | `/auth/oauth/introspect` | — |
| `GET` | `/auth/oauth/me` | — |
| `POST` | `/auth/oauth/protected/echo` | — |
| `GET` | `/auth/oauth/protected/status` | — |
| `POST` | `/auth/oauth/token` | — |

由 `oauth2.*` 配置控制（`enabled`、`client_id`、`client_secret`、`scopes`、`token_ttl_seconds`）。

::: danger 默认密钥必须修改
模板里 `oauth2.client_secret` 是 `xiuxian_oauth_secret_please_change`。
上线前务必改掉。
:::

## 安装向导接口

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `POST` | `/install/configure` | — |
| `POST` | `/install/reset` | — |
| `POST` | `/install/restart` | — |
| `GET` | `/install/status` | — |

仅当**尚未完成安装**时（`config/.installed` 不存在且 `jwt.secret` 为空）才会挂载。
`POST /api/install/configure` 写回 `config/application.yml`，
`POST /api/install/restart` 触发自动重启。

详见[安装与首次启动](/guide/install)。

## 其他接口

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `GET` | `/game/{path:.*}` | — |
| `POST` | `/game/{path:.*}` | — |
| `POST` | `/mc-command` | — |
| `GET` | `/test/test` | — |

::: tip `/api/game/{path:.*}` 是兜底路由
`UnifiedRestResource` 用 `@Path("/game/{path:.*}")` 捕获 `/api/game/` 下
所有未被更精确资源匹配的请求，内部再转发到指令系统。
:::

## 调用示例

```bash
# 1. 登录拿 token
curl -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"Password1!"}'

# 2. 用 token 查角色信息
curl http://127.0.0.1:8080/api/game/player \
  -H "Authorization: Bearer <token>"

# 3. 开始修炼
curl -X POST http://127.0.0.1:8080/api/game/cultivate/start \
  -H "Authorization: Bearer <token>"

# 4. 查坊市行情
curl "http://127.0.0.1:8080/api/game/market/price?itemKey=mtxgdn:spirit_grass" \
  -H "Authorization: Bearer <token>"
```

::: warning 参数名以代码为准
部分接口用查询参数（`GET`），部分用 JSON 请求体（`POST`）。
本页只列出方法与路径，**具体参数名请查对应 Java 方法**，
或参考[WebSocket 协议](/dev/websocket)里的同名字段。
:::
