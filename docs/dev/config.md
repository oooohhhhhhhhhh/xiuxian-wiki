# 配置说明

本文按 **V1.4.1-beta2** 代码整理服务端全部配置：主配置 `application.yml` 的每个键（键名 / 默认值 / 作用）、实验开关、运行时按需释放/生成的配置文件、安装向导写入项、启动脚本与环境变量。所有键名与数值均取自 `src/main/resources/application.yml` 及代码读取处的回退默认值（`com.mtxgdn.util.AppConfig` / `Main` / `ServerConfigurator` 等），未经验证的旧文档键（如 `quiz.*`、`network.db_pool_max`）已不在当前配置中，本文不再列出。

## 配置模型与加载规则

主配置由 `util/AppConfig.java` 统一管理，规则如下：

| 项 | 说明 |
|----|------|
| 文件位置 | **JAR 所在目录**下的 `config/application.yml`（`AppConfig.getJarDir()` 解析 JAR 位置，与工作目录 CWD 无关） |
| 自动释放 | 外部 `config/application.yml` 不存在时，启动时从 jar 内置 classpath 复制一份默认模板 |
| 加载合并 | classpath 内置默认 + 外部文件**深度合并**（SnakeYAML 解析后按段递归合并），**外部覆盖内置** |
| 键形态 | YAML 树被拍平为点分键（`server.port`、`built_in_plugins.farm`）；**YAML 列表被拍平成逗号分隔字符串**（如 `verify_code.allowed_domains`） |
| 读取 API | `AppConfig.get / getInt / getBoolean(path, 默认值)`，键缺失时返回代码内回退默认值 |
| 写回 API | `AppConfig.update(Map)`：对目标键做**行级值替换**（保留注释/排版/缩进），缺失的键按父节追加，值为 `null` 表示删除该键行；写盘为临时文件 + 原子改名。WebUI「插件管理」运行时启停、安装向导、旧明文 `admin.password` 自动升级等均走此写回 |

> ⚠️ 修改配置后需**重启**生效（多数键在类静态块或启动时读取一次）。注意区分**文件落点基准**：`config/application.yml`、`config/experimental.yml`、`config/game/realm_config.json`、`config/newbie_reward.json` 落在 **JAR 目录**；而 `config/adapters.json`、`config/blacklist.yml`、`config/onebot_group_config.yml`、SQLite 库文件、`data/`、`log/`、`plugins/` 落在**当前工作目录**。详见 [部署指南](./deployment)。

## 配置文件总览

| 文件 | 落点 | 谁生成/释放 | 用途 |
|------|------|-------------|------|
| `application.yml` | JAR 目录 `config/` | 缺失自动从 jar 复制（AppConfig）；安装向导/WebUI 写回 | 主配置（本文全部键） |
| `experimental.yml` | JAR 目录 `config/` | 缺失自动从 jar 复制（`ExperimentalConfig`） | 实验性功能开关，见下文 |
| `game/realm_config.json` | JAR 目录 `config/` | `Main.releaseConfigs()` → `GameConfigLoader.extractConfigs()` 缺失时复制 | 境界数据：`realms[]`（29 个境界阶段条目：id/name/subRealm/description/requiredExp/requiredSpiritStones/各属性加成/unlockSkillId 等）+ `cultivationPerSecond`（`baseValue: 1`、`realmMultiplier` 11 档修炼倍率） |
| `newbie_reward.json` | JAR 目录 `config/` | 同一次释放，缺失时**由代码生成默认 JSON**（非从 jar 复制）：`enabled: false`、`goldReward: 1000`、`spiritStoneReward: 100`、`spiritStoneGrade: 0` | 新人奖励配置；WebUI 可改（需 `admin.config.manage`） |
| `adapters.json` | 工作目录 `config/` | `AdapterConfigManager` 缺失时创建默认配置 | OneBot / QQ 官方 / Minecraft 通道实例配置（不属于 `application.yml`），详见 [适配器与外部接入](./adapters) |
| `blacklist.yml` | 工作目录 `config/` | `BlacklistService` 缺失时从 jar 复制默认模板（`entries[]`：qqNumber/userId 二选一、reason、bannedBy、createdAt） | 黑名单（QQ 号/用户 ID），群聊自动禁言依据 |
| `onebot_group_config.yml` | 工作目录 `config/` | `OneBotGroupConfigService` 缺失时从 jar 复制默认模板（`groups[]`：groupId、autoMuteEnabled、muteDurationDays 默认 29 天） | OneBot 群组自动禁言开关与天数 |
| `plugin.yml` | jar 内置资源 | — | Bukkit 桥接插件 `XiuxianBridge` 的插件描述（单独编译进 MC 插件，主服不读取） |
| `built_in_plugins.yml` | jar 内置资源 | — | 内置模块注释模板（**代码实际不读取**；真正生效的开关是 `application.yml` 的 `built_in_plugins:` 段） |
| `data/mtxgdn/lang/zh_cn.json` | jar 内置资源 | — | 简体中文翻译（物品/秘境/事件/系统消息） |

