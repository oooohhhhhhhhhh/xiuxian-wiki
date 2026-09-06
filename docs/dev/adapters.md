# 适配器与外部接入

本文面向开发者，按 **V1.4.1-beta2** 源码（`src/main/java/com/mtxgdn/adapter`、`onebot`、`qq`、`minecraft` 包）讲解「修仙世界」的外部消息通道：适配器模型、`config/adapters.json` 配置、OneBot（QQ 机器人服务端）、QQ 官方机器人、Minecraft 三种接入方式及端口/防火墙注意。

## 一句话定位

服务端把每个外部接入抽象为**适配器实例**：实例清单存于 `config/adapters.json`，由 `AdapterManager` 统一启动/停止/热重载；同一类型可配置多个实例（如多个 OneBot 机器人），每个实例独立运行。另有 **MOTD 预览**不属适配器实例，由 `motd.*` 独立配置。

## 适配器模型

### 包与类

| 类（`com.mtxgdn.adapter`） | 职责 |
|----------------------------|------|
| `AdapterConfigManager` | 读写 `config/adapters.json`（首次启动自动生成默认配置并落盘） |
| `AdaptersConfig` | 顶层结构：`adapters` 列表 |
| `AdapterConfig` | 单个实例：`id` / `type` / `enabled` / `config`（自由键值 map） |
| `AdapterManager` | 生命周期管理：按配置启动、停止、热重载、状态查询 |
| `ManagedAdapter` | 第三方适配器实例接口（`getType()/start(config)/stop()`） |
| `AdapterFactory` | 第三方适配器工厂接口（插件经 `PluginContext.registerAdapterFactory` 注册） |

### adapters.json 结构

```json
{
  "adapters": [
    {
      "id": "onebot-default",
      "type": "onebot",
      "enabled": true,
      "config": { "port": 6700, "mode": "ws_server", "send_mode": "text",
                  "screenshot_window_title": "", "screenshot_poll_interval": 2000 }
    },
    {
      "id": "minecraft-default",
      "type": "minecraft",
      "enabled": false,
      "config": { "jar_path": "", "server_dir": "mc_server", "java_path": "java",
                  "min_memory_mb": 512, "max_memory_mb": 1024, "auto_start": false,
                  "ready_timeout_seconds": 120, "extra_jvm_args": "",
                  "online_mode": false, "command_prefix": "xiuxian" }
    }
  ]
}
```

> 上例即 `AdapterConfigManager.createDefaultConfig()` 生成的**默认配置**：`onebot-default` 启用、`minecraft-default` 停用。QQ 官方与 minecraft-player 实例不内置默认条目，需自行按下方字段添加。

### 实例字段（顶层通用）

| 字段 | 说明 |
|------|------|
| `id` | 实例唯一标识（运行态键，如 `onebot-default`） |
| `type` | 适配器类型：内置 `onebot` / `qq` / `minecraft` / `minecraft-player`，或第三方插件注册的类型 |
| `enabled` | 实例级开关；**与** 类型级模块开关同时为 true 才运行 |
| `config` | 类型相关参数（键见各节字段表） |

### 类型注册与双开关

- **内置类型**硬编码于 `AdapterManager.isBuiltInAdapterType()`（`onebot/qq/minecraft/minecraft-player`），第三方插件不能覆盖。
- **第三方类型**：插件 `onEnable` 中 `context.registerAdapterFactory(factory)`（`AdapterFactory#create(config)` 返回 `ManagedAdapter`），注册后即可在 `adapters.json` 里新增该 `type` 的实例，启停与内置类型一致；`onDisable` 里用 `unregisterAdapterType(type)` 注销并停止其运行实例。内置类型同名/重复注册会被拒绝。
- **类型级模块开关**：每个内置类型对应一个 `AdapterChannelPlugin` 内置插件（见 [插件开发](./plugin-development)）。启动期（`AdapterManager.isBootStarted()==false`）由 `Main` 的 `AdapterManager.startAll()` 直接按实例启动；启动完成后若在插件管理页停用某类型（`built_in_plugins.<type>=false`），`AdapterChannelPlugin.onDisable` 调用 `AdapterManager.stopType(type)` 停止该类型全部实例，反之 `startType` 启动。`startOne()` 也会先查 `isTypeAllowed()`——类型模块停用则实例跳过启动。

### 生命周期与热重载

