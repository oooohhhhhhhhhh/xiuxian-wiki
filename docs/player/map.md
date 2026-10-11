# 世界地图

地图系统管理 15 个地点的区域归属、境界门槛、安全区标记、地点连通关系与**灵气加成倍率**，并负责玩家移动。核心实现为 `src/main/java/com/mtxgdn/game/service/MapService.java`（511 行），地点实体为 `src/main/java/com/mtxgdn/game/entity/MapLocation.java`。

## 指令

`/地图`（别名 `map`），分类「探索」，权限 `game.player.info`，玩法模块 `map`。

| 用法 | 说明 |
| --- | --- |
| `/地图` | 显示当前位置、区域、描述、灵气浓度（≠1.0 时）与可前往地点列表 |
| `/地图 go <地名>` | 前往相邻地点（子命令别名 `前往`） |
| `/地图 list [区域]` | 浏览全地图，可按区域过滤（子命令别名 `列表`、`浏览`） |

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

按 `region` 分组列出，格式为 `[ID] 名称 [★] — 需要≥X`，`★` 标记玩家当前所在地点，安全区追加 `🛡`。末尾附带固定主干路线示意图：

```
▍世界脉络
  (1)青云村 — (2)青云山 — (3)苍月镇 — (4)太虚城
                    ├─ (5)落霞山 — (7)昆仑墟 — (9)天元古城 — (10)问道峰
                    └─ (6)碧水潭 — (8)九幽渊
```

::: warning 示意图不完整
该示意图只画了主干路线，未包含 `4↔14`、`3↔13`、`4↔13`、`7↔15`、`8↔11`、`6↔11`、`5↔12`、`13↔6` 这些支线。完整连通关系以下文的邻接表与 `DEFAULT_CONNECTIONS` 为准。
:::

## 数据表结构

地图数据持久化在 `map_locations` 与 `map_connections` 两张表（建表语句见 `src/main/java/com/mtxgdn/db/DatabaseSchema.java` 的 `createMapLocationsTable` / `createMapConnectionsTable`）：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `map_locations` | `id` | 地点 ID（手工指定，非自增） |
| | `name` | 地点名，`getLocationByName` 精确匹配 |
| | `description` | 地点描述文本 |
| | `region` | 区域名，`/地图 list <区域>` 按此过滤 |
| | `min_realm` | 最低境界要求 |
| | `is_safe_zone` | 是否安全区（当前仅影响展示标记） |
| `map_connections` | `from_location_id` / `to_location_id` | 有向边（实际按无向处理，见下） |
| | `travel_time_seconds` | 通行秒数，默认 `5` |

初始化策略（`checkAndInsertDefaultData`）：

* `map_locations` 为空 → 一次性插入全部 15 个默认地点与 17 组双向连接；
* 非空（老库升级）→ 逐条补齐缺失的默认地点，再逐条补齐缺失的连接，并**扫描全表修复单向连接**（存在 A→B 但缺 B→A 时补上反向）。

::: tip 连接在实际运行时按无向处理
`loadConnections` 无论行方向如何，都会同时执行 `a.getConnections().add(b)` 与 `b.getConnections().add(a)`。因此即使数据库里只有单向行，游戏内仍可双向通行。`getTravelTimeSeconds` 也会在正向缺失时回退读取反向耗时。
:::

## 全部地点（15 个）

灵气加成来自 `MapService.CULTIVATION_BONUS`，是一张 `static final Map.ofEntries(...)` 常量表，**不存数据库**；读取入口为 `getCultivationBonus(locationId)`，未命中时返回默认值 `1.0`。

| ID | 名称 | 区域 | 最低境界 | 安全区 | 灵气加成 | 源码注释 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 青云村 | 新手区域 | 0 凡人 | 是 | ×1.00 | 灵气稀薄 |
| 2 | 青云山 | 新手区域 | 0 凡人 | 否 | ×1.05 | — |
| 3 | 苍月镇 | 新手区域 | 1 炼气期 | 是 | ×1.05 | — |
| 4 | 太虚城 | 中原 | 2 筑基期 | 是 | ×1.15 | 中原第一大城，坊市汇聚 |
| 5 | 落霞山 | 中原 | 2 筑基期 | 否 | ×1.10 | — |
| 6 | 碧水潭 | 中原 | 3 金丹期 | 否 | ×1.30 | 灵气充沛，金丹修士云集 |
| 7 | 昆仑墟 | 西域 | 4 元婴期 | 否 | ×1.30 | 上古神山遗迹 |
| 8 | 九幽渊 | 南荒 | 5 化神期 | 否 | ×1.20 | 阴气弥漫（魔道修士的福地） |
| 9 | 天元古城 | 远古遗迹 | 6 合体期 | 否 | ×1.35 | 上古阵法遗迹 |
| 10 | 问道峰 | 圣地 | 7 大乘期 | 否 | ×1.50 | 修仙圣地 |
| 11 | 东海龙宫 | 东海 | 4 元婴期 | 否 | ×1.40 | 龙族灵气浩荡 |
| 12 | 万妖谷 | 南荒 | 3 金丹期 | 否 | ×1.20 | 妖气淬体 |
| 13 | 灵药谷 | 中原 | 1 炼气期 | 否 | ×1.10 | 四季如春 |
| 14 | 天机阁 | 中原 | 2 筑基期 | 是 | ×1.15 | 推演悟道 |
| 15 | 白骨岭 | 西域 | 4 元婴期 | 否 | ×1.25 | 阴气浓郁 |

