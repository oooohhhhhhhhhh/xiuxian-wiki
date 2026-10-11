# WebSocket 协议

WebSocket 与 HTTP **共用同一个端口**（`server.host` / `server.port`），
注册在根路径上：

```java
gameWebSocketApp = new GameWebSocketApp();
WebSocketEngine.getEngine().register("", "/", gameWebSocketApp);
```

所以连接地址是：

```
ws://127.0.0.1:8080/
```

::: tip 与 REST 的分工
两者能力有重叠（都能查角色、修炼、聊天），但 WebSocket 是**长连接 + 服务端主动推送**：
世界聊天、玩家上下线、季节更替都是通过 WS 广播的，REST 做不到。

客户端建议：**登录后建一条 WS 长连接**，日常操作走 WS，需要文件上传/下载（如备份、
导出玩家数据）时才走 REST。
:::

## 消息信封

所有消息（上行与下行）都是同一个结构，由 `GameMessage` 承载：

```json
{
  "msgId": 0,
  "type": "player_info",
  "code": 0,
  "message": "ok",
  "data": { }
}
```

| 字段 | 说明 |
| --- | --- |
| `msgId` | 消息序号。**客户端上行的 `msgId` 会被服务端原样回填**，用于请求-响应配对 |
| `type` | 动作名（见下文动作表） |
| `code` | **`0` 表示成功**，非 0 为错误码（与 REST 同一套 `GameErrorCode`） |
| `message` | 提示信息 |
| `data` | 业务数据，对象或 `null` |

