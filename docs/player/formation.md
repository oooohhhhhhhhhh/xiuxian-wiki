# 阵法系统

阵法是**洞府专属的限时增益**：布置后在有效期内为角色提供灵气汇聚、修炼加成、战斗减伤、心魔抵抗四类效果。
一个角色同时**只能布置一个阵法**，到期或主动拆除后效果立即消失。

- 玩法模块：`formation`（`config/plugins.yml` 的 `built_in_plugins.formation`，默认启用）。模块停用后指令在 `/帮助` 中隐藏，分发被拦截。
- 数据表：`formations`
- 服务：`com.mtxgdn.game.service.FormationService`
- 指令：`com.mtxgdn.onebot.command.formation.FormationCommand`（同时注册了 5 条 HTTP 路由）

## 阵法总表

`formationKey` 与中文名映射、持续时间、基础费用、效果公式均来自 `Formation` 静态方法。

| formationKey | 名称 | 基础持续时间 | 基础费用（1 级） | 效果（按等级 L 计算） |
| --- | --- | --- | --- | --- |
| `spirit_gathering` | 聚灵阵 | 60 分钟 | 100 灵石 | 灵气汇聚 +5%×L；修炼加成 +3%×L；心魔抵抗 +1×L |
| `mountain_protection` | 护山大阵 | 120 分钟 | 300 灵石 | 防御加成 +10%×L（战斗减伤） |
| `maze` | 迷踪阵 | 30 分钟 | 50 灵石 | 防御加成 +5%×L（战斗减伤） |
| `purification` | 净化阵 | 90 分钟 | 200 灵石 | 修炼加成 +2%×L；心魔抵抗 +2×L |
| `time_acceleration` | 时间加速阵 | 15 分钟 | 500 灵石 | 灵气汇聚 +3%×L；修炼加成 +5%×L |

::: tip 费用公式
布置与升级的费用都是 `基础费用 × 目标等级`（`Formation.getPlaceCost`），**不是累加**：
布置 3 级聚灵阵 = 100×3 = 300 灵石；从 2 级升到 3 级同样是 300 灵石。
:::

## 各阵法逐级数值

等级上限 `Formation.MAX_LEVEL = 5`。

### 聚灵阵（`spirit_gathering`）

| 等级 | 灵气汇聚 | 修炼加成 | 心魔抵抗 | 布置/升级费用 |
| --- | --- | --- | --- | --- |
| 1 | +5% | +3% | +1 | 100 |
| 2 | +10% | +6% | +2 | 200 |
| 3 | +15% | +9% | +3 | 300 |
| 4 | +20% | +12% | +4 | 400 |
| 5 | +25% | +15% | +5 | 500 |

### 护山大阵（`mountain_protection`）

| 等级 | 防御加成（减伤） | 布置/升级费用 |
| --- | --- | --- |
| 1 | +10% | 300 |
| 2 | +20% | 600 |
| 3 | +30% | 900 |
| 4 | +40% | 1200 |
| 5 | +50% | 1500 |

### 迷踪阵（`maze`）

| 等级 | 防御加成（减伤） | 布置/升级费用 |
| --- | --- | --- |
| 1 | +5% | 50 |
| 2 | +10% | 100 |
| 3 | +15% | 150 |
| 4 | +20% | 200 |
| 5 | +25% | 250 |

### 净化阵（`purification`）

| 等级 | 修炼加成 | 心魔抵抗 | 布置/升级费用 |
| --- | --- | --- | --- |
| 1 | +2% | +2 | 200 |
| 2 | +4% | +4 | 400 |
| 3 | +6% | +6 | 600 |
| 4 | +8% | +8 | 800 |
| 5 | +10% | +10 | 1000 |

### 时间加速阵（`time_acceleration`）

| 等级 | 灵气汇聚 | 修炼加成 | 布置/升级费用 |
| --- | --- | --- | --- |
| 1 | +3% | +5% | 500 |
| 2 | +6% | +10% | 1000 |
| 3 | +9% | +15% | 1500 |
| 4 | +12% | +20% | 2000 |
| 5 | +15% | +25% | 2500 |

::: warning 时间加速阵是最"贵"的阵法
15 分钟持续、500 灵石起步、5 级需 2500 灵石，换取最高 25% 修炼加成——是短期冲刺（配合突破前堆修为）的定位。
:::

## 布置前置条件

`FormationService.placeFormation` 按顺序校验，任一不满足即返回失败：

