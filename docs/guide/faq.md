# 常见问题

本页汇总部署与运维中最常被问到的问题，每条给出**明确结论**，依据仓库源码而非猜测。
配置项含义见[配置详解](/guide/config)，升级与排障见[生产部署与运维](/guide/deploy)。

## 1. 改了 `config/application.yml` 为什么不生效？

按顺序排查三件事：

1. **文件位置对不对**。服务端读的是 **jar 所在目录下的 `config/application.yml`**
   （`AppConfig.getJarDir().resolve("config")`）。启动日志应有
   `[Config] 已加载外部配置: /opt/xiuxian/config/application.yml`；没有这行就是文件放错了位置。
2. **这个键是否需要重启**。`server.*`、`database.*`、`jwt.secret`、`logging.*`、
   `performance.*`、`market.*` 都只在**启动时读取一次**，必须重启进程。
3. **是不是被别的配置覆盖**。插件开关优先级是
   `config/plugins.yml` > jar 内模板 > `application.yml` 的旧 `built_in_plugins.*`。

**结论**：绝大多数"不生效"是①文件位置错，或②忘了重启。

## 2. 新版本的配置键要手工补吗？删掉的键为什么还在？

加载流程是「jar 内置模板作基底 → 外部文件逐键深度合并」：

- 外部文件**没写**的键 → 保留内置模板默认值。本版本新增的 `market.*` 三项自动生效。
- 外部文件**写了**的键 → 用你的值。即使新版模板已删掉该键，它依然存在于合并结果中。

**结论**：不用抄全量配置，只写你要改的键。多余的旧键通常无害，但建议清理。

## 3. `jwt.secret` 留空会怎样？

`JwtUtil.init(isInstallMode)` 的分支决定四种结局：

| 情况 | 结果 |
| --- | --- |
| 已配置且 ≥ 32 字节 | 正常启动，打印 `✓ JWT 密钥已从配置加载` |
| 已配置但 < 32 字节 | **拒绝启动**：`jwt.secret 长度不足！需要至少 32 字节` |
| 留空 + 未完成安装（无 `config/.installed`） | 生成**临时密钥**启动并打印安全警告 |
| 留空 + 已完成安装（`config/.installed` 存在） | **拒绝启动**：`jwt.secret 未配置！` → `System.exit(1)` |

::: danger 结论
在已安装的服务器上留空会导致**服务端起不来**，不是"随机生成后能用"。
用 `openssl rand -base64 48` 生成密钥。
:::

## 4. 换了 `jwt.secret` 后玩家全部要重新登录？

是的，且必然如此。JWT 用该密钥做 HMAC-SHA256 签名，换密钥后旧 Token 签名全部校验失败
（`JwtUtil.validateToken()` 返回 `false`）。

**结论**：密钥一旦确定就不要再改。Token 有效期 7 天，改密钥等同于强制全服重新登录。

## 5. 忘记管理员密码怎么办？怎么改管理台密码？

不需要知道旧密码。在本机编辑 `config/application.yml`：

```yaml
admin:
  username: admin
  password: 你的新密码          # 明文，首次启动会被自动哈希
  # 删掉 admin.password_hash 这一行
```

重启后 `AdminAuthFilter.initAdminPasswordHash()` 会把明文用 BCrypt 哈希，
**写回 `admin.password_hash` 并删除明文键**（一次性升级），之后用新密码登录。

**结论**：改 `admin.password` 明文 + 删掉 `admin.password_hash` + 重启。
注意 `POST /api/install/reset` 需要**提供当前管理员密码**，忘记密码时用不了，
而且它会删除整个 `config/application.yml` 与安装锁，**端口、数据库连接、
`jwt.secret` 全部丢失**。若两个 admin 凭据都为空，管理台会**回退到数据库用户认证**。

## 6. 怎么改端口？

