# 权限系统

服务端的权限模型是 **权限码（permission code）+ 角色（role）** 两层：
每个功能声明自己需要的权限码，用户通过所属角色获得一批权限码。

## 权限码

权限码定义在 `PermissionCode` 枚举里，共 **71 个**，分三个大类：

| 分类 | 数量 | 前缀 |
| --- | --- | --- |
| 游戏功能 | 42 | `game.*` |
| QQ 指令 | 6 | `qq.*` |
| 管理后台 | 23 | `admin.*` |

::: tip 数量怎么核
枚举里 `PermissionCode` 的构造调用共 71 处，`game.*` 42 个、`qq.*` 6 个、`admin.*` 23 个，
合计 71。分类字段（第三列）不影响归类，归类看的是权限码前缀。
:::

### 游戏功能 `game.*`（42）

| 权限码 | 名称 |
| --- | --- |
| `game.player.info` | 查看角色信息 |
| `game.player.create` | 创建角色 |
| `game.cultivate` | 修炼 |
| `game.explore` | 探索 |
| `game.secret_realm` | 秘境探索 |
| `game.secretrealm.enter` | 进入秘境 |
| `game.secret_realm.enter` | 进入秘境 |
| `game.realm.breakthrough` | 境界突破 |
| `game.realm.config` | 查看境界配置 |
| `game.item.use` | 使用物品 |
| `game.item.add` | 添加物品 |
| `game.item.registry` | 查看物品图鉴 |
| `game.inventory.view` | 查看背包 |
| `game.skill.learn` | 学习技能 |
| `game.technique.learn` | 学习功法 |
| `game.technique.equip` | 装备功法 |
| `game.technique.upgrade` | 升级功法 |
| `game.crafting.recipes` | 查看配方 |
| `game.crafting.craft` | 制造物品 |
| `game.equipment.enhance` | 装备强化 |
| `game.equipment.equip` | 装备物品 |
| `game.market.view` | 查看坊市 |
| `game.market.trade` | 坊市交易 |
| `game.market.list` | 坊市上架 |
| `game.market.buy` | 坊市购买 |
| `game.market.cancel` | 坊市撤单 |
| `game.pvp.challenge` | PVP挑战 |
| `game.chat.world` | 世界聊天 |
| `game.chat.private` | 私聊 |
| `game.rank.view` | 查看排行榜 |
| `game.friend.manage` | 好友管理 |
| `game.sect.manage` | 宗门管理 |
| `game.sect.donate` | 宗门捐献 |
| `game.sect.warehouse` | 宗门仓库 |
| `game.cave.manage` | 洞府管理 |
| `game.team.manage` | 团队管理 |
| `game.team.view` | 查看团队 |
| `game.title.view` | 查看称号 |
| `game.title.equip` | 装备称号 |
| `game.daily` | 每日系统 |
| `game.stone.purify` | 提纯灵石 |
| `game.redeem.code` | 兑换码 |

::: warning 两个"进入秘境"权限码并存
`game.secretrealm.enter` 与 `game.secret_realm.enter` 都存在，
是历史遗留的重复定义。新代码请使用 **`game.secret_realm.enter`**。
:::

### QQ 指令 `qq.*`（6）

| 权限码 | 名称 |
| --- | --- |
| `qq.bind` | 绑定QQ |
| `qq.unbind` | 解绑QQ |
| `qq.command.basic` | 基本查询指令 |
| `qq.command.game` | 游戏操作指令 |
| `qq.command.admin` | 管理指令 |
| `qq.command.trace` | 查看玩家轨迹 |

### 管理后台 `admin.*`（23）

| 权限码 | 名称 |
| --- | --- |
| `admin.login` | 登录管理后台 |
| `admin.status` | 查看服务器状态 |
| `admin.logs.view` | 查看日志 |
| `admin.shutdown` | 关闭服务器 |
| `admin.users.manage` | 管理用户 |
| `admin.roles.manage` | 管理权限 |
| `admin.database.access` | 数据库访问 |
| `admin.database.clear_players` | 清除玩家数据 |
| `admin.database.reset_all` | 重置全部数据 |
| `admin.blacklist.view` | 查看黑名单 |
| `admin.blacklist.manage` | 管理黑名单 |
| `admin.onebot.group.config` | 管理 OneBot 群组配置 |
| `admin.plugins.manage` | 管理插件 |
| `admin.titles.manage` | 管理称号 |
| `admin.adapters` | 管理适配器 |
| `admin.config.manage` | 管理配置 |
| `admin.economy` | 管理经济 |
| `admin.items.give` | 发放物品 |
| `admin.announce` | 发送全服公告 |
| `admin.redeem.code.manage` | 管理兑换码 |
| `admin.oauth.manage` | 管理 OAuth2 配置 |
| `admin.fix.equipment` | 修复装备数据 |
| `admin.debug` | 调试指令 |

## 角色

五个内置角色，带层级（`level` 越高权限越大）：

| 角色 | 层级 | 权限码数量 | 说明 |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | 100 | **71**（全部） | 最高权限，且**直接跳过权限校验** |
| `ADMIN` | 80 | **67** | 全部权限，但缺 4 个最高管理权限 |
| `MODERATOR` | 50 | **51** | 玩家权限 + 管理查看权限 |
| `PLAYER` | 10 | **46** | 全部 `game.*` 与 `qq.*`（有例外，见下） |
| `GUEST` | 0 | **1** | 仅基本查询 |

### PLAYER 的构成

