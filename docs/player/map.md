# 世界地图

地图系统管理 15 个地点的区域归属、境界门槛、安全区标记、地点连通关系、**灵气加成**与**地界加成**、**危险度**、探索度，以及**野外无限分片世界**，并负责玩家移动。核心实现为 `src/main/java/com/mtxgdn/game/service/MapService.java`（1878 行），地点实体为 `src/main/java/com/mtxgdn/game/entity/MapLocation.java`。

已知世界是下面这 15 个固定地点；此外还有一片由世界种子确定性生成、可无限外扩的**野外分片世界**，见[野外（无限分片世界）](/player/wilderness)。

## 指令

`/地图`（别名 `map`），分类「探索」，权限 `game.player.info`，玩法模块 `map`。

| 用法 | 说明 |
| --- | --- |
| `/地图` | 显示当前位置、区域、描述、灵气浓度（≠1.0 时）、**危险度**与可前往地点列表 |
| `/地图 go <地名>` | 前往相邻地点（子命令别名 `前往`） |
| `/地图 传送 <地名>` | **付费直传**：无视邻接直达，但**必须已经到过**该地点；花费随两地危险度之和增长（子命令别名 `tp`） |
| `/地图 list [区域]` | 浏览全地图，可按区域过滤（子命令别名 `列表`、`浏览`）；顶部显示**探索度**进度 |

### `/地图` 的输出

```
📍 当前位置：【太虚城】（中原）
中原修仙第一大城，城墙高达百丈，城中央的太虚塔直入云霄。各大宗门在此设有驻地，坊市内珍品云集。
灵气浓度: ×1.15（闭关修炼加成）

▍可前往的地点：
  🚶 /地图 go 苍月镇  → 苍月镇（新手区域 · 路程约 5秒） 🛡安全区
  🚶 /地图 go 落霞山  → 落霞山（中原 · 路程约 5秒）
  🚶 /地图 go 碧水潭  → 碧水潭（中原 · 路程约 5秒）
  🚶 /地图 go 灵药谷  → 灵药谷（中原 · 路程约 5秒）
  🚶 /地图 go 天机阁  → 天机阁（中原 · 路程约 5秒） 🛡安全区

输入 /地图 list 浏览全图
```

不可达的地点（境界不足）图标变为 🔒 并追加 `[境界不足]`；安全区追加 `🛡安全区`。

::: tip 邻居列表的顺序取决于数据库行顺序
`loadConnections` 用 `SELECT * FROM map_connections` 的返回顺序往 `MapLocation.connections` 里追加，没有排序。因此上例中 5 个邻居的先后可能随数据库行顺序变化。
:::

### `/地图 list` 的输出

按 `region` 分组列出，格式为 `[ID] 名称 [★] — 需要≥X`，`★` 标记玩家当前所在地点，安全区追加 `🛡`。顶部还会输出**探索度**：

```
🧭 探索度：8/15（53%）
```

末尾的「世界脉络」是**按真实连接动态生成**的树状图（`MapCommand` 从 `MapService` 的邻接关系递归展开），不是硬编码的示意图——因此它总会包含全部 17 组连接，包括 `4↔14`、`3↔13`、`4↔13`、`7↔15`、`8↔11`、`6↔11`、`5↔12`、`13↔6` 这些支线。未探索的地点在图上标 `❔`，已探索的标 `✅`。

## 数据表结构

地图数据持久化在 `map_locations` 与 `map_connections` 两张表（建表语句见 `src/main/java/com/mtxgdn/db/DatabaseSchema.java` 的 `createMapLocationsTable` / `createMapConnectionsTable`）：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `map_locations` | `id` | 地点 ID（手工指定，非自增） |
| | `name` | 地点名，`getLocationByName` 精确匹配 |
| | `description` | 地点描述文本 |
| | `region` | 区域名，`/地图 list <区域>` 按此过滤 |
| | `min_realm` | 最低境界要求 |
| | `is_safe_zone` | 是否安全区。**真正生效**：任一方身处安全区即拒绝切磋，见 [PVP 系统](/player/pvp) |
| | `cultivation_bonus` | 闭关修炼的灵气加成倍率（默认 `1.0`） |
| | `exploration_bonus` | 游历/秘境收益的**地界加成**倍率（默认 `1.0`） |
| | `danger_level` | **危险度 0~4**（0 安全 / 1 低危 / 2 中危 / 3 高危 / 4 极危），默认 `0` |
| | `is_wilderness` | 是否为野外生成的节点（已知世界地点为 `0`） |
| | `expires_at` | 野外节点的过期时间（已知世界为 `NULL`） |
| | `entry_location_id` | 野外节点的入口地点 id（已知世界为 `NULL`） |
| `map_connections` | `from_location_id` / `to_location_id` | 有向边（实际按无向处理，见下） |
| | `travel_time_seconds` | 通行秒数，默认 `5` |

