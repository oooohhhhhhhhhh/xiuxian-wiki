# 炼丹与锻造（合成系统）

合成系统把「配方」存在数据库表 `recipes` 里，启动时由 `CraftingService.insertDefaultRecipes()` 按**名称幂等**写入内置配方。玩家侧统一入口是 `/合成`（别名 `/炼制`、`craft`），分为查看配方、按分类查看、制造、查看熟练度四个子指令。

关键源码：

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/game/service/CraftingService.java` | 配方查询、`craft` 结算、熟练度、`insertDefaultRecipes` |
| `src/main/java/com/mtxgdn/game/entity/Recipe.java` | 配方实体与两个枚举 |
| `src/main/java/com/mtxgdn/onebot/command/crafting/CraftCommand.java` | `/合成` 与 REST 路由 |
| `src/main/java/com/mtxgdn/db/DatabaseSchema.java` | `createRecipesTable` |
| `src/main/java/com/mtxgdn/db/DatabaseMigration.java` | `addRecipesQualityColumns` 补三列品质字段 |

## 配方实体

```java
public enum Category { PILL, EQUIPMENT, CONSUMABLE, SEED }
public enum PillQuality { NORMAL, HIGH, MAX }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `long` | 自增主键 |
| `name` | `String` | 配方名，**幂等键** |
| `description` | `String` | 描述 |
| `category` | `Category` | `PILL` 丹药 / `EQUIPMENT` 装备 / `CONSUMABLE` 消耗品 / `SEED` 种子 |
| `requiredRealm` | `int` | 所需大境界索引（0 凡人 ~ 10 金仙） |
| `resultItemKey` / `resultQuantity` | `String` / `int` | 产物与基础数量 |
| `material1..3Key` / `material1..3Count` | `String` / `int` | 最多三种材料 |
| `costGold` / `costSpiritStones` | `long` | 金币与灵石（下品等值）消耗 |
| `successRate` | `double` | 基础成功率 |
| `minExpGain` / `maxExpGain` | `long` | 成功时的经验区间 |
| `highQualityRate` | `double` | 上品概率 |
| `maxQualityRate` | `double` | 极品概率 |
| `qualityBonusRate` | `double` | 品质经验加成系数 |

`recipes` 建表语句（`DatabaseSchema.createRecipesTable`）里**没有** `high_quality_rate` / `max_quality_rate` / `quality_bonus_rate` 三列，它们由迁移补上：

```java
stmt.execute("ALTER TABLE recipes ADD COLUMN high_quality_rate DOUBLE DEFAULT 0");
stmt.execute("ALTER TABLE recipes ADD COLUMN max_quality_rate DOUBLE DEFAULT 0");
stmt.execute("ALTER TABLE recipes ADD COLUMN quality_bonus_rate DOUBLE DEFAULT 0");
```

## 配方来源

`insertDefaultRecipes()` 用一条 20 占位的 `INSERT INTO recipes (...)` 批量写入内置配方数组 `defaults`，共 **33 条**：

| 分类 | 条数 | 配方名 |
| --- | --- | --- |
| `PILL` 丹药 | 17 | 炼制回血丹、炼制回蓝丹、炼制培元丹、炼制力量丹药、炼制净化丹、炼制复活丹、炼制洗髓丹、炼制经验丹、炼制反弹丹、炼制渡劫丹、炼制超级回血丹、炼制超级回蓝丹、炼制仙丹、炼制灵力大增丹、炼制至尊力量丹、炼制乾坤造化丹、炼制天元丹 |
| `EQUIPMENT` 装备 | 7 | 锻造灵剑、炼制护体玉符、锻造龙剑、锻造凤甲、炼制麒麟护符、炼制星辰法袍、锻造空间戒指 |
| `CONSUMABLE` 消耗品 | 5 | 炼制灵石袋、炼制加速符、炼制强化石、炼制保护符、炼制传送符 |
| `SEED` 种子 | 4 | 炼制灵草种子、炼制千年人参种子、炼制暗冰草种子、炼制火焰藤种子 |

幂等逻辑是**按名称检查后跳过**，因此旧库升级时会自动补齐新配方、不会重复插入：

```java
String recipeName = (String) row[0];
String checkSql = "SELECT COUNT(*) FROM recipes WHERE name = ?";
...
if (rs.next() && rs.getInt(1) > 0) { continue; }
```

