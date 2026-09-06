# 内部服务 API

面向在**服务端进程内**扩展的开发者（第三方插件 `plugins/*.jar`、内置玩法模块、自定义指令、管理端工具）：如何调用内置服务、订阅事件、向服务端注册各类扩展点。进程外接入（HTTP/WS/QQ/MC）见 [REST API](./rest-api)、[WebSocket 协议](./websocket)、[适配器与外部接入](./adapters)。

> 本文以 **V1.4.1-beta2** 源码为准（`com.mtxgdn.plugin`、`com.mtxgdn.common.service`、`com.mtxgdn.game.service`、`com.mtxgdn.common.command`）。插件最小骨架与示例亦可直接参考 `src/main/resources/plugin-template/*.template`。

## 1. 进程内扩展的整体形态

- **第三方插件**：把编译好的 jar 放入运行目录 `plugins/`，启动时由 `PluginManager` 以独立类加载器加载，主类实现 `com.mtxgdn.plugin.Plugin` 接口（可选 `@PluginMeta(name, version, author, description)` 标注或在 jar 内提供 `plugin.json`，其 `main` 指向主类）。生命周期：`onLoad`（读配置、备数据）→ `onEnable`（**在此注册命令/物品/事件/秘境等**）→ `onDisable`（释放资源）。`plugins.hot_swap=true` 时可热加载。
- **内置玩法模块**：`Main` 把 24 个玩法模块与 4 个消息通道模块注册进 `BuiltInPluginRegistry`，由 `built_in_plugins.yml` / `built_in_plugins.<name>` 配置启停，运行期可在 WebUI「插件管理」页启停并持久化。
- **插件运行上下文**：一切能力的入口都是 `PluginContext`（`onLoad/onEnable/onDisable` 的参数），见下文。

```java
// 主类骨架（等价于 plugin-template/Main.java.template 生成结果）
package myplugin;

import com.mtxgdn.plugin.Plugin;
import com.mtxgdn.plugin.PluginContext;
import com.mtxgdn.plugin.PluginMeta;

@PluginMeta(name = "我的插件", version = "1.0.0", author = "张三", description = "示例")
public class MyPlugin implements Plugin {
    @Override public void onLoad(PluginContext ctx) {
        ctx.getLogger().info("正在加载...");            // 专属日志 GameLogger
        ctx.loadConfig("config.properties");            // plugins/<name>/ 下的配置
    }
    @Override public void onEnable(PluginContext ctx) {
        ctx.registerCommand(new HelloCommand());        // 注册指令（同时产出 HTTP 路由）
        ctx.registerItem(new MyTalismanItem());         // 注册物品
        ctx.registerPermission("plugin.shop.admin", "商店管理", "插件扩展");
    }
    @Override public void onDisable(PluginContext ctx) { }
}
```

## 2. 服务注册表（ServiceRegistry）

全部游戏/玩法服务都经 `com.mtxgdn.common.service.ServiceRegistry` 的**双检锁懒加载单例 getter** 获取（共 26 个）。指令层、REST 层、WS 层与插件共享同一批实例，业务数据一致。

| Getter | 服务类（`game/service`） | 典型能力 |
|--------|--------------------------|----------|
| getPlayerService | PlayerService | 角色创建/查询/改名/删除、加经验、疗伤、修炼起停、排行榜 |
| getRealmService | RealmService | 境界突破（渡劫）、境界信息 |
| getItemService | ItemService | 背包、加/扣/使用物品、灵石数、装备穿卸 |
| getSecretRealmService | SecretRealmService | 秘境列表/进入/团队副本 |
| getExplorationService | ExplorationService | 游历探索结算 |
| getGuideService | NewbieGuideService | 新手引导 |
| getSkillService | SkillService | 技能学习/熟练度 |
| getCombatService | CombatService | PVP/PVE 回合制战斗 |
| getDailyService | DailyService | 晨修/天象/机缘 |
| getTradeService | TradeService | 坊市挂单/购买/撤单 |
| getHeartDemonService | HeartDemonService | 闭关心魔判定与结算 |
| getChatService | ChatService | 世界/私聊发送与历史（含清洗与限流） |
| getFriendService | FriendService | 好友申请/同意/删除 |
| getEnhanceService | EnhanceService | 装备强化 |
| getCraftingService | CraftingService | 配方查询/制造 |
| getTechniqueService | TechniqueService | 功法学习/装备/升级 |
| getSectService | SectService | 宗门全流程 |
| getEconomyService | EconomyService | 金币/灵石、签到、回收、灵庄、拍卖、提纯 |
| getEnergyService | EnergyService | 能量值读写、物品↔能量转化（物品能量表可被插件注册） |
| getTitleService | TitleService | 称号授予/装备 |
| getCaveService | CaveService | 洞府 |
| getFormationService | FormationService | 阵法 |
| getBuffService | BuffService | Buff 查询/结算 |
| getFarmService | FarmService | 农场地块 |
| getMcBindingService | MinecraftPlayerBindingService | Minecraft 账号绑定 |
| getMapService | MapService | 世界地图/移动 |

