# 修炼系统（闭关打坐）

修炼系统是修仙世界的核心产出线：玩家通过 `/打坐` 进入闭关状态，服务端记录闭关起始时间，`/停止` 时按**实际闭关秒数 × 每秒灵力倍率**一次性结算经验。

相关源码：

| 关注点 | 文件 |
| --- | --- |
| 闭关开始/结束/倍率汇总 | `src/main/java/com/mtxgdn/game/service/PlayerService.java` |
| QQ 指令入口 | `src/main/java/com/mtxgdn/onebot/command/cultivation/CultivateCommand.java`、`CultivateStopCommand.java` |
| 心魔判定 | `src/main/java/com/mtxgdn/game/service/HeartDemonService.java` |
| 离线收益 | `src/main/java/com/mtxgdn/game/service/OfflineRewardService.java` |
| 季节倍率 | `src/main/java/com/mtxgdn/game/service/SeasonService.java` |
| 境界/基础值配置 | `src/main/resources/game/realm_config.json` |

## 一、指令入口

| 指令 | 别名 | 说明 | 权限 | 模块 |
| --- | --- | --- | --- | --- |
| `/打坐` | `/闭关`、`/meditate`、`/cultivate` | 开始打坐修炼 | `game.cultivate` | `cultivation` |
| `/停止` | `/stop` | 结束打坐并结算灵力 | `game.cultivate` | `cultivation` |
| `/突破` | `/breakthrough` | 突破当前境界（子命令 `预览` 看成功率构成、`凝实` 极境淬体） | `game.realm.breakthrough` | `cultivation` |
| `/转世` | `/reincarnate` | 金仙满级后转世重修 | `game.player.info` | `cultivation` |
| `/晨修` | `/morning` | 每日晨修（5:00~11:00） | `game.player.info` | `cultivation` |
| `/天象` | `/daily` | 查看今日天象与机缘 | `game.player.info` | `cultivation` |

同一套开始/结束逻辑同时被三个入口调用，行为一致：

| 入口 | 开始 | 结束 |
| --- | --- | --- |
| QQ 指令 | `CultivateCommand` → `PlayerService.beginCultivation` | `CultivateStopCommand` → `PlayerService.finishCultivation` |
| REST | `POST /game/cultivate` | `POST /game/cultivate/stop` |
| WebSocket | `GameWebSocketApp` 闭关消息处理 | 同左 |

## 二、开始闭关：`beginCultivation`

`PlayerService.beginCultivation(playerId)` 的校验顺序：

1. **角色不存在** → `success=false`，消息 `角色不存在`。
2. **已在闭关中** → 分两种情况处理，见下方「脏数据自愈」。
3. **生命值 ≤ 0** → `success=false`，消息 `你已重伤倒地，无法闭关修炼，请先疗伤恢复`。
4. 通过校验后写入 `cultivation_start_time = 当前毫秒`、`is_cultivating = 1`、`last_offline_time = 0`。

::: warning 已修复：闭关脏数据自愈（不再把玩家挡在门外）
旧版本存在只写 `is_cultivating` 而不写 `cultivation_start_time` 的历史脏数据。这种状态算不出闭关时长，`/停止` 只能结算 0 经验，线上表现为 `/停止` 回复「状态异常，已强制结束」，玩家被迫重新闭关、白丢一段闭关时间。

`beginCultivation` 现在的判定是：

```java
if (player.isCultivating()) {
    if (player.getCultivationStartTime() > 0) {
        // 正常闭关中：拦住重复打坐
        return 失败("你已在闭关中，无需重复打坐（使用停止修炼来结算）");
    }
    // cultivation_start_time <= 0：脏数据，按「重新闭关」自愈，不阻挡玩家
    LOG.info("检测到无起始时间的闭关脏数据，已按重新闭关自愈: playerId=" + playerId);
}
```

即：**只有 `is_cultivating=1` 且 `cultivation_start_time > 0` 时才提示「已在闭关中」**；起始时间为 0 时直接以当前时间重新开始，脏数据在同一 UPDATE 中被覆盖修好，玩家无需先 `/停止`。
:::

成功返回值（`Map<String, Object>`）：

| 字段 | 含义 |
| --- | --- |
| `success` | `true` |
| `cultivating` | `true` |
| `startTime` | 闭关起始毫秒时间戳 |
| `cultivationPerSecond` | 展示用每秒灵力（`round(倍率)`，最低 1） |
| `season` | 季节枚举名（`SPRING`/`SUMMER`/`AUTUMN`/`WINTER`） |
| `seasonMultiplier` | 季节修炼倍率 |
| `locationId` / `locationName` / `locationMultiplier` | 当前地点 id / 名称 / 灵气倍率 |

