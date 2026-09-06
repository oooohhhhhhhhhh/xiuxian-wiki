# WebSocket 协议

「修仙世界」的游戏实时通道由 `com.mtxgdn.websocket.GameWebSocketApp`（Grizzly `WebSocketApplication`）提供。本文按 **V1.4.1-beta2** 源码说明连接地址、握手鉴权、消息帧结构、客户端请求类型、服务端主动推送与心跳/关闭约定。HTTP 侧接口见 [REST API](./rest-api)。

## 连接地址与握手

- **地址**：`ws://<server.host>:<server.port>`（默认 `ws://127.0.0.1:8080`），**根路径、无路径后缀**。服务端在 `Main` 中以 `WebSocketEngine.getEngine().register("", "/", gameWebSocketApp)` 挂载，与 REST（`/api/`）同端口。
- **无 Origin 校验**：源码未做任何来源限制。
- **连接后必须先发 `auth` 帧**：`GameWebSocketApp.onMessage` 中，未认证连接收到的任何消息都按 `auth` 处理。认证失败一律「先回一条 `type="error"` 帧，再以 **close code 4001** 断开」；认证成功不回 `auth` 回执，而是直接推送 `welcome`。
- 同一账号允许多连接（`userSessions` 映射为 userId → 最近连接，断开时用条件删除避免误删新连接）；在线数以 `sessionUsers.size()` 计。

### auth 请求与 welcome 响应

```json
// 客户端 → 服务端（连接建立后立即发送）
{ "msgId": 1, "type": "auth", "data": { "token": "<玩家JWT>" } }
```

token 校验链：`JwtUtil.validateToken`（HS256，密钥 `jwt.secret`，7 天有效期）→ `TokenBlacklist` 黑名单校验 → `extractUserId / extractUsername`。成功后注册会话、触发插件事件 `PLAYER_LOGIN`（data: userId, username）、结算离线收益并向全服广播 `user_online`，随后向本连接回 `welcome`：

```json
{
  "msgId": 0, "type": "welcome", "code": 0, "message": "ok",
  "data": {
    "userId": 3,
    "username": "player1",
    "message": "连接成功，欢迎进入修仙世界！",
    "offlineReward": {
      "offlineSeconds": 3600, "offlineMinutes": 60, "offlineHours": 1,
      "hpRecovered": 12, "mpRecovered": 12,
      "expGained": 450, "rawExpGained": 900
    }
  }
}
```

`offlineReward` 仅在结算出奖励时出现：基础字段 `offlineSeconds/offlineMinutes/offlineHours/hpRecovered/mpRecovered`；若离线时在修炼，追加 `expGained/rawExpGained`；若修炼触发心魔，再追加 `heartDemonTriggered(为 true 才有此字段路径)/heartDemonSeverity/heartDemonNarrative/heartDemonExpLost`（心魔字段在源码里只在触发时写入）。离线收益上限 8 小时，离线不足 30 秒不发奖励。

## 帧结构（信封）

所有消息（请求、应答、推送）均为同一 JSON 信封，对应 `common/GameMessage.java`：

```json
{ "msgId": 1, "type": "chat", "code": 0, "message": "发送成功", "data": { ... } }
```

| 顶层字段 | 类型 | 约定 |
|---------|------|------|
| `msgId` | long | 客户端请求可自增编号；**应答回显请求的 msgId**；服务端主动推送固定为 0 |
| `type` | String | 消息类型（见下文两张总表） |
| `code` | int | 0 = 成功；非 0 = 错误码（同 REST 的 `GameErrorCode`） |
| `message` | String | 默认 "ok"，成功时常为业务文案 |
| `data` | JsonObject | 业务数据；错误帧为 null（Gson 序列化时省略 null 字段，JSON 里不出现） |

## 请求 → 应答通用处理

每条**已认证**消息进入 `handleGameMessage` 后依次执行：

