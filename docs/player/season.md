# 季节系统

季节（`Season`）是**全服共享的「天道时序」**，不只是种田系统的附属设定，而是同步影响闭关修炼、晨修、游历、灵石获取与物品掉落的全局玩法。核心实现为 `src/main/java/com/mtxgdn/game/service/SeasonService.java`。

相关源码：

| 关注点 | 文件 |
| --- | --- |
| 季节服务与倍率 | `src/main/java/com/mtxgdn/game/service/SeasonService.java` |
| 季节枚举与作物修正 | `src/main/java/com/mtxgdn/game/entity/Season.java` |
| 配置项 | `src/main/resources/application.yml`（`season` 段） |

## 一、两种模式

配置项位于 `application.yml`：

```yaml
season:
  mode: calendar               # 更替模式：calendar=按真实月份四季；cycle=按小时循环
  cycle_hours: 6               # cycle 模式下每季持续小时数（更替时全服广播）
```

| 模式 | 判定 | 更替时机 |
| --- | --- | --- |
| `calendar`（默认） | 按服务器本地真实月份 | 3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬 |
| `cycle` | `Math.floorMod(now / CYCLE_DURATION_MS, 4)` 取 0/1/2/3 | 每 `cycle_hours` 小时一季，默认 6 小时 |

`CYCLE_DURATION_MS = max(1, season.cycle_hours) × 3600_000L`，即 `cycle_hours` 最小被夹到 1 小时。

### 四季

| 枚举 | 显示名 | 描述 |
| --- | --- | --- |
| `SPRING` | 春季 | 万物复苏，木系作物生长加速 |
| `SUMMER` | 夏季 | 烈日炎炎，火系作物生长加速 |
| `AUTUMN` | 秋季 | 金风送爽，金系作物生长加速 |
| `WINTER` | 冬季 | 天寒地冻，水系/冰系作物生长加速 |

`Season.next()` 的循环顺序为 春 → 夏 → 秋 → 冬 → 春。

## 二、季节时钟

`SeasonService` 使用单线程守护调度器 `global-season-tick`，**每 10 秒**重算一次季节（初始延迟 10 秒），静态块中立即执行一次初始化。

```java
private static void tick() {
    // 内置模块门控：修炼模块停用后暂停天象刷新
    if (!com.mtxgdn.plugin.BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("cultivation")) return;
    recompute(System.currentTimeMillis(), false);
}
```

::: warning 模块门控
内置模块 `cultivation` 被停用（`plugins.yml` 中 `cultivation: false`）时，季节 tick 直接返回，季节不再重算。恢复模块后需等下一次 tick 或重启。
:::

### 对外接口

| 方法 | 返回 |
| --- | --- |
| `getCurrentSeason()` | 当前 `Season` 枚举 |
| `getSeasonStartMs()` | 当前季节开始毫秒时间戳 |
| `getSeasonEndMs()` | 当前季节结束（下次更替）毫秒时间戳 |
| `getSeasonRemainingMs()` | `max(0, seasonEndMs - now)` |
| `getSeasonDurationMs()` | `cycle` 模式返回单季时长；`calendar` 模式返回 `seasonEndMs - seasonStartMs` |
| `setChangeListener(Consumer<Season>)` | 注册季节更替监听（用于全服广播） |

### 季节起止计算

| 模式 | 开始 | 结束 |
| --- | --- | --- |
| `cycle` | `now - floorMod(now, CYCLE_DURATION_MS)` | 开始 + `CYCLE_DURATION_MS` |
| `calendar`（春 3–5 月） | 当年 3 月 1 日 00:00:00 | 当年 6 月 1 日 00:00:00 |
| `calendar`（夏 6–8 月） | 当年 6 月 1 日 00:00:00 | 当年 9 月 1 日 00:00:00 |
| `calendar`（秋 9–11 月） | 当年 9 月 1 日 00:00:00 | 当年 12 月 1 日 00:00:00 |
| `calendar`（冬 12–2 月） | 12 月 1 日（1/2 月时年份 −1） | 次年 3 月 1 日 00:00:00 |

季节发生实际变化（`old != next`）时记录日志 `【季节更替】旧 → 新` 并调用注册的 `changeListener`；监听器抛异常只记录错误日志，不影响主流程。

## 三、全局倍率

### 修炼倍率（`getCultivationMultiplier`）

| 季节 | 倍率 | 注释 |
| --- | --- | --- |
| 春季 | ×1.10 | 春回大地，灵气升腾 |
| 夏季 | ×1.05 | — |
| 秋季 | ×1.15 | 金秋肃杀，感悟更深 |
| 冬季 | ×0.95 | 天寒地冻，灵气凝滞 |

### 晨修倍率（`getMorningCultivationMultiplier`）

直接返回 `getCultivationMultiplier()`，**与闭关倍率完全一致**。

### 游历倍率（`getExplorationMultiplier`）

| 季节 | 倍率 |
| --- | --- |
| 春季 | ×1.10 |
| 夏季 | ×1.00 |
| 秋季 | ×1.05 |
| 冬季 | ×0.90 |

### 灵石倍率（`getSpiritStoneMultiplier`）

| 季节 | 倍率 | 注释 |
| --- | --- | --- |
| 春季 | ×1.00 | — |
| 夏季 | ×0.95 | — |
| 秋季 | ×1.20 | 秋收冬藏，收获丰盛 |
| 冬季 | ×0.90 | — |

### 掉落倍率（`getDropMultiplier`）

| 季节 | 倍率 |
| --- | --- |
| 春季 | ×1.05 |
| 夏季 | ×1.00 |
| 秋季 | ×1.15 |
| 冬季 | ×0.90 |

### 汇总表