::: warning 灵气加成只影响闭关修炼
`getCultivationBonus` 的唯一消费方是 `PlayerService.cultivationMultiplier`：

```java
double locationMultiplier = ServiceRegistry.getMapService().getCultivationBonus(player.getCurrentLocationId());
double mult = base * seasonMultiplier * locationMultiplier;
```

**游历（`/游历`）完全不受所在地点影响** —— `ExplorationService` 从不引用 `MapService`，其收益只受季节与天象倍率影响。秘境的收益也不看地点。
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

## 传送（`teleportToLocation`）

传送符物品 `mtxgdn:teleport_talisman` 的效果由 `src/main/java/com/mtxgdn/game/item/TeleportEffect.java` 实现：

```java
/** 太虚城：中原第一大城，坊市汇聚（安全区） */
private static final long MAIN_CITY_LOCATION_ID = 4L;

@Override
public String execute(long playerId, PlayerService playerService, ItemService itemService) {
    Map<String, Object> result = ServiceRegistry.getMapService().teleportToLocation(playerId, MAIN_CITY_LOCATION_ID);
    ...
}
```

| 项目 | 传送 |
| --- | --- |
| 路径要求 | **无**，无视邻接关系 |
| 境界要求 | 保留，`player.realm < target.minRealm` 时提示 `境界不足，X需要Y以上方可进入（当前：Z）` |
| 冷却 | 无；`executeTravel` 会把 `last_travel_time` 刷成当前秒，因此传送后仍要等 5 秒才能再走一步 |
| 目的地 | 固定为太虚城（ID 4） |

::: warning 物品描述与实际行为不符
`zh_cn.json` 中 `item.teleport_talisman.desc` 写的是「使用后可传送到任意已探索的秘境」，但 `TeleportEffect` 硬编码传送到太虚城，不接受任何目的地参数。`TeleportEffect.to(destination)` 工厂方法虽然存在，却忽略入参并直接 `new TeleportEffect()`。
:::

## 与游历、秘境的消耗对比

| 玩法 | 地点依赖 | 冷却 | 体力/能量消耗 | 物品消耗 |
| --- | --- | --- | --- | --- |
| 移动 `/地图 go` | 必须相邻、满足 `min_realm` | 5 秒（`travel_time_seconds`） | 无 | 无 |
| 游历 `/游历` | **无** | 300 秒（巽风灵根 210 秒） | 无 | 无 |
| 秘境 `/进入秘境` | **无** | 按秘境 120~1200 秒，跨秘境共享同一时间戳 | 无 | 无 |
| 闭关修炼 | 使用当前地点的灵气加成 | 无 | 无 | 无 |
| 传送符 | 无（无视邻接） | 无 | 无 | 消耗 1 张传送符 |

::: warning 游历不需要在特定地点
`ExplorationService` 不读取 `current_location_id`，`/游历` 在任何地点（包括境界不足的区域）行为完全一致。唯一受地点影响的是闭关修炼的灵气倍率。
:::

## 玩家位置读写

| 方法 | 说明 |
| --- | --- |
| `getPlayerLocationId(playerId)` | 读 `players.current_location_id`；为 NULL 时返回 `DEFAULT_LOCATION_ID = 1`（青云村） |
| `getPlayerLastTravelTime(playerId)` | 读 `players.last_travel_time`（秒），为 NULL 时返回 0 |
| `getPlayerSurroundings(playerId)` | 组装当前位置、邻居列表（含 `id`/`name`/`region`/`safeZone`/`accessible`/`travelSeconds`）与 `cultivationBonus` |
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

`CULTIVATION_BONUS` 是 `static final` 常量表，不随数据库变化；若要调整灵气倍率必须改代码并重新编译。

## WebSocket 接口

WebSocket 消息类型 `map_locations` 由 `GameWebSocketApp` 处理（`src/main/java/com/mtxgdn/websocket/GameWebSocketApp.java`）：

```java
case "map_locations":
    ...
    socket.send(GameMessage.ok(msgId, "map_locations", resp).toJson());
```

Web 管理台与客户端通过该消息读取地图数据，与 `/地图 list` 使用同一份 `MapService` 缓存。