初始化策略（`checkAndInsertDefaultData`）：

* `map_locations` 为空 → 一次性插入全部 15 个默认地点与 17 组双向连接；
* 非空（老库升级）→ 逐条补齐缺失的默认地点，再逐条补齐缺失的连接，并**扫描全表修复单向连接**（存在 A→B 但缺 B→A 时补上反向）。

::: tip 连接在实际运行时按无向处理
`loadConnections` 无论行方向如何，都会同时执行 `a.getConnections().add(b)` 与 `b.getConnections().add(a)`。因此即使数据库里只有单向行，游戏内仍可双向通行。`getTravelTimeSeconds` 也会在正向缺失时回退读取反向耗时。
:::

## 全部地点（15 个）

地点的出厂值定义在 `src/main/java/com/mtxgdn/game/config/MapDefaults.java` 的 `LOCATIONS` 列表（每条含 `cultivationBonus`、`explorationBonus`、`dangerLevel`），首次初始化时**落库**写入 `map_locations`。读取入口为 `getCultivationBonus(locationId)`、`getExplorationBonus(locationId)`、`getDangerLevel(locationId)`，未命中时分别返回 `1.0`、`1.0`、`0`。

::: tip 不变式：安全区的危险度必为 0
`MapDefaults` 里 4 个安全区（青云村、苍月镇、太虚城、天机阁）的 `dangerLevel` 都是 `0`。两者是**分离**的语义——安全区决定"能不能打"，危险度决定"赢了能抢多少"，因此即使管理员把某地危险度误填成 0，也不会意外开放 PK。
:::

| ID | 名称 | 区域 | 最低境界 | 安全区 | 灵气加成 | 地界加成 | 危险度 | 源码注释 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 青云村 | 新手区域 | 0 凡人 | 是 | ×1.00 | ×1.00 | 0 安全 | 灵气稀薄 |
| 2 | 青云山 | 新手区域 | 0 凡人 | 否 | ×1.05 | ×1.05 | 1 低危 | — |
| 3 | 苍月镇 | 新手区域 | 1 炼气期 | 是 | ×1.05 | ×1.05 | 0 安全 | — |
| 4 | 太虚城 | 中原 | 2 筑基期 | 是 | ×1.15 | ×1.10 | 0 安全 | 中原第一大城，坊市汇聚 |
| 5 | 落霞山 | 中原 | 2 筑基期 | 否 | ×1.10 | ×1.20 | 2 中危 | 妖兽横行，落霞草唯一产地 |
| 6 | 碧水潭 | 中原 | 3 金丹期 | 否 | ×1.30 | ×1.15 | 1 低危 | 灵气充沛，金丹修士云集 |
| 7 | 昆仑墟 | 西域 | 4 元婴期 | 否 | ×1.30 | ×1.45 | 3 高危 | 上古神山遗迹 |
| 8 | 九幽渊 | 南荒 | 5 化神期 | 否 | ×1.20 | ×1.40 | 4 极危 | 阴气弥漫（魔道修士的福地） |
| 9 | 天元古城 | 远古遗迹 | 6 合体期 | 否 | ×1.35 | ×1.50 | 4 极危 | 上古阵法遗迹 |
| 10 | 问道峰 | 圣地 | 7 大乘期 | 否 | ×1.50 | ×1.35 | 2 中危 | 修仙圣地 |
| 11 | 东海龙宫 | 东海 | 4 元婴期 | 否 | ×1.40 | ×1.55 | 3 高危 | 龙族灵气浩荡 |
| 12 | 万妖谷 | 南荒 | 3 金丹期 | 否 | ×1.20 | ×1.35 | 3 高危 | 妖气淬体 |
| 13 | 灵药谷 | 中原 | 1 炼气期 | 否 | ×1.10 | ×1.25 | 1 低危 | 四季如春 |
| 14 | 天机阁 | 中原 | 2 筑基期 | 是 | ×1.15 | ×1.10 | 0 安全 | 推演悟道 |
| 15 | 白骨岭 | 西域 | 4 元婴期 | 否 | ×1.25 | ×1.30 | 3 高危 | 阴气浓郁 |

