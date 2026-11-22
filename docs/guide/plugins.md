# 插件配置

服务端的玩法被拆成 **33 个可独立启停的插件**：26 个稳定玩法模块、2 个实验性插件、
5 个消息通道适配器。

每个插件有**自己的一分配置文件**，放在 `config/plugins/` 目录下。文件里既有
"这个模块开不开"的开关，也有"这个模块怎么调"的参数。

```
config/plugins/
├── cultivation.yml     ← 修炼：开关 + 连败增益、凝实层数…
├── world_boss.yml      ← 世界 Boss：开关 + 血量倍率、冷却、分红…
├── trade.yml           ← 坊市：开关 + 挂单时限、价格历史保留天数
├── inventory.yml       ← 背包/装备：开关 + 格子数、装备耐久
└── …
```

::: tip 为什么每个插件一个文件
以前开关全挤在 `config/plugins.yml` 里，而各模块的可调参数又散在
`application.yml` 的 `market` / `sect` / `world_boss` / `buff` 等段里。于是：

- 想调"世界 Boss 的血量倍率"，得先去一个几百行的全局文件里翻到 `world_boss` 段；
- 想知道"世界 Boss 到底能不能关"，却要去**另一个**文件里找。

两处割裂。现在打开 `config/plugins/world_boss.yml`，一个文件的全部内容就是
"这个模块有什么开关、有哪些可调项"。
:::

## 文件格式

```yaml
# config/plugins/world_boss.yml
enabled: true          # 开关：本文件即归属地

# 以下都是该模块的可调参数
scope: global          # Boss 池归属键
boss_count: 3          # 池内 Boss 数量
hp_multiplier: 12      # 血量倍率
max_stage_gap: 9       # 挑战境界门槛
```

| 键 | 含义 |
| --- | --- |
| `enabled: true` | 启用（默认） |
| `enabled: false` | 停用，**重启后完全生效** |
| 整行注释掉 | 等同于使用默认值 |
| 其余键 | 该插件的可调参数，缺省时回落到 `application.yml` |

## 取值优先级

参数与开关共用同一套查找链，从高到低：

```
-D 系统属性                     （运维应急覆盖，最高）
        ↓ 没有时
运行期的临时覆盖（WebUI 改开关）
        ↓ 没有时
config/plugins/<插件名>.yml     ← 参数与开关的归属地
        ↓ 文件里没写这个键时
config/application.yml          （旧位置，降级为兜底）
        ↓ 还是没有时
jar 内置模板里的默认值
```

::: tip 升级不会丢设置
插件文件里**没写**的键会自动回落到 `application.yml`，所以从旧版本升级上来时，
你原来在 `application.yml` 里调过的 `world_boss.hp_multiplier` 依然生效 ——
除非你在新的插件文件里写了同名项。
:::

::: warning application.yml 里的同名项已降级
新版本把各插件段从 `application.yml` 里移走了，原位置改成了"已搬到
`config/plugins/<插件名>.yml`"的指引注释。如果你手上还有旧版本的
`config/application.yml`，里面的 `market.*`、`world_boss.*` 等仍然会被读取，
但**只在你没在插件文件里写该项时**才生效。要调参数请改插件文件。
:::

## 通用设置不属于任何插件

以下设置**留在 `application.yml`**，不拆到插件文件里 ——
它们不属于任何单个模块，拆出去只会让人找不到：

`server` · `database` · `jwt` · `oauth2` · `player-data` · `install` ·
`admin` · `smtp` · `verify_code` · `logging` · `i18n` · `performance` ·
`network` · `motd` · `restart` · `app` · `security` · `permission` ·
`plugins.hot_swap`

## 全部插件

