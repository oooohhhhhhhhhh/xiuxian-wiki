# 架构总览

本文面向开发者，按 **V1.4.1-beta2**（`pom.xml`，Java 23）代码逐项说明「修仙世界」服务端的进程形态、启动装配、分层与包结构、核心机制、鉴权、消息通道与数据流、数据持久化。全文以 `src/main/java` 实际代码为准。

## 一句话定位

一个 **Java 23 单进程 MUD 游戏服务端**：玩法逻辑与指令全部集中在同进程内，通过 **扫描注册 + 服务注册表 + 内置插件模块** 组织，对外提供 REST / WebSocket / OneBot（QQ 机器人）/ QQ 官方机器人 / Minecraft 等多种接入。构建产物为一个自包含 fat-jar（Maven shade，主类 `com.mtxgdn.Main`），无外部容器依赖，可运行在 Windows / Linux / macOS。

## 技术栈

| 组件 | 技术（版本见 pom.xml） |
|------|------------------------|
| 语言 / 构建 | Java 23 / Maven（shade 打包 fat-jar，finalName `main-V1.4.1-beta2`） |
| HTTP / REST | Jersey 4.0.2 + Grizzly HTTP 4.0.2（JAX-RS，`com.mtxgdn.rest`） |
| WebSocket | Grizzly WebSocket（游戏端 `GameWebSocketApp`、OneBot 端 `OneBotWebSocketServer`） |
| 数据库 | SQLite（`sqlite-jdbc` 3.49.1）/ MySQL（`mysql-connector-j` 9.7.0），HikariCP 5.0.1 连接池，方言自动适配 |
| 认证 | JWT（jjwt 0.11.5，HS256）+ BCrypt（jbcrypt 0.4） |
| JSON / 配置 | Gson 2.14 / SnakeYAML 2.4 |
| 邮件 | Jakarta Mail（Angus Mail 2.0.3，注册验证码） |
| 测试 | JUnit 5 + Mockito（scope=test） |

## 进程形态与监听端口

整个服务端是一个 JVM 进程，内含多个监听器（具体数值可在运行配置中修改，默认值见 `application.yml`）：

| 监听 / 能力 | 默认地址 | 说明 | 主要配置键（`config/application.yml` 层级） |
|-------------|----------|------|--------------------------------------------|
| REST API + 管理后台 + 安装向导 | `http://127.0.0.1:8080/api/` | Jersey 应用（`ResourceConfig.packages("com.mtxgdn.rest")`），静态页 `/admin`、`/install` 挂载在同一 Grizzly 服务器上 | `server.host`（默认 127.0.0.1）、`server.port`（默认 8080） |
| 游戏 WebSocket | `ws://127.0.0.1:8080`（根路径） | `GameWebSocketApp`，客户端连接后先发 `auth` 帧携带 JWT | 同 `server.port` |
| OneBot QQ 机器人（服务端模式） | `ws://0.0.0.0:6700/onebot` | 每个 OneBot 适配器实例独占一个监听器，QQ 机器人实现（Lagrange / LLOneBot 等）作为客户端接入 | `config/adapters.json`（实例级 `port`，默认 6700、`mode: ws_server`） |
| Minecraft MOTD 预览 | `0.0.0.0:25565` | 解析 MC 服务器列表 ping，展示 MOTD/在线人数；可选 TCP 隧道跳转到真实服务器 | `motd.port`（默认 25565）及其余 `motd.*` |
| QQ 官方 Webhook（可选） | 80 / 443 / 8080 / 8443 | 仅 `mode: webhook` 时启用，带 HMAC-SHA256 验签 | `config/adapters.json` 中 qq 实例的 `webhook_*` |
| 本地 MySQL（可选） | 3306 | `database.type: mysql` 且 URL 指向本机时，若 MySQL 未运行由 `MySqlLauncher` 尝试拉起 | `database.url` 等 |

> `server.host` 默认 `127.0.0.1`（仅本机）。**OneBot 通道与 MOTD 始终监听 `0.0.0.0`**（分别由 `AdapterManager` 与 `MinecraftMotdServer` 硬编码绑定），公网部署时注意防火墙。QQ 官方 WebSocket 网关模式为**出站**连接（`wss://api.sgroup.qq.com/websocket` 或沙箱域名），无需开放入站端口。

## 启动装配与生命周期

启动入口 `Main.main()`（`com.mtxgdn.Main`），其装配顺序（`doMain`）与代码一致：

