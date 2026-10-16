# 灵田（种田系统）

灵田是异步挂机玩法：买种子 → 种下 → 等生长 → 浇水施肥 → 收获作物。生长**没有后台定时任务**——服务端在玩家访问农田时按 `settled_time` 到当前时刻的时间差一次性结算，因此玩家离线期间作物照常生长。实现位于 `src/main/java/com/mtxgdn/game/service/FarmService.java`（1008 行），配置在 `game/entity/CropConfig.java`、`game/entity/FarmPlot.java`，QQ 入口为 `src/main/java/com/mtxgdn/onebot/command/farm/FarmCommand.java`。

## 指令与子命令

主指令 `/种田`，别名 `farm`，模块 `farm`，命令分组显示为"探索"。

| 子命令 | 英文别名 | 参数 | 说明 |
| --- | --- | --- | --- |
| `查看` | `list`、`v` | — | 查看全部地块与当前季节 |
| `种植` | `plant`、`p` | `<地块索引> <种子名称/key>` | 种下一颗种子 |
| `浇水` | `water`、`w` | `<地块索引>` | 水分 +30%（上限 100） |
| `施肥` | `fertilize`、`f` | `<地块索引> [low\|mid\|high]` | 提升肥力 |
| `收获` | `harvest`、`h` | `<地块索引>` | 收获成熟作物 |
| `清理` | `clear`、`c` | `<地块索引>` | 清空地块（**作物作废**） |
| `扩建` | `expand`、`e` | — | 花金币开垦新地块 |
| `种子` | `seeds`、`s` | — | 列出可用种子与持有数量 |
| `一键浇水` | `waterall`、`wa` | — | 给所有非空地浇水/复活枯萎作物 |
| `一键施肥` | `fertilizeall`、`fa` | `[low\|mid\|high]` | 给所有缺肥地块施肥 |
| `一键收获` | `harvestall`、`ha` | — | 收获所有成熟作物 |
| `杀虫` | `pesticide`、`killpest` | `<地块索引>` | 使用杀虫剂清除病虫害 |

`/种田` 不带参数即等于 `查看`。子命令无法识别时回复 `未知子命令: X`。

参数解析细节：

- 地块索引必须是整数，否则提示"地块索引必须是数字"。
- 种子名支持**模糊包含匹配**（`resolveSeedKey`）：输入含 `:` 时按完整 key 精确匹配；否则遍历所有作物，用**物品显示名 `contains(input)`** 匹配，返回第一个命中项。
- 肥料类型：`mid`/`中级` → 中级肥料，`high`/`高级` → 高级肥料，其他一切输入（含未给参数）→ **低级肥料**。

## 开垦条件与土地上限

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `DEFAULT_PLOTS` | `4` | 新玩家自动获得的地块数 |
| `MAX_PLOTS` | `12` | 地块数量硬上限 |

首次调用 `getPlots(playerId)` 时会检查 `SELECT COUNT(*) FROM farm_plots WHERE player_id = ?`，为 0 则自动插入 4 块空地（`plot_index` 为 0~3，`water_level = 100`，`fertilizer_level = 0`，`state = 'EMPTY'`），并打日志"玩家 N 初始化农田 4 块"。

### 扩建消耗

```java
private long calculateExpandCost(int currentCount) {
    return 100L * (long) Math.pow(2, currentCount - DEFAULT_PLOTS);
}
```

| 当前地块数 | 扩建到下一块的花费（金币） |
| --- | --- |
| 4 | 100 |
| 5 | 200 |
| 6 | 400 |
| 7 | 800 |
| 8 | 1,600 |
| 9 | 3,200 |
| 10 | 6,400 |
| 11 | 12,800 |
| 12 | —（"已达到最大地块数"） |

扩建**消耗金币**（`player.getGold()`），不是灵石；金币不足提示"金币不足，需要 N 金币"。扣金币与插入新地块同事务，新地块索引 = 当前地块数。

::: warning 扩建没有并发保护
`expandPlot` 先在事务外 `countPlayerPlots` 并算好 `plotIndex = currentCount`，再在事务内 `addGold(-cost)` + `createNewPlot(plotIndex)`。两次并发扩建可能算出**同一个 `plot_index`**，`farm_plots` 表对 `(player_id, plot_index)` **没有唯一约束**，因此可能插入重复索引的地块，或出现"花了钱但地块数没增加"的观感。同时校验的 `getGold()` 也在事务外，存在余额竞态。
:::

