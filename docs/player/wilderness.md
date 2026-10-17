# 野外（无限分片世界）

**已知世界**是 `map_locations` 里 `is_wilderness = 0` 的 **15 个固定地点**（青云村到白骨岭，id 1~15），出厂值写死在 `MapDefaults.LOCATIONS` 里，永远只有这 15 个，见[世界地图](/player/map)。

**野外**是这 15 个地点之外的另一套世界：它由 `worldSeed`（世界种子）**确定性生成**，可以**无限向外扩展**，划分成一片片 **4×4 = 16 个节点**的**分片（chunk）**。走到哪里就生成到哪里，没人去过的地方在磁盘上**完全不存在**，也不在数据库里留下任何一行 —— 玩家走多远，`map_locations` 的行数都不变。

| | 已知世界 | 野外 |
| --- | --- | --- |
| 地点数量 | 固定 15 个（id 1~15） | 无限（由 `maxChunksFromOrigin` 兜底） |
| id 来源 | 手工指定，存在 `map_locations` 表 | 由分片坐标现算，`ID_BASE = 1_000_000` 起 |
| 地形 | 手写描述 | 世界种子 + 高程/湿度噪声 → 6 种生态 |
| 能否"全走一遍" | 能（15/15，有完成奖励） | **不能**，也不计入探索度 |
| 资源 | 无 | 每片按资源池抽签，可采空、会补货 |
| 危险度 | 0~4（安全区必为 0） | **1~4**（野外没有安全区） |
| 数据落在哪 | 数据库（`map_locations` / `map_connections`） | **文件**（`data/wilderness/*.json`），不进库 |
| 探索记录 | `player_map_exploration` 一行 | 分片文件里的 `exploredBy` |

::: tip 一句话理解"确定性生成"
野外不是"随机数堆出来再存下来"，而是 `(世界种子, 分片X, 分片Y)` 的**纯函数**：同一片区域无论生成多少次（包括分片文件被回收后重新走到），地形、地名、危险度、连通关系**逐字节一致**。所以"探索过的内容不会被刷新掉"不是靠备份，而是因为地形**从来没有变过**。
:::

## 这个系统由哪八块组成

野外不是「随机地图」一个功能，而是八块互相咬合的子系统。本页按下面这个顺序展开，
`/野外`、`/采集`、`/地图 go` 三条玩家入口最终都落在它们身上：

| # | 子系统 | 它负责什么 | 关键源码 | 本页章节 |
| --- | --- | --- | --- | --- |
| 1 | 世界种子与确定性生成 | 把「世界种子 + 分片坐标」变成一片地形；同一坐标永远同一片 | `WildernessTerrain` | 核心概念 |
| 2 | 分片与节点 id 编码 | 二维分片坐标 ↔ 一个 long 主键 ↔ 15 位节点 id（`ID_BASE` / `SLOT_STRIDE`） | `WildernessTerrain` | 节点 id 的编码方式 |
| 3 | 生态（biome）与危险度 | 高程/湿度两个噪声场 → 6 种生态；生态基础危险度 + 离原点距离 → 最终危险度 1~4 | `WildernessTerrain`、`WildernessMapConfig` | 生态（biome）与危险度 |
| 4 | 连通关系与进出野外 | 片内生成树 + 跨片边界边；5 个入口地点按方位环接到野外 | `WildernessTerrain`、`MapService` | 分片内的连通关系、怎么走进野外 |
| 5 | 资源抽取与采集 | 按地形专用池/危险度档位池抽签；`/采集` 扣减、失败回滚 | `MapService`、`WildernessChunk` | 资源 |
| 6 | 分片文件存储 | 一个分片一个 JSON，懒创建、原子写、LRU 缓存，**完全不进数据库** | `WildernessChunkStore` | 分片存储 |
| 7 | 补货与分片回收 | 每 5 分钟维护：到点原地补货 + 回收**未固化**分片；探索过的永久保留 | `Main`、`MapService` | 补货与维护 |
| 8 | 探索度、首达奖励与传送 | 只记首次抵达并发放奖励；付费直传按危险度计价、须到过 | `MapService`、`WildernessMapConfig` | 探索度与首达奖励、传送 |

::: tip 一句话记法
**地形是算出来的**（1~4），**状态是存下来的**（5~7），**奖励与位移是结算出来的**（8）。
分清这三类，就不会再误以为「野外会把地图数据写进数据库」或「探索过的野外地块会被刷新掉」。
:::

## 核心概念

### 世界种子 `worldSeed`

配置在 `config/game/wilderness_map.json` 的 `worldSeed`，出厂值 **`20261015`**。地形生成器 `WildernessTerrain` 只拿它当噪声的盐值：

```java
double elevation = valueNoise(seed, cx, cy, config.getElevationScale());
double moisture  = valueNoise(seed ^ SALT_MOISTURE, cx, cy, config.getMoistureScale());
```

**改它就等于换一个全新的无限世界**：地形带、地名、危险度分布、资源分布全变。更麻烦的是分片文件里记着 `seedHash`（= `splitmix64(worldSeed × 0x9E3779B97F4A7C15 + chunkSize)`），指纹对不上时**旧文件会被直接丢弃重建**，里面的探索记录与资源库存随之失效 —— 玩家会看到"去过的地方变了样"。**除非确实要重开世界，否则不要改。**

### 分片（chunk）与分片坐标

* 分片坐标是两个整数 `(chunkX, chunkY)`，**原点 (0,0) 就是已知世界所在的位置**，野外从它四周向外铺开（入口环是紧贴原点的一圈分片，距离都是 1）。
* 负坐标是合法的：分片 `(-1,-1)`、`(-3,7)` 都存在。
* 分片坐标被压成一个非负 long 当主键：

```java
chunkKey = (cx + COORD_BIAS) * COORD_SPAN + (cy + COORD_BIAS)   // COORD_BIAS = 1<<20, COORD_SPAN = 1<<21
```

* "距原点多远"用的是**切比雪夫距离**（`max(|cx|, |cy|)`），也就是按"第几圈"算，不是直线距离。

### 每片 4×4 个节点

* `chunkSize` 出厂 **`4`** → 每片 `4 × 4 = 16` 个节点，槽位 `slot` 为 `0~15`。
* 槽位与片内坐标的关系：`localX = slot % 4`、`localY = slot / 4`。
* `chunkSize` 的上限是 **8**（= 64 个节点），因为 id 编码里每片固定预留 64 个槽位，超过 8 会串到下一片；`normalize()` 会把非法值收敛：`< 1 → 4`、`> 8 → 8`。
* 片内 16 个节点**共享同一危险度、同一生态**（危险度是分片级的）。

### 确定性生成

| 由世界种子确定性生成的 | 由随机数决定、只存在分片文件里的 |
| --- | --- |
| 生态（biome）、地名、描述文案 | 每个节点抽到哪几种资源 |
| 危险度、境界门槛、灵气/地界加成 | 每种资源的具体数量 |
| 片内边、跨片边（连通关系） | 当前剩余量、补货时间 |
| 节点 id | 谁探索过（`exploredBy`） |

::: warning "资源分布"不是确定性的
地形是纯函数，但资源抽签用的是 `ThreadLocalRandom`（见 `MapService.rollChunkResources`），在**分片首次加载时抽一次**并写进分片文件。所以：分片文件还在 → 资源分布不变；文件被回收（无人探索）后重新走到 → 会**重新抽签**；改了 `worldSeed` / `chunkSize` → 指纹不符、文件作废 → 也会重新抽签。
:::

### 越远越险

最终危险度 = `max(地形基础危险度, 距原点分片距离 ÷ dangerPerChunks)`，再夹在 **1~4**：

```java
int distanceDanger = distance / Math.max(1, config.getDangerPerChunks());
return Math.max(MIN_DANGER, Math.min(MAX_DANGER, Math.max(biome.getDanger(), distanceDanger)));
```

`dangerPerChunks` 出厂 **`12`**，所以每往外走 **12 片**（约 48 格）距离档位 +1。这是"无限扩张"唯一的天然代价 —— 没有一堵硬墙，越远越难活。

### 节点 id 的编码方式

```java
id = ID_BASE + chunkKey(cx, cy) * SLOT_STRIDE + slot     // ID_BASE = 1_000_000, SLOT_STRIDE = 64
```

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `ID_BASE` | `1_000_000` | 野外 id 起点，远高于已知世界（1~15）与管理台手工新建的 id |
| `SLOT_STRIDE` | `64` | 每片固定预留 64 个槽位，**与 `chunkSize` 解耦** |
| `COORD_BIAS` / `COORD_SPAN` | `1<<20` / `1<<21` | 支持约 ±104 万片 |

由 id 可以反解出分片坐标与槽位：`chunkXOfNode` / `chunkYOfNode` / `slotOfNode`。同一分片的 16 个 id 落在 `[first, first + 64)` 这个**连续区间**内，因此"这片有没有玩家在"是一次范围查询（`WHERE current_location_id >= ? AND < ?`）。