| 方法 | 行为 |
|------|------|
| `startAll()` | 启动所有 `enabled` 实例（服务器启动时调用），随后置 `bootStarted=true` |
| `startType(type)` / `stopType(type)` | 按类型启停（供通道插件运行时调用） |
| `startOne(cfg)` / `stopOne(id)` | 启停单个实例（重复启动警告；未知类型报错） |
| `stopAll()` | 服务器关闭时停掉全部实例（`Main` 停机钩子调用） |
| `reloadAll()` / `reloadAll(oldConfig)` | 重载配置并**差异对比**：删除/停用/变更的旧实例先停，新增/启用/变更的新实例再启 |
| `getStatus()` / `isRunning(id)` | 运行状态查询 |

**管理入口**：

- REST：`GET /api/admin/adapters`、`PUT /api/admin/adapters`、`POST /api/admin/adapters/reload`（权限码 `admin.adapters`，见 `AdminResource`；PUT 保存旧配置→更新→差异重载）。
- Web 管理台「适配器」模块（`webadmin` 前端 `adapters.js`）可视化编辑；「插件」模块（`plugins.js`）可对 `onebot/qq/minecraft/minecraft-player` 通道做类型级启停。

## OneBot（QQ 机器人，服务端模式）

实现位于 `com.mtxgdn.onebot`，服务器作为 **WebSocket 服务端**，Lagrange / LLOneBot 等 OneBot 实现以客户端身份连入上报消息。

### 实例字段（type=onebot）

| config 键 | 默认值 | 说明 |
|-----------|--------|------|
| `mode` | `ws_server` | 当前实现：`ws_server`（监听）；`screenshot`（实验性截图模式，见下） |
| `port` | `6700` | 本实例监听端口 |
| `send_mode` | `text` | 发送模式（默认纯文本） |
| `screenshot_window_title` | `""` | 截图模式目标窗口标题（留空自动识别） |
| `screenshot_poll_interval` | `2000` | 截图轮询间隔（毫秒） |

### 工作原理

- **监听**：每个 `ws_server` 实例创建独立的 Grizzly `HttpServer` + `NetworkListener`（`"onebot-<id>"`，硬绑定 `0.0.0.0:port`），在 WebSocketEngine 注册路径 `/onebot`；实例独占其端口监听器（`AdapterManager.startOneBot()`）。
- **收信**：`OneBotWebSocketServer` 接收 OneBot 上报的消息/事件 → 黑名单检查（群聊命中且启用自动禁言时走禁言流程）→ 已绑定用户先结算离线收益 → 挂起中的账号向导（`/cancel` 取消）→ `/` 开头指令解析 → 限流 → `CommandRegistry` 分发（`OneBotCommandContext`）。
- **限流**：每 QQ 号 60 秒 10 条指令（`RateLimiter.allow("qq:"+senderQq, 10, 60)`）。
- **发送**：走 OneBot 动作 API（`OneBotMessageSender`：`send_private_msg` / `send_group_msg` / `replyToSource` 等，经连接回执与心跳维护）。
- **指令体系与账号流程**：与 QQ 官方共用同一 `CommandRegistry` 与多步账号流程（`OneBotAccountFlow` 服务端侧 / `OneBotAccountFlowClient` 会话侧），详见 [QQ 机器人指令](./qq-commands)。

### 黑名单与群组自动禁言（仅 ws_server 消息链路）

- **存储**：`config/blacklist.yml`（条目 `entries`：`qqNumber` 或 `userId` 二选一 + `reason`/`bannedBy`/`createdAt`，缺失自动从 jar 复制默认）。命中黑名单的群消息若所在群启用了自动禁言，机器人检测自身是否为管理员后调用动作 `set_group_ban` 禁言。
- **群组配置**：`config/onebot_group_config.yml`，每群独立：

```yaml
groups:
  - groupId: 1234567890
    autoMuteEnabled: true      # 是否对本群启用自动禁言（默认 false）
    muteDurationDays: 29       # 禁言天数（默认 29 天，代码默认 29）
    createdAt: "2026-06-25 12:00:00"
    updatedAt: "2026-06-25 12:00:00"
```

- **自动续期**：`OneBotWebSocketServer` 内置调度任务**每 12 小时**检查黑名单并续期禁言（目标为群管理/群主时跳过）。
- 管理 API：`GET/POST /api/admin/blacklist`、`DELETE /api/admin/blacklist/qq/{qq}`、`/user/{userId}`；群配置 `GET /api/admin/onebot/groups`、`POST .../autoMute`、`.../muteDuration`。

