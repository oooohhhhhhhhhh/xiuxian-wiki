# 洞府

洞府是玩家的私人修炼据点：自动汇聚**灵气**、提供**修炼加成**、扩展**背包存储**，并可被阵法进一步强化。实现位于 `src/main/java/com/mtxgdn/game/service/CaveService.java`（358 行）、实体 `game/entity/Cave.java`，QQ 入口为 `src/main/java/com/mtxgdn/onebot/command/cave/CaveCommand.java`。

## 指令与接口

主指令 `/洞府`，别名 `cave`，权限节点 `game.cave.manage`，模块 `cave`。

| 子命令 | 中文别名 | 参数 | 说明 |
| --- | --- | --- | --- |
| `create` | `开辟` | `[名称]` | 开辟洞府（金丹期 + 300 灵石） |
| `info` | `信息` | — | 查看洞府详情与升级花费 |
| `collect` | `收集` | — | 收集灵气转化为灵石（每 5 分钟一次） |
| `meditate` | `冥想` | — | 在洞府中打坐，获得经验（有心魔风险） |
| `levelup` | `升级` | — | 消耗灵石升级洞府 |
| `help` | `帮助`、`?` | — | 帮助文本 |

`/洞府` 无参数或子命令无法识别时回退到 `buildOverview`：已有洞府显示概览 + 快捷操作，没有则显示"洞府系统"介绍。

### REST 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `cave/info` | `game.cave.manage` | 洞府详情；无洞府返回 `code 404` + `hasCave: false` |
| POST | `cave/create` | `game.cave.manage` | 开辟（body 可选 `name`） |
| POST | `cave/collect` | `game.cave.manage` | 收集灵气 |
| POST | `cave/meditate` | `game.cave.manage` | 冥想 |
| POST | `cave/levelup` | `game.cave.manage` | 升级 |

`cave/info` 成功时返回：`code`、`success`、`hasCave`、`name`、`level`、`maxLevel`、`spiritEnergy`、`maxSpiritEnergy`、`cultivationBonus`、`storageBonus`，以及未满级时的 `levelUpCost`。其余接口通过 `copyIfPresent` 透传 `collected`、`spiritEnergy`、`expGain`、`bonus`、`heartDemon`、`newLevel` 等可选字段。

::: tip REST 接口是后补的
源码注释说明："此前洞府只有 QQ 子命令、没有任何 addRoute，导致 Web/REST 通道完全访问不到洞府系统。" 现在两端的权限节点一致，都是 `game.cave.manage`。
:::

## 开启条件

`/洞府 create [名称]`（`CaveService.createCave`）。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `Cave.MIN_REALM_CREATE` | `3` | 最低境界（代码提示文案为"金丹期"） |
| `Cave.CREATE_COST_SPIRIT_STONES` | `300` | 开辟消耗（下品灵石等值） |
| `Cave.MAX_LEVEL` | `10` | 最高等级 |

| 校验 | 提示 |
| --- | --- |
| 角色存在 | 角色不存在 |
| `player.getRealm() >= 3` | 境界不足，需要达到金丹期以上才能开辟洞府（当前：X） |
| 尚无洞府 | 你已经拥有洞府了 |
| 灵石 ≥ 300 | 灵石不足，开辟洞府需要 300 灵石（你目前有 N 灵石） |

洞府名称处理：

- 未提供或全空白 → 默认 **`山间洞府`**。
- 超过 10 个字符 → **截断到前 10 个字符**（不是报错）。
- 名称不要求唯一，多个玩家可以叫同名洞府。

创建在一个事务内完成：跨等级扣 300 灵石 → 插入 `caves`（`level = 1`、`spirit_energy = 0`、`max_spirit_energy = getMaxSpiritEnergyForLevel(1)`、`cultivation_bonus = getCultivationBonusForLevel(1)`、`storage_bonus = getStorageBonusForLevel(1)`、`last_collect_time = 当前时间`）。

::: warning 曾经有"开辟失败实际成功"的 bug
源码注释记录了修复过程：

