# 账号与角色

修仙世界采用**一个用户账号（`users`）→ 一个角色（`players`）**的模型，用户账号可以同时被多个平台绑定：
OneBot 的 QQ 号、QQ 官方开放平台的 openid、Minecraft 的玩家 UUID，以及 Web 端的用户名/密码登录。
**所有平台共用同一个 `user_id`**，因此不管从哪个端登录，进入的都是同一个角色。

- 用户服务：`com.mtxgdn.service.UserService`（REST 认证入口 `com.mtxgdn.rest.Auth`）
- QQ（OneBot）账号流：`com.mtxgdn.onebot.OneBotWebSocketServer` 的 `OneBotAccountFlow` 实现
- QQ 官方绑定：`com.mtxgdn.onebot.QqOfficialBindingService`
- MC 账号流：`com.mtxgdn.minecraft.adapter.MinecraftAuthService` + `MinecraftPlayerBindingService`
- 指令：`com.mtxgdn.onebot.command.account`（注册 / 绑定 / 解绑 / 改密 / 注销 / 帮助）

## 账号体系总览

| 表 | 唯一键 | 作用 |
| --- | --- | --- |
| `users` | `username` 唯一 | 账号本体：用户名、BCrypt 密码、邮箱、失败次数、锁定时间 |
| `players` | `user_id` 唯一 | 角色：名称、境界、属性、位置、闭关状态等（一个用户最多一个角色） |
| `qq_bindings` | `qq_number` 唯一、`user_id` 唯一 | OneBot 渠道的 QQ 号 ↔ 用户 |
| `qq_official_bindings` | `(app_id, openid)` 唯一、`(app_id, user_id)` 唯一 | QQ 官方平台 openid ↔ 用户（按 AppID 隔离） |
| `mc_bindings` | `mc_uuid` 唯一、`user_id` 唯一 | Minecraft UUID/玩家名 ↔ 用户 |

::: tip 三端如何"打通"
任一平台绑定成功后都写入 `user_id`，玩家数据全部以 `players.user_id` 为锚点读取。
例如：先用 QQ 注册，再用 MC 的 `/bind` 输入同一组用户名密码 → 两个平台操作同一个角色。
:::

## 注册

### QQ（OneBot）注册流程

指令：`/注册 <角色名>`（别名 `register`）。该指令 `requiresLogin = false`（未绑定也能用），分类"账号"。

分四步交互，**第一步在群里回复，后续步骤强制私聊**（密码不落群）：

| 步骤 | 位置 | 内容 | 校验 |
| --- | --- | --- | --- |
| 1 | 群/私聊 | `/注册 <角色名>` | 角色名非空、长度 ≤ 16、未被占用 |
| 2 | **私聊** | 输入密码 | 长度 ≥ 6 |
| 3 | **私聊** | 输入邮箱（仅当 `verify_code.enabled = true`） | 邮箱格式校验 |
| 4 | **私聊** | 输入 6 位验证码 | `VerificationCodeService.verifyCode` |

任一步输入 `/cancel` 可取消整个流程。全部通过后 `doRegisterComplete` 依次执行：

```java
String hashedPassword = BCrypt.hashpw(password, BCrypt.gensalt());
userId = insertUser(session.username, hashedPassword, email);
PermissionService.assignDefaultRole(userId);          // 分配默认角色
bindingService.bind(senderQq, userId);               // 写 qq_bindings
PlayerInfo player = playerService.createPlayer(userId, session.username);  // 建角色
replyToSource(..., NewbieGuideService.getWelcomeMessage(player));
```

::: warning 注册失败会回滚
`createPlayer` 抛异常时，已写入的 `qq_bindings` 行与 `users` 行会被删除（`unbindByQq` + `deleteUser`），
避免出现"已绑定但没有角色"的孤儿账号。若历史上仍存在这种账号，再次 `/注册` 会自动**补建角色**而不是报错。
:::

### Web / REST 注册

`POST /api/auth/register`（`Auth.register` → `UserService.register`）。校验比 QQ 渠道更严：

