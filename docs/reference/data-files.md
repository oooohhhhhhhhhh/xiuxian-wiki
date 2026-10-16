# 数据与配置文件

本页列出服务端读写的**全部文件**，以及它们各自的**路径解析基准**。

::: danger 先记住这条：有的路径按 jar 目录，有的按工作目录
这是部署时最容易踩的坑：

| 基准 | 文件 |
| --- | --- |
| **JAR 所在目录** | `config/application.yml`、`config/plugins.yml` |
| **当前工作目录（CWD）** | `config/adapters.json`、`xiuxian.db`、`data/`、`log/`、`plugins/` |

**所以请始终从 jar 所在目录启动服务端**，否则上面两类文件会分裂到两个地方。

服务端启动时会自检并告警：

```
JAR 目录: /opt/xiuxian
工作目录: /root
配置文件目录: /opt/xiuxian/config
⚠ 工作目录与 JAR 目录不一致：config/adapters.json、数据库文件、data/、log/、plugins/ 等
  相对路径会落在工作目录（/root）。建议从 JAR 所在目录启动，或（Linux systemd）设置
  WorkingDirectory=/opt/xiuxian
```
:::

## 一、jar 内部资源

打包在 jar 里，**只读**（运行时不修改）：

| 路径 | 用途 |
| --- | --- |
| `application.yml` | 配置**模板**，首次启动释放到 `config/application.yml` |
| `plugins.yml` | 插件开关**模板**，首次启动释放到 `config/plugins.yml` |
| `built_in_plugins.yml` | ⚠️ **旧版模板**，全部注释掉，**不是权威来源** |
| `plugin.yml` | Minecraft 桥接插件的 Bukkit 描述文件（不是本服务端的配置） |
| `config/blacklist.yml` | 默认黑名单 |
| `config/onebot_group_config.yml` | 默认 OneBot 群配置 |
| `game/realm_config.json` | 境界配置（11 大境界 / 29 档位） |
| `install/index.html` | 安装向导页面 |
| `webadmin/**` | 管理后台静态资源 |
| `plugin-template/**` | 外部插件脚手架模板 |
| `data/quiz/` | 答题数据目录 |

::: warning `built_in_plugins.yml` 已废弃
它是旧版本的插件开关文件，内容**全部被注释掉**（16 条）。

现在权威的开关文件是 **`plugins.yml`**（30 个键）。
如果你在 `built_in_plugins.yml` 里改开关，**不会生效**。

`plugins.yml` 的注释里也写明了取值优先级：
`config/plugins.yml` > jar 内模板 > 旧配置只读兜底
（`application.yml` 的 `built_in_plugins.*` 与 `config/experimental.yml` 的 `experimental.*`）。
:::

## 二、运行目录文件

### 配置类

| 文件 | 路径基准 | 是否自动生成 | 说明 |
| --- | --- | --- | --- |
| `config/application.yml` | **JAR 目录** | ✅ 从 jar 模板释放 | 主配置 |
| `config/plugins.yml` | **JAR 目录** | ✅ 从 jar 模板释放 | 插件开关 |
| `config/adapters.json` | **工作目录** | ✅ 写默认配置 | 消息通道实例 |
| `config/.installed` | 工作目录 | 安装完成时创建 | 安装锁 |
| `config/experimental.yml` | 同 `plugins.yml` 的父目录 | ❌ | **旧版**实验性开关，可删 |

::: tip 旧配置会自动迁移
从旧版本升级时，`application.yml` 的 `built_in_plugins.*` 与
`config/experimental.yml` 的 `experimental.*` 会被**自动迁移**到 `plugins.yml`。

迁移完成后这两个旧位置就只是只读兜底，文件本身可以自行清理。
:::

### 数据类

| 路径 | 路径基准 | 说明 |
| --- | --- | --- |
| `xiuxian.db` | 工作目录 | SQLite 数据库（`database.sqlite_path`，默认 `xiuxian.db`） |
| `data/` | 工作目录 | 插件共享数据目录（`PluginContext.createSharedContext(new File("data"), ...)`） |
| `data/players/` | 工作目录 | 玩家数据文件化落盘（`player-data.dir`） |
| `log/` | 工作目录 | 日志输出目录（`logging.dir`，默认 `log`） |
| `plugins/` | 工作目录 | 外部插件 jar（`pm.init(new File("plugins"))`） |

::: warning 日志目录是 `log`，不是 `logs`
`GameLogger.logDir` 默认值是 **`log`**（单数），由 `logging.dir` 配置。
:::

### 玩家数据文件化

由 `player-data.*` 控制：

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `player-data.enabled` | `true` | 是否启用玩家数据文件化落盘 |
| `player-data.dir` | `data/players` | 数据文件存放目录 |
| `player-data.auto-sync-seconds` | `30` | 变更数据定期落盘间隔（秒），`0` 关闭自动同步 |
| `player-data.self-restore` | `false` | 是否允许玩家用导出文件自助恢复（默认关闭，防刷） |

::: danger `self-restore` 默认关闭是有意的
开启后玩家可以上传自己的导出文件覆盖服务端数据，**存在被篡改刷取的风险**。
除非你完全信任玩家，否则保持 `false`，需要恢复时由管理员走
`POST /api/game/player/data/restore`。
:::

## 三、配置加载流程

`AppConfig` 的静态初始化块按以下顺序执行：

```java
static {
    Path jarDir = getJarDir();
    Path externalPath = jarDir.resolve("config").resolve("application.yml");

    if (!Files.exists(externalPath)) {
        extractConfigFromClasspath(externalPath);      // ① 缺文件就释放模板
    }

    Map<String, Object> base = loadClasspathOrDefault();   // ② jar 内模板
    Map<String, Object> external = loadExternal(externalPath); // ③ 外部文件
    Map<String, Object> merged = deepMerge(base, external);    // ④ 合并

    config = Collections.unmodifiableMap(new LinkedHashMap<>(merged));
}
```