> 不能在事务内用另一条连接查询刚插入的行（事务未提交时新连接看不到该行，导致返回 null 报失败，但插入实际已提交）。改为：事务内只返回生成的 id，提交后再查询。

现在的实现是事务内 `RETURN_GENERATED_KEYS` 取 id，提交后 `getCaveById(caveId)` 再查。若查询仍返回 null，会提示"开辟洞府失败"——但此时灵石已扣、洞府已建。
:::

## 灵力（灵气）收集机制

洞府的核心产出是**灵气**，它会自动增长，然后由玩家手动"收集"并转化为**下品灵石**。

### 自动增长

```java
static {
    scheduler.scheduleAtFixedRate(CaveService::tickSpiritEnergy, 10, 10, TimeUnit.SECONDS);
    LOG.info("洞府灵气自动增长任务已启动");
}

public static void tickSpiritEnergy() {
    // 内置模块门控：洞府模块停用后暂停灵气自动收集
    if (!com.mtxgdn.plugin.BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("cave")) return;
    String sql = DatabaseManager.isSqlite()
            ? "UPDATE caves SET spirit_energy = MIN(max_spirit_energy, spirit_energy + 10)"
            : "UPDATE caves SET spirit_energy = LEAST(max_spirit_energy, spirit_energy + 10)";
    ...
}
```

| 项 | 内容 |
| --- | --- |
| 调度器 | 单线程 `ScheduledExecutorService`（**非守护线程**，用 `CaveService.shutdown()` 停止） |
| 首次延迟 / 周期 | 10 秒 / 10 秒 |
| 每次增长 | **+10 灵气**，封顶 `max_spirit_energy` |
| 增长速率 | **每秒 +1**（10 秒 +10） |
| 影响范围 | **一条 UPDATE 语句更新所有洞府**（无 `WHERE` 条件） |
| 模块门控 | `isEnabledOrUnknown("cave")` 为假时整轮跳过 |

### 灵气上限

```java
public static int getMaxSpiritEnergyForLevel(int level) {
    return 1000 + (level - 1) * 500;
}
```

| 等级 | 灵气上限 | 从 0 充满所需时间 |
| --- | --- | --- |
| 1 | 1,000 | 约 17 分钟 |
| 2 | 1,500 | 约 25 分钟 |
| 3 | 2,000 | 约 33 分钟 |
| 4 | 2,500 | 约 42 分钟 |
| 5 | 3,000 | 约 50 分钟 |
| 6 | 3,500 | 约 58 分钟 |
| 7 | 4,000 | 约 67 分钟 |
| 8 | 4,500 | 约 75 分钟 |
| 9 | 5,000 | 约 83 分钟 |
| 10 | 5,500 | 约 92 分钟 |

### 收集

`/洞府 collect`（`collectSpiritEnergy`）：

| 常量 | 值 |
| --- | --- |
| 收集间隔 `collectInterval` | `5 * 60 * 1000`（5 分钟） |

流程（全程一个事务）：

1. 无洞府 → "你还没有洞府"。
2. 事务内加锁读 `spirit_energy` 与 `last_collect_time`（MySQL 用 `getForUpdateClause()`，SQLite 留空）。
3. 距上次收集不足 5 分钟 → 返回 `null`，对外提示"灵气尚未汇聚，还需等待 N 秒"。
4. `spirit_energy <= 0` → 返回 `null`，对外提示"洞府灵气不足，需要等待灵气汇聚"。
5. 成功：`UPDATE caves SET spirit_energy = 0, last_collect_time = ? WHERE id = ?`。
6. 事务内发放灵石：`addSpiritStones(conn, playerId, boostedEnergy)`，保证"灵能重置与灵石发放"原子性。

### 阵法加成

```java
int formationBoost = ServiceRegistry.getFormationService().getTotalSpiritEnergyBoost(playerId);
long boostedEnergy = spiritEnergy;
if (formationBoost > 0) {
    boostedEnergy = spiritEnergy * (100 + formationBoost) / 100;
}
```

`FormationService.getTotalSpiritEnergyBoost(playerId)` 返回**当前激活阵法**的 `spiritEnergyBoost`（没有激活阵法返回 0）。收集量按 `灵气 × (100 + 加成%) / 100` 放大，整数运算向下取整。

