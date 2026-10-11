# 指令框架

服务端的指令系统是**自注册**的：继承 `Command` 基类，构造函数里调 `super(...)`，
指令就自动进入注册表。新增指令**不需要改任何注册代码**。

::: tip 本页讲"框架怎么用"
玩家可用的**全部指令清单**在[玩家玩法总览与全指令表](/player/)。

本页面向要新增/修改指令的开发者。
:::

## 三件事一次做完

一个指令类同时定义了三样东西：

| 定义 | 载体 | 效果 |
| --- | --- | --- |
| OneBot 子命令 | `registerSub(...)` | QQ 里 `/指令 子命令` 可用 |
| HTTP 路由 | `RouteDefinition.get/post(...)` | 暴露成 REST 接口 |
| 模块归属 | `setModule("farm")` | 受 `config/plugins.yml` 开关门控 |

::: tip 一套逻辑，多端复用
同一个指令类的业务逻辑写在 handler 里，OneBot 与 HTTP 只是两个不同的入口。
不要为 REST 单独再写一份逻辑。
:::

## 最小指令

```java
package com.mtxgdn.onebot.command.player;

import com.mtxgdn.common.command.Command;
import com.mtxgdn.common.command.CommandContext;

public class PingCommand extends Command {

    public PingCommand() {
        super(new String[]{"ping", "在吗"},   // 别名，第一个是主名
              "连通性测试",                    // 描述
              "用法: /ping",                  // 用法
              "实用功能",                      // 分类
              "game.player.info");            // 权限码，null = 不校验
    }

    @Override
    public void execute(CommandContext ctx) {
        ctx.reply("pong");
    }
}
```

::: warning 注册发生在构造函数里
`Command` 的构造函数末尾会调用 `CommandRegistry.register(this)`。
所以**必须由 `CommandScanner` 扫描到并实例化**才会注册 ——
类必须是 `public`、非抽象、有无参构造函数。
:::

## 构造函数参数

四个重载，逐级给默认值：

| 签名 | `privateOnly` | `requiresLogin` |
| --- | --- | --- |
| `(names, description, usage, category, permission, privateOnly, requiresLogin)` | 显式指定 | 显式指定 |
| `(names, description, usage, category, permission, privateOnly)` | 显式指定 | `true` |
| `(names, description, usage, category, permission)` | `false` | `true` |
| `(names, description, usage, category)` | `false` | `true`，且 `permission = null` |

| 参数 | 含义 |
| --- | --- |
| `names` | 别名数组。第一个通常作主名，其余为别名（如 `{"打坐","闭关","meditate"}`） |
| `description` | 帮助信息里的说明 |
| `usage` | 无参数/未知子命令时提示的用法 |
| `category` | 分类，决定 `/帮助` 里的分组与排序 |
| `permission` | 权限码；`null` 表示不校验 |
| `privateOnly` | 是否仅允许私聊触发 |
| `requiresLogin` | 是否要求已绑定账号（未登录时是否出现在帮助里） |

### 分类与排序

分类顺序由 `Command.CATEGORY_ORDER` 决定，数字越小越靠前：

| 顺序 | 分类 |
| --- | --- |
| 1 | 账号 |
| 2 | 我的角色 |
| 3 | 修炼 |
| 4 | 战斗 |
| 5 | 背包 |
| 6 | 探索 |
| 7 | 坊市 |
| 8 | 宗门 |
| 9 | 经济 |
| 10 | 社交 |
| 11 | 管理 |
| 12 | 实用功能 |

::: tip 新增分类不用改 HelpCommand
没在表里列出的分类会排在**最后**。要调整顺序，只需在 `CATEGORY_ORDER` 里加一行。
:::

## 子命令

带子命令的指令用 `registerSub` 注册：

```java
public class SectCommand extends Command {

    public SectCommand() {
        super(new String[]{"宗门", "sect"}, "宗门系统", "用法: /宗门 <子命令>", "宗门", "game.sect.manage");
        setModule("sect");                       // 受 plugins.yml 的 sect 开关门控

        registerSub("list",   (ctx, p, parts) -> ctx.reply(SectService.list()));
        registerSub(new String[]{"info", "详情"}, (ctx, p, parts) -> { ... });
        registerSub("create", (ctx, p, parts) -> { ... });
    }
}
```

