# 游历探索

游历是玩家在修仙界最基础、最稳定的产出循环：一次指令随机触发 13 种事件之一，事件内部自行结算经验、金币、灵石与物品。核心实现为 `src/main/java/com/mtxgdn/game/service/ExplorationService.java`，事件本体位于 `src/main/java/data/mtxgdn/explorationevent/`，事件基类与注册表位于 `src/main/java/com/mtxgdn/game/explorationevent/`。

## 指令与入口

| 指令 | 别名 | 说明 | 权限 |
| --- | --- | --- | --- |
| `/游历` | `explore` | 执行一次游历探索 | `game.explore` |
| `/游历 状态` | `/游历 status` | 查看当前冷却与剩余等待秒数 | 同上 |

`ExploreCommand` 注册于 `src/main/java/com/mtxgdn/onebot/command/exploration/ExploreCommand.java`，玩法模块为 `exploration`（模块被停用后指令视同不存在）。

```java
super(new String[]{"游历", "explore"},
        "外出游历探索",
        "/游历",
        "探索",
        "game.explore");
setModule("exploration");
registerSub(new String[]{"状态", "status"}, this::showStatus);
```

## 前置条件

| 条件 | 失败提示 |
| --- | --- |
| 角色必须存在 | `角色不存在，请先创建角色` |
| `players.hp > 0` | `你已重伤，无法游历，请先恢复生命值` |
| 距上次游历 ≥ 有效冷却 | `你刚游历过，还需要等待 N 秒` |
| 注册表中至少存在 1 个事件 | `暂无可用游历事件` |

::: tip 游历不消耗体力，也不消耗能量
`ExplorationService.explore()` 只做冷却校验，既不扣 `player_energy.energy`，也不扣任何物品。唯一的时间成本是冷却。
:::

## 冷却机制

基础冷却为常量 `BASE_COOLDOWN_MS`：

```java
/** 游历基础冷却 5 分钟（原 60 秒导致每天可刷上千次，灵石/物品产出失控） */
public static final long BASE_COOLDOWN_MS = 300_000;
```

冷却时间由 `calculateEffectiveCooldown(player)` 计算，仅受灵根特效 `EXPLORATION_CD` 影响：命中时 `effectiveCd = BASE_COOLDOWN_MS × (1 - 灵根特效值)`，否则为 `BASE_COOLDOWN_MS`。

| 灵根 | 特效 | 特效值 | 实际冷却 |
| --- | --- | --- | --- |
| 巽风灵根 `XUNFENG_WIND` | `EXPLORATION_CD` | `0.30` | 300,000 × 0.7 = **210 秒** |
| 其他灵根 | 无 | — | **300 秒** |

冷却检查与时间写入被放在同一个事务内，并对 `players` 行加锁（`getForUpdateClause()`），以避免并发重复触发（TOCTOU 竞态）。冷却时间戳存于 `players.last_exploration_time`（毫秒）。

::: warning 冷却只在成功写入后生效
事务返回 `true` 才继续执行事件；返回 `false` 表示冷却中，此时**不会**消耗任何产出，也不会刷新时间戳。
:::

## 事件抽取规则

事件由 `ExplorationEventRegistry.randomByWeight(random)` 按权重抽取：累加全部事件的 `weight` 得 `totalWeight`，取 `roll = random.nextInt(totalWeight)`，返回第一个使 `roll < cumulative` 的事件（注册表为空时返回 `null`）。

事件通过继承 `ExplorationEvent` 的构造函数自动注册（`super(namespace, key, weight)` → `ExplorationEventRegistry.register(this)`），并由 `ExplorationEventScanner` 扫描 `data.mtxgdn.explorationevent` 包批量实例化。注册表为 `LinkedHashMap`，**同 key 后注册者覆盖先注册者**。

13 个事件的权重合计 **152**：

