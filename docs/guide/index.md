# 项目总览

## 这是什么

**修仙世界（Xiuxian World）** 是一个用 Java 编写的**多人在线文字修仙（MUD）游戏服务端**。
它自带 HTTP 与 WebSocket 服务（Jersey + Grizzly），**不需要额外的 Web 容器**，
`java -jar` 一条命令就能跑起来，玩家通过 QQ 机器人、Minecraft 通道、REST API 或 WebSocket
任意一端进入同一个游戏世界。

| 项目 | 值 |
| --- | --- |
| 版本 | `0.1.0`（对外展示为 `v0.1.0`）。唯一来源是 `pom.xml` 的 `<version>`：构建时经资源过滤写入 `build-info.properties`，运行期由 `com.mtxgdn.util.BuildInfo` 读取；JAR 清单的 `Implementation-Version` 作为兜底 |
| 构建产物 | `target/main-0.1.0.jar`（shaded 可执行 jar，`Main-Class: com.mtxgdn.Main`） |
| 入口类 | `com.mtxgdn.Main` |
| 默认监听 | `127.0.0.1:8080`（HTTP / REST / WebSocket / 管理台）、`0.0.0.0:6700/onebot`（OneBot 通道）、`0.0.0.0:25565`（MOTD 预览，**监听所有网卡**） |
| 默认数据库 | SQLite，文件为**进程工作目录**下的 `xiuxian.db`（不是 jar 目录，详见下方「路径基准」） |
| 许可 | MIT |

::: tip 三条贯穿全局的设计约定
1. **指令即路由**：一个 `Command` 子类在构造函数里 `addRoute` / `registerSub`，
   就同时成为 QQ 指令与 REST 路由，不存在"某个端少一块功能"。
2. **内置插件化**：全部玩法以"内置插件"形式运行，开关集中在 `config/plugins.yml`，
   停用后其指令、接口、WebSocket 动作与后台定时任务一并失效。
3. **配置覆盖式合并**：jar 内置模板作为基底，外部 `config/application.yml` 逐键覆盖，
   所以升级后新增的配置键会自动继承默认值，不需要手工抄写。
:::

## 玩家从哪进来

| 入口 | 地址 / 形式 | 说明 |
| --- | --- | --- |
| OneBot QQ | `ws://<host>:6700/onebot` | 默认启用；Lagrange / LLOneBot 等实现作为客户端连上来 |
| QQ 官方机器人 | Webhook | 需在 `config/adapters.json` 里新增实例并配置 |
| Minecraft 内嵌服务器 | `127.0.0.1:25565`（MOTD 预览） | 另有内嵌服务端管理与玩家直连通道 |
| REST API | `http://<host>:8080/api/` | 玩家侧与游戏接口 |
| WebSocket | `ws://<host>:8080` | 实时推送（聊天、季节更替广播等） |
| Web 管理控制台 | `http://<host>:8080/admin/` | 概览 / 玩家 / 日志 / 插件 / 适配器 / 坊市 / OAuth2 等 |
| 安装向导 | `http://<host>:8080/install` | 仅未完成安装时挂载 |

## 特性一览（按玩法分类）

下面的分类对应 `config/plugins.yml` 里的**模块名**（即开关键）。
每个模块的开关语义与停用影响见[插件开关](/guide/plugins)，此处只讲它做什么。

### 修炼与成长

| 模块 | 内容 |
| --- | --- |
| `cultivation` | 打坐修炼、挂机与离线收益、境界突破、渡劫（含**连败增益**与**凝实**）、转世重修、天象、晨修 |
| `player` | 角色状态、疗伤、灵根展示与刷新 |
| `skill` | 技能学习、技能列表、熟练度、战斗策略设置 |
| `technique` | 功法学习、装备、升级（同时运转 3 门） |
| `buff` | 增益 / 减益状态管理，带到期时间 |
| `title` | 称号注册表、称号装备与品质分级、成就计数（秘境次数 / PVP 胜场 / 炼丹次数） |

境界数据来自 `src/main/resources/game/realm_config.json`：**11 个大境界**
（凡人 / 炼气期 / 筑基期 / 金丹期 / 元婴期 / 化神期 / 合体期 / 大乘期 / 渡劫期 / 真仙 / 金仙），
细分为 **29 个修炼阶段**（大境界内再分初 / 中 / 后期），每个阶段单独配置
`requiredExp`、`requiredSpiritStones` 与六项属性加成。

