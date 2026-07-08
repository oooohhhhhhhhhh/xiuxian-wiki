# WebSocket 协议

修仙世界服务端支持 WebSocket 实时通信，用于推送游戏事件和实时消息。

## 连接信息

- **地址**: `ws://<host>:<port>/ws`
- **认证**: 通过查询参数 `token` 传递认证令牌
- **心跳**: 每 30 秒发送一次心跳包

---

## 连接流程

### 1. 建立连接

```javascript
const socket = new WebSocket('ws://localhost:8080/ws?token=your_token');
```

### 2. 连接成功

```javascript
socket.onopen = function() {
    console.log('WebSocket 连接已建立');
};
```

### 3. 接收消息

```javascript
socket.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('收到消息:', message);
};
```

### 4. 发送消息

```javascript
socket.send(JSON.stringify({
    type: 'chat',
    data: {
        content: 'Hello World'
    }
}));
```

### 5. 连接关闭

```javascript
socket.onclose = function(event) {
    console.log('WebSocket 连接已关闭');
};
```

---

## 消息格式

### 通用消息结构

```json
{
  "type": "message_type",
  "timestamp": 1620000000000,
  "data": { ... }
}
```

### 心跳消息

**客户端发送**:
```json
{
  "type": "ping",
  "timestamp": 1620000000000
}
```

**服务端响应**:
```json
{
  "type": "pong",
  "timestamp": 1620000000000
}
```

---

## 服务端推送事件

### 玩家事件

#### 玩家加入

```json
{
  "type": "player_join",
  "data": {
    "playerId": 1,
    "name": "修仙者",
    "realm": "练气期"
  }
}
```

#### 玩家离开

```json
{
  "type": "player_quit",
  "data": {
    "playerId": 1,
    "name": "修仙者"
  }
}
```

#### 玩家升级

```json
{
  "type": "player_levelup",
  "data": {
    "playerId": 1,
    "name": "修仙者",
    "oldLevel": 5,
    "newLevel": 6
  }
}
```

#### 玩家突破

```json
{
  "type": "player_breakthrough",
  "data": {
    "playerId": 1,
    "name": "修仙者",
    "oldRealm": "练气期",
    "newRealm": "筑基期"
  }
}
```

### 聊天事件

#### 世界聊天

```json
{
  "type": "chat_world",
  "data": {
    "playerId": 1,
    "name": "修仙者",
    "content": "大家好！",
    "timestamp": 1620000000000
  }
}
```

#### 私聊

```json
{
  "type": "chat_private",
  "data": {
    "fromPlayerId": 1,
    "fromName": "修仙者",
    "toPlayerId": 2,
    "content": "私聊内容",
    "timestamp": 1620000000000
  }
}
```

### 战斗事件

#### 战斗开始

```json
{
  "type": "combat_start",
  "data": {
    "combatId": 1,
    "attacker": {
      "playerId": 1,
      "name": "修仙者",
      "hp": 100,
      "attack": 50
    },
    "defender": {
      "playerId": 2,
      "name": "对手",
      "hp": 100,
      "attack": 45
    }
  }
}
```

#### 战斗回合

```json
{
  "type": "combat_round",
  "data": {
    "combatId": 1,
    "round": 1,
    "attackerDamage": 25,
    "defenderDamage": 20,
    "attackerHp": 80,
    "defenderHp": 75
  }
}
```

#### 战斗结束

```json
{
  "type": "combat_end",
  "data": {
    "combatId": 1,
    "winner": {
      "playerId": 1,
      "name": "修仙者"
    },
    "loser": {
      "playerId": 2,
      "name": "对手"
    },
    "rewards": [
      { "itemKey": "spirit_stone", "quantity": 100 }
    ]
  }
}
```

### 探索事件

#### 探索结果

```json
{
  "type": "exploration_result",
  "data": {
    "playerId": 1,
    "event": "发现遗迹",
    "description": "你发现了一座古老的遗迹，获得了丰厚的奖励",
    "rewards": [
      { "itemKey": "spirit_stone", "quantity": 500 },
      { "itemKey": "ancient_scroll", "quantity": 1 }
    ]
  }
}
```