| 事件 key | 权重 | 抽取概率 |
| --- | --- | --- |
| `monster` 遭遇妖兽 | 25 | 16.45% |
| `treasure` 发现宝藏 | 25 | 16.45% |
| `herb` 采集灵草 | 15 | 9.87% |
| `cultivator` 遇到修士 | 13 | 8.55% |
| `seed` 发现种子 | 12 | 7.89% |
| `material` 采集材料 | 10 | 6.58% |
| `merchant` 偶遇游商 | 10 | 6.58% |
| `ruins` 发现废墟 | 10 | 6.58% |
| `mystery` 神秘奇遇 | 8 | 5.26% |
| `spirit_spring` 灵泉沐浴 | 8 | 5.26% |
| `trap` 触发陷阱 | 7 | 4.61% |
| `nothing` 平安无事 | 5 | 3.29% |
| `strange_tower` 奇遇古塔 | 4 | 2.63% |

::: details 关于事件名称的本地化
`ExplorationEvent.getName()` / `getDescription()` 走 `LangManager.get()`，键为 `explorationevent.<key>.name` / `.desc`。`zh_cn.json` 中**只存在 7 个事件**的条目（`treasure`、`monster`、`cultivator`、`ruins`、`herb`、`trap`、`nothing`）；其余 6 个（`material`、`merchant`、`mystery`、`seed`、`spirit_spring`、`strange_tower`）没有翻译条目，`LangManager.get(key)` 会原样返回 key 字符串（即 `explorationevent.material.name`）。指令回复中真正展示给玩家的是各事件 `log.add(...)` 写入的文案与 `result.getMessage()`，不依赖 getName()。
:::

## 13 种游历事件详解

下表中 `realm` 一律指 `player.getRealm() + 1`（`Player.getRealm()` 为境界 ID，0 为凡人）。`nextInt(a, b)` 为左闭右开，`nextLong(a, b)` 同为左闭右开。

### 1. monster — 遭遇妖兽（权重 25）

| 项目 | 内容 |
| --- | --- |
| eventType | `monster` |
| 触发条件 | 无额外条件，按权重抽取 |
| 机制 | `Monster.random(player.getRealm(), random)` 按**玩家境界**生成妖兽，再调用 `CombatService.pveFight(playerId, monster)` 完整跑一场 PVE 战斗 |
| 奖励 | 完全由战斗结果决定，转发 `PveCombatResult` 的 `expGained` / `goldGained` / `spiritStonesGained` / `itemGained` / `itemQuantity` / `message` |
| 失败后果 | 战败时无奖励，生命值按战斗过程真实扣减（HP 可能归零进入重伤） |
| 特殊 | 战斗日志整段追加进游历日志（`log.addAll(pveResult.getBattleLog())`） |

```java
Monster monster = Monster.random(player.getRealm(), random);
CombatService combatService = new CombatService();
PveCombatResult pveResult = combatService.pveFight(player.getId(), monster);

result.setMonsterDefeated(pveResult.isPlayerWon());
result.setMonsterName(monster.getName());
result.setExpGained(pveResult.getExpGained());
```

### 2. treasure — 发现宝藏（权重 25）

| 项目 | 内容 |
| --- | --- |
| eventType | `treasure` |
| 触发条件 | 无额外条件 |
| 奖励 | 金币 `random.nextLong(realm*50, realm*300 + 100)` **且** 灵石 `random.nextLong(realm*10, realm*80 + 20)`，两者同时发放 |
| 特殊 | 唯一一个必定双货币产出的事件，无分支 |

### 3. herb — 采集灵草（权重 15）

| 项目 | 内容 |
| --- | --- |
| eventType | `herb` |
| 掉落池 | `mtxgdn:spirit_grass`、`mtxgdn:healing_pill`、`mtxgdn:mana_pill`、`mtxgdn:spirit_spring_water` 四选一 |
| 数量 | `random.nextInt(1, 3)` → 1~2 个 |
| 兜底 | 若选中 key 未通过 `ItemRegistry.contains()`，改为发放经验 `realm × 30` |

对应物品名：灵草、回血丹、回蓝丹、灵泉水。

### 4. cultivator — 遇到修士（权重 13）

按 `random.nextDouble()` 三段分流：