灵根定义在 `com.mtxgdn.game.entity.SpiritualRoot`：**8 个品阶**
（鸿蒙 / 正 / 天 / 异 / 双 / 三 / 四 / 杂）共 **17 种灵根**，创建角色时随机抽取，
其特效会深入到攻击、暴击、回血、减伤、游历 CD、坊市手续费等各处。

### 探索与秘境

| 模块 | 内容 |
| --- | --- |
| `exploration` | 游历探索：加权随机事件（奇遇 / 商人 / 妖兽 / 宝藏 / 陷阱 / 灵泉…） |
| `secret_realm` | 秘境进入与探索，境界分级的区域与专属 Boss |
| `map` | 大地图浏览与移动旅行，移动耗时与地点灵气加成 |
| `cave` | 洞府灵力收集与升级 |
| `team` | 创建团队、组队进入副本型秘境 |
| `formation` | 阵法布置与阵法加成 |

### 战斗与养成

| 模块 | 内容 |
| --- | --- |
| `pvp` | 挑战 / 决斗，回合制战斗（技能、暴击、灵根特效全部生效） |
| `world_boss` | 世界 Boss：全服共享血量、按伤害比例分红、超发熔断、每人每只 Boss 独立冷却 |
| `inventory` | 背包与装备：穿戴、强化（含失败降级 / 碎裂）、格子容量成长 |
| `crafting` | 配方驱动的炼丹 / 炼器，产出丹药、装备、消耗品、种子 |

背包容量由 `inventory.base_capacity`（默认 30）与 `inventory.capacity_per_level`（默认 5）控制。

### 生产与经济

| 模块 | 内容 |
| --- | --- |
| `trade` | 坊市：玩家间挂单交易（灵石结算 + 手续费）、**挂单限时自动下架**、成交价格历史与 `/行情` 统计 |
| `economy` | 拍卖行、灵庄存款、灵石提纯、商店、签到、修炼加速、灵石流转 |
| `energy` | 物品 ↔ 能量互转（插件可注册自定义物品能量） |
| `farm` | 农田种植：地块、作物、浇水 / 施肥 / 病虫害防治 / 一键收获，受全局季节影响 |

坊市的三个参数位于 `market.*`：`listing_duration_hours`（默认 72）、
`price_history_keep_days`（默认 30）、`price_history_cleanup_interval_hours`（默认 6）。
它们是**本版本新增**的能力，升级注意事项见[生产部署与运维](/guide/deploy)。

### 社交与运营

| 模块 | 内容 |
| --- | --- |
| `sect` | 宗门创建 / 申请 / 任命 / 捐献 / 仓库 / 排行，5 级职位体系；**宗主退位、弃坑自动继位、竞争期争夺战** |
| `chat` | 世界频道与私聊，消息持久化并可通过 WebSocket 实时推送 |
| `friend` | 好友申请、好友列表、每日拜访 |
| `rank` | 境界榜 / 战力榜 / 财富榜 |
| `search` | 按名称搜索玩家 |

此外还有两个**实验性插件**（独立开关，默认值不同）：
`experimental_sect_war`（宗门战，默认 `false`）与
`experimental_energy_exchange`（能量转化 / 等价交换，默认 `true`）。
它们与稳定玩法分离，可以整体关闭而不影响主线体验。

全局季节与天象是跨模块的运营手段：`season.mode` 可选 `calendar`（按真实月份四季）
或 `cycle`（每 `cycle_hours` 小时更替），更替时会向全服 WebSocket 广播。

### 平台与接入能力

| 能力 | 说明 |
| --- | --- |
| 消息通道（4 个内置类型） | `onebot` / `qq` / `minecraft` / `minecraft-player`，实例配置在 `config/adapters.json`，支持运行时热启停 |
| REST + WebSocket | 全部玩法都有对应接口；WebSocket 用于实时推送 |
| Web 管理控制台 | 内置静态前端（`src/main/resources/webadmin/`），含概览、玩家、数据库、日志、用户角色、兑换码、称号、坊市管理、适配器、插件管理、OAuth2 等页签 |
| RBAC 权限 | 权限码 + 注解分层授权，管理台按角色权限展示功能 |
| OAuth2 | 独立令牌端点（`client_credentials`）与受保护资源示例 |
| 玩家数据文件化 | 一用户一 JSON（`data/players/<playerId>.json`），变更自动落盘，后台可一键导出 / 还原 |
| 第三方插件 | `plugins/*.jar` 扩展指令、物品、事件、秘境、权限、REST、Web UI、WebSocket |
| i18n | JSON 语言文件（当前 `zh_cn`），物品 / 秘境 / 事件 / 系统消息可整体翻译 |