::: warning 灵气加成与地界加成是两个不同的倍率，别混用
**灵气加成**（`cultivation_bonus`）只影响闭关修炼。`getCultivationBonus` 的唯一消费方是 `PlayerService.cultivationMultiplier`：

```java
double locationMultiplier = ServiceRegistry.getMapService().getCultivationBonus(player.getCurrentLocationId());
double mult = base * seasonMultiplier * locationMultiplier;
```

**地界加成**（`exploration_bonus`）只影响游历与秘境收益，由 `ExplorationService` 在季节、天象之后追加第三层倍率（日志显示 `🏔【地界】地界加成 ×N`）。

此外，地点还会通过 `map_location_event_bias` **改变游历事件的抽取权重**（见下文「地界事件偏置」）。因此"游历完全不受地点影响"的说法已不成立。
:::

### 地点描述

| 名称 | 描述 |
| --- | --- |
| 青云村 | 青山环绕的小村庄，灵气稀薄，是修仙者踏入仙途的第一站。村口的老槐树下，立着一块刻满道纹的石碑。 |
| 青云山 | 青云村后山，山腰云雾缭绕，时有仙鹤飞过。传说山中藏有先贤洞府，只是从未有人寻得。 |
| 苍月镇 | 坐落在苍月山脚下的小镇，因出产月华石而闻名。镇中坊市热闹非凡，往来的散修络绎不绝。 |
| 太虚城 | 中原修仙第一大城，城墙高达百丈，城中央的太虚塔直入云霄。各大宗门在此设有驻地，坊市内珍品云集。 |
| 落霞山 | 山势险峻，落日时分霞光万丈，故得名。山中妖兽横行，却也是筑基丹主材「落霞草」的唯一产地。 |
| 碧水潭 | 一汪深不见底的碧色潭水，潭底据说连通东海龙宫。潭边灵气充沛，常有金丹修士在此打坐修炼。 |
| 昆仑墟 | 上古神山昆仑的遗迹，山体早已崩碎，只剩下悬浮在虚空中的残垣断壁。唯有元婴期以上修士方能踏足此地。 |
| 九幽渊 | 深不见底的黑暗深渊，传闻是九幽之地的入口。渊中阴气弥漫，滋生无数邪祟妖物，化神修士亦不敢轻入。 |
| 天元古城 | 远古修仙文明的遗迹，城中遍布上古禁制与阵法遗迹。合体期修士在此寻宝，一步不慎便可能触发禁制。 |
| 问道峰 | 修仙界的至高圣地。峰顶立有历代飞升者留下的问道碑，传说登顶者可感悟天道，破境飞升。 |
| 东海龙宫 | 碧波万顷之下，隐匿着龙族的巍峨宫殿。宫墙由珊瑚砌成，夜明珠照亮百里海疆，机缘与凶险并存。 |
| 万妖谷 | 南荒深处的妖兽聚集之地，谷中妖气冲天。此地妖兽内丹品质极高，是炼丹师梦寐以求的猎场。 |
| 灵药谷 | 灵气氤氲的世外桃源，谷中灵田常年不冻，四季如春。传言这里的土壤天生适宜灵植生长。 |
| 天机阁 | 隐匿于太虚城中的神秘势力，号称上知天命、下晓地理。阁中出售各种奇门遁甲与推演秘术。 |
| 白骨岭 | 西域大漠中的荒凉山岭，累累白骨铺满山道。此地阴魂不散，常有邪修出没，以死者怨气练功。 |

## 地点连接

默认连接定义（`DEFAULT_CONNECTIONS`，17 组，双向）：

```java
private static final long[][] DEFAULT_CONNECTIONS = {
        {1, 2}, {2, 3}, {3, 4}, {4, 5}, {4, 6}, {5, 7}, {6, 8}, {7, 9}, {9, 10},
        {4, 14}, {3, 13}, {4, 13}, {7, 15}, {8, 11}, {6, 11}, {5, 12}, {13, 6}
};
```

