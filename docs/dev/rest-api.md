# REST API 参考

服务端基于 **Jersey 4 + Grizzly**，所有端点挂在 `http://<host>:<port>/api` 下。响应格式统一为：

```json
{ "code": 0, "message": "ok", "data": { ... } }
```

`code = 0` 表示成功；非 0 为错误码（见文末）。

## 认证机制

| 令牌 | 有效期 | 说明 |
|------|:---:|------|
| 用户 JWT | **7 天** | `POST /api/auth/login` / `register` 签发；`Authorization: Bearer <token>` |
| 管理员 JWT | **12 小时** | `POST /api/admin/login` 签发；用于 `/api/admin/*` |
| OAuth2 token | 默认 3600 秒 | `POST /api/auth/oauth/token`（client_credentials）签发；仅用于 OAuth 受保护端点 |

- 用户 JWT 为**单一令牌**（无 refresh token）；登出 `POST /api/auth/logout` 将令牌加入内存黑名单
- JWT 密钥：`jwt.secret`（未配置则每次启动随机生成，重启后旧令牌失效）

## 认证 API（/api/auth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（username, password, email, code 验证码） |
| POST | `/api/auth/send-code` | 发送邮箱验证码（email） |
| POST | `/api/auth/login` | 登录（username, password） |
| POST | `/api/auth/change-password` | 修改密码（oldPassword, newPassword） |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/forgot-password/send-code` | 忘记密码发送验证码 |
| POST | `/api/auth/forgot-password/reset` | 重置密码 |
| DELETE | `/api/auth/account` | 注销账号 |

## OAuth2 API（/api/auth/oauth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/oauth/token` | client_credentials 换 token（`{grant_type, client_id, client_secret, scope}`） |
| POST | `/api/auth/oauth/introspect` | token 内省（RFC 7662） |
| GET | `/api/auth/oauth/me` | 受保护资源：查看 token 客户端信息与服务器概况（需 read scope） |
| GET | `/api/auth/oauth/protected/status` | 受保护资源：服务器状态（需 read scope） |
| POST | `/api/auth/oauth/protected/echo` | 受保护资源：回显请求体（需 write scope） |
| GET | `/api/auth/oauth/authorize` | 授权码端点（故意未实现，返回 501） |

## 游戏 API（/api/game，需用户 JWT）

### 玩家与修炼

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/player` | game.player.info | 玩家信息（含灵根、离线收益） |
| POST | `/api/game/player/create` | game.player.create | 创建角色（name） |
| POST | `/api/game/realm/breakthrough` | game.realm.breakthrough | 境界突破（含天劫） |
| GET | `/api/game/realm/config` | game.realm.config | 境界配置 |
| POST | `/api/game/cultivate/start` | game.cultivate | 开始修炼 |
| POST | `/api/game/cultivate/stop` | game.cultivate | 停止修炼（含心魔） |
| POST | `/api/game/heal` | game.player.info | 灵石疗伤 |
| POST | `/api/game/player/data/export` | game.player.info | 导出玩家数据文件 |
| POST | `/api/game/player/data/restore` | game.player.info | 自助还原数据（需 `player-data.self-restore`） |

### 探索

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/exploration` | game.explore | 游历探索 |
| GET | `/api/game/secret_realm/areas` | game.secret_realm | 秘境列表 |
| POST | `/api/game/secret_realm/enter` | game.secret_realm | 进入秘境（area） |
| GET | `/api/game/map` | game.player.info | 当前位置与相邻地点 |
| POST | `/api/game/map/travel/{locationId}` | game.player.info | 移动 |
| GET | `/api/game/map/locations` | game.player.info | 全部地点 |
| GET | `/api/game/season` | - | 季节信息 |
| GET | `/api/game/buff` | game.player.info | 激活的 Buff |