| 端口 | 配置位置 | 键 |
| --- | --- | --- |
| HTTP / REST / WebSocket / 管理台 | `config/application.yml` | `server.port`（默认 8080） |
| OneBot QQ 通道 | `config/adapters.json` | 该实例的 `config.port`（默认 6700） |
| Minecraft MOTD 预览 | `config/application.yml` | `motd.port`（默认 25565） |
| 监听地址 | `config/application.yml` | `server.host`（默认 `127.0.0.1`） |

**结论**：`server.port` 改完必须**重启**（HTTP 监听在建服时绑定）；OneBot 端口在
`adapters.json` 里，改完可在管理台「适配器」页重载，不必重启进程。

## 7. 怎么让服务器只监听本机 / 对外提供服务？

- 只给本机（默认）：`server.host: 127.0.0.1`
- 对外：`server.host: 0.0.0.0`

对外暴露前必须①改掉默认管理员凭据（模板哈希对应明文 `admin123`）、
②配置固定且足够长的 `jwt.secret`，否则启动时会打印：

```
[Main] ⚠ 严重安全警告: 服务绑定到公网 (0.0.0.0) 但 admin 凭据未配置或仍为默认！
```

**结论**：生产推荐保持 `127.0.0.1`，前面挂 Nginx/Caddy 做 TLS 与转发
（WebSocket 需透传 `Upgrade` / `Connection` 头）。

## 8. 数据库文件在哪？

| 类型 | 位置 |
| --- | --- |
| `sqlite`（默认） | `database.sqlite_path`，默认 `xiuxian.db`，位于**进程工作目录**（正常即 jar 同目录） |
| `mysql` | `database.url` 指向的库，默认 `jdbc:mysql://localhost:3306/xiuxian` |

启动日志会明确打印 `=== 部署路径 ===` 与 `数据库: sqlite（xiuxian.db）`。

**结论**：`xiuxian.db`（+ `-wal` / `-shm`）在 jar 同目录下。数据库启用了
`PRAGMA journal_mode = WAL`，**停服后拷贝最稳**；在线拷贝要把三个文件一起拷。

## 9. 玩家数据 JSON 在哪？为什么数据库和 `data/players/` 里都有？

位置是 `player-data.dir`（默认 `data/players`），命名 `<playerId>.json`（一用户一个文件）。
写盘是"先写 `.json.tmp` 再原子改名"，不会读到半个文件。

**唯一事实来源是数据库**，JSON 只是导出快照：被标记为"脏"的玩家每
`player-data.auto-sync-seconds` 秒（默认 30）批量导出；停机钩子会 `flushDirty()` 再落一次；
也可用 `POST /api/game/player/data/export` 手动导出。

把 `player-data.enabled` 设为 `false` 或把 `auto-sync-seconds` 设为 `0` 可关掉它，
**不影响游戏运行**，只是失去 JSON 快照。

**结论**：`data/players/<玩家ID>.json`。改 JSON 不会影响游戏，要改数据请改数据库或走后台接口。

## 10. 怎么重置某个玩家的数据？

| 目标 | 做法 | 权限 |
| --- | --- | --- |
| 删掉角色（账号保留） | 「玩家」页删除，或 `DELETE /api/admin/players/{id}` | `admin.users.manage` |
| 改数值（血量、境界、灵石、经验…） | `POST /api/admin/players/{id}/edit` | `admin.users.manage` |
| 发物品 / 补奖励 | `POST /api/admin/players/{id}/give` | `admin.users.manage` |
| 改名字 / 改灵根 | `/players/{id}/rename`、`/players/{id}/spiritual-root` | `admin.users.manage` |
| 改任意表任意行 | 「数据库」页，或 `POST /api/admin/db/tables/{tableName}/{id}` | `admin.database.access` |
| 清空**全部**玩家数据 | `POST /api/admin/database/clear_players` | `admin.database.clear_players` |