### 邻接表

| ID | 名称 | 可直达地点 | 度数 |
| --- | --- | --- | --- |
| 1 | 青云村 | 2 青云山 | 1 |
| 2 | 青云山 | 1 青云村、3 苍月镇 | 2 |
| 3 | 苍月镇 | 2 青云山、4 太虚城、13 灵药谷 | 3 |
| 4 | 太虚城 | 3 苍月镇、5 落霞山、6 碧水潭、13 灵药谷、14 天机阁 | 5 |
| 5 | 落霞山 | 4 太虚城、7 昆仑墟、12 万妖谷 | 3 |
| 6 | 碧水潭 | 4 太虚城、8 九幽渊、11 东海龙宫、13 灵药谷 | 4 |
| 7 | 昆仑墟 | 5 落霞山、9 天元古城、15 白骨岭 | 3 |
| 8 | 九幽渊 | 6 碧水潭、11 东海龙宫 | 2 |
| 9 | 天元古城 | 7 昆仑墟、10 问道峰 | 2 |
| 10 | 问道峰 | 9 天元古城 | 1 |
| 11 | 东海龙宫 | 6 碧水潭、8 九幽渊 | 2 |
| 12 | 万妖谷 | 5 落霞山 | 1 |
| 13 | 灵药谷 | 3 苍月镇、4 太虚城、6 碧水潭 | 3 |
| 14 | 天机阁 | 4 太虚城 | 1 |
| 15 | 白骨岭 | 7 昆仑墟 | 1 |

太虚城（ID 4）是枢纽，5 条通道；青云村、问道峰、万妖谷、天机阁、白骨岭为端点（各 1 条通道）。整张图连通，任意两点可达。

### 通行耗时

`travel_time_seconds` 在初始化时统一写死为 `5`：

```java
String connSql = "INSERT INTO map_connections (from_location_id, to_location_id, travel_time_seconds) VALUES (?, ?, 5)";
```

`insertConnectionIfMissing` 补插缺失连接时同样使用硬编码的 `ps.setInt(3, 5)`。因此**默认所有路线的通行耗时都是 5 秒**。管理员可直接改表来自定义（读取时 `Math.max(1, travelTime)` 兜底）。

```java
/** 两地之间的通行耗时（秒），无连接则返回 -1 */
public int getTravelTimeSeconds(long fromId, long toId) {
    ensureInitialized();
    Integer t = travelTimes.get(key(fromId, toId));
    if (t != null) return t;
    Integer reverse = travelTimes.get(key(toId, fromId));
    return reverse != null ? reverse : -1;
}
```

## 移动（`travel`）

```java
public Map<String, Object> travel(long playerId, long targetLocationId) {
    ensureInitialized();
    MapLocation target = locationCache.get(targetLocationId);
    if (target == null) return createResult(false, "该地点不存在");
    Player player = playerService.getPlayerById(playerId);
    if (player == null) return createResult(false, "玩家不存在");
    if (!checkRealm(player, target)) { ... }
    long currentLocId = getPlayerLocationId(playerId);
    if (currentLocId == targetLocationId) return createResult(false, "你已经在" + target.getName() + "了");
    ...
}
```

### 校验顺序与提示

| # | 条件 | 失败提示 |
| --- | --- | --- |
| 1 | 目标地点存在 | `该地点不存在` |
| 2 | 玩家存在 | `玩家不存在` |
| 3 | `player.realm >= target.minRealm` | `境界不足，X需要Y以上方可进入（当前：Z）` |
| 4 | 不是当前所在地 | `你已经在X了` |
| 5 | 当前位置在缓存中 | `当前位置异常，请联系管理员` |
| 6 | 与目标相邻 | `无法直接前往「X」，你只能从Y前往：A、B、C` |
| 7 | 赶路冷却已过 | `你正在赶路途中（还需要 N 秒到达），请稍候` |

第 6 条失败时会列出当前地点的**全部**邻居名，这是玩家发现地图结构的主要途径。

### 赶路冷却

```java
private static final long TRAVEL_COOLDOWN_SECONDS = 30;

int travelSeconds = getTravelTimeSeconds(currentLocId, targetLocationId);
long cooldownSeconds = Math.max(5, travelSeconds > 0 ? travelSeconds : TRAVEL_COOLDOWN_SECONDS);
```

