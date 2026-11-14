# 插件开发

服务端有两套插件机制，用途不同：

| 类型 | 位置 | 开关 | 适合 |
| --- | --- | --- | --- |
| **内置插件** | 编译在主 jar 里 | `config/plugins/<插件名>.yml` 的 `enabled` | 官方玩法模块（26 个）+ 实验性功能 + 消息通道 |
| **外部插件** | `plugins/*.jar` | 插件自身启停状态 | 第三方扩展，不改主 jar |

::: tip 先确认你要写哪种
- 想给服务器**加一个新玩法**，并且愿意跟着主 jar 一起发布 → **内置插件**
- 想写一个**独立的扩展包**，能单独分发给别人 → **外部插件**
:::

---

## 一、内置插件

### 31 个内置插件

`PluginCatalog.createAll()` 是**唯一登记处**，共 31 个：

| 分组 | 数量 | 插件名 |
| --- | --- | --- |
| 基础玩法 | 6 | `exploration`、`secret_realm`、`trade`、`sect`、`farm`、`cave` |
| 社交玩法 | 4 | `chat`、`friend`、`rank`、`search` |
| 移动/养成 | 4 | `map`、`team`、`title`、`player` |
| 修炼/战斗 | 5 | `cultivation`、`skill`、`pvp`、`world_boss`、`inventory` |
| 经济/制造 | 6 | `economy`、`energy`、`technique`、`crafting`、`buff`、`formation` |
| 实验性 | 2 | `experimental_sect_war`（默认**关**）、`experimental_energy_exchange`（默认**开**） |
| 消息通道 | 4 | `onebot`、`qq`、`minecraft`、`minecraft-player` |

### 基类

```java
public abstract class BuiltInPlugin implements Plugin {

    public abstract String getName();          // 配置键名，必须与配置文件同名
    public abstract String getVersion();

    public String getDescription() { return ""; }

    /** WebUI 展示分组：gameplay / adapter / experimental */
    public String getCategory() { return "gameplay"; }

    /** 配置文件里缺少 enabled 时的默认值 */
    public boolean getDefaultEnabled() { return true; }
}
```

::: danger getName() 必须与配置文件名完全一致
`getName()` 的返回值就是插件配置文件名（`config/plugins/<getName()>.yml`），
也是 `setModule("...")` 门控时的匹配依据。写错会导致开关失效。

另有一个测试（`PluginConfigFilesTest`）核对"每个插件都有配置文件"，
漏建配置文件会直接失败，而不是等到运维发现。
:::

### 生命周期

```java
public interface Plugin {
    default void onLoad(PluginContext context) { }    // 加载：读配置、准备数据
    default void onEnable(PluginContext context) { }  // 启用：注册命令/物品/事件
    default void onDisable(PluginContext context) { } // 停用：释放资源
}
```

一个真实的例子（农场模块几乎什么都不做，因为玩法逻辑已经在 `FarmService` 里）：

```java
public class FarmPlugin extends BuiltInPlugin {

    @Override
    public String getName() { return "farm"; }

    @Override
    public String getVersion() { return "1.0.0"; }

    @Override
    public String getDescription() { return "农场系统：种植灵药、浇灌、收获"; }

    @Override
    public void onEnable(PluginContext context) {
        context.getLogger().info("农场系统已启用");
    }

    @Override
    public void onDisable(PluginContext context) {
        context.getLogger().info("农场系统已停用");
    }
}
```

### 关键：先置启用态，再回调

```java
private void enableEntry(BuiltInPluginEntry entry) {
    if (sharedContext == null) { ... }

    // 先置为启用再调用 onLoad/onEnable：onEnable 期间（如适配器通道启动实例、注册指令）
    // 会查询自身 isEnabledOrUnknown 门控，此时必须已处于启用态才能放行
    entry.enabled = true;
    entry.active = true;
    try {
        entry.module.onLoad(sharedContext);
        entry.module.onEnable(sharedContext);
    } catch (Throwable t) {
        entry.enabled = false;
        entry.active = false;      // 失败自动回滚启用态
        LOG.error("内置插件启用失败: " + entry.module.getName(), t);
    }
}
```

::: danger 在 onEnable 里注册东西时注意这个顺序
`onEnable` 里如果注册指令、启动适配器实例，那些代码会查询
`isEnabledOrUnknown(自己的名字)` 做门控。