::: tip 为什么 stride 固定是 64 而不是 `chunkSize²`
如果写成 `chunkSize²`，管理员把 `chunkSize` 从 4 改成 8 就会让**每个分片的 id 整体平移**，全部玩家位置与探索记录瞬间失效。用固定 64 只是每片多留了空槽位，代价可以忽略。
:::

### 分片内的连通关系

| 边 | 规则 |
| --- | --- |
| 片内边 | 按种子洗牌后跑 Kruskal 求**生成树**（保证片内任意两点连通、绝无孤岛），再把剩余网格边按 `extraEdgeChancePercent`（**25%**）概率加回去形成回路 |
| 跨片边 | 只生成"东边界"与"南边界"两个方向，因此每条边恰好被生成一次，不会重复；每条可能通道按 `borderEdgeChancePercent`（**45%**）成边 |
| 孤岛兜底 | 某一侧概率全落空时**强制保留一条**（东边界取 `y = size-1`，南边界取 `x = size-1`），否则会出现两片之间完全没有通路的"孤岛分片" |
| 边的耗时 | 野外所有边（片内、跨片、进出野外）统一取 `travelTimeSeconds` = **20 秒** |

### 世界硬边界

`maxChunksFromOrigin` 出厂 **`256`**：距原点超过 256 片（≈ 1024 格）就是"**混沌未开**"。

* `getChunkNodes` 对越界分片返回**空表**；
* 求邻居时越界邻居会被过滤掉；
* `nodeAt` 返回 `null`，因此越界 id 会被当成"该地点不存在"。

这是坐标溢出与库体积的兜底，**不是玩法边界** —— 玩法上的边界由"越远越险 + 境界门槛"自然形成。

## 指令

两条指令都属于玩法模块 **`map`**（模块被停用后指令视同不存在），分类「探索」，权限 `game.player.info`。

### `/野外`（别名 `wilderness`、`wild`）

```
/野外 — 查看所在分片的地形、危险度、资源与邻片
```

```java
super(new String[]{"野外", "wilderness", "wild"}, "查看当前野外分片与资源",
        "/野外 — 查看所在分片的地形、危险度、资源与邻片",
        "探索", "game.player.info");
setModule("map");
```

野外功能被关闭时（`enabled = false`）直接回：

```
野外地图当前已关闭（可在 config/game/wilderness_map.json 里把 enabled 改为 true）
```

#### 站在已知世界时

玩家当前位置不是野外（`getChunkOf` 返回 `null`）时，`/野外` 会把**每个出境口**和它对应的野外入口分片列出来：

```
===== 野外 =====
你正站在已知世界。从下列出境口可踏入荒域：

🚪 落霞山 → 幽泽·甲乙（幽冥沼泽）
   危险度：高危 · 需要≥真仙
   /地图 go <id>

🚪 昆仑墟 → 寒原·丙丁（寒霜雪原）
   危险度：高危 · 需要≥真仙
   /地图 go <id>
...
提示：野外不是安全区，越往外越险；用 /采集 采集资源。
```

（上面是**结构与真实输出一致**的示例：具体地名由世界种子决定，`<id>` 是实际打印出的节点 id。）

::: tip 野外 id 很大，这是正常的
`id = 1_000_000 + chunkKey × 64 + slot`，而 `chunkKey` 本身是一个约 2.2×10¹² 的数，所以野外 id 是**15 位整数**。例如入口环东侧分片 `(1,0)` 的 0 号节点（落霞山的入口节点）恒为 **`140737690681920`** —— 这个值与世界种子无关，只由坐标决定。
:::

每一行都给出：入口地点名 → 入口节点名（生态名）、该节点的危险度中文名与境界门槛、以及可以直接复制的 `/地图 go <id>`。

#### 站在野外时

```
===== 野外 =====
分片 (1,0) · 16 个节点
地形：幽冥沼泽
距中土 1 片 · 越远越险
📌 本片已留有你的足迹，永久保留、不会被回收
⏳ 资源补货：约 176 分钟后

🌿 幽泽·甲乙 ★你在这里
   [<id>] 危险度：高危（3/4） · 需要≥真仙
   灵气×1.24 地界加成×1.6
   🌿 可采集：幽冥花 ×2、蛇毒 ×1
   🚶 可去：幽泽·丙丁(幽冥沼泽)[<id>]、……

🔒 幽泽·戊己
   [<id>] 危险度：高危（3/4） · 需要≥真仙 [境界不足]
   灵气×1.24 地界加成×1.6
   🌿 资源已被采空

提示：用 /地图 go <id> 移动，/采集 采集资源。
```

（同样是**结构与真实输出一致**的示例：分片坐标、生态、节点名与资源都随世界种子和抽签结果变化；`<id>` 处会打印真实的 15 位节点 id。）

输出逐项说明：

| 行 | 来源 | 说明 |
| --- | --- | --- |
| `分片 (x,y) · N 个节点` | `getChunkNodes(cx, cy)` | `N` 恒为 `chunkSize²`（出厂 16） |
| `地形：<生态名>` | 分片 0 号节点的 `region` | 野外的 `region` 直接就是生态名 |
| `距中土 N 片 · 越远越险` | `distanceFromOrigin` | 只在 `N > 0` 时打印 |
| `📌 本片已留有你的足迹…` | `isChunkPinned(cx, cy)` | **分片级**标记：只要**任何**玩家在该片留下过首达记录就为真，出入口分片也恒为真 |
| `⏳ 资源补货：约 N 分钟后` | 分片文件的 `restockAt` | 只在 `restockAt > now` 时打印，向下取整到分钟 |
| `🌿 / 🔒 <节点名>` | `p.getRealm() >= node.getMinRealm()` | 境界不足时用 🔒 并追加 `[境界不足]` |
| `[id] 危险度：X（n/4） · 需要≥境界` | `dangerLevel` / `minRealm` | 危险度中文名取 `MapService.DANGER_NAMES` |
| `灵气×N 地界加成×M` | `cultivationBonus` / `explorationBonus` | 由危险度推导，见下文 |
| `🌿 可采集：…` / `🌿 资源已被采空` | `getWildernessResource(id)` | 采空时明确说明，避免玩家白跑 |
| `🚶 可去：…` | `getNeighbors` | **只在你当前所在的节点**上打印；野外邻居显示成 `名字(生态)[id]`，境界不足追加 🔒；无路时显示 `四下无路` |

### `/采集`（别名 `gather`、`collect`）

```
/采集 — 采集当前野外地点的资源（需身处野外）
```

`/采集` **不带任何参数**，只能采"当前站着的那个节点"。全部逻辑在 `MapService.gather(playerId)`：

| 校验顺序 | 条件 | 失败提示 |
| --- | --- | --- |
| 1 | `enabled = true` | `野外功能已关闭` |
| 2 | 角色存在 | `玩家不存在` |
| 3 | 当前位置是野外 id | `这里不是野外，没有可采集的资源（用 /野外 查看野外）` |
| 4 | 距上次采集 ≥ `gather.cooldownSeconds`（**60 秒**） | `你刚采集过，还需 N 秒才能再采` |
| 5 | 该节点还有剩余资源 | `此地的资源已被采空，等下次补货吧` |
| 6 | 扣减成功（并发下可能被别人抢先） | `手慢了，此地的资源刚被采空` |
| 7 | 物品能放进背包 | `采集失败：物品未能放入背包（背包可能已满）` |

成功时的回复：

```
⛏ 在「幽泽·甲乙」采集到 幽冥花 ×2（此地剩余 3）
```

返回结构里还有 `itemKey` / `itemName` / `quantity` / `remaining`。

#### 一次只采一种

```java
Map<String, Integer> available = chunk.remainingOf(slot);
String itemKey = available.keySet().iterator().next();
int take = Math.min(config.getGather().getMaxPerGather(), available.get(itemKey));
```

* 单次最多 `maxPerGather` = **3** 个（`take` 还会被该物品的剩余量截断）。
* 只采**剩余资源里第一个物品 key**（`LinkedHashMap` 插入顺序 = 抽签写入顺序），**玩家不能选择采哪一种**。想换一种，就把排在前面那种采空。

#### 扣减顺序与回滚

顺序是 **先扣库存并落盘 → 再发物品 → 发失败就加回去**：

```java
int taken = chunk.consume(slot, itemKey, take);   // 分片对象上的 synchronized
chunkStore.save(chunk);                            // 同步写盘
boolean granted = itemService.addItem(conn, playerId, itemKey, taken);
if (!granted) { chunk.refund(slot, itemKey, taken); chunkStore.save(chunk); ... }
```

