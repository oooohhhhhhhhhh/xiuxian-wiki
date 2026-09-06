# 插件开发

本文面向开发者，按 **V1.4.1-beta2** 源码（`src/main/java/com/mtxgdn/plugin` 包与 `src/main/resources`）讲解「修仙世界」的第三方插件系统：插件结构、元数据与生命周期、`PluginContext` 扩展点、类加载隔离、热重载、内置玩法模块与启停、模板生成器与最小示例。

## 一句话定位

服务端启动时扫描 `plugins/*.jar`，以**独立类加载器**（`PluginClassLoader`）加载每个第三方插件并纳入统一生命周期；插件通过 `PluginContext` 注册**指令 / 物品 / 游历事件 / 秘境 / 称号 / 物品能量值 / 权限码 / REST 端点 / 管理页 / WebSocket 处理器 / 自定义适配器类型**，并可访问全部玩法服务。另有一批**内置模块**（玩法模块与消息通道）以 `BuiltInPlugin` 形态编译在主 jar 中，经配置启停——两者共用 `Plugin` 生命周期接口。

## 插件结构

### 目录与最小文件

```
my-plugin/
├── pom.xml                    # Maven 工程（Java 23，见 pom.xml.template）
├── plugin.json                # 元数据（打包进 jar 根目录）
└── src/main/java/com/example/myplugin/
    ├── MyPlugin.java          # 主类：implements Plugin（@PluginMeta 亦可）
    └── …（command / item / event 等扩展类）
```

### 元数据：plugin.json 与 @PluginMeta

插件元数据来源按优先级：**`plugin.json` > `@PluginMeta` 注解 > 类名回退**。`plugin.json` 位于 jar 根目录或 `META-INF/plugin.json`（`PluginManager.readPluginJson`）；缺失时回退为扫描 jar 中第一个实现 `Plugin` 接口的类，并读取其 `@PluginMeta`；都没有则用类简单名做插件名。

| 字段 / 注解属性 | 说明 |
|-----------------|------|
| `name` | 插件名（唯一；冲突时跳过加载，日志警告「插件名称冲突」） |
| `version` | 版本号（`@PluginMeta` 默认 `1.0.0`） |
| `author` | 作者（`@PluginMeta` 默认「匿名」） |
| `description` | 一句话描述 |
| `main`（json）/ 类注解位置 | 主类全限定名（如 `com.example.myplugin.MyPlugin`） |

```json
// plugin.json（= plugin.json.template，{{…}} 为生成器占位符）
{
  "name": "我的插件",
  "version": "1.0.0",
  "author": "开发者",
  "description": "一个示例插件",
  "main": "com.example.myplugin.MyPlugin"
}
```

```java
// 等效的注解方式
@PluginMeta(name = "我的插件", version = "1.0.0", author = "开发者", description = "一个示例插件")
public class MyPlugin implements Plugin { … }
```

### 类加载隔离

每个插件一个 `PluginClassLoader`（`URLClassLoader` 子类）。其 `loadClass` 顺序：

1. 已加载类直接返回；
2. **服务端核心与第三方框架包优先交给父加载器**：`com.mtxgdn.*`、`java.*`、`javax.*`、`jakarta.*`、`sun.*`、`org.glassfish.*`、`io.jsonwebtoken.*`、`com.google.gson.*`、`org.yaml.*`、`com.zaxxer.*`、`org.mindrot.*`、`com.mysql.*`、`org.sqlite.*`；
3. 其余类从**插件自身 jar** 加载（插件间互不可见、互相隔离）；
4. 兜底再交父加载器。

插件停用/卸载时关闭对应 ClassLoader 释放文件句柄（`PluginManager.disableSingle`）。

## 生命周期

`Plugin` 接口（全部为默认空实现，按需覆写）：

```java
public interface Plugin {
    default void onLoad(PluginContext context) { }    // 加载：读配置、注册权限码等
    default void onEnable(PluginContext context) { }  // 启用：注册指令/物品/事件/秘境/Web 等
    default void onDisable(PluginContext context) { } // 停用：释放资源
}
```

加载与运行期管理（`PluginManager`，单例 `getInstance()`）：

