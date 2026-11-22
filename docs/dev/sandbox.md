# 沙箱模拟

沙箱（Sandbox）是一个**不对外的适配器**：它没有监听端口，也不接任何聊天平台。
它的用途只有一个 —— 在管理后台开一个输入框，把里面的文本当成某个
「沙箱角色」发来的指令，交给**真实的指令管线**执行，然后把回复原样显示出来。

用来验证「这条指令到底会不会给奖励」、复现玩家报的问题、或者给新人演示玩法，
而**不碰任何真实玩家数据**。

::: tip 它和 `/debug` 指令不一样
`/debug` 是直接调命令对象、拼一段假上下文；沙箱走的是**完整链路**：
账号 → 角色 → `CommandRegistry` 分发 → 业务 Service → 数据库落盘 → 回复文本。
链路里任何一环断了，沙箱里都会暴露出来。
:::

## 隔离边界

沙箱不是「一个特殊权限的玩家」，而是**一整套独立账号**：

| 维度 | 隔离方式 |
| --- | --- |
| 账号 | 用户名固定 `sandbox_` 前缀 + 8 位随机十六进制，共 16 字符（等于玩家名长度上限） |
| 角色 | 每个沙箱账号自动创建独立角色，互不共享 |
| 数据目录 | `data/sandbox/`，与 `data/players/` 分开 |
| 一键清理 | 按 `sandbox_` 前缀批量删账号，`users` → `players`/`user_roles` 级联清空 |

前缀是**标签**，也是一键清理的唯一依据。所以别手动把真实玩家改名成
`sandbox_xxx` —— 清理时会被一起删掉。

::: warning 沙箱数据仍在主库里
沙箱账号写进**同一个 `xiuxian.db`**，只是靠前缀标记。这样业务代码完全不用改，
但意味着「清理沙箱」是一次真实的批量删除。删之前先确认前缀没有被误用。
:::

## 权限：完全旁路

沙箱指令**跳过所有权限校验**，也不产生管理审计条目。原因很直接：沙箱账号
只有 `SUPER_ADMIN` 一个角色，而 27 处调用点会直接问
`PermissionService.hasPermission`，靠角色给全权限不够稳。

所以是两层一起上：

1. 沙箱账号被赋予 `SUPER_ADMIN`（解析成全部 75 个权限码）；
2. `SandboxCommandContext` 覆写 `checkPermission` / `requirePermission` 直接返回 `true`。

::: danger 旁路的代价：必须硬拦危险指令
既然权限全放行，`/关闭服务端`、`/cleardb_all` 这类指令在沙箱里也会被放行 ——
而它们会**真的关掉服务端、清掉真实数据**。

因此 `SandboxAdapter` 在**分发入口**维护一份黑名单，命中就直接拒绝、不执行：

```
关闭服务端 / shutdown / 关闭服务器 / 重启 / restart
cleardb_players / 清除玩家数据 / cleardb_all / 重置全部数据
debug / 调试
```

返回文本是固定的：`沙箱中禁止执行该指令：它会关闭服务端或清空真实数据。`
加新指令时如果它会 `System.exit` 或批量删表，记得同步加进黑名单。
:::

::: tip 怎么验证旁路真的生效
用 `/玩家列表`。这条指令声明了 `privateOnly=true`，只在
`OneBotWebSocketServer.dispatchCommand` 与 `QqMessageRouter` 里被拦，
而沙箱根本不经过这两个类。沙箱里能正常列出玩家，就说明确实旁路了。
:::

## 配置

`config/plugins/sandbox.yml`：

```yaml
enabled: true
data_dir: data/sandbox     # 会话与历史存放目录
max_sessions: 8            # 同时存在的沙箱会话上限
history_limit: 20000       # history.jsonl 最多保留行数
```

实例级参数在 `config/adapters.json`：

```json
{
  "id": "sandbox-default",
  "type": "sandbox",
  "enabled": true,
  "config": {
    "data_dir": "data/sandbox",
    "max_sessions": 8,
    "history_limit": 20000
  }
}
```

`enabled: true` 是默认值 —— 首次启动会自动写入这条实例配置。

## 数据文件

| 文件 | 内容 |
| --- | --- |
| `data/sandbox/sessions.json` | 会话列表（id、userId、username、创建/活跃时间、指令数） |
| `data/sandbox/history.jsonl` | 指令历史，一行一条 JSON |

