# 安装与首次启动

## 系统要求

| 项目 | 要求 |
| --- | --- |
| Java | **JDK 23 或更高**（编译目标为 Java 23） |
| 内存 | 建议 ≥ 1 GB 可用；低配机器可用 `-Xmx256m` 运行 |
| 磁盘 | 约 100 MB（含 jar 与数据库） |
| 端口 | `8080`（HTTP/管理后台）、`25565`（MOTD 预览），以及 OneBot/Minecraft 通道各自的端口 |

::: warning 必须是 JDK，不是 JRE
服务端在 Java 23 上编译。用更低版本的 Java 启动会直接报
`UnsupportedClassVersionError`。
:::

## 方式一：一键脚本（推荐）

仓库根目录提供了开箱即用的脚本。

### Windows

```bat
install.bat
```

脚本会依次检查 Java 版本、构建（首次）、启动服务端，然后提示你打开安装向导。

| 参数 | 作用 |
| --- | --- |
| `install.bat` | 首次安装并启动（随后在浏览器完成配置） |
| `install.bat --build` | 强制重新构建后再启动 |
| `install.bat --nogui` | 无交互模式启动（按 `Ctrl+C` 停止） |
| `install.bat --help` | 查看帮助 |

低配机器用：

```bat
start-low-memory.bat
```

### Linux / macOS

```bash
./install.sh
```

日常启动用 `start.sh`：

```bash
./start.sh                          # 默认 JVM 参数
./start.sh --nogui                  # 无交互模式
./start.sh /path/to/main-*.jar      # 指定 jar
XIUXIAN_MEM=-Xmx256m ./start.sh     # 低内存
JAVA_OPTS="-Xmx1g" ./start.sh       # 自定义 JVM 参数
```

`start.sh` 的默认 JVM 参数是 `-Xms128m -Xmx512m`，编码强制 UTF-8。

::: tip 一定要在 jar 所在目录启动
数据库文件、`config/`、`data/`、`log/` 等**相对路径**都相对于**进程工作目录**解析。
`start.sh` 已经做了 `cd "$(dirname "$0")"`，手动用 `java -jar` 启动时请自己先 `cd` 过去。
:::

## 方式二：手动构建

```bash
mvn clean package -DskipTests
```

产物：

```
target/main-V1.4.1-beta2.jar
```

这是一个 shaded 可执行 jar（`Main-Class: com.mtxgdn.Main`），直接运行即可：

```bash
java -Xms128m -Xmx512m -Dfile.encoding=UTF-8 -jar target/main-V1.4.1-beta2.jar
```

::: tip 构建环境
需要 Maven 与 JDK 23。若 `JAVA_HOME` 指向更低版本，请显式指定：

```bash
JAVA_HOME=/path/to/jdk-23 mvn clean package -DskipTests
```
:::

## 启动参数

| 参数 | 作用 |
| --- | --- |
| `--nogui` | 无交互模式：不启动控制台交互界面，适合 systemd / 后台运行 |
| `--demo` | 演示模式：启动后打印演示信息并退出，用于快速验证环境 |
| （无参数） | 交互模式：提供控制台命令界面 |

## 首次启动：安装向导

第一次启动时，服务端检测到**尚未安装**（`config/.installed` 锁文件不存在，
且 `jwt.secret` 未配置），会额外挂载安装向导，并在控制台打印：

```
======================================================
  🔧 首次启动检测：尚未完成安装
  📖 请在浏览器打开安装向导: http://127.0.0.1:8080/install
  （配置管理员账号、数据库与 JWT 密钥，一键完成安装）
======================================================
```

用浏览器打开 `http://127.0.0.1:8080/install`，按向导填写：

| 步骤 | 填写内容 |
| --- | --- |
| 数据库 | 选 SQLite（零配置）或 MySQL（填连接串/账号/密码） |
| 管理员 | 管理后台账号与密码 |
| 密钥 | `jwt.secret`（玩家 Token 签名密钥） |
| 邮件（可选） | SMTP 信息，用于发送注册验证码 |

配置完成后向导会调用 `POST /install/configure` 写回 `config/application.yml`，
并**自动重启服务端**（`POST /install/restart`）使配置生效。

### 安装锁文件

安装完成的标志是 `<jar目录>/config/.installed` 这个锁文件被创建。
它的作用是：**装完之后不再暴露安装向导**，避免他人重新配置你的服务器。

::: danger 想重新安装
删除 `config/.installed` 后重启即可让安装向导重新出现：

```bash
rm config/.installed
```

但这也会让**任何能访问该端口的人**都能重新配置服务器。
生产环境请在安装完成后确认该文件存在，并做好网络访问控制。
:::

## 启动成功的判定

启动过程中会依次打印这些日志（顺序固定）：

```
[Config] 配置加载完成 (N 项)
服务器正在启动...
正在初始化默认技能...
正在初始化默认功法...
正在初始化默认配方...
正在扫描并注册物品...
正在检查装备数据一致性...
正在扫描并注册秘境...
正在扫描并注册游历事件...
正在扫描并注册命令...
正在初始化插件系统...
管理控制台启动在 http://127.0.0.1:8080/admin/
```

看到 **`管理控制台启动在 ...`** 就说明 HTTP 服务已就绪。
若还处于首次启动，紧接着会打印安装向导提示。

::: tip 从旧版本升级时
会额外看到数据库迁移日志，以及（如果存在历史挂单）坊市到期回收的批量处理日志。
这是正常的，详见[生产部署与升级](/guide/deploy)。
:::

## 访问入口

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| Web 管理控制台 | `http://127.0.0.1:8080/admin/` | 玩家管理、插件开关、数据库、日志、坊市等 |
| 安装向导 | `http://127.0.0.1:8080/install` | 仅未完成安装时可用 |
| REST API | `http://127.0.0.1:8080/api/` | 玩家侧与游戏接口 |
| 管理 API | `http://127.0.0.1:8080/api/admin/` | 管理后台后端接口 |
| MOTD 预览 | `127.0.0.1:25565` | Minecraft 服务器列表预览（非真实 MC 服务器） |

## 首次启动后生成的文件

```
<jar 所在目录>/
├── main-V1.4.1-beta2.jar
├── config/
│   ├── application.yml          ← 自动从 jar 释放
│   ├── plugins.yml              ← 插件开关
│   ├── adapters.json            ← 消息通道实例配置
│   ├── blacklist.yml
│   ├── onebot_group_config.yml
│   └── .installed               ← 安装完成锁文件
├── data/players/                ← 玩家数据 JSON
├── log/                         ← 日志
├── plugins/                     ← 第三方插件 jar
├── mc_server/                   ← 内置 Minecraft 服务端工作目录
└── xiuxian.db                   ← SQLite 数据库（type=sqlite 时）
```

::: tip 接下来
装好了就去看[配置详解](/guide/config)调整端口与密钥，
再看[插件开关](/guide/plugins)决定开哪些玩法。
:::