子命令处理器签名：

```java
@FunctionalInterface
public interface SubHandler {
    void handle(CommandContext ctx, PlayerInfo p, String[] parts);
}
```

- `ctx` —— 指令上下文（回复、权限、取参）
- `p` —— 当前玩家的 `PlayerInfo`（框架已解析好）
- `parts` —— 分词结果，`parts[0]` 是子命令名本身

`execute()` 的默认实现已经做好了这些事：

```
requireBinding()          ← 取绑定的 userId，没有就提示
  ↓
权限校验                   ← permission != null 时检查
  ↓
requirePlayer(userId)     ← 取角色，没有就提示
  ↓
按 parts[0] 查子命令索引
  ├─ 命中 → 调 handler
  └─ 未命中 → onUnknown()
```

无参数时走 `onDefault()`（默认打印用法）。

### 覆写默认行为

```java
@Override
protected void onDefault(CommandContext ctx, PlayerInfo p) {
    // 例如无参数时直接展示列表，而不是打印用法
    showList(ctx, p);
}

@Override
protected void onUnknown(CommandContext ctx, PlayerInfo p, String sub, String[] parts) {
    ctx.reply("没有这个子命令: " + sub);
}
```

::: tip 简单指令直接覆写 execute
不需要子命令分发时（如 `/ping`），覆写 `execute(CommandContext)` 更直接。
需要权限与角色时可以用基类提供的 `requirePlayerInfo(ctx)`，
它一次做完「取绑定 → 校验权限 → 取角色」。
:::

## HTTP 路由

`RouteDefinition` 把指令同时暴露成 REST 接口：

| 工厂方法 | 含义 |
| --- | --- |
| `RouteDefinition.onebotOnly(subCommand, handler)` | 仅 OneBot 子命令 |
| `RouteDefinition.get(path, handler)` | 仅 HTTP GET |
| `RouteDefinition.get(path, permission, handler)` | 仅 HTTP GET，带独立权限码 |
| `RouteDefinition.post(path, handler)` | 仅 HTTP POST |
| `RouteDefinition.post(path, permission, handler)` | 仅 HTTP POST，带独立权限码 |

::: warning `httpOnlyGet` / `httpOnlyPost` 已废弃
它们只是 `get` / `post` 的旧名，语义完全相同。新代码请直接用 `get` / `post`。
:::

### 双端注册

想同时支持 `/宗门 list` 和 `GET /api/game/sect/list`，就**两个都注册**：

```java
public SectCommand() {
    super(...);
    setModule("sect");

    SubHandler listHandler = (ctx, p, parts) -> ctx.reply(SectService.list());

    registerSub("list", listHandler);                    // OneBot
    addRoute(RouteDefinition.get("sect/list", (rest) ->  // HTTP
            GameMessage.restOk(SectService.listJson())));
}
```

### HTTP 处理器上下文

```java
public interface RouteHandler {
    JsonObject handle(RestContext ctx) throws Exception;
}
```

`RestContext` 提供：

| 方法 | 说明 |
| --- | --- |
| `body()` | 原始请求体字符串 |
| `bodyJson()` | 解析成 `JsonObject` |
| `userId()` | 已认证的用户 ID |
| `playerId()` | 玩家 ID |
| `pathParam(name)` | 路径参数（字符串） |
| `pathParamLong(name)` | 路径参数（long） |
| `queryParam(name)` | 查询参数 |

路径参数用花括号声明，`matchPath` 负责匹配与提取：

```
pattern = "sect/info/{sectId}"
actual  = "sect/info/5"        → {sectId: "5"}
```

::: warning 段数必须完全一致
`matchPath` 要求**段数相同**，且非参数段必须逐字相等，否则返回 `null`（不匹配）。
:::

## 模块门控

```java
setModule("farm");   // 在 super(...) 之后调用
```

`isModuleEnabled()` 的判定：

```java
return module == null
        || BuiltInPluginRegistry.getInstance().isEnabledOrUnknown(module);
```

::: danger 停用模块后指令会"消失"
`CommandRegistry.get(name)` 在模块停用时**返回 `null`**：