| 方法 | 行为 |
|------|------|
| `init(new File("plugins"))` | 初始化插件目录（不存在则创建；幂等）。启动时由 `Main.doMain` 调用 |
| `loadPlugins()` | 扫描目录全部 `*.jar` → `loadSingle`：解析 plugin.json → 建 `PluginClassLoader` → 解析/实例化主类（无参构造）→ 建数据目录 `plugins/<插件名>/` 与 `PluginContext` → 自动 `ctx.loadLang()` → 记录 `LoadedPlugin` → 最后统一回调各插件 `onLoad` |
| `enablePlugins()` | 对全部已加载插件回调 `onEnable`（`Main` 在 HTTP 装配后调用） |
| `enablePlugin(name)` / `disablePlugin(name)` | 单插件启停（disable 仅调 `onDisable`，不卸载） |
| `unloadPlugin(name)` | 卸载（`onDisable` + 清理事件/Web/ClassLoader） |
| `reloadPlugin(name)` | 先停用再重新加载，重走 `onLoad` + `onEnable` |
| `loadPlugin(jar)` | 动态加载并启用单个 jar；若该插件已加载则自动转为热重载 |
| `disablePlugins()` | 服务器关闭时逆序停用全部插件（`ServerShutdownHook`） |
| `getLoadedPlugins()` / `getPluginStatuses()` / `getPlugin(name)` | 状态查询 |

停用时的自动清理（`disableSingle`）：`onDisable` → `PluginEventManager.unregisterAll(插件名)` → `PluginWebManager.unregisterPlugin(插件名)` → 关闭 `PluginClassLoader`。

### 热重载（文件监听）

- `plugins.hot_swap=true`（`application.yml`）时启动文件监听线程：**每 3 秒**扫描 `plugins/` 目录（`startFileWatcher`），检测到**新增 jar** → `loadPlugin`；**jar 更新**（`lastModified` 变化）→ `reloadPlugin`；**jar 删除** → `unloadPlugin`。
- 管理台「插件」页与 REST：`POST /api/admin/plugins/watcher/start|stop` 可运行时启停监听（`AdminResource`）。
- 也可手动调用：`GET /plugins`、`GET /plugins/list`（列表）、`POST /plugins/reload/{name}`、`POST /plugins/unload/{name}`、`POST /plugins/enable/{name}?type=`、`POST /plugins/disable/{name}?type=`（内置模块与第三方插件按名称统一处理）、`POST /plugins/load/{jarName}`。

## PluginContext 扩展点

`PluginContext` 是插件与服务端交互的主入口（构造见 `PluginManager.loadSingle`），按功能分组如下。

### 信息与资源

| 方法 | 说明 |
|------|------|
| `getInfo()` | `PluginInfo`（name/version/author/description/mainClass） |
| `getLogger()` | 插件专属日志（前缀 `Plugin[<名>]`） |
| `getDataFolder()` | 数据目录 `./plugins/<插件名>/`（不存在自动创建） |
| `getClassLoader()` | 当前插件类加载器 |
| `getResource(path)` | 读 jar 内资源（如 `config.properties`、`lang/zh_cn.json`） |
| `loadLang()` | 加载 jar 内 `lang/<语言>.json` 并入全局 `LangManager`（加载后由 PluginManager 自动调用一次） |
| `loadConfig(fileName)` | 读数据目录下 properties 配置（不存在返回空对象） |

### 内容注册