| 区间 | 结果 | 数值 |
| --- | --- | --- |
| `[0, 0.5)` | 经验 | `realm × 120` |
| `[0.5, 0.8)` | 灵石 | `realm × 30` |
| `[0.8, 1.0)` | 物品 或 金币 | 先抽 7 件物品池中一件，**再**以 60% 概率判定是否真的给；判定失败则改为金币 `realm × 100` |

物品池（均带命名空间前缀）：`spirit_grass`、`iron_ore`、`healing_pill`、`mana_pill`、`spirit_recovery_pill`、`enhance_stone`、`spirit_spring_water`。

```java
String[] items = {"mtxgdn:spirit_grass", "mtxgdn:iron_ore", "mtxgdn:healing_pill",
        "mtxgdn:mana_pill", "mtxgdn:spirit_recovery_pill", "mtxgdn:enhance_stone", "mtxgdn:spirit_spring_water"};
String giftItem = items[random.nextInt(items.length)];
if (ItemRegistry.contains(giftItem) && random.nextDouble() < 0.6) { /* 给物品 */ }
else { /* 给 realm × 100 金币 */ }
```

### 5. seed — 发现种子（权重 12）

稀有度分桶决定可抽的种子下标区间：

| rarityRoll | 下标区间 | 候选种子 |
| --- | --- | --- |
| `< 0.5` | 0~3 | 灵草种子、暗冰草种子、火焰藤种子、千年人参种子 |
| `< 0.85` | 4~6 | 幽冥花种子、星草种子、血灵芝种子 |
| 其余 | 7 | 天山雪莲种子 |

数量 `random.nextInt(1, 3)` → 1~2 个。未注册时兜底为经验 `realm × 20`。

### 6. material — 采集材料（权重 10）

17 项材料按下标分三档（注释明确标注档位与下标区间一致）：

| rarityRoll | 下标区间 | 档位 | 材料 |
| --- | --- | --- | --- |
| `< 0.5` | 0~5 | 普通 | 灵草、铁矿石、银矿石、金矿石、秘银矿石、妖兽内丹 |
| `< 0.85` | 6~10 | 稀有 | 魔核、龙血晶、冰晶、天火石、星沙 |
| 其余 | 11~16 | 史诗 | 灵珠、千年何首乌、深海珊瑚、鬼火精华、天蚕丝、血玉髓 |

数量 `random.nextInt(1, 4)` → 1~3 个。未注册时兜底为经验 `realm × 25`。

### 7. merchant — 偶遇游商（权重 10）

| 区间 | 结果 |
| --- | --- |
| `[0, 0.3)` | 强化石 × `nextInt(1,4)`（1~3 颗） |
| `[0.3, 0.6)` | 回血丹 / 回蓝丹 / 灵泉水 / 妖兽内丹 四选一，数量 `nextInt(1,3)`（1~2） |
| `[0.6, 0.85)` | 金币 `realm × 200 + nextInt(500)` |
| `[0.85, 1.0)` | 灵石 `realm × 40` |

### 8. ruins — 发现废墟（权重 10）

| 区间 | 结果 |
| --- | --- |
| `[0, 0.4)` | 12 件稀有物品池随机 1 件（见下表） |
| `[0.4, 0.75)` | 灵石 `realm × 150` |
| `[0.75, 1.0)` | 经验 `realm × 200` |

稀有物品池：`cultivation_elixir`（修炼丹）、`scripture_page`（功法残页）、`spirit_sword`（灵剑）、`guardian_jade`（护身玉）、`basic_sword_manual`（基础剑诀）、`fire_dragon_art`（火龙术）、`jade_armor`（玉甲）、`power_buff_pill`（神力丹）、`speed_talisman`（神行符）、`thunder_bolt_talisman`（天雷符）、`dragon_blood_crystal`（龙血晶）、`spirit_stone_pouch`（灵石袋）。

若首档抽中的 key 未注册，降级为灵石 `realm × 80`。

### 9. mystery — 神秘奇遇（权重 8）

六段分流，是本表中数值波动最大的事件：