紧接着还有一段**历史配方改名**（仅当新名未被占用时重命名，保留原配方 ID）：

```java
String[][] legacyRename = {
    {"炼制聚灵石", "炼制灵石袋"},
    {"炼制九转金丹", "炼制乾坤造化丹"},
    {"炼制混沌仙丹", "炼制天元丹"},
};
```

最后打日志：`已初始化 33 种默认配方`（`LOG.info("已初始化 " + defaults.length + " 种默认配方")`）。

::: tip 配方 ID 是自增的，不要硬编码
`recipes.id` 由数据库自增，**不保证等于下表序号**（历史库更可能错位）。游戏内请用 `/合成 列表` 读取真实 ID，再用 `/合成 制造 <ID>`。REST 侧用 `GET /game/crafting/recipes` 拿到 `id` 字段。
:::

## 指令

```java
super(new String[]{"合成", "炼制", "craft"}, "合成系统 — 查看配方/合成物品",
        "/合成 [列表|配方 <分类>|制造 <配方ID>]", "实用功能", null);
setModule("crafting");

registerSub(new String[]{"列表", "list"}, this::listRecipes);
registerSub(new String[]{"配方", "recipes"}, this::listRecipesWithCategory);
registerSub(new String[]{"制造", "craft", "make"}, this::doCraft);
registerSub(new String[]{"熟练度", "proficiency"}, this::showProficiency);
```

| 用法 | 说明 |
| --- | --- |
| `/合成` | 概览：可用配方总数 + 分类说明 |
| `/合成 列表` | 全量配方：ID、分类、成功率、产物、材料、费用、需境界、上品/极品概率 |
| `/合成 配方 <分类>` | 按 `PILL` / `EQUIPMENT` / `CONSUMABLE` / `SEED` 过滤，输出 ID、名称、成功率、费用 |
| `/合成 制造 <配方ID>` | 执行制造 |
| `/合成 熟练度` | 熟练度等级、累计成功次数、距下一级、成功率加成 |

REST 路由（`CraftCommand.addRoute`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `crafting/recipes` | 支持 `?category=PILL` 过滤；返回 `id`、`name`、`description`、`category`、`requiredRealm`、`resultItemKey`、`resultQuantity`、`material1..3Key/Count`、`costGold`、`costSpiritStones`、`successRate` |
| `POST` | `crafting/craft` | Body `{"recipeId": 1}`；返回 `code`、`success`、`message`、`craftSuccess`、`expGained`、`itemGained`、`itemQuantity` |

## 制造结算流程

`CraftingService.craft(playerId, recipeId)`：

1. `getRecipeById` → 不存在返回「配方不存在」；
2. 取玩家 → 不存在返回「角色不存在」；
3. **境界校验**：`player.getRealm() < recipe.getRequiredRealm()` → 「境界不足，需要更高境界才能使用此配方」；
4. **材料校验**：逐个比对 `getRequiredMaterials(recipe)`，不足时返回「材料不足：需要 灵草 x3，拥有 1」；
5. **金币校验**：`player.getGold() < costGold` → 「金币不足，制造需要 N 金币」；
6. **灵石校验**：`itemService.getSpiritStoneCount(playerId)`（下品等值）`< costSpiritStones` → 「灵石不足，制造需要 N 灵石」；
7. 计算熟练度加成（见下节）；
8. 进事务：扣材料 → 扣金币 → 扣灵石 → 掷骰 → 结算产物与经验；
9. 事务外：若 `craftSuccess == true`，`incrementCraftCount(playerId)` 并把内存中的 `craftCount + 1`，随后 `TitleService.checkAndGrantTitles`（炼丹学徒 / 丹道尊者）。

### 成功率

```java
double effectiveRate = Math.min(0.95, recipe.getSuccessRate() + proficiencyBonus);
boolean success = random.nextDouble() < effectiveRate;
```

**综合成功率硬上限 95%**。基础成功率来自 `recipes.success_rate`。

### 合成熟练度

```java
/** 熟练度等级：由累计制造成功次数（craft_count，每次成功 +1）派生，每 20 次 +1 级，最高 10 级。 */
public static int proficiencyLevelFromCount(int craftCount) {
    return Math.min(10, 1 + craftCount / 20);
}

/** 熟练度成功率加成：每级 +0.5%（Lv1 为 0），封顶 +4.5%，统一封顶综合成功率 95%。 */
public static double proficiencySuccessBonus(int craftCount) {
    return (proficiencyLevelFromCount(craftCount) - 1) * 0.005;
}
```