### 截图模式（实验性）

实例 `mode: screenshot` 时由 `OneBotScreenshotBot` 接管：通过窗口截图与键鼠模拟与 QQ 客户端图形界面交互来收发消息。**需要图形桌面会话**，无头服务器不可用；仅实验性使用（详见类注释与 `application.yml` 遗留的 `onebot.screenshot.*` 说明）。

## QQ 官方机器人

实现位于 `com.mtxgdn.qq`：`QqOfficialAdapter` 基于 QQ 开放平台 API v2（AppID + ClientSecret 换取 access_token），复用 OneBot 侧会话抽象（`OneBotSession` / `OneBotMessageSenderClient` / `OneBotAccountFlowClient`）与指令管线。收信方式二选一：**WebSocket 网关**（出站，默认）或 **Webhook**（本地回调）。

### 实例字段（type=qq）

| config 键 | 默认值 | 说明 |
|-----------|--------|------|
| `mode` | `websocket` | `websocket`=出站网关；`webhook`=本地回调监听 |
| `app_id` | — | 开放平台机器人 AppID（必填） |
| `client_secret` | — | 机器人 ClientSecret（必填） |
| `gateway_url` | `wss://api.sgroup.qq.com/websocket` | WebSocket 网关地址 |
| `sandbox` | `false` | `true` 时连接沙箱网关 `wss://sandbox.api.sgroup.qq.com/websocket` |
| `intents` | `GROUP_AT_MESSAGE_CREATE,C2C_MESSAGE_CREATE` | 逗号分隔事件订阅（见下表）；仅网关模式使用 |
| `command_prefix` | `""` | 非空时消息须以此前缀开头（如 `xiuxian`）；空则 `/`、`.`、`！`、`!` 均可触发 |
| `send_mode` | `text` | 发送模式 |
| `remove_at` | `true` | 群消息自动剥离 `@机器人` 占位符（`<@!…>`）后再解析 |
| `reconnect_interval_ms` | `5000` | 网关重连基础间隔（指数退避，封顶 60 秒） |
| `webhook_host` | `0.0.0.0` | Webhook 监听地址 |
| `webhook_port` | `8080` | **必须为 80 / 443 / 8080 / 8443 之一** |
| `webhook_path` | `/qq/webhook` | 回调路径 |
| `webhook_max_skew_seconds` | `300` | 回调时间戳新鲜度容忍（防重放） |

Intent 位表（`QqOfficialAdapter.INTENTS`，常用项）：

| intent 名 | bit | 说明 |
|-----------|-----|------|
| `C2C_MESSAGE_CREATE` | `1<<20` | 单聊消息 |
| `GROUP_MESSAGE_CREATE` | `1<<24` | 群聊消息 |
| `GROUP_AT_MESSAGE_CREATE` | `1<<25` | 群聊 @机器人 消息（默认订阅） |
| `INTERACTION` | `1<<26` | 按钮等消息交互回调（**需在开放平台申请开通**） |
| `MESSAGE_AUDIT` | `1<<27` | 消息审核事件 |

> ⚠ 默认 `intents` **不含 `INTERACTION`**。若订阅了平台未开通的 intent，网关会以关闭码 **4014 disallowed intents**（或 op=9 Invalid Session）拒绝并无限重连——请先在开放平台开通对应能力，再于 `intents` 中加入，或移除未授权项后重启（服务端日志含排查提示）。

### WebSocket 网关模式（默认，出站）

- 无需开放入站端口：适配器主动连接官方网关（生产/沙箱），实现 Identify（op=2）/ Resume（op=6）/ 心跳（op=1/11）协议；断线指数退避重连（基础 `reconnect_interval_ms`，`1<<min(重试次数,6)`，封顶 60s）。
- access_token 经 `POST https://bots.qq.com/app/getAppAccessToken` 获取（默认 7200 秒有效），在过期前约 60 秒由调度任务自动刷新；调用开放 API 携带 `Authorization: QQBot <token>`。
- 收信：`GROUP_AT_MESSAGE_CREATE`（群聊须 @，`remove_at` 剥离占位符）、`C2C_MESSAGE_CREATE`（单聊直接触发）、`INTERACTION_CREATE`（按钮）、`READY` 等。openid / group_openid 由内部映射复用现有业务。

### Webhook 模式（mode=webhook）