因为注册表**已经先把自己置为启用**，所以能正常通过 ——
但如果你在 `onEnable` 里注册**别的模块**的东西，那个模块可能还没启用，会被门控拒绝。

启用失败时状态会自动回滚，不会留下"半启用"的插件。
:::

### 注册表 API

| 方法 | 说明 |
| --- | --- |
| `register(plugin)` / `registerAll(...)` | 登记（必须在 `init()` 之前） |
| `init()` | 读取各插件配置文件，决定启用/禁用 |
| `enableAll(ctx)` | 对所有已启用的插件调用 `onLoad` + `onEnable` |
| `disableAll(ctx)` | 调用所有插件的 `onDisable` |
| `isEnabled(name)` | 是否启用（未登记返回 `false`） |
| `isEnabledOrUnknown(name)` | 是否启用；**未登记的模块视为启用**（门控用这个） |
| `enablePlugin(name)` / `disablePlugin(name)` | 运行时启停，并**持久化写回该插件自己的配置文件** |
| `getStatuses()` | 供 WebUI 展示的状态列表 |
| `getRegisteredNames()` | 已登记的名字集合 |

::: tip `isEnabledOrUnknown` 的"unknown 也算启用"
门控用这个方法，是为了避免"某个模块忘了登记，结果功能被静默禁用"。
所以新增模块时**一定要在 `PluginCatalog` 登记**，否则它的开关写了也没用
（会被当成 unknown，永远启用）。
:::

### 开关持久化

`PluginSwitches` 负责读取开关，`PluginConfigFiles` 负责"哪个参数属于哪个插件"：

- 开关位置：`config/plugins/<插件名>.yml` 的 `enabled`
- 插件参数：同一个文件顶层的其余键
- 取值优先级：

```
-D 系统属性 > 运行期覆盖 > config/plugins/<插件名>.yml
           > config/application.yml > jar 内模板
```

- 旧键只读兜底：`config/plugins.yml` 的 `plugins.<name>`、
  `application.yml` 的 `built_in_plugins.*`、`config/experimental.yml` 的 `experimental.*`

::: tip 参数归属表
`PluginConfigFiles.PREFIX_OWNER` 登记"哪个参数前缀属于哪个插件"，例如
`market.*` → `trade`、`equipment.*` → `inventory`、`wilderness.*` → `map`。
`AppConfig.get()` 的查找链里插入了这一层，所以**既有调用点一行都不用改**。
:::

::: warning 测试里务必隔离配置路径
`PluginSwitches` 与 `PluginConfigFiles` 都是静态初始化的单例，
默认指向真实的 `config/` 目录。测试里直接调 `set(...)` 会把测试键
**写进你的真实配置文件**，污染后续运行。

测试请用 `PluginSwitches.useConfigPathsForTest(Path, Path)` 与
`PluginConfigFiles.useConfigDirForTest(Path)` 换成临时目录，用完再恢复。
:::

### 新增一个内置插件

1. 在 `com.mtxgdn.plugin.builtin` 下建类，继承 `BuiltInPlugin`：

```java
public class MyModulePlugin extends BuiltInPlugin {
    @Override public String getName() { return "my_module"; }
    @Override public String getVersion() { return "1.0.0"; }
    @Override public String getDescription() { return "我的新玩法"; }

    // 实验性内容可以覆写为 false
    // @Override public boolean getDefaultEnabled() { return false; }
}
```

2. **在 `PluginCatalog.createAll()` 里登记**（否则不生效）：

```java
plugins.add(new MyModulePlugin());
```

3. 建配置文件模板 `src/main/resources/plugin-configs/my_module.yml`：

```yaml
enabled: true          # 我的新玩法

# 该插件的可调参数（没有就只写 enabled）
```

4. 在 `PluginSwitches.TEMPLATE_PLUGIN_FILES` 里加一行 `"my_module"`
—— 这份清单决定启动时释放哪些配置文件。**漏加会直接被测试抓住**：
`PluginConfigFilesTest` 会核对它与 `PluginCatalog` 完全一致。

5. 在指令类里用 `setModule("my_module")` 绑定模块，让指令受开关门控。

6. 在 `GameWebSocketApp.wsModuleForAction()` 里加映射（如果该模块有 WS 动作）。

6. 重启，在**管理后台 → 插件管理**页确认新模块出现。

