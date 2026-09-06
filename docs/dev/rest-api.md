# REST API

本文按 **V1.4.1-beta2** 源码（`src/main/java/com/mtxgdn/rest`、`common/GameMessage.java`、`common/GameErrorCode.java`）说明「修仙世界」服务端的 HTTP 接口：基址与监听、统一响应格式、鉴权分层、令牌端点、玩家游戏端点、管理后台端点、安装向导、指令动态路由与限流。WebSocket 实时通道见 [WebSocket 协议](./websocket)。

## 基址与监听

| 项 | 值（默认） | 配置键 |
|----|-----------|--------|
| REST 根路径 | `http://127.0.0.1:8080/api/` | `server.host`（默认 127.0.0.1）、`server.port`（默认 8080） |
| 管理控制台（静态页） | `http://<host>:<port>/admin/` | 同 `server.port`，资源前缀 `webadmin`（`Main` 挂载 `AdminStaticFileHandler`） |
| 安装向导（静态页） | `http://<host>:<port>/install` | 仅在 `jwt.secret` 未配置（未安装）时挂载 |
| 游戏 WebSocket | `ws://<host>:<port>`（根路径） | 见 [WebSocket 协议](./websocket) |

Jersey 应用由 `Main` 装配：`new ResourceConfig().packages("com.mtxgdn.rest")`，`GrizzlyHttpServerFactory.createHttpServer("http://" + host + ":" + port + "/api/", config)`，即所有 JAX-RS 资源都挂在 **`/api`** 前缀下，下文路径均为 `/api/...` 形态。

## 统一响应格式

业务响应以 `GameMessage.restOk / restError`（`common/GameMessage.java`）构造：

```json
{ "code": 0, "message": "获取成功", "data": { ... } }
```

- `code = 0` 成功；非 0 为错误码（业务错误码见文末「错误码」表）。
- **HTTP 状态与业务 code 分离**：绝大多数业务方法即使失败也返回 HTTP 200、以 body 内的 `code` 表达错误（如 `GameMessage.restError` 经 `Response.ok` 返回）；而**鉴权失败、权限不足、限流、参数/请求体异常**通常以真实 HTTP 状态返回：
  - `401`：未登录 / Token 无效（`JwtAuthFilter`、`AdminAuthFilter`、`Auth`）
  - `403`：无权限（`PermissionFilter`、`ModuleGateFilter`、`UnifiedRestResource`）
  - `429`：限流（`RateLimiter` 拒绝）
  - `400`：请求体为空（`EofExceptionMapper` 返回 `{"code":400,"message":"请求体为空"}`）
  - `500`：未处理异常（`GenericExceptionMapper` 返回 `{"code":500,"message":"服务器内部错误，请稍后再试"}`）
  - `409` / `423`：用户已存在 / 账号锁定（`UserService.buildError` 直接以 `Response.status(httpStatus)` 返回，body 为 `{code, message}`）
- POST/PUT 请求体为 JSON，服务端经 `EntityBufferFilter` 把请求体预读进内存（上限 **64KB**），供后续过滤器与端点读取；解析失败一般按 400/500 处理。

示例成功响应（`GET /api/game/player`）：

```json
{
  "code": 0,
  "message": "获取成功",
  "data": {
    "id": 1, "userId": 3, "name": "青衫客", "realm": 2, "realmName": "筑基期",
    "hp": 100, "maxHp": 100, "spiritStones": 888,
    "spiritualRoot": { "key": "GOLD", "displayName": "金灵根", "tier": "天灵根", "effectName": "CRITICAL", "effectValue": 15 }
  }
}
```

## 鉴权：令牌种类与获取

| 令牌 | 用途区域 | 有效期 / 签发 | 携带方式 |
|------|---------|--------------|----------|
| **玩家 JWT** | `/api/game/*`（玩家侧 REST 与 WebSocket） | 7 天（`JwtUtil.EXPIRATION_MS`），HS256，密钥 `jwt.secret`（≥32 字节，未配置且非安装模式拒绝启动） | `Authorization: Bearer <token>` |
| **管理 JWT** | `/api/admin/*` | 12 小时（`AdminAuthFilter.ADMIN_TOKEN_EXPIRY`），HS256，密钥 `admin.jwt_secret` 或回退 `jwt.secret`；两者均空/不足 32 字节时随机生成（重启后失效） | `Authorization: Bearer <token>` |
| **OAuth2 access_token** | `/api/auth/oauth/me`、`/api/auth/oauth/protected/*` | 默认 3600 秒（`oauth2.token_ttl_seconds`） | `Authorization: Bearer <token>` |

- 玩家 JWT 为**单一令牌（无 refresh token）**；`POST /api/auth/logout` 把令牌加入内存黑名单 `TokenBlacklist`，被列入后 REST 与 WebSocket 连接均拒绝。黑名单与限流窗口每 5 分钟清理一次（超过 24 小时的条目移除）。
- 玩家 token 在 `POST /api/auth/login` 与 `POST /api/auth/register` 签发；管理 token 在 `POST /api/admin/login` 签发。
- WebSocket 握手同样使用玩家 JWT（首帧 `auth`），见 [WebSocket 协议](./websocket)。

### 过滤器链（按区域）

