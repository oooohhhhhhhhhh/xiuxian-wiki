# QQ 机器人指令

本文面向开发者，按 **V1.4.1-beta2** 源码（`src/main/java/com/mtxgdn`）讲解「修仙世界」QQ 机器人指令体系的框架、声明方式、帮助系统与跨渠道差异。OneBot（真实 QQ 号，服务端模式）与 QQ 官方机器人（openid）共用同一套指令与账号流程，仅绑定身份、触发方式与个别能力不同，详见文末[差异对比](#onebot-与-qq-官方差异)。

## 一句话定位

服务端把每个玩法能力实现为一个 `extends Command` 的类（共约 **79 个**，位于 `com.mtxgdn.onebot.command` 及其子包），构造时自注册进 `CommandRegistry`。一条指令定义同时产出「QQ 子命令」与「REST 路由」（[指令即路由](./architecture#指令即路由)），所有渠道（OneBot / QQ 官方 / Minecraft）的消息都汇入同一指令管线。

## 触发与解析约定

| 约定 | 说明（源码依据） |
|------|------------------|
| 消息前缀 | OneBot 与 QQ 官方默认均以 `/` 开头视为指令（QQ 官方额外兼容 `.`、`！`、`!`，见 [差异](#onebot-与-qq-官方差异)） |
| 命令名 | 大小写不敏感：注册键与子命令索引统一 `toLowerCase()` |
| 参数分词 | `Command.execute()` 默认以空白分词（`split("\\s+", 3)`），`parts[0]` 为子命令名 |
| 主命令与别名 | `names[]` 中第一个是主名，其余为别名，一律可触发（如 `/状态`、`/status`、`/info` 等价） |
| 物品参数 | 多数指令提示可用**中文名或 key**（`ItemRegistry.resolve` 解析），可用 `/物品列表` 查看映射表 |
| 帮助 | `/帮助`、`/help`（免登录，按分类输出，见[帮助系统](#帮助系统与分类)） |

## 指令框架与声明方式

### 扫描注册

启动时 `Main.doMain()` 调用 `CommandScanner.scanAndRegister("com.mtxgdn.onebot.command")`：递归扫描该包（含全部子包），凡 **public、非抽象、继承 `Command`、有无参构造** 的类被反射实例化；实例化发生在 `Command` 构造函数里，随即按别名自注册到 `CommandRegistry`（静态 `LinkedHashMap<String, Command>`，键为小写别名）。因此「新增一个指令类」即可自动生效，无需任何手工登记。

> 扫描器仅接受 public + 无参构造；QQ 官方与 MC 渠道不单独扫描，直接复用这套注册表。

### 指令类骨架

声明集中在 `super(...)` 构造调用中（`Command.java` 提供 4 档便捷重载）：

```java
protected Command(String[] names, String description, String usage,
                  String category, String permission, boolean privateOnly, boolean requiresLogin)
// 便捷重载依次省略：requiresLogin（默认 true）→ privateOnly（默认 false）→ permission（默认 null）
```

一个真实示例（`onebot/command/player/StatusCommand.java`）：

```java
public class StatusCommand extends Command {
    public StatusCommand() {
        super(new String[]{"状态", "信息", "status", "info"},   // 主命令 + 别名
                "查看角色状态（含离线收益）",                    // 描述（/帮助 展示）
                "/状态",                                        // usage
                "我的角色",                                     // 分类
                "game.player.info");                           // 权限码
        setModule("player");                                   // 所属内置模块（可空）
    }

    @Override
    public void execute(CommandContext ctx) { /* 处理器实现 */ }
}
```

构造参数语义表：

| 参数 | 含义 | 例子（来自源码） |
|------|------|------------------|
| `names` | 主名 + 别名数组，小写化后进注册表 | `{"打坐","闭关","meditate","cultivate"}`（CultivateCommand） |
| `description` | 帮助列表中的一行描述 | 「每日晨修，获取天象加成」 |
| `usage` | 无参数 / 未知子命令时的用法提示 | `/宗门 <子命令> [参数]` |
| `category` | 帮助分类名（见[分类排序](#帮助系统与分类)） | 「宗门」「战斗」「经济」… |
| `permission` | 权限码，`null` 表示玩家通用 | `game.sect.manage`、`admin.status` |
| `privateOnly` | `true` 时群聊中触发被拦截（提示改用私聊） | `/解绑`、`/发放`、`/cleardb_players` |
| `requiresLogin` | `false` 时未绑定也能使用（`/帮助` `/注册` `/绑定`） | `/注册`、`/绑定` |

### 内置模块门控 setModule()

```java
protected void setModule(String module)   // 模块名对应 built_in_plugins.<module>，如 "sect"/"farm"
public boolean isModuleEnabled()          // 无模块或模块启用时为 true
```

- 在 `super(...)` 之后调用 `setModule("sect")` 等，把指令归属到某个内置玩法模块（SectCommand、FarmCommand、ExploreCommand 等均如此声明）。
- 模块停用时：`CommandRegistry.get(name)` 返回 `null`（**所有入口统一失效**，含 OneBot / QQ / MC 与 REST），`getRaw(name)` 仍可取到实体以便给出「该玩法已停用」提示。
- `Command.shouldShowInHelp(userId)` 也先检查模块开关，停用模块的指令不进 `/帮助`。

### 子命令与双端（OneBot + REST）注册

所有注册统一走 `addRoute(RouteDefinition)`（`Command` 内 `routes` 列表 + OneBot 侧 `subIndex` 小写索引），三种形态（`RouteDefinition.java`）：

| 工厂方法 | 语义 |
|----------|------|
| `RouteDefinition.onebotOnly(sub, handler)` | 仅 OneBot 子命令，不出现在 REST |
| `RouteDefinition.get(path, handler)` / `.post(path, permission?, handler)` | 仅 HTTP 路由（`httpOnlyGet/httpOnlyPost` 为同义旧名）；支持 `{param}` 路径参数 |
| `registerSub(name|names[], handler)` | 便捷方法 = `onebotOnly`，可为多个别名注册同一处理器 |

- `Command.addRoute()` 统一收口：非 httpOnly 且带子命令名的路由写入 `subIndex`（小写），HTTP 侧经 `getRestEndpoints()` 暴露给 `UnifiedRestResource` 动态分发（URL 前缀 `/api/game/`，见 [REST API](./rest-api)）。
- **双端注册**示例（`SectCommand`）：OneBot 侧 `registerSub("create"/"创建", …)` 等二十余项；HTTP 侧 `addRoute(RouteDefinition.get("sect/info/{sectId}", "game.sect.manage", …))`。
- 同一份 `routes` 同时服务两端：`getSubCommandNames()` 供 `/帮助` 紧凑展示子命令。

### 默认 execute() 管线

未覆写 `execute()` 的指令执行顺序（`Command.java`）：

```
requireBinding()        绑定检查：平台感知解析（OneBot→qq_bindings / QQ官方→qq_official_bindings / MC→mc_bindings）
                        未绑定回复「请先注册或绑定账号…」并中止
permission 非空 → PermissionService.hasPermission(userId, permission)  失败回复「权限不足」
requirePlayer(userId)   无角色则提示 /register 创建角色
参数为空                → onDefault(ctx, p)（默认打印 usage）
参数分词，查 subIndex   命中 → 子命令处理器 handle(ctx, p, parts)
未命中                  → onUnknown(ctx, p, sub, parts)（默认打印未知子命令 + usage）
```

指令内如需自行二次鉴权可用 `CommandContext.requirePermission(code)` / `checkPermission(code)`（区别见源码注释与 [权限体系](./permissions)）。

### 同名别名覆盖（注意）

`CommandRegistry.register` 按小写别名直接 `put`，因此**同名别名会被后实例化的类覆盖**；而扫描顺序取决于文件系统遍历顺序（不保证稳定）。源码中实际存在多组重复别名，最终归属不保证：

| 别名 | 冲突双方 |
|------|----------|
| `status` | 玩家 `StatusCommand`（我的角色）↔ 管理 `StatusCommand`（`服务器状态/serverstatus`） |
| `pvp` | 战斗 `PvpCommand`（挑战）↔ 战斗/决斗 `PvpCommand`（`pvp` 子包） |
| `灵根` | `SpiritualRootCommand`（玩家）↔ `SetRootCommand`（管理：修改灵根） |
| `发放`/`give` | 管理 `GiveCommand` ↔ 物品 `ItemGiveCommand` |
| `物品列表` | 背包 `ItemMapCommand` ↔ 管理 `ItemsQueryCommand` |

## 帮助系统与分类

`/帮助`（`HelpCommand`）按以下规则动态生成，不写死清单：

1. `ctx.resolveBoundUserId()` 平台感知地解析操作者（未绑定返回 `null`）。
2. 遍历 `CommandRegistry.getAllUnique()`，仅保留 `shouldShowInHelp(userId)` 为 true 的指令：
   - 所属内置模块已停用 → 不展示；
   - `userId == null` → 仅 `requiresLogin == false` 的指令（即未绑定时帮助里只有 `/帮助 /注册 /绑定` 等）；
   - 已绑定时：无权限码 → 展示；有权权限码 → `PermissionService.hasPermission` 判定，无权限不展示。
3. 按分类分组，类别顺序取自 `Command.CATEGORY_ORDER`（`Command.java`），数字越小越靠前，未列出的分类排最后——**新增分类只需在此 map 加一行，无需改 HelpCommand**：

| 顺序 | 分类 | 顺序 | 分类 |
|------|------|------|------|
| 1 | 账号 | 7 | 坊市 |
| 2 | 我的角色 | 8 | 宗门 |
| 3 | 修炼 | 9 | 经济 |
| 4 | 战斗 | 10 | 社交 |
| 5 | 背包 | 11 | 管理 |
| 6 | 探索 | 12 | 实用功能 |

4. 每行以「主命令 `[子命令1|子命令2|…]` + 描述」紧凑排版（子命令串超 24 字符截断），落款附项目地址。

## 权限与登录要求

- **登录（绑定）要求**：`requiresLogin` 默认 `true`——大多数指令先要求 QQ/MC 身份已绑定游戏账号；例外是 `/帮助`、`/注册`、`/绑定`（`requiresLogin=false`）。
- **权限码**：指令构造时声明；执行前由 `Command.execute()`（或渠道适配器分发前置）经 `PermissionService` 校验，失败回复「权限不足，你无权使用此功能。」。常见权限码示例（均出自源码指令声明）：

| 权限码 | 指令（示例） |
|--------|--------------|
| `game.player.info` | `/状态`、`/疗伤`、`/晨修`、`/天象`、`/坊市`/`/上架`/`/购买`（坊市全套）、`/解绑`/`/改密`/`/注销` |
| `game.inventory.view` | `/背包`、`/已装备` |
| `game.item.use` | `/使用` |
| `game.equipment.equip` | `/装备`、`/卸下` |
| `game.skill.learn` | `/学习` |
| `game.pvp.challenge` | `/挑战` |
| `game.sect.manage` | `/宗门` |
| `game.friend.manage` | `/好友` |
| `game.redeem.code` | `/兑换`（REST 路由权限） |
| `admin.status` | 管理指令（`/服务器状态`、`/发放`、`/能量管理` 等） |
| `admin.economy` | `/经济` |
| `admin.fix.equipment` | `/修复装备` |
| `admin.debug` | `/debug` |
| `admin.database.clear_players` / `admin.database.reset_all` | `/cleardb_players`、`/cleardb_all` |

- **仅私聊（privateOnly）**：`/解绑`、`/改密`、`/注销`、`/发放`（管理版）与清库类指令声明 `privateOnly=true`，群聊中触发会被渠道拦截（QQ 官方回复「请私聊机器人使用此指令，保护您的账户安全。」）。
- **限流**：每发送者每 60 秒限 10 条指令（QQ 官方 key `qq:<openid>`；OneBot 服务端模式同样 10 次/60 秒/QQ 号），超限回复「操作太频繁，请稍后再试」。
- **账号多步向导**：`/注册`（角色名→密码→可选邮箱验证）、`/绑定`、`/改密`、`/注销` 走 `OneBotAccountFlow` / `OneBotAccountFlowClient` 挂起态会话，下一步内容在向导内逐步引导；`/cancel` 是保留取消词。`/注册` 群聊可用但密码在私聊步骤输入（敏感信息不进群）；QQ 官方渠道注册**跳过邮箱验证码**（以 openid 身份进入，见源码 `QqOfficialAdapter`）。

## OneBot 与 QQ 官方差异

| 维度 | OneBot 服务端模式（`qq_bindings`） | QQ 官方机器人（`qq_official_bindings`） |
|------|-----------------------------------|------------------------------------------|
| 身份键 | 真实 QQ 号 | openid（平台唯一、与 QQ 号无关） |
| 绑定表 | `qq_bindings`（`QqBindingService`） | `qq_official_bindings`（`QqOfficialBindingService`，openid↔user_id） |
| 触发 | 群聊 / 私聊直接发 `/指令` | 群聊必须 **@机器人**（`GROUP_AT_MESSAGE_CREATE`），`remove_at=true` 时自动剥离 `<@!…>` 占位符；C2C 单聊直接触发 |
| 前缀 | `/` | 默认 `/`，另兼容 `.`、`！`、`!`；可配 `command_prefix`（如 `xiuxian`，此时消息须以该前缀开头） |
| 绑定解析 | `CommandContext.resolveBoundUserId()` 平台感知：OneBot 查 `qq_bindings` → 回退 `mc_bindings` | 传入平台查找器查 `qq_official_bindings` → 回退 MC 绑定 |
| 按钮 | 不支持 | 支持消息交互按钮（见下） |
| 群消息拦截 | 群聊中触发 `privateOnly` 指令被渠道拦截 | 拦截回复「请私聊机器人使用此指令，保护您的账户安全。」 |
| 限流 | 10 次 / 60 秒 / QQ 号 | 10 次 / 60 秒 / openid（`qq:` key） |
| 消息统计 | 记录 QQ 号 | 记录 openid（非真实 QQ 号） |

### 按钮消息（仅 QQ 官方）

`/按钮`（`QqButtonCommand`，分类「实用功能」，权限 `game.player.info`）只在 **QQ 官方适配器运行中** 才于 `/帮助` 出现（`AdapterManager.getFirstQqOfficialAdapter() != null` 才 `shouldShowInHelp`）；非 QQ 官方渠道调用回复「消息交互按钮仅支持 QQ 官方机器人」。

- `/按钮` —— 发送演示按钮组：✅签到、📊状态、🌤每日、🏯宗门 信息（两行各两个，样式 3/1/4/2）。
- `/按钮 <指令串>` —— 发送单个「点击执行 /指令」按钮。
- 按钮 `data`（`button_data`）即游戏指令：点击后服务端收 `INTERACTION_CREATE`（需在适配器 `intents` 中加入 `INTERACTION`，bit `1<<26`，须先在 QQ 开放平台申请开通；未授权会被网关以 **4014 disallowed intents** 拒绝并无限重连），适配器补全 `/` 前缀后走正常指令管线执行并回复，同时回传 `POST /interactions/{interaction_id}` 让按钮结束“转圈”。
- 按钮对象 `QqButton`：`id`、`label`、`style`（0 灰/1 蓝/2 红/3 绿/4 橙）、`data`、`enter`（点击是否顺发一条文本）、`url`（跳转链接按钮）；构造器见 [适配器与外部接入](./adapters#消息交互按钮)。

## 常用指令示例（按分类节选）

下表仅为**分类示例**：指令与分类、权限均来自源码声明；别名与子命令从每类挑一两个展示。完整、动态的最新清单始终以 **`/帮助`** 输出为准（管理员另可用 `/debug` 枚举全部指令，其 REST 路由为 `admin/debug/list`）。

| 分类 | 主指令（别名） | 用途与子命令示例 |
|------|----------------|------------------|
| 账号 | `/注册 register` | 注册角色并绑定（免登录、可群聊发起） |
| 账号 | `/绑定 bind` | 绑定已有账号（免登录、仅私聊） |
| 账号 | `/解绑 unbind`、`/改密 changepassword changepwd`、`/注销 deleteaccount` | 解绑 / 改密 / 注销（仅私聊，`game.player.info`） |
| 我的角色 | `/状态 信息 status info` | 查看角色状态，自动结算离线收益（`game.player.info`） |
| 我的角色 | `/疗伤 heal`、`/灵根 spiritualroot talent`、`/称号 title chenghao` | 疗伤、灵根查看与重铸、称号列表/装备/卸下 |
| 修炼 | `/打坐 闭关 meditate cultivate`、`/停止 stop`、`/突破 breakthrough`、`/转世 reincarnate` | 打坐/停止结算/突破渡劫/转世（模块 `cultivation`） |
| 修炼 | `/晨修 morning`、`/天象 daily` | 每日晨修与今日天象/机缘（模块 `cultivation`） |
| 战斗 | `/挑战 pvp` | 切磋：`接受`/`拒绝`（模块 `pvp`，`game.pvp.challenge`） |
| 战斗 | `/决斗 切磋 fight 战斗 讨伐 boss` | 多功能战斗入口（pvp 子包 `PvpCommand`，模块 `pvp`） |
| 战斗 | `/学习 learn`、`/技能 skills`、`/战斗策略 战术 tactic` | 技能学习 / 列表 / 战斗策略（模块 `skill`） |
| 背包 | `/背包 backpack`、`/使用 itemuse`、`/装备 equip`、`/卸下 unequip`、`/已装备 equipped`、`/强化 enhance` | 背包与装备操作（模块 `inventory`） |
| 背包 | `/物品列表 itemmap` | 物品中文名 ↔ key 映射表 |
| 探索 | `/游历 explore`、`/秘境 secret`、`/进入秘境 secret_enter`、`/地图 map` | 游历（冷却 60 秒）、秘境列表与进入、地图移动 |
| 坊市 | `/坊市 market`、`/上架 list`、`/购买 buy`、`/撤单 cancellisting`、`/我的挂单 mylistings` | 坊市挂单买卖（模块 `trade`，权限 `game.player.info`） |
| 宗门 | `/宗门 sect` | 宗门全套子命令：`create 创建`、`join 加入`、`info 信息`、`approve 通过`、`donate 捐献`、`warehouse 仓库`、`war 宣战`、`transfer 转让` 等（模块 `sect`，`game.sect.manage`） |
| 经济 | `/签到 signin`、`/灵庄 bank`、`/拍卖 auction`、`/回收 recycle`、`/修炼加速 boost`、`/灵石兑换 石兑`、`/提纯 purify` | 每日签到、灵石存取、竞拍、回收、加速修炼、灵石流转（模块 `economy`） |
| 经济 | `/转化 exchange convert` | 物品 ↔ 能量互转（模块 `energy`） |
| 社交 | `/好友 friend` | `add 添加`、`accept 接受`、`remove 删除`、`list 列表`、`pending 待处理`（模块 `friend`，`game.friend.manage`） |
| 社交 | `/查人 查找 search`、`/私聊 msg`、`/排行 排行榜 rank` | 玩家搜索 / 私聊 / 排行榜（模块 `search` / `chat` / `rank`） |
| 实用功能 | `/按钮 button 互动按钮` | QQ 官方按钮演示与单指令按钮（仅 QQ 官方渠道，见上） |
| 实用功能 | `/兑换 redeem`、`/增益 buff` | 兑换码兑换、查看增益（`/增益` 属模块 `buff`） |
| 管理 | `/服务器状态 serverstatus`、`/日志 logs`、`/玩家列表 players`、`/玩家详情 playerinfo`、`/编辑玩家 editplayer`、`/发放 give`、`/经济 economy`、`/debug 调试`、`/修复装备 fixequip`、`/cleardb_players`、`/cleardb_all`、`/重启 restart`、`/关闭服务端 shutdown` | 管理员指令（多数仅私聊，需 `admin.*` 权限码，详见 [权限体系](./permissions) 与 [REST API](./rest-api)） |

> 覆盖提示：上表与 `/帮助` 的完整清单并非逐条全量罗列——服务端鼓励「分类举例 + 帮助发现」，任何时刻以 `/帮助` 输出为准；各指令背后调用的玩法服务见 [内部服务 API](./internal-api)。

## 相关文档

- 指令背后的玩法服务与事件 → [内部 API 一览](./internal-api)
- 权限码定义与角色分配 → [权限体系](./permissions)
- OneBot / QQ 官方 / Minecraft 三种接入与实例配置 → [适配器与外部接入](./adapters)
- 指令即路由 / REST 双注册实现 → [架构总览](./architecture)
- 渠道与实例配置键 → [配置说明](./config)