| 季节 | 修炼 | 晨修 | 游历 | 灵石 | 掉落 |
| --- | --- | --- | --- | --- | --- |
| 春季 | ×1.10 | ×1.10 | ×1.10 | ×1.00 | ×1.05 |
| 夏季 | ×1.05 | ×1.05 | ×1.00 | ×0.95 | ×1.00 |
| 秋季 | ×1.15 | ×1.15 | ×1.05 | ×1.20 | ×1.15 |
| 冬季 | ×0.95 | ×0.95 | ×0.90 | ×0.90 | ×0.90 |

::: tip 秋季是全收益巅峰
秋季在修炼、灵石、掉落三项上均为全季最高，且游历仍高于夏季；冬季则是全面的低谷（修炼 −5%、游历 −10%、灵石 −10%、掉落 −10%）。
:::

### 季节效果描述

`getSeasonEffectDescription()` 返回面向玩家的文案：

| 季节 | 文案 |
| --- | --- |
| 春季 | 修炼+10%，游历+10%，木/灵系作物生长加速 |
| 夏季 | 修炼+5%，火系作物生长加速，灵石-5% |
| 秋季 | 修炼+15%，灵石+20%，掉落+15%，金/土系作物生长加速 |
| 冬季 | 修炼-5%，水/冰系作物生长加速，游历-10% |

## 四、各系统如何消费季节倍率

### 闭关修炼

`PlayerService.cultivationMultiplier` 中作为独立的乘数：

```java
double seasonMultiplier = SeasonService.getCultivationMultiplier();
double locationMultiplier = ServiceRegistry.getMapService().getCultivationBonus(player.getCurrentLocationId());
double mult = base * seasonMultiplier * locationMultiplier;
```

`/打坐` 与 `/停止` 的回复都会展示当前季节名与季节倍率，例如：

```text
季节: 秋季（×1.15）
地点: 问道峰（灵气 ×1.5）
```

### 晨修

`DailyService.doMorningCultivation` 在**天象加成与灵根加成之后**追加季节经验：

```java
double seasonMultiplier = SeasonService.getMorningCultivationMultiplier();
long seasonBonusExp = (long)(totalExp * (seasonMultiplier - 1));
totalExp += seasonBonusExp;
```

灵石则直接乘季节灵石倍率：

```java
totalSpiritStones = (long)(totalSpiritStones * SeasonService.getSpiritStoneMultiplier());
```

晨修成功消息在 `seasonBonusExp > 0` 时追加 `（{季节}加成 +N）`。冬季 `seasonMultiplier = 0.95` 时 `seasonBonusExp` 为负值，不会显示该后缀。

### 游历探索

`ExplorationService` 在事件结算完成后，按**已结算收益**追加季节奖励（仅在 `explMult > 1.0 && result.isSuccess()` 时）：

```java
double explMult = SeasonService.getExplorationMultiplier();
long bonusGold = (long)(result.getGoldGained() * (explMult - 1));
long bonusSS   = (long)(result.getSpiritStonesGained() * (explMult - 1));
long bonusExp  = (long)(result.getExpGained() * (explMult - 1));
```

日志追加 `🍂 {季节}游历加成: 金币+N 灵石+N 经验+N`。由于只在 `> 1.0` 时生效，**春/秋加成，夏（1.00）与冬（0.90）不产生追加**（冬季不会倒扣）。

### 战斗掉落

`CombatService` 在 PVE 胜利结算时把季节掉落倍率乘到怪物掉落概率上：

```java
double dropChance = monster.getLootChance() * SeasonService.getDropMultiplier();
if (random.nextDouble() < dropChance) { /* 从 lootTable 抽一件 */ }
```

### 作物生长

`SeasonService.getGrowthModifier(elementType)` 转发到 `Season.getGrowthModifier`，按作物元素类型返回生长倍率：

| 季节 | 加速元素 | 减速元素 | 其他 |
| --- | --- | --- | --- |
| 春季 | WOOD / SPIRIT ×1.25 | FIRE ×0.75 | ×1.0 |
| 夏季 | FIRE ×1.30 | WATER / ICE ×0.80 | ×1.0 |
| 秋季 | METAL / EARTH ×1.20 | WOOD ×0.90 | ×1.0 |
| 冬季 | WATER / ICE ×1.30 | FIRE ×0.70 | ×1.0 |

### REST / WebSocket 暴露

`GET /game/...`（`GameResource`）与 WebSocket 的季节接口都会下发以下字段：

```json
{
  "explorationMultiplier": 1.05,
  "spiritStoneMultiplier": 1.20,
  "dropMultiplier": 1.15
}
```

## 五、与天象的区别

季节与「天象」是两个独立系统，同时生效、互相叠乘：

| 维度 | 季节（`SeasonService`） | 天象（`CelestialPhenomenon`） |
| --- | --- | --- |
| 更替周期 | `calendar` 按自然月 / `cycle` 按小时 | 按自然日，每日随机 |
| 是否全服一致 | 是（静态全局状态） | 是（`DailyService` 单例缓存） |
| 修炼倍率范围 | 0.95 ~ 1.15 | 1.00 ~ 1.30 |
| 游历倍率范围 | 0.90 ~ 1.10（仅 >1 时追加） | 1.00 ~ 1.20（仅 >1 时追加） |
| 灵石倍率范围 | 0.90 ~ 1.20 | 1.00 ~ 1.50 |
| 掉落倍率 | 有（`getDropMultiplier`） | 无独立掉落倍率 |

::: details 季节配置示例
```yaml
# 快速验证季节切换：每 1 小时一季
season:
  mode: cycle
  cycle_hours: 1
```
切回 `calendar` 即为正式服默认行为。
:::