```java
Command command = CommandRegistry.get(name);
if (command == null) return null;              // 被门控掉了
return command.isModuleEnabled() ? command : null;
```

这就是为什么停用一个玩法模块后，玩家发指令会收到"功能未开放"类提示。

需要绕过门控（例如管理端要看到全部指令）时用 `CommandRegistry.getRaw(name)`。
:::

模块名对应 `config/plugins.yml` 的 `plugins.*` 键，
例如 `"farm"`、`"sect"`、`"experimental_sect_war"`。
完整清单见[插件开关](/guide/plugins)。

## 指令注册表

| 方法 | 说明 |
| --- | --- |
| `register(command)` | 注册（由构造函数自动调用） |
| `unregister(command)` | 注销（插件卸载时用） |
| `get(name)` | 按别名取指令，**受模块门控**（停用时返回 `null`） |
| `getRaw(name)` | 同上但**不受门控** |
| `getAllUnique()` | 全部指令，去重 |
| `count()` | 指令总数 |
| `clear()` | 清空（测试用） |

## 扫描注册

启动时：

```java
CommandScanner.ScanResult cmdScanResult =
        CommandScanner.scanAndRegister("com.mtxgdn.onebot.command");
LOG.info(cmdScanResult.toString());
```

`ScanResult` 记录三个列表：

| 字段 | 含义 |
| --- | --- |
| `registered` | 成功实例化并注册的类 |
| `skipped` | 跳过（抽象类、非 public、无无参构造函数等） |
| `failed` | 实例化抛异常的类 |

::: tip 启动日志会打印统计
`正在扫描并注册命令...` 后面那行就是 `ScanResult.toString()`。
新增指令后如果**没出现在 `registered` 里**，先检查它是不是 `public` 且有无参构造函数。
:::

## 新增一个指令：完整步骤

1. **建类**，放在 `com.mtxgdn.onebot.command.<领域>/` 下，继承 `Command`：

```java
package com.mtxgdn.onebot.command.player;

public class MyFeatureCommand extends Command {
    public MyFeatureCommand() {
        super(new String[]{"我的功能", "myfeature"},
              "功能说明", "用法: /我的功能", "我的角色", "game.player.info");
        setModule("player");
        registerSub("do", (ctx, p, parts) -> doSomething(ctx, p));
        addRoute(RouteDefinition.post("myfeature/do", rest -> doSomethingJson(rest)));
    }
}
```

2. **权限码**：如果用了新权限码，先在 `PermissionCode` 里加一行（见[权限系统](/dev/permissions)）。
   用 `game.*` 前缀的码会自动包含进 `PLAYER` 角色。

3. **模块名**：用 `config/plugins.yml` 里已存在的键。如果要新增模块，
   需在 `PluginCatalog` 里登记（见[插件开发](/dev/plugin-dev)）。

4. **编译并重启**，在启动日志里确认类出现在 `registered` 列表。

5. **验证**：QQ 里发 `/我的功能`，REST 里 `POST /api/game/myfeature/do`。

::: danger 别名不要重复
`CommandRegistry` 用 `LinkedHashMap` 存别名，**后注册的会覆盖先注册的**。
新增别名前先 grep 一下有没有人用过。
:::

## 多平台如何分发

| 入口 | 分发方式 |
| --- | --- |
| OneBot | 收到消息 → 解析出指令名与参数 → `CommandRegistry.get(name)` → `execute(ctx)` |
| QQ 官方机器人 | 同上（`com.mtxgdn.qq`） |
| Minecraft 通道 | 同上（`com.mtxgdn.minecraft`，带 `minecraft.command_prefix` 前缀） |
| REST | `UnifiedRestResource` 用 `@Path("/game/{path:.*}")` 兜底，查 `getRestEndpoints()` 匹配路由 |
| WebSocket | 由 `GameWebSocketApp` 的动作表直接调 service（**不走指令系统**） |

::: warning WebSocket 不走指令系统
WS 的动作（`player_info`、`sect_list` 等）是**独立实现**的，
直接调用 service，不复用 `Command` 的子命令 handler。

所以新增功能时，如果希望 WS 也能用，需要**额外**在 `GameWebSocketApp` 里加一个 action。
:::