| 区域 | 鉴权要求 | 过滤器 |
|------|---------|--------|
| `/api/auth/*`、`/api/install/*`、`/api/test/*`、`/api/mc-command` | 匿名可访问 | `JwtAuthFilter` 放行（路径前缀 `auth/`、`install/`、`test/`、`mc-command`） |
| `/api/game/*` | 有效玩家 JWT：校验 `TokenBlacklist` + `JwtUtil.validateToken`，成功后注入请求属性 `userId` / `token` | `JwtAuthFilter` |
| `/api/admin/*` | 管理 JWT：claim `role` ∈ {admin, super_admin, moderator}；`POST admin/login` 放行；`admin/me`、`admin/whoami` 额外接受合法玩家 JWT（以玩家身份，不授管理权限） | `AdminAuthFilter` + `PermissionFilter`（方法级/类级 `@RequirePermission`，`super_admin` 短路） |
| `/api/admin/energy/*` | 双鉴权：玩家 JWT 或管理 JWT 任一通过即可（源码 `JwtAuthFilter` / `AdminAuthFilter` 的 `admin/energy/` 特例路径） | 两过滤器均放行无令牌请求 |
| `/api/game/*` 内置模块门控 | `/game/<首段>` 映射内置玩法模块，模块停用返回 403 `{"code":403,"message":"该玩法系统已停用，暂时无法使用"}`；`/game/player/data/*` 除外 | `ModuleGateFilter` |
| 显式端点授权 | `@RequirePermission("权限码")`（方法级优先，其次类级） | `PermissionFilter` |

`PermissionFilter` 的 `userId` 取玩家 JWT 注入的 `userId`，缺省回退到 `AdminAuthFilter` 的 `adminUserId`；权限不足返回 HTTP 403 `{"code":403,"message":"权限不足: <权限码>"}`。

## 令牌 / OAuth 端点

### 玩家账号端点（`Auth`，`@Path("/auth")`）

| 方法 | 路径 | 鉴权 | 请求体字段 | 说明 |
|------|------|------|-----------|------|
| POST | `/api/auth/register` | 匿名 | username, password, email, code | 注册并直接签发玩家 JWT，返回 `data:{id, username, token}`。`verify_code.enabled`（默认 true）时邮箱必填并校验验证码；邮箱域白名单 `verify_code.allowed_domains`（默认 qq.com/163.com/126.com/gmail.com/outlook.com/hotmail.com）。用户名 3–32 位、仅字母数字下划线，密码 ≥8 位 |
| POST | `/api/auth/send-code` | 匿名 | email | 发送注册邮箱验证码；按客户端 IP 限流 10 次/60 秒（`X-Forwarded-For` 首段，无则全局桶） |
| POST | `/api/auth/login` | 匿名 | username, password | 登录并签发玩家 JWT，返回 `data:{id, username, token}`；按用户名限流 5 次/60 秒（超限 HTTP 429）；连续失败会锁号。成功后触发插件事件 `PLAYER_LOGIN`（data: userId, username） |
| POST | `/api/auth/change-password` | 玩家 JWT | oldPassword, newPassword | 修改密码 |
| POST | `/api/auth/logout` | 玩家 JWT | — | 把当前 Bearer token 加入黑名单，返回 `data:{message:"已安全登出"}` |
| POST | `/api/auth/forgot-password/send-code` | 匿名 | email | 忘记密码发送验证码（限流同 send-code） |
| POST | `/api/auth/forgot-password/reset` | 匿名 | email, code, newPassword | 校验验证码后重置密码；连续错 3 次锁定 5 分钟（`VerificationCodeService`） |
| DELETE | `/api/auth/account` | 玩家 JWT | — | 注销：删除该用户角色（若有）后删除账号 |

`Auth` 内部返回均用 `GameMessage.restOk / restError` 信封；注册冲突返回 HTTP 409，锁定返回 423（body `{code, message}`）。

### OAuth2 端点（`OAuthResource`，`@Path("/auth/oauth")`，仅 `client_credentials`）

配置键：`oauth2.enabled`（默认 true）、`oauth2.client_id`（默认 `xiuxian_oauth_client`）、`oauth2.client_secret`（默认 `xiuxian_oauth_secret_please_change`）、`oauth2.scopes`（默认 `read write`）、`oauth2.token_ttl_seconds`（默认 3600）。OAuth 令牌独立于玩家/管理 JWT（claim `token_type=oauth2`），只用于其自身受保护端点，与游戏业务不耦合。

| 方法 | 路径 | 请求/说明 |
|------|------|----------|
| POST | `/api/auth/oauth/token` | body: `{grant_type:"client_credentials", client_id, client_secret, scope?}`。成功返回标准令牌响应：`access_token / token_type:"Bearer" / expires_in / scope`。不支持其它 grant_type（400 `unsupported_grant_type`） |
| POST | `/api/auth/oauth/introspect` | body: `{token}`。RFC 7662 风格内省：`active/client_id/scope/token_type/sub/iat/exp` |
| GET | `/api/auth/oauth/me` | 需 Bearer 且含 read scope。返回 token 所属 client、scope、签发/过期时间与服务器概况（appName/onlineCount/uptimeSeconds/serverTime） |
| GET | `/api/auth/oauth/protected/status` | 需 read scope。服务器状态（受保护资源示例） |
| POST | `/api/auth/oauth/protected/echo` | 需 write scope。回显请求体 |
| GET | `/api/auth/oauth/authorize` | **故意未实现**，返回 HTTP 501 |

