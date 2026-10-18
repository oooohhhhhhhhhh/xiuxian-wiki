# 玩法总览与全指令表

本页是**玩家侧的总入口**：先讲清楚怎么玩、有哪些系统，再给出**全部 81 条指令**的完整清单。

::: tip 想找某个功能怎么用？
按 `Ctrl+F` 搜指令名（如 `/打坐`）或搜关键词（如"坊市"）。
如果知道想看哪个系统，直接看下面的[系统导航](#系统导航)。
:::

## 怎么玩

### 四个入口

| 入口 | 说明 |
| --- | --- |
| **QQ 群 / 私聊** | 通过 OneBot 接入，在群里发 `/指令` |
| **QQ 官方机器人** | 同上，走官方 API |
| **Minecraft 内** | 装了桥接插件后，游戏内发 `/xiuxian <子命令>` |
| **Web 客户端 / 第三方** | 走 [REST API](/dev/rest-api) 或 [WebSocket](/dev/websocket) |

::: tip 指令语法在所有通道一致
QQ 里发 `/打坐`，Minecraft 里发 `/xiuxian 打坐`（前缀由 `minecraft.command_prefix` 配置），
效果完全相同 —— 都走同一套[指令框架](/dev/commands)。
:::

### 第一步：绑定账号

```
/绑定 <账号> <密码>
```

或者直接注册：

```
/注册 <账号> <密码>
```

绑定后先创建角色：

```
/创建角色 <名字>
```

然后抽取灵根：

```
/灵根
```

::: warning 没有角色什么都做不了
绝大多数指令都要求**已绑定账号 + 已创建角色**，
否则会提示"角色不存在，请先创建角色"（错误码 `3001`）。
:::

### 然后做什么

1. **`/打坐`** —— 开始修炼，挂机攒经验
2. **`/突破`** —— 经验够了就突破境界；拿不准先用 `/突破 预览` 看成功率
3. **`/游历`** —— 赚资源、碰机缘
4. **`/宗门`** —— 加入宗门拿加成
5. **`/世界boss`** —— 打全服共享血量的世界 Boss，按伤害分红
6. **`/坊市`** —— 买卖物品

## 系统导航

按玩法领域分类，点进去看详细机制：

### 修炼与成长

| 系统 | 页面 | 一句话 |
| --- | --- | --- |
| 修炼 | [修炼系统](/player/cultivation) | 打坐/闭关攒经验，受境界、季节、地点、灵根、功法等多重加成 |
| 境界 | [境界与突破](/player/realm) | 11 大境界 29 档位，突破要经验 + 灵石；连败必涨概率、可凝实极境 |
| 灵根 | [灵根系统](/player/spiritual-root) | 17 种灵根，各有特殊效果，可重铸 |
| 功法 | [功法系统](/player/techniques) | 学习/装备/升级功法，提升战力 |
| 技能 | [技能系统](/player/skills) | 战斗中触发的主动技能 |
| Buff | [Buff 系统](/player/buff) | 临时属性加成与反弹 |
| 称号 | [称号系统](/player/titles) | 达成条件解锁，提供永久加成 |
| 阵法 | [阵法系统](/player/formation) | 洞府阵法，提升修炼与防御 |

### 战斗

| 系统 | 页面 | 一句话 |
| --- | --- | --- |
| PVE | [PVE 战斗](/player/combat) | 野外怪、妖兽、团队 Boss |
| PVP | [PVP 对战](/player/pvp) | 挑战/决斗其他玩家，每日 10 次 |
| 世界 Boss | [世界 Boss](/player/world-boss) | 全服共享血量，按伤害分红，补最后一刀另有加成 |

### 探索与地图

| 系统 | 页面 | 一句话 |
| --- | --- | --- |
| 游历 | [游历探索](/player/exploration) | 13 种随机事件，300 秒冷却 |
| 秘境 | [秘境探索](/player/secret-realm) | 10 个秘境，单人/团队两种 |
| 地图 | [世界地图](/player/map) | 15 个地点，灵气倍率不同 |
| 洞府 | [洞府系统](/player/cave) | 个人洞府，可升级 |
| 季节 | [季节系统](/player/season) | 四季更替，影响修炼与产出 |

### 物品与生产

| 系统 | 页面 | 一句话 |
| --- | --- | --- |
| 物品 | [物品系统](/player/items) | 114 个物品，8 类型 6 品质 |
| 装备 | [装备与强化](/player/equipment) | 3 个栏位，强化最高 +15 |
| 炼制 | [炼丹与锻造](/player/crafting) | 33 条配方 |
| 农田 | [灵田农场](/player/farm) | 种植灵药，受季节影响 |
| 能量 | [能量转化](/player/energy) | 物品转化能量，80% 损耗 |

### 经济与社交

| 系统 | 页面 | 一句话 |
| --- | --- | --- |
| 经济 | [经济系统](/player/economy) | 四种灵石面额（自动压缩）、银行、竞拍 |
| 坊市 | [坊市交易](/player/market) | 玩家间挂单交易，抽 5% 手续费 |
| 宗门 | [宗门系统](/player/sect) | 创建/加入宗门，仓库与宗门战，宗主退位与自动继位 |
| 社交 | [社交系统](/player/social) | 好友、聊天、排行 |
| 日常 | [每日系统](/player/daily) | 签到、晨修、每日任务 |
| 账号 | [账号与角色](/player/account) | 注册、绑定、改密、注销 |

## 全部指令

共 **83 条指令**（不含别名，`Command` 子类实测 83 个）。表格里：

- **指令** 列是主名，括号内是别名
- **模块** 列是该指令所属的内置玩法模块，对应 `config/plugins.yml` 的开关键
- 标了 ⚠️ 的分类**不在**框架的 `CATEGORY_ORDER` 表里，所以在 `/帮助` 中会排在最后

### 账号

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/帮助** （/help） | 查看所有可用指令 | — | — |
| **/绑定** （/bind） | 将QQ/MC号绑定到已有游戏账号 | — | — |
| **/改密** （/changepassword /changepwd） | 修改游戏账号密码 | `game.player.info` | — |
| **/解绑** （/unbind） | 解除QQ号/MC号与游戏账号的绑定 | `game.player.info` | — |
| **/注册** （/register） | 注册修仙角色 | — | — |
| **/注销** （/deleteaccount） | 注销游戏账号（不可逆） | `game.player.info` | — |

### 我的角色

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/称号** （/title /chenghao） | 查看/装备/卸下称号 | — | `title` |

::: tip 新手引导
第一次进服的玩家会走一遍「打坐 → 停止 → 游历 → 秘境 → 突破 → 晨修 → 出师」的主线引导，
并在功能首用时收到 💡 提示。见[新手引导](/player/guide)。
:::
| **/疗伤** （/heal） | 恢复伤势 | `game.player.info` | `player` |
| **/灵根** （/spiritualroot /talent） | 查看角色的灵根天赋 | — | `player` |
| **/状态** （/信息 /status /info） | 查看角色状态（含离线收益） | `game.player.info` | `player` |

### 修炼

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/晨修** （/morning） | 每日晨修，获取天象加成 | `game.player.info` | `cultivation` |
| **/打坐** （/闭关 /meditate /cultivate） | 开始打坐修炼 | `game.cultivate` | `cultivation` |
| **/天象** （/daily） | 查看今日天象与机缘 | `game.player.info` | `cultivation` |
| **/停止** （/stop） | 结束打坐并结算灵力 | `game.cultivate` | `cultivation` |
| **/突破** （/breakthrough） | 突破当前境界；子命令 `预览` 查成功率、`凝实` 淬体 | `game.realm.breakthrough` | `cultivation` |
| **/转世** （/reincarnate） | 金仙满级后转世重修，保留三成修为重新攀登 | `game.player.info` | `cultivation` |

### 战斗

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/功法** （/technique /tj） | 功法系统 — 学习/装备/卸下/升级功法 | — | `technique` |
| **/技能** （/skills） | 查看可用技能列表 | `game.player.info` | `skill` |
| **/决斗** （/切磋 /fight /战斗 /讨伐 /boss） | 决斗系统 | — | `pvp` |
| **/挑战** （/pvp） | 挑战其他修士 | `game.pvp.challenge` | `pvp` |
| **/学习** （/learn） | 学习指定技能（支持名称或ID） | `game.skill.learn` | `skill` |
| **/战斗策略** （/战术 /tactic） | 设置战斗策略 | — | `skill` |
| **/世界boss** （/worldboss） | 世界 Boss：查看池子 / `挑战` / `排行` / `刷新`（管理员） | `game.player.info` | `world_boss` |

### 背包

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/背包** （/backpack） | 查看背包中的物品 | `game.inventory.view` | `inventory` |
| **/兑换** （/redeem） | 使用兑换码领取奖励 | `game.redeem.code` | — |
| **/使用** （/itemuse） | 使用背包中的物品 | `game.item.use` | `inventory` |
| **/物品列表** （/itemmap） | 查看物品中文名与key映射表 | `game.player.info` | `inventory` |
| **/卸下** （/unequip） | 卸下指定部位的装备 | `game.equipment.equip` | `inventory` |
| **/已装备** （/equipped） | 查看当前装备 | `game.inventory.view` | `inventory` |
| **/装备** （/equip） | 穿戴装备到指定部位 | `game.equipment.equip` | `inventory` |

### 探索

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/地图** （/map） | 查看游戏地图 | `game.player.info` | `map` |
| **/野外** （/wilderness /wild） | 查看所在野外分片的地形、危险度、资源与邻片 | `game.player.info` | `map` |
| **/采集** （/gather /collect） | 在野外采集资源 | `game.player.info` | `map` |
| **/进入秘境** （/secret_enter） | 进入指定秘境 | `game.secret_realm` | `secret_realm` |
| **/秘境** （/secret） | 查看可用秘境 | `game.secret_realm` | `secret_realm` |
| **/游历** （/explore） | 外出游历探索 | `game.explore` | `exploration` |
| **/种田** （/farm） | 种田系统 | — | `farm` |

### 坊市

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/撤单** （/cancellisting） | 撤回坊市挂单 | `game.player.info` | `trade` |
| **/坊市** （/market） | 查看坊市交易挂单 | `game.player.info` | `trade` |
| **/购买** （/buy） | 购买坊市中的物品 | `game.player.info` | `trade` |
| **/上架** （/list） | 将物品上架坊市 | `game.player.info` | `trade` |
| **/我的挂单** （/mylistings） | 查看我在坊市的挂单 | `game.player.info` | `trade` |
| **/行情** （/price） | 查看坊市成交行情，辅助定价 | `game.player.info` | `trade` |

### 宗门

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/宗门** （/sect） | 宗门管理：输入 /宗门 help 查看所有子命令（含 `退位`、`挑战`） | `game.sect.manage` | `sect` |
| **/组队** （/team） | 组队系统（2-5人，可挑战团队副本） | — | `team` |

### 经济

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/回收** （/recycle） | 将物品回收为灵石 | — | `economy` |
| **/货币兑换** （/币兑 /currency_exchange） | 金币与下品灵石双向兑换 | `game.player.info` | `economy` |
| **/灵石兑换** （/石兑） | 兑换不同品质的灵石 | `game.player.info` | `economy` |
| **/灵庄** （/bank） | 灵石存取·利息生息 | — | `economy` |
| **/拍卖** （/auction） | 竞拍行 — 限时竞价交易 | — | `economy` |
| **/签到** （/signin） | 每日签到领取灵石奖励 | — | `economy` |
| **/商店** （/shop） | 浏览灵石商店并购买商品 | — | `economy` |
| **/提纯** （/purify /灵石提纯） | 提纯灵石，将低级灵石升为高级灵石（消耗灵气，有概率失败，有境界需求） | `game.stone.purify` | `economy` |
| **/修炼加速** （/boost） | 燃烧灵石加速修炼 | — | `economy` |

### 社交

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/查人** （/查找 /search /playersearch） | 根据名称搜索玩家 | — | `search` |
| **/好友** （/friend） | 好友管理 | `game.friend.manage` | `friend` |
| **/排行** （/排行榜 /rank /rank2） | 查看排行榜 | — | `rank` |
| **/私聊** （/msg） | 发送私聊消息给其他玩家 | — | `chat` |

### 管理

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/编辑玩家** （/editplayer /修改玩家） | 修改玩家属性（仅私聊） | `admin.users.manage` | — |
| **/发放** （/give） | 给玩家发放物品/金币/灵力/灵石（仅私聊） | `admin.items.give` | — |
| **/发放物品** （/giveitem /give_item） | [管理] 向指定玩家发放物品 | `admin.items.give` | — |
| **/服务器状态** （/serverstatus） | 查看服务器运行状态（仅私聊） | `admin.status` | — |
| **/关闭服务端** （/shutdown /关闭服务器） | 关闭游戏服务器（仅私聊，需要 SUPER_ADMIN 权限） | `admin.shutdown` | — |
| **/轨迹** （/trace /玩家轨迹） | 查看玩家操作轨迹 | `qq.command.trace` | — |
| **/经济** （/economy） | 查看全服经济数据 | `admin.economy` | — |
| **/能量管理** （/energyadmin /energymanage） | 管理玩家的能量值（仅私聊） | `admin.status` | — |
| **/日志** （/logs /服务器日志） | 查看服务器最近日志（仅私聊） | `admin.logs.view` | — |
| **/玩家列表** （/players /playerslist） | 查看玩家列表（仅私聊，支持分页） | `admin.status` | — |
| **/玩家详情** （/playerinfo /playerdetail） | 查看指定玩家详情（仅私聊） | `admin.status` | — |
| **/全物品列表** （/items /allitems） | 查看所有物品列表（仅私聊，支持分页） | `admin.status` | — |
| **/修复装备** （/fixequip） | 修复装备数据一致性问题 | `admin.fix.equipment` | — |
| **/修改灵根** （/setroot /设置灵根） | 修改玩家的灵根（仅私聊，需要管理员权限） | `admin.users.manage` | — |
| **/用户列表** （/users /userlist） | 查看所有用户及其角色（仅私聊） | `admin.users.manage` | — |
| **/重启** （/restart） | 重启游戏服务器（仅私聊，需要 SUPER_ADMIN 权限） | `admin.shutdown` | — |
| **/cleardb_all** （/重置全部数据） | 重置全部数据并重新初始化（仅私聊） | `admin.database.reset_all` | — |
| **/cleardb_players** （/清除玩家数据） | 清除所有玩家数据（仅私聊） | `admin.database.clear_players` | — |
| **/debug** （/调试） | 快速调试所有指令（仅admin） | `admin.debug` | — |

### 实用功能

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/按钮** （/button /互动按钮） | QQ官方消息交互按钮（点击执行指令） | `game.player.info` | — |
| **/合成** （/炼制 /craft） | 合成系统 — 查看配方/合成物品 | — | `crafting` |
| **/增益** （/buff） | 查看当前增益状态 | — | `buff` |
| **/转化** （/exchange /convert） | 将物品转化为能量，或将能量兑换为物品 | — | `energy` |

### 洞府

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/洞府** （/cave） | 洞府管理：修炼、收集灵气、升级洞府 | `game.cave.manage` | `cave` |

### 阵法

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/阵法** （/formation） | 阵法系统 | `game.cultivate` | `formation` |

### 装备

| 指令 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- |
| **/强化** （/enhance） | 强化已装备的装备 | `game.equipment.enhance` | `inventory` |

## 指令使用要点

### 别名

大多数指令都有别名，中英文混用：

```
/打坐   /闭关   /meditate     ← 同一个指令
/背包   /inventory   /bag
```

别名在主名后面用括号列出。**别名不能重复**，重复时后注册的会覆盖先注册的。

### 模块门控

::: danger 停用的模块，指令会"消失"
表格里**模块**列不为 `—` 的指令，都会受 `config/plugins.yml` 的开关门控。

模块被停用时，`CommandRegistry.get()` 返回 `null`，玩家发指令会收到
"功能未开放"类提示。

管理员可在**管理后台 → 插件管理**里运行时启停（会写回配置文件）。
详见[插件开关](/guide/plugins)。
:::

### 权限码

表格里**权限码**列为 `—` 表示不校验权限（但通常仍要求已绑定账号）。

| 前缀 | 含义 |
| --- | --- |
| `game.*` | 玩家权限，默认 `PLAYER` 角色都有 |
| `admin.*` | 管理权限，只有管理员角色有 |
| `qq.command.trace` | QQ 侧指令追踪 |

::: warning 22 条指令没有独立权限码
它们依赖"已绑定账号"这一层校验。
具体判定见[权限系统](/dev/permissions)。
:::

### 每日限制

部分指令有每日次数上限，存在 `player_daily` 表：

| 指令 | 上限 |
| --- | --- |
| `/挑战`（PVP） | 10 次/天 |
| `/游历` | 受冷却限制（300 秒） |
| `/签到` | 1 次/天 |
| `/晨修` | 1 次/天 |

::: tip 每日刷新按服务器时区
所有"每日"判定基于 JVM 默认时区的 `LocalDate.now()`。
部署时如果不设 `TZ`，刷新时刻可能和玩家预期不一致。
:::

### 冷却

| 行为 | 冷却 |
| --- | --- |
| `/游历` | 300 秒（巽风灵根 210 秒） |
| `/秘境` | 每个秘境自己的 `cooldownMs` |
| 地图移动 | 5 秒 |

::: warning 秘境冷却是全局共享的
所有秘境共写 `players.last_secret_realm_time` 这一个时间戳，
用**目标秘境自己的**冷却时长判定。

所以打完一个秘境会同时进入其他秘境的冷却。
:::

## 常见问题

| 现象 | 原因 |
| --- | --- |
| "角色不存在，请先创建角色" | 还没 `/创建角色` |
| "功能未开放" | 该模块在 `plugins.yml` 里被停用 |
| "权限不足" | 账号没有对应权限码 |
| "操作太频繁" | 命中冷却或限流（错误码 `6003`） |
| 指令完全没反应 | 检查该平台的消息是否真的到了服务端 |

更多排查见[常见问题](/guide/faq)。