`/打坐` 回复示例结构：

```text
开始打坐！
每分钟获得约 {cultivationPerSecond × 60} 灵力
当前季节: 秋季（×1.15）
闭关地点: 问道峰（灵气 ×1.5）
使用 /停止 结束打坐并结算灵力
```

## 三、每秒灵力公式

实际结算走 `PlayerService.calculateCultivationExp(player, elapsedSeconds)`：

```java
double total = cultivationMultiplier(player) * elapsedSeconds;
return Math.max(0, Math.round(total));
```

::: tip 为什么要全程 double 累乘
代码注释明确指出：全程使用 double 累乘、最后一次性取整，避免「每秒取整」把 `1×1.05 → 1` 这类小数倍率吞掉。展示用的 `calculateCultivationPerSecond` 才是逐秒取整版本。
:::

`cultivationMultiplier(player)` 的乘算顺序（全部为**乘性叠加**）：

| 顺序 | 来源 | 计算方式 | 依据 |
| --- | --- | --- | --- |
| 1 | 基础值 | `baseValue = 1` | `realm_config.json → cultivationPerSecond.baseValue` |
| 2 | 境界倍率 | `× realmMultiplier[realm]` | `GameConfigLoader.getCultivationMultiplier(realm)` |
| 3 | 季节 | `× SeasonService.getCultivationMultiplier()` | 见 `season.md` |
| 4 | 地图灵气 | `× MapService.getCultivationBonus(locationId)` | 默认 1.0 |
| 5 | 灵根 | 持有 `CULTIVATION_EFFICIENCY` 时 `× (1 + effectValue)` | 木水灵根 `+15%` → `×1.15` |
| 6 | 天象 | `× 今日天象.getCultivationMultiplier()` | 见下表 |
| 7 | 功法 | `× (1 + 已装备功法 cultivation_speed_bonus 之和)`，仅当和 `> 0` | `TechniqueService.getEquippedCultivationSpeedBonus` |
| 8 | 称号 | `× getFinalCultivationSpeed(player)` = `1.0 + 当前佩戴称号 cultivationSpeedBonus` | 无称号时为 `×1.0` |
| 9 | 阵法/洞府 | 阵法加成 `> 0` 时 `× (1 + bonus / 100.0)` | `FormationService.getTotalCultivationBonus` |

### 境界倍率表

| realm id | 境界 | realmMultiplier |
| --- | --- | --- |
| 0 | 凡人 | 1.0 |
| 1 | 炼气期 | 1.5 |
| 2 | 筑基期 | 2.5 |
| 3 | 金丹期 | 4.0 |
| 4 | 元婴期 | 6.0 |
| 5 | 化神期 | 10.0 |
| 6 | 合体期 | 18.0 |
| 7 | 大乘期 | 32.0 |
| 8 | 渡劫期 | 55.0 |
| 9 | 真仙 | 90.0 |
| 10 | 金仙 | 150.0 |

`realmId` 超出数组长度时 `getCultivationMultiplier` 返回 `1.0`。

### 地图灵气倍率表

| 地点 id | 地点 | 修炼倍率 |
| --- | --- | --- |
| 1 | 青云村 | 1.00 |
| 2 | 青云山 | 1.05 |
| 3 | 苍月镇 | 1.05 |
| 4 | 太虚城 | 1.15 |
| 5 | 落霞山 | 1.10 |
| 6 | 碧水潭 | 1.30 |
| 7 | 昆仑墟 | 1.30 |
| 8 | 九幽渊 | 1.20 |
| 9 | 天元古城 | 1.35 |
| 10 | 问道峰 | 1.50 |
| 11 | 东海龙宫 | 1.40 |
| 12 | 万妖谷 | 1.20 |
| 13 | 灵药谷 | 1.10 |
| 14 | 天机阁 | 1.15 |
| 15 | 白骨岭 | 1.25 |

未登记的地点 id 默认 `1.0`，地点名返回 `未知之地`。

### 天象修炼倍率

| 天象 | 修炼倍率 | 游历倍率 | 战斗倍率 | 灵石倍率 |
| --- | --- | --- | --- | --- |
| 紫气东来 | 1.30 | 1.00 | 1.00 | 1.00 |
| 星辰耀天 | 1.00 | 1.20 | 1.20 | 1.00 |
| 血月当空 | 1.00 | 1.00 | 1.30 | 1.00 |
| 灵潮涌动 | 1.00 | 1.00 | 1.00 | 1.50 |
| 枯荣交替 | 1.00 | 1.00 | 1.00 | 1.00 |
| 万籁俱寂 | 1.05 | 1.05 | 1.05 | 1.05 |

天象按自然日随机，每日首次访问时从 6 种中等概率抽取一次并缓存。

### 阵法与称号