1. 处理特殊参数并返回：`--plugin-make-gui`、`--plugin-make`。
2. 注册 JVM 关闭钩子（见下文）。
3. **JWT 密钥初始化**：`JwtUtil.init(installMode)`。`installMode = !InstallResource.isInstalled()`（是否已写 `jwt.secret`）。密钥来自 `jwt.secret`（要求 ≥ 32 字节），未配置且非安装模式时**拒绝启动**。
4. **数据库初始化** `DatabaseManager.init`：按 `database.type` 选 SQLite/MySQL；HikariCP 建池；`initTable()` 建表 + `DatabaseMigration` 迁移 + `PermissionService.initDefaultData()` 写默认角色权限（详见[数据持久化](#数据持久化)）。
5. **写默认玩法数据**：默认技能、功法、配方（`SkillService` / `TechniqueService` / `CraftingService`）。
6. **内容扫描注册**（顺序固定）：`ItemScanner.scanAndRegister()`（物品）→ `EquipmentFixService.fixEquipmentData()`（装备一致性修复）→ `SecretRealmScanner`（秘境）→ `ExplorationEventScanner`（游历事件）→ `CommandScanner.scanAndRegister("com.mtxgdn.onebot.command")`（指令）。
7. **插件系统**：`PluginManager.init(new File("plugins"))` 加载 `plugins/*.jar`；随后 `BuiltInPluginRegistry` 注册 24 个内置玩法模块与 4 个消息通道模块（`registerBuiltInPlugins`）并 `enableAll`。
8. **HTTP 装配**：`GrizzlyHttpServerFactory.createHttpServer("http://" + serverHost + ":" + serverPort + "/api/")`；`PluginWebManager.init` 挂载插件 REST 路由；可选插件热重载（`plugins.hot_swap`）；`ServerConfigurator.configure` 调整 Grizzly 线程池 / 超时 / WebSocket 扩展（`performance.*`、`network.*`、`performance.low_memory`）；注册 `GameWebSocketApp` 到根路径。
9. **全局季节**：`SeasonService` 设定更替监听器，季节变更时向全部在线玩家广播 `season_change`。
10. **部署路径报告与配置释放**：`reportDeploymentPaths()` 打印 JAR 目录 / 工作目录 / 各数据路径；`releaseConfigs()` 触发 `experimental.yml`、`game/realm_config.json`、`config/newbie_reward.json` 的按需释放/生成。
11. **启动消息通道**：`AdapterManager.startAll()` 读取 `config/adapters.json`，逐个启动启用的适配器实例（类型级开关见 `built_in_plugins` 下的 `onebot/qq/minecraft/minecraft-player`）。
12. **挂载静态页**：`/admin`（Web 管理控制台，资源前缀 `webadmin`）；若 `!isInstalled()` 额外挂载 `/install`（安装向导）。
13. **周期清理**：每 5 分钟清理限流窗口与 JWT 黑名单（`RateLimiter` / `TokenBlacklist`）。
14. 触发插件事件 `SERVER_READY`；随后启动 `MinecraftMotdServer`（`motd.port`，默认 25565）。
15. 按启动参数进入三种运行态：交互模式（按 Enter 关闭）、`--nogui`（阻塞常驻，Ctrl+C 停止）、`--demo`（等 HTTP 就绪后运行交互式演示客户端并退出）。

### 优雅关闭

`ServerShutdownHook` 向 JVM 注册 `shutdown-hook` 线程，`createDefault()` 与 `Main` 叠加的关闭任务**按注册顺序（FIFO）**依次执行：

1. 停用第三方插件并停止文件监视器（`PluginManager.disablePlugins` / `stopFileWatcher`）；
2. 关闭各玩法调度器：`PlayerService`（自动疗伤）、`FormationService`（阵法到期）、`FarmService`、`CaveService`、`BuffService`；
3. 停掉全部消息通道适配器（`AdapterManager.stopAll`）；
4. `GameWebSocketApp.shutdownGracefully()`（在线玩家离线结算）；
5. 停止 MOTD 服务；
6. `PlayerDataService.shutdown()` 落盘所有脏玩家数据；
7. 内置玩法模块逐个停用（`BuiltInPluginRegistry.disableAll`）；
8. 关闭数据库连接池（`DatabaseManager.shutdown`）。

## 分层与包结构

代码位于 `src/main/java`，全部包名（不含已删除内容）与职责如下：

```
src/main/java/
├── com/mtxgdn/                    # 服务端主程序（主类 Main.java）
│   ├── server/                    # Grizzly 服务器装配：ServerConfigurator（线程池/WS 扩展）、
│   │                              #   AdminStaticFileHandler（classpath 静态资源）、ServerShutdownHook
│   ├── rest/                      # JAX-RS 层：资源类 + 过滤器（鉴权分层见下）
│   │   ├── Auth.java              #   玩家账号（register/login/…）
│   │   ├── OAuthResource.java     #   独立 OAuth2 端点（token/introspect/me/protected/*/authorize）
│   │   ├── AdminResource.java     #   管理后台（/admin/*，含数据库浏览、角色权限、插件、适配器、公告…）
│   │   ├── GameResource.java      #   游戏显式端点（/game/*）
│   │   ├── UnifiedRestResource.java #  指令即路由的动态分发器（收集 Command 注册的 REST 路由）
│   │   ├── McCommandResource.java #   Minecraft /xiuxian 桥接入口（/mc-command）
│   │   ├── InstallResource.java   #   安装向导 API（/install/status|configure|reset|restart）
│   │   └── *Filter.java           #   JwtAuth / AdminAuth / Permission / ModuleGate / EntityBuffer
│   ├── websocket/                 # GameWebSocketApp：游戏实时通道（认证、动作分发、广播、插件 WS 转发）
│   ├── common/                    # 通用层
│   │   ├── command/               #   指令框架：Command（基类+路由容器）、CommandRegistry、CommandScanner、
│   │   │                          #     RouteDefinition、CommandContext、CommandUtils
│   │   └── service/               #   ServiceRegistry（26 个懒加载单例服务 getter）
│   │   （另有 ApiResponse / GameErrorCode / GameMessage / ExperimentalConfig）
│   ├── service/                   # 账号域服务：UserService、VerificationCodeService、OAuthService
│   ├── entity/                    # User / Player（账号与角色数据模型）
│   ├── db/                        # DatabaseManager、DatabaseSchema、DatabaseMigration、DatabaseDialect、
│   │                              #   MySQLDialect、SQLiteDialect、PlayerActionLogDAO
│   ├── permission/                # RBAC：PermissionCode（权限码枚举）、PermissionService、RequirePermission（注解）
│   ├── game/                      # 玩法核心
│   │   ├── service/               #   玩法服务（PlayerService、RealmService、CombatService、SectService、FarmService 等 30 个）
│   │   ├── item/                  #   物品框架：Item、ItemRegistry、ItemScanner
│   │   ├── secretrealm/           #   秘境框架：SecretRealm、SecretRealmScanner
│   │   ├── explorationevent/      #   游历事件框架：ExplorationEvent、ExplorationEventScanner
│   │   ├── config/                #   游戏配置加载（GameConfigLoader：境界 realm_config.json、新人奖励）
│   │   ├── title/                 #   称号注册表
│   │   └── entity/                #   玩法实体（PlayerInfo、Sect、怪物、作物等）
│   ├── onebot/                    # OneBot QQ 接入（服务端实现）
│   │   ├── OneBotWebSocketServer.java  #   WS 服务端（/onebot）：消息/事件/账号流程/禁言续期
│   │   ├── OneBotScreenshotBot.java    #   截图发送模式（实验性，需桌面会话）
│   │   ├── OneBotSession / OneBotMessageSender / OneBotAccountFlow (+Client 变体)  # 传输解耦接口
│   │   ├── QqBinding / QqBindingService / QqOfficialBindingService   # QQ 号 / QQ官方 openid 绑定
│   │   ├── Blacklist / BlacklistService / OneBotGroupConfigService  # 黑名单与群组自动禁言
│   │   └── command/               #   OneBot 分模块指令体系（account/admin/combat/crafting/cultivation/…，
│   │                              #   共 79 个 public Command 子类，启动时被 CommandScanner 扫描注册）
│   ├── qq/                        # QQ 官方机器人通道：QqOfficialAdapter（WebSocket 网关 / Webhook 双模式、
│   │                              #   群@与 C2C 消息、按钮交互）、QqWebhookServer（验签）、QqButton
│   ├── minecraft/                 # Minecraft 接入
│   │   ├── MinecraftMotdServer.java #   MOTD 预览（TCP 25565，含 TCP 隧道重定向）
│   │   ├── VarInt.java              #   协议工具
│   │   └── adapter/                 #   内嵌服务器进程模式 MinecraftAdapter + MinecraftServerProcess、
│   │                                #     玩家直连模式 MinecraftPlayerAdapter + MinecraftClient、
│   │                                #     绑定/鉴权/消息抽象（MinecraftPlayerBindingService、McProtocolMapper 等）
│   │   └── agent/XiuxianAgent.java  #   Java Agent：向 MC 注入 /xiuxian 原生命令（转发到主服 /api/mc-command）
│   │   └── plugin/XiuxianBridgePlugin.java # Bukkit 桥接插件（单独编译，不进主 jar；build-mc-plugin.bat）
│   ├── adapter/                   # 消息通道适配器框架：AdapterManager（生命周期/热重载）、
│   │                              #   AdapterConfigManager（config/adapters.json）、AdapterConfig、AdapterFactory
│   ├── plugin/                    # 插件系统：Plugin/PluginManager/PluginClassLoader/PluginContext/PluginWebManager、
│   │                              #   事件总线（plugin/event）、Web UI 注册（plugin/gui）、内置模块（plugin/builtin）
│   ├── playerdata/                # 玩家数据文件化：PlayerDataService / PlayerData（data/players/*.json）
│   ├── client/                    # 外部客户端 SDK：ApiClient / GameApi / AuthApi / GameWebSocketClient（供 demo 与第三方）
│   ├── demo/                      # 命令行交互式演示客户端（--demo）
│   └── util/                      # AppConfig / JwtUtil / GameLogger / MySqlLauncher / EmailService /
│                                  #   RateLimiter / TokenBlacklist / StatsCollector / TextSanitizer / OneBotLogger …
└── data/mtxgdn/                   # 游戏数据定义（启动时被扫描注册，见「扫描注册」）
    ├── item/                      # 115 种物品（继承 Item 即自动注册）
    ├── secretrealm/               # 10 个秘境区域
    ├── explorationevent/          # 13 种游历事件
    └── lang/                      # 语言文件（zh_cn.json，i18n）
```

> 打包资源 `src/main/resources`：`application.yml`（运行时释放到外部 `config/`）、`built_in_plugins.yml`（注释模板，运行时启停实际读 `application.yml` 的 `built_in_plugins` 段）、`experimental.yml`、`plugin.yml`（MC 桥接插件清单）、`game/realm_config.json`、`config/blacklist.yml`、`config/onebot_group_config.yml`、`webadmin/`（管理台前端）、`install/`（安装向导页）、`plugin-template/`。

## 核心机制

### 扫描注册

启动时按类扫描自动注册四类可扩展内容（`ItemScanner` / `SecretRealmScanner` / `ExplorationEventScanner` / `CommandScanner`，同实现方式：遍历目录或 jar 内 class 文件 → 反射实例化 → 自注册）：

| 扫描器 | 扫描包 | 注册内容 | 扩展方式 |
|--------|--------|----------|----------|
| `ItemScanner` | `data.mtxgdn.item` | `Item` 子类进 `ItemRegistry`（115 种物品） | 在数据包新增 `extends Item` 的类 |
| `SecretRealmScanner` | `data.mtxgdn.secretrealm` | 秘境区域（10 个） | 新增 `extends SecretRealm` 的类 |
| `ExplorationEventScanner` | `data.mtxgdn.explorationevent` | 游历事件（13 种） | 新增 `extends ExplorationEvent` 的类 |
| `CommandScanner` | `com.mtxgdn.onebot.command` | 公开、非抽象、带无参构造的 `Command` 子类（含子包） | 在指令包新增 `extends Command` 的类 |

### 指令即路由

一套指令定义同时产出「QQ/OneBot 子命令」与「REST 路由」，是本服务端最核心的复用机制：

- **`Command` 抽象基类**（`common/command/Command.java`）：构造时按 `names` 别名**自注册**进 `CommandRegistry`（小写键）。声明元数据：分类、权限码、私聊限定（`privateOnly`）、是否需登录、所属内置模块（`setModule`，模块停用时 `isModuleEnabled()` 返回 false）。
- **`RouteDefinition`** 统一路由项，三种注册模式：`onebotOnly(子命令, 处理器)`（仅指令）、`get/post(path[, permission], 处理器)`（仅 HTTP，支持 `{param}` 路径参数）、以及两者都调的双端注册。`Command.addRoute()` 统一收口：OneBot 侧存入 `subIndex` 快速索引，HTTP 侧通过 `getRestEndpoints()` 暴露。
- **OneBot 子命令分发**：`Command.execute()` 默认实现 = 绑定检查 → 权限码检查 → 取角色 → 参数分词 → 查 `subIndex` → 命中子命令处理器 / 否则 `onDefault` / `onUnknown`。
- **REST 动态分发**：`UnifiedRestResource`（`@Path("/game")` + `@Path("{path:.*}")` 通配 GET/POST）在首个请求时懒加载 `CommandRegistry` 全部指令的 HTTP 路由，按「路径字面量段数降序」排序以优先匹配 `/sect/info/{id}` 这类精确路由；Jersey 会优先匹配 `GameResource` 的显式方法，未命中才落回统一分发器。分发时做权限检查（指令级 `permission`，通过 `PermissionService`）与登录/管理令牌上下文解析（`admin/` 前缀路径允许 admin JWT，用哨兵 `userId=0`），最后调用 `RouteDefinition.RestContext` 处理器并返回 JSON。
- **双端门控一致**：`CommandRegistry.get(name)` 对已停用内置模块的指令返回 null（所有入口统一失效），`getRaw` 供给出「该玩法已停用」提示。

### 服务注册表

`common/service/ServiceRegistry.java` 为指令层/插件层提供 **26 个双检锁懒加载单例 getter**：`getPlayerService`、`getRealmService`、`getItemService`、`getSecretRealmService`、`getExplorationService`、`getGuideService`（新手引导）、`getSkillService`、`getCombatService`、`getDailyService`、`getTradeService`、`getHeartDemonService`（心魔）、`getChatService`、`getFriendService`、`getEnhanceService`（强化）、`getCraftingService`、`getTechniqueService`、`getSectService`、`getEconomyService`、`getEnergyService`、`getTitleService`、`getCaveService`、`getFormationService`、`getBuffService`、`getFarmService`、`getMcBindingService`（MC 绑定）、`getMapService`。

### 定时调度

服务内多处以守护线程 + `scheduleAtFixedRate` 实现周期逻辑，停机钩子统一回收：

| 调度 | 间隔 | 逻辑 |
|------|------|------|
| `BuffService` | 1s / 30s | 过期 Buff 结算、内存 Buff 清理 |
| `FarmService` | 1s | 全农场地块状态推进（生长/枯萎/虫害） |
| `PlayerService` | 10s | 在线玩家自动疗伤 |
| `CaveService` | 10s | 洞府灵力自然增长 |
| `SeasonService` | 10s | 季节更替（calendar/cycle 模式） |
| `FormationService` | 60s | 阵法到期结算 |
| `PlayerDataService` | `player-data.auto-sync-seconds`（默认 30s） | 脏玩家数据落盘 |
| `OneBotWebSocketServer` | 周期 | 黑名单用户禁言续期 |
| `QqOfficialAdapter` | 周期 | access_token 过期前刷新、网关心跳 |
| `Main` 清理线程 | 5min | 限流窗口 / JWT 黑名单清理 |
| `PluginManager` | 可选 | `plugins.hot_swap=true` 时监视 `plugins/` 目录热加载 |

### 鉴权分层

`rest` 包过滤器与端点构成的分层：

| 区域 | 要求 | 过滤器 / 校验 | 令牌 |
|------|------|--------------|------|
| `/api/auth/*`、`/api/install/*`、`/api/test/*`、`/api/mc-command` | 匿名可访问 | `JwtAuthFilter` 放行 | — |
| `/api/game/*`（玩家侧 REST 与 WebSocket） | 需登录 | `JwtAuthFilter`：校验 `Authorization: Bearer <jwt>`，查 `TokenBlacklist`，注入 `userId` | 玩家 JWT（7 天，`jwt.secret` 签名） |
| `/api/admin/*` | 管理令牌 | `AdminAuthFilter`（`/admin/login` 放行）+ `PermissionFilter`（`@RequirePermission` 权限码；`super_admin` 短路）+ `ModuleGateFilter` | 管理 JWT（12 小时，`admin.jwt_secret` 或回退 `jwt.secret`；长度不足 32 时随机生成、重启失效） |
| `/api/admin/energy/*` | 双鉴权 | admin JWT 或玩家 JWT 任一通过即可 | 两者均可 |
| `/admin/me`、`/admin/whoami` | 玩家自我端点 | 允许玩家 JWT 以玩家身份放行（不授 admin 权限） | 玩家 JWT |
| OAuth2 受保护端点 | `client_credentials` | `OAuthService`（`oauth2.*` 配置） | OAuth2 access token（默认 3600s） |
| `/api/game/*` 内置模块门控 | — | `ModuleGateFilter`：`/game/<首段>` 映射内置模块，模块停用返回 403（`/game/player/data` 数据备份除外） | — |
| 全局 | POST/PUT 预读 | `EntityBufferFilter` 将请求体缓冲进内存（上限 64KB），保证后续过滤器可读 body | — |
| WebSocket | 登录 | `GameWebSocketApp` 首帧必须为 `auth`（携带 JWT），之后按动作做权限码与限流检查 | 玩家 JWT |

**玩家账号端点**（`Auth.java`，`@Path("/auth")`）：`POST /register`、`POST /send-code`、`POST /login`、`POST /logout`、`POST /change-password`、`POST /forgot-password/send-code`、`POST /forgot-password/reset`、`DELETE /account`。注册邮箱需验证码（`verify_code.enabled` 默认 true，`verify_code.allowed_domains` 白名单），由 `smtp.*` 发信。

**OAuth2 端点**（`OAuthResource.java`，`@Path("/auth/oauth")`）：`POST /token`、`POST /introspect`、`GET /me`、`GET /authorize`、`GET/POST /protected/*`（受保护示例资源）。仅作独立鉴权端点，与游戏业务不耦合。

**管理端点**（`AdminResource.java`，`@Path("/admin")`）：登录、服务器状态、日志、关闭、插件管理（list/reload/enable/disable/load、热插拔开关）、角色/权限组/用户（含权限码级授权）、数据库表浏览/清玩家数据/重置、玩家查询与道具发放、称号、兑换码、统计、黑名单、OneBot 群组配置、系统信息、公告、适配器热重载、玩家数据文件导出、OAuth 配置等。完整清单见 [REST API](./rest-api) 与 [权限体系](./permissions)。

### 内置玩法模块与插件

- **内置模块**：24 个玩法模块（探索/秘境/坊市/宗门/农场/洞府/聊天/好友/排行/搜索/地图/团队/称号/功法/炼丹/增益/阵法/能量/修炼/技能/战斗/背包/经济/角色）+ 4 个消息通道模块（`AdapterChannelPlugin`：onebot / qq / minecraft / minecraft-player），统一由 `BuiltInPluginRegistry` 管理，可在 `config/application.yml` 的 `built_in_plugins` 段或 WebUI「插件管理」页运行时启停（运行期选择会持久化写回该段，重启后保持）。
- **门控一致性**：指令（`CommandRegistry`）、HTTP（`ModuleGateFilter`）、WebSocket（动作映射）三层同时受模块启停约束。
- **第三方插件**：`plugins/*.jar` 经 `PluginClassLoader` 隔离加载，可扩展指令/物品/事件/权限码/REST 路由/Web UI/WebSocket 动作（`PluginWebManager`）；`PluginManager` 管理生命周期并可选热加载。详见 [插件开发](./plugin-development)。
- **i18n**：`LangManager` 按 `data/mtxgdn/lang` JSON 文件翻译物品/秘境/事件/系统消息。

## 消息通道（外部接入）

`adapter` 包把外部接入抽象为「适配器实例」，实例配置存于 **`config/adapters.json`**（首次启动自动生成默认配置），支持运行期热启停/热重载（WebUI「适配器」页或 `AdminResource` 的 `/admin/adapters*` 接口）。内置类型 `onebot / qq / minecraft / minecraft-player`（`AdapterManager` 内硬编码），第三方插件可通过 `AdapterFactory` 注册自定义类型。

### OneBot 通道（QQ 机器人，服务端实现）

服务器作为 **WebSocket 服务端**（`OneBotWebSocketServer`，每个实例独立监听器，默认 `ws://0.0.0.0:6700/onebot`），Lagrange / LLOneBot 等机器人实现以客户端身份接入并上报消息。链路：私聊/群聊消息 → 绑定用户离线收益结算 → 多步账号流程（注册/绑定/改密/注销，`OneBotAccountFlow`，挂起态由 `/cancel` 取消）→ 黑名单/群组自动禁言 → `/` 开头指令解析 → 限流 → 指令分发（见[数据流](#数据流示例)）。发送侧走 OneBot 动作 API（`OneBotMessageSender`，支持转发消息、`chat_record` 模式）；另有实验性 **screenshot** 模式（`OneBotScreenshotBot`，桌面自动化发消息，需图形会话）。详细见 [适配器与外部接入](./adapters)。

### QQ 官方机器人通道

`qq/QqOfficialAdapter` 基于 QQ 开放平台 API v2，复用 OneBot 侧的**会话抽象**（`OneBotSession` / `OneBotMessageSenderClient` / `OneBotAccountFlowClient`）与指令/账号流程业务，绑定走 `qq_official_bindings`（openid ↔ user_id，与 OneBot 的 `qq_bindings` 相互独立）。两种收信模式：WebSocket 网关（出站，默认）与 Webhook（`QqWebhookServer` 本地回调，端口必须为 80/443/8080/8443，HMAC-SHA256 验签）；支持群 @ 消息、C2C 单聊与按钮消息（`INTERACTION_CREATE`，按钮绑定的指令串补 `/` 前缀后进指令管线，QQ 侧见 `/按钮` 指令）。详见 [适配器与外部接入](./adapters) 与 [QQ 指令](./qq-commands)。

### Minecraft 通道

- **MOTD 预览**：`MinecraftMotdServer` 常驻监听 `motd.port`（25565），向 MC 客户端返回服务器列表 MOTD / 在线人数（在线数取自游戏 WebSocket 在线玩家数）；配置 `motd.redirect_server` 后，玩家点「加入服务器」会经 TCP 隧道透传到目标服务器。
- **内嵌服务器进程模式**（type `minecraft`）：`MinecraftAdapter` + `MinecraftServerProcess` 在 `minecraft.server_dir`（默认 `mc_server`）管理 MC 服务端 jar（`minecraft.jar_path`），解析控制台日志中的玩家聊天 / 加入 / 离开事件，将游戏内指令接入指令系统（`MinecraftCommandContext`）。
- **玩家直连模式**（type `minecraft-player`）：`MinecraftPlayerAdapter` 以机器人账号（离线模式）登录目标 MC 服务器，识别 `/tell` 私聊执行修仙指令（`MinecraftPlayerBindingService` 以 UUID 绑定）。
- **命令注入**：`XiuxianAgent`（javaagent，`premain` 反射注入 `/xiuxian`）与 `XiuxianBridgePlugin`（Bukkit 插件，maven 编译期被排除、由 `build-mc-plugin.bat` 单独编译进 `mc_server/plugins/XiuxianBridge.jar`）都把 `/xiuxian` 子命令转发到主服 REST `/api/mc-command`（`McCommandResource`），回包发给玩家。

## 数据流示例

### OneBot QQ 指令链

```
QQ 机器人上报消息（OneBot WS 连接，ws://…:6700/onebot）
 → OneBotWebSocketServer.onMessage → handleEvent → handleMessageEvent
 → （私聊/群聊）黑名单检查（群聊含自动禁言）→ 已绑定账号则先结算离线收益
 → 挂起中的账号流程会话？→ 进入多步向导（/cancel 取消）
 → 以 "/" 开头？→ 解析主命令/参数
 → 限流（10 次 / 60 秒 / QQ 号）
 → dispatchCommand：/cancel 拦截 → CommandRegistry.get(cmd)（模块停用则提示）
 → 指令级权限码校验 → 触发插件 COMMAND 事件
 → OneBotCommandContext → Command.execute(ctx)
 → （requireBinding 绑定 → checkPermission 权限码 → requirePlayer 取角色）
 → 参数分词 → subIndex 子命令路由 → ServiceRegistry 游戏服务 → 数据库/落盘
 → replyToSource / sendPrivateMsg / sendGroupMsg 回复
```

### REST 链

```
HTTP 请求 → Grizzly → Jersey（根路径 /api/）
 → 过滤器链（EntityBufferFilter 预读 body → AdminAuthFilter / ModuleGateFilter /
    PermissionFilter(@RequirePermission) / JwtAuthFilter，按路径各司其职）
 → 路由匹配：GameResource / AdminResource / Auth / OAuthResource / InstallResource
   显式端点优先；未命中落回 UnifiedRestResource 对 Command 路由的动态分发
 → RouteDefinition.RestContext（userId / playerId / 路径与查询参数 / body）
 → 游戏服务 → ApiResponse / JSON → 响应
```

### QQ 官方链

```
QQ 开放平台事件 →（WebSocket 网关或 Webhook 验签后）
 → QqOfficialAdapter（GROUP_AT_MESSAGE_CREATE / C2C_MESSAGE_CREATE / INTERACTION_CREATE）
 → OneBotClientCommandContext（openid 平台感知绑定查询）
 → 同一指令管线（CommandRegistry → Command.execute → 服务）
 → 官方 REST API 回复（被动回复窗口：群聊 5 分钟、单聊 60 分钟）
```

### Minecraft 链

```
玩家在 MC 中 /xiuxian <子命令>（XiuxianAgent 注入或 XiuxianBridgePlugin）
 → POST 主服 /api/mc-command → McCommandResource → CommandRegistry 指令管线
 → JSON 结果 → 插件/Agent 经聊天或原生命令回显
（内嵌服务器模式另路：控制台日志聊天行 → MinecraftAdapter → MinecraftCommandContext → 指令管线）
```

## 数据持久化

### 数据库

启动建表链路为：`DatabaseManager.initTable()` 顺序建 39 张基础表 → `DatabaseMigration.executeMigrations()` 补建 `player_buffs`、`farm_plots` 并做历史列迁移 → `PermissionService.initDefaultData()` 追加 `user_permissions` 用户直接授权表。**当前合计 42 张业务表**（SQLite/MySQL 同一套 DDL，方言类 `MySQLDialect`/`SQLiteDialect` 输出差异；已用全新库核对）：

| 域 | 表 |
|----|----|
| 账号 / 角色 / 绑定（7） | `users`、`verification_codes`、`players`、`qq_bindings`、`qq_official_bindings`、`mc_bindings`、`player_action_logs` |
| RBAC（5） | `roles`、`permissions`、`role_permissions`、`user_roles`、`user_permissions` |
| 成长 / 养成（8） | `skills`、`players_skills`、`techniques`、`players_techniques`、`player_daily`、`player_economy`、`player_energy`、`player_bank` |
| 物品 / 制造 / 市场（8） | `players_items`、`players_equipment`、`recipes`、`trade_listings`、`auction_listings`、`auction_bids`、`player_titles`、`player_buffs` |
| 社交 / 宗门 / 地图（9） | `chat_messages`、`friends`、`sects`、`sect_members`、`sect_applications`、`sect_warehouse`、`sect_wars`、`map_locations`、`map_connections` |
| 玩法（3） | `caves`、`formations`、`farm_plots` |
| 运营（2） | `redeem_codes`、`redeemed_codes` |

权限数据（5 个默认角色 SUPER_ADMIN=100 / ADMIN=80 / MODERATOR=50 / PLAYER=10 / GUEST=0 及权限码）在启动时以 `INSERT OR IGNORE` 幂等写入。完整设计见 [数据库设计](./database)。

### 玩家数据文件化

`playerdata/PlayerDataService`（默认启用，`player-data.enabled`）把每个玩家数据导出为 `data/players/<playerId>.json`（`player-data.dir`），覆盖 `players` 行及其 15 张个人关联表（背包/装备/技能/功法/每日/经济/灵庄/能量/称号/Buff/农田/洞府/阵法/坊市挂单/兑换记录），另含好友（双向）与宗门成员记录。变更由各服务调用 `markDirty` 标记，后台线程按 `player-data.auto-sync-seconds`（默认 30s，0 关闭）落盘，停机时 `shutdown()` 全量 flush；管理台支持一键导出 / 还原，玩家自助恢复默认关闭（`player-data.self-restore: false`，防刷）。

### 配置与日志文件

- **配置**：`config/application.yml` 主配置（合并打包默认值）；`config/adapters.json` 通道实例；`config/experimental.yml` 实验开关；`config/blacklist.yml`、`config/onebot_group_config.yml` 黑名单/群组配置（缺失时从 jar 复制默认）；`config/game/realm_config.json` 境界数据；`config/newbie_reward.json` 新人奖励。详见 [配置说明](./config) 与 [部署指南](./deployment)。
- **日志**：`GameLogger` 统一日志（级别受 `logging.level` 控制），控制台 + 文件双写；文件为 `log/server-<yyyyMMdd-HHmmss>.log`（`logging.dir` 默认 `log`），另维护内存环形缓冲供 Web 管理台「日志」页实时查看。

## 相关文档

- [部署指南](./deployment)
- [配置说明](./config)
- [REST API](./rest-api)
- [WebSocket 协议](./websocket)
- [数据库设计](./database)
- [权限体系](./permissions)
- [QQ 指令](./qq-commands)
- [适配器与外部接入](./adapters)
- [插件开发](./plugin-development)
- [内部 API 一览](./internal-api)
- [快速开始](../guide/quickstart)