## 主配置键速查（config/application.yml）

下文全部键与默认值以仓库 `src/main/resources/application.yml` 为准；「代码回退」仅在该键缺失时由代码兜底（与模板默认不一定相同，已分别注明）。

### 应用信息与 HTTP 服务

| 键 | 默认值 | 说明 |
|----|--------|------|
| `app.name` | `修仙世界` | 应用显示名（OAuth 授权页等前端展示） |
| `server.host` | `127.0.0.1` | REST/WS 监听地址；`0.0.0.0` 对外网开放。改公网地址且 admin 凭据缺失/默认时启动打印强警告 |
| `server.port` | `8080` | HTTP 端口（REST API、Web 管理台 `/admin`、安装向导 `/install`、游戏 WebSocket 同一监听） |

> 代码回退：`Main` 读取 `server.host` 默认 `127.0.0.1`、`server.port` 默认 `8080`；`Main.reportDeploymentPaths()` 打印 JAR 目录/工作目录/各数据路径，二者不一致会醒目告警。

### 数据库

| 键 | 默认值 | 说明 |
|----|--------|------|
| `database.type` | `sqlite` | `sqlite`（零依赖，推荐单机）\| `mysql`。**注意：代码空值回退为 `mysql`**（`Main.initializeDatabase`），勿删除该键 |
| `database.url` | `jdbc:mysql://localhost:3306/xiuxian?useUnicode=true&characterEncoding=UTF-8&connectionCollation=utf8mb4_unicode_ci` | MySQL 连接串（仅 type=mysql） |
| `database.username` / `database.password` | `root` / `root` | MySQL 账号密码（仅 type=mysql） |
| `database.sqlite_path` | `xiuxian.db` | SQLite 库文件路径（相对工作目录，仅 type=sqlite） |
| `database.pool_max` | `4` | 连接池最大连接数（HikariCP）。代码兜底：MySQL 取 `max(4, 值)`；SQLite 夹在 `2~8` 之间（`SQLiteDialect` 单写者模型，避免写锁争用） |

连接池其余参数由 `DatabaseManager` 固定：最小空闲 1、连接超时 10s、校验超时 3s、空闲 300s、最长存活 1800s；取连接统一 `READ_COMMITTED`。详见 [数据库设计](./database)。

### JWT / 季节 / OAuth2 / 玩家数据文件化

| 键 | 默认值 | 说明 |
|----|--------|------|
| `jwt.secret` | `""` | 玩家 Token 签名密钥。留空=每次启动随机生成（重启后全部玩家令牌失效）；生产应设 ≥256 位随机串（注释建议 `openssl rand -base64 48`）。**未完成安装时留空允许启动（安装模式），已安装后要求 ≥32 字节**（`JwtUtil`）；安装向导要求 ≥48 字节。判「已安装」即此键在磁盘配置中非空（`InstallResource.isInstalled`） |
| `season.mode` | `calendar` | 季节更替模式：`calendar`=按真实月份四季；`cycle`=按小时循环 |
| `season.cycle_hours` | `6` | `cycle` 模式下每季持续小时数（更替时全服广播） |
| `oauth2.enabled` | `true` | 是否启用 OAuth2 独立鉴权端点（`/api/auth/oauth/*`） |
| `oauth2.client_id` | `xiuxian_oauth_client` | OAuth2 客户端 ID |
| `oauth2.client_secret` | `xiuxian_oauth_secret_please_change` | OAuth2 客户端密钥（**务必修改**；与 QQ 官方机器人凭据无关） |
| `oauth2.scopes` | `read write` | 授权作用域（空格分隔） |
| `oauth2.token_ttl_seconds` | `3600` | Access Token 有效秒数（代码下限 60s） |
| `player-data.enabled` | `true` | 玩家数据文件化落盘（`data/players/<playerId>.json`） |
| `player-data.dir` | `data/players` | 玩家数据文件目录 |
| `player-data.auto-sync-seconds` | `30` | 脏数据定期落盘间隔（秒，`0`=关闭自动同步） |
| `player-data.self-restore` | `false` | 是否允许玩家用导出文件自助恢复（默认关闭防刷） |