1. **限流**：`RateLimiter.allow("ws:" + userId + ":" + type, 20, 60)` —— 每用户每类型 **20 次/60 秒**，超限回 `error` 帧（code 6003，回显 type/msgId）。
2. **内置模块门控**：类型映射到内置玩法模块（`wsModuleForAction`：`sect_*`→sect、`secret_realm_*`→secret_realm、`friend_*`→friend、`technique_*|techniques|my_techniques`→technique、`crafting_*`→crafting、`map_*`→map、`chat/chat_private/chat_history`→chat、`rank`→rank、`heal|player_info`→player、`cultivate_start|cultivate_stop|breakthrough|season_info`→cultivation、`inventory|item_use|item_registry|equipment_enhance`→inventory、`exploration`→exploration），模块停用时回 `{"code":403,"message":"该玩法系统已停用，暂时无法使用"}`。
3. **switch 分发**：见下表；大多数 case 先做 `PermissionService.hasPermission` 权限校验（失败回 `type="error"`、**code 2002**、message `权限不足: <权限码>`），再调用业务处理器。
4. **兜底**：任何未识别类型先尝试**插件 WebSocket 处理器**（按 `type` 字符串精确匹配），命中则网关不回帧；未命中回 `error`（code 6001 未知的消息类型）。
5. 解析/处理异常：已认证消息若 handler 抛异常，回 `type="error"`、code 6002（**不断开**）。

## 客户端 → 服务端消息总表

「权限码」为空表示该类型没有独立权限校验（仅需已登录）；成功应答默认回显请求 `type` 与 `msgId`（特例已注明）。`data` 列只列本类型使用到的字段。