不允许出现"库存扣了、东西没到"。并发安全靠 `WildernessChunk.consume` 的 `synchronized`：同一分片全进程只有一份实例，所以"读余量 → 扣减"在**分片粒度**上互斥，两个玩家同时点采集不会把同一份资源发两次。

### `/地图 go` / `/地图 传送` / `/地图 list` 在野外下的行为

| 指令 | 野外下的行为 |
| --- | --- |
| `/地图 go <id>` | 野外节点**唯一的导航方式**。野外节点名是随机生成的、不在 `map_locations` 里，`getLocationByName` 只查已知世界缓存，**按名字找野外节点必然失败** |
| `/地图 传送 <id>` | 目的地必须是**已经到过**的野外节点；费用含野外附加系数（见下文） |
| `/地图 list` | 顶部探索度只统计已知世界 15 地点；末尾会额外打印一段 `▍野外` 提示（仅在未按区域过滤且野外启用时） |
| `/地图`（无参数） | 站在野外时打印 `☠ 危险度：X（n/4） · 野外`、`灵气浓度`、`地界加成`，以及该节点的可采资源与"下次刷新"倒计时 |

::: warning 邻居列表里的 `/地图 go <地名>` 对野外邻居不适用
`MapCommand` 打印邻居时统一写 `/地图 go <名称>`，但野外邻居的名称**无法**被 `getLocationByName` 解析（它只遍历已知世界缓存）。对野外邻居请改用 **`/地图 go <id>`** —— `/野外` 会把每个节点的 id 打印出来。
:::

::: warning `/地图` 里的"随野外刷新消失"只是文案
`renderWildernessResource` 把分片的 `restockAt` 展示为 `⏳ 此地约 N 分钟后随野外刷新消失`。实际语义是**原地补货**：到点把资源补回上限，节点、地名、地形、探索记录一律不动，节点不会消失。以 `/野外` 的 `⏳ 资源补货：约 N 分钟后` 为准。
:::

## 生态（biome）与危险度

### 六种生态

`biomes` 是**按声明顺序取第一个命中** `(高程, 湿度)` 区间的条目，所以最后一条必须覆盖全域作为兜底。高程与湿度是两个做了平滑插值的噪声场（尺度 `elevationScale` = **24**、`moistureScale` = **17**），因此相邻分片取值连续、地形成片，不会"一格一景"。

| 顺序 | `key` | 名称 | 基础危险度 | 高程区间 | 湿度区间 | 专用资源池 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `marsh` | 幽冥沼泽 | 3 | `-1.0 ~ -0.25` | `0.1 ~ 1.0` | `marsh` |
| 2 | `snow` | 寒霜雪原 | 3 | `0.35 ~ 1.0` | `-1.0 ~ 1.0` | `snow` |
| 3 | `volcano` | 赤炎火山 | **4** | `0.1 ~ 0.35` | `-1.0 ~ -0.25` | `volcano` |
| 4 | `desert` | 流沙荒漠 | 2 | `-1.0 ~ 0.35` | `-1.0 ~ -0.25` | 无（走危险度档位池） |
| 5 | `forest` | 幽暗密林 | 2 | `-0.25 ~ 0.35` | `0.1 ~ 1.0` | 无（走危险度档位池） |
| 6 | `plain` | 灵田平原 | 1 | `-1.0 ~ 1.0` | `-1.0 ~ 1.0` | 无（走危险度档位池） |

每种生态还带 6 个名字前缀、6 个名字后缀与 3 条描述模板。地名格式是 `前缀 + 后缀 + "·" + 两字尾缀`，两字尾缀取自 65 个字的字表（`甲乙丙丁…东南西北…`，两两组合 4225 种），**由分片坐标派生**，用于避免不同分片的同名地形撞成同一个地名。

::: tip 危险度 4 的地形紧贴原点也可能出现
`赤炎火山` 的基础危险度就是 **4**，所以哪怕它在原点旁边，那片节点也是**极危**。反过来 `灵田平原` 基础危险度只有 1，要走到 **48 片（约 192 格）** 才会变成极危。
:::

### 危险度的计算

```
危险度 = clamp(max(地形基础危险度, 距原点分片距离 ÷ dangerPerChunks), 1, 4)
```

* 野外危险度**恒为 1~4**，永远不是 0 —— 野外没有安全区（`buildWildernessLocation` 里 `setSafeZone(false)`）。
* 危险度是**分片级**的：同一片 16 个节点危险度完全相同。
* 中文名（`MapService.DANGER_NAMES`）：`0 安全`、`1 低危`、`2 中危`、`3 高危`、`4 极危`。

### 危险度档位 × 距离对照

`dangerPerChunks = 12`，距离按切比雪夫（`max(|cx|, |cy|)`）算，1 片 ≈ 4 格：

| 距原点分片距离 | 平原（1） | 荒漠/密林（2） | 沼泽/雪原（3） | 火山（4） |
| --- | --- | --- | --- | --- |
| `0 ~ 11` 片（0 ~ 44 格） | 1 低危 | 2 中危 | 3 高危 | 4 极危 |
| `12 ~ 23` 片（48 ~ 95 格） | 1 低危 | 2 中危 | 3 高危 | 4 极危 |
| `24 ~ 35` 片（96 ~ 143 格） | 2 中危 | 2 中危 | 3 高危 | 4 极危 |
| `36 ~ 47` 片（144 ~ 191 格） | 3 高危 | 3 高危 | 3 高危 | 4 极危 |
| `≥ 48` 片（≥ 192 格） | 4 极危 | 4 极危 | 4 极危 | 4 极危 |

（"格"是按 `1 片 = 4 格` 换算的粗略尺度；危险度实际只看分片级距离，片内 16 个节点没有各自的坐标距离。）

### 危险度 → 境界门槛

节点的 `minRealm = 危险度 × minRealmPerDanger`，`minRealmPerDanger` 出厂 **`3`**：

| 危险度 | `min_realm` | 该 id 的境界名 |
| --- | --- | --- |
| 1 低危 | 3 | 金丹期 |
| 2 中危 | 6 | 合体期 |
| 3 高危 | 9 | 真仙 |
| 4 极危 | **12** | **不存在**（境界 id 只到 10 金仙） |

::: warning 危险度 4 的野外节点在当前出厂配置下无法进入
`realm_config.json` 里大境界 id 只有 `0 ~ 10`（0 凡人 … 9 真仙、10 金仙），玩家最高境界是 10。而危险度 4 的节点 `min_realm = 4 × 3 = 12`，`player.getRealm() >= 12` **永远不成立**，因此：
* `/地图 go` 与 `/地图 传送` 都会以「境界不足」拒绝；
* `getRealmName(12)` 在配置里找不到条目，会回落成 **「凡人」**，所以指令里会显示成「需要≥凡人」这种看起来自相矛盾的文案。

想开放极危地带，可把 `minRealmPerDanger` 调小（例如 `2` → 危险度 4 只需境界 8 渡劫期），或调整 `biomes` 里各地形的 `danger`。**这是配置层面的取舍，不是本页能替服务器决定的。**
:::

### 危险度 → 加成

两个加成都由危险度线性推导（`WildernessTerrain.buildNode`）：

```java
cultivationBonus = cultivationBonusBase + cultivationBonusPerDanger * danger;   // 1.0 + 0.08 × 危险度
explorationBonus = explorationBonusBase + explorationBonusPerDanger * danger;   // 1.15 + 0.15 × 危险度
```

| 危险度 | 灵气加成（闭关修炼） | 地界加成（游历/秘境收益） |
| --- | --- | --- |
| 1 低危 | ×1.08 | ×1.30 |
| 2 中危 | ×1.16 | ×1.45 |
| 3 高危 | ×1.24 | ×1.60 |
| 4 极危 | ×1.32 | ×1.75 |

**灵气加成**只影响闭关修炼（`getCultivationBonus`，见[闭关修炼](/player/cultivation)）；**地界加成**是游历/秘境收益的第三层倍率（在季节、天象之后追加，见[游历探索](/player/exploration)）。两者都是**不同的倍率**，别混用。

## 资源

### 资源池的查找顺序

```java
List<ResourceSeed> pool = config.getResourcePool(node.biomeKey(), node.danger());
```

1. 先按**地形 key** 找同名资源池（`marsh` / `snow` / `volcano` 三个专用池）；
2. 找不到就用**节点最终危险度档位**的池（`"1"` ~ `"4"`）；
3. 档位池缺失时，向下回退到**不高于它的最近档位**（`getResourcePool(int)` 的循环）；
4. 都没有 → 空池 → 该节点**没有任何资源**（`rollChunkResources` 直接 `continue`）。

于是：**固定危险度的地形**（幽冥沼泽/寒霜雪原/赤炎火山）用专用池体现物产特色；**危险度会随距离变化的地形**（流沙荒漠/幽暗密林/灵田平原）走档位池，让"走得越远物产越好"仍然成立。