| 项目 | 规则 |
| --- | --- |
| 用户名 | 3~32 字符，只允许字母、数字、下划线（正则 `^[a-zA-Z0-9_]{3,32}$`） |
| 密码 | **8~128 位** |
| 邮箱 | 必填（`verify_code.enabled = true` 时），需通过格式校验且域名在白名单内 |
| 邮箱白名单 | `verify_code.allowed_domains`，默认 `qq.com,163.com,126.com,gmail.com,outlook.com,hotmail.com` |
| 验证码 | 必填，`VerificationCodeService` 校验（6 位、5 分钟有效） |
| 用户名冲突 | 409 `AUTH_USERNAME_EXISTS` |
| 邮箱冲突 | 409 `该邮箱已被注册` |

成功后返回 `id` / `username` / `token`（JWT），并调用 `PermissionService.assignDefaultRole`。

::: warning QQ 渠道与 Web 渠道的密码长度要求不同
QQ 注册只要求 ≥ 6 位（`OneBotWebSocketServer` 里的 `passwordInput.length() < 6`），
Web 注册要求 ≥ 8 位（`UserService.register`）。同一账号在两端"能注册"的门槛不一致，源码如此。
:::

### 验证码

`POST /api/auth/send-code`（注册用）与 `POST /api/auth/forgot-password/send-code`（找回密码用）共用同一套限流与校验。

| 项目 | 值 |
| --- | --- |
| 验证码长度 | 6 位（`CODE_LENGTH`） |
| 有效期 | 5 分钟（`EXPIRY_MINUTES`） |
| 发送间隔 | 60 秒（`RATE_LIMIT_SECONDS`） |
| 连续错误上限 | 3 次（`MAX_VERIFY_FAILURES`） |
| 错误锁定 | 5 分钟（`VERIFY_LOCK_MS`） |
| 附加限流 | 来源 10 次/分 + 来源 30 次/时 + 全局 300 次/时 |

## 登录

### Web / REST 登录

`POST /api/auth/login` → `UserService.login`，成功签发 JWT；`POST /api/auth/logout` 登出。

| 项目 | 规则 |
| --- | --- |
| 密码存储 | BCrypt 哈希（`BCrypt.hashpw` / `BCrypt.checkpw`） |
| 失败锁定 | **连续失败 5 次**后锁定 **15 分钟**（`incrementFailedAttempts`：`maxAttempts = 5`、`lockDurationMinutes = 15`） |
| 锁定判定 | `users.locked_until > 当前时间` 时直接拒绝 |
| 成功登录 | `failed_attempts = 0`、`locked_until = NULL` |

### QQ / MC 渠道的密码校验

QQ 与 MC 的 `/绑定`、`/改密`、`/注销` 都调用同一套 `verifyUserCredentials`：

- 限流：同一用户名 **60 秒内最多 5 次**（`RateLimiter.allow("onebot_login_<username>", 5, 60)`）；
- 锁定：`users.locked_until` 未过期时直接失败；
- 失败：累计 `failed_attempts`（同样 5 次锁 15 分钟）；
- 成功：重置失败计数并返回 `userId`。

### 会话与鉴权

- Web 端用 JWT（`JwtUtil.generateToken(userId, username)`）访问 `/api/*`，由 `JwtAuthFilter` 校验。
- QQ / MC 渠道没有"登录"概念：**绑定即身份**，每条指令用发送者的 QQ 号 / MC UUID 反查 `user_id`。

## 找回密码

仅 Web 端提供（QQ 渠道请用 `/改密`）：

| 步骤 | 接口 | 请求体 |
| --- | --- | --- |
| 1 | `POST /api/auth/forgot-password/send-code` | `{"email": "..."}` |
| 2 | `POST /api/auth/forgot-password/reset` | `{"email": "...", "code": "...", "newPassword": "..."}` |

规则：

- 邮箱必须已注册且格式合法，否则 400；
- `newPassword` 长度 **不少于 6 位**（`Auth.resetPassword` 校验 `newPassword.length() < 6`）；
- 验证码错误或过期返回 400 `验证码错误或已过期（连续错误 3 次将锁定）`；
- 已被锁定（3 次错误）返回 429，提示 5 分钟后再试；
- 校验通过后调用 `UserService.resetPasswordByEmail` 重写 BCrypt 哈希。

## 绑定与解绑

### QQ（OneBot）

| 指令 | 别名 | 流程 |
| --- | --- | --- |
| `/绑定` | `bind` | 私聊交互：输入游戏用户名 → 输入密码 → 校验通过后写 `qq_bindings` |
| `/解绑` | `unbind` | 直接删除本 QQ 号的绑定行 |

