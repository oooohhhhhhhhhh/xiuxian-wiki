# WebSocket 协议

WebSocket 端点：`ws://<host>:<port>`（根路径 `/`）。消息信封为 JSON：

```json
{ "msgId": 1, "type": "auth", "code": 0, "message": "ok", "data": { ... } }
```

- `code = 0` 表示成功；连接后**必须先发送 `auth` 消息**，否则服务端返回错误并关闭（close code 4001）
- 通用限流：每个消息类型 20 次/60 秒

## 认证

```json
{ "type": "auth", "msgId": 1, "data": { "token": "<user_jwt>" } }
```

成功后返回 `welcome`：

```json
{
  "type": "welcome",
  "data": {
    "userId": 1001,
    "username": "player1",
    "message": "连接成功，欢迎进入修仙世界！",
    "offlineReward": { "offlineSeconds": 3600, "expGained": 450, "hpRecovered": 120 }
  }
}
```

## 客户端 → 服务端消息

| type | 请求 data | 权限 | 响应 |
|------|-----------|------|------|
| `auth` | token | - | `welcome` |
| `chat` | content | - | 全服广播 `chat` |
| `chat_private` | content, targetPlayerId | game.chat.private | 目标在线推送 |
| `chat_history` | limit | game.chat.world | `chat_history` |
| `rank` | type, limit | game.rank.view | `rank` |
| `friend_add` | targetPlayerId | game.friend.manage | `friend_add` + 目标 `friend_pending` |
| `friend_accept` | requesterPlayerId | game.friend.manage | `friend_accept` |
| `friend_remove` | friendPlayerId | game.friend.manage | `friend_remove` |
| `friend_list` | - | game.friend.manage | `friend_list` |
| `friend_pending` | - | game.friend.manage | `friend_pending` |
| `heal` | - | game.player.info | `heal` |
| `player_info` | - | game.player.info | `player_info` |
| `cultivate_start` | - | game.cultivate | `cultivate_start` |
| `cultivate_stop` | - | game.cultivate | `cultivate_stop`（含心魔） |
| `breakthrough` | - | game.realm.breakthrough | `breakthrough` |
| `inventory` | - | game.inventory.view | `inventory` |
| `item_use` | itemKey | game.item.use | `item_use` |
| `item_registry` | - | game.item.registry | `item_registry` |
| `heartbeat` | - | - | `pong` |
| `secret_realm_areas` | - | game.secret_realm | `secret_realm_areas` |
| `secret_realm_enter` | area | game.secret_realm | `secret_realm_enter` |
| `exploration` | - | game.explore | `exploration` |
| `techniques` | - | game.technique.learn | `techniques` |
| `my_techniques` | - | game.technique.learn | `my_techniques` |
| `technique_learn` / `equip` / `unequip` / `upgrade` | techniqueId | game.technique.* | 同名响应 |
| `crafting_recipes` | category? | game.crafting.recipes | `crafting_recipes` |
| `crafting_craft` | recipeId | game.crafting.craft | `crafting_craft` |
| `equipment_enhance` | slot | game.equipment.enhance | `equipment_enhance` |
| `sect_list` | - | game.sect.manage | `sect_list` |
| `sect_info` | sectId? | game.sect.manage | `sect_info` |
| `sect_members` | - | game.sect.manage | `sect_members` |
| `sect_create` | name, description? | game.sect.manage | `sect_create` |
| `sect_join` | sectId | game.sect.manage | `sect_join` |
| `sect_applications` | - | game.sect.manage | `sect_applications` |
| `sect_approve` / `reject` | appId | game.sect.manage | 同名响应 |
| `sect_leave` / `kick` / `appoint` / `disband` / `levelup` / `transfer` / `war` | 依操作 | game.sect.manage | 同名响应 |
| `sect_warehouse` | - | game.sect.manage | `sect_warehouse` |
| `sect_donate` / `take` | itemKey, quantity | game.sect.donate / warehouse | 同名响应 |
| `sect_top` | - | game.sect.manage | `sect_top` |
| `map_surroundings` | - | game.player.info | `map_surroundings` |
| `map_travel` | locationId | game.player.info | `map_travel` |
| `map_locations` | - | game.player.info | `map_locations` |
| `season_info` | - | - | `season_info` |

## 服务端主动推送

| type | data | 触发 |
|------|------|------|
| `welcome` | userId, username, message, offlineReward? | 认证成功 |
| `pong` | timestamp | 心跳 |
| `chat` | senderPlayerId, senderName, content, timestamp | 世界聊天广播 |
| `chat_private` | 收发双方信息, content | 私聊送达 |
| `friend_pending` | requesterPlayerId, requesterName | 收到好友申请 |
| `user_online` / `user_offline` | userId, online | 上下线广播 |
| `season_change` | season, seasonDisplay, seasonDesc, message | 季节更替广播 |
| `announcement` | announcement | 管理员公告 |
| `error` | - | 各类错误 |

## 注意事项（源码事实）

- **不存在** README 中列出的 `farm_*`、`buff` 等 WebSocket 类型（农场 / Buff 仅 REST 可用）
- 未知消息类型会先尝试插件处理器，未处理则返回 `UNKNOWN_TYPE`（6001）
- `chat`（世界聊天）无权限检查

## 相关文档

- 完整错误码 → [REST API](./rest-api)
- 客户端封装（GameWebSocketClient）→ [架构总览](./architecture)