::: warning 灵气不能囤积超过上限
`tickSpiritEnergy` 用 `MIN(max_spirit_energy, ...)` 封顶，超过上限的增长被直接丢弃。因此长时间不收集并不会积累更多灵气——**上限就是单次收集的最大值**（未计阵法加成）。5 分钟的收集冷却远短于充满所需时间，冷却几乎不构成瓶颈。
:::

::: tip 灵气还有第二个用途：灵石提纯
`EconomyService.purifySpiritStone` 会把洞府灵气作为**提纯材料**直接消耗（下品→中品 100 点、中品→上品 1000 点、上品→极品 10000 点）。它用的是条件 UPDATE `UPDATE caves SET spirit_energy = spirit_energy - ? WHERE id = ? AND spirit_energy >= ?`，因此提纯和收集会互相争夺同一池灵气。
:::

## 升级消耗与收益

`/洞府 levelup`（`CaveService.levelUp`）：

```java
public static int getCultivationBonusForLevel(int level) { return level * 5; }
public static int getStorageBonusForLevel(int level) { return level * 10; }
public static long getLevelUpCost(int currentLevel) { return currentLevel * 500; }
```

| 当前等级 | 升级花费（灵石） | 升级后等级 | 修炼加成 | 存储加成 | 灵气上限 |
| --- | --- | --- | --- | --- | --- |
| 1 | 500 | 2 | +10% | +20 格 | 1,500 |
| 2 | 1,000 | 3 | +15% | +30 格 | 2,000 |
| 3 | 1,500 | 4 | +20% | +40 格 | 2,500 |
| 4 | 2,000 | 5 | +25% | +50 格 | 3,000 |
| 5 | 2,500 | 6 | +30% | +60 格 | 3,500 |
| 6 | 3,000 | 7 | +35% | +70 格 | 4,000 |
| 7 | 3,500 | 8 | +40% | +80 格 | 4,500 |
| 8 | 4,000 | 9 | +45% | +90 格 | 5,000 |
| 9 | 4,500 | 10 | +50% | +100 格 | 5,500 |
| 10 | — | — | — | — | —（"洞府已达到最高等级 10 级"） |

**1 级洞府**：修炼加成 `+5%`、存储加成 `+10 格`、灵气上限 `1,000`。

校验顺序：无洞府 → "你还没有洞府"；已满级 → "洞府已达到最高等级 10 级"；灵石不足 → "灵石不足，升级需要 N 灵石（你目前有 M 灵石）"。

升级在一个事务内：跨等级扣灵石 → `UPDATE caves SET level = ?, max_spirit_energy = ?, cultivation_bonus = ?, storage_bonus = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`。

::: warning 升级只改上限，不回填灵气
升级只写 `max_spirit_energy`，**不会**把 `spirit_energy` 提升到新上限，也不补发差值。想拿满新上限需要等自动增长慢慢填。
:::

## 冥想修炼

`/洞府 meditate`（`CaveService.meditate`）。

### 经验公式

```java
int caveBonus = cave.getCultivationBonus();
int formationBonus = ServiceRegistry.getFormationService().getTotalCultivationBonus(playerId);
int totalBonus = caveBonus + formationBonus;
long expGain = 100 + (long) totalBonus * 10;
```

| 项 | 公式 |
| --- | --- |
| 基础经验 | **100** |
| 加成经验 | `(洞府修炼加成 + 阵法修炼加成) × 10` |

| 洞府等级 | 洞府加成 | 无阵法时经验 | 聚灵阵 +10% 时经验 |
| --- | --- | --- | --- |
| 1 | +5% | 150 | 200 |
| 5 | +25% | 350 | 450 |
| 10 | +50% | 600 | 700 |

::: warning 冥想是"立即结算"而非挂机
每次执行 `/洞府 meditate` 立刻发放一次经验，**没有冷却、没有次数限制**。它不依赖 `player.isCultivating()`（闭关状态），也不消耗灵气。因此它是与闭关修炼并行的独立收益渠道。
:::