本地回调服务 `QqWebhookServer`（JDK `HttpServer`，路径默认 `/qq/webhook`）。**端口必须为 80/443/8080/8443**（`ALLOWED_PORTS`，非法端口直接拒绝启动；443 建议以反向代理终止 TLS 后转发给本服务纯 HTTP 监听）。验签步骤：

1. 校验请求头 `X-Tsign-Open-App-Id` 与本机 `app_id` 一致；
2. 时间戳新鲜度校验（`webhook_max_skew_seconds`，10/13 位自适应秒/毫秒，防重放）；
3. 签名 = `Base64(HMAC-SHA256(client_secret, timestamp + "\n" + nonce + "\n" + body))`，与 `X-Tsign-Open-Signature` **常量时间比较**（`MessageDigest.isEqual`）。
4. 验签通过后按与网关相同的 `{t, id, d, s}` envelope 进入同一分发（`dispatchWebhookEvent`）。

请求头四元组：`X-Tsign-Open-App-Id` / `X-Tsign-Open-Timestamp` / `X-Tsign-Open-Nonce` / `X-Tsign-Open-Signature`。参考官方文档：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html

### 发送与被动回复窗口

- 发送走官方 REST：群聊 `POST /v2/groups/{group_openid}/messages`、单聊 `POST /v2/users/{openid}/messages`；内容超 3500 字符自动分段（优先换行处）。
- **被动回复窗口**：单聊 60 分钟、群聊 5 分钟；窗口内自动补充 `msg_seq`/`event_id`/`msg_id` 等字段。超出群聊窗口且未开通「主动消息」权限时发送失败并告警。
- 超长消息、防抖、发送失败告警均见 `QqOfficialAdapter` 实现注释。

### QQ 官方绑定隔离（重要）

QQ 官方平台下发的是 **openid**（平台内唯一、与真实 QQ 号无关），与 OneBot 的真实 QQ 号不是同一身份。因此：

- QQ 官方使用**独立绑定表 `qq_official_bindings`**（openid ↔ user_id，`QqOfficialBindingService`），与 OneBot 的 `qq_bindings`（QQ号 ↔ user_id，`QqBindingService`）互不挤占；同一玩家可同时在两平台各自绑定。
- 指令内操作者解析走平台感知查找（`CommandContext.resolveBoundUserId()` / `resolveBoundBinding()`）：OneBot 查 `qq_bindings`，QQ 官方经查找器查 `qq_official_bindings`，均回退 `mc_bindings`。
- 账号流程差异：QQ 官方以 openid 身份进入，`/注册` **跳过邮箱验证码**（见 `QqOfficialAdapter.handlePendingFlow`）；OneBot 服务端模式按需走邮箱验证。
- 群号：QQ 官方为 `group_openid`，运行期内映射为内部 Long 群号，**重启后映射变化**，与 OneBot 真实群号不互通。

### 消息交互（按钮）

