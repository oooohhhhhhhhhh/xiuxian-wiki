# 部署指南

## 环境要求

| 依赖 | 版本 |
|------|------|
| JDK | **23** 或更高 |
| Maven | 3.8+（仅构建需要） |
| MySQL | 8.0+（可选，SQLite 模式零依赖） |

## 构建

```bash
mvn clean package -DskipTests
```

产物：`target/main-V1.4.1-beta1.jar`（可执行 fat-jar）。

## 运行

```bash
java -jar target/main-V1.4.1-beta1.jar
```

| 参数 | 说明 |
|------|------|
| `--demo` | 演示模式（交互式 DemoClient） |
| `--nogui` | 后台常驻运行 |
| `--plugin-make` / `--plugin-make-gui` | 插件生成器（不启动服务器） |

> 默认交互模式按 Enter 关闭；推荐生产环境使用 `--nogui` + 守护进程（systemd / nssm / Windows 计划任务）。

## 跨平台部署（Windows / Linux / macOS）

服务端为纯 Java 23 应用，**一套 fat-jar 三平台通用**（SQLite JDBC 自带各平台原生库）。部署差异如下：

### 运行脚本

| 平台 | 脚本 | 说明 |
|------|------|------|
| Linux / macOS | `./start.sh` | 自动定位 `target/main-*.jar`；支持 `JAVA_OPTS` / `XIUXIAN_MEM`（如 `XIUXIAN_MEM=-Xmx256m` 低内存）；`./start.sh /path/to.jar --nogui` |
| Windows | `start-low-memory.bat` / `java -jar target/main-*.jar --nogui` | |

### 工作目录要求（重要）

- **配置文件**（`application.yml`、`realm_config.json` 等）按 **JAR 所在目录**的 `config/` 解析
- **数据库文件、`data/`、`log/`、`plugins/`、`config/adapters.json`** 按**当前工作目录（CWD）**解析
- 因此**必须从 JAR 所在目录启动**（或 systemd 设置 `WorkingDirectory`），否则数据会散落到别处
- 启动时服务端会打印「部署路径」报告（JAR 目录 / 工作目录 / 各数据路径），目录不一致时输出警告

Linux systemd 单元示例：

```ini
[Service]
ExecStart=/opt/xiuxian/start.sh --nogui
WorkingDirectory=/opt/xiuxian
Restart=always
User=xiuxian
```

### 平台差异

| 项目 | Windows | Linux / macOS |
|------|---------|---------------|
| 本地 MySQL 自动拉起 | ✅ 自动搜索 mysqld.exe 并启动 | ✅ 优先 `systemctl start mysql\|mysqld\|mariadb`（回退 `service` / `brew services`），失败再直接拉起 `mysqld`/`mariadbd`（搜索 /usr/sbin 等常见路径）；找不到或权限不足时给出明确提示 |
| OneBot 截图模拟模式 | ✅ 可用（需桌面 GUI） | ❌ 无头服务器不可用（java.awt.Robot 初始化失败，仅影响该实验功能） |
| Minecraft 插件构建 | `build-mc-plugin.bat` / `build-mc-agent.bat` | 需手动用 `jar`/`javac` 构建（脚本仅 Windows）；运行时进程管理为跨平台 ProcessBuilder |
| 日志文件 | `log/server-*.log`（UTF-8） | 同左（Main 强制 `file.encoding=UTF-8`） |

### 其他

- **JDK 23+**（编译目标 23；Linux 建议用发行版 OpenJDK 23）
- 端口：REST/WebSocket `8080`、OneBot `6700`、MOTD `25565`、QQ官方 webhook 仅 80/443/8080/8443
- 反向代理（Nginx/Caddy）为 WebSocket 与 QQ官方 webhook 配置时注意 `Upgrade` 头与路径透传

## 数据库选择

### SQLite（推荐单机 / 测试）

```yaml
database:
  type: sqlite
  sqlite_path: xiuxian.db
```

### MySQL（生产）

```sql
CREATE DATABASE IF NOT EXISTS xiuxian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```yaml
database:
  type: mysql
  url: jdbc:mysql://localhost:3306/xiuxian?useUnicode=true&characterEncoding=UTF-8&connectionCollation=utf8mb4_unicode_ci
  username: root
  password: 你的密码
```

## 首次启动

1. 启动后自动建表、写入默认技能 / 功法 / 配方、扫描注册游戏内容
2. 释放配置文件到运行目录 `config/`（`realm_config.json`、`experimental.yml`、`blacklist.yml`、`onebot_group_config.yml`、`adapters.json`、`newbie_reward.json`）
3. 配置管理后台账号：

```yaml
admin:
  username: admin
  password: admin123        # 请修改为强密码！
```

> 未配置 admin 账号时，管理后台回退到**数据库用户认证**（拥有 admin.login 权限或 ADMIN/SUPER_ADMIN/MODERATOR 角色的用户可登录）。

4. 访问 `http://<服务器IP>:8080/admin/` 登录管理后台

## 安全建议

- **监听地址**：服务端硬编码监听 `0.0.0.0:8080`（所有网卡）。生产环境务必通过防火墙 / 反向代理限制访问
- 修改 `jwt.secret` 为强随机密钥（否则重启后所有登录令牌失效）
- 修改 OAuth2 默认 `client_secret`
- 关闭不必要的实验功能（`experimental.yml`）
- 玩家自助还原默认关闭（`player-data.self-restore: false`）

## 常用运维

| 操作 | 方式 |
|------|------|
| 实时日志 | 管理后台「实时日志」或 `log/server-*.log` |
| 备份数据库 | 管理后台「数据库 → 备份下载」（全库 JSON） |
| 导出玩家数据 | 管理后台 / `/api/admin/player-data/export-all` |
| 重置数据 | `/清除玩家数据` 或 `/重置全部数据`（管理指令） |
| 热重载插件 | `POST /api/admin/plugins/reload/{name}` 或 `plugins.hot_swap=true` |
| 全服公告 | `POST /api/admin/announce` |

> 注：全库「导入」功能为占位实现；玩家级还原请使用 `PlayerDataService`（`/api/admin/player-data/restore/{playerId}`）。

## 接入配置

- **QQ 机器人**：默认 OneBot WebSocket 服务端 `ws://0.0.0.0:6700/onebot`（Lagrange / LLOneBot 等以客户端接入）；也可配置 `onebot-client` 或 `qq`（官方）适配器，详见 [适配器与外部接入](./adapters)
- **Minecraft**：启用 `minecraft` 适配器（自动拉起 MC 服务端 + 注入 Agent / 桥接插件），MOTD 端口 25565
- **邮件**：配置 `smtp` 段用于注册验证码

## 相关文档

- [配置说明](./config)
- [适配器与外部接入](./adapters)
- [架构总览](./architecture)