`PluginContext` 提供同名快捷方法（`ctx.getPlayerService()` 等，覆盖前 21 个服务），指令代码里也可直接 `ServiceRegistry.getXxxService()`：

```java
// 指令内发灵石（plugin-template/HelloCommand 真实写法）
PlayerInfo p = ctx.requirePlayer(userId);
ServiceRegistry.getItemService().addSpiritStones(p.getId(), 100);

// 插件内查玩家
PlayerService ps = ctx.getPlayerService();          // 或 ServiceRegistry.getPlayerService()
PlayerInfo target = ps.getPlayerById(5L);
```

## 3. 指令框架与「指令即路由」

继承 `com.mtxgdn.common.command.Command`，构造函数里 `super(names, description, usage, category, permission?, privateOnly?, requiresLogin?)` 即**自动注册**进 `CommandRegistry`（小写别名）。`Command.execute(CommandContext)` 默认实现 = 绑定校验 → 权限码校验 → 取玩家 → 子命令分发。

```java
package myplugin.command;

import com.mtxgdn.common.command.Command;
import com.mtxgdn.common.command.CommandContext;
import com.mtxgdn.common.command.RouteDefinition;
import com.mtxgdn.common.service.ServiceRegistry;
import com.mtxgdn.game.entity.PlayerInfo;

/** 同时注册为 QQ/OneBot 指令与 REST 路由 */
public class HelloCommand extends Command {
    public HelloCommand() {
        super(new String[]{"hello", "你好"}, "问好并送灵石", "/你好",
              "经济", null);                       // permission=null 表示无需权限码
        // OneBot 子命令（仅消息通道，不出现在 HTTP）
        registerSub("问候", this::greet);
        // HTTP 路由：GET /api/game/hello/info 需要登录即可（无权限码）
        addRoute(RouteDefinition.get("hello/info", this::handleInfoHttp));
    }

    private void greet(CommandContext ctx, PlayerInfo p, String[] parts) {
        ctx.reply("🌸 道友安好！送 100 灵石。");
        ServiceRegistry.getItemService().addSpiritStones(p.getId(), 100);
    }

    /** REST 处理器返回 JsonObject；由 UnifiedRestResource 在 /api/game 下分发 */
    private com.google.gson.JsonObject handleInfoHttp(RouteDefinition.RestContext rc) {
        com.google.gson.JsonObject o = new com.google.gson.JsonObject();
        o.addProperty("code", 0);
        o.addProperty("message", "ok");
        o.addProperty("playerId", rc.playerId());
        return o;
    }
}
```

路由注册规则（`RouteDefinition`）：

| 模式 | 写法 | 效果 |
|------|------|------|
| 仅 OneBot 子命令 | `registerSub("name", handler)` 或 `RouteDefinition.onebotOnly(...)` | 不出现在 HTTP |
| 仅 HTTP | `RouteDefinition.get(path, handler)` / `post(path, handler)` | 仅 HTTP 路由 |
| HTTP + 权限码 | `RouteDefinition.get(path, permission, handler)` / `post(path, permission, handler)` | 分发前用 `PermissionService` 校验（403） |
| 双端注册 | `registerSub(...)` + `addRoute(RouteDefinition.get/post(...))` | 消息通道与 HTTP 同时可用 |