| 步骤 | 行为 |
| --- | --- |
| ① 自动释放 | `config/application.yml` 不存在时，从 jar 内复制一份（`REPLACE_EXISTING`） |
| ② 读模板 | 读 jar 内 `application.yml` |
| ③ 读外部 | 读 `<jar目录>/config/application.yml` |
| ④ 深合并 | **逐键覆盖**，外部优先；嵌套 Map 递归合并 |

### `getJarDir()` 怎么算

```java
String jarPath = AppConfig.class.getProtectionDomain()
        .getCodeSource().getLocation().toURI().getPath();
File jarFile = new File(jarPath);
File parent = jarFile.isDirectory() ? jarFile : jarFile.getParentFile();
```

| 运行方式 | CodeSource | 得到的 jarDir |
| --- | --- | --- |
| `java -jar main-*.jar` | `.../main-*.jar` | jar 所在目录 |
| IDE / `mvn exec` | `.../target/classes/` | **`target/`** |
| `mvn test` | `.../target/test-classes/` | **`target/`** |

::: warning 开发环境下配置落在 `target/config/`
用 IDE 直接跑时，`getJarDir()` 返回 `target/`，
所以配置会读写成 `target/config/application.yml`。

这是**符合预期**的行为，但意味着你在项目根目录改 `config/application.yml` 不会生效。
:::

### 键的扁平化

加载时会把嵌套结构**拍平成点号键**：

```yaml
server:
  host: 127.0.0.1
  port: 8080
```

变成 `server.host` / `server.port`，用 `AppConfig.get("server.port")` 读取。

::: warning YAML 列表会变成逗号分隔字符串
```yaml
verify_code:
  allowed_domains:
    - qq.com
    - 163.com
```

读取时是 `"qq.com,163.com"`（一个字符串），不是 List。

代码里按 `split(",")` 解析。所以**列表项本身不能含逗号**。
:::

### 所有值都是字符串

`flatten()` 对叶子节点统一调 `value.toString()`，
所以读的时候要用带默认值的类型化方法：

| 方法 | 说明 |
| --- | --- |
| `get(path)` | 返回 `String`，不存在返回 `null` |
| `get(path, default)` | 带默认值 |
| `getInt(path, default)` | 解析失败或为空时返回默认值 |
| `getBoolean(path, default)` | **只有** `"true"`（忽略大小写）算 `true`，其余一律 `false` |
| `hasKeyPrefix(prefix)` | 是否存在某前缀的键（旧配置检测用） |

::: danger `getBoolean` 对非法值静默返回 false
`getBoolean("x", true)` 在配置写成 `x: yes` 时返回 **`false`**（不是 `true`），
因为判定逻辑是 `"true".equalsIgnoreCase(value)`。

YAML 里请写 `true` / `false`，不要写 `yes` / `no` / `1` / `0`。
:::

## 四、写回配置

`AppConfig.update(Map<String, Object> updates)` 会把改动写回
`<jar目录>/config/application.yml`。

::: tip 写回是"行级替换"，注释不会丢
早期版本用 SnakeYAML 整文件 dump，**会丢掉所有注释**并按默认风格重排。

现在改用 `YamlFileEditor` 做**行级值替换**：

- 只改目标键的值，保留原有注释、空行、缩进
- 键不存在时追加到对应父节末尾（父节也没有就追加到文件末尾）
- 写盘用**临时文件 + rename**，避免半截写入

`null` 值表示**删除该键所在行**（含紧随其后的缩进更深的注释延续行）；
空字符串表示写入 `''`。
:::

安装向导与管理后台修改配置时走的就是这条路径。

## 五、部署检查清单

| 检查项 | 命令 / 位置 |
| --- | --- |
| 工作目录 = jar 目录 | 看启动日志的 `JAR 目录` 与 `工作目录` 是否相同 |
| 配置已生成 | `ls config/` 应有 `application.yml`、`plugins.yml` |
| 数据库就位 | `ls -lh xiuxian.db`（SQLite） |
| 日志在写 | `tail -f log/*.log` |
| 插件开关 | `config/plugins.yml` 的 30 个键 |
| 通道实例 | `config/adapters.json` 的 `enabled` |
| 安装锁 | `config/.installed` 存在表示已安装完成 |

::: tip systemd 部署务必设 WorkingDirectory
```ini
[Service]
WorkingDirectory=/opt/xiuxian
ExecStart=/usr/bin/java -jar /opt/xiuxian/main-0.1.0.jar
```

不设的话 `data/`、`log/`、`xiuxian.db` 会落到 `/`（或 systemd 的默认目录），
和你的配置文件分家。
:::

## 六、备份要备什么

| 优先级 | 路径 | 说明 |
| --- | --- | --- |
| 🔴 必须 | `xiuxian.db` | 全部玩家数据（SQLite 时） |
| 🔴 必须 | `config/application.yml` | 含 `jwt.secret`、管理员密码哈希、数据库口令 |
| 🟡 建议 | `config/plugins.yml` | 插件开关 |
| 🟡 建议 | `config/adapters.json` | 通道配置 |
| 🟡 建议 | `data/` | 玩家数据文件化产物 |
| 🟢 可选 | `plugins/` | 外部插件 jar |
| 🟢 可选 | `log/` | 排查用 |

::: danger 用 MySQL 时数据库不在文件里
`database.type: mysql` 时数据全在 MySQL 服务端，
`xiuxian.db` 不会被使用（可能残留一个空文件）。

备份请用 `mysqldump`，别只备份目录。
:::

详见[部署与运维](/guide/deploy)。