### 管理后台与邮件

| 键 | 默认值 | 说明 |
|----|--------|------|
| `admin.username` | `admin` | 管理后台账号（未配置则回退**数据库用户认证**：拥有 `admin.login` 权限或 ADMIN/SUPER_ADMIN/MODERATOR 角色者） |
| `admin.password_hash` | `$2a$10$njJJacGfGPEX1FHD6MB1HeKEgjfWx5zF2nrGo.gEbdjb3Q.KA3gcC` | 密码的 bcrypt 哈希（默认值即 `admin123` 的哈希）。**勿再配置明文 `admin.password`**：首次启动会自动升级为 bcrypt 哈希写回并删除明文项 |
| `smtp.host` | `smtp.qq.com` | SMTP 服务器地址 |
| `smtp.port` | `587` | SMTP 端口（587=STARTTLS，465=SSL） |
| `smtp.username` / `smtp.password` | `""` | SMTP 登录账号（通常为发件邮箱）与授权码（非邮箱登录密码） |
| `smtp.from` | `""` | 发件人地址（留空使用 username） |
| `smtp.auth` | `true` | 是否启用 SMTP 认证 |
| `smtp.starttls` | `true` | 是否启用 STARTTLS |
| `verify_code.enabled` | `true` | 网页注册是否要求邮箱验证码 |
| `verify_code.allowed_domains` | `qq.com,163.com,126.com,gmail.com,outlook.com,hotmail.com` | 允许注册的邮箱域名（YAML 列表，读取时拍平为逗号分隔） |
| `verify_code.rate_limit_seconds` | `60` | 同一邮箱发送验证码冷却秒数 |