### 心魔劫

冥想会走心魔判定（`HeartDemonService.processCultivationWithCave(playerId, expGain, 30, totalCaveLevelForHeartDemon)`）：

```java
int formationResist = ServiceRegistry.getFormationService().getTotalHeartDemonResist(playerId);
int totalCaveLevelForHeartDemon = cave.getLevel() + (formationResist / 2);
```

传入的 `elapsedSeconds` 固定为 **30**，心魔等级 = `洞府等级 + 阵法心魔抗性 / 2`。

心魔概率模型（`HeartDemonService`）：

| 项 | 值 |
| --- | --- |
| `BASE_CHANCE_PER_HOUR` | `0.08` |
| 基础概率 | `0.08 × (30 / 3600) ≈ 0.067%` |
| 灵力抗性 | `min(8.0, spirit / 15.0)` |
| 灵根抗性 | 鸿蒙 8.0、正灵根 6.0、异灵根 4.0、天灵根 3.0、双灵根 2.0、三灵根 1.0、四灵根 0、杂灵根 **-2.0**（负值等于更易走火入魔）；带 `LATE_BLOOMER` 再 +2.0 |
| 洞府抗性 | `洞府等级(含阵法折算) × 3.0` |
| 最终概率 | `min(40.0, max(0.0, 基础 - 灵力抗性 - 灵根抗性 - 洞府抗性))` |

触发时按严重度扣经验：

| 严重度 | 判定区间 | 损失比例 |
| --- | --- | --- |
| 轻微 | `severityRoll < 50` | 20%~40% |
| 中等 | `50 ≤ severityRoll < 85` | 50%~70% |
| 严重 | `severityRoll ≥ 85` | 80%~100% |

触发时返回文案包含心魔叙事与"（修为倒退 N 点）"，并给出"实际获得: N 经验值"；`netExpChange` 为负时按 0 处理（不会倒扣经验）。返回结果附带 `heartDemon` 对象。

::: tip 洞府等级对心魔抗性是"双重收益"
`cave.getLevel()` 直接进 `caveResist = caveLevel × 3.0`，同时 `formationResist / 2` 也折算进洞府等级。因此**升级洞府不仅提高冥想经验，还线性降低走火入魔概率**。
:::

## 与阵法/修炼加成的联动

| 联动点 | 调用 | 作用 |
| --- | --- | --- |
| 灵气收集 | `FormationService.getTotalSpiritEnergyBoost(playerId)` | 收集量 ×`(100 + 加成)/100` |
| 冥想经验 | `FormationService.getTotalCultivationBonus(playerId)` | 与洞府加成**相加**后 ×10 |
| 冥想心魔 | `FormationService.getTotalHeartDemonResist(playerId)` | 折算为额外洞府等级（÷2） |
| 背包容量 | `CaveService.getStorageBonus(playerId)` | 直接加到背包格数上 |

背包容量计算（`ItemService.getInventoryCapacity`）：

```java
int baseCapacity = BASE_CAPACITY + (level - 1) * CAPACITY_PER_LEVEL;
int bonusCapacity = calculateCapacityBonus(playerId);   // 装备的 InventoryCapacityEffect + 洞府存储加成
return baseCapacity + bonusCapacity;
```

其中 `calculateCapacityBonus` 最后一行是 `bonus += caveService.getStorageBonus(playerId);`。配置值见 `application.yml`：

```yaml
inventory:
  base_capacity: 30            # 初始背包格子数
  capacity_per_level: 5        # 每升一级增加的背包格子数
```

因此一个 10 级洞府相当于**额外 +100 背包格**。

::: warning 主修炼流程只吃阵法加成，不吃洞府加成
`PlayerService` 计算修炼速度倍率时，源码注释写的是"洞府/阵法修炼加成（聚灵阵等）"，但代码只调用了阵法：

```java
// 洞府/阵法修炼加成（聚灵阵等）
int formationBonus = ServiceRegistry.getFormationService().getTotalCultivationBonus(player.getId());
if (formationBonus > 0) {
    mult *= (1 + formationBonus / 100.0);
}
```