历史用 JSONL 而不是数据库表，是因为它**只用于回看**：追加写、按行截断，
不需要查询能力。写入走「临时文件 + `ATOMIC_MOVE`」，避免写一半断电留下半行。

内存里另保留最近 2000 条做缓存，`history_limit` 只约束文件。

## 生命周期

```
启动 → 建 data_dir → 载入 history.jsonl → 载入 sessions.json
     → pruneOrphanAccounts()（清掉前缀存在但库里已无的账号）
     → running = true
```

`running = true` 放在最后：中途失败时状态仍是「未启动」，后台会提示
`沙箱适配器未启动，请先在插件页启用「沙箱」`，而不是假装能用。

`pruneOrphanAccounts()` 有个副作用值得记住：**两个沙箱适配器不能共享同一个
数据库和 `data_dir`**，否则会互删对方的账号（症状是随机报「角色不存在」）。
写测试时一个测试类一个 `data_dir`。

## REST 接口

全部需要 `admin.sandbox` 权限，前缀 `/api/admin/sandbox`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/state` | 运行状态、数据目录、会话上限、会话列表 |
| `POST` | `/sessions` | 新建沙箱会话（建账号 + 建角色） |
| `DELETE` | `/sessions/{id}` | 删除单个会话（连带删账号与角色） |
| `DELETE` | `/sessions` | 一键清理全部沙箱账号，会话与历史一并清空 |
| `POST` | `/command` | 执行一条指令，返回回复列表 |
| `GET` | `/history` | 回看指令历史（`limit` 最大 500，可按 `session` 过滤） |

适配器未启动时，**六个端点全部返回 HTTP 409**，body 里 `code` 也是 409。

::: warning 错误响应用真实 HTTP 状态码
早期版本把 404/400 塞在 HTTP 200 的 body 里，`DELETE /sessions/不存在的id`
会返回 `HTTP 200 {"code":404}`。前端 `api.js` 的 `request()` 对 401/204 以外的
状态都解析 JSON，所以界面看起来是对的，但 `curl` 和监控会全部误判成功。
现在统一走 `Response.status(code)`。
:::

### `POST /command` 的请求与响应

```json
{ "sessionId": "333bec470162", "text": "/签到" }
```

```json
{
  "code": 200,
  "data": {
    "command": "签到",
    "replies": ["☀ 签到成功！连续签到第 1 天", "下品灵石 x50"],
    "error": null,
    "userId": 4,
    "username": "sandbox_e0e66196"
  }
}
```

`text` 里的前导 `/` 会被剥掉再查表。空文本返回 400 `指令不能为空`；
查不到的指令**不算错误**，`replies` 里会是 `未知指令，请输入 /help 查看可用指令`。

## WebUI

侧边栏「系统 → 🧪 沙箱模拟」（`data-tab="sandbox"`，权限码 `admin.sandbox`）。

页面分三块：顶部状态条（运行状态、数据目录、会话数/上限、一键清理）、
左侧会话列表、右侧指令终端（输入框 + 快捷指令 + 历史回看）。

快捷指令只放**实测可用**的顶层指令：`签到`、`状态`、`背包`、`图鉴`、`称号`、
`商店`、`坊市`、`帮助`。

::: tip 为什么不是「修炼」「任务」
这两个名字看着合理，但都不是顶层指令 —— 「修炼」只是 `/打坐`、`/突破` 的子命令
关键词，「任务」在这个项目里压根不存在。点下去只会回「未知指令」，
第一印象就是「这功能是坏的」。

`SandboxFlowTest.quickCommandsAllExist` 会拿 `CommandRegistry.getRaw()` 逐条校验，
列表漂移会直接测试失败。
:::

## 相关代码

| 文件 | 职责 |
| --- | --- |
| `com/mtxgdn/sandbox/SandboxAdapter.java` | 适配器主体：会话管理、指令分发、危险指令拦截、清理 |
| `com/mtxgdn/sandbox/SandboxCommandContext.java` | 假上下文：覆写权限校验、收集回复 |
| `com/mtxgdn/sandbox/SandboxHistory.java` | JSONL 历史读写 |
| `com/mtxgdn/sandbox/SandboxSession.java` | 会话数据结构 |
| `com/mtxgdn/rest/AdminSandboxResource.java` | REST 层 |
| `webadmin/assets/js/modules/sandbox.js` | 前端模块 |