| type | 请求 data 字段 | 权限码 | 成功响应要点 |
|------|---------------|--------|-------------|
| `auth` | token | - | 回 `welcome`（见上），失败 close 4001 |
| `chat` | content | -（无权限门） | 全服广播 `chat`（见推送表），再给发送者回执 `chat`/「发送成功」；内容清洗后为空回 2002 |
| `chat_private` | content, targetPlayerId（接收者**角色 id**） | game.chat.private | 单推接收者 `chat_private`，发送者收回执；自聊 8302、对方不存在 8301 |
| `chat_history` | limit?（默认 50，>100 收敛 50） | game.chat.world | `data:{messages:[{id,senderPlayerId,senderName,content,createdAt}]}` |
| `rank` | type?（realm\|power\|wealth，默认 realm）, limit?（默认 20） | game.rank.view | `data:{ranking:[{rank,playerId,name,realm,realmName,level,attack,defense,gold}], type}` |
| `friend_add` | targetPlayerId | game.friend.manage | 成功回 `friend_add`（data 为好友记录），并向目标单推 `friend_pending` |
| `friend_accept` | requesterPlayerId | game.friend.manage | 回执「已添加好友」 |
| `friend_reject` | requesterPlayerId | game.friend.manage | 回执「已拒绝该好友申请」（无待处理申请回 8403） |
| `friend_remove` | friendPlayerId | game.friend.manage | 回执「已删除好友」 |
| `friend_list` | - | game.friend.manage | `data:{friends:[{id,friendPlayerId,friendName,friendRealm,status,createdAt}]}` |
| `friend_pending` | - | game.friend.manage | 查询待处理申请：`data:{requests:[...]}`（主动查询用） |
| `heal` | - | game.player.info | 疗伤结果（data 为结果 Map） |
| `morning_cultivation` | - | game.player.info | 晨修结果：成功帧含 `message` 与收益 Map（经验/灵石等）；非晨修时段或当日已晨修回 400 + 业务信息 |
| `player_info` | - | game.player.info | 玩家信息（PlayerInfo 实体；含 `spiritStones`，有灵根附 `spiritualRoot{...}`；无角色 `{exists:false}`） |
| `cultivate_start` | - | game.cultivate | `data:{cultivating:true, cultivationPerSecond, startTime, season, locationName, locationMultiplier}` |
| `cultivate_stop` | - | game.cultivate | data 为更新后玩家 + `experienceGained, elapsedSeconds`；心魔时附 `heartDemon*` 字段 |
| `breakthrough` | - | game.realm.breakthrough | data 为 RealmBreakthroughResult 实体（success/message/newRealmName/渡劫相关字段），成功再附 `player` |
| `inventory` | - | game.inventory.view | `data:{items:[Item+quantity], count}` |
| `item_use` | itemKey | game.item.use | 使用结果（失败 4003） |
| `item_registry` | - | game.item.registry | `data:{items:[Item], count}` |
| `heartbeat` | - | - | 回 `pong`：`data:{timestamp}`（见「心跳」） |
| `secret_realm_areas` | - | game.secret_realm | `data:{areas:[{name,requiredRealm,cooldownSeconds,description}], count}` |
| `secret_realm_enter` | area（秘境名） | game.secret_realm | data 为 SecretRealmResult（失败 8101 等） |
| `exploration` | - | game.explore | data 为 ExplorationResult（冷却 8201） |
| `techniques` | - | game.technique.learn | `data:{techniques:[...功法大全...]}` |
| `my_techniques` | - | game.technique.learn | `data:{techniques:[我的功法+scaled加成]}` |
| `technique_learn` / `equip` / `unequip` / `upgrade` | techniqueId | 依次 game.technique.learn / .equip / .equip / .upgrade | 回执同名 type，业务失败 400 |
| `crafting_recipes` | category?（大写枚举名） | game.crafting.recipes | `data:{recipes:[...]}`；非法分类回 400「无效的分类」 |
| `crafting_craft` | recipeId | game.crafting.craft | `data:{message, craftSuccess?, expGained?, itemGained?, itemQuantity?}` |
| `equipment_enhance` | slot | game.equipment.enhance | 强化结果 |
| `sect_list` | - | game.sect.manage | `data:{sects:[{id,name,description,leaderPlayerId,leaderName,level,prestige,memberCount,maxMembers}]}` |
| `sect_info` | sectId?（缺省查自己宗门） | game.sect.manage | Sect 实体 + `maxMembers`，成员再附 `myRole/myRoleDisplay/myContribution`；无宗门且无 sectId → 成功帧「尚未加入宗门」 |
| `sect_members` | - | game.sect.manage | `data:{members:[...], sectName}` |
| `sect_create` | name, description? | game.sect.manage | data 为新 Sect |
| `sect_join` | sectId | game.sect.manage | 申请加入 |
| `sect_applications` | - | game.sect.manage | `data:{applications:[...]}` |
| `sect_approve` / `sect_reject` | appId | game.sect.manage | 审批 |
| `sect_leave` / `disband` / `levelup` | - | game.sect.manage | 退出/解散/升级 |
| `sect_kick` | targetPlayerId | game.sect.manage | 踢人 |
| `sect_appoint` | targetPlayerId, role | game.sect.manage | 任命 |
| `sect_warehouse` | - | game.sect.manage | `data:{warehouse:[{id,itemKey,quantity,donatedByPlayerId,donatedByName}]}` |
| `sect_donate` / `sect_take` | itemKey, quantity | game.sect.donate / game.sect.warehouse | 捐献/取出 |
| `sect_transfer` | targetPlayerId | game.sect.manage | 转让宗主 |
| `sect_war` | targetSectId | game.sect.manage | 宣战，data `{winner,attackerWins,defenderWins,battleLog}` |
| `sect_top` | - | game.sect.manage | `data:{top:[...前 10...]}` |
| `map_surroundings` | - | game.player.info | `data:{current:{id,name,description,region,safeZone}, neighbors:[...], cultivationBonus?}` |
| `map_travel` | locationId | game.player.info | `data:{from,to,toRegion,safeZone}` |
| `map_locations` | - | game.player.info | `data:{locations:[{id,name,description,region,minRealm,safeZone}]}` |
| `season_info` | - | -（无权限门） | `data:{season,seasonDisplay,seasonDesc,seasonEffect,cultivationMultiplier,explorationMultiplier,spiritStoneMultiplier,dropMultiplier,seasonStartMs,seasonEndMs,remainingMs}` |
| 其它任意 type | 原样传给插件 | 无内置门禁 | 插件处理器命中则处理；否则 error/6001 |