| 区间 | 结果 |
| --- | --- |
| `[0, 0.2)` | 传说材料 1 件：`five_colored_divine_stone`（五色神石）、`phoenix_gallbladder`（凤凰胆）、`qilin_horn`（麒麟角）、`dragon_scale`（龙鳞）、`phoenix_feather`（凤凰羽毛）、`dragon_bone`（龙骨）六选一；未注册则降级为灵石 `realm × 100` |
| `[0.2, 0.4)` | 金币 `nextLong(500, 2000)` → 500~1999 |
| `[0.4, 0.6)` | 经验 `realm × 200` |
| `[0.6, 0.75)` | 种子 × `nextInt(2,4)`（2~3 颗），池为灵草/暗冰草/火焰藤/千年人参/幽冥花种子；未注册则该档**不发任何奖励** |
| `[0.75, 0.9)` | 灵石 `nextLong(50, 200)` → 50~199 |
| `[0.9, 1.0)` | 经验 `realm × 500`（全事件最高经验档） |

::: warning 种子档位存在"空奖励"路径
`[0.6, 0.75)` 分支的 `if (ItemRegistry.contains(seedKey))` 没有 `else`。若种子 key 未注册，该次游历除日志外不产生任何产出。
:::

### 10. spirit_spring — 灵泉沐浴（权重 8）

| 项目 | 内容 |
| --- | --- |
| 回血 | `maxHp/4 + nextInt(maxHp/4)` |
| 回蓝 | `maxMp/4 + nextInt(maxMp/4)` |
| 经验 | `realm × 80` |
| 物品 | 灵泉水 × `nextInt(1,4)`（1~3 瓶） |

生命与法力的实际写入用 SQL 直接更新，并用 `LEAST(max_hp, hp + ?)` 封顶，不会溢出：

```java
try (var conn = com.mtxgdn.db.DatabaseManager.getConnection();
     var ps = conn.prepareStatement("UPDATE players SET hp = LEAST(max_hp, hp + ?), mp = LEAST(max_mp, mp + ?) WHERE id = ?")) {
```

::: tip 这是唯一能"回血"的游历事件
其余事件中，只有 `monster`（战败掉血）、`trap`（固定掉血）会改变生命值。重伤（`hp <= 0`）玩家无法游历，因此想靠游历自然恢复生命是不可行的，需用 `/疗伤` 或丹药。
:::

### 11. trap — 触发陷阱（权重 7）

| 项目 | 内容 |
| --- | --- |
| 扣血 | `maxHp/10 + nextInt(maxHp/8)` |
| 下限保护 | `newHp = Math.max(1, player.getHp() - hpLoss)`，**陷阱不会直接把玩家打到 0 血** |
| 奖励 | 无 |

```java
int maxHp = player.getMaxHp();
int hpLoss = maxHp / 10 + random.nextInt(maxHp / 8);
int newHp = Math.max(1, player.getHp() - hpLoss);
```

`result.setHpLost(hpLoss)` 记录名义扣血量；指令侧按 `result.getHpLost() > 0` 输出 `损失生命: -N`。

### 12. nothing — 平安无事（权重 5）

| 项目 | 内容 |
| --- | --- |
| 奖励 | 经验 `realm × 10`（保底经验，全事件最低） |

### 13. strange_tower — 奇遇古塔（权重 4）

| 区间 | 结果 |
| --- | --- |
| `[0, 0.3)` | `heavenly_jade`（天玉）或 `tribulation_pill`（渡劫丹）50/50，各 1 件 |
| `[0.3, 0.6)` | 经验 `realm × 300` |
| `[0.6, 0.8)` | 强化石 × `nextInt(3,8)`（3~7 颗） |
| `[0.8, 1.0)` | 灵石 `realm × 200` **且** 金币 `realm × 500` |

::: warning 该事件使用不带命名空间前缀的裸 key
`itemService.addItem(player.getId(), rareItem, 1)` 中的 `rareItem` 是 `"heavenly_jade"` / `"tribulation_pill"`，强化石同理为 `"enhance_stone"`，均无 `mtxgdn:` 前缀。`ItemService.addItem` 内部会自动补全前缀，因此实际可发放；但这里**没有** `ItemRegistry.contains()` 前置校验，与其余事件写法不一致。
:::

## 结算后的全局加成

