# 适配器与外部接入

服务端通过 **AdapterManager** 统一管理外部系统适配器，配置来自 `adapters.json`（运行时可由 `/api/admin/adapters` 查看与修改），启动时自动加载所有 enabled 实例。

## 适配器类型

| type | 实现类 | 说明 |
|------|--------|------|
| `onebot` | OneBotWebSocketServer | **OneBot WebSocket 服务端**（默认端口 6700，路径 `/onebot`） |
| `onebot-client` | OneBotClientAdapter | OneBot WebSocket 客户端 / HTTP webhook 模式 |
| `qq` | QqOfficialAdapter | QQ 开放平台官方适配器 |
| `minecraft` | MinecraftAdapter | 拉起 Minecraft 服务端子进程 |
| `minecraft-player` | MinecraftPlayerAdapter | 以玩家身份登录 MC 服务器 |

默认配置：`onebot-default`（type=onebot，enabled=true，port=6700，mode=ws_server，send_mode=text）。

## OneBot（QQ 机器人）

### 服务端模式（默认）

- 监听 `ws://0.0.0.0:6700/onebot`，QQ 客户端（如 Lagrange / LLOneBot）作为 WebSocket 客户端接入
- 消息管线：结算离线奖励 → 处理账号流程会话 → 答题匹配（`quiz.enabled=false` 时跳过）→ 指令分发
- 指令限流：10 次/60 秒；群聊中标记「仅私聊」的指令被拦截

### 客户端 / HTTP 模式

- `mode=ws_client`：主动连接 OneBot 服务端（支持 access_token、心跳探活、指数退避重连）
- `mode=http`：HTTP webhook 监听 + REST 调用发送
- 注意：客户端模式**不含黑名单自动禁言**逻辑

### 截图模拟模式（实验性）

通过 `Robot` 键鼠模拟 + 截屏 OCR 控制 QQ 客户端窗口；OCR 结果仅记录日志，**不执行指令**。

### 黑名单与自动禁言（仅服务端模式）

- 存储：`config/blacklist.yml`（QQ 号或用户 ID，命中自动映射）
- 命中黑名单的群消息 → 检测机器人是否管理员 → `set_group_ban` 禁言（默认 **29 天**）
- 每 **12 小时**循环续期；目标为 admin/owner 时跳过；从黑名单移除即取消禁言
- 群组开关：`config/onebot_group_config.yml`（每群独立 autoMuteEnabled / muteDurationDays）

## QQ 官方适配器

| 项目 | 说明 |
|------|------|
| 鉴权 | AppID + ClientSecret 换 access_token（默认 7200 秒，自动刷新） |
| 接收 | `mode=websocket`（默认）：网关 `wss://api.sgroup.qq.com/websocket`；`mode=webhook`：本地回调服务 |
| Intents | 默认 `GROUP_AT_MESSAGE_CREATE, C2C_MESSAGE_CREATE`（仅 websocket 模式使用） |
| 触发 | 群消息必须 **@机器人** 才触发；私聊（C2C）直接触发 |
| 发送 | 群聊 / 单聊消息接口；被动回复窗口：单聊 60 分钟 / 群聊 5 分钟 |
| 限制 | 无禁言能力（官方 API 不支持）；group_openid 映射重启后变化 |

> **身份体系与 OneBot 相互独立**：QQ官方平台下发的是 **openid**（平台内唯一、与真实 QQ 号无关），与 OneBot（真实 QQ 号）不是同一身份。因此 QQ官方适配器使用**独立的绑定表 `qq_official_bindings`**（openid ↔ user_id），与 OneBot 的 `qq_bindings` 互不挤占；同一玩家可同时在两个平台绑定（各自独立）。历史版本误存进 `qq_bindings` 的 openid 会在启动迁移时自动转入新表。

### 跨平台兼容性

所有 QQ 指令共用同一套命令系统（`CommandRegistry`），跨平台兼容规则：

- **操作者绑定解析**：`CommandContext.resolveBoundBinding()` / `resolveBoundUserId()` 按渠道自动选择绑定表（OneBot → `qq_bindings`，QQ官方 → `qq_official_bindings`，MC → `mc_bindings`）。全部指令（管理、兑换、PVP 等）均使用平台感知解析，同一账号在两个平台绑定后指令行为一致
- **账号流程**：`/注册` `/绑定` `/解绑` `/改密` `/注销` 通过 `OneBotAccountFlowClient` 接口路由到各渠道实现（QQ官方为适配器内置流程，注册无需邮箱验证）
- **跨平台通知**：PVP 挑战通知等按目标用户的绑定平台选择发送通道（QQ官方走 openid 私聊、OneBot 走 QQ 号私聊）
- **已知差异**：消息/指令统计中 QQ官方侧显示 openid（非真实 QQ 号）；QQ官方无黑名单/禁言能力；群号在 QQ官方为内部映射（重启变化），与 OneBot 真实群号不互通

### Webhook 模式（mode=webhook）

QQ 开放平台支持将事件以 **Webhook 回调**推送到你自己的服务器（替代 WebSocket 网关），官方要求：