> 与旧版文档不同的事实：**不存在** `farm_*`、`buff`、`equipment_equip` 等 WebSocket 类型——农场、Buff、装备穿戴、技能等玩法仅提供 REST 端点（见 [REST API](./rest-api)）。`chat`（世界聊天）类型**没有**权限校验（服务层另有 5 条/30 秒限流）。

## 服务端主动推送

服务端全量推送仅以下 8 种（`msgId` 均为 0；`broadcast` 遍历全部在线连接，`sendToUser` 定向到 userId 的连接）：

| type | 推送范围 | data 字段 | 触发点 |
|------|---------|-----------|--------|
| `welcome` | 单连接 | userId, username, message, offlineReward? | auth 成功（见上文） |
| `user_online` | 全服 | userId, username, online:true | auth 成功；含登录者本人 |
| `user_offline` | 全服 | userId, online:false（无 username） | 连接关闭（onClose） |
| `chat` | 全服（含发送者） | senderPlayerId, senderName, content, timestamp | 世界聊天成功落库后（发送者另收回执） |
| `chat_private` | 定向接收者 | fromUserId, senderPlayerId, senderName, receiverPlayerId, receiverName, content, timestamp | 私聊成功（发送者另收回执） |
| `friend_pending` | 定向被申请方 | requesterPlayerId, requesterName | 好友申请成功后 |
| `season_change` | 全服 | season, seasonDisplay, seasonDesc, message | `SeasonService` 更替监听（`Main` 注册）；season 为 SPRING/SUMMER/AUTUMN/WINTER 枚举名 |
| `announcement` | 全服 | announcement | `POST /api/admin/announce` 广播 |

```json
// 世界聊天广播（其它玩家视角；发送者还会额外收到一条同 data 的回执帧）
{ "msgId": 0, "type": "chat", "code": 0, "message": "ok",
  "data": { "senderPlayerId": 2, "senderName": "青衫客", "content": "道友请留步", "timestamp": 1750000000000 } }

// 私聊推送（接收者视角）
{ "msgId": 0, "type": "chat_private", "code": 0, "message": "ok",
  "data": { "fromUserId": 3, "senderPlayerId": 2, "senderName": "青衫客",
            "receiverPlayerId": 5, "receiverName": "剑心", "content": "见字如面", "timestamp": 1750000000000 } }

// 全服公告（⚠ 该帧 code=200 而非 0）
{ "msgId": 0, "type": "announcement", "code": 200, "message": "公告", "data": { "announcement": "停机维护公告" } }
```

## 心跳

- 仅**客户端主动心跳**：发 `{"type":"heartbeat","msgId":N}` → 服务端回 `{"type":"pong","msgId":N,"code":0,"message":"ok","data":{"timestamp":<毫秒>}}`。
- **没有**服务端周期 ping、空闲超时踢下线或未认证超时断连（Grizzly 层仅配置连接超时 10 秒、keepAlive）。

## 限流（WS 侧）

| 位置 | key | 限额 |
|------|-----|------|
| 网关逐类型 | `ws:<userId>:<type>` | 20 次/60 秒（超限回 6003） |
| 世界聊天（服务层） | `chat_world:<playerId>` | 5 次/30 秒 |
| 私聊（服务层） | `chat_private:<playerId>` | 10 次/30 秒 |
| 聊天内容长度 | - | 清洗后超 500 字截断 |

> 注意：聊天服务层超限直接 `throw RuntimeException`，在 WS 通道会冒泡到 `onMessage` 的 catch，客户端实际收到 `{"type":"error","code":6002,"message":"消息格式错误"}` 帧（限流被错误码掩盖的**已知怪癖**，按源码如实记录）。

## 错误与关闭码

