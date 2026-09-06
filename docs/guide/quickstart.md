# 快速开始

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| JDK | **23 或更高**（项目编译目标为 Java 23，一键脚本会检测版本） |
| Maven | 3.8+（仅构建需要） |
| 数据库 | 默认 **SQLite 零配置**；使用 MySQL 模式时需 MySQL 8+ 并创建数据库 `xiuxian` |

## 获取源码

```bash
git clone https://github.com/oooohhhhhhhhhh/xiuxian-server-alpha.git
cd xiuxian-server-alpha
```

## 一键安装脚本（推荐）

仓库根目录提供 `install.bat`（Windows）与 `install.sh`（Linux / macOS）。脚本会依次：

1. 检测 Java（版本低于 23 时提示安装 [Adoptium JDK 23+](https://adoptium.net/)）；
2. 定位已有 `target/main-*.jar`；找不到时自动执行 `mvn package -DskipTests` 构建（此时需要本机装有 Maven）；
3. 启动服务器，并打印安装向导与管理后台地址。

```bash
# Linux / macOS
./install.sh

# Windows
install.bat
```

支持参数：

| 参数 | 说明 |
|------|------|
| `--build` | 强制重新构建后再启动 |
| `--nogui` | 无交互后台模式启动 |
| `--help` | 查看脚本用法（其余参数原样透传给 java） |

另有 `start.sh`（Linux / macOS，启动已构建的 jar，支持 `JAVA_OPTS`、`XIUXIAN_MEM` 等 JVM 参数）与 `start-low-memory.bat`（Windows 低内存模式，`-Xms128m -Xmx256m` + Serial GC）。

> `start-low-memory.bat` 默认引用产物 `target/main-V1.4.1-beta2.jar`；等效低内存启动命令：`java -Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m -jar target/main-V1.4.1-beta2.jar --nogui`

## 手动构建与运行

```bash
mvn clean package -DskipTests
java -jar target/main-V1.4.1-beta2.jar
```

- 构建产物为 shade 打包的可执行 fat-jar，文件名为 `target/main-<版本号>.jar`（当前版本 **V1.4.1-beta2**，主类 `com.mtxgdn.Main`）；
- 建议在 **jar 所在目录**启动，保证 `config/`、数据库文件、`data/`、`log/`、`plugins/` 等相对路径落在正确位置（工作目录与 jar 目录不一致时服务器会打印告警）；
- 默认交互模式：按 **Enter** 键关闭服务器（依次停止适配器、WebSocket 网关、MOTD 等并同步数据）；`--nogui` 模式常驻后台运行，按 Ctrl+C 停止。

### 启动参数

| 参数 | 说明 |
|------|------|
| `--demo` | 启动交互式演示客户端（服务就绪后自动退出） |
| `--nogui` | 无交互后台模式 |
| `--plugin-make` | 启动插件项目生成向导（不启动服务端） |
| `--plugin-make-gui` | 启动图形化插件生成器（不启动服务端） |

## 首次启动：安装向导

首次启动（尚未配置 JWT 密钥）时，浏览器打开 **http://127.0.0.1:8080/install** 完成一步式安装：

1. 服务器端口（默认 8080）
2. 数据库模式（SQLite 零配置 / MySQL）
3. 管理员账号密码
4. JWT 密钥（留空则每次启动自动生成，重启后玩家需重新登录）

提交后配置写回 `config/application.yml`，服务器**自动重启**生效，`/install` 向导随之卸载。注意：向导会把监听地址 `server.host` 一并写为 `0.0.0.0`（对外网卡可访问）；仅需本机访问请装完改回 `127.0.0.1` 再重启（公网运行务必先换默认管理员凭据，见下文警告）。若要重新安装，清空 `config/application.yml` 中 `jwt.secret` 后重启即可。

## 配置文件初始化

`application.yml` 中的注释即为配置说明；核心机制如下：

- **首次启动自动释放**：若 jar 同级 `config/application.yml` 不存在，会从 jar 内置模板自动释放一份；之后以外部文件为准、与内置默认值合并（外部优先）。
- `config/adapters.json`（消息通道实例配置）在首次启动时自动生成：默认启用 **`onebot-default`**（OneBot WebSocket 服务端，`ws://0.0.0.0:6700/onebot`），并含一个默认停用的 `minecraft-default` 实例。修改该文件可在管理台或重启后生效。
- `config/blacklist.yml`、`config/onebot_group_config.yml` 缺失时从内置默认值释放；`config/experimental.yml`、`config/realm_config.json` 等由服务器在启动时释放到 `config/`。

运行目录结构示例：

```
xiuxian.db                 # SQLite 数据库文件（SQLite 模式，路径由 database.sqlite_path 配置）
config/                    # 配置文件：application.yml、adapters.json、blacklist.yml、
                           #   onebot_group_config.yml、experimental.yml、realm_config.json
plugins/                   # 插件目录（放入 *.jar 自动加载）
data/players/              # 玩家数据文件（一用户一 JSON，player-data.enabled=true 时）
log/                       # 日志目录（logging.dir）
mc_server/                 # Minecraft 内嵌服务器工作目录（启用该适配器时）
```

### 选择数据库模式

在 `config/application.yml` 的 `database` 段修改：

```yaml
database:
  type: sqlite            # sqlite（默认，零依赖）| mysql
  sqlite_path: xiuxian.db # SQLite 模式下的数据库文件
  # url: jdbc:mysql://localhost:3306/xiuxian?...  # 仅 mysql 模式
  # username: root                                  # 仅 mysql 模式
  # password: root                                  # 仅 mysql 模式
```

- **SQLite（推荐，单机零依赖）**：修改 `type: sqlite` 即用，驱动已内置；
- **MySQL**：修改 `type: mysql` 并填写 `url / username / password`，需提前创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS xiuxian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

连接地址为本机（localhost / 127.0.0.1）时，服务端会自动尝试拉起本机 MySQL 服务（`MySqlLauncher`）；远程地址则直接连接。

## 管理后台

- 默认管理员账号为 `admin`，密码为 `config/application.yml` 中 `admin.password_hash` 对应的 bcrypt 哈希（模板默认值即 `admin123` 的哈希）；
- 更安全的做法是使用**安装向导**设置管理员账号密码，或自行用 bcrypt 生成新哈希替换 `admin.password_hash`；
- 将监听地址改为公网绑定（`server.host` 非 127.0.0.1）前，务必更换默认管理员凭据与 JWT 密钥，服务器会在检测到默认凭据 + 公网绑定时打印强警告。

登录后进入 `http://127.0.0.1:8080/admin/`，可管理玩家、用户角色、数据发放、兑换码、称号、插件、适配器、实时日志与统计等。

## 访问入口

| 服务 | 地址 | 说明 |
|------|------|------|
| 安装向导（首次） | `http://127.0.0.1:8080/install` | 完成安装后自动卸载 |
| REST API | `http://127.0.0.1:8080/api/` | 认证方式与接口详见 REST API 文档 |
| WebSocket | `ws://127.0.0.1:8080` | 游戏实时网关 |
| Web 管理控制台 | `http://127.0.0.1:8080/admin/` | 管理员登录 |
| OneBot QQ | `ws://127.0.0.1:6700/onebot` | **WebSocket 服务端**，由 `config/adapters.json` 默认实例提供 |
| Minecraft MOTD | `127.0.0.1:25565` | `motd.port`，服务器列表预览 |

以上地址均为默认值，端口与监听地址见 `config/application.yml`（`server`、`motd` 等段）与 `config/adapters.json`。

## 常见玩法接入

- **REST / WebSocket 客户端库**：`com.mtxgdn.client` 提供 `ApiClient` / `AuthApi` / `GameApi` / `GameWebSocketClient`，可直接对接 REST 与实时网关（详见 [REST API](../dev/rest-api) 与 [WebSocket 协议](../dev/websocket)）；
- **QQ 指令**：在 QQ 私聊中发送 `/注册 <角色名>` 即可注册绑定并创建角色，之后在群聊 / 私聊中使用 `/` 开头的指令游玩（如 `/修炼`、`/突破`、`/探索`、`/帮助`），全部指令支持中英文别名（详见 [QQ 机器人指令](../dev/qq-commands)）；
- **OneBot 接入**：默认启用的 `onebot-default` 实例以 WebSocket **服务端**模式监听 `0.0.0.0:6700/onebot`，Lagrange / LLOneBot 等 OneBot 实现以客户端方式连接后即可收发消息与指令；
- **QQ 官方机器人**：需在 `config/adapters.json` 添加 `type: qq` 的实例并配置 AppID / ClientSecret（Webhook 回调端口须为 80 / 443 / 8080 / 8443 之一，详见 [适配器与外部接入](../dev/adapters)）。

## 运行测试

```bash
mvn test                 # 或 run_tests.bat / run_tests.sh
```

仓库测试脚本依次编译并运行安全测试（`SecurityTest`）与全功能测试（`ComprehensiveFunctionalTest`）两个套件。

## 下一步

- 了解全部玩法：[玩家指南](../player/spiritual-root)
- 阅读 API 文档：[REST API](../dev/rest-api)、[WebSocket 协议](../dev/websocket)、[QQ 机器人指令](../dev/qq-commands)
- 配置文件细节：[配置说明](../dev/config)
