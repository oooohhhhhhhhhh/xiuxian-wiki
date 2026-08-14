# 好友与聊天

好友系统采用**双向确认**机制；聊天支持世界频道广播与点对点私聊，消息持久化存储。

## 好友系统

| 操作 | 说明 |
|------|------|
| 申请 | 发送申请（`pending` 状态） |
| 接受 | 接受后双向建立 `accepted` 关系 |
| 拒绝 | 删除申请 |
| 删除 | 同时删除双向关系 |
| 列表 | 仅显示已接受的好友 |
| 上限 | 无数量上限 |

> 注意：QQ 端 `/好友` 指令当前**未实现**（源码为空文件），好友功能仅通过 REST / WebSocket 使用。

### REST API

`POST /api/game/friend/add`、`POST /api/game/friend/accept`、`POST /api/game/friend/remove`、`GET /api/game/friend/list`、`GET /api/game/friend/pending`（权限 `game.friend.manage`）。

### WebSocket

`friend_add` / `friend_accept` / `friend_remove` / `friend_list` / `friend_pending`。

## 聊天系统

| 频道 | 说明 |
|------|------|
| 世界频道 | 全服广播（`chat`），历史上限 100 条 |
| 私聊 | 点对点推送（`chat_private`），历史上限 50 条 |

- 单条消息最长 **500 字符**（HTML 转义防注入）
- 消息全部持久化到 `chat_messages` 表
- 不能给自己发私聊

### QQ 指令

`/私聊 <玩家名> <内容>`（`/msg`）。

### REST / WebSocket

- `GET /api/game/chat/world`、`POST /api/game/chat/world`
- `GET /api/game/chat/private/{targetId}`、`POST /api/game/chat/private`
- WebSocket：`chat`、`chat_private`、`chat_history`

## 相关系统

- 排行榜与玩家搜索 → [每日系统](./daily)
- 权限码 → [权限系统](../dev/permissions)