| 场景 | `travelSeconds` | 冷却计算 | 实际冷却 |
| --- | --- | --- | --- |
| 默认数据（`travel_time_seconds = 5`） | 5 | `max(5, 5)` | **5 秒** |
| 管理员把耗时改为 60 | 60 | `max(5, 60)` | **60 秒** |
| 管理员把耗时改为 1 | 1 | `max(5, 1)` | **5 秒**（下限生效） |
| 查不到任何方向的耗时 | -1 | `max(5, TRAVEL_COOLDOWN_SECONDS)` | **30 秒** |

::: warning 冷却下限是 5 秒，不是 30 秒
`TRAVEL_COOLDOWN_SECONDS = 30` 只在 `travelSeconds > 0` 为假时作为回退值参与 `Math.max`。默认数据下耗时恒为 5，所以实际冷却就是 5 秒；把耗时改小到 1 也仍然要等 5 秒。

另外 `travelTimes.put(key(from, to), Math.max(1, travelTime))` 会把 0 或负数钳到 1，所以已存在的连接行不会产生非正值；`-1` 只可能出现在"既无正向行也无反向行"的情况，而此时第 6 步 `isConnected` 校验已先失败。
:::

冷却判定基于 `players.last_travel_time`（**秒级**时间戳）：

```java
private boolean checkTravelCooldown(long playerId, long cooldownSeconds) {
    long lastTravel = getPlayerLastTravelTime(playerId);
    long now = System.currentTimeMillis() / 1000;
    return (now - lastTravel) >= cooldownSeconds;
}
```

### 移动消耗

::: tip 移动不消耗任何资源
`executeTravel` 只做一条 UPDATE：

```java
String sql = "UPDATE players SET current_location_id = ?, last_travel_time = ? WHERE id = ?";
```

不扣体力、不扣能量（`player_energy`）、不扣金币/灵石/物品。移动的唯一成本是赶路冷却时间。
:::

## 危险度（`danger_level`）

每个地点都有 `0~4` 的危险度：

| 值 | 名称 |
| --- | --- |
| 0 | 安全 |
| 1 | 低危 |
| 2 | 中危 |
| 3 | 高危 |
| 4 | 极危 |

危险度影响四件事：

| 影响面 | 说明 |
| --- | --- |
| **险地 PK 掠夺** | 危险度 ≥3 的地点，胜者夺走败者 `5% × 危险度` 的灵石（3 级 15%、4 级 20%），见 [PVP 系统](/player/pvp) |
| **野外资源档位** | 野外分片的资源池按危险度档位抽取，越险出产越好，见[野外（无限分片世界）](/player/wilderness) |
| **首达奖励额度** | 首达奖励 = 基础值 + 危险度 × 每级值 |
| **传送费用** | 按「出发地危险度 + 目的地危险度」之和计价 |

`/地图` 与 `/地图 list` 都会打印 `☠ 危险度：高危（3/4）`；战斗结算时战报里也会出现 `☠ X 之地，……`。

::: tip 安全区与危险度是分离的两套语义
`is_safe_zone` 决定「**能不能打**」，`danger_level` 决定「**赢了能抢多少**」。
`MapDefaults` 保证 4 个安全区的危险度都是 `0`，但判定 PK 时**只看 `is_safe_zone`** ——
这样即使管理员把某地危险度误填成 0，也不会意外开放 PK。
:::

## 探索度与首达奖励

玩家首次抵达某地点时写一行 `player_map_exploration`（`UNIQUE (player_id, location_id)`，重复抵达不写），用于：

| 用途 | 说明 |
| --- | --- |
| 探索度进度 | `/地图 list` 顶部显示 `🧭 探索度：N/15（x%）`，只统计已知世界 15 地点 |
| 首达奖励 | 每个新地点发放一次灵石 + 灵力 |
| 全图完成奖励 | 走遍全部 15 个已知世界地点，额外发放 **2000 灵石** |
| 传送点解锁 | 到过的地点才能用 `/地图 传送` 直传 |

首达奖励按「基础值 + 危险度 × 每级值」计算，野外节点另乘野外倍率（探索野外更有价值）：