`Cave.getCultivationBonus()` 全仓库只在两处被消费：`/洞府 meditate` 的经验公式，以及 `cave/info` 等展示接口。也就是说 **洞府加成目前只作用于"冥想"，不影响 `/修炼` 闭关的挂机收益**。
:::

## 数据表

`caves`（`DatabaseSchema.createCavesTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 洞府 ID |
| `player_id` | `BIGINT NOT NULL`，**`UNIQUE (player_id)`** | 玩家 ID（外键 → `players(id)` ON DELETE CASCADE）；一人一洞府 |
| `name` | `VARCHAR(32) NOT NULL DEFAULT '山间洞府'` | 洞府名（业务层截断到 10 字符） |
| `level` | `INT DEFAULT 1` | 等级，上限 10 |
| `spirit_energy` | `BIGINT DEFAULT 0` | 当前灵气 |
| `max_spirit_energy` | `INT DEFAULT 1000` | 灵气上限，随等级更新 |
| `cultivation_bonus` | `INT DEFAULT 5` | 修炼加成（%），随等级更新 |
| `storage_bonus` | `INT DEFAULT 10` | 存储加成（格），随等级更新 |
| `last_collect_time` | `BIGINT DEFAULT 0` | 上次收集时间（毫秒时间戳），5 分钟冷却依据 |
| `created_at` / `updated_at` | 时间戳 | 创建/更新时间 |

::: danger `spirit_energy` 是 BIGINT 但上限是 INT
表里 `spirit_energy` 用 `BIGINT`，而 `max_spirit_energy` 是 `INT`（最大 5,500）。业务层用 `long spiritEnergy` 读取，`getMaxSpiritEnergy()` 返回 `int`。类型不匹配本身无害，但提纯上品灵石一次消耗 10,000 点灵气，**已超过 10 级洞府的 5,500 上限**，因此极品灵石提纯在理论上不可达（需要外部途径直接写库或未来调整上限）。
:::

## 输出格式

`/洞府 info`：

```text
===== 【山间洞府】 =====
等级: 3级
灵气: 1250/2000
修炼加成: +15%
存储加成: +30 格
升级所需灵石: 1500

可用操作:
  /洞府 collect   收集灵气
  /洞府 meditate  洞中冥想
  /洞府 levelup   升级洞府
```

`/洞府`（无参数，已有洞府）：

```text
════ 【山间洞府】 ════
等级: 3  灵气: 1250/2000
修炼加成: +15%  存储加成: +30格

▍快捷操作
  /洞府 collect   收集灵气
  /洞府 meditate  洞中冥想
  /洞府 levelup   升级洞府
```

`/洞府`（无洞府）展示"洞府系统"介绍，包含开辟命令与三项功能说明（修炼加成 / 灵气收集 / 存储扩展）。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 开辟报"境界不足" | `player.getRealm() < 3`（金丹期） |
| 开辟报"你已经拥有洞府了" | `caves` 表 `UNIQUE (player_id)`，一人一洞府 |
| 洞府名被截断 | 名称超过 10 字符会自动截断，不报错 |
| 收集报"灵气尚未汇聚，还需等待 N 秒" | 距上次收集不足 5 分钟 |
| 收集报"洞府灵气不足" | `spirit_energy <= 0`，等自动增长（每秒 +1） |
| 灵气一直不到上限 | `tickSpiritEnergy` 每 10 秒 +10 且封顶；确认洞府模块未被停用 |
| 冥想经验比预期低 | 冥想经验只吃洞府 + 阵法加成，与闭关/功法/称号无关 |
| 冥想触发心魔扣经验 | 概率 = 基础 0.067% − 灵力/灵根/洞府抗性，最高 40%；扣 20%~100% |
| 升级后灵气没变多 | 升级只改上限，不补灵气 |
| 背包格子比预期多 | `storage_bonus`（等级 ×10）直接计入 `getInventoryCapacity` |
| 提纯极品灵石报"洞府灵气不足" | 需要 10,000 点，超过 10 级洞府上限 5,500 |