错误帧形态：`{"msgId":?, "type":"error", "code":..., "message":...}`（无 data；部分失败帧直接用请求 type）。错误码全集与 REST 一致（1001–1005、2001–2002、3001–3002、4001–4003、5001–5005、6001–6003、6101–6104、7101–7102、8101–8104、8201–8202、8301–8302、8401–8404、9001–9002），见 [REST API 错误码](./rest-api#错误码)。

| 场景 | 帧（type/code/message） | 关闭码/说明 |
|------|------------------------|------------|
| 未认证先发非 auth 帧 | error / 1002 / 请先登录 | close **4001** |
| auth 缺 token | error / 2001 / 缺少必要参数 | close 4001（reason 缺少认证token） |
| token 无效/过期 | error / 1001 / token无效或已过期 | close 4001 |
| token 在黑名单 | error / 1001 | close 4001（reason Token 已失效，请重新登录） |
| 认证阶段解析失败 | error / 6002 / 消息格式错误 | close 4001 |
| 已认证消息处理异常 | error / 6002 | 不断开 |
| 未知类型 | 回显请求 type / 6001 | 不断开 |
| 限流 | 回显 type / 6003 | 不断开 |
| 内置模块停用 | 回显 type / 403 | 不断开 |
| 权限不足 | **type="error"** / 2002 / `权限不足: <权限码>` | 不断开 |
| 服务端优雅关闭 | - | close **1001**（reason 服务器关闭，`shutdownGracefully`） |
| 客户端主动断开 | - | 参考实现用 1000 |

## 完整示例会话

```text
客户端:  ws://127.0.0.1:8080/ 连接
服务端:  (onConnect, 未认证)
客户端→ {"msgId":1,"type":"auth","data":{"token":"<玩家JWT>"}}
服务端→ {"msgId":0,"type":"welcome","code":0,"message":"ok",
          "data":{"userId":3,"username":"player1","message":"连接成功，欢迎进入修仙世界！"}}
服务端→ {"msgId":0,"type":"user_online","code":0,"message":"ok",
          "data":{"userId":3,"username":"player1","online":true}}      （全服广播，含本人）
客户端→ {"msgId":2,"type":"chat","data":{"content":"诸位道友安好？"}}
服务端→ {"msgId":0,"type":"chat","code":0,"message":"ok",
          "data":{"senderPlayerId":1,"senderName":"player1","content":"诸位道友安好？","timestamp":1750000000000}}   （广播）
服务端→ {"msgId":2,"type":"chat","code":0,"message":"发送成功","data":{同上}}                                       （发送者回执）
客户端→ {"msgId":3,"type":"heartbeat"}
服务端→ {"msgId":3,"type":"pong","code":0,"message":"ok","data":{"timestamp":1750000001000}}
客户端→ {"msgId":4,"type":"season_info"}
服务端→ {"msgId":4,"type":"season_info","code":0,"message":"ok","data":{季节与倍率...}}
```

## 注意事项

- 文本帧最大尺寸受 Grizzly 默认限制与 `performance.low_memory`（读写缓冲 16384）影响；管理公告等大文本量较少。
- `chat_private` 与 `friend_pending` 只推给**目标玩家当前连接**（`userSessions` 中该 userId 的连接），目标离线则静默丢弃。
- 插件可注册自定义 WS 消息类型处理器（`PluginContext.registerWebSocketHandler`），网关 default 分支按 type 精确匹配调用，处理函数只拿到 `(socket, data)`、拿不到 userId；插件需要回复时可自行 `socket.send(...)`。详见 [内部服务 API](./internal-api)。
- 服务端 REST 层的很多玩法动作（突破/游历/秘境/功法/制造/宗门/地图/聊天/好友/排行）在 WS 都有对应类型，二选一即可；Buff/农场/装备穿戴/技能/坊市/拍卖等**只走 REST**。

## 相关文档

- 错误码全集与 REST 端点 → [REST API](./rest-api)
- 网关装配、插件事件与数据流 → [架构总览](./architecture)
- 插件自定义 WS 处理器 → [内部服务 API](./internal-api)
- 客户端封装示例 `com.mtxgdn.client.GameWebSocketClient` 与 `demo/DemoClient` → [快速开始](../guide/quickstart)