| 累计成功次数 | 熟练度等级 | 成功率加成 |
| --- | --- | --- |
| 0 ~ 19 | Lv.1 | +0% |
| 20 ~ 39 | Lv.2 | +0.5% |
| 40 ~ 59 | Lv.3 | +1.0% |
| 60 ~ 79 | Lv.4 | +1.5% |
| 80 ~ 99 | Lv.5 | +2.0% |
| 100 ~ 119 | Lv.6 | +2.5% |
| 120 ~ 139 | Lv.7 | +3.0% |
| 140 ~ 159 | Lv.8 | +3.5% |
| 160 ~ 179 | Lv.9 | +4.0% |
| ≥ 180 | Lv.10（满） | +4.5% |

`/合成 熟练度` 的「距下一级」为 `level * 20 - craftCount`，满级时 `nextLevelAt = -1`。

### 品质判定

成功之后按 `determinePillQuality` 判定品质：

```java
double roll = random.nextDouble();
if (roll < recipe.getMaxQualityRate()) return Recipe.PillQuality.MAX;
if (roll < recipe.getMaxQualityRate() + recipe.getHighQualityRate()) return Recipe.PillQuality.HIGH;
return Recipe.PillQuality.NORMAL;
```

| 品质 | 概率区间 | 数量倍率 | 经验倍率 | 文案 |
| --- | --- | --- | --- | --- |
| `MAX` 极品 | `[0, maxQualityRate)` | ×3 | `1 + qualityBonusRate × 2` | 「（效果三倍）」 |
| `HIGH` 上品 | `[maxQualityRate, maxQualityRate + highQualityRate)` | ×2 | `1 + qualityBonusRate × 1` | 「（效果翻倍）」 |
| `NORMAL` 普通 | 其余 | ×1 | ×1 | 无后缀 |

产物数量与经验：

```java
int actualQuantity = recipe.getResultQuantity() * bonusMultiplier;
itemService.addItem(conn, playerId, recipe.getResultItemKey(), actualQuantity);

long expGain = recipe.getMinExpGain() + random.nextLong(recipe.getMaxExpGain() - recipe.getMinExpGain() + 1);
expGain = (long) (expGain * (1 + recipe.getQualityBonusRate() * (bonusMultiplier - 1)));
playerService.addExperience(conn, playerId, expGain);
```

::: warning 「品质」是数量倍率而不是独立物品
上品/极品**不会生成新的 item_key**，只是把产物数量乘 2 / 乘 3，并在提示文案里加「【上品】/【极品】」前缀与「（效果翻倍）/（效果三倍）」后缀。数据库里存的仍然是同一个 `result_item_key`。
:::

### 失败惩罚

```java
} else {
    long pityExp = recipe.getMinExpGain() / 3;
    playerService.addExperience(conn, playerId, pityExp);
    txResult.put("success", true);
    txResult.put("message", "制造失败...材料已消耗，但参悟中获得了 " + pityExp + " 点经验");
    txResult.put("craftSuccess", false);
}
```

| 项 | 结果 |
| --- | --- |
| 材料 | **全部消耗**（在掷骰之前就已扣除） |
| 金币 / 灵石 | **全部消耗** |
| 产物 | 无 |
| 补偿经验 | `minExpGain / 3`（整数除法） |
| `craft_count` | **不增加**（只有 `craftSuccess == true` 才 `incrementCraftCount`） |
| 返回 | `success = true`、`craftSuccess = false` |

::: warning 失败也返回 `success = true`
`success` 表示「事务正常完成」，`craftSuccess` 才表示「炼制成功」。只有异常（材料扣除失败、灵石扣除失败等）才会让 `success = false` 且 `message` 以「制造失败: 」开头。
:::

## 配方表

下表按源码 `defaults` 数组的**插入顺序**编号（序号 ≠ 数据库 `id`）。材料列中 `—` 表示该材料位为 `null`。

**通用列**：境界为 `required_realm`；成功率为 `success_rate`；经验为 `min_exp_gain ~ max_exp_gain`；「上品/极品」为 `high_quality_rate` / `max_quality_rate`；「品质加成」为 `quality_bonus_rate`。