> 管理令牌（12 小时有效）签名密钥优先 `admin.jwt_secret`、回退 `jwt.secret`；两键均空或 <32 字节时随机生成（重启后管理令牌失效）。连续登录失败 5 次锁定 15 分钟。详见 [架构总览 · 鉴权分层](./architecture#鉴权分层)。

### OneBot 与 Minecraft（application.yml 侧参数）

| 键 | 默认值 | 说明 |
|----|--------|------|
| `onebot.enabled` | `true` | 是否启用 OneBot 接入（通道实例级配置在 `config/adapters.json`） |
| `onebot.send_mode` | `text` | 消息发送模式：`text`=纯文本；`chat_record` 合并转发等（按 OneBot 实现能力） |
| `onebot.screenshot.window_title` | `""` | 截图模拟模式目标窗口标题（留空自动识别为 `QQ`） |
| `onebot.screenshot.poll_interval` | `2000` | 截图轮询间隔（毫秒） |
| `minecraft.jar_path` | `""` | 内嵌 MC 服务端 jar 路径 |
| `minecraft.server_dir` | `mc_server` | 内嵌 MC 服务端工作目录 |
| `minecraft.java_path` | `java` | 拉起 MC 进程用的 Java 可执行路径 |
| `minecraft.min_memory_mb` | `512` | MC 进程最小堆（MB） |
| `minecraft.max_memory_mb` | `1024` | MC 进程最大堆（MB） |
| `minecraft.ready_timeout_seconds` | `120` | 等待 MC 服务就绪超时（秒） |
| `minecraft.extra_jvm_args` | `""` | 附加 JVM 参数（空格分隔） |
| `minecraft.online_mode` | `false` | MC 是否正版验证（true=正版用户名，false=离线） |
| `minecraft.command_prefix` | `xiuxian` | MC 内指令前缀（代码兜底读取 trim 后值） |

### 日志 / 背包 / 性能 / 网络

| 键 | 默认值 | 说明 |
|----|--------|------|
| `logging.level` | `DEBUG` | 日志级别：TRACE/DEBUG/INFO/WARN/ERROR（`GameLogger` 按名字匹配 `Level.valueOf`） |
| `logging.dir` | `log` | 日志文件目录（控制台 + 文件双写） |
| `logging.color` | `true` | 控制台日志是否 ANSI 着色 |
| `inventory.base_capacity` | `30` | 背包初始格子数 |
| `inventory.capacity_per_level` | `5` | 每升一级增加的背包格子数 |
| `performance.low_memory` | `false` | 低内存模式：把 Grizzly 读/写缓冲压到 16KB（`ServerConfigurator`） |
| `performance.grizzly_io_threads` | `2` | Grizzly IO 线程数（selector runners） |
| `performance.grizzly_worker_cores` | `4` | Grizzly 工作线程核心数（队列上限 100） |
| `performance.grizzly_worker_max` | `8` | Grizzly 工作线程最大数 |
| `performance.memory_log_entries` | `200` | 内存环形缓冲日志条数上限（Web 管理台「日志」页数据源） |
| `network.connection_timeout_ms` | `10000` | 连接建立超时（毫秒） |
| `network.read_timeout_ms` | `30000` | 读取超时（毫秒） |

> 说明：模板中 `network.*` 只保留上述两项；旧文档提及的 `write_timeout_ms`、`websocket_handshake_timeout_ms`、`network.db_pool_max` 已不在当前模板中，代码也不再读取。

### Minecraft MOTD 预览

| 键 | 默认值 | 说明 |
|----|--------|------|
| `motd.port` | `25565` | MOTD 监听端口（显示服务器列表预览用） |
| `motd.max_players` | `2026` | 展示的最大玩家数 |
| `motd.version_name` | `§b§l修仙世界 §r§f— §eAPI v1.0` | 版本行文案 |
| `motd.protocol_version` | `-1` | 协议版本（-1=自动/未知） |
| `motd.line1` | `§b§l修 仙 世 界 §r§8— §e§lXiuXian Game` | 第 1 行 |
| `motd.line2` | `§7` | 第 2 行 |
| `motd.line3` | `§f⚔ §a境界突破 §7\| §d秘境探索 §7\| §e游历修仙 §f⚔` | 第 3 行 |
| `motd.join_message` | `""` | 玩家尝试加入时显示的消息；占位符 `{username}` `{online}` `{max}` `{delay}` `{server}` |
| `motd.redirect_server` | `""` | 玩家点「加入服务器」后的 TCP 隧道透传目标（host 或 host:port）；留空不跳转仅拒绝 |
| `motd.redirect_delay_seconds` | `5` | 仅供 `join_message` 的 `{delay}` 占位符取值（跳转本身即时） |

### 内置玩法模块（built_in_plugins.*）

`application.yml` 的 `built_in_plugins:` 段是**代码真正读取的内置模块总开关**（`BuiltInPluginRegistry.init()` 逐键查 `built_in_plugins.<name>`，默认 true，`false` 即禁用）。包内资源 `built_in_plugins.yml` 只是旧注释模板，不参与加载。运行时可在 WebUI「插件管理」页启停，选择会经 `AppConfig.update` **持久化写回本段**。

| 键 | 默认值 | 模块 |
|----|:---:|------|
| `built_in_plugins.exploration` | true | 探索/游历系统（游历事件、随机遭遇） |
| `built_in_plugins.secret_realm` | true | 秘境系统（进入秘境、秘境探索） |
| `built_in_plugins.trade` | true | 坊市交易系统（上架、购买、取消） |
| `built_in_plugins.sect` | true | 宗门系统（创建宗门、宗门管理、宗门仓库） |
| `built_in_plugins.farm` | true | 农场系统（种植、浇水、施肥、收获） |
| `built_in_plugins.cave` | true | 洞府系统（灵力收集、洞府升级） |
| `built_in_plugins.chat` | true | 聊天系统（世界频道、私聊） |
| `built_in_plugins.friend` | true | 好友系统（添加好友、好友列表） |
| `built_in_plugins.team` | true | 团队系统（创建团队、组队副本） |
| `built_in_plugins.map` | true | 地图系统（查看地图、移动旅行） |
| `built_in_plugins.title` | true | 称号系统（成就、称号装备） |
| `built_in_plugins.technique` | true | 功法系统（功法学习、装备、升级） |
| `built_in_plugins.crafting` | true | 炼丹锻造系统（配方、炼制） |
| `built_in_plugins.buff` | true | Buff 系统（增益效果） |
| `built_in_plugins.formation` | true | 阵法系统（阵法布置、阵法加成） |
| `built_in_plugins.energy` | true | 能量系统（物品转化能量） |
| `built_in_plugins.cultivation` | true | 修炼系统（打坐、突破、转世、天象、晨修） |
| `built_in_plugins.skill` | true | 技能系统（学习技能、技能列表、战斗策略） |
| `built_in_plugins.pvp` | true | 战斗系统（挑战、决斗） |
| `built_in_plugins.inventory` | true | 背包/装备系统（物品、装备、强化） |
| `built_in_plugins.economy` | true | 经济系统（拍卖、灵庄、商店、签到、灵石流转） |
| `built_in_plugins.rank` | true | 排行系统（查看排行榜） |
| `built_in_plugins.search` | true | 搜索系统（按名称搜索玩家） |
| `built_in_plugins.player` | true | 角色系统（状态、疗伤、灵根） |
| `built_in_plugins.onebot` | true | OneBot 消息通道（类型级总开关；实例级 enabled 仍在 `config/adapters.json`） |
| `built_in_plugins.qq` | true | QQ 官方机器人消息通道 |
| `built_in_plugins.minecraft` | true | Minecraft 内嵌服务器消息通道 |
| `built_in_plugins.minecraft-player` | true | Minecraft 玩家直连消息通道 |

模块启停对指令（`CommandRegistry`）、HTTP（`ModuleGateFilter`）、WebSocket（动作映射）三层统一门控；被停用模块的指令回「该玩法已停用」提示。详见 [架构总览 · 内置玩法模块与插件](./architecture#内置玩法模块与插件)。

## 实验开关（config/experimental.yml）

独立于 `application.yml`，由 `common/ExperimentalConfig.java` 加载（classpath 内置 + 外部 `config/experimental.yml`，外部覆盖；缺失自动释放），键形如 `experimental.<feature>`：

```yaml
# 实验性功能开关
# 各功能独立开关：true 为启用。注意 energy_exchange 实际默认 true（等价交换已默认开放），
# 与「所有功能默认关闭」的通用说法不同，请以每个键的默认值为准。
experimental:
  sect_war: false      # 宗门战（暂未启用开关，代码未按此开关拦截宗门战）
  energy_exchange: true  # 能量转化系统（等价交换，默认开启；/兑换 相关指令由 ExperimentalConfig.isEnabled("energy_exchange") 门控）
```

> `energy_exchange` 默认 **true**（等价交换默认开放）；`experimental.yml` 顶部原「所有功能默认关闭」的通用说法已改为逐键说明，避免误导。`ExchangeCommand` / `EnergyAdminCommand` 在该开关关闭时拒绝服务。插件层可通过 `PluginContext` 读取同一份实验开关。

## 安装向导（/install，首次启动）

「已安装」判定 = 磁盘 `config/application.yml` 中 `jwt.secret` 非空（`InstallResource.isInstalled`）。未安装时服务器额外挂载 `/install` 静态向导页，API 为 `com.mtxgdn.rest.InstallResource`（`/api/install/*`）：

| 接口 | 说明 |
|------|------|
| `GET /api/install/status` | 安装状态与当前配置快照（serverHost/Port、databaseType/sqlitePath、adminConfigured、jwtConfigured/jwtFingerprint、onebotEnabled、Java/OS 信息、jarDir） |
| `POST /api/install/configure` | 首次安装写配置（已安装返回 403），完成后自动重启 |
| `POST /api/install/reset` | 重置：校验当前管理员密码后**删除** `config/application.yml`，异步重启回未安装态 |
| `POST /api/install/restart` | 无条件重启（`Main.restartServer`：以 `java -jar <当前jar> [原启动参数]` 起新进程，轮询 `/api/game/status`（200/401）就绪后退出旧进程，最多 60s） |

`/configure` 校验与写入项（写入均为 `AppConfig.update` 行级写回，保留注释）：

- 管理员：用户名 3~32 位 `[a-zA-Z0-9_]`；密码 ≥8 位且两次一致；只存 bcrypt（`BCrypt.gensalt(10)`）到 `admin.password_hash`，同时删除可能的旧明文 `admin.password` 键。
- 数据库：`databaseType` 非 sqlite 一律按 mysql 处理（需填 `mysqlUrl`）；mysql 写 `database.url/username/password`，sqlite 写 `database.sqlite_path`（留空 `xiuxian.db`）。
- JWT：`jwtSecret` 留空则自动生成 **64 字节（512 位）** Base64URL 随机密钥；用户自填需 **≥48 字节**（`JWT_SECRET_MIN_BYTES = 48`）。
- 端口：`serverPort` 写 `server.port`；**`server.host` 恒写 `0.0.0.0`**（向导即面向对外部署；文档页若只在本机使用可手动改回 127.0.0.1）。
- `onebotEnabled`（可选）写 `onebot.enabled`。

> 安装向导的静态页资源打包在 jar 内 `install/` 下；只有把 `jwt.secret` 配好（无论向导、手动编辑还是旧版明文升级）才视为完成安装。

## 代码读取但 application.yml 未列出的键

以下键模板未给出默认段，但代码会按点分键读取（缺失时用下列回退值）。如需配置，可在外部 `config/application.yml` 中自行追加对应小节（写回与合并机制支持）：

| 键 | 代码回退默认 | 读取位置与作用 |
|----|--------------|----------------|
| `plugins.hot_swap` | `false` | `Main.doMain`：为 true 时启动 `plugins/` 目录文件监视器，插件可热加载 |
| `admin.jwt_secret` | 回退 `jwt.secret` | `AdminAuthFilter.initAdminKey`：管理令牌 HS256 签名密钥；<32 字节或空则随机生成（重启失效） |
| `permission.default.role.level` | `10` | `PermissionService`：等级 ≤ 该值的最高默认权限组即「默认角色」（内置 PLAYER=10），注册等场景 `assignDefaultRole` 使用 |

## 启动脚本与环境变量

| 脚本 | 平台 | 行为与变量 |
|------|------|-----------|
| `start.sh` | Linux/macOS | 定位 `target/main-V1.4.1-beta2.jar`（或 `target/main-*.jar`，排除 `original-*`）；默认 JVM 参数 `-Xms128m -Xmx512m -Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8`；支持 **`XIUXIAN_MEM`**（如 `-Xmx256m`，默认 `-Xmx512m`）与 **`JAVA_OPTS`**（自定义时整组生效）覆盖；`cd` 到脚本目录启动 |
| `install.sh` / `install.bat` | Linux/macOS / Windows | 一键安装启动：校验 Java 主版本 ≥23、定位/自动 `mvn -q package -DskipTests`（`--build` 强制重建）、检查 `config/application.yml` 与 `jwt.secret` 是否已配；`install.bat` 额外 `chcp 65001` |
| `start-low-memory.bat` | Windows | 1~2GB 内存设备：`-Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m`，默认引用产物 `target/main-V1.4.1-beta2.jar` |
| `build-mc-plugin.bat` | Windows | 单独编译 Bukkit 桥接插件（不进主 jar） |

> 运行参数：`--nogui`（常驻后台，Ctrl+C 优雅关闭）、`--demo`（服务就绪后跑交互式演示客户端退出）、`--plugin-make` / `--plugin-make-gui`（插件工程生成向导，不启动服务器）。README 建议低内存用 `start-low-memory.bat` / `XIUXIAN_MEM` 控制堆。

## 相关文档

- [部署指南](./deployment) — 目录落点、安装向导步骤、端口清单、安全建议
- [架构总览](./architecture) — 启动装配、鉴权分层、配置释放时序
- [数据库设计](./database) — `database.*`、连接池参数落地
- [权限体系](./permissions) — `admin.*` 权限码与 `permission.default.role.level`
- [适配器与外部接入](./adapters) — `config/adapters.json` 实例配置
