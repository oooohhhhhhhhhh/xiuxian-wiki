# 配置说明

配置文件位于 `src/main/resources/application.yml`（启动后释放到运行目录 `config/application.yml`，外部配置覆盖内置默认）。配置以点分键读取（`AppConfig`）。

## 核心配置

```yaml
app:
  name: 修仙世界

server:
  host: 127.0.0.1        # 仅文档用途；实际监听 0.0.0.0:8080（Main 硬编码）
  port: 8080

database:
  type: sqlite           # mysql | sqlite（随包默认 sqlite；代码缺省值 mysql）
  url: jdbc:mysql://...  # MySQL 模式
  username: root
  password: root
  sqlite_path: xiuxian.db

jwt:
  secret: ""             # 用户/管理员 JWT 密钥（≥256 位；留空则每次启动随机生成，重启后旧令牌失效）

admin:
  username: ""           # 管理后台账号（未配置时回退数据库用户认证）
  password: ""

season:
  mode: calendar         # calendar=按真实月份 | cycle=按小时循环
  cycle_hours: 6         # cycle 模式每季小时数

oauth2:
  enabled: true
  client_id: xiuxian_oauth_client
  client_secret: xiuxian_oauth_secret_please_change
  scopes: read write
  token_ttl_seconds: 3600

player-data:
  enabled: true
  dir: data/players      # 玩家数据文件目录
  auto-sync-seconds: 30  # 定期落盘间隔（0=关闭）
  self-restore: false    # 玩家自助还原开关

quiz:
  enabled: false         # 答题系统开关（默认隐藏/关闭：/题库 指令不注册、自动收集与命中即答均停止）

verify_code:
  enabled: true
  allowed_domains: [qq.com, 163.com, 126.com, gmail.com, outlook.com, hotmail.com]
  rate_limit_seconds: 60

onebot:                  # 遗留配置，适配器已改用 config/adapters.json
  enabled: true
  port: 6700

inventory:
  base_capacity: 30      # 背包基础容量
  capacity_per_level: 5  # 每级 +5

performance:
  low_memory: false
  grizzly_io_threads: 2
  grizzly_worker_cores: 4
  grizzly_worker_max: 8

network:
  connection_timeout_ms: 10000
  read_timeout_ms: 30000
  write_timeout_ms: 10000
  websocket_handshake_timeout_ms: 15000
  db_pool_max: 4          # 未使用（无连接池）
  memory_log_entries: 200 # 内存日志条数

logging:
  level: DEBUG
  dir: log
  color: true

plugins:
  hot_swap: false        # 插件目录热替换监听
```

## 实验性功能（experimental.yml）

独立于 application.yml，位于 `config/experimental.yml`：

```yaml
experimental:
  sect_war: false        # 宗门战开关（预留，代码中未使用该开关校验）
  energy_exchange: true  # 能量转化系统（默认开启）
```

## 游戏数据配置

| 文件 | 说明 |
|------|------|
| `config/realm_config.json` | 境界配置（31 级属性 / 修炼倍率），启动时释放 |
| `config/newbie_reward.json` | 新手奖励（默认 enabled=false） |
| `config/blacklist.yml` | 黑名单（QQ 号 / 用户 ID、原因、封禁者） |
| `config/onebot_group_config.yml` | OneBot 群组配置（自动禁言开关 / 天数） |
| `config/adapters.json` | 适配器配置（OneBot / QQ / Minecraft） |
| `data/quiz/questions.json` | 答题题库 |
| `data/mtxgdn/lang/zh_cn.json` | 中文语言文件（物品 / 秘境 / 事件 / 系统消息） |

## 配置加载规则

- 内置 classpath 配置与外部 `config/` 配置**深度合并**，外部覆盖内置
- `experimental.yml`、`realm_config.json` 等缺失时自动从 jar 释放默认
- 管理后台可在运行时修改部分配置（OAuth2、适配器、新手奖励）并持久化

## 相关文档

- [架构总览](./architecture)
- [部署指南](./deployment)