### 基础玩法模块

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `exploration` | `exploration.yml` | ✅ | 探索/游历系统（游历事件、随机遭遇） |
| `secret_realm` | `secret_realm.yml` | ✅ | 秘境系统（进入秘境、秘境探索） |
| `trade` | `trade.yml` | ✅ | 坊市交易系统（上架、购买、取消） |
| `sect` | `sect.yml` | ✅ | 宗门系统（创建宗门、宗门管理、宗门仓库） |
| `farm` | `farm.yml` | ✅ | 农场系统（种植、浇水、施肥、收获） |
| `cave` | `cave.yml` | ✅ | 洞府系统（灵力收集、洞府升级） |

### 社交玩法模块

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `chat` | `chat.yml` | ✅ | 聊天系统（世界频道、私聊） |
| `friend` | `friend.yml` | ✅ | 好友系统（添加好友、好友列表） |
| `rank` | `rank.yml` | ✅ | 排行系统（查看排行榜） |
| `search` | `search.yml` | ✅ | 搜索系统（按名称搜索玩家） |

### 移动 / 养成玩法模块

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `map` | `map.yml` | ✅ | 地图系统（查看地图、移动旅行、野外） |
| `team` | `team.yml` | ✅ | 团队系统（创建团队、组队副本） |
| `title` | `title.yml` | ✅ | 称号系统（成就、称号装备） |
| `player` | `player.yml` | ✅ | 角色系统（状态、疗伤、灵根） |
| `collection` | `collection.yml` | ✅ | 全图鉴（收集物品/称号/功法等，逐条解锁发奖） |

### 修炼 / 战斗玩法模块

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `cultivation` | `cultivation.yml` | ✅ | 修炼系统（打坐、突破、转世、天象、晨修） |
| `skill` | `skill.yml` | ✅ | 技能系统（学习技能、技能列表、战斗策略） |
| `pvp` | `pvp.yml` | ✅ | 战斗系统（挑战、决斗） |
| `world_boss` | `world_boss.yml` | ✅ | 世界 Boss（全服共享血量、按伤害分红） |
| `inventory` | `inventory.yml` | ✅ | 背包/装备系统（物品、装备、强化） |

### 经济 / 制造玩法模块

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `economy` | `economy.yml` | ✅ | 经济系统（拍卖、灵庄、商店、签到） |
| `energy` | `energy.yml` | ✅ | 能量系统（物品转化能量） |
| `technique` | `technique.yml` | ✅ | 功法系统（功法学习、装备、升级） |
| `crafting` | `crafting.yml` | ✅ | 炼丹锻造系统（配方、炼制） |
| `buff` | `buff.yml` | ✅ | Buff 系统（增益效果） |
| `formation` | `formation.yml` | ✅ | 阵法系统（阵法布置、阵法加成） |

### 实验性插件

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `experimental_sect_war` | `experimental_sect_war.yml` | ❌ **关闭** | 宗门战（实验性） |
| `experimental_energy_exchange` | `experimental_energy_exchange.yml` | ✅ 开启 | 能量转化/等价交换（实验性） |

::: warning 实验性插件默认值不一致
`experimental_sect_war` 默认**关闭**，`experimental_energy_exchange` 默认**开启**。
两者由旧 `config/experimental.yml` 的 `sect_war` / `energy_exchange` 迁移而来。

停用即整体关闭该实验性内容：相关指令/接口会被门控拒绝。
:::

### 消息通道适配器

| 插件 | 配置文件 | 默认 | 说明 |
| --- | --- | --- | --- |
| `onebot` | `onebot.yml` | ✅ | OneBot WebSocket/截图 消息通道 |
| `qq` | `qq.yml` | ✅ | QQ 官方机器人消息通道 |
| `minecraft` | `minecraft.yml` | ✅ | Minecraft 内嵌服务器消息通道 |
| `minecraft-player` | `minecraft-player.yml` | ✅ | Minecraft 玩家直连消息通道 |
| `sandbox` | `sandbox.yml` | ✅ | 沙箱模拟通道（后台调试用，建独立沙箱账号跑真实指令） |

::: tip 类型级 vs 实例级
这五个是**类型级总开关**，关掉等于整类通道停用。