- `/绑定` 需私聊（`privateOnly = true`），未绑定账号时提示"请先绑定账号"。
- 绑定成功后若该账号**邮箱为空**，会自动写入 `<QQ号>@qq.com` 作为占位邮箱。
- 已绑定的 QQ 再次 `/绑定` 会提示"你已绑定账号 (用户ID: N)，/unbind 可解绑"。
- 同一 QQ 号或同一用户已有绑定时，`QqBindingService.bind` 会抛出"该QQ号已绑定用户: N" / "该用户已绑定QQ号: ..."。

### QQ 官方开放平台

`QqOfficialBindingService` 与 OneBot 完全独立：

- QQ 官方下发的是 **openid**（不是真实 QQ 号），因此使用独立表 `qq_official_bindings`；
- 唯一键带 `app_id` 维度，同一真人在不同机器人（不同 AppID）下 openid 不同，互不冲突；
- 查询时若限定了 `appId`，优先命中本机器人的绑定，其次回落到历史 `app_id = ''` 的记录；
- 跨平台展示查询用无参构造（不限 AppID），但**不能用于绑定**。

### Minecraft

MC 端指令前缀可配置，流程与 QQ 类似：

| 指令 | 流程 |
| --- | --- |
| `<前缀>register <角色名>` | 校验 UUID 未绑定 → 私聊式交互输入密码 → 建用户 + 绑定 + 建角色 |
| `<前缀>bind` | 输入用户名 → 输入密码 → 写 `mc_bindings` |
| `<前缀>unbind` | 按 `mc_uuid` 删除绑定 |

- UUID 解析：`minecraft.online_mode = true` 时查 Mojang API 拿正版 UUID，否则用
  `UUID.nameUUIDFromBytes("OfflinePlayer:" + 玩家名)` 生成离线 UUID。
- `mc_bindings` 同时记录 `mc_uuid`（唯一）与 `mc_name`，玩家改名后可通过
  `UPDATE mc_bindings SET mc_name = ? WHERE mc_uuid = ?` 同步。

## 修改密码

| 渠道 | 用法 | 规则 |
| --- | --- | --- |
| QQ | `/改密`（别名 `changepassword`、`changepwd`） | 私聊交互：输入当前密码 → 输入新密码（≥ 6 位） |
| Web | `POST /api/auth/change-password` | `UserService.changePassword(userId, oldPassword, newPassword)` |

- QQ 渠道未绑定时提示"你尚未绑定账号，请先 /绑定"；
- 当前密码错误会要求重新输入（不退出流程）；
- 新密码重新 BCrypt 哈希后写回 `users.password`，并记录玩家行为日志（"修改密码/成功"）。

## 注销账号

| 渠道 | 用法 |
| --- | --- |
| QQ | `/注销`（别名 `deleteaccount`） |
| Web | `DELETE /api/auth/account` |

QQ 流程：私聊 → 提示"⚠ 此操作不可逆！" → 输入账号密码确认 → 依次执行
`deletePlayer(playerId)` → `deleteUser(userId)` → `unbindByQq(qq)`，成功后回复"账号已注销"。

::: warning 注销是级联删除
`players`、`players_items`、`qq_bindings` 等表均对 `user_id` / `player_id` 设置了 `ON DELETE CASCADE`
（SQLite 开启外键时），角色、背包、绑定关系会一并消失，无法恢复。
Web 端删号还要求二次身份确认，不能仅凭一个可能被窃取的 Bearer token 删除账号。
:::

## 角色创建

`PlayerService.createPlayer(userId, name)` 是**四个通道（REST / OneBot / QQ官方 / MC）共用的唯一入口**：

| 步骤 | 说明 |
| --- | --- |
| 1 | `normalizePlayerName`：`TextSanitizer.sanitizePlayerName` 净化 + 长度上限 **16 字**（`MAX_PLAYER_NAME_LENGTH`），空名抛 `IllegalArgumentException` |
| 2 | `SpiritualRoot.drawRandom` **随机抽取灵根**，并用灵根加成修正初始属性 |
| 3 | 插入 `players`：等级 1、境界 0、位置 1、`tutorial_step = 1` |
| 4 | 发放新手奖励（`NewbieRewardConfig`：金币、灵石、物品，可在配置中关闭） |
| 5 | 授予称号「初入仙途」（`beginner`） |
| 6 | 若启用了文件化存储，导出该玩家的数据文件 |