取所有 `game.*` 与 `qq.*` 权限码，但**排除两个**：

| 排除的权限码 | 原因 |
| --- | --- |
| `game.item.add` | 发放物品属于管理员操作，玩家不可自刷 |
| `qq.command.admin` | QQ 管理指令不对普通玩家开放 |

即 41 个 `game.*` + 5 个 `qq.*` = **46 个**。

### MODERATOR 的构成

在 PLAYER 的基础上**增加 5 个**：

`admin.login`、`admin.status`、`admin.logs.view`、`admin.blacklist.view`、`qq.command.admin`

即 46 + 5 = **51 个**。

### ADMIN 的构成

取**全部 71 个**权限码，然后**移除 4 个**：

| 移除的权限码 | 含义 |
| --- | --- |
| `admin.roles.manage` | 管理权限（防止管理员给自己提权） |
| `admin.users.manage` | 管理用户 |
| `admin.database.clear_players` | 清除玩家数据 |
| `admin.database.reset_all` | 重置全部数据 |

即 71 − 4 = **67 个**。

::: tip 所以 ADMIN 拥有 admin.economy
`admin.economy` **不在**被移除的 4 个之内，所以 `ADMIN` 角色是可以管理经济的。
:::

### GUEST 的构成

只有 `qq.command.basic`（基本查询指令）。

## 校验链路

```
HTTP 请求
    │
    ├─ JwtAuthFilter / AdminAuthFilter     ← 解析 token，写入 userId、adminRole
    │
    ├─ PermissionFilter
    │     ├─ 读方法上的 @RequirePermission，没有就读类上的
    │     ├─ adminRole == "super_admin" ？ → 直接放行 ★
    │     ├─ 未登录 → 401 {"code":401,"message":"未登录"}
    │     └─ 无权限 → 403 {"code":403,"message":"权限不足: <code>"}
    │
    └─ PermissionService.hasPermission(userId, code)
          ├─ 1. 角色权限（含角色继承）
          ├─ 2. 直接分配给用户的权限
          └─ 3. 插件注册的权限码
```

### 注解优先顺序

`PermissionFilter` 先看**方法**上的 `@RequirePermission`，方法上没有才看**类**上的。
所以可以在类上声明一个默认权限，再对个别方法覆盖。

### super_admin 直通

```java
String adminRole = (String) requestContext.getProperty("adminRole");
if ("super_admin".equals(adminRole)) {
    return;   // 直接放行，不做任何权限码检查
}
```

而 `adminRole` 的取值来自 `AdminAuthFilter.getAdminRole(userId)`：

```java
if (!ADMIN_USERNAME.isEmpty()) {
    return "super_admin";     // ← 配置里的内置管理员账号，恒为 super_admin
}
```

::: danger 内置管理员账号不受权限系统约束
`admin.username`（默认 `admin`）对应的账号**恒为 `super_admin`**，
它绕过 `PermissionFilter` 的全部检查，包括那 4 个"最高管理权限"。

这个账号的密码就是 `admin.password_hash`。**请务必改掉默认密码 `admin123`。**
:::

其他账号则取 `PermissionService.getHighestRole(userId)` 并转小写
（`admin` / `moderator` / `player`），没有角色时若持有 `admin.login` 则为 `admin`，否则为 `player`。

## 权限数据怎么初始化

`PermissionService.initDefaultData()` 在**每次启动**时被调用（见 `DatabaseManager.initTable()` 末尾），
它把权限码写入 `permissions` 表、把角色写入 `roles` 表，并建立角色→权限映射。

### 老库会自动补齐新权限码

加载时有一段关键逻辑：

```java
Map<String, Set<String>> defaultPerms = buildDefaultGroupPermissions();
for (每个角色) {
    for (每个默认权限码) {
        if (!existingPerms.contains(permCode)) {
            existingPerms.add(permCode);
            // INSERT OR IGNORE INTO role_permissions ...
        }
    }
}
```

::: tip 这意味着新增权限码不需要写迁移
新版本给 `PLAYER` 增加一个权限码后，**老库启动时会自动把它补进角色映射**。
写入用 `INSERT OR IGNORE`，重复执行无副作用。
:::

::: warning 但"移除"权限码不会自动生效
上面的逻辑只做**新增**。如果新版本从某角色的默认权限里**删掉**了一个码，
老库里的 `role_permissions` 记录仍然存在，需要手工删除或走管理后台调整。
:::

## 新增一个权限码

1. 在 `PermissionCode` 枚举里加一行：

```java
GAME_NEW_FEATURE("game.new.feature", "新功能", "游戏功能"),
```

2. 如果需要给玩家用，**不用改任何代码** —— `PLAYER` 的规则是"所有 `game.*`"，
   新码会自动包含进去（除非你把它加进排除列表）。
   如果要排除，在 `buildDefaultGroupPermissions()` 里加一条 `!code.equals("game.new.feature")`。

3. 在功能入口上声明：

```java
@RequirePermission(PermissionCode.GAME_NEW_FEATURE)
public Response doSomething() { ... }
```

   指令类则在构造函数里传权限码（见[指令框架](/dev/commands)）。

4. 重启服务端，`initDefaultData()` 会把新码写库并补进各角色。

## 插件权限

`PermissionService` 的权限集合使用**字符串**而非枚举，因此插件可以注册自己的权限码
（`getUserPluginPermissionCodes(userId)` 参与 `hasPermission` 的最终判定）。
插件权限码建议带自己的前缀，避免与内置码冲突。
