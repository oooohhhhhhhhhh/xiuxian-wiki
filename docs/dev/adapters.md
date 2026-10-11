# 消息通道适配器

适配器（Adapter）负责把**外部聊天平台**接进来：玩家在 QQ 或 Minecraft 里发消息，
服务端解析成指令执行，再把结果发回去。

配置文件：`config/adapters.json`

::: tip 适配器是"通道"，指令是"内容"
适配器只做**收发消息**，不实现玩法。所有玩法都在指令系统里，
适配器收到文本后交给 `CommandRegistry` 分发（见[指令框架](/dev/commands)）。

所以新增一个聊天平台，只需写适配器，玩法逻辑一行都不用改。
:::

## 配置文件

```json
{
  "adapters": [
    {
      "id": "onebot-default",
      "type": "onebot",
      "enabled": true,
      "config": {
        "port": 6700,
        "mode": "ws_server",
        "send_mode": "text"
      }
    },
    {
      "id": "minecraft-default",
      "type": "minecraft",
      "enabled": false,
      "config": {
        "server_dir": "mc_server",
        "auto_start": false,
        "command_prefix": "xiuxian"
      }
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 实例唯一标识（用于启停、状态查询） |
| `type` | 适配器类型，必须是内置 4 种之一或插件注册的自定义类型 |
| `enabled` | 该实例是否启用 |
| `config` | 类型专属配置，键值随意（由适配器自己解释） |

::: warning 文件不存在会自动生成
首次启动时 `AdapterConfigManager.load()` 发现 `config/adapters.json` 不存在，
会写入一份默认配置，包含：

- `onebot-default`（**启用**，端口 `6700`）
- `minecraft-default`（**禁用**）

文件损坏（JSON 解析失败）时也会回退到默认配置并重写。
:::

## 内置 4 种类型

| `type` | 名称 | 实现类 |
| --- | --- | --- |
| `onebot` | OneBot | `OneBotWebSocketServer` / `OneBotScreenshotBot` |
| `qq` | QQ 官方机器人 | `QqOfficialAdapter` |
| `minecraft` | Minecraft 内嵌服务端 | `MinecraftAdapter` |
| `minecraft-player` | Minecraft 玩家直连 | `MinecraftPlayerAdapter` |

`AdapterManager.isBuiltInType(type)` 用 `switch` 判定，只有这 4 个返回 `true`。

### OneBot

OneBot 适配器有两种运行模式，由 `config.mode` 决定：

| 模式 | 行为 |
| --- | --- |
| `ws_server` | 自己起一个 WebSocket 服务端，等 OneBot 实现（如 Lagrange、NapCat）连进来 |
| 截图模式 | `OneBotScreenshotBot` 轮询截图窗口，把游戏画面发给 QQ |

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `port` | `6700` | `ws_server` 模式监听端口 |
| `mode` | `ws_server` | 运行模式 |
| `send_mode` | `text` | 发送形式 |
| `screenshot_window_title` | `""` | 截图模式：目标窗口标题 |
| `screenshot_poll_interval` | `2000` | 截图轮询间隔（毫秒） |

::: danger 端口 6700 与本服务端口不同
`onebot.config.port` 是**适配器自己的监听端口**，
与 `server.port`（默认 8080）无关。两个都要在防火墙里放行（如果需要外部访问）。
:::

### Minecraft

`MinecraftAdapter` 会**拉起一个 Minecraft 服务端进程**（`MinecraftServerProcess`）。

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `jar_path` | `""` | 服务端 jar 路径 |
| `server_dir` | `mc_server` | 服务端工作目录 |
| `java_path` | `java` | Java 可执行文件路径 |
| `min_memory_mb` | `512` | 最小堆 |
| `max_memory_mb` | `1024` | 最大堆 |
| `auto_start` | `false` | 是否随修仙服务端一起启动 |
| `ready_timeout_seconds` | `120` | 等待服务端就绪的超时 |
| `extra_jvm_args` | `""` | 追加的 JVM 参数 |
| `online_mode` | `false` | 正版验证 |
| `command_prefix` | `xiuxian` | 指令前缀 |

::: warning Minecraft 通道默认关闭
默认配置里 `minecraft-default` 的 `enabled` 是 `false`，
且 `auto_start` 也是 `false`。要启用需要同时满足：实例 `enabled = true`，
以及（如果要自动拉起服务端）`auto_start = true`。
:::

相关文件：`MinecraftMotdServer`（MOTD 预览，用 `motd.port`）、
`MinecraftAuthService`、`MinecraftPlayerBindingService`（账号绑定）、
`McProtocolMapper`、`VarInt`、`XiuxianBridgePlugin`（服务端侧插件）。

### Minecraft 玩家直连

`minecraft-player` 是 `MinecraftPlayerAdapter`：不走内嵌服务端，
让 Minecraft 客户端**直连**本服务，用于玩家个人客户端场景。

## 生命周期管理

`AdapterManager` 是静态入口：

| 方法 | 说明 |
| --- | --- |
| `startAll()` | 按 `adapters.json` 启动所有 `enabled` 的实例 |
| `startType(type)` | 启动指定类型的全部实例 |
| `stopType(type)` | 停止指定类型的全部实例 |
| `startOne(cfg)` | 启动单个实例（内部按 `type` 分发） |
| `stopOne(adapterId)` | 停止单个实例 |
| `stopAll()` | 停止全部 |
| `reloadAll()` | 重新读配置并按差异重启 |
| `getStatus()` | `Map<adapterId, Boolean>` 运行状态 |
| `isRunning(adapterId)` | 单个实例是否在运行 |
| `isBootStarted()` | 是否已完成启动流程 |

::: tip `reloadAll()` 是增量重启
它会**深拷贝旧配置**（`AdaptersConfig.copy()`），再读新配置做对比，
只对**发生变化的实例**做停止/启动，未变的不动。

改完 `adapters.json` 后调用 `reloadAll()` 即可，不必重启整个服务端。
:::

### 取适配器实例

需要主动推送消息（例如定时广播）时，可以拿到实例：

| 方法 | 返回 |
| --- | --- |
| `getFirstOneBotWsServer()` | 第一个 OneBot WebSocket 服务端 |
| `getFirstScreenshotBot()` | 第一个截图机器人 |
| `getFirstQqOfficialAdapter()` | 第一个 QQ 官方适配器 |
| `getFirstMinecraftAdapter()` | 第一个 Minecraft 适配器 |
| `getFirstMinecraftPlayerAdapter()` | 第一个 Minecraft 玩家直连适配器 |

都返回**第一个**匹配实例，没有则返回 `null`。

## 两级开关

::: danger 通道有两道门，都要开
| 层级 | 位置 | 作用 |
| --- | --- | --- |
| **类型级** | `config/plugins.yml` 的 `plugins.onebot` / `qq` / `minecraft` / `minecraft-player` | 整个通道类型的总开关（由 `AdapterChannelPlugin` 承载） |
| **实例级** | `config/adapters.json` 的 `enabled` | 该具体实例是否启动 |

**只开实例级不够**：类型级被停用时，`startType` 会被门控拒绝。
反过来只开类型级也不够：实例的 `enabled` 仍是 `false`。
:::

## 写第三方适配器

外部插件可以在 `onEnable` 里注册**自定义类型**，之后在 `adapters.json` 里
就能像内置类型一样使用。

两个接口：

```java
public interface AdapterFactory {
    /** 适配器类型名（adapters.json 中 type 字段使用）。 */
    String getType();