::: warning `biomes` 里的 `resourcePool` 字段目前没有任何代码读取
`BiomeSeed` 有 `resourcePool` 字段与 getter，但全项目**只有 `getResourcePool()` 这个 getter 定义、没有调用点**（`MapService` 传的是 `node.biomeKey()`）。当前真正生效的是"地形 `key` 与资源池键同名"这条巧合：`marsh` / `snow` / `volcano` 恰好既是地形 key 又是池键。给某个地形改名、或写一个与地形 key 不同名的 `resourcePool` 值，都不会改变它实际用的池。
:::

### 地形专用资源池

**`marsh`（幽冥沼泽）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `nether_flower` | 幽冥花 | 20 | 1~2 |
| `snake_venom` | 蛇毒 | 18 | 1~2 |
| `ghost_fire_essence` | 鬼火精华 | 16 | 1~2 |
| `blood_lingzhi` | 血灵芝 | 14 | 1~2 |
| `demon_core` | 魔核 | 10 | 1~2 |
| `spirit_spring_water` | 灵泉水 | 10 | 1~2 |
| `nether_flower_seed` | 幽冥花种子 | 8 | 1 |
| `thousand_year_ginseng` | 千年人参 | 6 | 1 |
| `blood_lingzhi_seed` | 血灵芝种子 | 5 | 1 |

**`snow`（寒霜雪原）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `ice_crystal` | 冰晶 | 24 | 1~2 |
| `dark_ice_grass` | 暗冰草 | 22 | 1~3 |
| `silver_ore` | 银矿石 | 18 | 1~3 |
| `moon_essence` | 月华 | 12 | 1~2 |
| `spirit_spring_water` | 灵泉水 | 10 | 1~2 |
| `dark_ice_grass_seed` | 暗冰草种子 | 8 | 1~2 |
| `tianshan_snow_lotus` | 天山雪莲 | 8 | 1 |
| `heavenly_jade` | 天玉 | 6 | 1 |

**`volcano`（赤炎火山）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `gold_ore` | 金矿石 | 20 | 1~3 |
| `fire_vine` | 火焰藤 | 20 | 1~3 |
| `heaven_fire_stone` | 天火石 | 14 | 1~2 |
| `mythril_ore` | 秘银矿石 | 12 | 1~2 |
| `fire_vine_seed` | 火焰藤种子 | 8 | 1~2 |
| `sun_essence` | 日精 | 6 | 1 |
| `five_colored_divine_stone` | 五色神石 | 5 | 1 |
| `phoenix_feather` | 凤凰羽毛 | 4 | 1 |

### 危险度档位资源池

**档位 `"1"`（低危）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `spirit_grass` | 灵草 | 30 | 2~6 |
| `spirit_wood` | 灵木 | 25 | 1~4 |
| `iron_ore` | 铁矿石 | 25 | 1~4 |
| `wan_ling_grass` | 万灵草 | 15 | 1~3 |
| `low_grade_fertilizer` | 低阶肥料 | 12 | 1~3 |
| `peach` | 蟠桃 | 10 | 1~3 |
| `spirit_grass_seed` | 灵草种子 | 8 | 1~2 |

**档位 `"2"`（中危）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `beast_core` | 妖兽内丹 | 25 | 1~3 |
| `silver_ore` | 银矿石 | 22 | 1~3 |
| `dark_ice_grass` | 暗冰草 | 18 | 1~3 |
| `fire_vine` | 火焰藤 | 18 | 1~3 |
| `tiger_fang` | 虎牙 | 14 | 1~2 |
| `snake_venom` | 蛇毒 | 14 | 1~2 |
| `mid_grade_fertilizer` | 中阶肥料 | 10 | 1~2 |
| `spirit_spring_water` | 灵泉水 | 10 | 1~2 |
| `dark_ice_grass_seed` | 暗冰草种子 | 6 | 1~2 |
| `fire_vine_seed` | 火焰藤种子 | 6 | 1~2 |

**档位 `"3"`（高危）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `gold_ore` | 金矿石 | 22 | 1~3 |
| `ice_crystal` | 冰晶 | 18 | 1~2 |
| `blood_lingzhi` | 血灵芝 | 16 | 1~2 |
| `nether_flower` | 幽冥花 | 16 | 1~2 |
| `ghost_fire_essence` | 鬼火精华 | 12 | 1~2 |
| `heaven_fire_stone` | 天火石 | 12 | 1~2 |
| `demon_core` | 魔核 | 10 | 1~2 |
| `thousand_year_ginseng` | 千年人参 | 8 | 1 |
| `scripture_page` | 功法残页 | 8 | 1 |
| `blood_lingzhi_seed` | 血灵芝种子 | 5 | 1 |
| `nether_flower_seed` | 幽冥花种子 | 5 | 1 |
| `thousand_year_ginseng_seed` | 千年人参种子 | 4 | 1 |

**档位 `"4"`（极危）**

| 物品 key | 名称 | 权重 | 数量 |
| --- | --- | --- | --- |
| `mythril_ore` | 秘银矿石 | 18 | 1~2 |
| `moon_essence` | 月华 | 16 | 1~2 |
| `star_grass` | 星草 | 14 | 1~2 |
| `star_sand` | 星沙 | 14 | 1~2 |
| `heavenly_jade` | 天玉 | 12 | 1~2 |
| `deep_sea_coral` | 深海珊瑚 | 12 | 1~2 |
| `dragon_blood_crystal` | 龙血晶 | 10 | 1 |
| `dragon_bone` | 龙骨 | 10 | 1 |
| `immortal_date` | 仙枣 | 8 | 1 |
| `ten_thousand_year_lingzhi` | 万年灵芝 | 8 | 1 |
| `tianshan_snow_lotus` | 天山雪莲 | 8 | 1 |
| `five_colored_divine_stone` | 五色神石 | 5 | 1 |
| `nine_turn_grass` | 九转还魂草 | 5 | 1 |
| `qilin_horn` | 麒麟角 | 4 | 1 |
| `sun_essence` | 日精 | 4 | 1 |
| `phoenix_feather` | 凤凰羽毛 | 4 | 1 |

物品显示名取自 `zh_cn.json` 的 `item.<key>.name`（更多物品信息见[物品图鉴](/reference/items)）。池里的物品 key 都是真实存在的物品 —— `MapWildernessTest` 会遍历入口分片里每个节点的**实际剩余资源**，逐个断言 `ItemRegistry.resolve(key) != null`（配置里写错 key 是最容易犯又最难发现的错误：采集会"成功"但发出一个不存在的物品）。

### 每个节点抽多少资源

```java
int kinds = pool.size() > 1 && ThreadLocalRandom.current().nextBoolean() ? 2 : 1;
```

* **多数节点 1 种资源，少数 2 种** —— 让"富矿"成为惊喜而不是常态。
* 每种资源各自随机数量（`randomBetween(minQuantity, maxQuantity)`，闭区间）。
* 抽签结果直接写进分片文件：`slot → itemKey → {total, remaining}`，其中 `total` 是**本次补货周期的上限**，`remaining` 是当前剩余。没抽中的槽位不会出现在文件里。

### 剩余量与采空

| 状态 | 表现 |
| --- | --- |
| 有剩余 | `/野外`、`/地图` 显示 `🌿 可采集：<名称> ×N、…` |
| 剩余归零 | 显示 `🌿 资源已被采空`；`/采集` 回 `此地的资源已被采空，等下次补货吧` |
| 补货后 | `remaining` 补回 `total`，重新可采 |

资源是**全服共享**的：同一节点被别人采空，你到了就是采空状态。

## 补货与维护

### 定时维护

`Main` 启动的 `cleanup-scheduler` 每 **5 分钟**跑一次：

```java
cleanupScheduler.scheduleAtFixedRate(() -> {
    RateLimiter.cleanupExpired(3600);
    TokenBlacklist.cleanupExpired(24L * 3600 * 1000);
    ServiceRegistry.getMapService().maintainWildernessIfNeeded();
}, 5, 5, TimeUnit.MINUTES);
```

`maintainWildernessIfNeeded()` 只做两件事（异常一律吞掉，维护失败不影响主流程）：**给到点的分片原地补货** + **回收长期无人涉足的未固化分片**。两件事都**不动地形**。

每次维护最多扫描 `MAX_MAINTENANCE_SCAN = 5000` 个分片文件，避免一次维护把进程卡在读几万个文件上；扫不到的分片只是这次没轮到，下次继续。

### 原地补货

`restockIntervalMinutes` 出厂 **`180`**（3 小时）—— 注意是"**补货**"不是"**换地形**"：

```java
public synchronized boolean restock(long now, long intervalSeconds) {
    for (每个资源) if (resource.remaining < resource.total) { resource.remaining = resource.total; changed = true; }
    restockAt = now + intervalSeconds;
    return changed;
}
```

