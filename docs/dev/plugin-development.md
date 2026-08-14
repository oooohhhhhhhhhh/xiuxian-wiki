# 插件开发

服务端内置完整插件系统：扫描 `plugins/*.jar`，独立类加载器隔离，插件可注册命令 / 物品 / 游历事件 / 秘境 / 称号 / 能量值 / 权限码 / REST 端点 / Web 页面 / WebSocket 处理器，并访问全部 26 个游戏服务。

## 生命周期

```
扫描 plugins/*.jar
  → onLoad(context)     加载阶段：读取配置、注册权限码（loadLang 自动加载插件翻译）
  → onEnable(context)   启用阶段：注册命令 / 物品 / 事件 / 秘境 / Web 路由
  → [服务器运行中...]
  → onDisable(context)  停用阶段：释放资源（事件 / Web / ClassLoader 自动清理）
```

运行时管理：`unloadPlugin(name)`（卸载）、`reloadPlugin(name)`（热重载）、`plugins.hot_swap=true` 时文件监听自动重载。

## 创建插件

### 目录结构

```
my-plugin/
├── pom.xml
├── plugin.json
└── src/main/java/com/yourname/myplugin/
    ├── MyPlugin.java
    ├── command/XxxCommand.java
    └── item/XxxItem.java
```

### 入口类

```java
@PluginMeta(name = "我的插件", version = "1.0.0", author = "作者", description = "示例插件")
public class MyPlugin implements Plugin {
    @Override
    public void onEnable(PluginContext context) {
        context.getLogger().info("插件已启用！");
        context.registerCommand(new HelloCommand());
        context.registerItem(new DemoItem());
    }
}
```

### plugin.json（可选，优先级高于注解）

```json
{
  "name": "示例插件",
  "version": "1.0.0",
  "author": "开发者",
  "description": "一个示例插件",
  "main": "com.example.MyPlugin"
}
```

打包 jar 放入 `./plugins/` 目录即可自动加载。也可用 `--plugin-make`（命令行向导）或 `--plugin-make-gui`（图形化生成器）创建项目骨架。

> Maven 构建：需先把服务端 jar 安装到本地仓库（`mvn install:install-file ...`），插件以 `provided` 依赖引入；编译目标 Java 23。

## PluginContext API

### 基础信息

| 方法 | 说明 |
|------|------|
| `getInfo()` | 插件元数据 |
| `getLogger()` | 插件日志（带前缀） |
| `getDataFolder()` | 数据目录 `./plugins/<插件名>/` |
| `getResource(path)` | 从 jar 读取资源 |
| `loadConfig(fileName)` | 加载数据目录 properties 配置 |
| `loadLang()` | 加载 jar 内 `lang/<语言>.json` 翻译（onLoad 自动调用） |

### 游戏服务（26 个）

`getPlayerService()` `getItemService()` `getEconomyService()` `getCombatService()` `getSkillService()` `getDailyService()` `getExplorationService()` `getSecretRealmService()` `getSectService()` `getTechniqueService()` `getCraftingService()` `getEnhanceService()` `getChatService()` `getFriendService()` `getHeartDemonService()` `getTradeService()` `getGuideService()` `getRealmService()` `getEnergyService()` `getTitleService()` `getCaveService()` `getFormationService()` `getBuffService()` `getFarmService()` `getMcBindingService()` `getMapService()`

### 内容注册

| 方法 | 说明 |
|------|------|
| `registerCommand(Command)` / `unregisterCommand` | 注册命令（自动注册 OneBot + REST 路由） |
| `registerItem(Item)` / `unregisterItem` | 注册物品 |
| `registerItemEnergy(key, value)` / `unregisterItemEnergy` | 注册物品能量值 |
| `registerExplorationEvent(...)` / `registerSecretRealm(...)` | 注册游历事件 / 秘境 |
| `registerTitle(Title)` / `unregisterTitle` | 注册称号 |
| `registerPermission(code, name, category)` | 注册权限码（建议 `plugin.<插件名>.<功能>`；不自动分配） |

### 事件总线

| 方法 | 说明 |
|------|------|
| `registerHandler(type, condition, handler)` | 注册事件处理器（默认优先级 0） |
| `registerHandler(type, condition, priority, handler)` | 带优先级（越大越先执行） |
| `registerCustomHandler(key, condition, handler)` | 自定义事件 |
| `setHandlersEnabled(type, enabled)` | 开关本插件某类事件 |
| `fireEvent(event)` | 触发事件 |

内置事件：`COMMAND` `PLAYER_LOGIN` `PLAYER_LOGOUT` `ITEM_USED` `COMBAT_ENDED` `EXPLORATION_START` `EXPLORATION_END` `SCHEDULED` `SERVER_READY` `CUSTOM`。

> 处理器可 `event.cancel()` 阻止后续执行，`event.set(key, value)` 传递数据；condition 支持 `key=value` 多条件。

### 底层接口

| 方法 | 说明 |
|------|------|
| `getDatabaseConnection()` | 获取数据库连接（DriverManager 直连，用后关闭） |
| `getServerConfig(key, default)` 等 | 读取 application.yml 配置 |
| `checkRateLimit(key, limit, seconds)` | 频率限制 |
| `isExperimentalFeatureEnabled(key)` | 实验性功能开关 |
| `getJwtUtil()` / `getPlayerActionLogger()` / `getStatsCollector()` | 工具 |

### Web UI

```java
// 注册 REST 端点（jar 内 @Path 资源类）
context.registerRestResource(MyPluginResource.class);   // → /api/game/myplugin/info

// 注册管理页面
context.registerWebPage("", "插件面板", html.getBytes(StandardCharsets.UTF_8));
// → http://127.0.0.1:8080/admin/plugins/MyPlugin/

// 注册静态资源目录（jar 内）
context.registerWebResources("webadmin");

// 注册 WebSocket 处理器
context.registerWebSocketHandler("myplugin_action", (socket, data) -> { ... });
```

## 类加载隔离

- 每个插件独立 `PluginClassLoader`（URLClassLoader）
- `com.mtxgdn.*` 与 JDK / 框架类委托给系统 parent（避免版本冲突）
- 插件之间**不共享类**，与服务器共享核心类

## 最佳实践

1. 数据放 `getDataFolder()`，不修改服务端文件
2. 日志用 `getLogger()`（带插件名前缀）
3. `onDisable()` 释放数据库连接、定时任务（事件 / Web 资源自动清理）
4. 自定义 API 使用 `checkRateLimit()` 防滥用
5. 权限码在 `onLoad()` 注册，用 `@RequirePermission` 或 `Command.permission` 引用
6. 事件优先级：最先 / 最后处理时用带 `priority` 的重载

## 示例

`examples/sample-plugin` 提供完整可编译示例（`/hello` 指令发送 100 灵石 + 示例物品）。参考项目源码中的 [README_PLUGIN.md](https://github.com/oooohhhhhhhhhh/xiuxian-server/blob/main/README_PLUGIN.md) 与本页 API。

## 相关文档

- 服务 API 详情 → [内部服务 API](./internal-api)
- 事件类型 → [架构总览](./architecture)