### 丹药类（PILL，17 条）

| 序 | 配方 | 境界 | 产物 | 材料 | 金币 | 灵石 | 成功率 | 经验 | 上品/极品 | 品质加成 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 炼制回血丹 | 0 | 回血丹 ×2 | 灵草 ×3 | 50 | 10 | 85% | 20~60 | 10% / 2% | 0.2 |
| 2 | 炼制回蓝丹 | 0 | 回蓝丹 ×2 | 灵草 ×2、回灵丹 ×1 | 60 | 15 | 80% | 30~70 | 8% / 2% | 0.2 |
| 3 | 炼制培元丹 | 1 | 修炼丹 ×1 | 灵草 ×5、回血丹 ×2、回蓝丹 ×2 | 200 | 50 | 70% | 50~150 | 8% / 2% | 0.3 |
| 4 | 炼制力量丹药 | 2 | 神力丹 ×1 | 灵草 ×4、铁矿石 ×2、回灵丹 ×2 | 300 | 80 | 65% | 80~200 | 6% / 1.5% | 0.3 |
| 5 | 炼制净化丹 | 1 | 清心丹 ×1 | 灵草 ×3、冰晶 ×1 | 150 | 40 | 75% | 30~80 | 6% / 1.5% | 0.25 |
| 6 | 炼制复活丹 | 3 | 复活丹 ×1 | 凤凰羽毛 ×2、修炼丹 ×2、灵泉水 ×3 | 2000 | 800 | 30% | 150~400 | 3% / 0.5% | 0.5 |
| 7 | 炼制洗髓丹 | 2 | 洗髓丹 ×1 | 星沙 ×3、灵草 ×5、天火石 ×1 | 800 | 300 | 50% | 60~150 | 5% / 1% | 0.35 |
| 8 | 炼制经验丹 | 2 | 经验加倍丹 ×1 | 灵草 ×4、妖兽内丹 ×2、修炼丹 ×1 | 500 | 150 | 60% | 50~120 | 5% / 1% | 0.25 |
| 9 | 炼制反弹丹 | 1 | 反射丹 ×1 | 铁矿石 ×3、妖兽内丹 ×1、魔核 ×1 | 250 | 60 | 70% | 30~80 | 6% / 1.5% | 0.2 |
| 10 | 炼制渡劫丹 | 3 | 渡劫丹 ×1 | 天玉 ×1、灵泉水 ×3、修炼丹 ×1 | 1000 | 500 | 50% | 100~300 | 5% / 1% | 0.4 |
| 11 | 炼制超级回血丹 | 2 | 大回血丹 ×1 | 千年人参 ×2、灵草 ×3、回血丹 ×2 | 500 | 150 | 65% | 60~150 | 6% / 1.5% | 0.3 |
| 12 | 炼制超级回蓝丹 | 2 | 大回蓝丹 ×1 | 血灵芝 ×2、灵草 ×3、回蓝丹 ×2 | 500 | 150 | 65% | 60~150 | 6% / 1.5% | 0.3 |
| 13 | 炼制仙丹 | 5 | 仙丹 ×1 | 万年灵芝 ×1、天山雪莲 ×2、修炼丹 ×5 | 5000 | 2000 | 20% | 300~800 | 3% / 0.5% | 0.5 |
| 14 | 炼制灵力大增丹 | 3 | 灵力丹 ×1 | 暗冰草 ×3、月华 ×1、灵草 ×5 | 1000 | 300 | 50% | 80~200 | 5% / 1% | 0.35 |
| 15 | 炼制至尊力量丹 | 5 | 终极神力丹 ×1 | 龙心 ×1、日精 ×2、神力丹 ×3 | 10000 | 5000 | 15% | 200~500 | 2% / 0.3% | 0.5 |
| 16 | 炼制乾坤造化丹 | 6 | 乾坤造化丹 ×1 | 万年灵芝 ×2、龙血晶 ×3、天山雪莲 ×2 | 100000 | 50000 | 30% | 2000~5000 | 2% / 0.3% | 0.4 |
| 17 | 炼制天元丹 | 7 | 天元丹 ×1 | 麒麟血 ×2、龙心 ×2、五色神石 ×1 | 300000 | 150000 | 20% | 5000~10000 | 1.5% / 0.2% | 0.5 |