`clear_players` 会 `DELETE FROM` 26 张玩家相关表（角色、物品、装备、技能、宗门成员、
坊市挂单、农田、洞府、阵法…），保留账号与配置，**没有回收站**，用前必须备份。

**结论**：单玩家用「玩家」页的编辑/删除；全量清空用 `clear_players`。

## 11. 备份要备哪些？多久备一次？

| 对象 | 频率 | 说明 |
| --- | --- | --- |
| 数据库 | 每日（大服每 6 小时） | 升级/改配置/装插件前额外备一次 |
| `config/` | 每次改动前后 | 含 `jwt.secret`，丢了等于全服强制重登 |
| `data/players/` | 每日 | 便于单点恢复 |
| `plugins/` | 每次变动 | 第三方插件 jar |

```bash
cp xiuxian.db xiuxian.db.bak-$(date +%F)
cp -r config  config.bak-$(date +%F)
```

**结论**：数据库 + `config/` 是必备份项，其余按需。

## 12. 能不能用 JRE 运行？

能。构建产物是 shaded 可执行 jar（`Main-Class: com.mtxgdn.Main`），运行时只做字节码加载，
**不需要编译器**。只要机器上的 `java` 是 **23 或更高版本**，`java -jar` 就能跑；
JDK 只在**构建**（`mvn package`）时需要 —— `install.bat` 也只检查 `java -version`
主版本号 ≥ 23，不区分 JDK/JRE。

**结论**：JRE 23+ 可以运行；JDK 23+ 才能构建。低版本会抛 `UnsupportedClassVersionError`。

## 13. 内存怎么调？

```bash
XIUXIAN_MEM=-Xmx1g ./start.sh --nogui            # 或用 JAVA_OPTS 覆盖
JAVA_OPTS="-Xms512m -Xmx2g" ./start.sh --nogui
java -Xms512m -Xmx2g -jar main-0.1.0.jar --nogui
```

```yaml
performance:
  low_memory: true          # 小内存机器开启
  memory_log_entries: 200   # 内存中保留的日志条数
logging:
  level: INFO               # DEBUG 日志量大，生产建议 INFO
```

Windows 小内存设备直接用 `start-low-memory.bat`：
`-Xms128m -Xmx256m -XX:+UseSerialGC -XX:MaxDirectMemorySize=32m`。

**结论**：`-Xmx` 是主要手段，`performance.low_memory` + `logging.level=INFO` 是配套优化。

## 14. 日志在哪？为什么不轮转？

`logging.dir`（默认 `log/`）下，命名 `server-yyyyMMdd-HHmmss.log`，时间戳是**启动时刻**：
即**每次启动生成一个新文件**，追加写入并每行 flush。服务端自身**不做轮转、也不清理旧文件**，
所以长时间运行 + `logging.level: DEBUG` 会产生很大的文件。

**结论**：`log/server-<启动时间>.log`。生产请设 `logging.level: INFO` 并配置 logrotate
（务必用 `copytruncate`，因为进程持续持有文件句柄）。

## 15. 后台有哪些定时任务在动数据？

| 任务 | 周期 |
| --- | --- |
| 坊市到期挂单回收 | **每 60 秒**（首个 tick 延迟 20 秒；周期硬编码） |
| 坊市价格历史清理 | 每 `market.price_history_cleanup_interval_hours` 小时（默认 6） |
| 玩家数据落盘 | 每 `player-data.auto-sync-seconds` 秒（默认 30） |
| 限流窗口 / Token 黑名单清理 | **每 5 分钟**（硬编码） |
| 季节更替检查 / 自动疗伤 / 洞府灵力 | 每 10 秒 |
| 农田 tick / Buff 过期检查 | 每 1 秒 |

**结论**：`market.price_history_cleanup_interval_hours` 只管**价格历史清理**，
**不控制**到期挂单回收 —— 挂单回收周期固定 60 秒，改不了。完整清单见
[生产部署与运维](/guide/deploy)。