    /** 为一个配置实例创建适配器。 */
    ManagedAdapter create(AdapterConfig config);
}
```

```java
public interface ManagedAdapter {
    String getType();
    void start(AdapterConfig config) throws Exception;   // 建立监听/连接
    void stop();                                          // 释放资源，应可重复调用
}
```

注册方式：

```java
@Override
public void onEnable(PluginContext context) {
    context.registerAdapterFactory(new AdapterFactory() {
        @Override
        public String getType() { return "my-chat"; }

        @Override
        public ManagedAdapter create(AdapterConfig config) {
            return new MyChatAdapter();
        }
    });
}
```

注册之后，`adapters.json` 里写 `"type": "my-chat"` 就能被
`AdapterManager` 正常启动/停止，行为与内置适配器一致。

::: warning stop() 必须可重复调用
`reloadAll()` 与关闭流程都可能重复调用 `stop()`。
实现时要做幂等保护，否则会抛异常或重复释放资源。
:::

### 读取实例配置

`AdapterConfig` 提供带默认值的取值方法，避免自己判空：

```java
String host = config.getString("host", "0.0.0.0");
int port    = config.getInt("port", 8080);
boolean tls = config.getBoolean("tls", false);
```

| 方法 | 说明 |
| --- | --- |
| `getId()` / `getType()` / `isEnabled()` | 元信息 |
| `get(key, defaultValue)` | 泛型取值 |
| `getString(key, default)` | 字符串 |
| `getInt(key, default)` | 整数（兼容字符串数字） |
| `getBoolean(key, default)` | 布尔（兼容字符串 `"true"`） |
| `getConfig()` | 原始 `Map<String, Object>` |
| `copy()` | 深拷贝（热重载对比用） |

::: tip 数字与布尔会自动转换
JSON 里写 `"port": "6700"`（字符串）也能被 `getInt` 正确读出；
`"tls": "true"` 同理。但建议还是写正确的 JSON 类型。
:::

## 排查

| 现象 | 检查 |
| --- | --- |
| 适配器没启动 | `adapters.json` 的 `enabled`；`plugins.yml` 对应类型开关；看启动日志有没有 `已启动适配器` |
| OneBot 连不上 | `port` 是否被占用；OneBot 实现配置的反向 WS 地址是否指向本机 `6700` |
| Minecraft 起不来 | `jar_path` 是否为空；`java_path` 是否可用；`ready_timeout_seconds` 是否太短 |
| 改了配置没生效 | 调 `reloadAll()`，或重启；确认改的是 `<jar目录>/config/adapters.json` 而不是源码里的模板 |
| 指令没反应 | 该平台的消息是否真的到了服务端；`command_prefix`（Minecraft）是否匹配 |
