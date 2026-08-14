# 架构总览

修仙世界服务端是一个基于 **Java 23 + Grizzly/Jersey** 的模块化单进程应用，通过 **扫描注册** 与 **服务注册表** 组织游戏内容，支持 REST / WebSocket / QQ 机器人 / Minecraft 等多种接入。

## 技术栈

| 组件 | 技术 |
|------|------|
| 语言 / 构建 | Java 23 / Maven（shade 打包为 fat-jar） |
| HTTP | Jersey 4.0.2 + Grizzly 4.0.2（JAX-RS） |
| WebSocket | Grizzly WebSocket |
| 数据库 | MySQL / SQLite + DriverManager（无连接池） |
| 认证 | JWT（HS256，用户 7 天 / 管理员 12 小时 / OAuth2 独立令牌） |
| JSON / 配置 | Gson / SnakeYAML |

## 进程内组件

```
Main（启动 / 关闭钩子）
 ├── DatabaseManager      数据库初始化、建表、迁移
 ├── 内容扫描注册          SkillService / TechniqueService / CraftingService 默认数据
 │                         ItemScanner / SecretRealmScanner / ExplorationEventScanner / CommandScanner
 ├── PluginManager        插件扫描（plugins/*.jar）、生命周期、热重载
 ├── Grizzly HttpServer   0.0.0.0:8080/api/（JAX-RS：GameResource / AdminResource / Auth / UnifiedRestResource...）
 ├── GameWebSocketApp     ws://0.0.0.0:8080（根路径）
 ├── AdminStaticFileHandler 管理后台 /admin
 ├── SeasonService        全局季节（每 10 秒检查，更替广播）
 ├── AdapterManager       外部适配器（OneBot / QQ 官方 / Minecraft）
 ├── MinecraftMotdServer  端口 25565
 └── 调度器               Buff 过期检查 / 农场 tick / 洞府灵气 / 阵法过期 / 玩家数据落盘
```

## 核心机制

### 扫描注册

启动时通过 classpath 扫描自动注册：物品（`data.mtxgdn.item`）、秘境（`data.mtxgdn.secretrealm`）、游历事件（`data.mtxgdn.explorationevent`）、指令（`com.mtxgdn.onebot.command`）。新增内容类放入对应包即可，无需修改核心代码。

### 指令即路由

`Command` 基类自注册；`addRoute(RouteDefinition.get/post/onebotOnly(...))` 统一注册 QQ 子命令与 REST 路由。`UnifiedRestResource`（`@Path("/game")` 通配）在启动时收集全部 Command 的 REST 端点并分发（路径段数降序匹配，`GameResource` 显式路径优先）。

### 服务注册表

`ServiceRegistry` 提供 26 个懒加载单例服务 getter（PlayerService / ItemService / EconomyService / CombatService / ...），供指令层与插件层调用。

### 三层鉴权

| 区域 | 过滤器 | 令牌 |
|------|--------|------|
| `/api/auth/*`、`/api/test/*` | 放行 | - |
| `/api/game/*` | JwtAuthFilter | 用户 JWT（7 天） |
| `/api/admin/*` | AdminAuthFilter + PermissionFilter | 管理员 JWT（12 小时）+ `@RequirePermission` |
| OAuth 受保护端点 | OAuthService | OAuth2 token（默认 3600 秒） |

## 数据流示例

**QQ 指令**：OneBot 消息 → OneBotWebSocketServer（离线结算 → 账号流程 → 答题 → 限流 → 私聊限制检查）→ `CommandRegistry.get(cmd)` → `Command.execute`（绑定 → 权限 → 子命令分发）→ 游戏服务 → 回复。

**REST**：HTTP → 过滤器链（EntityBuffer → JwtAuth/AdminAuth → Permission）→ Jersey 资源（GameResource 显式端点或 UnifiedRestResource 动态分发）→ 游戏服务 → JSON 响应。

## 数据持久化

- **数据库**：41 张表（users / players / 各系统数据表 / 日志），启动时建表 + 尽力迁移
- **玩家数据文件化**：`data/players/<playerId>.json` 保存玩家完整快照（16 张个人表），定期落盘；支持一键导出 / 还原
- **文件配置**：`config/` 目录（application.yml / experimental.yml / realm_config.json / blacklist.yml / onebot_group_config.yml / adapters.json / newbie_reward.json）
- **日志**：控制台 + 文件 + 内存环形日志（管理后台实时查看）

## 目录结构

```
src/main/java/com/mtxgdn/
├── Main.java              程序入口
├── server/                Grizzly 装配 / 静态资源 / 关闭钩子
├── rest/                  JAX-RS 资源与过滤器
├── websocket/             GameWebSocketApp
├── onebot/                OneBot 服务器 / 客户端 / 账号流程 / 黑名单 / 答题 / 指令
├── qq/                    QQ 官方适配器
├── minecraft/             MOTD / 服务端适配 / 玩家代理 / Agent / 桥接插件
├── adapter/               AdapterManager 适配器框架
├── game/                  游戏服务 / 实体 / 物品效果 / 秘境 / 游历事件 / 称号
├── data/mtxgdn/           游戏数据定义（物品 / 秘境 / 游历事件 / 语言文件）
├── db/                    数据库管理 / 建表 / 迁移 / 方言
├── permission/            权限模型
├── plugin/                插件系统（含 GUI 生成器）
├── playerdata/            玩家数据文件化
├── common/                指令框架 / 服务注册表 / 错误码 / 消息协议
├── client/                外部客户端 SDK
└── demo/                  演示客户端
```

## 相关文档

- [配置说明](./config)
- [REST API](./rest-api)
- [WebSocket 协议](./websocket)
- [数据库设计](./database)