### 门控范围

模块被停用后，以下东西会一并失效：

| 对象 | 门控点 |
| --- | --- |
| 玩家指令 | `CommandRegistry.get(name)` 返回 `null` |
| REST 接口 | `ModuleGateFilter` |
| WebSocket 动作 | `GameWebSocketApp.wsModuleForAction()` |
| 帮助列表 | `Command.shouldShowInHelp()` |
| 后台定时任务 | 需重启进程才彻底停止 |

::: danger 停用不删数据
关掉模块只是让它不工作，数据库里的相关数据原样保留。
重新启用后玩家的宗门、挂单、农田都会回来。
:::

---

## 二、外部插件

### 目录约定

```
<jar 所在目录>/
└── plugins/
    └── my-plugin.jar        ← 把插件 jar 丢进来即可
```

启动时 `PluginManager.getInstance().init(new File("plugins"))` 扫描该目录。

### 插件清单

外部插件需要一份 `plugin.json`（模板见 `src/main/resources/plugin-template/plugin.json.template`），
声明插件名、版本、主类等元信息，由 `PluginMeta` 解析。

主类实现 `Plugin` 接口（`onLoad` / `onEnable` / `onDisable`），
由 `PluginClassLoader` 加载（独立类加载器，便于卸载）。

### 参考材料

| 文件 | 用途 |
| --- | --- |
| `src/main/resources/plugin-template/` | 脚手架模板：`Main.java`、`HelloCommand.java`、`DemoItem.java`、`plugin.json`、`pom.xml` |
| `examples/sample-plugin/` | 一个可编译运行的完整示例插件 |
| `README_PLUGIN.md` | 插件开发说明 |
| `PluginMaker` / `plugin/gui/**` | 插件生成器（含 GUI 与代码生成器 `CodeGenerator`） |

### 热重载

```java
if (AppConfig.getBoolean("plugins.hot_swap", false)) {
    pm.startFileWatcher();
}
```

::: warning 热重载默认关闭
配置键 `plugins.hot_swap` 默认 `false`。开启后 `plugins/` 目录变化会自动重载。

也可以在管理后台的插件页手动触发：
`POST /api/admin/plugins/reload/{name}`、`/load/{jarName}`、`/unload/{name}`，
以及启动/停止文件监视 `/plugins/watcher/start`、`/plugins/watcher/stop`。
:::

### 外部插件 vs 内置插件的开关

::: warning 两套开关互不相干
- 内置插件的开关在各插件配置文件 `config/plugins/<插件名>.yml` 的 `enabled`
- 外部插件的开关由**插件自身的启停状态**管理

插件配置目录 **不控制** `plugins/*.jar`。
:::

---

## 三、插件事件

`PluginEventManager` 提供事件总线，插件可订阅服务端事件：

| 事件 | 触发时机 |
| --- | --- |
| `PLAYER_LOGIN` | 玩家 WebSocket 认证成功 |
| `PLAYER_LOGOUT` | WebSocket 连接关闭 |
| `SERVER_READY` | 服务端完全就绪（插件可在 `onEnable` 里注册监听器） |

```java
@Override
public void onEnable(PluginContext context) {
    PluginEventManager.register(PluginEvent.Type.SERVER_READY, event -> {
        context.getLogger().info("服务器已就绪");
    });
}
```

::: tip SERVER_READY 是安全的初始化时机
它是在 HTTP、WebSocket、适配器**全部启动之后**才触发的
（见[架构总览](/dev/architecture)的启动流程第 20 步）。
需要访问已启动服务的初始化逻辑放这里最稳。
:::

---

## 四、PluginContext

`onLoad` / `onEnable` / `onDisable` 都会收到一个 `PluginContext`，提供：

| 能力 | 说明 |
| --- | --- |
| `getLogger()` | 带插件名前缀的日志器 |
| 配置读写 | 插件的独立配置 |
| 语言/文案 | 读取语言文件 |
| 资源访问 | 类加载器与数据目录（`PluginContext.createSharedContext(new File("data"), classLoader)`） |
| 服务获取 | 通过 `ctx.getService(XxxApi.class)` 拿核心/插件服务（底层 `PluginServiceRegistry`，未注册时回落当前容器） |

内置插件共用**一个** shared context（`Main` 里创建），
所以资源与数据目录是统一的；外部插件各有自己的 context。
