# 管理后台

管理后台是一个**纯静态的零依赖单页应用**，直接打包在 jar 里，
不需要额外的 Web 服务器或构建步骤。

访问地址：

```
http://127.0.0.1:8080/admin/
```

::: warning 结尾的斜杠别省
`/admin/` 会返回 `index.html`，`/admin` 也能工作（handler 会补上），
但带上斜杠更稳妥。
:::

## 技术形态

| 项 | 值 |
| --- | --- |
| 位置 | `src/main/resources/webadmin/` |
| 挂载 | `new AdminStaticFileHandler("/admin", "webadmin")` |
| 前端 | 原生 JS（无框架、无 npm、无构建） |
| 依赖 | 零第三方库，全部自己写 |

::: tip 改完不用重新构建前端
因为是原生 JS 且直接读 classpath 资源，**改完只要重新打包 jar 即可**，
没有 `npm install` / `npm run build` 这一步。

响应头带 `Cache-Control: no-cache, no-store, must-revalidate`，
所以刷新页面一定能拿到新版本，不用清缓存。
:::

## 登录

后台用**独立的管理员账号体系**，与玩家账号分开：

```bash
curl -X POST http://127.0.0.1:8080/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

返回的 token 后续请求带上：

```
Authorization: Bearer <admin-token>
```

由 `AdminAuthFilter` 校验。默认管理员密码是 `admin123` 的 bcrypt 哈希
（配置键 `admin.password_hash`）。

::: danger 上线前必须改密码
默认密码 `admin123` 是公开的。首次启动后请立刻在
**管理后台 → 用户/角色 → 修改密码**里改掉，或直接改 `config/application.yml`
的 `admin.password_hash`（填 bcrypt 哈希）。

同时把 `admin.username` 从 `admin` 改掉，减少被撞库的机会。
:::

## 功能页

侧边栏共 16 个页签（`data-tab` 值即模块名）：

| 分组 | 页签 | `data-tab` | 说明 |
| --- | --- | --- | --- |
| 主菜单 | 📊 总览 | `overview` | 服务端状态、在线人数、关键指标 |
| 主菜单 | 👥 玩家管理 | `players` | 搜索玩家、发放物品、改属性、改名、设灵根、封禁/删除 |
| 主菜单 | 🗺️ 地图管理 | `map` | 已知世界地点与通道、**野外分片只读总览**与手动补货（`GET/POST /api/admin/map/wilderness*`） |
| 统计 | 💬 消息统计 | `statsMessages` | 各通道消息量 |
| 统计 | ⚡ 指令统计 | `statsCommands` | 指令调用排行 |
| 系统 | 🗄️ 数据库 | `database` | 浏览所有表、查看/编辑行数据、清档、重置 |
| 系统 | 🔑 用户/角色 | `users` | 用户、角色、权限的增删改 |
| 系统 | 📜 实时日志 | `logs` | 滚动查看服务端日志 |
| 系统 | 👣 玩家轨迹 | `traces` | 玩家操作审计（`admin.logs.view`） |
| 系统 | 🎫 兑换码 | `redeemCodes` | 生成/管理兑换码 |
| 系统 | 🏆 称号管理 | `titles` | 称号列表与发放 |
| 系统 | 🏪 坊市管理 | `market` | 挂单、行情、异常挂单处理 |
| 系统 | 🔌 适配器 | `adapters` | 查看/启停消息通道实例 |
| 系统 | 🧩 插件管理 | `plugins` | 内置插件开关、外部插件加载/卸载 |
| 系统 | 🔐 OAuth2 | `oauth` | OAuth2 客户端与令牌 |
| （隐藏） | 👤 我的信息 | `myProfile` | 默认 `display:none`，登录后按需显示 |

::: tip 权限决定你看到什么
页签**不会**因为权限不足而隐藏（`myProfile` 除外，它是靠内联样式隐藏的），
但点进去调接口时会收到 `403 权限不足`。

后台权限码与[权限系统](/dev/permissions)里的 `admin.*` 一一对应。
:::

## 前端结构

```
webadmin/
├── index.html                    ← 单页外壳，含侧边栏与所有 tab 容器
└── assets/
    ├── css/styles.css
    └── js/
        ├── app.js                ← 启动、tab 路由
        ├── api.js                ← 统一 API 封装（自动带 token、统一错误处理）
        ├── utils.js              ← 格式化、DOM 辅助
        └── modules/              ← 每个 tab 一个文件
            ├── overview.js
            ├── players.js
            ├── map.js
            ├── database.js
            ├── users.js
            ├── logs.js
            ├── traces.js
            ├── redeemCodes.js
            ├── titles.js
            ├── market.js
            ├── adapters.js
            ├── plugins.js
            ├── oauth.js
            ├── stats.js
            ├── myProfile.js
            ├── layout.js
            └── login.js