## 16. 启动出现"工作目录与 JAR 目录不一致"警告，要紧吗？

要紧。所有运行期路径（`xiuxian.db`、`config/`、`data/`、`log/`、`plugins/`）
都相对**进程工作目录**解析。工作目录不是 jar 所在目录时，会出现"配置改了不生效"
"数据库不见了"这类怪现象 —— 服务端在另一个目录新建了一套全新的库和配置。

修复：`cd /opt/xiuxian && java -jar main-0.1.0.jar --nogui`；
systemd 则设置 `WorkingDirectory=/opt/xiuxian`。

**结论**：务必让工作目录 = jar 所在目录。

## 17. 内置插件停用后，玩家的指令为什么直接没了？

这是设计行为。停用后门控在多个层面同时生效：

| 受影响的东西 | 行为 |
| --- | --- |
| 玩家指令 | 指令注册表返回 `null`，玩家看到"功能未开放"类提示 |
| REST 接口 | 被 `ModuleGateFilter` 拦截 |
| WebSocket 动作 | 同样被门控拒绝 |
| 后台定时任务 | 不再执行（重启后彻底停止） |
| 数据库数据 | **不删除**，重新启用后数据原样回来 |

**结论**：停用 ≠ 卸载，只是把入口关掉；数据仍在，重新启用即可恢复。

## 18. 如何关闭某个玩法？

```yaml
# config/plugins.yml
plugins:
  farm: false                   # 关掉农场
  experimental_sect_war: false  # 关掉宗门战（默认就是关）
```

或在管理后台「插件管理」页直接切换 —— 选择会**立即写回 `config/plugins.yml`**
（保留注释），重启后依然生效。实验性玩法 `experimental_sect_war`（默认 `false`）与
`experimental_energy_exchange`（默认 `true`）与稳定玩法开关分离，可整体关闭。

**结论**：改 `config/plugins.yml` 的 `plugins.<模块名>`，或在 WebUI「插件管理」页切换。

## 19. 停用某个通道后，QQ 机器人为什么连不上了？

消息通道有两级开关：

| 层级 | 位置 | 效果 |
| --- | --- | --- |
| 类型级 | `config/plugins.yml` 的 `plugins.onebot` / `plugins.qq` / `plugins.minecraft` / `plugins.minecraft-player` | 关闭后**该类型下全部实例**停止运行 |
| 实例级 | `config/adapters.json` 里该实例的 `enabled` | 只控制这一个实例 |

类型级关闭时日志会打印
`适配器类型 onebot 已停用（内置插件开关关闭），跳过启动: onebot-default`。

**结论**：先查 `plugins.yml` 的类型级开关，再查 `adapters.json` 的实例 `enabled`。

## 20. QQ 机器人连不上怎么查？

OneBot 通道默认形态是**服务端起 WS 服务、机器人实现作为客户端连上来**：
`ws://0.0.0.0:6700/onebot`。按顺序检查：

1. **日志有没有这两行** —— 没有说明适配器根本没启动：
   `适配器 onebot-default (onebot) 已启动` 与
   `OneBot WebSocket: ws://0.0.0.0:6700/onebot`
2. `config/plugins.yml` 里 `plugins.onebot` 是不是 `true`
3. `config/adapters.json` 里 `onebot-default` 的 `enabled` 是不是 `true`、`mode` 是不是 `ws_server`
4. **端口是否被占用**（6700 与 Minecraft 默认端口相同，同机部署容易撞）：`ss -lntp | grep 6700`
5. **机器人侧填的地址对不对**：必须是 `ws://<服务器IP>:6700/onebot`，路径 `/onebot` 不能省
6. **防火墙 / 安全组**是否放行 6700（服务端监听 `0.0.0.0`，但可能被系统防火墙拦）

这条通道**不校验 token**（WS 服务端没有握手鉴权逻辑），所以"连不上"基本不是 token 问题；
反过来说，请务必用防火墙限制 6700 的访问来源，不要裸暴露在公网。