| 校验 | 失败提示 |
| --- | --- |
| 角色存在 | `角色不存在` |
| **必须已开辟洞府** | `你还没有洞府，无法布置阵法` |
| **当前没有已激活阵法** | `你已经布置了一个阵法，需先拆除` |
| 灵石足够（`getSpiritStoneCount`） | `灵石不足，布置阵法需要 N 灵石（你目前有 M 灵石）` |

校验通过后在**同一事务**内扣除灵石并写入 `formations`（`active = 1`，`expires_at = 当前时间 + 基础持续分钟×60000`）。
注意：**阵法本身不校验境界**，低境界角色只要灵石足够也能布置高级阵法。

## 指令

`/阵法` 的 OneBot 子命令（中英文别名以 `registerSub` 注册为准）：

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `/阵法 place <阵法名> [等级]` | `布置` | 布置阵法，等级省略时为 1；等级必须 1~5 |
| `/阵法 info` | `信息` | 查看当前阵法：名称、等级、剩余时间、各项效果 |
| `/阵法 upgrade` | `升级` | 当前阵法升 1 级，按新等级费用扣灵石 |
| `/阵法 remove` | `拆除`、`移除` | 拆除当前阵法（`active` 置 0，**不返还灵石**） |
| `/阵法 list` | `列表` | 列出 5 种可用阵法及一句话说明 |
| `/阵法 help` | `帮助`、`?` | 输出帮助文本 |

- 无参数或未知子命令时，`onDefault` / `onUnknown` 都直接输出帮助文本。
- 阵法名只接受**中文名**：`聚灵阵` / `护山大阵` / `迷踪阵` / `净化阵` / `时间加速阵`（`getKeyByName` 白名单），输入英文 key 会提示"未知阵法"。
- 权限：`game.cultivate`（指令 `permission` 字段）。
- 单次布置只写入一条记录，`formations.name` 存中文名、`duration_minutes` 存该阵法基础持续时间。

### HTTP 路由

阵法指令类额外通过 `addRoute` 注册了 REST 接口，供 Web 管理台 / WebSocket 客户端调用：

所有 `addRoute` 注册的路由都由 `UnifiedRestResource`（`@Path("/game")`）统一分发，完整前缀为 `/api/game/`。

