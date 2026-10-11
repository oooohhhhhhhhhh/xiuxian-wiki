# 配置详解

服务端的配置由 **`config/` 目录**下的若干文件组成。本页说明每个文件的作用、
`application.yml` 的加载与合并规则，以及哪些配置需要重启才能生效。

配置项的**完整清单**（含默认值）见[配置项全表](/reference/config-keys)。

## config/ 目录

| 文件 | 作用 | 是否必需 |
| --- | --- | --- |
| `application.yml` | 主配置：端口、数据库、密钥、管理后台、SMTP、季节、坊市等 | 否，缺失时自动从 jar 释放模板 |
| `plugins.yml` | 内置插件/玩法模块与消息通道的启停开关 | 否，缺失时按默认值（全部启用） |
| `adapters.json` | 消息通道**实例**配置（OneBot/Minecraft 的地址、端口、令牌） | 是（使用对应通道时） |
| `blacklist.yml` | 聊天黑名单词表 | 否 |
| `onebot_group_config.yml` | 按群的功能开关与配置 | 否 |

::: tip 文件从哪来
服务端启动时会检查这些文件是否存在，**不存在就自动从 jar 内置模板释放一份**，
所以首次运行不需要手工创建。
:::

## 配置是怎么加载的

理解这一点很重要，它决定了**升级后要不要手工补配置**。

```
① 定位 jar 所在目录        getJarDir()
        ↓
② 外部配置路径              <jar目录>/config/application.yml
        ↓  不存在？
   从 jar 内置模板释放一份
        ↓
③ base     = jar 内置的 application.yml      （作为基底）
   external = config/application.yml         （你的修改）
        ↓
④ deepMerge(base, external)                  ← 逐键深度合并，external 覆盖 base
        ↓
⑤ 冻结为不可变 Map，供全程序读取
```

`AppConfig` 的静态初始化块正是这五步。合并是**逐键**进行的：

- 你在外部文件里写了的键 → 用你的值
- 你没写的键 → 保留内置模板的默认值
- 嵌套段（如 `database:`）按子键分别合并，不会整段覆盖

::: tip 这意味着升级是安全的
新版本在模板里**新增**的配置键（例如坊市功能新增的 `market.*` 三项），
升级后会自动生效并使用默认值，**你不需要手工把它们抄进 `config/application.yml`**。
:::

::: warning 但删除键不会生效
如果某个键在新版模板里被删掉了，而你的外部文件里还留着它，它依然会存在于合并结果中。
多余的键通常无害，但清理一下更清爽。
:::

### 配置在哪里被写回

少数功能会**修改**配置并写回 `config/application.yml`：

- **安装向导**（`/install`）写入数据库、管理员、密钥等初始配置
- **明文管理员密码**首次启动时被哈希为 `admin.password_hash`

::: danger 写回会重写整个文件，注释会丢失
写回使用的是 YAML 编辑器，它会重新序列化文件，
因此 `application.yml` 里的**注释和排版会丢失**。

如果你很在意注释，建议把自定义配置集中放在文件末尾，并另外留存一份带注释的副本。
:::

## 需要重启 vs 可以热更新

| 配置 | 生效方式 |
| --- | --- |
| `server.port`、`server.host` | **必须重启**（HTTP 监听在建服时绑定） |
| `database.*` | **必须重启**（连接池在启动时创建） |
| `jwt.secret` | **必须重启**；且改密钥会让所有已签发 Token 立即失效 |
| `logging.*`、`performance.*` | **必须重启** |
| `market.*` | **必须重启**（定时任务的周期在启动时读取） |
| 内置插件开关 | 可在 **WebUI「插件管理」**页运行时启停（会写回 `config/plugins.yml`） |
| 消息通道**实例**开关 | 见[消息通道与适配器](/dev/adapters)（支持热重载） |

## 几个容易踩的坑

::: danger 一、jwt.secret 留空
留空时**每次启动随机生成**，重启后所有玩家 Token 失效、必须重新登录。
生产环境务必固定一个至少 256 位的随机串：

```bash
openssl rand -base64 48
```
:::

::: danger 二、默认管理员密码是 admin123
模板里的 `admin.password_hash` 对应明文 `admin123`。上线前请通过安装向导重新设置。
:::

::: warning 三、默认只监听 127.0.0.1
`server.host` 默认 `127.0.0.1`，外网访问不了。需要对外提供服务时改成 `0.0.0.0`，
并自行配置反向代理、防火墙与 HTTPS。
:::

::: warning 四、SMTP 密码是授权码，不是登录密码
QQ 邮箱等服务的 `smtp.password` 填的是**授权码**。
填错会导致注册验证码发送失败（若 `verify_code.enabled=true`，玩家将无法注册）。
:::

::: tip 五、只想要 SQLite 就什么都别改
`database.type` 默认 `sqlite`，数据库就是 jar 同目录下的 `xiuxian.db`，零配置。
只有要多机/高并发时才需要切到 MySQL。
:::

## 改配置的正确姿势

1. 停止服务端
2. 备份：`cp -r config config.bak.$(date +%F)`（Windows 用 `xcopy /E /I config config.bak`）
3. 编辑 `config/application.yml`，**只写你要改的键**，不必抄全量
4. 启动服务端，看日志里的 `[Config] 配置加载完成 (N 项)` 确认加载成功
5. 核对功能是否按预期生效

::: tip 校验配置是否被读到
启动日志会打印 `[Config] 已加载外部配置: <绝对路径>`。
如果这行没出现，说明服务端没找到你的 `config/application.yml` ——
通常是把文件放到了错误的工作目录（它必须和 jar 在同一目录下）。
:::