::: danger 成功码是 0，不是 200
与 REST 一致，判定成功用 `code == 0`。错误码清单见 [REST API · 错误码](/dev/rest-api#错误码)。
:::

### 单帧上限

服务端在**应用层**强制单帧长度上限：

```java
private static final int MAX_MESSAGE_CHARS =
        com.mtxgdn.server.ServerConfigurator.getMaxWebSocketMessageSize();
```

- 配置键：`network.ws_max_message_size`
- 默认值：`65536`（字节）

超过上限的帧**不会进入 Gson 解析**，直接回一条 `PARAM_INVALID` 错误并以
close code `4009`（"消息过大"）断开连接。

::: warning 这个配置键不在 application.yml 里
`network.ws_max_message_size` 有代码默认值 `65536`，但**模板文件里没有这一行**。
需要调整时直接在 `config/application.yml` 的 `network:` 段下自行添加即可
（外部配置会覆盖内置默认值）。
:::

## 握手与鉴权

连接建立后，**第一条消息必须是认证消息**，否则会被立即断开。

```json
{
  "type": "auth",
  "data": { "token": "<登录时拿到的 JWT>" }
}
```

认证流程：

| 步骤 | 检查 | 失败行为 |
| --- | --- | --- |
| 1 | `type` 是否为 `auth` | 回 `AUTH_NOT_LOGGED_IN`，close `4001` |
| 2 | `data.token` 是否存在 | 回 `PARAM_MISSING`，close `4001` |
| 3 | Token 是否有效（`JwtUtil.validateToken`） | 回 `AUTH_INVALID_TOKEN`，close `4001` |
| 4 | Token 是否已被吊销（`TokenBlacklist`） | 回 `AUTH_INVALID_TOKEN`，close `4001` |
| 5 | 该账号是否已有连接 | **关闭旧连接**，close `4002` |

::: warning 同一账号只能有一个连接
重复登录会**踢掉旧连接**（close `4002`，"账号在其它位置登录"）。

这是有意设计：否则两个连接同时在线会导致消息双发，
且 `userSessions` 被覆盖后旧连接会变成"幽灵连接"继续收消息。
:::

认证成功后服务端会：

1. 触发插件事件 `PLAYER_LOGIN`
2. 结算**离线收益**（`OfflineRewardService`）
3. 下发欢迎消息（含 `userId`、`username` 等）

### 断开码

| Close code | 含义 |
| --- | --- |
| `4001` | 认证失败（未认证、token 无效、token 已吊销、消息格式错误） |
| `4002` | 账号在其它位置登录 |
| `4009` | 消息过大（超过 `network.ws_max_message_size`） |
| `1001` | 服务器关闭 |

## 动作表

共 **56 个**消息类型：`auth` + 55 个业务动作。
上行时 `type` 填动作名，`data` 填参数。

### 会话

| 动作 | 说明 |
| --- | --- |
| `auth` | 认证（必须是第一条消息） |
| `heartbeat` | 心跳 |

### 角色

| 动作 | 说明 |
| --- | --- |
| `player_info` | 查询角色信息 |
| `heal` | 疗伤 |
| `morning_cultivation` | 晨修 |
| `breakthrough` | 境界突破 |

### 修炼

| 动作 | 说明 |
| --- | --- |
| `cultivate_start` | 开始打坐/闭关 |
| `cultivate_stop` | 停止修炼并结算 |
| `season_info` | 查询季节信息 |

### 背包与装备

| 动作 | 说明 |
| --- | --- |
| `inventory` | 查看背包 |
| `item_use` | 使用物品 |
| `item_registry` | 物品图鉴 |
| `equipment_enhance` | 装备强化 |

### 探索与秘境

| 动作 | 说明 |
| --- | --- |
| `exploration` | 游历 |
| `secret_realm_areas` | 秘境列表 |
| `secret_realm_enter` | 进入秘境 |

### 功法

| 动作 | 说明 |
| --- | --- |
| `techniques` | 全部功法 |
| `my_techniques` | 我的功法 |
| `technique_learn` | 学习功法 |
| `technique_equip` | 装备功法 |
| `technique_unequip` | 卸下功法 |
| `technique_upgrade` | 升级功法 |

### 制造

| 动作 | 说明 |
| --- | --- |
| `crafting_recipes` | 配方列表 |
| `crafting_craft` | 炼制 |

### 聊天

| 动作 | 说明 |
| --- | --- |
| `chat` | 发送世界聊天 |
| `chat_private` | 发送私聊 |
| `chat_history` | 拉取聊天记录 |

### 好友

| 动作 | 说明 |
| --- | --- |
| `friend_list` | 好友列表 |
| `friend_pending` | 待处理申请 |
| `friend_add` | 添加好友 |
| `friend_accept` | 接受申请 |
| `friend_reject` | 拒绝申请 |
| `friend_remove` | 删除好友 |

### 排行

| 动作 | 说明 |
| --- | --- |
| `rank` | 排行榜。通过 `data` 指定榜单：`power`（战力）、`wealth`（财富） |

### 宗门

| 动作 | 说明 |
| --- | --- |
| `sect_list` | 宗门列表 |
| `sect_info` | 宗门详情 |
| `sect_members` | 宗门成员 |
| `sect_create` | 创建宗门 |
| `sect_join` | 申请加入 |
| `sect_applications` | 入宗申请列表 |
| `sect_approve` | 批准申请 |
| `sect_reject` | 拒绝申请 |
| `sect_leave` | 退出宗门 |
| `sect_kick` | 踢出成员 |
| `sect_appoint` | 任命职位 |
| `sect_warehouse` | 宗门仓库 |
| `sect_donate` | 捐献 |
| `sect_take` | 从仓库取出 |
| `sect_disband` | 解散宗门 |
| `sect_levelup` | 宗门升级 |
| `sect_transfer` | 转让宗主 |
| `sect_war` | 宗门战（实验性插件，默认关闭） |
| `sect_top` | 宗门排行 |

### 地图

| 动作 | 说明 |
| --- | --- |
| `map_surroundings` | 当前地点周边 |
| `map_locations` | 全部地点 |
| `map_travel` | 移动到目标地点 |

## 模块门控

与 REST 一样，WS 动作也会被**插件开关**门控。
`wsModuleForAction(type)` 定义了动作到模块的映射：

| 动作模式 | 所属模块（`plugins.yml` 键） |
| --- | --- |
| `sect_war` | `experimental_sect_war` |
| `sect_*` | `sect` |
| `secret_realm_*` | `secret_realm` |
| `exploration` | `exploration` |
| `friend_*` | `friend` |
| `technique_*`、`techniques`、`my_techniques` | `technique` |
| `crafting_*` | `crafting` |
| `map_*` | `map` |
| `chat`、`chat_private`、`chat_history` | `chat` |
| `rank` | `rank` |
| `heal`、`player_info` | `player` |
| `cultivate_start`、`cultivate_stop`、`breakthrough`、`season_info` | `cultivation` |
| `inventory`、`item_use`、`item_registry`、`equipment_enhance` | `inventory` |
| 其他（如 `heartbeat`、`auth`） | 不门控 |

::: warning 宗门战是独立的开关
`sect_war` 走的是 `experimental_sect_war`，**不是** `sect`。
所以关掉 `sect` 会连带关掉宗门战，但只关 `experimental_sect_war` 不影响其他宗门功能。
:::

## 服务端推送

以下消息由服务端**主动**下发（`broadcast`），客户端 `msgId` 为 `0`：

| `type` | 触发时机 | 说明 |
| --- | --- | --- |
| 聊天消息 | 有人发世界聊天 | 广播给所有在线玩家 |
| 玩家上线 | 玩家认证成功 | `broadcastUserOnline` |
| 玩家下线 | 连接关闭 | `broadcastUserOffline` |
| `season_change` | 季节更替 | 含 `season`、`seasonDisplay`、`seasonDesc`、`message` |

季节更替广播的载荷：

```json
{
  "msgId": 0,
  "type": "season_change",
  "code": 0,
  "message": "ok",
  "data": {
    "season": "SPRING",
    "seasonDisplay": "春",
    "seasonDesc": "...",
    "message": "【天道更替】天地灵气流转，春已至！..."
  }
}
```

在线人数通过 `getOnlineCount()` 获取（MOTD 预览也用它）。

## 客户端示例

```javascript
const ws = new WebSocket('ws://127.0.0.1:8080/');
let seq = 0;
const pending = new Map();

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    data: { token: localStorage.getItem('token') }
  }));
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.msgId && pending.has(msg.msgId)) {
    pending.get(msg.msgId)(msg);
    pending.delete(msg.msgId);
    return;
  }
  // 服务端推送（msgId === 0）
  console.log('push:', msg.type, msg.data);
};

function call(type, data = {}) {
  const msgId = ++seq;
  return new Promise((resolve) => {
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ msgId, type, data }));
  });
}

// 用法
const info = await call('player_info');
if (info.code !== 0) {
  console.error('失败:', info.code, info.message);
}
```

::: tip 一定要用 msgId 配对
服务端会回填 `msgId`，但**同一时刻可能有推送消息穿插**（聊天、上下线）。
只用 `type` 匹配响应会在高频推送时错配。
:::

## 重连建议

| 场景 | 建议 |
| --- | --- |
| close `4001` | Token 失效，需重新登录后再连 |
| close `4002` | 账号在别处登录，**不要**自动重连（会互相踢） |
| close `4009` | 检查发送的消息体大小 |
| 网络异常断开 | 指数退避重连，重连后**必须重新 `auth`** |

::: warning 重连后离线收益会再次结算
认证成功时会触发一次离线收益结算。频繁重连不会重复发放
（`OfflineRewardService` 依据 `last_offline_time` 判断），
但如果你在调试时反复重连，日志里会看到多次结算记录。
:::
