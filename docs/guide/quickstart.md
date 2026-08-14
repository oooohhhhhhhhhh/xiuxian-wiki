# 快速开始

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| JDK | **23** 或更高 |
| Maven | 3.8+（构建用） |
| MySQL | 8.0+（使用 MySQL 模式时，需创建数据库 `xiuxian`） |
| SQLite | 3.x（零配置，驱动已内置） |

## 获取源码

```bash
git clone https://github.com/oooohhhhhhhhhh/xiuxiangame.git
cd xiuxiangame
```

## 选择数据库模式

配置文件位于 `src/main/resources/application.yml`，通过 `database.type` 一行切换。

### MySQL 模式

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

> 连接本地 MySQL 时服务端会自动尝试拉起 MySQL 服务（`MySqlLauncher`）；远程地址则直接连接。

### SQLite 模式（推荐，零依赖）

```yaml
database:
  type: sqlite
  sqlite_path: xiuxian.db
```

> 切换 `type` 字段即可在 MySQL 与 SQLite 之间切换，无需改动任何代码。

## 构建

```bash
mvn clean package -DskipTests
```

构建产物为可执行 fat-jar：`target/main-V1.4.1-beta1.jar`。

## 运行

```bash
java -jar target/main-V1.4.1-beta1.jar
```

启动流程：初始化数据库 → 写入默认技能 / 功法 / 配方 → 扫描注册物品、秘境、游历事件、指令 → 加载插件（`./plugins` 目录）→ 启动 HTTP / WebSocket / 管理后台 / OneBot / Minecraft MOTD → 释放配置文件到运行目录。

### 启动参数

| 参数 | 说明 |
|------|------|
| `--demo` | 启动交互式演示客户端（DemoClient），服务关闭时自动退出 |
| `--nogui` | 无 GUI 模式，后台常驻运行 |
| `--plugin-make` | 启动插件生成器命令行向导（不启动服务端） |
| `--plugin-make-gui` | 启动插件生成器图形化界面（不启动服务端） |

> 默认交互模式：按 **Enter** 键关闭服务器。关闭时依次停止适配器、答题器、WebSocket、MOTD，并同步玩家数据文件、关闭数据库连接池。

## 访问入口

| 服务 | 地址 |
|------|------|
| REST API | `http://127.0.0.1:8080/api/` |
| WebSocket | `ws://127.0.0.1:8080` |
| Web 管理控制台 | `http://127.0.0.1:8080/admin/` |
| OneBot QQ | `ws://127.0.0.1:6700/onebot`（ws_server 模式） |
| Minecraft MOTD | `127.0.0.1:25565` |

## 管理后台

管理后台需要先在 `application.yml` 中配置账号密码：

```yaml
admin:
  username: admin
  password: admin123
```

访问 `http://127.0.0.1:8080/admin/` 登录。功能模块包括：总览、实时日志、玩家管理、用户角色、数据发放、兑换码、称号、适配器、统计、我的资料等。

## 运行目录结构

服务启动后会在运行目录生成 / 释放以下内容：

```
xiuxian.db                 # SQLite 数据库（SQLite 模式）
config/                    # 释放的配置：blacklist.yml、onebot_group_config.yml、experimental.yml、realm_config.json
plugins/                   # 插件目录（放入 *.jar 自动加载）
data/                      # 运行时数据
  players/                 # 玩家数据文件（一用户一个 JSON，player-data.enabled=true 时）
log/                       # 日志目录
```

## 下一步

- 创建第一个账号与角色：[账号与角色](./overview#接入方式) 或直接通过 QQ 机器人 `/register <角色名>`
- 了解全部玩法：[玩家指南](../player/spiritual-root)
- 阅读 API 文档：[REST API](../dev/rest-api)、[WebSocket 协议](../dev/websocket)