**结论**：先看日志有没有"适配器已启动"和"OneBot WebSocket"两行，再逐项查开关、端口、路径与防火墙。

## 21. `plugins/*.jar` 与内置插件的区别是什么？

| 维度 | 内置插件（24 玩法 + 2 实验性 + 4 通道） | 第三方插件 `plugins/*.jar` |
| --- | --- | --- |
| 来源 | 随服务端 jar 打包（`com.mtxgdn.plugin.builtin`） | 你自己放进 `plugins/` 目录 |
| 开关 | `config/plugins.yml` 的 `plugins.<name>` | 插件自身的启停状态，**不在 `plugins.yml` 里** |
| 加载 | 启动时由 `BuiltInPluginRegistry` 注册并按开关启用 | 启动时 `PluginManager.loadPlugins()` 扫描目录加载 |
| 运行时操作 | WebUI「插件管理」页可即时启停 | 可加载 / 卸载 / 热重载单个 jar |
| 文件监听 | — | `plugins.hot_swap: true` 时每 3 秒扫描目录，自动加载新增/修改的 jar |

**结论**：内置插件编译在 jar 内、用 `plugins.yml` 开关；第三方插件是外部 jar、自己管启停。

## 22. 如何只跑 SQLite？

什么都不用改 —— `database.type` 默认就是 `sqlite`，数据库是 jar 同目录下的 `xiuxian.db`，
零配置。只有你之前切到过 MySQL，才需要改回来：

```yaml
database:
  type: sqlite
  sqlite_path: xiuxian.db
```

**结论**：默认就是 SQLite，不用配。但**切库不会迁移数据** —— 从 MySQL 切回 SQLite 时
`xiuxian.db` 是空的新库，要保留数据请先在 MySQL 下用 `GET /api/admin/backup` 导出 JSON，
切库后再用 `POST /api/admin/backup/import` 导入。

## 23. 升级到本版本后，为什么老挂单集中到期、物品被退回？

因为本版本给 `trade_listings` 新增了 `expires_at` 列。迁移只加列
（老行保持 `NULL` = 不过期），随后服务端**回填**到期时间，规则为
`created_at + market.listing_duration_hours`（默认 72 小时），并立刻扫描一次到期挂单。
于是**挂出已超过 72 小时的老挂单会在首次启动后几分钟内集中到期**，物品退回卖家背包：

```
已为 N 个历史坊市挂单补齐到期时间（72 小时）
坊市已回收到期挂单 N 个，物品已退回卖家
```

::: warning 结论
这是预期行为，不是数据丢失。想多留一段时间，就在**升级前**把
`market.listing_duration_hours` 临时调大（例如 `720`），升级后再改回 72。
:::

## 24. 升级需要手工执行 SQL 吗？回滚要还原数据库吗？

**都不需要。** 启动时 `DatabaseManager.initTable()` 先发约 40 条
`CREATE TABLE IF NOT EXISTS`，再跑 `DatabaseMigration.executeMigrations()` 补历史库缺的列与表。
所有语句幂等，每次启动都执行一遍，重复执行无副作用。

回滚只需换回旧 jar，新增内容对旧版本完全无害：

| 新增物 | 旧版本的行为 |
| --- | --- |
| `trade_listings.expires_at` 列 | 不读该列，挂单恢复"永不过期"语义 |
| `trade_price_history` 表 | 不查询，表空着不影响 |
| 3 个新索引 | 只占少量磁盘，不影响正确性 |

::: danger 结论
无需手工 SQL，回滚只需换回旧 jar。但迁移会真实改动表结构
（`qq_official_bindings` 的 `app_id` 升级甚至会重建表），所以**升级前必须备份数据库**；
且已发生的业务变更不会自己回退 —— 老挂单已退回并标记 `expired`，
换回旧 jar 不会重新上架，要回到升级前状态必须从备份恢复。
:::