- **回调端口必须为 80 / 443 / 8080 / 8443**（`webhook_port`）
- 回调路径默认 `/qq/webhook`（`webhook_path`，建议在开放平台配置为 HTTPS 反向代理后的公网地址）

**签名验证**（官方规范：[接口框架 - 签名](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html)）：

| 请求头 | 说明 |
|--------|------|
| `X-Tsign-Open-App-Id` | 机器人 AppID（须与 `app_id` 一致） |
| `X-Tsign-Open-Timestamp` | 时间戳（秒 / 毫秒自适应） |
| `X-Tsign-Open-Nonce` | 随机串 |
| `X-Tsign-Open-Signature` | 签名值 |

验签算法：`signature = Base64( HMAC-SHA256(appSecret, timestamp + "\n" + nonce + "\n" + body) )`，与 `X-Tsign-Open-Signature` 做**常量时间比较**；同时校验时间戳新鲜度（`webhook_max_skew_seconds`，默认 300 秒，防重放）。验签通过后按与 WebSocket 相同的 `{t, id, d, s}` 事件格式分发处理。

配置示例（`adapters.json` 中 type=qq 的 config）：

```json
{
  "mode": "webhook",
  "app_id": "xxx",
  "client_secret": "xxx",
  "webhook_host": "0.0.0.0",
  "webhook_port": 8080,
  "webhook_path": "/qq/webhook",
  "webhook_max_skew_seconds": 300
}
```

> 注：`8080` 通常已被游戏主服务占用，生产环境建议使用 **80 / 443 / 8443**（443 需自行配置 TLS 反向代理；服务端本身为纯 HTTP 监听）。

### 消息交互（按钮互动）

QQ 官方适配器支持官方[「消息交互」按钮](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/overview.html)：

- **发送按钮**：`QqOfficialAdapter.sendGroupMsgWithButtons / sendPrivateMsgWithButtons / *WithKeyboard` 可在文本消息上附带一行或多行按钮（`keyboard.content.rows[].buttons[]`，`action.type=2` 回调互动、`permission.type=2` 所有人可点、`data` 携带自定义数据）
- **点击回调**：接收 `INTERACTION_CREATE` 事件（需在 `intents` 中加上 `INTERACTION`，bit `1<<26`），按钮的 `data`（即 `button_data`）约定为**游戏指令**（如 `签到`），适配器自动补全 `/` 前缀后走正常指令管线执行并回复；同时调用 `POST /interactions/{interaction_id}` 回传，避免按钮"转圈"
- **使用方式**：QQ 官方渠道发送 `/按钮` 查看演示按钮组（签到 / 状态 / 每日 / 宗门 信息），`/按钮 <指令串>` 发送单个指令按钮；插件开发者可直接调用适配器的 `send*WithButtons` 方法
- 按钮样式 `style`：0 灰 / 1 蓝 / 2 红 / 3 绿 / 4 橙；另支持跳转链接按钮（`QqButton.url`）
- ⚠️ **`INTERACTION` Intent 需在 QQ 开放平台申请开通**：默认配置**不包含** `INTERACTION`；未开通就订阅会被网关拒绝（关闭码 **4014 disallowed intents** 并无限重连）。确认平台已开通「消息互动」权限后，再在 `intents` 中手动加入 `INTERACTION`；若仍被拒绝，参照服务端日志中的排查提示移除未授权 intent

## Minecraft 接入

### MOTD 服务器

- 端口 **25565**，模拟 Minecraft 服务器 ping（现代 + 旧版协议），显示在线人数（取 WebSocket 在线数）
- 登录请求（nextState=2）会被拒绝并提示「此服务器非 Minecraft 服务器」

### 服务端适配（拉起子进程）

- 配置：`minecraft.jar_path`、`minecraft.server_dir`（默认 mc_server）、内存参数、`command_prefix`（默认 `xiuxian`）
- 启动时注入 `xiuxian-agent.jar`（Java Agent）并复制 `XiuxianBridge.jar`（Bukkit 插件）
- 玩家在游戏内执行 `/xiuxian <子命令>` → 桥接插件 / Agent 转发到 `POST /api/mc-command` → 执行游戏指令并回显
- 游戏内注册 / 绑定：聊天输入明文密码（MinecraftAuthService 两态会话）

### 玩家代理（以玩家身份接入）

- 以离线玩家身份登录 MC 服务器（默认 XiuXianBot），自动 `/reg` / `/l`
- 纯协议客户端实现（支持压缩、KeepAlive、私聊识别）；协议版本自动探测

### 桥接插件与 Agent

| 组件 | 说明 |
|------|------|
| `XiuxianBridgePlugin`（Bukkit） | 注册 `/xiuxian` 命令，转发到服务端 REST |
| `XiuxianAgent`（Java Agent） | 反射注入 Brigadier 命令树，注册原生命令 `xiuxian` |

## 管理

- 查看 / 修改：`GET/PUT /api/admin/adapters`（保存旧配置 → 更新 → 差异对比重载）
- 重载：`POST /api/admin/adapters/reload`
- 管理后台 → 适配器模块可视化编辑

## 相关文档

- 配置文件 → [配置说明](./config)
- Minecraft 桥接端点 → [REST API](./rest-api)
