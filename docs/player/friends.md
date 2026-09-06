# 好友与聊天

好友系统采用**双向确认**机制（`friends` 表）；聊天分世界频道与私聊，消息持久化到 `chat_messages` 并经 WebSocket 实时推送。模块：好友 `friend`、聊天 `chat`。

## 好友系统

| 操作 | 说明 |
|------|------|
| 申请 | 向对方发送申请（状态 `pending`）；自己、对方不存在、已有关系均被拒绝 |
| 接受 | 将申请置为 `accepted` 并**双向建立**好友记录 |
| 拒绝 | 删除对方发来的 `pending` 申请行（`FriendService.rejectRequest`，三层入口见下） |
| 删除 | 同时删除双向关系 |
| 列表 | 仅显示已接受的好友 |
| 上限 | 无数量上限（代码未设置限制，关系按行存储于 `friends`） |

- 拒绝入口已打通：QQ `/好友 reject <玩家名>`、REST `POST /api/game/friend/reject`（body：`requesterPlayerId`）、WebSocket 动作 `friend_reject`，均调服务层 `rejectRequest` 删除 pending 申请行

### 好友拜访（每日互动）

`/好友 visit <玩家名>`：每日**每位好友限一次**（内存记录，跨天自动清空）：

```
双方各获得：经验 (境界编号+1) × 30；下品灵石 (境界编号+1) × 5
```

需为已接受好友，不能拜访自己。

### QQ 指令

主命令 `/好友`（别名 `/friend`，权限码 `game.friend.manage`，模块 `friend`）：

| 子命令 | 说明 |
|------|------|
| `/好友 add <玩家名>` | 发送好友申请 |
| `/好友 accept <玩家名>` | 接受对方申请 |
| `/好友 reject <玩家名>` | 拒绝对方申请 |
| `/好友 remove <玩家名>` | 删除好友 |
| `/好友 visit <玩家名>` | 拜访好友（每日每好友一次） |
| `/好友 list` | 好友列表 |
| `/好友 pending` | 待处理的申请（附接受 / 拒绝快捷提示） |

### REST API

| 接口 | 方法 | 说明 |
|------|:---:|------|
| `/api/game/friend/list` | GET | 好友列表 |
| `/api/game/friend/pending` | GET | 收到的待处理申请 |
| `/api/game/friend/add` | POST | 发申请（body：`targetPlayerId`） |
| `/api/game/friend/accept` | POST | 接受申请（body：`requesterPlayerId`） |
| `/api/game/friend/reject` | POST | 拒绝申请（body：`requesterPlayerId`） |
| `/api/game/friend/remove` | POST | 删除好友（body：`friendPlayerId`） |

全部权限码 `game.friend.manage`。

### WebSocket

动作 `friend_add` / `friend_accept` / `friend_reject` / `friend_remove` / `friend_list` / `friend_pending`（模块门控 `friend`）；申请被接受等事件可向相关玩家推送通知。

## 聊天系统

| 频道 | 说明 |
|------|------|
| 世界频道 | 全服广播（WS 动作 `chat`），所有在线玩家实时收到；历史上限 100 条 |
| 私聊 | 点对点推送（`chat_private`），仅收发双方；与单人的历史上限 50 条 |

- 单条内容最长 **500 字符**，超出部分直接截断；发送前经 `TextSanitizer` 净化
- 限流：世界频道每玩家 **30 秒最多 5 条**；私聊每玩家 **30 秒最多 10 条**
- 不能给自己发私聊；消息全部写入 `chat_messages` 表（channel `world` / `private`）

### QQ 指令

- `/私聊 <玩家名> <内容>`（别名 `/msg`，模块 `chat`）——按玩家名搜索后发送

### REST API

| 接口 | 方法 | 权限码 | 说明 |
|------|:---:|--------|------|
| `/api/game/chat/world` | GET | `game.chat.world` | 世界历史（`limit` 默认 50，上限 100） |
| `/api/game/chat/world` | POST | `game.chat.world` | 发世界消息（body：`content`） |
| `/api/game/chat/private/{targetPlayerId}` | GET | `game.chat.private` | 与某玩家的私聊历史（`limit` 默认 50） |
| `/api/game/chat/private` | POST | `game.chat.private` | 发私聊（body：`content`、`targetPlayerId`） |

### WebSocket

- `chat`：发世界消息，成功后全服广播
- `chat_private`：发私聊，推送至目标用户（离线则仅落库，上线后经历史接口读取）
- `chat_history`：拉取世界历史（默认 50 条）

## 玩家搜索与排行榜（社交辅助）

- `/查人 <名称>`（别名 `/查找` `/search` `/playersearch`，模块 `search`）：按名称模糊搜索玩家，展示等级 / 境界 / 灵根 / 攻防 / 金币与修炼状态，最多 10 条
- `/排行 [power|wealth|境界|战力]`（别名 `/排行榜` `/rank` `/rank2`，模块 `rank`）：玩家排行，默认境界排行，取前 10
  - 战力 = 攻击 + 防御 + 速度 + 生命上限；财富 = 金币 + 灵石
  - REST：`GET /api/game/rank?type=realm|power|wealth`（`game.rank.view`）；WebSocket 动作 `rank`
- 宗门另有声望排行：`/宗门 top` → [宗门系统](./sect)

## 相关系统

- 宗门与宗门声望排行 → [宗门系统](./sect)
- 权限码体系 → [权限系统](../dev/permissions)
- REST / WebSocket 详情 → [REST API](../dev/rest-api)、[WebSocket 协议](../dev/websocket)