## 技术栈

| 层次 | 选型 | 版本 |
| --- | --- | --- |
| 语言 / 构建 | Java + Maven（`maven.compiler.release=23`） | Java 23 |
| HTTP / REST | Jersey（`jersey-container-grizzly2-http`、`jersey-hk2`） | 4.0.2 |
| WebSocket | Grizzly WebSocket（`grizzly-websockets`、`grizzly-http-servlet`） | 4.0.2 |
| 数据库驱动 | `sqlite-jdbc` / `mysql-connector-j` | 3.49.1.0 / 9.7.0 |
| 连接池 | HikariCP（池名 `xiuxian-db`） | 5.0.1 |
| JSON | Gson | 2.14.0 |
| 配置解析 | SnakeYAML | 2.4 |
| 认证 | jjwt（JWT，HMAC-SHA256）+ jbcrypt | 0.11.5 / 0.4 |
| 邮件 | Angus Mail（Jakarta Mail 实现） | 2.0.3 |
| 测试 | JUnit 5 + Mockito | 5.10.1 / 5.8.0 |

打包由 `maven-shade-plugin` 完成，并用 `ServicesResourceTransformer` 合并
`META-INF/services`（Jersey / JDBC 驱动依赖它）。

## 系统要求

| 项目 | 要求 |
| --- | --- |
| Java | **Java 23 或更高**。用低版本启动会直接抛 `UnsupportedClassVersionError` |
| 内存 | 默认脚本给 `-Xms128m -Xmx512m`；低配机器可用 `start-low-memory.bat`（`-Xmx256m`） |
| 磁盘 | 数百 MB 起步（jar + 数据库 + 日志），随玩家数据与日志增长 |
| 端口 | `8080`（HTTP / WS / 管理台）、`6700`（OneBot）、`25565`（MOTD），均可改 |
| 数据库 | 默认 SQLite 零配置；要 MySQL 时需 MySQL 8+ 并预先建库 |
| Maven | 仅**构建**时需要（3.8+）；直接跑 jar 不需要 |

::: warning 内存与 `performance.low_memory`
`performance.low_memory`（默认 `false`）会被 `ServerConfigurator` 读取并影响
Grizzly 的线程与缓存策略。小内存机器除了调 JVM 堆，也建议把它设为 `true`。
:::

## 项目结构鸟瞰