### 坊市事件

#### 新上架物品

```json
{
  "type": "market_list",
  "data": {
    "listingId": 1,
    "sellerId": 1,
    "sellerName": "修仙者",
    "itemKey": "healing_pill",
    "quantity": 10,
    "price": 500,
    "timestamp": 1620000000000
  }
}
```

#### 物品被购买

```json
{
  "type": "market_sold",
  "data": {
    "listingId": 1,
    "buyerId": 2,
    "buyerName": "买家",
    "itemKey": "healing_pill",
    "quantity": 10,
    "price": 500
  }
}
```

### 宗门事件

#### 宗门创建

```json
{
  "type": "sect_create",
  "data": {
    "sectId": 1,
    "name": "天道宗",
    "leaderId": 1,
    "leaderName": "修仙者"
  }
}
```

#### 宗门成员变更

```json
{
  "type": "sect_member_change",
  "data": {
    "sectId": 1,
    "sectName": "天道宗",
    "playerId": 2,
    "playerName": "新成员",
    "action": "join"
  }
}
```

### 排行榜更新

```json
{
  "type": "rank_update",
  "data": {
    "type": "realm",
    "rankings": [
      { "playerId": 1, "name": "修仙者", "value": "大乘期" },
      { "playerId": 2, "name": "高手", "value": "渡劫期" }
    ]
  }
}
```

### 系统公告

```json
{
  "type": "system_notice",
  "data": {
    "title": "系统维护通知",
    "content": "服务器将于今晚10点进行维护",
    "type": "maintenance"
  }
}
```

---

## 客户端发送消息

### 发送聊天

```json
{
  "type": "chat",
  "data": {
    "channel": "world",
    "content": "大家好！"
  }
}
```

**频道类型**: `world`（世界）, `private`（私聊）

### 请求实时状态

```json
{
  "type": "status_request",
  "data": {
    "playerId": 1
  }
}
```

### 订阅事件

```json
{
  "type": "subscribe",
  "data": {
    "events": ["chat_world", "combat_start", "market_list"]
  }
}
```

### 取消订阅

```json
{
  "type": "unsubscribe",
  "data": {
    "events": ["combat_start"]
  }
}
```

---

## 错误处理

### 认证失败

```json
{
  "type": "error",
  "data": {
    "code": 401,
    "message": "Token无效或已过期"
  }
}
```

### 连接超时

```json
{
  "type": "error",
  "data": {
    "code": 408,
    "message": "连接超时"
  }
}
```

### 权限不足

```json
{
  "type": "error",
  "data": {
    "code": 403,
    "message": "权限不足"
  }
}
```

---

## 示例代码

### JavaScript 客户端

```javascript
class GameSocket {
    constructor(url, token) {
        this.socket = new WebSocket(`${url}?token=${token}`);
        this.handlers = {};
        
        this.socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
        };
        
        setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }
    
    on(type, handler) {
        if (!this.handlers[type]) {
            this.handlers[type] = [];
        }
        this.handlers[type].push(handler);
    }
    
    send(data) {
        this.socket.send(JSON.stringify(data));
    }
    
    handleMessage(msg) {
        const handlers = this.handlers[msg.type];
        if (handlers) {
            handlers.forEach(h => h(msg.data));
        }
    }
}

const socket = new GameSocket('ws://localhost:8080/ws', 'your_token');

socket.on('chat_world', (data) => {
    console.log(`${data.name}: ${data.content}`);
});

socket.on('player_join', (data) => {
    console.log(`${data.name} 加入了游戏`);
});

socket.send({
    type: 'chat',
    data: { channel: 'world', content: 'Hello!' }
});
```

---

## 注意事项

1. **心跳机制**：客户端需每 30 秒发送一次 ping，否则连接会被断开
2. **重连机制**：连接断开后应自动重连
3. **消息顺序**：消息按发送顺序接收，但网络延迟可能导致顺序不一致
4. **消息大小**：单条消息最大 1MB
5. **并发连接**：单个用户最多 5 个并发连接
6. **连接限制**：服务器最大支持 10000 个并发连接