- **阵法**：`getTotalCultivationBonus` 取当前激活阵法的 `cultivationBonus`（整数百分比）。`聚灵阵` 每级 `+3%`、`时间加速阵` 每级 `+5%`、`净化阵` 每级 `+2%`，其余阵法为 0。`Formation.MAX_LEVEL = 5`。
- **称号**：`cultivationSpeedBonus` 为小数（如 `0.05` 表示 `+5%`），来源为 `TitleRegistry` 中的称号定义，例如 `初入仙途` 为 `0.0`、`剑道宗师` 为 `0.05`、`大道之主` 为 `0.20`、`混沌帝尊` 为 `0.25`。

## 四、结束闭关：`finishCultivation`

`PlayerService.finishCultivation(playerId)` 流程：

1. 角色不存在 → `角色不存在`。
2. `is_cultivating` 为假 → `你并未在闭关中，无需停止修炼`。
3. `elapsedSeconds = (now - cultivation_start_time) / 1000`；起始时间 ≤ 0 时按 0 秒计。
4. **原子认领停止**：`stopCultivation` 执行 `UPDATE ... WHERE id = ? AND is_cultivating = 1`，只有第一次调用 `executeUpdate() > 0` 成功；并发重复停止返回 `修炼结算正在处理中，请勿重复操作`，避免经验重复发放。
5. 返回 `elapsedSeconds`、`cultivationPerSecond`、`rawExpGained`、季节与地点信息。

`/停止`（以及 REST `/game/cultivate/stop`）在拿到 `rawExpGained` 后：

- `rawExpGained <= 0` → 回复 `打坐时间太短，未获得灵力。`（不发放经验，不触发心魔）。
- 否则调用 `HeartDemonService.processCultivation(playerId, expGained, elapsedSeconds)` 得到净经验 `netExpChange`，再 `playerService.addExperience(playerId, netExp)`。

::: warning 经验发放还有第二层倍率
`PlayerService.addExperience` 会再乘 **称号 expBonus + 已装备功法 exp_bonus**（`getFinalExpBonus`），并在 `BuffService.getExpMultiplier > 1.0` 时再乘经验翻倍丹 Buff 倍率。因此玩家实际到手的经验会高于 `/停止` 文本里显示的「获得灵力」数值。
:::

## 五、心魔劫

`HeartDemonService.processCultivationWithCave(playerId, rawExpGained, elapsedSeconds, caveLevel)`：

```text
hours      = elapsedSeconds / 3600.0
baseChance = 0.08 × hours                    // BASE_CHANCE_PER_HOUR = 0.08
spiritResist = min(8.0, spirit / 15.0)
rootResist   = 灵根品级抗性（见下表），持有 LATE_BLOOMER 再 +2.0
caveResist   = caveLevel × 3.0
finalChance  = min(40.0, max(0.0, baseChance - spiritResist - rootResist - caveResist))
```

判定：`eventRoll = random.nextInt(100)`，当 `eventRoll < finalChance` 时触发心魔。`rawExpGained <= 0`、`elapsedSeconds <= 0` 或角色不存在时直接返回原始经验，不判定。

### 灵根抗性

| 品级 | rootResist |
| --- | --- |
| PRIMORDIAL（鸿蒙灵根） | 8.0 |
| PERFECT（正灵根） | 6.0 |
| VARIANT（异灵根） | 4.0 |
| HEAVENLY（天灵根） | 3.0 |
| DUAL（双灵根） | 2.0 |
| TRIPLE（三灵根） | 1.0 |
| QUAD（四灵根） | 0 |
| MIXED（杂灵根） | -2.0 |

### 严重度与损失比例

| severityRoll | 严重度 | 损失比例 | 叙事池 |
| --- | --- | --- | --- |
| `< 50` | 轻微 | `0.20 + rand×0.20` | 5 条（`MINOR_NARRATIVES`） |
| `50 ~ 84` | 中等 | `0.50 + rand×0.20` | 4 条（`MEDIUM_NARRATIVES`） |
| `≥ 85` | 严重 | `0.80 + rand×0.20` | 4 条（`SEVERE_NARRATIVES`） |

`expLost = max(1, rawExpGained × lossRatio)`，`netExp = rawExpGained - expLost`，叙事文本追加 `（修为倒退 N 点）`。

::: details caveLevel 从哪来
在线闭关的 QQ/REST 入口调用的是 `processCultivation(...)`，内部等价于 `caveLevel = 0`，即 **在线打坐不吃洞府抗性**。只有 `CaveService` 的洞府打坐走 `processCultivationWithCave`，其中 `caveLevel = cave.getLevel() + formationResist / 2`，`formationResist` 来自 `FormationService.getTotalHeartDemonResist`（净化阵每级 +2、聚灵阵每级 +1）。
:::

