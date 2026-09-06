# 部署指南

本文按 **V1.4.1-beta2** 代码与仓库脚本（`install.bat` / `install.sh` / `start.sh` / `start-low-memory.bat`）编写，覆盖构建、初始化、运行、数据库、消息通道与安全配置。产物是一个可执行 fat-jar：`target/main-V1.4.1-beta2.jar`，Windows / Linux / macOS 通用（SQLite JDBC 自带各平台原生库）。

> 文中 `server.port` 表示 `config/application.yml` 中 `server:` 段下的 `port:` 键（SnakeYAML 拍平后的点分记法）；全文配置文件默认值均以仓库 `src/main/resources/application.yml` 为准。

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| JDK | **23 或更高** | pom 编译目标 23；安装脚本会校验主版本 ≥ 23（如 Adoptium OpenJDK 23） |
| Maven | 3.8+ | 仅构建需要（运行不需要） |
| 数据库 | 默认 SQLite（零依赖）；可选 MySQL 8+ | `database.type: sqlite | mysql` |
| 内存 | 建议 ≥ 512MB 堆（脚本默认 `-Xmx512m`；低内存设备 256MB，见下文） | 内置玩法较多，首次启动建库/扫描耗时约 1~3 分钟 |

## 构建与打包

在仓库根目录执行：

```bash
mvn clean package -DskipTests
```

产物：`target/main-V1.4.1-beta2.jar`（shade fat-jar，主类 `com.mtxgdn.Main`，Manifest 已写好，可直接 `java -jar`）。

```bash
# 可选：运行测试
mvn test          # 或 run_tests.sh / run_tests.bat
```

注意事项：

- `minecraft/plugin`（Bukkit 桥接插件源码）在 pom 编译中**被排除**，不进主 jar；如需该插件请用 `build-mc-plugin.bat` 单独编译（需自行准备 MC 服务端 jar 提供 Bukkit API），产物为 `mc_server/plugins/XiuxianBridge.jar`。
- `install.sh` / `install.bat` 会在未找到 jar 时自动执行 `mvn package -DskipTests`。

## 目录布局与工作目录要求（重要）

文件落点分为 **JAR 所在目录（`<jarDir>`）** 与 **当前工作目录（CWD）** 两类，务必区分：

| 落点基准 | 内容 |
|----------|------|
| JAR 所在目录 | `config/application.yml`（缺失时自动从包内释放）、`config/experimental.yml`、`config/game/realm_config.json`、`config/newbie_reward.json` |
| 当前工作目录 | `xiuxian.db`（SQLite 文件）、`config/adapters.json`（自动生成）、`config/blacklist.yml`、`config/onebot_group_config.yml`、`data/players/`、`log/`、`plugins/`、`mc_server/` |

因此**必须从 JAR 所在目录启动**（或 systemd 设置 `WorkingDirectory=<jarDir>`）。否则 `config/adapters.json`、数据库文件、`data/`、`log/`、`plugins/` 会落到其他目录，配置与数据散落两处。

> 启动时服务端会打印「部署路径」报告（`Main.reportDeploymentPaths`：JAR 目录 / 工作目录 / 各数据路径）。工作目录与 JAR 目录不一致时会输出醒目警告，请按提示修正。

## 首次启动与安装向导

1. 启动服务器：

```bash
java -jar target/main-V1.4.1-beta2.jar
```

2. 浏览器打开安装向导（仅未安装时挂载）：**http://127.0.0.1:8080/install**

安装向导按步骤配置：

1. 服务器端口（写 `server.port`）
2. 数据库模式（SQLite 零配置 / MySQL 连接串与账号密码）
3. 管理员账号与密码（写 `admin.username` 与 bcrypt 哈希 `admin.password_hash`）
4. JWT 密钥（`jwt.secret`，留空则随机生成，重启后玩家需重新登录）