## 种子与作物

作物配置全部硬编码在 `CropConfig` 的静态块中，共 **16 种**。

| 种子 key | 种子名 | 产物 | 产物名 | 生长秒数 | 阶段数 | 基础产量 | 产量上限 | 需水量 | 肥料加成 | 五行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mtxgdn:spirit_grass_seed` | 灵草种子 | `mtxgdn:spirit_grass` | 灵草 | 60 | 3 | 3 | 5 | 50 | 10 | 灵 |
| `mtxgdn:thousand_year_ginseng_seed` | 千年人参种子 | `mtxgdn:thousand_year_ginseng` | 千年人参 | 180 | 5 | 1 | 3 | 40 | 15 | 木 |
| `mtxgdn:dark_ice_grass_seed` | 暗冰草种子 | `mtxgdn:dark_ice_grass` | 暗冰草 | 90 | 4 | 2 | 4 | 45 | 12 | 冰 |
| `mtxgdn:fire_vine_seed` | 火焰藤种子 | `mtxgdn:fire_vine` | 火焰藤 | 120 | 4 | 2 | 4 | 45 | 12 | 火 |
| `mtxgdn:nether_flower_seed` | 幽冥花种子 | `mtxgdn:nether_flower` | 幽冥花 | 240 | 5 | 1 | 3 | 35 | 20 | 暗 |
| `mtxgdn:star_grass_seed` | 星草种子 | `mtxgdn:star_grass` | 星草 | 300 | 6 | 1 | 2 | 30 | 25 | 光 |
| `mtxgdn:blood_lingzhi_seed` | 血灵芝种子 | `mtxgdn:blood_lingzhi` | 血灵芝 | 200 | 5 | 1 | 2 | 40 | 18 | 土 |
| `mtxgdn:tianshan_snow_lotus_seed` | 天山雪莲种子 | `mtxgdn:tianshan_snow_lotus` | 天山雪莲 | 420 | 7 | 1 | 2 | 25 | 30 | 水 |
| `mtxgdn:peach_seed` | — | `mtxgdn:peach` | 蟠桃 | 180 | 4 | 2 | 4 | 45 | 15 | 木 |
| `mtxgdn:ginseng_fruit_seed` | — | `mtxgdn:ginseng_fruit` | 人参果 | 300 | 6 | 1 | 2 | 35 | 25 | 水 |
| `mtxgdn:dragon_fruit_seed` | — | `mtxgdn:dragon_fruit` | 火龙果 | 120 | 4 | 2 | 4 | 40 | 12 | 火 |
| `mtxgdn:immortal_date_seed` | — | `mtxgdn:immortal_date` | 仙枣 | 240 | 5 | 1 | 3 | 35 | 20 | 土 |
| `mtxgdn:nine_turn_grass_seed` | — | `mtxgdn:nine_turn_grass` | 九转还魂草 | 480 | 8 | 1 | 2 | 20 | 35 | 水 |
| `mtxgdn:he_shou_wu_seed` | — | `mtxgdn:thousand_year_heshouwu` | 千年何首乌 | 200 | 5 | 2 | 4 | 40 | 18 | 土 |
| `mtxgdn:wan_ling_grass_seed` | — | `mtxgdn:wan_ling_grass` | 万灵草 | 90 | 3 | 3 | 6 | 50 | 10 | 灵 |
| `mtxgdn:purple_river_cart_seed` | — | `mtxgdn:purple_river_cart` | 紫河车 | 360 | 6 | 1 | 2 | 30 | 28 | 暗 |

::: tip 商店只卖 8 种种子
`EconomyService.SHOP_ITEMS` 中可购买的种子只有上表前 8 种（灵草/千年人参/暗冰草/火焰藤/幽冥花/星草/血灵芝/天山雪莲种子）。后 8 种（蟠桃、人参果、火龙果、仙枣、九转还魂草、千年何首乌、万灵草、紫河车）没有商店入口，只能通过其他掉落/活动途径获取。
:::

::: warning `需水量 waterNeed` 字段未被生长逻辑使用
`CropConfig.waterNeed` 有配置值（20~50），但 `FarmService` 中**没有任何代码读取它**——枯萎判定只看 `water_level <= 0`，与 `waterNeed` 无关。
:::

### 种植

`/种田 种植 <地块索引> <种子>`（`FarmService.plant`）：

| 校验 | 提示 |
| --- | --- |
| 种子 key 在 `CropConfig` 中 | 未知种子 |
| 背包种子 ≥ 1（事务内 `getItemCount(conn, ...)`） | 种子不足：需要 X |
| 地块存在（事务内 `getPlotForUpdate`） | 地块不存在 |
| 地块状态为 `EMPTY` | 地块已被占用 |

生长时间与基础产量在种植时一次性算好并落库：

```java
double rootBonus = calculateSpiritualRootBonus(playerId, config.getElementType());
Season currentSeason = SeasonService.getCurrentSeason();
double seasonModifier = SeasonService.getGrowthModifier(config.getElementType());