示例（换 token）：

```bash
curl -X POST http://127.0.0.1:8080/api/auth/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"xiuxian_oauth_client","client_secret":"xiuxian_oauth_secret_please_change"}'
```

```json
{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 3600, "scope": "read write" }
```

## 统一指令路由（Command 动态分发）

核心机制见 [架构总览](./architecture#指令即路由)。`UnifiedRestResource`（`@Path("/game")` + `@Path("{path:.*}")` 通配 GET/POST）处理所有 **Command 注册的 HTTP 路由**；Jersey 优先匹配 `GameResource` 等显式路径，未命中才落回统一分发器。

URL 约定：

- 前缀固定为 `/api/game/`；路径就是指令里 `RouteDefinition.get/post(path, ...)` 注册的字面路径（如 `"technique/list"` → `/api/game/technique/list`）。
- `{param}` 段为路径参数；GET 用 query 参数，POST 用 JSON body（`RouteDefinition.RestContext` 提供 `pathParam / queryParam / body / bodyJson()`）。
- 匹配按「路径字面量段数降序」，保证 `/sect/info/{sectId}` 优先于更宽泛的路由。
- 鉴权：请求须先通过 `JwtAuthFilter`（有效玩家 JWT，注入 `userId`）。分发时若路由定义了权限码（`permission`），以 `PermissionService.hasPermission(userId, perm)` 校验，失败返回 403；**无玩家身份则返回 401**（`admin/` 前缀路由保留「已通过 AdminAuthFilter 管理鉴权则以哨兵 userId=0/playerId=0 执行」的分支）。
- 响应 = 路由处理器返回的 `JsonObject` 原文（各指令自行组织字段，常含 `code` / `message`），不做统一包装。

已注册的动态路由（`src/main/java/com/mtxgdn/onebot/command`，随指令扫描注册；`-` 表示该路由未单独声明权限码，仍要求登录）：

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/game/redeem` | game.redeem.code | 使用兑换码 |
| POST | `/api/game/items/give`（实为 `admin/items/give`） | admin.items.give | 管理：发放物品 |
| GET | `/api/game/admin/energy/{playerId}` | admin.status | 管理：查能量 |
| POST | `/api/game/admin/energy/set` / `add` / `remove` | admin.status | 管理：设置/增加/减少能量（body: playerId, energy） |
| GET | `/api/game/admin/debug/list` | admin.debug | 管理：指令列表 |
| POST | `/api/game/admin/debug/test` | admin.debug | 管理：指令试跑 |
| GET | `/api/game/sect/list`、`/sect/info`、`/sect/info/{sectId}` | game.sect.manage | 宗门列表 / 我的宗门 / 指定宗门（`EnergyAdminCommand`、`SectCommand` 同款注册方式） |
| GET | `/api/game/technique/list`、`/technique/my` | — | 功法列表 / 我的功法 |
| POST | `/api/game/technique/learn` / `equip` / `unequip` / `upgrade` | — | 功法操作（body: techniqueId） |
| GET | `/api/game/crafting/recipes` | — | 配方（query: category?） |
| POST | `/api/game/crafting/craft` | — | 制造（body: recipeId） |
| POST | `/api/game/economy/signin` | — | 签到 |
| GET | `/api/game/economy/shop` | — | 商店列表 |
| POST | `/api/game/economy/shop/buy` | — | 购买（body: itemKey 等） |
| POST | `/api/game/economy/recycle` | — | 回收 |
| POST | `/api/game/economy/purify` | — | 提纯灵石 |
| POST | `/api/game/economy/cultivate-boost` | — | 灵石加速修炼 |
| GET | `/api/game/economy/bank/info` | — | 灵庄信息 |
| POST | `/api/game/economy/bank/deposit` / `withdraw` | — | 灵庄存取 |
| GET | `/api/game/economy/auction/items` / `my` | — | 拍卖列表 / 我的拍卖 |
| POST | `/api/game/economy/auction/create` / `bid` | — | 上架 / 出价 |
| GET | `/api/game/energy/list` / `status` | — | 能量列表 / 状态 |
| POST | `/api/game/energy/convert` / `exchange` | — | 物品↔能量转化 |

> 注意：上表动态路径有的与 `GameResource` 显式路径重叠（如技巧/配方），显式路径优先，不会重复生效；以「表内列出的实际可访问形态」为准。新增模块只需在 `Command` 子类中 `addRoute(RouteDefinition.get/post(path[, permission], handler))` 即可获得 HTTP API。

## 显式游戏端点（`GameResource`，`@Path("/game")`，100 个方法）

全部要求玩家 JWT（经 `JwtAuthFilter`）；下表权限码来自 `@RequirePermission`，`-` 表示仅需登录。`ModuleGateFilter` 还会按首段做模块门控（例如 `/game/farm/*` 依赖 farm 模块）。部分同语义玩法同时提供 WebSocket 动作（见 [WebSocket 协议](./websocket)）。

### 玩家 / 修炼 / 探索

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/api/game/player` | game.player.info | 玩家信息（含灵根、灵石、离线收益结算、下一境界所需） |
| POST | `/api/game/player/create` | game.player.create | 创建角色（body: name，缺省「无名修士」） |
| GET | `/api/game/status` | - | 服务器运行状态（uptime、在线、玩家/用户数、内存） |
| GET | `/api/game/players` | game.player.info | 玩家列表（query: limit 默认20、offset 默认0） |
| GET | `/api/game/players/search` | - | 按名搜索玩家（query: name 必填、limit、offset） |
| GET | `/api/game/spiritual_roots` | game.player.info | 灵根图鉴 |
| POST | `/api/game/realm/breakthrough` | game.realm.breakthrough | 境界突破（含天劫结算） |
| GET | `/api/game/realm/config` | game.realm.config | 境界配置 |
| POST | `/api/game/cultivate/start` | game.cultivate | 开始修炼 |
| POST | `/api/game/cultivate/stop` | game.cultivate | 停止修炼（含心魔） |
| POST | `/api/game/heal` | game.player.info | 灵石疗伤 |
| POST | `/api/game/exploration` | game.explore | 游历探索 |
| GET | `/api/game/secret_realm/areas` | game.secret_realm | 秘境列表（按境界过滤） |
| POST | `/api/game/secret_realm/enter` | game.secret_realm | 进入秘境（body: area） |
| GET | `/api/game/season` | - | 当前季节与倍率 |
| GET | `/api/game/buff` | game.player.info | 激活中的 Buff 汇总 |
| GET | `/api/game/map` | game.player.info | 当前位置与相邻地点 |
| POST | `/api/game/map/travel/{locationId}` | game.player.info | 移动 |
| GET | `/api/game/map/locations` | game.player.info | 全部地点 |
| POST | `/api/game/player/data/export` | game.player.info | 导出本人数据文件 |
| POST | `/api/game/player/data/restore` | game.player.info | 自助还原（需 `player-data.self-restore=true`，否则 403） |

### 物品 / 装备 / 技能 / 功法 / 制造

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/api/game/inventory` | game.inventory.view | 背包 |
| GET | `/api/game/item/registry` | game.item.registry | 物品图鉴 |
| POST | `/api/game/item/use` | game.item.use | 使用物品（body: itemKey） |
| POST | `/api/game/item/add` | admin.items.give | 给自己添加物品（body: itemKey, quantity） |
| GET | `/api/game/equipment` | game.inventory.view | 已装备（含强化等级与加成） |
| POST | `/api/game/equipment/equip` | game.equipment.equip | 装备（body: itemKey, slot） |
| POST | `/api/game/equipment/unequip` | game.equipment.equip | 卸下（body: slot） |
| POST | `/api/game/equipment/enhance` | game.equipment.enhance | 强化（body: slot） |
| GET | `/api/game/skills` | game.item.registry | 技能库 |
| GET | `/api/game/skill/my` | game.inventory.view | 我的技能 |
| POST | `/api/game/skill/learn` | game.skill.learn | 学习技能（body: skillId） |
| POST | `/api/game/pvp/challenge` | game.pvp.challenge | 立即 PVP（body: targetPlayerId） |
| GET | `/api/game/techniques` | game.technique.learn | 功法大全 |
| GET | `/api/game/technique/my` | game.technique.learn | 我的功法（含缩放加成） |
| POST | `/api/game/technique/learn` | game.technique.learn | 学习（body: techniqueId） |
| POST | `/api/game/technique/equip` | game.technique.equip | 装备（body: techniqueId） |
| POST | `/api/game/technique/unequip` | game.technique.equip | 卸下（body: techniqueId） |
| POST | `/api/game/technique/upgrade` | game.technique.upgrade | 升级（body: techniqueId） |
| GET | `/api/game/crafting/recipes` | game.crafting.recipes | 配方（query: category?，如 DAN / EQUIPMENT 等） |
| POST | `/api/game/crafting/craft` | game.crafting.craft | 制造（body: recipeId） |

### 聊天 / 好友 / 排行 / 坊市 / 团队 / 副本

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/api/game/chat/world` | game.chat.world | 世界历史（query: limit 默认50） |
| POST | `/api/game/chat/world` | game.chat.world | 发世界消息（body: content） |
| GET | `/api/game/chat/private/{targetPlayerId}` | game.chat.private | 私聊记录（query: limit） |
| POST | `/api/game/chat/private` | game.chat.private | 发私聊（body: content, targetPlayerId） |
| GET | `/api/game/friend/list` | game.friend.manage | 好友列表 |
| GET | `/api/game/friend/pending` | game.friend.manage | 收到的好友申请 |
| POST | `/api/game/friend/add` | game.friend.manage | 申请（body: targetPlayerId） |
| POST | `/api/game/friend/accept` | game.friend.manage | 同意（body: requesterPlayerId） |
| POST | `/api/game/friend/reject` | game.friend.manage | 拒绝申请（body: requesterPlayerId） |
| POST | `/api/game/friend/remove` | game.friend.manage | 删除（body: friendPlayerId） |
| GET | `/api/game/rank` | game.rank.view | 排行（query: type=realm\|power\|wealth，limit 默认20） |
| GET | `/api/game/market` | game.market.view | 坊市挂单（5% 手续费） |
| POST | `/api/game/market/list` | game.market.list | 上架（body: itemKey, quantity, priceSpiritStones） |
| POST | `/api/game/market/buy` | game.market.buy | 购买（body: listingId） |
| POST | `/api/game/market/cancel` | game.market.cancel | 撤单（body: listingId） |
| GET | `/api/game/market/my_listings` | game.market.view | 我的挂单 |
| POST | `/api/game/team/create` | game.team.manage | 创建团队 |
| POST | `/api/game/team/invite` | game.team.manage | 邀请（body: targetPlayerId） |
| POST | `/api/game/team/accept` | game.team.manage | 接受邀请 |
| POST | `/api/game/team/leave` | game.team.manage | 离开团队 |
| GET | `/api/game/team/info` | game.team.view | 队伍信息 |
| GET | `/api/game/raid/realms` | game.secretrealm.enter | 团队副本列表 |
| POST | `/api/game/raid/enter` | game.secretrealm.enter | 进入团队副本（body: areaName） |

### 经济（货币兑换）

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/game/economy/currency-exchange` | game.player.info | 金币 ↔ 下品灵石兑换（body: `type` = `goldToStones` \| `stonesToGold`、`amount`；失败返回 400 + 业务信息） |

### 宗门

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/api/game/sect/members` | game.sect.manage | 本宗门成员 |
| POST | `/api/game/sect/create` | game.sect.manage | 创建（body: name, description?） |
| POST | `/api/game/sect/join/{sectId}` | game.sect.manage | 申请加入 |
| GET | `/api/game/sect/applications` | game.sect.manage | 待审批申请 |
| POST | `/api/game/sect/approve/{appId}` | game.sect.manage | 批准 |
| POST | `/api/game/sect/reject/{appId}` | game.sect.manage | 拒绝 |
| POST | `/api/game/sect/leave` | game.sect.manage | 退出 |
| POST | `/api/game/sect/kick/{targetPlayerId}` | game.sect.manage | 踢出 |
| POST | `/api/game/sect/appoint` | game.sect.manage | 任命（body: targetPlayerId, role） |
| GET | `/api/game/sect/warehouse` | game.sect.manage | 仓库 |
| POST | `/api/game/sect/donate` | game.sect.donate | 捐献（body: itemKey, quantity） |
| POST | `/api/game/sect/take` | game.sect.warehouse | 取出（body: itemKey, quantity） |
| POST | `/api/game/sect/disband` | game.sect.manage | 解散 |
| POST | `/api/game/sect/levelup` | game.sect.manage | 升级 |
| POST | `/api/game/sect/transfer/{targetPlayerId}` | game.sect.manage | 转让宗主 |
| POST | `/api/game/sect/war/{targetSectId}` | game.sect.manage | 宣战 |
| GET | `/api/game/sect/top` | game.sect.manage | 宗门声望排行（前 10） |

### 每日 / 称号 / 农场

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/api/game/daily` | game.daily | 每日信息（天象 / 机缘） |
| POST | `/api/game/daily/morning_cultivation` | game.daily | 晨修 |
| GET | `/api/game/title/all` | game.title.view | 称号图鉴 |
| GET | `/api/game/title/my` | game.title.view | 我的称号 |
| GET | `/api/game/title/active` | game.title.view | 当前装备称号 |
| POST | `/api/game/title/equip` | game.title.equip | 装备（body: titleKey） |
| POST | `/api/game/title/unequip` | game.title.equip | 卸下 |
| GET | `/api/game/farm/plots` | game.player.info | 农田状态 |
| POST | `/api/game/farm/plant` | game.player.info | 种植（body: plotIndex, seedKey） |
| POST | `/api/game/farm/water` / `fertilize` / `harvest` / `clear` / `pesticide` | game.player.info | 浇水/施肥/收获/清理/杀虫（body: plotIndex） |
| POST | `/api/game/farm/expand` | game.player.info | 扩建 |
| POST | `/api/game/farm/water-all` / `harvest-all` | game.player.info | 一键浇水/收获 |
| POST | `/api/game/farm/fertilize-all` | game.player.info | 一键施肥（body: fertilizerKey，默认 `mtxgdn:low_grade_fertilizer`） |

## 管理后台

### 控制台页面

静态站 `http://<host>:<port>/admin/`（源码资源 `src/main/resources/webadmin/`），左侧页面：总览 overview、玩家管理 players、消息统计 statsMessages、指令统计 statsCommands、数据库 database、用户/角色 users、实时日志 logs、玩家轨迹 traces、兑换码 redeemCodes、称号管理 titles、适配器 adapters、插件管理 plugins、OAuth2 oauth、我的信息 myProfile（登录入口支持「管理员登录 / 玩家登录」双模式）。页面调用下方 `/api/admin/*` 接口。

### API（`AdminResource`，`@Path("/admin")`，88 个方法）

除标注外均需管理 JWT 且 `role ∈ {admin, super_admin, moderator}`；权限码为方法级 `@RequirePermission`（无注解的 6 个：`/login`、`GET /plugins`、`GET /logs`、`GET /players`、`/whoami`、`/me` 仍要求合法管理 JWT 或按特例放行）。`super_admin` 在 `PermissionFilter` 短路放行。

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/admin/login` | - | 管理/玩家双模式登录（见下） |
| GET | `/api/admin/status` | admin.status | 运行状态 |
| GET | `/api/admin/system/info` | admin.status | 系统信息（版本 V1.4.1-beta2 / JVM / OS / 内存 / CPU） |
| GET | `/api/admin/logs` | - | 增量实时日志（query: since） |
| POST | `/api/admin/shutdown` | admin.database.reset_all | 关闭服务器 |
| POST | `/api/admin/announce` | admin.status | 全服公告（WS 广播 type=announcement；body: text） |
| GET | `/api/admin/whoami` | - | 当前身份（管理或玩家） |
| GET | `/api/admin/me` | - | 当前玩家信息（含背包） |
| GET | `/api/admin/plugins` | - | 插件 Web 页面列表 |
| GET | `/api/admin/plugins/list` | admin.plugins.manage | 插件列表（内置+外部，含 watcher 状态） |
| POST | `/api/admin/plugins/reload\|unload\|enable\|disable/{name}` | admin.plugins.manage | 重载/卸载/启用/停用插件（query: type=builtin\|external） |
| POST | `/api/admin/plugins/load/{jarName}` | admin.plugins.manage | 加载 `plugins/` 下 jar（防路径穿越） |
| POST | `/api/admin/plugins/watcher/start\|stop` | admin.plugins.manage | 插件热重载监听开关 |
| GET | `/api/admin/roles` | admin.roles.manage | 角色层级与权限明细 |
| GET | `/api/admin/permissions` | admin.roles.manage | 全部权限码 |
| GET | `/api/admin/groups` | admin.roles.manage | 权限组列表 |
| POST | `/api/admin/groups` | admin.roles.manage | 新建权限组（body: name, displayName?, level?） |
| POST | `/api/admin/groups/{name}` | admin.roles.manage | 更新权限组（body: displayName, level） |
| DELETE | `/api/admin/groups/{name}` | admin.roles.manage | 删除权限组 |
| POST | `/api/admin/groups/{name}/permissions` | admin.roles.manage | 组加权限（body: permission） |
| DELETE | `/api/admin/groups/{name}/permissions/{permissionCode}` | admin.roles.manage | 组移除权限 |
| POST | `/api/admin/groups/{name}/permissions/set` | admin.roles.manage | 整体覆盖组权限（body: permissions[]） |
| GET | `/api/admin/users` | admin.users.manage | 用户列表（含角色/直接权限） |
| POST | `/api/admin/user/{userId}/role` | admin.users.manage | 分配角色（body: role） |
| DELETE | `/api/admin/user/{userId}/role/{roleName}` | admin.users.manage | 移除角色 |
| POST | `/api/admin/user/create-admin` | admin.users.manage | 创建管理员（body: username, password, role?） |
| POST | `/api/admin/user/{userId}/password` | admin.users.manage | 重置密码 |
| DELETE | `/api/admin/user/{userId}` | admin.users.manage | 删除用户 |
| GET | `/api/admin/user/{userId}/permissions` | admin.users.manage | 用户直接权限 |
| POST | `/api/admin/user/{userId}/permissions` | admin.users.manage | 分配直接权限（body: permission） |
| DELETE | `/api/admin/user/{userId}/permissions/{permissionCode}` | admin.users.manage | 移除直接权限 |
| POST | `/api/admin/authority` | admin.users.manage | 按 QQ 号/用户串分配角色 |
| GET | `/api/admin/players` | - | 玩家列表（query: name?, limit 默认50, offset） |
| GET | `/api/admin/players/{id}` | admin.status | 玩家详情+背包 |
| POST | `/api/admin/players/{id}/give` | admin.users.manage | 发放/扣除（body: gold, exp, spiritStones, itemKey+itemQty） |
| POST | `/api/admin/players/{id}/edit` | admin.users.manage | 就地改属性（body: hp, attack, realm, subRealm 等） |
| DELETE | `/api/admin/players/{id}` | admin.users.manage | 删除玩家角色 |
| POST | `/api/admin/players/{id}/rename` | admin.users.manage | 改名（body: name） |
| POST | `/api/admin/players/{id}/spiritual-root` | admin.users.manage | 改灵根（body: spiritualRoot） |
| POST | `/api/admin/players/{id}/title` | admin.users.manage | 设置装备称号（body: titleKey） |
| POST | `/api/admin/players/{id}/title/add` | admin.users.manage | 授予称号 |
| GET | `/api/admin/spiritual-roots` | admin.status | 灵根目录 |
| GET | `/api/admin/items` | admin.status | 物品注册表 |
| GET | `/api/admin/realms` | admin.status | 境界配置 |
| GET | `/api/admin/titles` | admin.status | 称号注册表 |
| GET | `/api/admin/player-traces` | admin.logs.view | 玩家行为轨迹（query: userId, playerName, action, qqNumber, startTime, endTime, limit≤200, offset） |
| GET | `/api/admin/db/tables` | admin.database.access | 表列表+行数 |
| GET | `/api/admin/db/tables/{tableName}` | admin.database.access | 表数据分页（query: limit, offset） |
| GET | `/api/admin/db/tables/{tableName}/{id}` | admin.database.access | 查单行 |
| POST | `/api/admin/db/tables/{tableName}` | admin.database.access | 插入行（body: 列名→值） |
| POST | `/api/admin/db/tables/{tableName}/{id}` | admin.database.access | 更新行 |
| DELETE | `/api/admin/db/tables/{tableName}/{id}` | admin.database.access | 删除行 |
| GET | `/api/admin/backup` | admin.database.access | 全库备份下载（JSON 附件 `xiuxian_backup_<date>.json`） |
| POST | `/api/admin/backup/import` | admin.database.reset_all | 导入备份 |
| POST | `/api/admin/database/clear_players` | admin.database.clear_players | 清除全部玩家数据 |
| POST | `/api/admin/database/reset_all` | admin.database.reset_all | 重置全库并重灌默认数据 |
| GET | `/api/admin/redeem-codes` | admin.redeem.code.manage | 兑换码列表 |
| POST | `/api/admin/redeem-codes` | admin.redeem.code.manage | 创建（body: code, name?, gold?, spiritStones?, exp?, maxUses?, expiresAt?, items{}） |
| POST | `/api/admin/redeem-codes/{id}` | admin.redeem.code.manage | 更新 |
| DELETE | `/api/admin/redeem-codes/{id}` | admin.redeem.code.manage | 删除 |
| GET | `/api/admin/stats/messages` | admin.status | 消息统计（StatsCollector） |
| GET | `/api/admin/stats/commands` | admin.status | 指令统计 |
| GET | `/api/admin/blacklist` | admin.blacklist.manage | 黑名单列表 |
| POST | `/api/admin/blacklist` | admin.blacklist.manage | 拉黑（body: qqNumber 或 userId 二选一, reason） |
| DELETE | `/api/admin/blacklist/qq/{qqNumber}` | admin.blacklist.manage | 移除 |
| DELETE | `/api/admin/blacklist/user/{userId}` | admin.blacklist.manage | 移除 |
| GET | `/api/admin/onebot/groups` | admin.onebot.group.config | 群组自动禁言配置 |
| POST | `/api/admin/onebot/groups/{groupId}/autoMute` | admin.onebot.group.config | 开关自动禁言（body: enabled） |
| POST | `/api/admin/onebot/groups/{groupId}/muteDuration` | admin.onebot.group.config | 设置禁言天数（body: days 1–30） |
| DELETE | `/api/admin/onebot/groups/{groupId}` | admin.onebot.group.config | 删除群组配置 |
| GET | `/api/admin/players/{playerId}/titles` | admin.titles.manage | 玩家称号列表 |
| POST | `/api/admin/players/{playerId}/titles` | admin.titles.manage | 授予称号（body: titleKey） |
| DELETE | `/api/admin/players/{playerId}/titles/{titleKey}` | admin.titles.manage | 回收称号 |
| GET | `/api/admin/titles/catalog` | admin.titles.manage | 称号图鉴 |
| GET | `/api/admin/newbie-reward/config` | admin.config.manage | 新人奖励配置 |
| POST | `/api/admin/newbie-reward/config` | admin.config.manage | 保存新人奖励（body: enabled, goldReward, spiritStoneReward, spiritStoneGrade, items[]） |
| GET | `/api/admin/adapters` | admin.adapters | 适配器实例状态 |
| PUT | `/api/admin/adapters` | admin.adapters | 整体替换适配器配置并重载 |
| POST | `/api/admin/adapters/reload` | admin.adapters | 重载适配器配置 |
| POST | `/api/admin/player-data/export/{playerId}` | admin.database.clear_players | 导出单玩家数据文件 |
| POST | `/api/admin/player-data/export-all` | admin.database.clear_players | 导出全部玩家数据文件 |
| GET | `/api/admin/player-data/list` | admin.database.clear_players | 数据文件列表 |
| GET | `/api/admin/oauth/config` | admin.oauth.manage | 读 OAuth2 配置（secret 打码） |
| POST | `/api/admin/oauth/config` | admin.oauth.manage | 更新 OAuth2 配置并持久化（body: enabled, client_id, client_secret, scopes, token_ttl_seconds） |

**管理登录（`POST /api/admin/login`）**：body `{username, password, loginType?}`（`loginType` 默认 `admin`，为 `"player"` 时走玩家登录，签发玩家 JWT）。双重限流：全局 20 次/60 秒、单账号 5 次/60 秒。admin 登录先走 `AdminAuthFilter.validateCredentials`（配置了 `admin.username` + `admin.password_hash` 用 bcrypt；否则回退数据库 `users` 表认证并需 `ADMIN_LOGIN` 权限或 ADMIN/SUPER_ADMIN/MODERATOR 角色）；连续失败 5 次锁 15 分钟。成功由 `generateAdminToken(userId, username, role)` 签发 12 小时管理 JWT，返回：

```json
{
  "code": 200,
  "token": "<管理 JWT>",
  "username": "admin",
  "userId": 1,
  "highestRole": "super_admin",
  "loginType": "admin",
  "permissions": ["admin.status", "admin.users.manage"]
}
```

## 安装向导端点（`InstallResource`，`@Path("/install")`，未安装时 /install 静态页同时挂载）

安装完成判定：磁盘 `config/application.yml` 的 `jwt.secret` 非空（`InstallResource.isInstalled`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/install/status` | 匿名：安装状态、server/database 配置、admin 是否已配、jwt 指纹、java/os/jarDir |
| POST | `/api/install/configure` | 仅未安装可用（已安装返回 403）。body: `{serverPort?, databaseType?("sqlite"\|"mysql"), mysqlUrl?, mysqlUser?, mysqlPassword?, sqlitePath?, adminUsername, adminPassword, adminPassword2, jwtSecret?, onebotEnabled?}`。校验 admin（≥3 字符、字母数字下划线、密码 ≥8 位两次一致）；JWT 密钥留空自动生成 64 字节随机（用户自填需 ≥48 字节）；把配置写回 `application.yml`（admin 只落 bcrypt 哈希），随后服务器自动重启 |
| POST | `/api/install/reset` | 需当前管理员密码确认（body: adminPassword），删除配置文件回到未安装态并自动重启 |
| POST | `/api/install/restart` | 触发 `Main.restartServer()` 自动重启（新进程 HTTP 就绪后旧进程退出） |

## 其它端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mc-command` | Minecraft 桥接指令入口：body `{mcName, mcUuid, command, args?}`；按 mcUuid 限流 10 次/60 秒；需 MinecraftAdapter 运行中。响应 `{ok:true, response}` / `{ok:false, error}`（与通用信封不同） |
| GET | `/api/test/test` | 连通性测试，返回文本 `hyw` |

## 错误码

`common/GameErrorCode.java` 完整枚举（REST 与 WebSocket 共用，`code = 0` 成功）：

| code | 含义 | | code | 含义 |
|:---:|------|---|:---:|------|
| 0 | 成功 ok | | 5001-5005 | 突破失败 / 经验不足 / 灵石不足 / 已达最高境界 / 未在修炼 |
| 1001-1005 | token 无效 / 未登录 / 用户名已存在 / 邮箱已注册 / 用户名或密码错误 | | 6001-6003 | 未知消息类型 / 消息格式错误 / 操作太频繁 |
| 2001-2002 | 缺少必要参数 / 参数格式错误 | | 6101-6104 | 技能不存在 / 已学习 / 境界不足 / 学习失败 |
| 3001-3002 | 角色不存在（先建角色）/ 角色已存在 | | 7101-7102 | 对手不存在 / 不能挑战自己 |
| 4001-4003 | 物品不存在 / 数量不足 / 使用失败 | | 8101-8104 | 秘境不存在 / 境界不足 / 冷却中 / 血量不足 |
| | | | 8201-8202 | 游历冷却中 / 暂无可用事件 |
| 8301-8302 | 接收者不存在 / 不能给自己发消息 | | 8401-8404 | 好友不存在 / 已存在或已申请 / 申请不存在 / 不能加自己 |
| 9001-9002 | 服务器内部错误 / 网络请求失败 | | | |

另外：HTTP 层鉴权/权限/限流失败体（过滤器直接产出）也含 `code` 字段，其值通常等于 HTTP 状态（401/403/429/500）；`ModuleGateFilter` 固定 `code:403`；`PermissionFilter` 的 message 含权限码。

## 限流

统一工具 `RateLimiter`（固定时间窗口，窗口过期自动重建；主线程每 5 分钟清理超 1 小时的窗口）：

| 位置 | key | 限额 | 结果 |
|------|-----|------|------|
| 登录（Auth） | `login_<username小写>` | 5 次/60 秒 | HTTP 429 |
| 注册/忘记密码发验证码 | `send_code_ip:<ip>`（X-Forwarded-For 首段，无则 global） | 10 次/60 秒 | HTTP 429 |
| 管理登录（全局 / 单账号） | `admin_login_global` / `admin_login:<username>` | 20 / 5 次 每 60 秒 | HTTP 429 |
| MC 指令 | `mc-api:<mcUuid>` | 10 次/60 秒 | `{ok:false,...}` |
| GameResource 动作 | `rst:<userId>:<action>`（chat 10、breakthrough/cultivate 5、explore/secret 6、heal/friend 15、其余 30 次/60 秒） | 见左 | WebApplicationException 429 |
| 聊天服务（世界 / 私聊） | `chat_world:<playerId>` / `chat_private:<playerId>` | 5 / 10 次 每 30 秒 | 抛 RuntimeException（WS 通道表现为 error/6002 帧） |
| WebSocket 每类型 | `ws:<userId>:<type>` | 20 次/60 秒 | error 帧 6003 |

## 相关文档

- WebSocket 实时通道与帧协议 → [WebSocket 协议](./websocket)
- 鉴权分层、过滤器与数据流 → [架构总览](./architecture)
- 管理后台各页能力对应权限码 → [权限体系](./permissions)
- 插件注册 REST 路由（指令即路由扩展点）→ [内部服务 API](./internal-api)
- 客户端 SDK（`com.mtxgdn.client`：ApiClient / AuthApi / GameApi / GameWebSocketClient）与 `--demo` 演示客户端 → [快速开始](../guide/quickstart)