REST 处理器上下文 `RouteDefinition.RestContext` 提供：`body()`（JSON 字符串）、`bodyJson()`、`pathParam(name)` / `pathParamLong(name)`（`{param}` 段）、`queryParam(name)`、`userId()` / `playerId()`（分发器已解析）。路径支持 `sect/info/{sectId}` 形式的参数段。

## 4. 注册扩展点一览（PluginContext）

| 方法 | 注册内容 | 说明 |
|------|---------|------|
| registerCommand / unregisterCommand | 指令 | 进 `CommandRegistry`（同 `Command` 构造自注册，二选一） |
| registerItem / unregisterItem | 物品 | 进 `ItemRegistry`，key 为命名空间 `namespace:key` |
| registerItemEnergy / unregisterItemEnergy | 物品能量值 | `EnergyService.registerItemEnergy(itemKey, value)`，供能量转化系统 |
| registerExplorationEvent / unregisterExplorationEvent | 游历事件 | 进 `ExplorationEventRegistry` |
| registerSecretRealm / unregisterSecretRealm | 秘境 | 进 `SecretRealmRegistry` |
| registerTitle / unregisterTitle | 称号 | 进 `TitleRegistry` |
| registerPermission / registerPermissions | 权限码 | `PermissionService.registerPluginPermission(code, name, category)`；同步入库，默认不授予任何角色，需管理员在后台为用户分配 |
| registerHandler / registerCustomHandler | 事件处理器 | 见 §5 |
| setHandlersEnabled | 事件开关 | 按插件+类型开关 |
| fireEvent | 主动触发事件 | 插件间协作 |
| registerRestResource | JAX-RS 资源类 | 经 `PluginWebManager` 挂到 HTTP（自带 `@Path`，见下） |
| registerWebPage / registerWebResources | 管理后台页面 | 挂载 `/admin/plugins/<插件名>/...` |
| registerWebSocketHandler | WS 消息处理器 | 按 `type` 字符串精确注册，网关 default 分支调用（见 [WebSocket 协议](./websocket#客户端--服务端消息总表) 与下文） |
| registerAdapterFactory / unregisterAdapterType | 消息通道类型 | 注册自定义适配器类型（不能与 onebot/qq/minecraft/minecraft-player 重名），可在 `adapters.json` 配置实例 |
| getDatabaseConnection | 原生 SQL | 返回 HikariCP 连接，**用后必须在 finally 中 close()** |
| getServerConfig* / getServerConfigBoolean/Int | 服务端配置 | 读 `application.yml` |
| checkRateLimit / getRateLimitRemaining | 限流 | key 建议 `plugin:<插件名>:<action>` |
| isExperimentalFeatureEnabled / getExperimentalFeatureValue | 实验开关 | 读 `experimental.yml` |
| getJwtUtil / getPlayerActionLogger / getStatsCollector / getGlobalLogger | 工具 | 见 §6 |
| loadLang | 语言文件 | 自动合并 jar 内 `lang/zh_cn.json` 到全局 `LangManager` |
| getDataFolder | 数据目录 | `plugins/<插件名>/`，自动创建 |

物品扩展示例（等价 `plugin-template/DemoItem.java.template`，构造即注册所需字段，插件在 onEnable 里 `ctx.registerItem(new ...)`）：

```java
package myplugin.item;

import com.mtxgdn.game.item.EmptyEffect;
import com.mtxgdn.game.item.Item;
import com.mtxgdn.game.item.ItemRarity;
import com.mtxgdn.game.item.ItemType;

public class MyTalismanItem extends Item {
    public MyTalismanItem() {
        super("myplugin", "demo_talisman",       // 命名空间 + key（全键 myplugin:demo_talisman）
              ItemType.CONSUMABLE, ItemRarity.RARE,
              1,                                  // 最大堆叠
              888,                                // 基础售价（灵石）
              true,                               // 可交易
              1,                                  // 所需境界
              EmptyEffect.INSTANCE);              // 可换成自定义 ItemEffect
    }
    @Override public String use(long playerId) {
        return "✨ 你使用了示例护符，神清气爽！";
    }
}
```

REST 资源类注册示例（`ctx.registerRestResource(...)`，挂到 `/api` 根下与内置资源同路径空间，注意与内置路径避免冲突）：

```java
// 插件 jar 内
@jakarta.ws.rs.Path("/game/myplugin")
public class MyPluginResource {
    @jakarta.ws.rs.GET
    @jakarta.ws.rs.Path("ping")
    @jakarta.ws.rs.Produces(jakarta.ws.rs.core.MediaType.APPLICATION_JSON)
    public String ping() { return "{\"code\":0,\"message\":\"pong\"}"; }
}

// onEnable 中
ctx.registerRestResource(MyPluginResource.class);
```

## 5. 事件总线（PluginEventManager）

单例事件总线，线程安全，任意时刻可注册与触发。事件为 `PluginEvent`：`type` + 若干 `data`（key→Object）+ `timestamp`；CUSTOM 事件另带 `customKey`。

**内置事件类型**（`PluginEvent.Type`，10 种）：`COMMAND`（玩家执行命令）、`PLAYER_LOGIN`、`PLAYER_LOGOUT`、`ITEM_USED`、`COMBAT_ENDED`、`EXPLORATION_START`、`EXPLORATION_END`、`SCHEDULED`（定时触发）、`SERVER_READY`（服务端启动完成，data 含 serverTime）、`CUSTOM`（自定义 key）。

订阅（建议在 `onEnable` 中）：

```java
// 无条件订阅：登录事件
ctx.registerHandler(PluginEvent.Type.PLAYER_LOGIN, event -> {
    Long userId = event.get("userId");        // 携带 userId/username
    String name  = event.get("username");
    ctx.getLogger().info(userId + " 上线（" + name + "）");
});

// 条件订阅：仅当 data.command == "/你好" 时触发 COMMAND
ctx.registerHandler(PluginEvent.Type.COMMAND, "command=/你好", event -> {
    // ...
});

// 自定义 key 事件（key 与 type=CUSTOM 组合；可用 registerCustomHandler）
ctx.registerCustomHandler("my_key", "", event -> { });

// 优先级：数值越大越先执行（PRIORITY_NORMAL=0 / PRIORITY_HIGHEST / PRIORITY_LOWEST）
ctx.registerHandler(PluginEvent.Type.PLAYER_LOGIN, "", PluginEventManager.PRIORITY_HIGHEST, event -> { });
```

触发/取消/写入：

```java
// 插件主动触发（也可供他方监听）
PluginEvent ev = PluginEvent.builder()
        .type(PluginEvent.Type.CUSTOM)
        .customKey("my_key")
        .data("who", "someone")
        .build();
ctx.fireEvent(ev);                            // 或 PluginEventManager.getInstance().fire(ev)

// 处理器内可 event.cancel() 阻止后续处理器；可 event.set(k, v) 把结果写回事件
```

- 条件表达式为 `key=value`，多个条件以逗号分隔，值大小写不敏感；为空表示始终触发。
- 核心代码用 `PluginEventManager.fireQuietly(...)` 触发（内部捕获异常，不影响主流程）；订阅者 handler 抛异常只记日志，不影响其它处理器。
- 插件卸载/停用时，`PluginManager` 自动清理该插件全部处理器（`unregisterAll`）。

内置类型实际触发点示例：`UserService.login`（PLAYER_LOGIN，REST 登录）、`GameWebSocketApp`（WS auth 成功 PLAYER_LOGIN / 断开 PLAYER_LOGOUT）、`Main`（SERVER_READY）。

## 6. 常用基础设施（`com.mtxgdn.util` 等）

| 类 | 说明 |
|----|------|
| `JwtUtil` | 玩家 JWT 签发/校验（`generateToken(userId, username)` 7 天；`validateToken`；`extractUserId`；密钥 `jwt.secret` ≥32 字节）。管理端另有 `AdminAuthFilter.generateAdminToken`（12 小时） |
| `RateLimiter` | 固定窗口限流：`allow(key, limit, windowSeconds)` / `getRemaining(...)`；插件统一走 `ctx.checkRateLimit` |
| `TokenBlacklist` | 登出令牌内存黑名单：`invalidate / isBlacklisted` |
| `GameLogger` | 日志：`getLogger(name)`；控制台 + `log/` 文件 + 内存环形缓冲（管理台「实时日志」页读取） |
| `PlayerActionLogger` | 玩家行为日志（`getInstance()`），覆盖连接/聊天/修炼/突破/游历/秘境/物品/技能/战斗等 |
| `StatsCollector` | 消息/指令统计（管理台统计页数据源） |
| `LangManager` | i18n：按语言合并 JSON 词条，插件 `ctx.loadLang()` 加载 jar 内 `lang/*.json` |
| `TextSanitizer` | 聊天/昵称清洗（HTML 转义、内容净化） |
| `EmailService` / `VerificationCodeService` | SMTP 邮件与注册/找回验证码（`verify_code.*`、`smtp.*` 配置） |
| `ExperimentalConfig` | `experimental.yml` 实验开关读写 |
| `AppConfig` | `application.yml` 读取与持久化更新（`ctx.getServerConfig*` 封装） |
| `PermissionService` | 权限检查/角色分配/权限组；插件权限注册（见 §4） |
| `PlayerDataService`（`playerdata`） | 玩家数据文件导出/还原（`data/players/<playerId>.json`，自动落盘 30 秒周期） |
| `DatabaseManager` | 连接池入口：`getConnection()`（用后归还）、`exportAllData()`（全库备份 JSON） |

## 7. 内置玩法模块门控（对插件的影响）

- 内置模块名（= `built_in_plugins.<name>` 配置键）：exploration、secret_realm、trade、sect、farm、cave、chat、friend、rank、search、map、team、title、player、cultivation、skill、pvp、inventory、economy、energy、technique、crafting、buff、formation（24 个玩法模块），外加通道类型 onebot、qq、minecraft、minecraft-player（4 个消息通道模块）。
- 模块停用后：其指令经 `CommandRegistry.get` 视为不存在（`isModuleEnabled()` false）；REST 经 `ModuleGateFilter` 按 `/game/<首段>` 返回 403；WS 经 `wsModuleForAction` 返回 403。插件自己的 `Command` 若调 `setModule("xxx")` 也会受同一门控约束。
- 模块门控统一入口 `BuiltInPluginRegistry.getInstance().isEnabledOrUnknown(name)`。

## 8. WebSocket 自定义处理器（插件）

```java
// onEnable 中：注册一个自定义 WS 消息类型
ctx.registerWebSocketHandler("myplugin_action", (socket, data) -> {
    // data 为客户端发来的 JSON data 对象（服务端未注入 userId，自行约定携带）
    String userId = data.get("userId").getAsString();
    // 处理……
    com.google.gson.JsonObject reply = new com.google.gson.JsonObject();
    reply.addProperty("type", "myplugin_reply");
    reply.addProperty("msgId", 0L);
    reply.addProperty("code", 0);
    reply.addProperty("message", "ok");
    socket.send(reply.toString());            // 网关命中后不再回帧，需插件自行回复
});
```

约束：type 必须是网关内置 switch 未覆盖的字符串；同一 type 可挂多个 handler（按注册顺序执行）；回调只拿 `(WebSocket, JsonObject data)`；未命中任何内置类型且无插件处理时才回 6001。详见 [WebSocket 协议](./websocket#客户端--服务端消息总表)。

## 9. 适配器（消息通道）插件化

内置通道在 `Main` 注册为 `AdapterChannelPlugin(type, title, description)`，作为该类型**总开关**；实例级启停仍由 `config/adapters.json` 控制（两者都为 true 实例才运行）。第三方可注册自定义类型：

```java
ctx.registerAdapterFactory(new AdapterFactory() {
    public String getType() { return "my-channel"; }
    public ManagedAdapter create(AdapterConfig config) {
        return new ManagedAdapter() {
            public String getType() { return "my-channel"; }
            public void start(AdapterConfig cfg) throws Exception { /* 建立连接 */ }
            public void stop() { /* 释放资源 */ }
        };
    }
});
```

## 相关文档

- 指令注册与动态 HTTP 路由的框架细节 → [架构总览](./architecture)（指令即路由）
- 进程外 REST / WebSocket 接入 → [REST API](./rest-api)、[WebSocket 协议](./websocket)
- 权限码清单与默认角色 → [权限体系](./permissions)
- 插件打包、GUI 生成器（`--plugin-make`）与模板 → [插件开发](./plugin-development)