| 方法 | 说明 |
|------|------|
| `registerCommand(Command)` / `unregisterCommand` | 注册指令：自动进 `CommandRegistry`（OneBot/QQ/MC 全渠道 + REST 路由同时生效，见 [QQ 机器人指令](./qq-commands)） |
| `registerItem(Item)` / `unregisterItem` | 注册物品（`ItemRegistry`，key 带命名空间，如 `myplugin:demo_talisman`） |
| `registerItemEnergy(itemKey, energyValue)` / `unregisterItemEnergy` | 注册物品能量转化值（`EnergyService`，value 须 >0，无需改物品 price） |
| `registerExplorationEvent(ExplorationEvent)` / `unregister` | 注册游历事件 |
| `registerSecretRealm(SecretRealm)` / `unregister` | 注册秘境 |
| `registerTitle(Title)` / `unregisterTitle(key)` | 注册称号（成就） |
| `registerAdapterFactory(AdapterFactory)` / `unregisterAdapterType(type)` | 注册第三方消息通道类型（不可与内置 `onebot/qq/minecraft/minecraft-player` 重名），见 [适配器与外部接入](./adapters#类型注册与双开关) |

### 权限码

| 方法 | 说明 |
|------|------|
| `registerPermission(code, name, category)` | 注册自定义权限码到权限库（可被 `PermissionService.hasPermission` 等引用，**不会自动分配给任何角色**，需管理员手动授权） |
| `registerPermissions(codes[], names[], category)` | 批量注册（两组数组须等长） |

建议格式：`plugin.<插件名>.<功能>`（如 `plugin.shop.admin`）。角色分配与检查见 [权限体系](./permissions)。

### 事件总线

| 方法 | 说明 |
|------|------|
| `registerHandler(Type, condition, handler)` | 注册事件处理器（默认 `PRIORITY_NORMAL`）；`condition` 形如 `command=/你好`，空串 = 始终触发 |
| `registerHandler(Type, condition, priority, handler)` | 指定优先级（数值越大越先执行） |
| `registerHandler(Type, handler)` | 免条件注册 |
| `registerCustomHandler(customKey, condition[, priority], handler)` | 自定义事件 key（type 自动为 `CUSTOM`） |
| `setHandlersEnabled(Type, enabled)` | 开关本插件某类事件 |
| `fireEvent(PluginEvent)` | 主动触发事件供其他插件监听 |

事件对象 `PluginEvent`：`type` / `customKey` / `data`（`event.get(key)` 读、`event.set(key, value)` 写）/ `timestamp` / `cancelled`（`event.cancel()` 标记取消，后续 Handler 不再执行）。内置 `Type` 枚举：

| 类型 | 触发时机 |
|------|----------|
| `COMMAND` | 指令执行前（OneBot / QQ 官方 / MC 各渠道分发前触发，携带 `command`/`arg`/`senderId` 等 data） |
| `PLAYER_LOGIN` / `PLAYER_LOGOUT` | 玩家登录 / 登出 |
| `ITEM_USED` | 物品被使用 |
| `COMBAT_ENDED` | 战斗结束 |
| `EXPLORATION_START` / `EXPLORATION_END` | 游历探索开始 / 结束 |
| `SCHEDULED` | 定时周期事件（计时器触发） |
| `SERVER_READY` | 服务端启动完成 |
| `CUSTOM` | 自定义事件（配合 `customKey`） |

### 服务访问

`PluginContext` 直接提供 20 个服务快捷 getter：`getPlayerService`、`getItemService`、`getEconomyService`、`getCombatService`、`getSkillService`、`getDailyService`、`getExplorationService`、`getSecretRealmService`、`getSectService`、`getTechniqueService`、`getCraftingService`、`getEnhanceService`、`getChatService`、`getFriendService`、`getHeartDemonService`、`getTradeService`、`getGuideService`（新手引导）、`getRealmService`、`getEnergyService`、`getTitleService`。

服务注册表 `com.mtxgdn.common.service.ServiceRegistry` 共暴露 **26 个**懒加载单例 getter，其余 6 个（`getCaveService` 洞府、`getFormationService` 阵法、`getBuffService`、`getFarmService` 农场、`getMcBindingService` MC 绑定、`getMapService` 地图）可由插件直接静态引用（如 `ServiceRegistry.getFarmService()`，`com.mtxgdn.*` 委托父加载器加载）。

### 底层与工具

| 方法 | 说明 |
|------|------|
| `getDatabaseConnection()` | HikariCP 连接池取连接；**用后必须在 finally 中 close() 归还** |
| `getServerConfig(key, default)` / `Boolean` / `Int` | 读 `application.yml` 配置 |
| `checkRateLimit(key, limit, windowSeconds)` | 频率限制（建议 key `plugin:<插件名>:<action>`）；另有 `getRateLimitRemaining` |
| `isExperimentalFeatureEnabled(key)` / `getExperimentalFeatureValue` | 实验功能开关（`experimental.yml`） |
| `getJwtUtil()` / `getPlayerActionLogger()` / `getStatsCollector()` / `getGlobalLogger()` | JWT、玩家行为日志、全局统计、服务端日志 |

### Web 扩展（PluginWebManager）

| 方法 | 挂载结果 |
|------|----------|
| `registerRestResource(Class)` | 注册 jar 内 JAX-RS 资源类（`@Path`）进 Jersey 路由（`PluginWebManager.registerRestResource` → `resourceConfig.register`） |
| `registerWebPage(path, title, byte[] html)` | 管理页，挂载 `/admin/plugins/<插件名>/{path}`，标题出现在管理台导航 |
| `registerWebResources(resourceDir)` | 从 jar 注册静态资源目录；`<dir>/index.html` 自动作为 `/admin/plugins/<插件名>/` 首页，其余文件由资源路由服务 |
| `registerWebSocketHandler(messageType, handler)` | 游戏客户端 WebSocket 消息处理器：客户端发来 JSON 的 `type` 等于 `messageType` 时回调（data 含 `userId` 等） |

## 内置玩法模块与消息通道

内置模块直接编译在主 jar 中（无独立 jar），继承抽象类 `BuiltInPlugin`（`getName()/getVersion()/getDescription()/getCategory()`，类别默认 `gameplay`，消息通道返回 `adapter`），由 `BuiltInPluginRegistry` 管理。

### 模块清单（`Main.registerBuiltInPlugins` 实际注册数核验）

- **24 个玩法模块**：探索 `exploration`、秘境 `secret_realm`、坊市 `trade`、宗门 `sect`、农场 `farm`、洞府 `cave`、聊天 `chat`、好友 `friend`、排行 `rank`、搜索 `search`、地图 `map`、团队 `team`、称号 `title`、角色 `player`、修炼 `cultivation`、技能 `skill`、战斗 `pvp`、背包 `inventory`、经济 `economy`、能量 `energy`、功法 `technique`、炼丹锻造 `crafting`、增益 `buff`、阵法 `formation`。
- **4 个消息通道模块**（`AdapterChannelPlugin`，即适配器类型级总开关）：`onebot` / `qq` / `minecraft` / `minecraft-player`，类别 `adapter`。

### 启停与门控

- **配置键**：`built_in_plugins.<模块名>`（如 `built_in_plugins.farm`），默认启用。运行时生效来源为 `application.yml` 的 `built_in_plugins` 段（`BuiltInPluginRegistry.init()` 经 `AppConfig.getBoolean("built_in_plugins.<name>", true)` 读取，显式 `false` 禁用、重启生效）；打包资源中另附说明性模板 `src/main/resources/built_in_plugins.yml`。
- **启动时序**：`Main` 在插件系统初始化后 `registerBuiltInPlugins(registry)` → `registry.init()`（读配置，默认全开）→ `registry.enableAll(sharedContext)`（对每个启用模块回调 `onLoad` + `onEnable`）。消息通道模块的 `onEnable/onDisable` 仅在 `AdapterManager.isBootStarted()` 之后才真正启动/停止通道实例（启动期实例由 `AdapterManager.startAll()` 负责）。
- **运行期启停**：WebUI「插件管理」页或 `AdminResource`（`/admin/plugins/enable/{name}` 等）运行时启用/停用，并**持久化写回** `config/application.yml` 的 `built_in_plugins.*`（`BuiltInPluginRegistry.persistConfig` → `AppConfig.update`，重启后保持）。
- **门控一致性**：指令（`CommandRegistry.get` / `Command.isModuleEnabled`）、HTTP（`ModuleGateFilter`）、WebSocket（动作映射）三层统一以 `BuiltInPluginRegistry.isEnabledOrUnknown(module)` 判定；停用模块的指令在 `/帮助` 隐藏、被调用时提示「该玩法已停用」。

## 模板与生成器

### 内置模板（`src/main/resources/plugin-template/`）

| 模板 | 生成物 |
|------|--------|
| `pom.xml.template` | Maven 工程（Java 23；注释给出把服务端 jar 装入本地仓库并 `provided` 依赖的方法；把根目录 `plugin.json` 与 `src/main/resources` 一并打进 jar） |
| `plugin.json.template` | 插件元数据（`name/version/author/description/main`） |
| `Main.java.template` | 插件主类（`@PluginMeta` + 生命周期，注册示例指令与示例物品） |
| `HelloCommand.java.template` | 示例指令 `/你好` `/hello`：绑定/玩家校验后经 `ServiceRegistry.getItemService().addSpiritStones` 送 100 灵石 |
| `DemoItem.java.template` | 示例物品 `DemoItem`（命名空间 + `demo_talisman` key，CONSUMABLE / RARE） |

### 生成器

- **命令行向导** `java -jar main-V1.4.1-beta2.jar --plugin-make`（`PluginMaker`，无需启动服务端）：依次询问 插件名 / 版本 / 作者 / 描述 / artifactId / groupId / 主类名 / 输出目录 → 把 5 个模板渲染到目标目录（生成 `pom.xml`、`plugin.json`、主类、`command/HelloCommand`、`item/DemoItem`），产出**可直接 `mvn package`** 的项目。
- **图形生成器** `--plugin-make-gui`（`PluginMakerGUI`，Swing）：`CodeGenerator` 按注册项模型生成——每个**物品 / 指令 / 秘境**一个 Java 文件、事件集中生成 `EventHandlers` 类，并支持给注册项配**触发器**（`Trigger`/`TriggerConfig`、`TriggerEditorDialog` 等编辑器，可生成基于事件触发器执行的注册代码），另生成 `lang/zh_cn.json` 翻译文件与 README。GUI 组件：`BasicConfigPanel`（基础信息）、`EntriesPanel`/`RegistrableEntry`（注册项）、`TriggerPanel`、`Theme` 等（用途见各类名与类注释）。

## 最小插件示例

以下按模板简化（一个指令 + 一个物品的完整骨架）。目录 `plugins/` 下放入 `mvn package` 出的 jar 即被加载。

```json
// my-plugin/plugin.json
{
  "name": "新手插件",
  "version": "1.0.0",
  "author": "开发者",
  "description": "最小示例：/你好 送 100 灵石",
  "main": "com.example.myplugin.MyPlugin"
}
```

```java
package com.example.myplugin;

import com.mtxgdn.plugin.Plugin;
import com.mtxgdn.plugin.PluginContext;

public class MyPlugin implements Plugin {
    @Override
    public void onEnable(PluginContext context) {
        context.registerCommand(new HelloCommand());
        context.registerItem(new DemoItem());
        context.getLogger().info("新手插件已启用");
    }
}
```

```java
package com.example.myplugin;

import com.mtxgdn.common.command.Command;
import com.mtxgdn.common.command.CommandContext;
import com.mtxgdn.common.service.ServiceRegistry;
import com.mtxgdn.game.entity.PlayerInfo;

public class HelloCommand extends Command {
    public HelloCommand() {
        super(new String[]{"你好", "hello"},   // 中文主名 + 英文别名
                "向修仙者问好，获得一份灵石礼物", // 帮助描述
                "/你好",                        // 用法
                "经济");                        // 帮助分类（见 Command.CATEGORY_ORDER）
    }

    @Override
    public void execute(CommandContext ctx) {
        Long userId = ctx.requireBinding();          // 要求已绑定账号
        if (userId == null) return;
        PlayerInfo p = ctx.requirePlayer(userId);    // 要求已创建角色
        if (p == null) return;
        ServiceRegistry.getItemService().addSpiritStones(p.getId(), 100);
        ctx.reply("🌸 道友安好！赠送 100 灵石作为见面礼。");
    }
}
```

> 物品类参考 `DemoItem.java.template`：继承 `Item`，构造传入（命名空间、key、`ItemType`、`ItemRarity`、最大堆叠、售价、可交易、所需境界、`ItemEffect`），覆写 `use(playerId)` 定义使用效果。物品被 `/使用` 触发后即按 `use` 返回文案回复。

## 最佳实践与注意

1. 数据放 `getDataFolder()`，勿直接修改服务端文件（`./plugins/<插件名>/` 目录自动创建）。
2. 日志用 `getLogger()`（带插件名前缀），便于管理台日志按插件过滤。
3. `onDisable()` 中释放自建资源：数据库连接（用完即 close 归还池）、自建定时任务等——注册的事件与 Web 资源会被框架自动清理。
4. 对外 API 用 `checkRateLimit()` 防滥用。
5. 自定义权限码在 `onLoad()` 注册（推荐 `plugin.<插件名>.<功能>`），用 `Command.permission` / `RouteDefinition.get(path, permission, …)` 或 `@RequirePermission` 引用；插件权限**不会自动分配**，需管理员在权限体系页手动授权。
6. 事件需最先/最后处理时用带 `priority` 的 `registerHandler` 重载；处理链可 `event.cancel()` 截断、`event.set()` 传递数据。
7. 插件与内置模块共用一个主类加载器之外的父委托，勿把 `com.mtxgdn.*` 及其依赖框架打进插件 jar（会委托给服务端核心类，避免版本冲突）。
8. 依赖主 jar：`mvn install:install-file` 装入本地仓库后以 `scope=provided` 引入（见 `pom.xml.template` 注释），编译目标 Java 23。

## 相关文档

- 指令类怎么写、双端注册与帮助分类 → [QQ 机器人指令](./qq-commands)
- 消息通道适配器与第三方适配器类型 → [适配器与外部接入](./adapters)
- 事件总线 / 扫描注册 / 服务注册表 → [架构总览](./architecture)
- 权限码与角色 → [权限体系](./permissions)
- WebSocket 消息处理与 REST 端点 → [WebSocket 协议](./websocket)、[REST API](./rest-api)