### 物品与装备

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/inventory` | game.inventory.view | 背包 |
| GET | `/api/game/item/registry` | game.item.registry | 物品图鉴 |
| POST | `/api/game/item/use` | game.item.use | 使用物品（itemKey） |
| POST | `/api/game/item/add` | game.item.add | 添加物品（管理） |
| GET | `/api/game/equipment` | game.inventory.view | 已装备 |
| POST | `/api/game/equipment/equip` | game.equipment.equip | 装备（itemKey, slot） |
| POST | `/api/game/equipment/unequip` | game.equipment.equip | 卸下（slot） |
| POST | `/api/game/equipment/enhance` | game.equipment.enhance | 强化（slot） |

### 技能 / 功法 / 制造

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/skills` | game.item.registry | 技能列表 |
| GET | `/api/game/skill/my` | game.inventory.view | 我的技能 |
| POST | `/api/game/skill/learn` | game.skill.learn | 学习技能（skillId） |
| GET | `/api/game/techniques` | game.technique.learn | 功法列表 |
| GET | `/api/game/technique/my` | game.technique.learn | 我的功法 |
| POST | `/api/game/technique/learn` / `equip` / `unequip` / `upgrade` | game.technique.* | 功法操作 |
| GET | `/api/game/crafting/recipes` | game.crafting.recipes | 配方（?category=） |
| POST | `/api/game/crafting/craft` | game.crafting.craft | 制造（recipeId） |

### 战斗与排行

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/pvp/challenge` | game.pvp.challenge | PVP 挑战（立即执行） |
| GET | `/api/game/rank` | game.rank.view | 排行榜（?type=realm\|power\|wealth） |
| GET | `/api/game/players` | game.player.info | 玩家列表 |
| GET | `/api/game/players/search` | - | 搜索玩家 |
| GET | `/api/game/status` | - | 服务器状态 |
| GET | `/api/game/spiritual_roots` | game.player.info | 灵根图鉴 |

### 社交

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET / POST | `/api/game/chat/world` | game.chat.world | 世界聊天 |
| GET / POST | `/api/game/chat/private` | game.chat.private | 私聊 |
| GET | `/api/game/chat/private/{targetPlayerId}` | game.chat.private | 私聊记录 |
| POST | `/api/game/friend/add` / `accept` / `remove` | game.friend.manage | 好友操作 |
| GET | `/api/game/friend/list` / `pending` | game.friend.manage | 好友列表 / 申请 |
| POST | `/api/game/team/create` / `invite` / `accept` / `leave` | game.team.manage | 组队 |
| GET | `/api/game/team/info` | game.team.view | 队伍信息 |
| GET | `/api/game/raid/realms` | game.secretrealm.enter | 团队副本列表 |
| POST | `/api/game/raid/enter` | game.secretrealm.enter | 进入团队副本 |

### 宗门

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/sect/members` | game.sect.manage | 成员列表 |
| POST | `/api/game/sect/create` | game.sect.manage | 创建 |
| POST | `/api/game/sect/join/{sectId}` | game.sect.manage | 申请加入 |
| GET | `/api/game/sect/applications` | game.sect.manage | 待审批申请 |
| POST | `/api/game/sect/approve/{appId}` / `reject/{appId}` | game.sect.manage | 审批 |
| POST | `/api/game/sect/leave` / `kick/{targetPlayerId}` / `disband` | game.sect.manage | 退出 / 踢出 / 解散 |
| POST | `/api/game/sect/appoint` | game.sect.manage | 任命 |
| GET | `/api/game/sect/warehouse` | game.sect.manage | 仓库 |
| POST | `/api/game/sect/donate` | game.sect.donate | 捐献 |
| POST | `/api/game/sect/take` | game.sect.warehouse | 取出 |
| POST | `/api/game/sect/levelup` | game.sect.manage | 升级 |
| POST | `/api/game/sect/transfer/{targetPlayerId}` | game.sect.manage | 转让 |
| POST | `/api/game/sect/war/{targetSectId}` | game.sect.manage | 宣战 |
| GET | `/api/game/sect/top` | game.sect.manage | 排行 |