```

`api.js` 是唯一的请求出口，负责：

- 自动附加 `Authorization` 头
- 统一解析 `{code, message, data}` 信封
- `code !== 0` 时统一弹错误提示
- 401 时跳回登录页

::: warning 新增页面请走 api.js
不要在模块里直接 `fetch`。绕过 `api.js` 会丢掉统一的
401 处理与错误提示，也会漏掉 token 附加。
:::

## 新增一个后台页

1. **`index.html`**：加侧边栏项与内容容器

```html
<div class="nav-item" data-tab="myFeature">
  <span class="nav-icon">🆕</span><span>我的功能</span>
</div>
```

```html
<div class="tab-content" id="tab-myFeature" style="display:none">
  <h2>我的功能</h2>
  <div id="myFeatureBody"></div>
</div>
```

2. **`assets/js/modules/myFeature.js`**：写加载逻辑

```javascript
window.MyFeatureModule = {
  async load() {
    const res = await Api.get('/admin/my-feature');
    if (res.code !== 0) return;
    document.getElementById('myFeatureBody').textContent =
      JSON.stringify(res.data, null, 2);
  }
};
```

3. **`app.js`**：注册 tab 切换回调

```javascript
const TAB_LOADERS = {
  // ...
  myFeature: () => window.MyFeatureModule.load()
};
```

4. **后端**：在 `AdminResource` 里加对应接口，并声明权限码：

```java
@GET
@Path("/my-feature")
@RequirePermission(PermissionCode.ADMIN_STATUS)   // 选一个合适的权限码
public Response myFeature() { ... }
```

5. **`index.html`** 记得在底部引入新脚本：

```html
<script src="assets/js/modules/myFeature.js"></script>
```

::: danger 不要忘了权限注解
`AdminResource` 里漏写 `@RequirePermission` 的接口，
只要**登录了管理后台**就能调用。加接口时务必检查注解。
:::

## 静态资源服务细节

`AdminStaticFileHandler` 的行为：

| 行为 | 说明 |
| --- | --- |
| 挂载路径 | 构造参数 `mountPath`，`/admin` 与 `/install` 各一个实例 |
| 资源根 | 构造参数 `resourcePrefix`，对应 classpath 目录 |
| `/` 请求 | 映射到 `/index.html` |
| 未找到 | 返回 **404 纯文本**（`404 Not Found`） |
| 缓存 | `no-cache, no-store, must-revalidate` |
| 内容类型 | 按扩展名查表：`.html .htm .css .js .json .png .svg .jpg .jpeg .gif .ico .woff .woff2 .ttf`；未命中按 `text/plain` |

::: warning 没有 SPA 兜底路由
未知路径返回 404，**不会**回退到 `index.html`。

所以后台不要用 HTML5 History 路由（`/admin/players` 这种）。
现有实现用的是 `data-tab` + 前端切换，刷新页面永远停在 `/admin/`，不会 404。
:::

::: details 资源解析走 classpath，不是文件系统
handler 用 `getClassLoader().getResourceAsStream("webadmin" + path)` 读资源，
而不是从磁盘目录读。这意味着：

- 后台资源**只能**来自 jar 内部（或开发时的 `target/classes`）
- 在 jar 里部署时，无法通过路径穿越读到 jar 外的文件

但它也意味着**无法用外置文件覆盖后台页面** ——
想改后台必须重新打包 jar。
:::

## 插件注册后台页面

插件可以把自己的管理页面注册进来：

```java
// 插件 jar 内含 webadmin/index.html
context.registerWebResources("webadmin");
```

由 `PluginWebManager` 处理，挂在插件自己的路径下。
`PluginContext.registerWebResources(resourceDir)` 的 `resourceDir`
是**插件 jar 内**的资源目录名（如 `"webadmin/"`）。

这样插件可以复用同一套静态服务能力，不必自己起 HTTP 服务。

::: tip 后台的"插件管理"页能看到这些
`GET /api/admin/plugins` 返回的插件列表里包含已注册 Web 资源的插件，
前端 `plugins.js` 会为它们渲染入口。
:::

## 与安装向导的关系

安装向导是**另一套**静态资源（classpath 的 `install/`），
挂在 `/install` 上，且**仅在未完成安装时可用**：

```java
if (!InstallResource.isInstalled()) {
    server.getServerConfiguration()
          .addHttpHandler(new AdminStaticFileHandler("/install", "install"), "/install");
}
```

::: danger 装完之后向导就消失了
安装完成会写入 `config/.installed` 锁文件，`/install` 从此返回 404。
要重新走向导，需要手动删掉 `config/.installed` 并清空 `jwt.secret`。

详见[安装与首次启动](/guide/install)。
:::