| 配置键 | 出厂值 |
| --- | --- |
| `firstVisitReward.spiritStonesBase` | `20` |
| `firstVisitReward.spiritStonesPerDanger` | `30` |
| `firstVisitReward.spiritStonesWildernessMultiplier` | `2.0` |
| `firstVisitReward.experienceBase` | `50` |
| `firstVisitReward.experiencePerDanger` | `80` |
| `firstVisitReward.experienceWildernessMultiplier` | `2.0` |
| `firstVisitReward.completionBonusSpiritStones` | `2000` |

配置在 `src/main/resources/game/wilderness_map.json` 的 `firstVisitReward` 段。

## 地界加成与事件偏置

**地界加成**（`exploration_bonus`）是游历/秘境收益的第三层倍率，在季节与天象之后追加：

| 地点 | 地界加成 |
| --- | --- |
| 东海龙宫 | ×1.55 |
| 天元古城 | ×1.50 |
| 昆仑墟 | ×1.45 |
| 九幽渊 | ×1.40 |
| 问道峰、万妖谷 | ×1.35 |
| 白骨岭 | ×1.30 |
| 灵药谷 | ×1.25 |
| 落霞山 | ×1.20 |
| 碧水潭 | ×1.15 |
| 太虚城、天机阁 | ×1.10 |
| 青云山、苍月镇 | ×1.05 |
| 青云村 | ×1.00 |

**地界事件偏置**（`map_location_event_bias` 表）让地点描述里的承诺真正作用于游历事件的抽取概率。出厂共 23 条，例如：

| 地点 | 事件 | 权重倍率 |
| --- | --- | --- |
| 灵药谷 | `herb` | ×3.0 |
| 天元古城 | `ruins` | ×3.0 |
| 万妖谷 | `monster` | ×3.0 |
| 问道峰 | `cultivator` | ×3.0 |
| 东海龙宫 | `treasure` | ×3.0 |
| 落霞山 | `material` | ×2.6 |
| 碧水潭 | `spirit_spring` | ×2.6 |
| 昆仑墟 | `ruins` | ×2.6 |
| 天机阁 | `mystery` | ×2.6 |
| 灵药谷 | `seed` | ×2.2 |
| 苍月镇、太虚城 | `merchant` | ×2.0 |
| 九幽渊 | `monster` | ×2.0 |
| 白骨岭 | `trap` | ×2.0 |

抽取走 `ExplorationEventRegistry.randomByWeight(random, bias)`，因此**同一个事件在不同地点的实际概率不同**。`/游历` 的文案里也会体现（如「此地以『X』闻名」）。详见[游历与事件](/player/exploration)。

## 传送：两种机制

游戏里有**两套互不相同**的传送，别混用：

| | 传送符（物品） | `/地图 传送`（玩法内直传） |
| --- | --- | --- |
| 载体 | 消耗品 `mtxgdn:teleport_talisman` | 指令子命令（别名 `tp`） |
| 目的地 | **固定太虚城**（ID 4） | 任意**已经到过**的地点 |
| 是否需要到过 | 不需要 | **必须已经到过**（传送点需亲自抵达后解锁） |
| 费用 | 消耗 1 张传送符 | 灵石，见下 |
| 境界要求 | 保留 | 保留 |
| 冷却 | 无（但会把 `last_travel_time` 刷成当前秒，之后 5 秒内不能再 `/地图 go`） | 同 |

### `/地图 传送` 的费用

```java
public long getTeleportCost(long fromLocationId, long targetLocationId) {
    int dangerSum = from.getDangerLevel() + to.getDangerLevel();
    double cost = cfg.getBaseCost() + cfg.getCostPerDanger() * dangerSum;
    if (to.isWilderness()) cost *= cfg.getWildernessSurcharge();
    return Math.max(cfg.getMinCost(), Math.round(cost));
}
```

| 配置键 | 出厂值 | 含义 |
| --- | --- | --- |
| `teleport.enabled` | `true` | 是否开启 |
| `teleport.baseCost` | `50` | 基础费用 |
| `teleport.costPerDanger` | `60` | 每 1 点「两地危险度之和」的加价 |
| `teleport.wildernessSurcharge` | `1.5` | 目的地是野外节点时的附加系数 |
| `teleport.minCost` | `10` | 费用下限 |