## 六、离线收益

`OfflineRewardService.processOfflineRewards(userId)`，触发点为 WebSocket 登录、REST 登录、QQ 上号与 `/状态`。离线时间的写入点是 **WebSocket 断线时** `updateLastOfflineTime(playerId, now)`。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `MAX_OFFLINE_SECONDS` | `8 × 3600`（8 小时） | 离线时长上限 |
| `OFFLINE_CULTIVATION_RATE` | `0.50` | 离线修炼效率 |
| `OFFLINE_HEART_DEMON_RATE` | `0.50` | 心魔判定时长折扣 |

流程：

1. 角色不存在，或 `last_offline_time <= 0` → 不发放。
2. `elapsedSeconds < 30` → 把 `last_offline_time` 清零并返回不发放。
3. **原子认领**：`claimOfflineTime(playerId, lastOffline)` 执行 `UPDATE players SET last_offline_time = 0 WHERE id = ? AND last_offline_time = ?`，只有认领成功的请求才结算，防止 WebSocket / REST / QQ 多端同时上线重复发放。
4. `elapsedSeconds = min(elapsedSeconds, 28800)`。
5. **气血法力恢复**：`recoverPercent = min(elapsedSeconds / 60.0 × 0.02, 1.0)`，按 `max_hp` / `max_mp` 的比例恢复；返回的 `mpRecovered` 为 `hpRecovered × 0.6`（仅在 `hpRecovered > 0` 时非零，实际入账仍按 `recoverPercent × max_mp`）。
6. **仅当 `player.isCultivating()` 为真**才结算离线修炼经验。

离线修炼经验：

```text
rawExp = calculateCultivationExp(player, elapsedSeconds) × 0.50
       × 今日天象.getCultivationMultiplier()
       × (持有 CULTIVATION_EFFICIENCY ? 1 + effectValue : 1)
rawExpGained = max(0, round(rawExp))，若为 0 则退化为 elapsedSeconds
心魔判定：processCultivation(playerId, rawExpGained, elapsedSeconds × 0.50)
netExp != 0 → addExperience(playerId, netExp)
最后 setCultivating(playerId, true)   // 重新起算闭关计时并清零 last_offline_time
```

注意离线路径**只**额外应用天象与灵根，其余倍率（境界/季节/地点/功法/称号/阵法）已经包含在 `calculateCultivationExp` 内。

## 七、晨修

`DailyService.doMorningCultivation(playerId)`，指令 `/晨修`：

| 项 | 规则 |
| --- | --- |
| 时间窗口 | 本地时间 `hour >= 5 && hour < 11`，否则提示「晨修须在卯时至巳时（5:00~11:00）进行」 |
| 频次 | 每人每日一次，`player_daily.last_morning_cultivation` 等于今日则拒绝 |
| 连续天数 | 昨日也晨修则 `consecutiveDays + 1`，否则重置为 1 |
| 基础经验 | `(realm + 1) × 50` |
| 连修加成 | `+ baseExp × (consecutive - 1) × 0.10` |
| 天象 | `applyCultivation(...)` 乘天象修炼倍率 |
| 灵根 | 持有 `CULTIVATION_EFFICIENCY` 时 `× (1 + effectValue)` |
| 季节 | 追加 `(long)(totalExp × (seasonMultiplier - 1))`，季节倍率同闭关 |
| 基础灵石 | `(realm + 1) × 10` |
| 灵石天象 | `applySpiritStone(...)` |
| 灵石灵根 | 持有 `SPIRIT_STONE_DROP` 时 `× (1 + effectValue)` |
| 灵石季节 | `× SeasonService.getSpiritStoneMultiplier()` |

写入 `player_daily` 时 `total_active_days + 1`，随后触发灵根共鸣检查（累计活跃 7 天 / 30 天各发一次属性奖励，见 `daily.md`）。

## 八、常见问题

::: details 为什么 `/打坐` 说「已在闭关中」？
说明 `is_cultivating = 1` 且 `cultivation_start_time > 0`，即真的在闭关。用 `/停止` 结算即可。若历史上出现过起始时间为 0 的脏数据，现在会被自动识别并重新开始闭关，不会再卡住玩家。
:::

::: details 为什么闭关很久只拿到 0 灵力？
`rawExpGained <= 0` 时 `/停止` 直接回「打坐时间太短，未获得灵力」。由于倍率全程 double 累乘，正常情况下只有秒数极短才会出现。
:::

::: details 修炼模块停用后会怎样？
`SeasonService` 的 10 秒 tick 会检查内置模块 `cultivation` 是否启用，停用时暂停季节重算（`plugins.yml` 中 `cultivation: true`）。
:::
