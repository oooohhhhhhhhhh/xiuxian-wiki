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
| 网关 | `wss://api.sgroup.qq.com/websocket`（sandbox 前缀 `sandbox.`） |
| Intents | 默认 `GROUP_AT_MESSAGE_CREATE, C2C_MESSAGE_CREATE` |
| 触发 | 群消息必须 **@机器人** 才触发；私聊（C2C）直接触发 |
| 发送 | 群聊 / 单聊消息接口；被动回复窗口：单聊 60 分钟 / 群聊 5 分钟 |
| 限制 | 无禁言能力（官方 API 不支持）；group_openid 映射重启后变化 |

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