事件执行完毕、奖励已入账后，`ExplorationService` 再追加两层倍率。两层都**只对已结算的 `expGained` / `goldGained` / `spiritStonesGained` 做增量补发**，不改动物品数量。

### 季节加成

`SeasonService.getExplorationMultiplier()`：

| 季节 | 游历倍率 |
| --- | --- |
| 春 SPRING | 1.10 |
| 夏 SUMMER | 1.00 |
| 秋 AUTUMN | 1.05 |
| 冬 WINTER | 0.90 |

仅当 `explMult > 1.0` 且 `result.isSuccess()` 时才追加，追加量 = `原值 × (倍率 - 1)`，日志行为 `🍂 <季节名>游历加成: 金币+X 灵石+Y 经验+Z`。

### 天象加成

`DailyService.getTodayPhenomenonStatic().getExplorationMultiplier()`：

| 天象 | 游历倍率 | 战斗倍率 | 灵石倍率 | 修炼倍率 |
| --- | --- | --- | --- | --- |
| 紫气东来 | 1.00 | 1.00 | 1.00 | 1.30 |
| 星辰耀天 | 1.20 | 1.20 | 1.00 | 1.00 |
| 血月当空 | 1.00 | 1.30 | 1.00 | 1.00 |
| 灵潮涌动 | 1.00 | 1.00 | 1.50 | 1.00 |
| 枯荣交替 | 1.00 | 1.00 | 1.00 | 1.00 |
| 万籁俱寂 | 1.05 | 1.05 | 1.05 | 1.05 |

日志行为 `✦ <天象名>游历加成: ...`。季节与天象是**串行累乘效果**（各自基于已含前一层增量的结果再算增量）。

## 每日计数与机缘奖励

每次游历结束都会调用 `new DailyService().onExplore(playerId, eventType)`：

1. 递增 `player_daily.exploration_count`；
2. 触发 `checkAndAwardDailyFortune(playerId)`。

机缘判定（每项每天只能领一次，由 `*_rewarded` 标志位控制）：

| 条件 | 奖励 |
| --- | --- |
| `explorationCount >= 3` 且未领 | 经验 `(realm+1) × 100`，再经天象 `applyCultivation` |
| `battleCount >= 1` 且未领 | 金币 `(realm+1) × 200` |
| `secretRealmCount >= 1` 且未领 | 灵石 `(realm+1) × 100`，再经天象 `applySpiritStone` |

## 结果对象与指令输出

`ExplorationResult` 字段（`src/main/java/com/mtxgdn/game/entity/ExplorationResult.java`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 是否成功（冷却中 / 重伤为 `false`） |
| `message` | `String` | 一句话摘要 |
| `eventType` | `String` | 事件 key，如 `treasure` |
| `eventDescription` | `String` | 事件中文描述 |
| `expGained` / `goldGained` / `spiritStonesGained` | `long` | 已含季节与天象加成的最终值 |
| `itemGained` / `itemQuantity` | `String` / `int` | 物品 key 与数量 |
| `hpLost` | `int` | 损失生命（`trap` 事件） |
| `monsterDefeated` / `monsterName` | `boolean` / `String` | `monster` 事件战斗结果 |
| `log` | `List<String>` | 逐行叙事日志 |
| `nextExplorationTime` | `long` | 下次可游历的时间戳（`now + effectiveCd`） |

`ExploreCommand` 的输出顺序：`===== 游历探索 =====` → 全部 `log` 行 → `message` → 非零的 `灵力/金币/灵石` → `获得物品` → `损失生命`。

## 插件事件

| 时机 | 事件类型 | 携带数据 |
| --- | --- | --- |
| 冷却通过、事件抽取前 | `EXPLORATION_START` | `playerId` |
| 全部结算与加成完成后 | `EXPLORATION_END` | `playerId`、`eventType` |

两者均通过 `PluginEventManager.fireQuietly` 触发，插件异常不会中断游历流程。

## 行为记录

每次游历都会写一条 `PlayerActionLogger.logExploration(userId, name, eventType, message)`，`eventType` 为 null 时记为 `未知`。这是运维排查刷取行为的主要依据。