### 每日 / 称号 / 农场

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/daily/morning_cultivation` | game.daily | 晨修 |
| GET | `/api/game/daily` | game.daily | 天象与机缘 |
| GET | `/api/game/title/all` / `my` / `active` | game.title.view | 称号查询 |
| POST | `/api/game/title/equip` / `unequip` | game.title.equip | 称号装备 |
| GET | `/api/game/farm/plots` | game.player.info | 农田状态 |
| POST | `/api/game/farm/plant` / `water` / `fertilize` / `harvest` / `clear` / `pesticide` | game.player.info | 农田操作 |
| POST | `/api/game/farm/expand` | game.player.info | 扩建 |
| POST | `/api/game/farm/water-all` / `fertilize-all` / `harvest-all` | game.player.info | 一键操作 |

### 经济

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/economy/signin` | - | 签到 |
| POST | `/api/game/economy/recycle` | - | 回收 |
| POST | `/api/game/economy/purify` | - | 提纯（body: {grade}） |
| GET | `/api/game/economy/bank/info` | - | 灵庄信息 |
| POST | `/api/game/economy/bank/deposit` / `withdraw` | - | 存取 |
| GET | `/api/game/economy/auction/items` / `my` | - | 拍卖列表 |
| POST | `/api/game/economy/auction/create` / `bid` | - | 拍卖操作 |
| POST | `/api/game/economy/cultivate-boost` | - | 修炼加速 |
| POST | `/api/game/redeem` | game.redeem.code | 使用兑换码 |
| GET | `/api/game/energy/status` / `list` | - | 能量查询 |
| POST | `/api/game/energy/convert` / `exchange` | - | 能量转化 |

### 管理（Command 动态路由，前缀 /api/game/admin）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/admin/energy/{playerId}` | admin.status | 玩家能量 |
| POST | `/api/game/admin/energy/set` / `add` / `remove` | admin.status | 能量管理 |
| POST | `/api/game/admin/items/give` | admin.items.give | 发放物品 |
| GET | `/api/game/admin/debug/list` | admin.debug | 指令列表 |
| POST | `/api/game/admin/debug/test` | admin.debug | 指令试跑 |

## 管理后台 API（/api/admin，需管理员 JWT）

### 系统

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/admin/login` | - | 管理员 / 玩家双模式登录 |
| GET | `/api/admin/status` | admin.status | 服务器状态 |
| GET | `/api/admin/system/info` | admin.status | 系统信息（版本 / JVM / OS） |
| GET | `/api/admin/logs` | - | 实时日志 |
| POST | `/api/admin/shutdown` | admin.database.reset_all | 关闭服务器 |
| POST | `/api/admin/announce` | admin.status | 全服公告（WS 广播） |
| GET | `/api/admin/whoami` / `me` | - | 当前身份 / 玩家信息 |

### 用户与角色

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/roles` / `permissions` / `groups` | admin.roles.manage | 角色 / 权限 / 权限组 |
| POST | `/api/admin/groups` | admin.roles.manage | 创建权限组 |
| POST/DELETE | `/api/admin/groups/{name}/permissions...` | admin.roles.manage | 组权限管理 |
| GET | `/api/admin/users` | admin.users.manage | 用户列表 |
| POST/DELETE | `/api/admin/user/{userId}/role...` | admin.users.manage | 角色分配 |
| POST | `/api/admin/user/create-admin` | admin.users.manage | 创建管理员 |
| POST | `/api/admin/user/{userId}/password` | admin.users.manage | 重置密码 |
| DELETE | `/api/admin/user/{userId}` | admin.users.manage | 删除用户 |
| GET/POST/DELETE | `/api/admin/user/{userId}/permissions...` | admin.users.manage | 直接权限 |