初始属性（灵根加成前）：

| 属性 | 值 |
| --- | --- |
| 生命 / 生命上限 | 100 / 100 |
| 法力 / 法力上限 | 50 / 50 |
| 攻击 | 10 |
| 防御 | 5 |
| 速度 | 5 |
| 神识 | 5 |
| 金币 | 0 |

灵根加成通过 `root.applyHpBonus(100)` 等方法作用在初始值上（不同灵根加成不同，详见 [灵根系统](./spiritual-root)）。

### 角色改名

**QQ 渠道没有改名指令。** 改名只在管理端提供：

- REST：`AdminResource.renamePlayer` → `PlayerService.updatePlayerName(playerId, newName)`；
- 校验与创角完全一致（同一套净化 + 16 字上限），失败返回 `false`，不会写入危险字符或超长名称。

## 常用账号指令

| 指令 | 别名 | 权限 | 说明 |
| --- | --- | --- | --- |
| `/注册 <角色名>` | `register` | — | 注册并创建角色 |
| `/绑定` | `bind` | — | 绑定已有账号（仅私聊） |
| `/解绑` | `unbind` | `game.player.info` | 解除绑定（仅私聊） |
| `/改密` | `changepassword`、`changepwd` | `game.player.info` | 修改密码（仅私聊） |
| `/注销` | `deleteaccount` | `game.player.info` | 注销账号（仅私聊，不可逆） |
| `/帮助` | `help` | — | 查看全部可用指令（按分类分组，受权限与模块门控过滤） |

`/帮助` 会遍历 `CommandRegistry.getAllUnique()`，跳过 `shouldShowInHelp` 为 false 的指令
（如 `RedeemCommand`、未启用模块下的指令），并按 `Command.getCategoryOrder()` 排序分类：
账号 → 我的角色 → 修炼 → 战斗 → 背包 → 探索 → 坊市 → 宗门 → 经济 → 社交 → 管理 → 实用功能。

## 表结构

`users`：

| 字段 | 说明 |
| --- | --- |
| `id` | 用户 ID（自增主键） |
| `username` | 用户名，唯一 |
| `password` | BCrypt 哈希 |
| `email` | 邮箱，默认空串 |
| `failed_attempts` | 连续登录失败次数 |
| `locked_until` | 锁定到期时间 |
| `created_at` | 创建时间 |

`qq_bindings` / `mc_bindings`：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `qq_bindings` | `qq_number` | QQ 号，唯一 |
| | `user_id` | 用户 ID，唯一 |
| `mc_bindings` | `mc_uuid` | MC UUID，唯一 |
| | `mc_name` | MC 玩家名 |
| | `user_id` | 用户 ID，唯一 |

`qq_official_bindings`：

| 字段 | 说明 |
| --- | --- |
| `app_id` | 机器人 AppID，默认空串 |
| `openid` | 平台下发的用户标识 |
| `user_id` | 用户 ID |
| 唯一键 | `(app_id, openid)`、`(app_id, user_id)` |

## 常见问题

::: details QQ 群里 `/注册` 之后为什么没反应？
注册的密码/邮箱/验证码步骤**只接受私聊消息**。请在群内看到"角色名可用"的提示后，**私聊机器人**继续输入密码。
:::

::: details 提示"你已注册角色，无需重复注册"
该 QQ 号已在 `qq_bindings` 中绑定。想换号请先 `/解绑`（解绑只删绑定关系，不删角色），
再用另一个 QQ 号 `/绑定` 到同一账号。
:::

::: details 登录提示被锁定怎么办？
连续 5 次密码错误会锁定 15 分钟（`users.locked_until`）。等待到期后重试，或通过 Web 端
「找回密码」用邮箱验证码重置密码。
:::

::: details 换了 MC 名字，绑定还在吗？
绑定按 `mc_uuid` 记录，改名不影响绑定；系统会用 `mc_name` 字段同步显示名。
:::

## 相关页面

- [灵根系统](./spiritual-root) —— 创建角色时随机抽取
- [修炼系统](./cultivation) —— 建号后的第一步
- [社交系统](./social) —— 好友、聊天与组队
- [玩家玩法总览与全指令表](./)