```
xiuxian-server/
├── pom.xml                          # Maven 构建（shade 出可执行 jar）
├── install.bat / install.sh         # 一键安装启动脚本
├── start.sh / start-low-memory.bat  # 日常启动 / 低内存启动
├── build-mc-plugin.bat              # 单独编译 Bukkit 桥接插件
│
├── src/main/java/
│   ├── com/mtxgdn/
│   │   ├── Main.java                # 入口：装配、扫描注册、生命周期、停机钩子
│   │   ├── server/                  # HTTP 服务装配（静态资源 / 停机钩子 / 线程池）
│   │   ├── rest/                    # REST 层：Auth / Game / Admin / OAuth / Install + 过滤器
│   │   ├── websocket/               # GameWebSocketApp（实时推送与动作分发）
│   │   ├── service/                 # 用户 / 验证码 / OAuth 服务
│   │   ├── db/                      # DatabaseManager / Schema / Migration / 方言 / DAO
│   │   ├── entity/                  # Player / User
│   │   ├── common/                  # 统一响应、错误码、指令路由框架（扫描注册）
│   │   ├── permission/              # RBAC 权限码与注解
│   │   ├── game/                    # 玩法核心
│   │   │   ├── service/             # 玩法服务（修炼/境界/战斗/秘境/宗门/农场/坊市…）
│   │   │   ├── item/                # 物品框架（扫描注册 + 效果组件）
│   │   │   ├── explorationevent/    # 游历事件框架
│   │   │   ├── secretrealm/         # 秘境框架
│   │   │   ├── config/ · title/     # 境界配置加载 / 称号注册表
│   │   │   └── entity/              # 玩法实体（作物 / 地块 / 怪物 / 宗门…）
│   │   ├── plugin/                  # 插件系统（生命周期 / 事件总线 / Web UI / 开关）
│   │   │   └── builtin/             # 内置玩法模块与消息通道模块
│   │   ├── adapter/                 # 消息通道适配器框架（读 config/adapters.json）
│   │   ├── onebot/                  # OneBot 接入 + 指令体系（com.mtxgdn.onebot.command）
│   │   ├── qq/                      # QQ 官方机器人通道（webhook / 按钮）
│   │   ├── minecraft/               # MOTD 服务 + 内嵌服务器适配 + Bukkit 桥接
│   │   ├── playerdata/              # 玩家数据文件化（JSON 落盘 / 导出还原）
│   │   ├── client/                  # 外部客户端库（REST + WebSocket）
│   │   ├── demo/                    # 命令行演示客户端（--demo）
│   │   └── util/                    # JWT / 邮件 / 日志 / 翻译 / 限流 / 统计 / 配置
│   └── data/mtxgdn/                 # 游戏数据定义（启动时扫描注册）
│       ├── item/                    # 物品定义（继承 Item 即自动注册）
│       ├── secretrealm/             # 秘境定义
│       ├── explorationevent/        # 游历事件定义
│       └── lang/zh_cn.json          # 简体中文翻译
│
├── src/main/resources/
│   ├── application.yml              # 打包默认配置（运行时释放到 config/）
│   ├── plugins.yml                  # 内置插件开关（释放到 config/plugins.yml）
│   ├── game/realm_config.json       # 境界数据（11 大境界 / 29 阶段）
│   ├── webadmin/                    # Web 管理控制台前端
│   └── install/                     # 安装向导页面
│
└── 运行期生成（相对进程工作目录）
    ├── config/                      # application.yml / plugins.yml / adapters.json / blacklist.yml …
    ├── data/players/                # 玩家数据 JSON
    ├── log/                         # 每次启动一个新日志文件
    ├── plugins/                     # 第三方插件 jar
    └── xiuxian.db                   # SQLite 数据库（type=sqlite 时）
```

::: danger 相对路径都相对"进程工作目录"
`xiuxian.db`、`config/`、`data/`、`log/`、`plugins/` 全部按相对路径解析。
启动时日志里的「部署路径」段落会打印 JAR 目录、工作目录与各路径；
若两者不一致会额外打一条 WARN。**请始终从 jar 所在目录启动。**
:::

## 文档导航

按"你是谁"选一条路径读，不必从头看到尾。

| 你的角色 | 建议阅读顺序 |
| --- | --- |
| **第一次开服**（想尽快跑起来） | [安装与首次启动](/guide/install) → [配置详解](/guide/config) → [常见问题](/guide/faq) |
| **已经开服，要上线生产** | [生产部署与运维](/guide/deploy) → [配置详解](/guide/config) → [配置项全表](/reference/config-keys) |
| **运维 / 值班**（升级、排障、备份） | [生产部署与运维](/guide/deploy) → [常见问题](/guide/faq) |
| **服主运营**（想调玩法与开关） | [插件开关](/guide/plugins) → [配置项全表](/reference/config-keys) → [常见问题](/guide/faq) |
| **写客户端 / 机器人** | [开发者文档](/dev/) 起步，再按需看 REST API、WebSocket 协议、指令框架 |
| **改服务端源码 / 写插件** | [开发者文档](/dev/) 的代码组织与设计约定，再读插件开发部分 |
| **只想查某个具体值** | [配置项全表](/reference/config-keys) |

### 本页与相邻页的分工

| 想了解 | 去哪 |
| --- | --- |
| 怎么装、怎么首次启动、安装向导怎么用 | [安装与首次启动](/guide/install) |
| 每个配置项的含义、加载与合并规则 | [配置详解](/guide/config) |
| 25 个内置模块与 4 个通道的**开关清单**与停用影响 | [插件开关](/guide/plugins) |
| 生产环境怎么部署、升级、备份、排障、定时任务 | [生产部署与运维](/guide/deploy) |
| "为什么不生效""数据在哪"这类具体疑问 | [常见问题](/guide/faq) |
| 全部配置键与默认值的逐项表格 | [配置项全表](/reference/config-keys) |

::: tip 文档与代码的一致性
本套文档以仓库源码为唯一依据撰写：数值取自 `src/main/resources/application.yml`、
`plugins.yml`、`realm_config.json` 与对应 Java 类，行为描述取自实际实现。
若文档与代码不一致，**以代码为准**。
:::