- `QqButton`：`id` / `label` / `style`（0 灰 / 1 蓝 / 2 红 / 3 绿 / 4 橙）/ `data`（回调时作为 `button_data` 回传）/ `enter` / `url`（跳转链接按钮）；构造器 `QqButton.of(...)`、`QqButton.ofEnter(...)`、`QqButton.url(...)`。
- 发送：`sendGroupMsgWithButtons` / `sendGroupMsgWithKeyboard` / `sendPrivateMsgWithButtons` / `sendPrivateMsgWithKeyboard`（keyboard 结构 `content.rows[].buttons[]`，回调 `action.type=2`、`permission.type=2` 所有人可点）。
- 点击：收到 `INTERACTION_CREATE` → 适配器把 `button_data`（约定为游戏指令，如 `签到`）补 `/` 前缀后走正常指令管线，并尽力回传 `POST /interactions/{interaction_id}` 结束按钮“转圈”。
- 玩家侧用法 `/按钮`、`/按钮 <指令串>` 见 [QQ 机器人指令](./qq-commands#按钮消息仅-qq-官方)。

## Minecraft 接入

### MOTD 预览（非适配器实例）

`MinecraftMotdServer`（`com.mtxgdn.minecraft`）常驻监听 `0.0.0.0:motd.port`（默认 **25565**），实现现代（status+ping）与旧版（`0xFE`）服务器列表协议，向 MC 客户端展示 MOTD / 版本行 / 在线人数（在线数取游戏 WebSocket 在线玩家数）。参数全部来自 `application.yml` 的 `motd.*`（`Main` 装配 `MinecraftMotdServer.Config`）：

| 配置键（`motd.`） | 默认 | 说明 |
|-------------------|------|------|
| `port` | `25565` | 监听端口（硬绑定 0.0.0.0） |
| `max_players` | `2026` | 展示的最大玩家数 |
| `version_name` | `§b§l修仙世界 …` | 版本行文案 |
| `protocol_version` | `-1` | 协议版本（-1=自动/未知） |
| `line1` / `line2` / `line3` | 见 application.yml | MOTD 三行（第二行加粗） |
| `join_message` | `""` | 拒绝加入时显示的文案；支持 `{username}`/`{online}`/`{max}`/`{delay}`/`{server}` 占位符 |
| `redirect_server` | `""` | 目标服务器（host 或 host:port）；配置后玩家「加入服务器」经 **TCP 透传隧道**直接接入目标服 |
| `redirect_delay_seconds` | `5` | 仅作 `join_message` 的 `{delay}` 占位数值 |

要点：`redirect_server` 留空时，登录请求（nextState=2）被拒绝并提示「此服务器非 Minecraft 服务器」；配置了目标服务器后，把客户端握手+登录包原样转发并双向搬运字节流，对任意版本/正版离线/AuthMe 登录界面透明（`handleLogin → relayLogin`）；目标指向 MOTD 自身会防呆报错。注意透传后目标服务器看到的是本机 IP（如同反代入口）。

### 内嵌服务器进程模式（type=minecraft）

`MinecraftAdapter` + `MinecraftServerProcess` 在主服同机拉起一个 Minecraft 服务端子进程并管理其生命周期。**注意**：实例在 `adapters.json` 声明，但子进程实际参数读取 `application.yml` 的 `minecraft.*` 段（`MinecraftServerProcess` 逐项 `AppConfig.get("minecraft.*")`）：

| 配置键（`minecraft.`） | 默认 | 说明 |
|------------------------|------|------|
| `jar_path` | `""` | 服务端 jar 路径；**为空则跳过启动**（日志警告） |
| `server_dir` | `mc_server` | 服务端工作目录 |
| `java_path` | `java` | Java 可执行路径 |
| `min_memory_mb` / `max_memory_mb` | `512` / `1024` | JVM 堆内存 |
| `ready_timeout_seconds` | `120` | 等待就绪超时 |
| `extra_jvm_args` | `""` | 附加 JVM 参数 |
| `online_mode` | `false` | `true` 时经 Mojang API 解析正版 UUID（`MinecraftAdapter.resolveUuid`），`false` 用离线 UUID 算法 |
| `command_prefix` | `xiuxian` | 游戏内指令前缀（`/xiuxian <子命令>`） |

> 注：`minecraft` 类型实例的 `config` 键与 `application.yml` 的 `minecraft.*` 同名（默认块中还含 `auto_start` 等占位键）；子进程实际以 `application.yml` 的值为准（`MinecraftServerProcess` 构造读取），实例级 `enabled` 仅决定该通道是否启动。

进程接入链路（`MinecraftServerProcess` 构建/注入 + 控制台解析）：

1. 生成 `xiuxian-agent.jar`（`Premain-Class: com.mtxgdn.minecraft.agent.XiuxianAgent`，需先运行 `build-mc-agent.bat` 编译）并以 `-javaagent:` 注入；同时把 `XiuxianBridge.jar`（Bukkit 桥接插件，需 `build-mc-plugin.bat` 单独编译，清单见 `resources/plugin.yml`）复制进服务端 `plugins/`。
2. 玩家在游戏内 `/xiuxian <子命令>`：Agent（Brigadier 注入）或桥接插件（注册 `/xiuxian` 命令，别名 `xx`/`xian`）把子命令 POST 到主服 `http://<host>:8080/api/mc-command`（`McCommandResource`，`@Path("/mc-command")`，JSON：`mcName`/`mcUuid`/`command`/`args`，限流 `mc-api:<uuid>` 10 次/60 秒），回包以聊天/原生命令回显。
3. `MinecraftServerProcess` 解析子进程控制台日志的玩家上下线与聊天行 → 回调 `MinecraftAdapter.onPlayerJoin/onPlayerLeave/onChatMessage`：未绑定玩家收到注册引导（`/xiuxian register <角色名>` 两态会话 + 密码），已绑定玩家直接可用指令；`MinecraftAdapter` 经 `sendCommand("tellraw …")` 回复，`/cancel` 取消挂起会话。
4. `minecraft.online_mode=true` 时解析正版 UUID 并绑定；否则按 `OfflinePlayer:<名字>` 离线 UUID。

### 玩家直连模式（type=minecraft-player）

`MinecraftPlayerAdapter` + `MinecraftClient` 以**机器人账号**（仅离线模式）登录目标 MC 服务器，识别玩家 `/tell` 私聊后执行修仙指令——行为等同 OneBot 的私聊环境。实例字段（`MinecraftPlayerAdapter` 构造读取，全部来自 `config`）：

| config 键 | 默认 | 说明 |
|-----------|------|------|
| `host` | `127.0.0.1` | 目标服务器地址 |
| `port` | `25565` | 目标服务器端口 |
| `username` | `XiuXianBot` | 机器人账号名 |
| `password` | `""` | **必填**：为空则跳过启动；用作首次 `/reg` 与后续 `/l` 自动登录 |
| `protocol_version` | `762` | 协议版本 |
| `command_prefix` | `""` | 私聊指令前缀：空则取消息首段为指令；非空（如 `xiuxian`）须以该前缀开头（此时 `/xiuxian cancel` 亦可取消） |
| `login_delay_ms` | `3000` | 登录成功后等待消息到达的延迟 |

- 绑定以服务器返回 UUID 为凭证（取不到降级为离线 UUID 算法），绑定表 `mc_bindings`（`MinecraftPlayerBindingService`，UUID ↔ user_id）。
- 首次登录记录写入 `config/mc-player-logins.json`（按 `host:port` 记录 `firstLogin`/`lastLogin`），据此决定下次发 `/reg` 还是 `/l`。
- 发送经客户端 `tellraw`（模拟私聊，前缀 `§6[修仙]`）；限流 `mcplayer:<uuid>` 10 次/60 秒。
- 注册/绑定/解绑/改密等账号流程与指令体系与 OneBot 共用（`MinecraftCommandContext` 走同一 `CommandRegistry`），详见 [QQ 机器人指令](./qq-commands)。

## 端口与防火墙速查

| 通道 | 方向 | 默认端口 | 绑定 | 说明 |
|------|------|----------|------|------|
| REST / 管理台 / WebSocket 游戏网关 | 入站 | `8080` | `server.host`（默认 `127.0.0.1`，仅本机） | `server.port` 配置；公网需改 host 并注意管理员凭据 |
| OneBot（`ws_server`） | 入站 | `6700`（每个实例一端口） | **`0.0.0.0`**（硬编码） | 路径 `/onebot`；Lagrange/LLOneBot 以客户端连入 |
| QQ 官方网关 | **出站** | 443 | — | `wss://api.sgroup.qq.com/websocket`（沙箱域名同理），**无需开放入站端口** |
| QQ 官方 Webhook | 入站（可选） | `80/443/8080/8443` | `webhook_host` | 仅 `mode: webhook`；443 建议前置 TLS 反代 |
| Minecraft MOTD | 入站 | `25565` | **`0.0.0.0`** | `motd.port`；登录跳转=TCP 透传 |
| Minecraft 内嵌服务器 | 入站 | MC 服务端自身端口 | 本机子进程 | 供玩家直连进入；`server_dir` 内 |
| Minecraft 玩家直连 | 出站 | 目标服端口 | — | 机器人账号登录目标服 |

> **防火墙提醒**：`server.host` 默认仅 `127.0.0.1`；而 **OneBot 通道与 MOTD 服务始终监听 `0.0.0.0`**（分别由 `AdapterManager.startOneBot` 与 `MinecraftMotdServer` 硬编码绑定），公网部署请在系统防火墙放行 6700 / 25565 等所需端口，并确认 `adapters.json` 中不需要对外暴露的实例 `enabled=false`。QQ 官方 WebSocket 网关与 Minecraft 玩家直连为出站连接，不受入站防火墙影响。

## 相关文档

- 适配器驱动的指令体系与账号流程 → [QQ 机器人指令](./qq-commands)
- 通道类型级开关（内置插件 `onebot/qq/minecraft/minecraft-player`）与第三方适配器扩展 → [插件开发](./plugin-development)
- 指令即路由与 REST 分发 → [架构总览](./architecture)
- `application.yml` 各段（`motd.*`、`minecraft.*`）与运行配置 → [配置说明](./config)
- MC 桥接端点 `/api/mc-command` → [REST API](./rest-api)