### 玩家管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/players` | - | 玩家列表 |
| GET | `/api/admin/players/{id}` | admin.status | 玩家详情 |
| POST | `/api/admin/players/{id}/give` | admin.users.manage | 发放资源 |
| POST | `/api/admin/players/{id}/edit` | admin.users.manage | 修改属性 |
| DELETE | `/api/admin/players/{id}` | admin.users.manage | 删除玩家 |
| POST | `/api/admin/players/{id}/rename` | admin.users.manage | 改名 |
| POST | `/api/admin/players/{id}/spiritual-root` | admin.users.manage | 修改灵根 |
| GET | `/api/admin/spiritual-roots` / `items` / `realms` / `titles` | admin.status | 数据目录 |
| POST | `/api/admin/players/{id}/title` / `title/add` | admin.users.manage | 称号装备 / 授予 |
| GET/POST/DELETE | `/api/admin/players/{playerId}/titles...` | admin.titles.manage | 称号管理 |
| GET | `/api/admin/player-traces` | admin.logs.view | 玩家行为轨迹 |

### 数据库

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/admin/database/clear_players` | admin.database.clear_players | 清除玩家数据 |
| POST | `/api/admin/database/reset_all` | admin.database.reset_all | 重置全部数据 |
| GET | `/api/admin/db/tables` | admin.database.access | 表列表 |
| GET/POST/DELETE | `/api/admin/db/tables/{tableName}...` | admin.database.access | 行级操作 |
| GET | `/api/admin/backup` | admin.database.access | 全库备份下载 |
| POST | `/api/admin/backup/import` | admin.database.reset_all | 备份导入 |
| GET/POST | `/api/admin/player-data/export...` | admin.database.clear_players | 玩家数据文件导出 |
| GET | `/api/admin/player-data/list` | admin.database.clear_players | 数据文件列表 |

### 运营

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET/POST/DELETE | `/api/admin/redeem-codes...` | admin.redeem.code.manage | 兑换码管理 |
| GET/POST/DELETE | `/api/admin/blacklist...` | admin.blacklist.manage | 黑名单 |
| GET/POST/DELETE | `/api/admin/onebot/groups...` | admin.onebot.group.config | 群组配置 |
| GET/POST | `/api/admin/plugins...` | admin.plugins.manage | 插件管理 |
| GET | `/api/admin/adapters` | admin.adapters | 适配器状态 |
| PUT | `/api/admin/adapters` | admin.adapters | 适配器配置 |
| GET/POST | `/api/admin/oauth/config` | admin.oauth.manage | OAuth2 配置 |
| GET/POST | `/api/admin/newbie-reward/config` | admin.config.manage | 新手奖励配置 |
| GET | `/api/admin/stats/messages` / `commands` | admin.status | 统计 |

## 其他端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mc-command` | Minecraft 桥接指令入口（mcName, mcUuid, command, args） |
| GET | `/api/test/test` | 连通性测试（返回 hyw） |

## 错误码

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001-1005 | 认证错误（token 无效 / 未登录 / 用户或邮箱已存在 / 密码错误） |
| 2001-2002 | 参数错误 |
| 3001-3002 | 角色不存在 / 已存在 |
| 4001-4003 | 物品错误 |
| 5001-5005 | 突破与修炼错误 |
| 6001-6003 | 消息 / 限流错误 |
| 6101-6104 | 技能错误 |
| 7101-7102 | PVP 错误 |
| 8101-8104 | 秘境错误 |
| 8201-8202 | 游历错误 |
| 8301-8302 | 聊天错误 |
| 8401-8404 | 好友错误 |
| 9001-9002 | 服务器 / 网络错误 |

## 限流

REST 动作限流：聊天 10 次/60 秒、突破/修炼 5 次/60 秒、游历/秘境 6 次/60 秒、疗伤/好友 15 次/60 秒、其余 30 次/60 秒。超限返回 6003。

## 相关文档

- WebSocket 协议 → [WebSocket 协议](./websocket)
- 权限码 → [权限系统](./permissions)
- 认证与 OAuth → [架构总览](./architecture)