double totalGrowthMultiplier = (1 + rootBonus) * seasonModifier;
int adjustedGrowthSeconds = (int) (config.getGrowthSeconds() / totalGrowthMultiplier);
int adjustedBaseYield = (int) (config.getBaseYield() * (1 + rootBonus));

long harvestTime = now + (long) adjustedGrowthSeconds * 1000;
```

种植后地块被置为：`state = 'PLANTED'`、`growth_stage = 1`、`water_level = 100`（满水）、`fertilizer_level = 0`、`yield = max(adjustedBaseYield, 1)`、`root_bonus`、`season_modifier`、`planted_time`、`harvest_time`。

::: warning 季节修正只作用于生长速度，不影响产量
`seasonModifier` 只参与 `adjustedGrowthSeconds` 的计算；`adjustedBaseYield` 只用 `rootBonus`。季节对产量的影响是间接的——它决定了收获时地块还剩多少水分/肥力。
:::

## 生长阶段与时间

### 惰性结算（无后台推进线程）

农田**没有**定时任务。生长状态改由 `settlePlayerPlots(conn, playerId, now)` 在玩家真正访问农田时按时间差一次性结算：

```java
private void settlePlayerPlots(Connection conn, long playerId, long now) {
    if (!BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("farm")) return;
    // 只查该玩家自己的地块，不是全表
    String sql = "SELECT * FROM farm_plots WHERE player_id = ? AND state IN ('PLANTED', 'GROWING')";
    ...
}
```

| 项 | 内容 |
| --- | --- |
| 触发方式 | 惰性：`/种田` 查看、浇水、施肥、种植、收获、清理等**每个入口**都在业务事务内先调一次结算 |
| 结算基准 | `since = max(planted_time, settled_time)`，实际流逝 `elapsedSeconds = (now - since) / 1000` |
| 幂等性 | 结算后立刻把 `settled_time` 推进到 `now`，同一区间不会重复计算；同一秒内重复访问因 `elapsedSeconds <= 0` 直接返回，不产生任何写入 |
| 时钟回拨保护 | 基准点晚于 `now` 时按 `now` 处理，绝不产生"负流逝"导致水分回升 |
| 模块门控 | `BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("farm")` 为假时**整个结算直接返回**（农场模块停用则生长暂停） |
| 查询范围 | 只查该玩家自己的地块（`WHERE player_id = ?`），**不再是全表扫描** |
| 事务 | 与调用方的业务写入共用同一个 `Connection`，结算与操作同事务提交 |

::: tip 为什么这样改
早期实现用 `scheduleAtFixedRate(updateAllPlots, 1, 1, SECONDS)` 每秒扫描**所有玩家**处于 `PLANTED`/`GROWING` 的地块并逐块写库。地块总量随玩家数线性增长，而 `farm_plots` 上只有 `player_id` 外键、没有 `state` 索引，因此这是全系统最主要的数据库压力来源。改为惰性结算后，开销只落在"真正在玩农田的玩家"身上，且天然按玩家分片。
:::

### 结算的状态推进

`settlePlot(conn, plot, now)` 的顺序：

1. **水分衰减**：按实际流逝时间一次算清，`newWater = max(1, round(water - 0.1 × elapsedSeconds))`（`WATER_DECREASE_PER_SECOND = 0.1`，即每秒 -0.1%）。源码注释："约 17 分钟才能从满水降到枯萎线"。
2. **跨过枯萎线**（`elapsedSeconds >= ceil(water / 0.1)`）→ 置 `WILTED`，并把 `wilted_time` 写成**精确穿零点** `since + secondsToDry × 1000`，而不是结算时刻；离线再久枯萎时间也不会被推后。
3. **已到收获时间**（`now >= harvest_time`）→ 判定品质并置 `READY`（`growth_stage = stages`、`wilted_time = 0`）。注意顺序：品质必须在改写水分**之前**掷定——`determineQuality` 会按水分高低计分（≥80 加 15 分），先降水分再掷会让卡在阈值上的地块凭空掉一档品质。
4. **否则**：先做病虫害结算（`settlePest`），再算阶段：

```java
long elapsed = now - plot.getPlantedTime();
long total = plot.getHarvestTime() - plot.getPlantedTime();
int stage = (int) ((elapsed * config.getStages()) / total) + 1;
stage = Math.min(stage, config.getStages());
```

即阶段 = `已过时间 / 总时间 × 阶段数 + 1`，上限为配置阶段数，然后写回 `state = 'GROWING'`。

### 地块状态

| 状态 | 中文 | 进入条件 |
| --- | --- | --- |
| `EMPTY` | 空地 | 初始化 / `resetPlot`（收获或清理后） |
| `PLANTED` | 已种植 | 刚种下（首次结算会转为 `GROWING`） |
| `GROWING` | 生长中 | 每次结算按时间差推进 |
| `READY` | 可收获 | `now >= harvest_time` |
| `WILTED` | 枯萎 | `water_level` 降到 0 |

### 枯萎与复活

| 常量 | 值 |
| --- | --- |
| `WILTED_DEAD_SECONDS` | `6 * 3600`（6 小时） |

- 枯萎后 6 小时内可以浇水复活：`state = 'GROWING'`、`water_level = 50`、`wilted_time = 0`，提示"浇水成功！枯萎作物已恢复，水分: 50%"。
- 超过 6 小时：`(now - wiltedTime) / 1000 > 6*3600` → "作物已枯萎过久，无法恢复，请清理地块重新种植"。
- 源码注释说明 6 小时是从 1 小时放宽的："给予玩家恢复机会"。
- 注意：枯萎的地块**不再进入结算查询**（`state IN ('PLANTED','GROWING')`），所以枯萎后时间静止，只是 `wilted_time` 在流逝。

## 浇水

`/种田 浇水 <地块索引>`（`FarmService.water`）：

| 地块状态 | 结果 |
| --- | --- |
| 空地 | "空地无需浇水" |
| 枯萎 | 走复活分支（见上），限 6 小时内 |
| 水分已满（`>= 100`） | "水分已充足" |
| 其他 | `newWater = min(100, water + 30)`，提示"浇水成功！水分: N%" |

一键浇水（`waterAll`）在一个事务内处理所有非空地：枯萎且在 6 小时内的**复活并置 50%**，其余水分 < 100 的 **+30**。返回"已为 N 块地块浇水，已复活 M 块枯萎作物"；没有任何可操作地块时返回"没有需要浇水的地块"。

::: tip 浇水不消耗任何物品
浇水是免费操作，可以反复执行（但超过 100% 会被拒绝）。它是维持产量的主要手段。
:::

## 施肥

`/种田 施肥 <地块索引> [low|mid|high]`（`FarmService.fertilize`），每次消耗 **1 个**肥料。

| 肥料 key | 名称 | 提升肥力 | 商店价 |
| --- | --- | --- | --- |
| `mtxgdn:low_grade_fertilizer` | 低级肥料 | **+25** | 20 灵石 |
| `mtxgdn:mid_grade_fertilizer` | 中级肥料 | **+40** | 50 灵石 |
| `mtxgdn:high_grade_fertilizer` | 高级肥料 | **+60** | 100 灵石 |

| 校验 | 提示 |
| --- | --- |
| 肥料 key 在三种之内 | 无效的肥料类型 |
| 背包 ≥ 1 | 肥料不足：需要 X |
| 地块存在 | 地块不存在 |
| 非空地 | 空地无需施肥 |
| 肥力 < 100 | 肥力已充足 |

新肥力 = `min(100, 原肥力 + bonusAmount)`。

一键施肥（`fertilizeAll`）：先查出所有 `state != 'EMPTY' AND fertilizer_level < 100` 的地块，**数量不足时整体拒绝**（"X不足，需要 N 个"），然后一次扣 `N` 个肥料，逐块用 `MIN(fertilizer_level + ?, 100)`（SQLite）/ `LEAST(...)`（MySQL）更新。

::: warning 肥力不会随时间衰减
`fertilizer_level` 只在种植时被重置为 0、在施肥时增加。作物生长期间不会消耗肥力，因此**一次施肥可以维持整季**。收获取或清理会重置为 0。
:::

## 收获产出

`/种田 收获 <地块索引>`（`FarmService.harvest`）：仅 `state == 'READY'` 可收获，否则"作物还未成熟"。

### 产量公式

```java
private int calculateYield(FarmPlot plot, CropConfig config) {
    int baseYield = plot.getYield();
    int waterBonus = (int) (baseYield * plot.getWaterLevel() / 100.0 * 0.5);
    int fertilizerBonus = (int) (baseYield * plot.getFertilizerLevel() / 100.0 * config.getFertilizerBonus() / 100.0);

    int pestPenalty = calculatePestPenalty(plot, baseYield);

    int randomBonus = random.nextInt(3);
    int total = baseYield + waterBonus + fertilizerBonus + randomBonus - pestPenalty;

    if (plot.getCropQuality() != null) {
        total = (int) (total * plot.getCropQuality().getMultiplier());
    }

    return Math.max(1, Math.min(total, config.getMaxYield() * 2));
}
```

| 项 | 公式 | 说明 |
| --- | --- | --- |
| `baseYield` | 种植时算出的 `yield` 字段 | `= (int)(配置基础产量 × (1 + 灵根加成))` |
| 水分加成 | `baseYield × 水分% / 100 × 0.5` | 满水时最多 **+50%** |
| 肥料加成 | `baseYield × 肥力% / 100 × 作物肥料加成% / 100` | 肥力 100% 时按作物系数加成 |
| 随机加成 | `random.nextInt(3)` | **0~2**，即最多 +2 个 |
| 病虫害惩罚 | 见下表 | 按 `baseYield` 的比例扣 |
| 品质乘数 | `COMMON ×1.0`、`GOOD ×1.5`、`EXCELLENT ×2.0` | |
| 最终钳制 | `max(1, min(total, maxYield × 2))` | 下限 1，上限为配置产量上限的**两倍** |

病虫害惩罚（`calculatePestPenalty`）：

| `pest_state` | 中文 | 惩罚 |
| --- | --- | --- |
| `MILD` | 轻度虫害 | `baseYield × 20%` |
| `SEVERE` | 严重虫害 | `baseYield × 40%` |
| `DISEASE` | 病害 | `baseYield × 30%` |
| `CLEAN` | 健康 | 0 |

### 品质判定

品质在**成熟的那一刻**（`updatePlotToReady` 之前）由 `determineQuality(plot)` 一次性判定并写入 `crop_quality`：

```java
double qualityScore = 0;
if (water >= 80) qualityScore += 15; else if (water >= 50) qualityScore += 5;
if (fertilizer >= 80) qualityScore += 20; else if (fertilizer >= 50) qualityScore += 10;
if (pestState == CLEAN) qualityScore += 25; else if (pestState == MILD) qualityScore += 5;
if (rootBonus >= 0.2) qualityScore += 10;
if (seasonModifier > 1.1) qualityScore += 10;

