# 开发者文档

本页面向**服务端开发者、客户端接入方与插件作者**。玩家玩法说明请看[玩家玩法](/player/)。

## 先读哪一篇

| 目标 | 文档 |
| --- | --- |
| 搞清代码怎么组织、启动时发生了什么 | [架构总览](./architecture) |
| 查表结构、迁移机制、并发写法 | [数据库设计](./database) |
| 调服务端内部的服务类 | [内部服务 API](./internal-api) |
| 接 REST 接口 | [REST API](./rest-api) |
| 接 WebSocket | [WebSocket 协议](./websocket) |
| 加一个新指令 | [指令框架](./commands) |
| 管权限、加权限码 | [权限系统](./permissions) |
| 加文案、接多语言 | [多语言（i18n）](./i18n) |
| 接消息通道 / 写适配器 | [消息通道与适配器](./adapters) |
| 写插件 | [插件开发](./plugin-dev) |
| 改 Web 管理控制台 | [Web 管理控制台](./webadmin) |

## 代码组织一览

服务端入口是 `com.mtxgdn.Main`，源码按职责分包：

| 包 | 职责 |
| --- | --- |
| `com.mtxgdn.Main` | 启动装配：加载配置 → 初始化数据库 → 注册服务 → 扫描指令 → 启动 HTTP/WS/适配器 → 注册关闭钩子 |
| `common` | 通用基础设施：指令基类与注册表、服务注册表、消息与错误码 |
| `game` | 玩法核心：实体、物品定义、玩法服务、境界配置 |
| `onebot` | OneBot 协议接入 + 全部玩家指令实现 |
| `qq` | QQ 官方机器人接入 |
| `minecraft` | Minecraft 内嵌通道与 MOTD |
| `rest` | Jersey REST 资源、鉴权与权限过滤器 |
| `websocket` | WebSocket 网关 |
| `adapter` | 消息通道适配器抽象与实例管理 |
| `plugin` | 插件系统：内置插件注册表、开关持久化、第三方插件加载 |
| `permission` | 权限码定义与权限服务 |
| `db` | 数据库连接、建表、迁移、方言适配 |
| `playerdata` | 玩家数据文件化存储与脏标记刷盘 |
| `util` | 配置、语言、日志、JWT 等工具 |

## 三条设计约定

::: tip 一、所有入口共用同一套服务
QQ 指令、REST、WebSocket、Minecraft 通道最终都调用 `game.service` 下的同一批服务类。
新增玩法时**只写一份服务逻辑**，各入口只负责解析参数与渲染文案。
:::

::: warning 二、涉及物品与货币的并发操作必须先抢占再执行
凡是"改状态 + 发放物品/货币"的操作，都采用
`UPDATE ... SET status = ? WHERE id = ? AND status = 'active'` 这类**条件更新抢占**，
只有更新影响行数 > 0 的一方才能继续发放。这样并发购买/取消/到期回收竞争时不会重复发放。
详见[数据库设计](./database)。
:::

::: danger 三、启动时的数据库迁移必须幂等
`DatabaseMigration` 与建表语句在**每次启动**都会执行一遍（老库与新库共用同一套语句）。
写迁移时请使用 `IF NOT EXISTS` 或捕获"已存在"异常，保证重复执行无副作用。
:::