> ⚠ 安装向导提交时会把监听地址 `server.host` 一并写为 `0.0.0.0`（对外网卡可访问）。若只需本机访问，请在安装完成后把 `server.host` 改回 `127.0.0.1` 再重启；公网部署前务必先修改默认管理员密码并配置 `jwt.secret`（见[安全建议](#安全建议)）。

3. 提交后服务端把配置写回 `config/application.yml` 并**自动重启**（`Main.restartServer` 以原参数启动新进程，轮询 `/api/game/status` 就绪后退出旧进程释放端口，最多等待 60 秒）；重启后 `/install` 卸载。

4. 访问 Web 管理控制台：**http://127.0.0.1:8080/admin/**

> 判定「已安装」的条件是磁盘 `config/application.yml` 的 `jwt.secret` 非空（`InstallResource.isInstalled`）。如需重装：清空 `jwt.secret` 后重启，或调用 `/api/install/reset`（需当前管理员密码）。首次启动即建库建表、写入默认技能/功法/配方并完成内容扫描注册（见[架构总览](./architecture)）。

## 数据库选择

### SQLite（默认，单机/测试推荐）

`config/application.yml`：

```yaml
database:
  type: sqlite            # 默认值
  sqlite_path: xiuxian.db # 文件落在工作目录
  pool_max: 4             # SQLite 建议 2~8
```

无需任何数据库服务，开箱即用。

### MySQL（生产推荐）

先建库（注意字符集）：

```sql
CREATE DATABASE IF NOT EXISTS xiuxian
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`config/application.yml`：

```yaml
database:
  type: mysql
  url: jdbc:mysql://localhost:3306/xiuxian?useUnicode=true&characterEncoding=UTF-8&connectionCollation=utf8mb4_unicode_ci
  username: root
  password: 你的密码
  pool_max: 16            # MySQL 建议 8~32
```

本地 MySQL 自动拉起：`database.url` 指向 `localhost/127.0.0.1/::1` 且端口未就绪时，`MySqlLauncher` 会尝试把 MySQL 拉起来再初始化连接池——Windows 搜索 `mysqld.exe`；Linux/macOS 依次尝试 `systemctl` / `service` / `brew services` 的 `mysql|mysqld|mariadb`，失败则回退搜索 `mysqld` / `mariadbd` 二进制并直接拉起。指向**远程**地址时不做拉起，仅需保证远程 MySQL 可连。

> 两种数据库的 42 张业务表、迁移与默认权限数据均由启动流程自动创建（`DatabaseManager.initTable` + `DatabaseMigration` + `PermissionService.initDefaultData`），无需手工建表。详见[架构总览 · 数据持久化](./architecture#数据持久化)与[数据库设计](./database)。

## 运行方式

### 直接运行与启动参数

```bash
java -jar main-V1.4.1-beta2.jar [参数]
```

| 参数 | 说明 |
|------|------|
| `--nogui` | 无交互后台运行：主线程阻塞等待，Ctrl+C / `kill` 触发优雅关闭 |
| `--demo` | 服务就绪后运行交互式演示客户端（`DemoClient`），结束后退出 |
| `--plugin-make` | 交互式插件项目生成向导（不启动服务器） |
| `--plugin-make-gui` | 图形化插件生成器（不启动服务器） |

默认（无参数）为交互模式：按 Enter 关闭服务器。生产环境建议 `--nogui` + 守护进程。

### Linux / macOS：`./start.sh`

```bash
./start.sh                     # 自动定位 target/main-V1.4.1-beta2.jar
./start.sh /path/to/main-*.jar --nogui
XIUXIAN_MEM=-Xmx256m ./start.sh    # 低内存：默认 -Xms128m / -Xmx512m
JAVA_OPTS="..." ./start.sh         # 自定义 JVM 参数
```

脚本自动 `cd` 到自身所在目录再启动。

### Windows：`install.bat` / `start-low-memory.bat`

```bat
install.bat [--nogui] [--build]
```

低内存模式脚本内容（适用于 1~2GB 内存设备）：

```bat
java -Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m ^
     -Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8 ^
     -jar target/main-V1.4.1-beta2.jar %*
```

> `start-low-memory.bat` 默认引用产物 `target/main-V1.4.1-beta2.jar`；也可用以下命令等效启动：
>
> ```bat
> java -Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m -jar target\main-V1.4.1-beta2.jar --nogui
> ```

JVM 启动参数建议统一携带 `-Dfile.encoding=UTF-8`（服务器内部已强制 UTF-8，避免 Windows 默认 GBK 造成中文乱码）。

### 后台常驻（systemd 示例）

`--nogui` 下主线程阻塞等待信号，适合作为常驻服务。Linux systemd 单元模板（**务必设置 `WorkingDirectory` 为 JAR 所在目录**，并把 `config/`、数据库、`data/`、`log/`、`plugins/` 收敛到同一处）：

```ini
[Unit]
Description=Xiuxian World Game Server
After=network.target

[Service]
Type=simple
User=xiuxian
WorkingDirectory=/opt/xiuxian
ExecStart=/usr/bin/java -Xms128m -Xmx512m -Dfile.encoding=UTF-8 -jar /opt/xiuxian/main-V1.4.1-beta2.jar --nogui
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now xiuxian
journalctl -u xiuxian -f   # 查看日志
```

Windows 可用任务计划程序或 NSSM 包装 `java -jar ... --nogui`，并同样以 JAR 所在目录作为启动目录。

## Web 管理控制台与默认账号

| 入口 | 地址 |
|------|------|
| Web 管理控制台 | `http://127.0.0.1:8080/admin/` |
| 安装向导（首次） | `http://127.0.0.1:8080/install` |
| REST API | `http://127.0.0.1:8080/api/` |
| 游戏 WebSocket | `ws://127.0.0.1:8080` |

默认管理员：**`admin` / `admin123`**（仓库 `application.yml` 的 `admin.password_hash` 即该密码的 bcrypt 哈希）。

- 管理凭据优先级：`admin.username` + `admin.password_hash`（bcrypt）→ 若二者未配置则回退**数据库用户认证**（拥有 `admin.login` 权限或 `ADMIN`/`SUPER_ADMIN`/`MODERATOR` 角色的用户）。
- 修改方式：重新运行安装向导，或写 `admin.password_hash`（BCrypt 哈希）。请勿再配置明文 `admin.password`——首次启动会被自动升级为 bcrypt 哈希写回并删除明文项。
- 管理 JWT 有效期 12 小时，签名密钥优先 `admin.jwt_secret`、回退 `jwt.secret`；密钥短于 32 字节或缺失时随机生成（重启后管理令牌失效）。
- 连续登录失败 5 次锁定 15 分钟。

> ⚠️ 将 `server.host` 改为公网地址（非 `127.0.0.1`/`localhost`）时，若 admin 凭据未配置或仍为默认值，服务器会在控制台打印强警告；请务必先修改管理员密码与 `jwt.secret`。

## 消息通道部署配置

通道实例配置全部在 **`config/adapters.json`**（首次启动自动生成），修改后可经管理台「适配器」页热重载（内部 `POST /api/admin/adapters/reload` 对比新旧配置增量启停）。每个通道类型还受 `config/application.yml` 中 `built_in_plugins` 段对应开关（`onebot` / `qq` / `minecraft` / `minecraft-player`）约束，关掉后该类型所有实例不启动。

### OneBot QQ 机器人（服务端模式，默认启用）

默认生成的实例监听 **`ws://0.0.0.0:6700/onebot`**，由 Lagrange / LLOneBot 等 OneBot 实现**以客户端身份接入**：

```json
{
  "id": "onebot-default",
  "type": "onebot",
  "enabled": true,
  "config": {
    "port": 6700,
    "mode": "ws_server",
    "send_mode": "text"
  }
}
```

- `mode: ws_server`（默认）；`mode: screenshot` 为实验性桌面自动化发送（需图形会话，无头 Linux 不可用）。
- `send_mode: text` 纯文本；`chat_record` 模式以转发消息（合并转发）发送，可由 `config/application.yml` 的 `onebot.send_mode` 覆盖。
- 黑名单与群组自动禁言：`config/blacklist.yml`、`config/onebot_group_config.yml`（缺失自动生成）。
- 机器人接入后私聊可 `/register`、`/bind`；群聊与私聊均可使用 `/` 开头全部指令（中英文别名）。指令清单见 [QQ 指令](./qq-commands)。

### QQ 官方机器人（可选）

在 `adapters.json` 增加 `type: "qq"` 的实例并填开放平台凭据（`mode` 二选一）：

```json
{
  "id": "qq-official-1",
  "type": "qq",
  "enabled": true,
  "config": {
    "app_id": "你的AppID",
    "client_secret": "你的ClientSecret",
    "mode": "websocket",
    "sandbox": false,
    "command_prefix": "",
    "remove_at": true
  }
}
```

- `mode: websocket`（默认）：**出站**连接官方 WebSocket 网关（`wss://api.sgroup.qq.com/websocket`，沙箱 `wss://sandbox.api.sgroup.qq.com/websocket`），无需开放入站端口；`sandbox: true` 走沙箱。
- `mode: webhook`：由本地 `QqWebhookServer` 接收回调，**端口必须为 80 / 443 / 8080 / 8443 之一**，验签为 `Base64(HMAC-SHA256(appSecret, timestamp+"\n"+nonce+"\n"+body))` 常量时间比较。相关键：`webhook_host`（默认 0.0.0.0）、`webhook_port`（默认 8080）、`webhook_path`（默认 `/qq/webhook`）、`webhook_max_skew_seconds`（默认 300）。
- 其他可选键：`intents`（逗号分隔事件名，默认 `GROUP_AT_MESSAGE_CREATE,C2C_MESSAGE_CREATE`）、`send_mode`、`reconnect_interval_ms`、`gateway_url`。
- 支持群 @ 消息、单聊 C2C 消息与按钮消息（按钮绑定指令串，进同一条指令管线）；被动回复窗口：单聊 60 分钟、群聊 5 分钟。
- 注意端口冲突：主 REST 服务默认占 8080；若 webhook 也要用 8080，需调整 `server.port` 或换用 80/443/8443 并放行防火墙（或绑定到不同网卡 `webhook_host`）。
- 另注意：`config/application.yml` 中 `oauth2.*` 是服务端**自带 OAuth2 令牌端点**（`/api/auth/oauth/*`）的配置，与 QQ 官方机器人的 `app_id/client_secret` 无关。

### Minecraft 通道（可选）

| 类型 | 说明 |
|------|------|
| `minecraft` | 内嵌服务器进程模式：在 `config` 的 `server_dir`（默认 `mc_server`）下用 `jar_path` 指定的 MC 服务端 jar 拉起进程，解析日志中的聊天/上下线事件接入指令 |
| `minecraft-player` | 玩家直连模式：以机器人账号（离线模式，`username`/`password`，默认 `XiuXianBot`）登录目标 MC（`host`/`port`），识别 `/tell` 私聊执行修仙指令 |
| MOTD（常开） | `config/application.yml` 的 `motd.port`（默认 25565）：服务器列表 MOTD/在线人数展示，可配 `motd.redirect_server` 做 TCP 隧道跳转 |

`minecraft` 实例关键参数同样见 `config/adapters.json` 默认生成项（`jar_path`、`server_dir`、`java_path`、`min_memory_mb`/`max_memory_mb`、`auto_start`、`online_mode`、`command_prefix` 等）；内嵌进程的 JVM 参数亦可在 `config/application.yml` 的 `minecraft.*` 段调整。如需在 MC 内直接敲 `/xiuxian <子命令>`，另见 [适配器与外部接入](./adapters)（Agent 注入 / `build-mc-plugin.bat` 桥接插件）。

## 端口与防火墙清单

| 端口 | 协议 | 用途 | 默认启用 | 配置位置 |
|------|------|------|----------|----------|
| 8080 | TCP（HTTP/WS） | REST API、Web 管理台、安装向导、游戏 WebSocket | ✅ | `server.port` |
| 6700 | TCP（WS） | OneBot 机器人接入（服务端模式） | ✅（实例 `onebot-default`） | `config/adapters.json` 实例 `port` |
| 25565 | TCP | Minecraft MOTD 预览（随服务常开） | ✅ | `motd.port` |
| 80/443/8080/8443 | TCP（HTTP） | QQ 官方 webhook 回调（仅 `mode: webhook`） | ❌（按实例） | qq 实例 `webhook_port` |
| 3306 | TCP | 本地 MySQL（仅 MySQL 模式指向本机时由 `MySqlLauncher` 检查/拉起） | 按需 | `database.url` |

出站连接（按需放行）：QQ 官方 WebSocket 网关 `wss://api.sgroup.qq.com/websocket`（沙箱 `wss://sandbox.api.sgroup.qq.com/websocket`）、SMTP（`smtp.port`，默认 587）、远程 MySQL。反向代理（Nginx/Caddy）透传 WebSocket 与 QQ webhook 时注意 `Upgrade` 头与路径（`/admin`、`/onebot`、`/qq/webhook`）转发配置。

## 日志与运维

| 事项 | 说明 |
|------|------|
| 日志文件 | `log/server-<yyyyMMdd-HHmmss>.log`（`logging.dir` 默认 `log`，UTF-8；`logging.level` 控制级别，默认 DEBUG） |
| 实时日志 | Web 管理控制台「日志」页（内存环形缓冲，容量 `performance.memory_log_entries`） |
| 数据库备份 | 管理台「数据库 → 备份下载」（整库导出为 JSON，可导入还原；导入/导出均有表名、列名白名单校验） |
| 玩家数据 | 管理台「玩家数据」：单个/全部玩家导出、列表、还原；文件落 `data/players/<playerId>.json` |
| 数据清理 | `DatabaseManager.clearPlayerData` / `resetAllData`（管理后台对应操作，需对应权限码） |
| 适配器 | 管理台「适配器」页启停/热重载；`POST /api/admin/adapters/reload` |
| 公告 | `POST /api/admin/announce` 全服公告 |
| 关闭 | 交互模式按 Enter；`--nogui` 下 Ctrl+C / systemctl stop；均可触发优雅关闭（落盘玩家数据 → 关连接池） |

## 安全建议

1. **监听地址**：默认 `server.host: 127.0.0.1` 仅本机。改为公网绑定前，务必先修改默认管理员密码与 `jwt.secret`（Main 会在公网绑定 + 默认凭据时打印强警告）。
2. **JWT 密钥**：`jwt.secret` 至少 32 字节（推荐 48+，如 `openssl rand -base64 48`）；留空则每次启动随机生成（重启后所有玩家令牌失效）。未配置且非安装模式时服务器**拒绝启动**。
3. **管理员**：换掉默认 `admin/admin123`；哈希存 `admin.password_hash`（bcrypt），勿保留明文 `admin.password`。
4. **OAuth2**：修改默认 `oauth2.client_secret`（`xiuxian_oauth_secret_please_change`）。
5. **防火墙**：公网只暴露必要端口；QQ 官方 webhook 务必能收到平台回调且验签通过后再上线。
6. **实验功能**：`config/experimental.yml` 中默认关闭的功能按需开启。
7. **玩家自助还原**：默认关闭（`player-data.self-restore: false`），防止玩家用导出文件刷数据。
8. **邮件**：网页端注册依赖邮箱验证码（`verify_code.enabled` 默认 true 且域名白名单 `verify_code.allowed_domains`）；不打算启用网页邮箱注册时保持验证码功能关闭或配好 `smtp.*`（默认模板为 QQ 邮箱 `smtp.qq.com:587` STARTTLS）。QQ 机器人渠道的注册绑定不依赖 SMTP。

## 相关文档

- [架构总览](./architecture)
- [配置说明](./config)
- [适配器与外部接入](./adapters)
- [REST API](./rest-api)
- [WebSocket 协议](./websocket)
- [内部 API 一览](./internal-api)
- [数据库设计](./database)
- [快速开始](../guide/quickstart)