### 装备类（EQUIPMENT，7 条）

| 序 | 配方 | 境界 | 产物 | 材料 | 金币 | 灵石 | 成功率 | 经验 | 上品/极品 | 品质加成 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 18 | 锻造灵剑 | 1 | 灵剑 ×1 | 铁矿石 ×5、下品灵石 ×3 | 400 | 100 | 75% | 50~120 | 5% / 1% | 0.2 |
| 19 | 炼制护体玉符 | 2 | 护身玉 ×1 | 灵草 ×3、回血丹 ×2、铁矿石 ×2 | 600 | 150 | 70% | 60~150 | 5% / 1% | 0.2 |
| 20 | 锻造空间戒指 | 2 | 空间戒指 ×1 | 灵木 ×5、星沙 ×3、灵珠 ×2 | 800 | 200 | 60% | 60~150 | 4% / 1% | 0.2 |
| 21 | 炼制星辰法袍 | 3 | 星辰法袍 ×1 | 星沙 ×5、灵木 ×3、下品灵石 ×5 | 10000 | 2000 | 50% | 100~300 | 4% / 1% | 0.3 |
| 22 | 锻造龙剑 | 4 | 龙剑 ×1 | 龙鳞 ×5、天火石 ×3、下品灵石 ×5 | 20000 | 5000 | 40% | 200~500 | 3% / 0.5% | 0.4 |
| 23 | 锻造凤甲 | 4 | 凤凰铠甲 ×1 | 凤凰羽毛 ×5、冰晶 ×3、灵木 ×5 | 25000 | 6000 | 35% | 250~600 | 3% / 0.5% | 0.4 |
| 24 | 炼制麒麟护符 | 5 | 麒麟护符 ×1 | 麒麟血 ×3、龙鳞 ×2、凤凰羽毛 ×2 | 80000 | 20000 | 20% | 500~1000 | 2% / 0.3% | 0.5 |

::: tip 装备类配方也能出「上品/极品」
品质判定对 `category` 不做区分，`EQUIPMENT` 配方同样会走 `bonusMultiplier` 分支。这意味着锻造龙剑时 0.5% 概率直接产出 **3 把**龙剑。
:::

### 消耗品类（CONSUMABLE，5 条）

| 序 | 配方 | 境界 | 产物 | 材料 | 金币 | 灵石 | 成功率 | 经验 | 上品/极品 | 品质加成 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | 炼制灵石袋 | 1 | 灵石袋 ×1 | 下品灵石 ×5、铁矿石 ×3 | 100 | 0 | 90% | 10~40 | 3% / 0.5% | 0.1 |
| 26 | 炼制强化石 | 1 | 强化石 ×1 | 铁矿石 ×3、妖兽内丹 ×1 | 200 | 30 | 80% | 15~40 | 5% / 1% | 0.1 |
| 27 | 炼制传送符 | 1 | 传送符 ×1 | 灵草 ×3、星沙 ×1 | 200 | 50 | 85% | 20~50 | 3% / 0.5% | 0.1 |
| 28 | 炼制保护符 | 2 | 护符 ×1 | 灵泉水 ×2、回血丹 ×3、妖兽内丹 ×2 | 400 | 80 | 70% | 30~80 | 4% / 1% | 0.1 |
| 29 | 炼制加速符 | 2 | 神行符 ×1 | 灵草 ×4、回蓝丹 ×2、天元丹 ×1 | 500 | 120 | 65% | 40~100 | 4% / 1% | 0.15 |

::: warning 「炼制灵石袋」不产出灵石，且灵石袋只能换回 5 下品灵石
配方消耗 5 下品灵石 + 3 铁矿石 + 100 金币，产物 `spirit_stone_pouch` 使用后只返还 **5 下品灵石**（`CurrencyEffect.of(0, 5, 0)`）。源码注释明确这是防印钞设计：

```java
// 5 下品灵石等价回收：防止"聚灵石配方"5进50出 的灵石印钞漏洞
```
:::

### 种子类（SEED，4 条）