double rand = random.nextDouble() * 100;
if (rand <= qualityScore * 0.3) return EXCELLENT;
else if (rand <= qualityScore * 0.7) return GOOD;
else return COMMON;
```

| 品质 | 中文 | 产量乘数 | 命中条件 |
| --- | --- | --- | --- |
| `COMMON` | 普通 | ×1.0 | 默认 |
| `GOOD` | 上品 | ×1.5 | `rand <= 分数 × 0.7` |
| `EXCELLENT` | 极品 | ×2.0 | `rand <= 分数 × 0.3` |

最高分（水 ≥80、肥 ≥80、健康、灵根 ≥0.2、季节 >1.1）= `15+20+25+10+10 = 80` 分 → 极品概率 24%、上品概率 32%、普通 44%。

收获后 `resetPlot` 把地块还原为：`EMPTY`、`seed_key/crop_key = NULL`、时间戳归零、`growth_stage = 0`、`water_level = 100`、`fertilizer_level = 0`、`yield = 0`。**品质与肥力都不会保留。**

一键收获（`harvestAll`）：查出所有 `state = 'READY'` 地块，逐块算产量、发放、重置，用 `LinkedHashMap.merge(key, yield, Integer::sum)` 按产物汇总，提示"收获成功！获得：X xN，Y xM"。

## 病虫害

| 常量 | 值 |
| --- | --- |
| `PEST_CHANCE_PER_HOUR` | `0.02`（每小时 2%） |

```java
private static void checkPestAttack(FarmPlot plot, long now) {
    if (plot.getPestState() != FarmPlot.PestState.CLEAN) {
        if (now - plot.getPestTime() > 1800000) {   // 30 分钟
            upgradePestState(plot);
        }
        return;
    }
    if (now - plot.getPlantedTime() > 300000) {     // 种植满 5 分钟才可能生虫
        if (random.nextDouble() < PEST_CHANCE_PER_HOUR / 60) {
            triggerPestAttack(plot, now);
        }
    }
}
```

| 机制 | 内容 |
| --- | --- |
| 免疫期 | 种植后 **5 分钟**（300000ms）内不会发生病虫害 |
| 发生概率 | 基准 `PEST_CHANCE_PER_HOUR = 0.02`（约每小时 2%）。结算时把"每秒掷一次骰子"折算成区间累计概率一次算清：`chance = 1 - (1 - 0.02/60)^暴露秒数`；暴露秒数从 `max(since, planted_time + 5 分钟)` 起算 |
| 首次病害类型 | **70% 概率 `MILD`（轻度虫害）**，30% 概率 `DISEASE`（病害） |
| 恶化 | 非健康状态下，**距 `pest_time` 超过 30 分钟**则升级：`MILD` 或 `DISEASE` → `SEVERE`（严重虫害）；已是 `SEVERE` 则不再变化 |

::: warning 恶化的检查依赖地块被结算
`settlePest` 只在结算 `PLANTED`/`GROWING` 地块时被调用。作物一旦 `READY` 或 `WILTED`，病虫害状态就冻结不再恶化——但**已有的惩罚仍会在收获时生效**。

另外，病虫害只在玩家**访问农田**时才推进。长期不上线的玩家，其地块的病害恶化会在下次访问时按 `now - pest_time > 30 分钟` 一次性判定。
:::

### 杀虫剂

`/种田 杀虫 <地块索引>`（`usePesticide`）：消耗 1 个 `mtxgdn:pesticide`（商店价 30 灵石）。

| 情况 | 提示 |
| --- | --- |
| 背包无杀虫剂 | 杀虫剂不足 |
| 地块不存在 | 地块不存在 |
| `pest_state == CLEAN` | 地块没有病虫害 |
| 成功 | 已使用杀虫剂，病虫害已清除（`pest_state = 'CLEAN'`、`pest_time = 0`） |

## 灵根加成

`calculateSpiritualRootBonus(playerId, cropElement)` 先取灵根基础加成，再乘 `root.effectEnhancementMultiplier()`（鸿蒙灵根 ×1.5，其余 ×1.0）。

| 灵根 | 匹配五行时的加成 | 其他作物 |
| --- | --- | --- |
| `TRUE_FIVE_ELEMENTS`（真五行灵根） | **+20%**（全作物） | +20% |
| `QINGDI_WOOD`（青帝木灵根） | 木 +30% | +10% |
| `XUANMING_WATER`（玄冥水灵根） | 水 +30% | +10% |
| `LIHUO_FIRE`（离火灵根） | 火 +30% | +10% |
| `HOUTU_EARTH`（后土灵根） | 土 +30% | +10% |
| `TAIYI_GOLDEN`（太乙金灵根） | 金 +30% | +10% |
| `XUANBING_ICE`（玄冰灵根） | 冰 +25% | +5% |
| `XUNFENG_WIND`（巽风灵根） | 光 +20% | +5% |
| `JINGLEI_THUNDER`（惊雷灵根） | 火 +20% | +5% |
| `GOLDEN_FIRE`（金火灵根） | 金/火 +15% | +5% |
| `WOODEN_WATER`（木水灵根） | 木/水 +15% | +5% |
| `EARTHEN_GOLD`（土金灵根） | 土/金 +15% | +5% |
| `FIRE_WOOD_EARTH`（火土木灵根） | 火/木/土 +10% | +3% |
| `GOLDEN_WATER_WOOD`（金水木灵根） | 金/水/木 +10% | +3% |
| `HONGMENG`（鸿蒙灵根） | **+50%**（全作物），再乘灵根增强 ×1.5 | +50% |
| 其他 | 0 | 0 |

::: warning 鸿蒙灵根加成经乘算放大
`HONGMENG` 的基础值是 `0.50`，而它同时具有 `effectEnhancementMultiplier()`（鸿蒙为 ×1.5），因此实际加成是 **0.75（+75%）**。真五行灵根为 `0.20 × 1.0 = +20%`。
:::

## 季节联动

`SeasonService.getCurrentSeason()` 决定季节，`getGrowthModifier(elementType)` 返回生长速度修正。

| 季节 | 月份 | 加速作物（倍率） | 减速作物（倍率） | 其他 |
| --- | --- | --- | --- | --- |
| 春季 | 3、4、5 月 | 木、灵 **×1.25** | 火 ×0.75 | ×1.0 |
| 夏季 | 6、7、8 月 | 火 **×1.30** | 水、冰 ×0.80 | ×1.0 |
| 秋季 | 9、10、11 月 | 金、土 **×1.20** | 木 ×0.90 | ×1.0 |
| 冬季 | 12、1、2 月 | 水、冰 **×1.30** | 火 ×0.70 | ×1.0 |

`Season.getCurrentSeason()` 用**服务器本地月份**判定（`Calendar.MONTH + 1`），3~5 月春、6~8 月夏、9~11 月秋、其余冬。

`SeasonService` 还支持循环模式（日志会打印"全局季节系统已启动（模式: cycle/N小时 或 calendar）"），此时 `getCurrentSeason()` 返回的是被循环推进的季节，而 `Season.getCurrentSeason()` 仍是按月份算——**种植时用的是 `SeasonService` 的版本**。

生长时间修正举例：无加成时灵草 60 秒成熟；真五行灵根（+20%）× 正常季节为 50 秒；无加成冬季种火系（×0.70）为 85 秒；青帝木灵根春季种木系（1.3 × 1.25 = 1.625）为 36 秒；鸿蒙灵根夏季种火系（1.75 × 1.30 = 2.275）为 26 秒。

`appendBonusInfo` 会把加成写进种植提示，例如"（灵根加成 +20%）（春季加成 +25%）"；季节不利时额外追加"（当前X不利于此作物生长，可考虑更换种子）"。

## 数据表

`farm_plots`（`DatabaseSchema.createFarmPlotsTable`，另有 `DatabaseMigration.addFarmPlotsAdditionalColumns` 补列）：

| 字段 | 类型 | 建表位置 | 说明 |
| --- | --- | --- | --- |
| `id` | 主键 | 建表 | 地块 ID |
| `player_id` | `BIGINT NOT NULL` | 建表 | 玩家 ID（外键 → `players(id)` ON DELETE CASCADE） |
| `plot_index` | `INT NOT NULL` | 建表 | 地块索引，从 0 开始 |
| `state` | `VARCHAR(16) NOT NULL DEFAULT 'EMPTY'` | 建表 | 地块状态 |
| `seed_key` | `VARCHAR(128)` | 建表 | 种子全 key |
| `crop_key` | `VARCHAR(128)` | 建表 | 产物全 key |
| `planted_time` | `BIGINT DEFAULT 0` | 建表 | 种植时间（毫秒时间戳） |
| `harvest_time` | `BIGINT DEFAULT 0` | 建表 | 预计成熟时间 |
| `wilted_time` | `BIGINT DEFAULT 0` | 建表 + 迁移 | 首次枯萎时间 |
| `growth_stage` | `INT DEFAULT 0` | 建表 | 当前阶段 |
| `water_level` | `INT DEFAULT 100` | 建表 | 水分（0~100） |
| `fertilizer_level` | `INT DEFAULT 0` | 建表 | 肥力（0~100） |
| `yield` | `INT DEFAULT 0` | 建表 | 种植时锁定的基础产量 |
| `root_bonus` | `DOUBLE DEFAULT 0` | **仅迁移** | 种植时的灵根加成 |
| `season_modifier` | `DOUBLE DEFAULT 1` | **仅迁移** | 种植时的季节修正 |
| `pest_state` | `VARCHAR(16) DEFAULT 'CLEAN'` | **仅迁移** | 病虫害状态 |
| `pest_time` | `BIGINT DEFAULT 0` | **仅迁移** | 病虫害发生/恶化时间 |
| `crop_quality` | `VARCHAR(16)` | **仅迁移** | 收获品质（`NULL` 表示未判定） |
| `settled_time` | `BIGINT DEFAULT 0` | 建表 | 最后一次惰性结算时刻（毫秒）。水分衰减与病虫害都按 `now - settled_time` 折算 |

::: warning `farm_plots` 的约束与索引现状
- 没有 `UNIQUE (player_id, plot_index)`：并发扩建可能产生重复索引地块。
- 没有 `state` 索引。改为惰性结算后查询已收窄为 `WHERE player_id = ? AND state IN ('PLANTED','GROWING')`，命中 `player_id` 外键，**不再是全表扫描**。
- `root_bonus`、`season_modifier`、`pest_state`、`pest_time`、`crop_quality` 这 5 个字段只能靠 `ALTER TABLE` 迁移补上；若迁移在旧库上失败，`mapPlot` 会在 `rs.getString("pest_state")` 处抛异常。
:::

## 输出格式

`/种田` 的界面（`FarmCommand.viewPlots`）先输出当前季节、季节效果与距季节更替时间，再逐块输出 `地块 N: 状态 (作物) | 阶段: a/b | 水分: N% | 肥力: N% | 灵根+X% | 季节±X% | 剩余/可收获/已枯萎`，最后附可用命令与一键操作提示。

| 显示项 | 规则 |
| --- | --- |
| 灵根/季节加成 | 仅在 `root_bonus > 0` / `season_modifier != 1` 时显示 |
| 病虫害 | 仅非 `CLEAN` 时显示 `⚠X` |
| 剩余时间 | 仅 `GROWING` 状态显示，格式 `N分N秒` |
| 品质 | 仅 `READY` 且非 `COMMON` 时显示 `(上品)` / `(极品)` |

`/种田 种子` 会列出所有作物，并对每个种子标注当前季节是否适宜（`【春季适宜 +25%】` / `【冬季不利 -30%】`）。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 种植报"地块已被占用" | 目标地块非 `EMPTY`，需先收获或 `/种田 清理` |
| 作物突然枯萎 | 水分每秒 -0.1%，约 17 分钟从满水归零；枯萎 6 小时内浇水可复活。枯萎时刻按精确穿零点记录，离线再久也不会被推后 |
| 收获产量低于预期 | 水分/肥力不足、有病虫害、或品质判定为 `COMMON` |
| 施肥后肥力显示未满 | 单次只加 25/40/60，上限 100；满了会提示"肥力已充足" |
| 一键施肥报"X不足，需要 N 个" | 一键施肥要求肥料数量 ≥ 需要施肥的地块数，**不做部分施肥** |
| 扩建花钱了但地块没增加 | 并发扩建可能撞同一 `plot_index`（表无唯一约束），或金币校验在事务外 |
| 收获后肥力清零 | `resetPlot` 会把肥力重置为 0，需重新施肥 |
| 服务器重启后作物仍在生长 | 生长完全基于 `planted_time`/`settled_time`/`harvest_time` 时间戳惰性推导，与在线状态、重启次数都无关 |