按「出发地 + 目的地」危险度之和计价，是为了让「从安全区直传极危之地」比「从邻境直传」更贵。
例：从太虚城（危险度 0）直传九幽渊（危险度 4）= `50 + 60×4 = 290` 灵石。

::: warning 传送符的物品描述与实际行为不符
`zh_cn.json` 中 `item.teleport_talisman.desc` 写的是「使用后可传送到任意已探索的秘境」，但 `TeleportEffect` 硬编码传送到太虚城，不接受任何目的地参数。`TeleportEffect.to(destination)` 工厂方法虽然存在，却忽略入参并直接 `new TeleportEffect()`。
:::

## 与游历、秘境的消耗对比

| 玩法 | 地点依赖 | 冷却 | 体力/能量消耗 | 物品/货币消耗 |
| --- | --- | --- | --- | --- |
| 移动 `/地图 go` | 必须相邻、满足 `min_realm` | 5 秒（`travel_time_seconds`） | 无 | 无 |
| 游历 `/游历` | 收益受**地界加成**与**事件偏置**影响 | 300 秒（巽风灵根 210 秒） | 无 | 无 |
| 秘境 `/进入秘境` | 收益受**地界加成**影响 | 按秘境 120~1200 秒，跨秘境共享同一时间戳 | 无 | 无 |
| 闭关修炼 | 使用当前地点的**灵气加成** | 无 | 无 | 无 |
| 传送符 | 无（无视邻接），固定去太虚城 | 无 | 无 | 消耗 1 张传送符 |
| `/地图 传送` | 无（无视邻接），但**必须已经到过** | 无 | 无 | 灵石（按两地危险度之和计价） |

::: warning 游历不要求身处特定地点，但收益看地点
`ExplorationService` 不读取 `current_location_id` 来做**准入判断** —— `/游历` 在任何地点（包括境界不足的区域）都能执行。
但结算时会读取所在地点的 `exploration_bonus` 作为第三层倍率，并按 `map_location_event_bias` 调整事件抽取权重。
:::

## 玩家位置读写

| 方法 | 说明 |
| --- | --- |
| `getPlayerLocationId(playerId)` | 读 `players.current_location_id`；为 NULL 时返回 `DEFAULT_LOCATION_ID = 1`（青云村） |
| `getPlayerLastTravelTime(playerId)` | 读 `players.last_travel_time`（秒），为 NULL 时返回 0 |
| `getPlayerSurroundings(playerId)` | 组装当前位置、邻居列表（含 `id`/`name`/`region`/`safeZone`/`accessible`/`travelSeconds`）与 `cultivationBonus`；另含 `dangerLevel`/`dangerName`/`explorationBonus`/`wilderness`/`wildernessResource`/`wildernessExpiresAt` |
| `getPlayerLocationNames(playerIds)` | 批量查询，供玩家列表展示，避免 N+1 |
| `getLocationsByRegion(region)` | 按 `region` 精确匹配过滤 |

`MapLocation` 的 `connections` 列表在 `loadConnections` 时建立，`getPlayerSurroundings` 直接遍历它生成邻居列表。

## 缓存与初始化

```java
public synchronized void ensureInitialized() {
    if (initialized) return;
    loadFromDb();
    initialized = true;
}
```

| 字段 | 内容 |
| --- | --- |
| `locationCache` | `LinkedHashMap<Long, MapLocation>`，按 `id` 升序（`ORDER BY id`） |
| `connections` | `List<long[]>`，每行一条有向边 |
| `travelTimes` | `Map<String, Integer>`，key 为 `"from-to"` |
| `initialized` | 首次访问时懒加载，方法加 `synchronized` |

`MapService.CULTIVATION_BONUS` 常量表**已删除**：灵气加成、地界加成与危险度现在随行存在 `map_locations` 表里（出厂值来自 `MapDefaults.LOCATIONS`），因此可以通过数据库或管理后台的「🗺️ 地图管理」页调整，不必改代码重新编译。

## WebSocket 接口

WebSocket 消息类型 `map_locations` 由 `GameWebSocketApp` 处理（`src/main/java/com/mtxgdn/websocket/GameWebSocketApp.java`）：

```java
case "map_locations":
    ...
    socket.send(GameMessage.ok(msgId, "map_locations", resp).toJson());
```

Web 管理台与客户端通过该消息读取地图数据，与 `/地图 list` 使用同一份 `MapService` 缓存。