| 序 | 配方 | 境界 | 产物 | 材料 | 金币 | 灵石 | 成功率 | 经验 | 上品/极品 | 品质加成 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | 炼制灵草种子 | 0 | 灵草种子 ×5 | 灵草 ×2、强化石 ×1 | 50 | 10 | 95% | 5~20 | 2% / 0.5% | 0.1 |
| 31 | 炼制千年人参种子 | 1 | 千年人参种子 ×2 | 千年人参 ×1、灵珠 ×1 | 200 | 80 | 80% | 20~50 | 3% / 1% | 0.15 |
| 32 | 炼制暗冰草种子 | 1 | 暗冰草种子 ×3 | 暗冰草 ×2、冰晶 ×1 | 100 | 30 | 90% | 10~30 | 2% / 0.5% | 0.1 |
| 33 | 炼制火焰藤种子 | 1 | 火焰藤种子 ×3 | 火焰藤 ×2、天火石 ×1 | 100 | 30 | 90% | 10~30 | 2% / 0.5% | 0.1 |

## 材料与产物的 key 对照

配方表里的中文名对应以下 `fullKey`（前缀统一为 `mtxgdn:`）：

| 中文名 | key | 中文名 | key |
| --- | --- | --- | --- |
| 灵草 | `spirit_grass` | 铁矿石 | `iron_ore` |
| 灵木 | `spirit_wood` | 强化石 | `enhance_stone` |
| 妖兽内丹 | `beast_core` | 魔核 | `demon_core` |
| 冰晶 | `ice_crystal` | 天火石 | `heaven_fire_stone` |
| 星沙 | `star_sand` | 灵珠 | `spirit_pearl` |
| 天玉 | `heavenly_jade` | 灵泉水 | `spirit_spring_water` |
| 月华 | `moon_essence` | 日精 | `sun_essence` |
| 龙心 | `dragon_heart` | 龙鳞 | `dragon_scale` |
| 龙血晶 | `dragon_blood_crystal` | 凤凰羽毛 | `phoenix_feather` |
| 麒麟血 | `qilin_blood` | 五色神石 | `five_colored_divine_stone` |
| 万年灵芝 | `ten_thousand_year_lingzhi` | 千年人参 | `thousand_year_ginseng` |
| 血灵芝 | `blood_lingzhi` | 暗冰草 | `dark_ice_grass` |
| 火焰藤 | `fire_vine` | 天山雪莲 | `tianshan_snow_lotus` |
| 下品灵石 | `spirit_stone_low` | 回血丹 | `healing_pill` |
| 回蓝丹 | `mana_pill` | 回灵丹 | `spirit_recovery_pill` |
| 修炼丹 | `cultivation_elixir` | 神力丹 | `power_buff_pill` |
| 天元丹 | `heaven_pill` | 护身玉 | `guardian_jade` |
| 空间戒指 | `space_ring` | 星辰法袍 | `star_robes` |
| 灵剑 | `spirit_sword` | 龙剑 | `dragon_sword` |
| 凤凰铠甲 | `phoenix_armor` | 麒麟护符 | `qilin_amulet` |
| 灵石袋 | `spirit_stone_pouch` | 护符 | `protect_charm` |
| 神行符 | `speed_talisman` | 传送符 | `teleport_talisman` |
| 灵草种子 | `spirit_grass_seed` | 千年人参种子 | `thousand_year_ginseng_seed` |
| 暗冰草种子 | `dark_ice_grass_seed` | 火焰藤种子 | `fire_vine_seed` |

## 材料不足时的实际提示

`getRequiredMaterials` 会把 `null` / 空串 / `count <= 0` 的材料位过滤掉，所以三材料位实际是「1~3 种材料」：

```java
private Map<String, Integer> getRequiredMaterials(Recipe recipe) {
    Map<String, Integer> mats = new LinkedHashMap<>();
    if (recipe.getMaterial1Key() != null && !recipe.getMaterial1Key().isEmpty() && recipe.getMaterial1Count() > 0) {
        mats.put(recipe.getMaterial1Key(), recipe.getMaterial1Count());
    }
    ...
}
```

不足时的提示会把 key 翻译成中文名：

```java
result.put("message", "材料不足：需要 " + itemName + " x" + needed + "，拥有 " + has);
```

## 模块开关

合成系统受内置模块 `crafting` 门控，配置位于 `src/main/resources/plugins.yml`：

```yaml
  crafting: true               # 炼丹锻造系统（配方、炼制）
```

停用后 `/合成` 相关指令不再可用（`CraftCommand.setModule("crafting")`）。