* 分片文件的 `restockAt` 到点（`restockAt <= now`）才补货；
* 补货只把 `remaining` 补回 `total`：分片、节点、地名、探索记录**全都不动**；
* 即使本次没有任何消耗，也会把 `restockAt` 推后一个周期，否则每次维护都会白扫一遍；
* 分片首次创建时 `restockAt = now + restockIntervalMinutes × 60`。

### 分片回收

`evictAfterMinutes` 出厂 **`1440`**（24 小时）。回收扫描对每个磁盘上的分片依次判断：

| 顺序 | 条件 | 处理 |
| --- | --- | --- |
| 1 | 分片超出 `maxChunksFromOrigin` | **直接删除**（硬上限调小之后，外面的分片成为历史） |
| 2 | `pinned` 或 `gateway` | **跳过，永不回收** |
| 3 | `now - lastActiveAt < evictAfterMinutes × 60` | 跳过（还没到空闲阈值） |
| 4 | 分片 id 区间内有玩家（`current_location_id` 范围查询） | 跳过（人脚下的地不能删） |
| 5 | 以上都不满足 | 删除文件 |

::: tip 为什么"玩家永远不会发现自己探索过的地方消失了"
只要分片里有一条探索记录，`pinned` 就置位，而且**只在这里置位、没有任何地方会清除它，也没有管理员后门**（管理台的野外页是**只读**的，不提供删除入口）。因此回收只可能落在"玩家只是路过、没留下任何首达记录"的分片上。
:::

删文件后还会顺手清掉变空的分桶目录，避免留下成千上万个空目录。查询玩家是否在分片内失败时，代码**当作有玩家在**（宁可少回收一片，也不能把人脚下的地删了）。

### 玩家侧（REST）

`/野外` 与 `/采集` 按「指令即路由」同时暴露 HTTP 路由，与 OneBot 侧共用同一份 `MapService` 实现和同一权限码，
因此冷却、境界门槛、采空与补货行为完全一致：

| 方法 | 接口 | 权限 | 等价指令 | 作用 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/game/map/wilderness` | `game.player.info` | `/野外` | 只读视图：已知世界返回 `gateways`（出境口 → 野外入口分片）；野外返回 `chunk`、`nodes`（危险度/境界门槛/灵气与地界加成/剩余 `resources` 与译名 `resourceNames`）与当前节点的 `exits` |
| `POST` | `/api/game/map/gather` | `game.player.info` | `/采集` | 采集当前节点资源；成功时返回 `data.itemKey` / `itemName` / `quantity` / `remaining` |

### 管理台

| 接口 | 权限 | 作用 |
| --- | --- | --- |
| `GET /api/admin/map/wilderness` | `admin.database.access` | 野外总览：分片数、已固化数、已探索节点数、资源条目数、`data/wilderness` 目录、缓存/读写计数；带 `cx`/`cy` 参数时展示该分片详情，不带则以原点为中心展示一圈 |
| `POST /api/admin/map/wilderness/restock` | `admin.database.access` | 立即给全部已生成分片补货（`restockWilderness()`），返回 `已给 N 个野外分片原地补货（地形与探索记录均未变动）` |

`getWildernessStats()` 返回的键：`dir`、`cachedChunks`、`fileReads`、`fileWrites`、`enabled`、`chunkSize`、`maxChunksFromOrigin`、`worldSeed`、`chunkCount`、`pinnedChunks`、`exploredNodes`、`resourceEntries`、`scanLimit`。

## 分片存储

野外**不进数据库**：地形是 `(worldSeed, 分片坐标)` 的纯函数，本来就不需要存；真正要落盘的只有"谁探索过、资源还剩多少"这点可变状态。

### 目录布局

一个分片一个 JSON 文件，路径由分片坐标决定：

```
data/wilderness/                 ← 根目录，可用 application.yml 的 wilderness.dir 覆盖
  0/0/0_0.json                   ← 分片 (0,0)
  0/1/0_1.json                   ← 分片 (0,1)
  -1/-1/-1_-1.json               ← 分片 (-1,-1)（负号在文件名里没问题，Windows 也接受）
  1/0/1_0.json                   ← 出口分片（落霞山 → 东）