| 方法 | 完整路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/game/formation/info` | `game.cultivate` | 查询当前阵法 |
| GET | `/api/game/formation/list` | `game.cultivate` | 列出阵法定义 |
| POST | `/api/game/formation/place` | `game.cultivate` | 布置，body 支持 `formationKey` 或 `name`，可选 `level` |
| POST | `/api/game/formation/upgrade` | `game.cultivate` | 升级 |
| POST | `/api/game/formation/remove` | `game.cultivate` | 拆除 |

::: details POST /api/game/formation/place 的请求体
```json
{ "formationKey": "spirit_gathering", "level": 3 }
```
`name` 与 `formationKey` 二选一，优先读取 `formationKey`；`level` 缺省为 1，越界（<1 或 >5）返回 400。
:::

## 阵图物品：用道具直接布置

除了花灵石，还可以用**阵图类道具**直接布置 1 级阵法。阵图是 `TREASURE` 类型物品，使用入口在 `ItemService.useItem`：

```java
// ItemService.useItem —— 阵图物品优先分流到 FormationService
if (FormationService.treasureKeyToFormationKey(fullKey) != null) {
    return ServiceRegistry.getFormationService().placeFormationFromTreasure(playerId, fullKey);
}
```

| 物品 key | 物品名 | 稀有度 | 对应阵法 |
| --- | --- | --- | --- |
| `mtxgdn:spirit_gathering_formation` | 聚灵阵 | RARE | 聚灵阵（1 级） |
| `mtxgdn:mountain_protection_formation` | 护山阵 | EPIC | 护山大阵（1 级） |
| `mtxgdn:purification_formation` | 净化阵 | RARE | 净化阵（1 级） |

- 使用方式：`/使用 <物品名>`，消耗 1 张阵图，**不额外扣灵石**。
- 同样要求"已开辟洞府"且"当前无阵法"。
- 只有以上 3 种有阵图；**迷踪阵、时间加速阵只能用 `/阵法 place` 花灵石布置**。
- 阵图布置固定为 1 级，之后可以用 `/阵法 upgrade` 继续升级（升级照常扣灵石）。

## 加成如何进入计算

### 修炼速度（在线与离线共用）

`PlayerService.cultivationMultiplier` 是所有修炼结算的唯一收口点，阵法加成以**乘算**进入：

```java
// PlayerService.cultivationMultiplier
double mult = base * seasonMultiplier * locationMultiplier;
// ……灵根、天象、功法、称号各自相乘……
int formationBonus = ServiceRegistry.getFormationService().getTotalCultivationBonus(player.getId());
if (formationBonus > 0) {
    mult *= (1 + formationBonus / 100.0);
}
```

即聚灵阵 5 级（+15%）等价于总修炼倍率 ×1.15。

### 洞府灵气收集与冥想

- **收集灵气**：`CaveService.collectSpiritEnergy` 用 `灵气汇聚` 加成放大本次收获：
  `boostedEnergy = spiritEnergy * (100 + formationBoost) / 100`，随后在事务内发放灵石。
- **洞府冥想**：`CaveService.meditate` 把洞府加成与阵法修炼加成**相加**后换算经验：
  `expGain = 100 + (洞府加成 + 阵法修炼加成) × 10`。

### 战斗减伤（PVP / PVE / 团队 Boss）

`getTotalDefenseBonus` 返回的百分比由 `CombatService` 在**防守方**结算时削减伤害：

```java
// CombatService —— PVP 回合结算
if (defenderState.formationReductionPct > 0) {
    damage = Math.max(1, (int) (damage * (1 - defenderState.formationReductionPct / 100.0)));
}
```

| 战斗场景 | 代码位置 | 说明 |
| --- | --- | --- |
| PVP 切磋 | `CombatService` 回合伤害 | 攻守双方各自取一次阵法减伤，写入 `BattleState.formationReductionPct` |
| PVE 打怪 | `CombatService.pveFight` | 玩家受击时按阵法百分比减伤 |
| 团队 Boss | `initPlayerTechMap` | 每名成员的阵法减伤战前统一读取 |

减伤后伤害**下限为 1**，不会出现完全免伤。

### 心魔抵抗

`getTotalHeartDemonResist` 在洞府冥想时换算为等效洞府等级：
`totalCaveLevelForHeartDemon = cave.getLevel() + (formationResist / 2)`，再交给 `HeartDemonService` 判定心魔劫是否触发。

## 到期、拆除与容错

- 后台定时任务每 **60 秒**执行一次 `tickFormations`，把 `expires_at < 当前时间` 的阵法 `active` 置 0；模块 `formation` 停用时该任务直接跳过。
- `getActiveFormation` 读取时会二次判断 `isExpired()`，若已过期则立即失效并返回 `null`（即使定时任务尚未跑到）。
- 服务停机时 `FormationService.shutdown()` 由 `ServerShutdownHook` 调用，关闭调度线程。
- 拆除只把 `active` 置 0，历史记录保留在 `formations` 表中。

## `formations` 表字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 记录 ID |
| `player_id` | BIGINT | 角色 ID |
| `formation_key` | VARCHAR(32) | 阵法英文 key |
| `name` | VARCHAR(32) | 阵法中文名（冗余存储） |
| `level` | INT | 等级，默认 1 |
| `spirit_energy_boost` | INT | 灵气汇聚加成（%） |
| `cultivation_bonus` | INT | 修炼加成（%） |
| `defense_bonus` | INT | 防御加成（%） |
| `heart_demon_resist` | INT | 心魔抵抗 |
| `duration_minutes` | INT | 基础持续时间（分钟） |
| `placed_at` / `expires_at` | BIGINT | 布置时间 / 到期时间（毫秒时间戳） |
| `active` | BOOLEAN | 是否生效 |
| `created_at` / `updated_at` | TIMESTAMP | 时间戳 |

::: tip 效果值是"快照"
布置与升级时把当时的等级效果**写入行内字段**，读取时直接返回行内值。
若日后调整 `Formation` 中的公式，已布置的旧阵法不会自动重算，需重新布置或升级。
:::

## 常见问题

::: details 提示"你还没有洞府，无法布置阵法"？
阵法是洞府玩法的一部分，先用 `/洞府 create`（或 `/洞府 开辟`）开辟洞府，见 [洞府系统](./cave)。
:::

::: details 想换阵法怎么办？
先 `/阵法 拆除`，再 `/阵法 place <新阵法>`。拆除不退灵石，换阵有成本，建议一次选定。
:::

::: details 灵气汇聚加成在哪看效果？
只在**洞府收集灵气**时生效（放大本次灵石产出）；它不影响挂机修炼速度，修炼速度看"修炼加成"。
:::

## 相关页面

- [洞府系统](./cave) —— 阵法的前置玩法
- [修炼系统](./cultivation) —— 修炼倍率的完整构成
- [PVE 战斗](./combat) / [PVP 对战](./pvp) —— 阵法减伤的实际作用场景
- [玩家玩法总览与全指令表](./)
