# WebSocket协议

WebSocket 提供实时消息推送功能，支持游戏状态更新、聊天消息和战斗通知。

## 连接方式

```
ws://localhost:8080/ws/game
```

连接时需要在查询参数中携带 JWT Token：

```
ws://localhost:8080/ws/game?token=<jwt_token>
```

## 消息格式

### 客户端消息

```json
{
  "type": "message_type",
  "data": {
    "key": "value"
  },
  "timestamp": 1620000000000
}
```

### 服务端消息

```json
{
  "type": "message_type",
  "data": {
    "key": "value"
  },
  "timestamp": 1620000000000,
  "playerId": 1
}
```

## 消息类型

### 聊天消息

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `chat_world` | 世界频道消息 | `playerName`, `content` |
| `chat_private` | 私聊消息 | `from`, `content` |

### 游戏状态

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `player_status` | 玩家状态更新 | `hp`, `mp`, `level`, `realm` |
| `cultivation_update` | 修炼进度更新 | `exp`, `expProgress` |
| `realm_change` | 境界变化 | `oldRealm`, `newRealm` |

### 战斗消息

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `combat_start` | 战斗开始 | `enemyName`, `enemyHp` |
| `combat_round` | 回合更新 | `round`, `attacker`, `damage` |
| `combat_end` | 战斗结束 | `result`, `rewards` |

### 农场消息

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `farm_plots` | 农田状态更新 | `plots` |
| `farm_plant` | 种植成功 | `plotIndex`, `seed` |
| `farm_water` | 浇水成功 | `plotIndex`, `waterLevel` |
| `farm_harvest` | 收获成功 | `plotIndex`, `items` |

### Buff消息

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `buff_add` | Buff添加 | `buffType`, `value`, `duration` |
| `buff_remove` | Buff移除 | `buffType` |

### 排行榜消息

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `ranking_update` | 排行榜更新 | `type`, `list` |

## 示例代码

### JavaScript 客户端

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/game?token=' + token);

ws.onopen = () => {
  console.log('Connected to game server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'player_status':
      updatePlayerStatus(message.data);
      break;
    case 'chat_world':
      addChatMessage(message.data);
      break;
    case 'combat_start':
      showCombat(message.data);
      break;
    default:
      console.log('Unknown message:', message);
  }
};

ws.onclose = () => {
  console.log('Disconnected from game server');
};
```