```

```java
root.resolve(floorDiv(cx, 64)).resolve(floorDiv(cy, 64)).resolve(cx + "_" + cy + ".json")
```

* 中间两级是"每 **64×64** 片一个目录"的分桶：直接把几十万个文件塞进同一个目录，连 `ls` 都会卡住。
* 根目录来自 `AppConfig.get("wilderness.dir", "data/wilderness")` —— jar 内 `application.yml` 模板里**没有**这个键，需要自定义时自己在 `config/application.yml` 里加。
* 列目录时最多下钻 3 层，按 `cx_cy.json` 解析坐标；解析不出来的文件（手工塞进来的杂物）会被忽略。

### 分片文件字段

```json
{
  "chunkX": 1, "chunkY": 0,
  "seedHash": -1234567890, "chunkSize": 4,
  "gateway": true, "pinned": true,
  "generatedAt": 1760000000, "lastActiveAt": 1760000300, "restockAt": 1760010800,
  "resourcesRolled": true,
  "resources": { "0": { "nether_flower": { "total": 2, "remaining": 0 } } },
  "exploredBy": { "0": [10001, 10007] }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chunkX` / `chunkY` | int | 分片坐标；读回来时**以文件名与调用参数为准**，手工改过文件名也不至于错位 |
| `seedHash` | long | 生成参数指纹（含 `worldSeed` 与 `chunkSize`），对不上就丢弃整个文件 |
| `chunkSize` | int | 生成时的分片边长，便于排查"改过 `chunkSize` 之后文件对不上" |
| `gateway` | bool | 是否出口分片（**永不回收**） |
| `pinned` | bool | 是否已固化（有任意探索记录即置位，永不回退） |
| `generatedAt` / `lastActiveAt` | long | 首次生成 / 最近活动时间（秒）；回收判定用 `lastActiveAt` |
| `restockAt` | long | 下次补货时间（秒），同时被当作节点的 `expires_at` 展示 |
| `resourcesRolled` | bool | 资源是否已抽过（用它而不是"`resources` 为空"判断：资源池全空时也该只抽一次） |
| `resources` | object | 槽位（`"0"`~`"15"`）→ 物品 key → `{total, remaining}` |
| `exploredBy` | object | 槽位 → 探索过该节点的玩家 id 数组；非空即意味着 `pinned` |

字段用**字符串**当槽位键（而不是 int）：JSON 对象键本来就是字符串，这样文件内容与内存结构一一对应，管理员打开文件看到的就是程序读到的。

### 原子写与内存缓存

* 写入走 `.tmp` + `ATOMIC_MOVE`（与 `PlayerDataService` 同一套约定），进程在写一半时被杀不会留下半个 JSON。
* 刻意**同步写盘**而不攒批：分片文件只有 1~3 KB，触发写入的都是"抵达新地点""采集"这类低频动作；换来的是"玩家做了什么，磁盘上立刻就是什么"。
* 内存里维护一份 **LRU 缓存（上限 512 片）**，磁盘上仍有文件，淘汰不影响正确性。
* 生成结果另有一份缓存（上限 256 片），签名 = `worldSeed × 31 + chunkSize`，任一项变化即整体作废。

### 懒创建：没去过就不占存储

分片文件是**懒创建**的：第一次走到这里才产生文件，**从未被访问过的分片在磁盘上完全不存在** —— 这就是"无限世界不占存储"的落点。以下动作会创建分片文件：

| 动作 | 说明 |
| --- | --- |
| `/野外`（站在该片） | `getChunk` 取分片状态，并逐节点取资源 |
| `/地图` / `/地图 go`（以该片节点为目标） | `getLocation` → `resolveWilderness` → 读分片取 `restockAt` |
| 抵达该片任意节点 | `recordFirstVisit` 写入 `exploredBy` 并置 `pinned` |
| `/采集` | 扣减库存并落盘 |
| 定时维护 | 补货 / 回收扫描时加载 |

因此"只是被解析过、没人真正留下足迹"的分片，也是会**被回收**的。

### 存档作废规则

`seedHash` 由 `worldSeed` 与 `chunkSize` 共同决定：

```java
public static long seedHash(long seed, int chunkSize) { return splitmix64(seed * 0x9E3779B97F4A7C15L + chunkSize); }
```

文件里的 `seedHash` 与当前生成参数不一致时，**丢弃文件并按新地形重建**（记一条 warn）。这是刻意的：改过世界种子之后，同一个分片坐标已经指向另一片地形，旧文件里的探索记录与资源会挂到完全不同的节点上，那比丢失更糟。

::: warning 改 `chunkSize` 也会作废已落盘的野外存档
`wilderness_map.json` 里 `_comment_chunkSize` 写的是"不会移动任何已有节点的 id（stride 固定为 64），所以探索记录依然有效"。**这句话只对 id 稳定性成立**：`seedHash` 里包含 `chunkSize`，改它会让所有分片文件指纹不符而被丢弃重建，其中的野外探索记录（`exploredBy`）与资源库存**随之失效**。改 `worldSeed` 同理，且影响更大（地形本身全变）。
:::

## 怎么走进野外

### 入口地点

`entryLocationIds` 出厂 **`[5, 7, 8, 12, 15]`**，对应已知世界里的边境/险地：

| 序号 | 地点 id | 地点名 | 区域 | 该地危险度 |
| --- | --- | --- | --- | --- |
| 0 | 5 | 落霞山 | 中原 | 2 中危 |
| 1 | 7 | 昆仑墟 | 西域 | 3 高危 |
| 2 | 8 | 九幽渊 | 南荒 | 4 极危 |
| 3 | 12 | 万妖谷 | 南荒 | 3 高危 |
| 4 | 15 | 白骨岭 | 西域 | 3 高危 |

只有这 5 个地点有通往野外的路。列表为空或非法时 `normalize()` 会退回这套默认值。

### 入口方位环

第 i 个入口落在入口环的第 i 个方位分片上（顺时针，`+y` 方向为南）：

| 序号 | 入口地点 | 入口分片 `(cx, cy)` | 方位 |
| --- | --- | --- | --- |
| 0 | 落霞山 | `(1, 0)` | 东 |
| 1 | 昆仑墟 | `(1, 1)` | 东南 |
| 2 | 九幽渊 | `(0, 1)` | 南 |
| 3 | 万妖谷 | `(-1, 1)` | 西南 |
| 4 | 白骨岭 | `(-1, 0)` | 西 |

（环上还有 `西北 (-1,-1)`、`北 (0,-1)`、`东北 (1,-1)` 三个方位，当前 5 个入口用不到；改 `entryLocationIds` 的顺序等于改入口方位。）

* 入口节点是入口分片的 **0 号槽位**（`gatewayNodeId(index) = nodeId(chunk, 0)`）。
* 这条"已知世界 ↔ 野外"的边**不落库**（两端性质不同，一端在库、一端是算出来的），而是由 `attachGatewayLinks()` 在已知世界一侧挂上、由 `resolveWilderness()` 在野外一侧挂上，两侧各自现算。
* 入口分片永远保留（`gateway = true` → 跳过回收）；回收了玩家就进不来野外了。
* 入口分片若超出 `maxChunksFromOrigin`，启动时会记 warn 并**忽略该入口**（否则玩家会在边境看到一个永远走不到的路口）。

### 进入与离开

| 动作 | 方式 |
| --- | --- |
| 进入野外 | 站在某个入口地点（如落霞山），`/地图 go <入口节点 id>`（`/野外` 会打印这个 id） |
| 野外内部移动 | `/地图 go <相邻节点 id>`，片内/跨片边都算相邻 |
| 付费直传 | `/地图 传送 <id>`（必须已经到过，见下文） |
| 回到已知世界 | 从入口节点 `/地图 go <入口地点 id>`（如 `/地图 go 5`） |

野外边的路程统一是 `travelTimeSeconds` = **20 秒**，赶路冷却取下限与路程的较大者（`max(5, 20) = 20 秒`）—— 也就是说在野外每走一步要等 **20 秒**。

## 探索度与首达奖励

### 只记首次

首次抵达某地点会写一行记录，**重复抵达不再记录、不再发奖**：

| 地点类型 | 记录位置 | 判重方式 |
| --- | --- | --- |
| 已知世界 | `player_map_exploration` 表 | `INSERT OR IGNORE` + `UNIQUE (player_id, location_id)` 唯一约束（不是"先查后插"，否则并发首达会各发一份奖励） |
| 野外 | 该分片文件的 `exploredBy` | `markExplored(slot, playerId)` 返回是否**新增**；新增时同步 `chunkStore.save`，并置 `pinned` |

`player_map_exploration` 表结构：

```sql
CREATE TABLE IF NOT EXISTS player_map_exploration (
  id <pk>, player_id BIGINT NOT NULL, location_id BIGINT NOT NULL,
  first_visited_at BIGINT NOT NULL,
  UNIQUE (player_id, location_id)
)
```

`MapWildernessTest` 专门断言：在野外活动前后，`map_locations`、`map_connections`、`player_map_exploration` 的**行数一动不动**，且 `player_map_exploration` 里**不出现任何野外 id**。

### 首达奖励数值

```
灵石 = round((spiritStonesBase + spiritStonesPerDanger × 危险度) × (野外 ? spiritStonesWildernessMultiplier : 1.0))
灵力 = round((experienceBase     + experiencePerDanger     × 危险度) × (野外 ? experienceWildernessMultiplier     : 1.0))
```

| 危险度 | 已知世界：灵石 | 已知世界：灵力 | 野外：灵石 | 野外：灵力 |
| --- | --- | --- | --- | --- |
| 0 安全 | 20 | 50 | —（野外没有危险度 0） | — |
| 1 低危 | 50 | 130 | 100 | 260 |
| 2 中危 | 80 | 210 | 160 | 420 |
| 3 高危 | 110 | 290 | 220 | 580 |
| 4 极危 | 140 | 370 | 280 | 740 |

奖励文案直接附在移动结果后面：

```
🎉 首次抵达【幽泽·甲乙】，获得 220 灵石、580 灵力
```

### 全图完成奖励

走遍已知世界**全部 15 个地点**时，额外发放 `completionBonusSpiritStones` = **2000 灵石**（野外节点不参与这个判定）：

```
🏆 你已走遍已知世界的全部 15 个地点，额外获得 2000 灵石！
```

### 探索度只统计已知世界

`/地图 list` 顶部：

```
🧭 探索度：8/15（53%）
```

分母是 `getKnownWorldLocations().size()`（`is_wilderness = 0` 的地点），野外节点是流动的、无限的，把它算进完成度会让进度条**永远无法走满**，所以刻意排除。

## 危险度与 PK 掠夺

危险度第一次真正影响 PVP 收益（见 [PVP 系统](/player/pvp)）：

```java
private static final int PK_LOOT_MIN_DANGER = 3;          // 危险度 ≥3 才算"险地"
private static final double PK_LOOT_RATIO_PER_DANGER = 0.05;  // 每 1 级夺走败者 5% 灵石

int danger = mapService.getDangerLevel(mapService.getPlayerLocationId(winner.getId()));
if (danger < PK_LOOT_MIN_DANGER) return 0;
long loot = Math.max(1, Math.round(loserStones * PK_LOOT_RATIO_PER_DANGER * danger));
loot = Math.min(loot, loserStones);
```

| 危险度 | 掠夺比例 | 说明 |
| --- | --- | --- |
| 1 低危 / 2 中危 | **0** | 不触发掠夺 |
| 3 高危 | 败者灵石的 **15%** | 野外"高危"地带即满足 |
| 4 极危 | 败者灵石的 **20%** | |

* 判定用的是**胜者所在地点**的危险度；
* 扣款以 `removeSpiritStones` 的返回值为准（扣不动就一分不夺），掠夺量以败者当前灵石为上限、最低 1；
* 战报里会出现 `☠ 高危之地，X 自 Y 身上夺得 N 灵石`。

::: warning 安全区与危险度是分离的两套语义
`checkSafeZone` **只看 `is_safe_zone`**，与危险度无关：任一方身处安全区即拒绝切磋。野外节点 `setSafeZone(false)`，所以野外**永远不是安全区** —— 走到哪都可能被 PK。反过来，危险度只决定"赢了能抢多少"。
:::

## 传送：付费直传 vs 传送符

游戏里有**两套互不相同**的传送（详见[世界地图](/player/map)）：

| | 传送符（物品 `mtxgdn:teleport_talisman`） | `/地图 传送 <id>`（别名 `tp`） |
| --- | --- | --- |
| 目的地 | **固定太虚城**（id 4） | 任意**已经到过**的地点，含野外节点 |
| 是否需要到过 | 不需要 | **必须已经到过**（传送点需亲自抵达后解锁） |
| 费用 | 消耗 1 张传送符 | 灵石，按两地危险度之和计价 |
| 境界要求 | 保留 | 保留 |
| 实现入口 | `MapService.teleportToLocation` | `MapService.teleportByUnlock` |

`teleportByUnlock` 的校验顺序：`teleport.enabled` → 地点存在 → 玩家存在 → 境界足够 → **`isExplored(playerId, target)`** → 不是当前所在地 → 灵石足够 → 扣费 → CAS 写回位置（写回失败会把灵石退回去，不能既收钱又不办事）。

### 费用公式

```java
double cost = cfg.getBaseCost() + cfg.getCostPerDanger() * (from.getDangerLevel() + to.getDangerLevel());
if (to.isWilderness()) cost *= cfg.getWildernessSurcharge();
return Math.max(cfg.getMinCost(), Math.round(cost));
```

| 出发地（危险度） | 目的地（危险度） | 计算 | 费用 |
| --- | --- | --- | --- |
| 青云村（0） | 平原野外节点（1） | `(50 + 60×1) × 1.5` | **165** |
| 青云村（0） | 火山野外节点（4） | `(50 + 60×4) × 1.5` | **435** |
| 九幽渊（4） | 火山野外节点（4） | `(50 + 60×8) × 1.5` | **795** |
| 太虚城（0） | 九幽渊（4，已知世界） | `50 + 60×4` | **290** |

以"目的地危险度 + 出发地危险度"计价，是为了让"从安全区直传极危之地"比"从邻境直传"更贵；**野外目的地另乘 `wildernessSurcharge` = 1.5**。费用下限 `minCost` = 10 灵石。

## 与其他玩法的关系

### 游历（`/游历`）

游历**不要求**身处特定地点，但结算时会读所在地点的 `exploration_bonus` 作为第三层倍率（季节、天象之后追加），日志行为：

```
🏔 【幽泽·甲乙】地界加成 ×1.6: 灵石+X 经验+Y
```

因此**站在危险度更高的野外节点上刷游历，收益明显更高**（危险度 4 → ×1.75，对比青云村的 ×1.00）。详见[游历探索](/player/exploration)。

::: tip 野外节点没有地界事件偏置
事件权重偏置来自 `map_location_event_bias` 表，出厂 23 条全部指向已知世界地点；野外节点的 id 不在表里，`getEventBias` 返回**空表**，即野外抽事件用**全局权重**，没有任何地形专属的偏向。`biomes` 里也没有配置偏置的字段。
:::

### 闭关修炼

野外节点的 `cultivation_bonus` 由危险度推导（×1.08 ~ ×1.32），会在闭关时乘进修炼收益（`PlayerService.cultivationMultiplier`），见[闭关修炼](/player/cultivation)。

### 灵田种植

危险度档位池里包含大量**种子**与**肥料**（`spirit_grass_seed`、`dark_ice_grass_seed`、`fire_vine_seed`、`thousand_year_ginseng_seed`、`nether_flower_seed`、`blood_lingzhi_seed`、`low_grade_fertilizer`、`mid_grade_fertilizer`），野外因此是种植玩法的种子来源之一，见[灵田种植](/player/farm)。

## 配置：`wilderness_map.json`

文件位置：`config/game/wilderness_map.json`（jar 目录下），出厂模板在 jar 内的 `game/wilderness_map.json`。

### 加载顺序与生效方式

1. 先读 `<jar 目录>/config/game/wilderness_map.json`（用户可改）；
2. 读不到再退回 **jar 内同名资源**；
3. 两者都读不到则用**类内默认值**并告警（删掉配置文件不会让服务起不来，只会失去自定义）。

::: warning 改完必须重启
`WildernessMapConfig.reload()`（丢弃缓存、下次访问重读文件）在服务端代码里**没有调用点**；管理台的「补货」按钮调的是 `restockWilderness()`，只补资源、**不重读配置**。所以改完 `wilderness_map.json` 请重启服务端。
:::

### 顶层键一览

| 配置键 | 类型 | 出厂值 | 作用 |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | 野外总开关；关掉后 `/野外`、`/采集`、野外节点解析全部失效 |
| `worldSeed` | long | `20261015` | 世界种子；改它等于换一个全新的无限世界（**慎改**） |
| `chunkSize` | int | `4` | 每片 `chunkSize × chunkSize` 个节点，上限 8 |
| `maxChunksFromOrigin` | int | `256` | 距原点最大分片距离（切比雪夫）；×4 格 ≈ 1024 格，超出即"混沌未开" |
| `evictAfterMinutes` | int | `1440` | **未固化**分片空闲多久被回收（分钟，24 小时）；已固化分片永不回收 |
| `restockIntervalMinutes` | int | `180` | 资源**原地补货**周期（分钟，3 小时） |
| `entryLocationIds` | long[] | `[5, 7, 8, 12, 15]` | 可出境的已知世界地点 id，第 i 个落在入口环第 i 个方位 |
| `travelTimeSeconds` | int | `20` | 野外连接的路程秒数（片内边、跨片边、进出野外的边都用它） |
| `cultivationBonusBase` | double | `1.0` | 灵气加成基数 |
| `cultivationBonusPerDanger` | double | `0.08` | 每级危险度的灵气加成增量 |
| `explorationBonusBase` | double | `1.15` | 地界加成基数 |
| `explorationBonusPerDanger` | double | `0.15` | 每级危险度的地界加成增量 |
| `dangerPerChunks` | int | `12` | 每远离原点多少片，距离档位 +1 |
| `minRealmPerDanger` | int | `3` | 每个危险度档位对应多少境界门槛 |
| `elevationScale` | int | `24` | 高程噪声尺度（单位：分片），越大同一地形带越宽阔 |
| `moistureScale` | int | `17` | 湿度噪声尺度（分片） |
| `borderEdgeChancePercent` | int | `45` | 相邻两片之间每条可能通道的成边概率（%） |
| `extraEdgeChancePercent` | int | `25` | 片内在生成树之外额外成环的边概率（%） |
| `biomes` | array | 6 条 | 地形表，见下 |
| `resourcePools` | object | 7 个池 | 资源池，见下 |
| `firstVisitReward` | object | 7 键 | 首达奖励，见下 |
| `teleport` | object | 5 键 | 传送，见下 |
| `gather` | object | 2 键 | 采集，见下 |

此外文件里还有一批 `_comment*` 键，**程序不读取**，只是写给管理员的说明。

### `biomes` 段

每条地形条目的键：

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `key` | string | 地形 key；同时是**专用资源池的查找键** |
| `name` | string | 生态名，直接作为野外节点的 `region` |
| `danger` | int | 该地形的基础危险度（会被夹到 1~4） |
| `elevationMin` / `elevationMax` | double | 高程区间（夹到 -1~1，反了就自动交换） |
| `moistureMin` / `moistureMax` | double | 湿度区间（同上） |
| `resourcePool` | string | **当前无代码读取**（见上文 warning） |
| `namePrefixes` / `nameSuffixes` | string[] | 地名的前缀/后缀字表；为空时退回 `荒幽枯断寒` / `野谷林泽峡` |
| `descriptions` | string[] | 描述模板，`{biome}` 会被替换成 `name`；为空时退回 `一片无人测绘过的{biome}。` |

六条出厂值见上文「六种生态」表。**顺序有意义**：生成时按声明顺序取第一个命中 `(高程, 湿度)` 的条目，所以最后一条（`plain` 灵田平原）覆盖全域作为兜底；`normalizeBiomes()` 还会检查是否至少有一条能覆盖 `(0,0)`、`(1,1)`、`(-1,-1)`，不满足就追加一条默认灵田平原（否则会有一大片区域生成不出节点）。

### `resourcePools` 段

| 键 | 类型 | 含义 |
| --- | --- | --- |
| 地形 key（`marsh` / `snow` / `volcano`） | array | 地形**专用**池 |
| 危险度档位（`"1"` ~ `"4"`） | array | **通用兜底**池，键是字符串形式的危险度 |

每个池条目的键：`itemKey`（必填，必须是真实存在的物品）、`weight`（权重，`< 1` 会被改成 1）、`minQuantity` / `maxQuantity`（数量区间，`min < 1` 改成 1，`max < min` 改成 `min`）。空 `itemKey` 的条目会被剔除并告警。全部出厂值见上文三张池表。

### `firstVisitReward` 段

| 配置键 | 出厂值 | 含义 |
| --- | --- | --- |
| `spiritStonesBase` | `20` | 首达灵石基础值 |
| `spiritStonesPerDanger` | `30` | 每级危险度追加的灵石 |
| `spiritStonesWildernessMultiplier` | `2.0` | 野外节点的灵石倍率 |
| `experienceBase` | `50` | 首达灵力基础值 |
| `experiencePerDanger` | `80` | 每级危险度追加的灵力 |
| `experienceWildernessMultiplier` | `2.0` | 野外节点的灵力倍率 |
| `completionBonusSpiritStones` | `2000` | 走遍已知世界全部地点的一次性额外灵石 |

### `teleport` 段

| 配置键 | 出厂值 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 是否开启 `/地图 传送`（关掉后回 `传送功能已关闭`） |
| `baseCost` | `50` | 基础费用 |
| `costPerDanger` | `60` | 每 1 点「两地危险度之和」的加价 |
| `wildernessSurcharge` | `1.5` | 目的地是**野外节点**时的附加系数 |
| `minCost` | `10` | 费用下限 |

### `gather` 段

| 配置键 | 出厂值 | 含义 |
| --- | --- | --- |
| `cooldownSeconds` | `60` | 采集冷却（秒）；`< 0` 会被改成 0 |
| `maxPerGather` | `3` | 单次最多采集量；`< 1` 会被改成 1 |

### 非法值兜底

配置文件是给管理员手改的，写错一个数字不该让整个野外系统（乃至服务启动）失败，所以 `normalize()` 一律**修正 + 打告警**：

| 配置键 | 非法值 | 收敛为 |
| --- | --- | --- |
| `chunkSize` | `< 1` / `> 8` | `4` / `8` |
| `maxChunksFromOrigin` | `< 1` / `> 100000` | `256` / `100000` |
| `evictAfterMinutes` | `< 1` | `1440` |
| `restockIntervalMinutes` | `< 1` | `180` |
| `travelTimeSeconds` | `< 1` | `20`（不告警） |
| `dangerPerChunks` | `< 1` | `12`（不告警） |
| `minRealmPerDanger` | `< 0` | `0`（不告警） |
| `elevationScale` / `moistureScale` | `< 1` | `24` / `17`（不告警） |
| `borderEdgeChancePercent` / `extraEdgeChancePercent` | 不在 `0~100` | `45` / `25` |
| `entryLocationIds` | 空 / null | `[5, 7, 8, 12, 15]` |
| `biomes` | 空 / null | 退回内置地形表 |
| `biome.danger` | 越界 | 夹到 `1~4` |
| `resourcePools` 条目 | 空 `itemKey` | 剔除该条目 |

### 旧版废弃字段

如果你是从旧版（固定槽位整批刷新）升级上来的，`config/game/wilderness_map.json` 里可能还留着旧字段：

```
idBase、nodeCount、refreshIntervalMinutes、regions、namePrefixes、nameSuffixes、descriptions
```

这些字段**已废弃**，启动日志会点名提示：

```
野外地图文件仍是旧版结构（...），下列字段已废弃且会被忽略: idBase、nodeCount、...
；建议删除该文件让服务重新释放新版（地形改为世界种子确定性生成）
```

处理方式：**删掉那个文件**，让服务重新释放新版即可。

::: tip 出厂默认值也写在代码里
`WildernessMapConfig` 的字段初始值与 JSON 出厂值一一对应（`worldSeed = 20261015L`、`chunkSize = 4`、`maxChunksFromOrigin = 256`、`evictAfterMinutes = 1440`、`restockIntervalMinutes = 180`、`entryLocationIds = [5,7,8,12,15]`、`travelTimeSeconds = 20`、`dangerPerChunks = 12`、`minRealmPerDanger = 3`、`elevationScale = 24`、`moistureScale = 17`、`borderEdgeChancePercent = 45`、`extraEdgeChancePercent = 25`、`gather = {60, 3}` 等）。所以**删掉配置文件不会改变数值**，只会失去自定义能力。
:::

## 数据文件与配置键索引

野外涉及的数据与配置：

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| 配置文件 | `config/game/wilderness_map.json`（jar 目录下） | 本页「配置」一节的全部键 |
| jar 内模板 | `game/wilderness_map.json` | 首次启动释放到 `config/` 下 |
| 分片数据 | `data/wilderness/<cx÷64>/<cy÷64>/<cx>_<cy>.json` | 一个分片一个文件；可用 `application.yml` 的 `wilderness.dir` 改根目录 |
| 数据库 | `map_locations` | 野外**不写入**；表里只有已知世界 15 个地点（`is_wilderness = 0`） |
| 数据库 | `player_map_exploration` | 野外**不写入**；只记已知世界的首达 |
| 数据库 | `map_location_event_bias` | 野外**不写入**；野外节点因此没有事件偏置 |
| 数据库 | `map_wilderness_resources` | **已废弃**：野外改为文件存储后 `DatabaseManager` 已不再创建该表，老库会留下一张空表 |

::: tip 野外内容已收录进数据参考
* [数据与配置文件](/reference/data-files) 已列出 `game/wilderness_map.json`（jar 内模板）、`config/game/wilderness_map.json`（运行目录可改）与 `data/wilderness/`（分片文件）；
* [配置项全表](/reference/config-keys) 已收录 `wilderness_map.json` 的全部键，并注明 `wilderness.dir`（只存在于代码兜底，jar 内模板没有）。

本页「配置」一节仍是最完整的逐项说明（含每项的出厂值与非法值兜底行为）。
:::

::: warning `DatabaseSchema` 里 `map_locations` 的注释仍是旧版描述
`createMapLocationsTable` 的文档注释写的是"野外 id 从 `WildernessMapConfig.idBase`（默认 1000）起，带 `expires_at`，到期由刷新任务删除并重新生成，因此其资源是随机且会变的"。这套说法**属于旧版实现**：现在野外 id 从 `WildernessTerrain.ID_BASE = 1_000_000` 起，**不在 `map_locations` 里产生任何行**，也没有"到期删除地点"的刷新任务 —— 只有分片文件的补货与未探索分片的回收。代码与测试（`testWildernessNeverCreatesDatabaseRows`）才是当前行为的依据。
:::

## 常见问题

| 问题 | 答案 |
| --- | --- |
| 我站在野外，为什么 `/地图 go <邻居地名>` 说找不到地点？ | 野外节点名是生成的、不在 `map_locations` 里，只能按 **id** 导航。用 `/野外` 打印的 `[id]` |
| 为什么我走的这片没有资源？ | 该节点抽签时可能没抽到资源（每节点只抽 1~2 种，池也可能为空）；也可能已被别人**采空** |
| 采集为什么只能采到一种东西？ | `/采集` 每次只取剩余资源里**第一个**物品 key，玩家不能选采哪一种 |
| 野外会不会把数据库撑爆？ | 不会：野外**不进数据库**，`map_locations` / `player_map_exploration` / `map_connections` 的行数不变，测试有断言 |
| 我探索过的野外会被回收吗？ | 不会。只要留下过首达记录，分片就 `pinned`，**永久保留**，管理台也没有删除入口 |
| 没人去过的野外占存储吗？ | 不占。分片文件是懒创建的，从未被访问过的分片在磁盘上完全不存在 |
| 改 `worldSeed` 之后玩家会看到什么？ | 地形、地名、资源全变；旧分片文件因 `seedHash` 不符被丢弃重建，其中的探索记录与资源库存失效 |
| 危险度 4 的地方进不去？ | 见上文 warning：危险度 4 的节点 `min_realm = 12`，超出境界 id 上限 10，当前配置下无法进入 |
| 野外为什么不计入探索度？ | 野外无限，无法"走满"，计入会让进度条永远无法完成（`/地图 list` 只统计已知世界 15 地点） |

## 源码索引

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/onebot/command/map/WildernessCommand.java` | `/野外` 指令与输出渲染 |
| `src/main/java/com/mtxgdn/onebot/command/map/GatherCommand.java` | `/采集` 指令（只转发到 `MapService.gather`） |
| `src/main/java/com/mtxgdn/onebot/command/map/MapCommand.java` | `/地图`、`go`/`前往`、`list`/`列表`/`浏览`、`tp`/`传送` |
| `src/main/java/com/mtxgdn/game/map/WildernessTerrain.java` | 地形/生态/危险度/连通关系的确定性生成，id 编码 |
| `src/main/java/com/mtxgdn/game/map/WildernessChunk.java` | 分片的持久化状态：探索记录、资源库存、补货、固化 |
| `src/main/java/com/mtxgdn/game/map/WildernessChunkStore.java` | 分片文件存储：坐标目录、原子写、LRU 缓存、删除与分桶清理 |
| `src/main/java/com/mtxgdn/game/config/WildernessMapConfig.java` | 读取 `wilderness_map.json`、内置默认值、非法值兜底、资源池查找 |
| `src/main/java/com/mtxgdn/game/service/MapService.java` | 野外节点解析、首达奖励、传送计价、采集、补货与回收、统计 |
| `src/main/java/com/mtxgdn/game/config/MapDefaults.java` | 已知世界 15 地点出厂值（危险度、加成、入口地点） |
| `src/main/java/com/mtxgdn/game/service/CombatService.java` | 险地 PK 掠夺（`PK_LOOT_MIN_DANGER`、`grantDangerZonePvpLoot`、`checkSafeZone`） |
| `src/main/java/com/mtxgdn/game/service/ExplorationService.java` | 地界加成与事件偏置如何作用于游历结算 |
| `src/main/java/com/mtxgdn/db/DatabaseSchema.java` | `map_locations`、`player_map_exploration`、`map_location_event_bias` 表结构 |
| `src/main/java/com/mtxgdn/Main.java` | `cleanup-scheduler` 每 5 分钟调用 `maintainWildernessIfNeeded()` |
| `src/test/java/com/mtxgdn/game/service/MapWildernessTest.java` | 确定性生成、id 编码、越远越险、不进数据库、固化与回收、补货、采集、PK 掠夺的断言 |