具体某个机器人实例（哪个地址、哪个端口、是否启用）由
`config/adapters.json` 控制，两者是"与"的关系 ——
类型开关为 `false` 时，实例配得再全也不会启动。

详见[消息通道与适配器](/dev/adapters)。
:::

::: warning 外部插件不受本目录控制
`plugins/*.jar` 形式的第三方插件，其开关由插件自身的启停状态管理。
:::

## 各插件的可调参数

带参数的插件只有 10 个，其余 23 个是纯开关。参数键名沿用原来的前缀，
所以你在旧文档/旧配置里看到的键名依然有效：

| 配置文件 | 包含的参数前缀 | 说明 |
| --- | --- | --- |
| `cultivation.yml` | `breakthrough.*`、`season.*` | 连败增益、凝实层数；季节更替 |
| `world_boss.yml` | `world_boss.*` | 血量倍率、挑战冷却、奖励熔断 |
| `trade.yml` | `market.*` | 挂单时限、价格历史保留 |
| `sect.yml` | `sect.*` | 宗主缺位判定、竞争期 |
| `inventory.yml` | `inventory.*`、`equipment.*` | 背包格子、装备耐久 |
| `buff.yml` | `buff.*` | 过期回收间隔 |
| `map.yml` | `wilderness.*` | 野外生成参数 |
| `onebot.yml` | `onebot.*` | 发送模式、截图 |
| `minecraft.yml` | `minecraft.*` | 服务端路径、内存、桥接令牌 |
| `sandbox.yml` | `data_dir`、`max_sessions`、`history_limit` | 沙箱数据目录、会话上限、历史保留行数 |

::: tip `market.*` 归在 `trade.yml` 是刻意的
"坊市"在代码里叫 `trade`（插件名），配置键沿用 `market`。
两者指的是同一个模块，键名保持不变是为了不让既有配置与调用点失效。
:::

## 在 WebUI 里运行时启停

除了改文件，也可以在**管理后台 → 插件管理**页直接开关：

1. 登录管理后台（需要 `admin.plugins` 权限）
2. 进入「插件管理」
3. 切换开关 —— 选择会**写回该插件自己的配置文件**（保留注释与排版）
4. 页面会提示是否需要重启才能完全生效

::: tip 在线启停的边界
运行时启停会立即改变**指令与接口的门控状态**（停用后相关指令立刻不可用）。
但如果该模块注册了后台定时任务，已启动的任务需要重启进程才会彻底停止。
:::

## 停用后会发生什么

| 受影响的东西 | 行为 |
| --- | --- |
| 玩家指令 | 指令注册表返回 `null`，玩家看到"功能未开放"类提示 |
| REST 接口 | 被 `ModuleGateFilter` 拦截 |
| WebSocket action | 同样被门控拒绝 |
| 后台定时任务 | 不再执行（重启后彻底停止） |
| 数据库数据 | **不会删除**。重新启用后数据仍在 |

::: danger 停用不等于卸载
关掉模块只是让它不工作，**数据库里的相关数据会原样保留**。
如果之后重新启用，玩家的宗门、挂单、农田等都会回来。
:::

## 从旧版本升级

旧版把开关写在 `config/plugins.yml` 一个文件里（`plugins:` 段下的一串 true/false）。
升级后：

1. 首次启动会把 jar 内的 31 个插件配置模板**释放到 `config/plugins/`**；
2. 已存在的文件**不会被覆盖** —— 你改过的值不会被抹掉；
3. 旧 `config/plugins.yml` 仍然被读取，作为**兜底**（优先级低于插件文件）；
4. 旧的 `config/experimental.yml` 与 `application.yml` 里的 `built_in_plugins.*`
   同样保留为只读兜底。

::: tip 想彻底完成迁移
在 `config/plugins/<插件名>.yml` 里把 `enabled` 显式写出来，
就可以删掉旧的 `config/plugins.yml`、`config/experimental.yml`，
以及 `application.yml` 里遗留的 `built_in_plugins` 段。
:::
