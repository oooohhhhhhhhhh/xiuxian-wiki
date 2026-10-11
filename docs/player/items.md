# 物品系统总览

物品系统的核心是「**Item 子类即物品定义**」：每个物品是一个 Java 类，构造时把自己的 key、类型、品质、堆叠上限、售价、可交易性、所需境界和效果列表交给 `Item` 基类，基类在构造末尾自动调用 `ItemRegistry.register(this)` 完成注册。

本页覆盖物品分类、品质、ID 命名规则、注册机制、背包容量与堆叠、使用与装备流程，并给出各分类的代表性物品表。**完整物品清单**（约 130 项）见游戏内 `/物品列表`，不在本页。

关键源码：

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/game/item/Item.java` | 物品基类，构造即注册 |
| `src/main/java/com/mtxgdn/game/item/ItemType.java` | 物品类型枚举（8 种） |
| `src/main/java/com/mtxgdn/game/item/ItemRarity.java` | 品质枚举（6 级） |
| `src/main/java/com/mtxgdn/game/item/ItemRegistry.java` | 全局注册表 |
| `src/main/java/com/mtxgdn/game/item/ItemScanner.java` | 启动期包扫描注册 |
| `src/main/java/data/mtxgdn/item/*.java` | 115 个物品类（其中 114 个注册为物品，`FormationItem` 是阵法基类） |
| `src/main/java/com/mtxgdn/game/service/ItemService.java` | 背包 / 装备 / 使用 / 灵石 |

## 物品分类

分类字段就是 `ItemType` 枚举：

```java
public enum ItemType {
    CONSUMABLE("消耗品"), EQUIPMENT("装备"), MATERIAL("材料"), SKILL_BOOK("功法秘籍"),
    TREASURE("法宝"), QUEST("任务物品"), CURRENCY("货币"), SEED("种子");
}
```

各枚举的含义：`CONSUMABLE` 消耗品（丹药、符箓、金袋，使用后消耗 1 个）、`EQUIPMENT` 装备（**该枚举在 `data/mtxgdn/item` 下没有被任何物品类使用**）、`MATERIAL` 材料（炼丹/锻造材料，部分「种子」类物品也被归入此类）、`SKILL_BOOK` 功法秘籍（使用后学习技能）、`TREASURE` 法宝（**实际的可穿戴装备**武器/防具/饰品与阵图都归在此类）、`QUEST` 任务物品（不可交易，`price = 0`）、`CURRENCY` 货币（四级灵石）、`SEED` 种子（农田种植用）。

::: warning `EQUIPMENT` 类型是空集，真正的装备在 `TREASURE`
`grep ItemType.EQUIPMENT` 在 `data/mtxgdn/item` 下无匹配：所有可穿戴物品（灵剑、玉甲、麒麟护符、空间戒指、阵图）都声明为 `ItemType.TREASURE`。`EquipmentFixService` 里 `item.getType() == ItemType.EQUIPMENT` 的判断因此恒为假。
:::

## 品质等级

```java
public enum ItemRarity {
    COMMON("凡品", 1), UNCOMMON("良品", 2), RARE("珍品", 3),
    EPIC("仙品", 4), LEGENDARY("神品", 5), MYTHIC("圣品", 6);
}
```

| 枚举 | 显示名 | tier | 枚举 | 显示名 | tier |
| --- | --- | --- | --- | --- | --- |
| `COMMON` | 凡品 | 1 | `EPIC` | 仙品 | 4 |
| `UNCOMMON` | 良品 | 2 | `LEGENDARY` | 神品 | 5 |
| `RARE` | 珍品 | 3 | `MYTHIC` | 圣品 | 6 |

品质目前**只用于展示**（`/物品列表`、`ItemMapCommand` 输出）与 `FormationItem` 的阵图定价，不影响任何战斗数值或掉率。可用 `ItemRegistry.getByRarity(rarity)` 按品质查询。

## 物品 ID 命名规则

`Item` 构造函数的第一个参数是 `namespace`，第二个是 `key`，二者拼成 `fullKey`：

```java
protected Item(String namespace, String key, ItemType type, ItemRarity rarity,
               int maxStack, int price, boolean tradeable, int requiredRealm,
               ItemEffect... effects) {
    this.fullKey = namespace + ":" + key;
    this.nameKey = "item." + key + ".name";
    this.descKey = "item." + key + ".desc";
    ...
}
```

| 字段 | 规则 | 示例 |
| --- | --- | --- |
| `fullKey` | `<namespace>:<key>` | `mtxgdn:healing_pill` |
| `namespace` | 命名空间，内置物品统一为 `mtxgdn` | `mtxgdn` |
| `key` | 蛇形小写英文，全局唯一 | `spirit_stone_low` |
| `nameKey` / `descKey` | `item.<key>.name` / `item.<key>.desc` | `item.healing_pill.name` |

中文名与描述不在 Java 里，而在 `src/main/java/data/mtxgdn/lang/zh_cn.json`：

```json
"item.healing_pill.name": "回血丹",
"item.healing_pill.desc": "服用后可恢复50点生命值",
```

`Item.getName()` / `getDescription()` 通过 `LangManager.get(nameKey / descKey)` 取翻译。

### 输入的三种写法

| 输入形式 | 解析路径 | 示例 |
| --- | --- | --- |
| 完整 key | `items.get(input)` 精确命中 | `mtxgdn:healing_pill` |
| 短 key（无命名空间） | `findByTranslatedName` 用 `nameKey` 子串匹配 | `healing_pill` |
| 中文名 | `findByTranslatedName` 先子串匹配、再全等匹配 | `回血丹` |

::: tip 中文名是「包含」匹配，不是全等
第一轮用 `translatedName.toLowerCase().contains(lower)`，因此 `/使用 丹` 会命中第一个名字含「丹」的物品；第二轮才做全等匹配。**歧义时命中注册顺序里最靠前的那个**。
:::

## Item 字段一览

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `fullKey` | `String` | 全局唯一 ID |
| `type` / `rarity` | 枚举 | 分类 / 品质 |
| `effects` | `List<ItemEffect>` | 效果列表，构造后不可变（`Collections.unmodifiableList`） |
| `maxStack` | `int` | 堆叠上限（**声明值，未被 `ItemService` 校验**） |
| `price` | `int` | 基础价值，用于回收（30%）与能量转化 |
| `tradeable` | `boolean` | 是否可交易/可回收 |
| `requiredRealm` | `int` | 使用所需境界 |

::: warning `maxStack` 目前没有强制生效
全仓库只有 `Item.java` 声明并暴露 `getMaxStack()`，没有任何服务在入包时按它拆格。`ItemService` 的容量判断是按**背包格子数（不同 `item_key` 行数）**而不是按堆叠上限。
:::

## 注册机制

**路径一：构造即注册。** `Item` 构造函数最后一行就是 `ItemRegistry.register(this)`，重复 key 会打警告并覆盖：

```java
public static void register(Item item) {
    String fullKey = item.getFullKey();
    if (items.containsKey(fullKey)) {
        Item old = items.get(fullKey);
        LOG.warn("物品覆盖: " + fullKey + " (" + old + " -> " + item + ")");
    }
    items.put(fullKey, item);
}
```

**路径二：启动期包扫描。** `Main.java` 在启动流程中调用 `ItemScanner.scanAndRegister()`：

| 步骤 | 规则 |
| --- | --- |
| 目标包 | 常量 `ITEM_PACKAGE = "data.mtxgdn.item"` |
| 类发现 | 先遍历 classloader 资源（`file:` 目录 / `jar:` 包），都为空时回退 `user.dir + /target/classes/data/mtxgdn/item` |
| 过滤 | 跳过 `$` 内部类、非 `Item` 子类、`Item` 基类本身、抽象类、非 `public` 类 |
| 实例化 | `clazz.getDeclaredConstructor().newInstance()`，**必须有 public 无参构造** |
| 结果 | `ScanResult{registered, skipped, failed}`，`toString()` 输出「注册 N 个, 跳过 N 个, 失败 N 个」 |

因此**新增一个物品只需两步**：在 `data.mtxgdn.item` 包下新建 `extends Item` 的 public 类并写无参构造 `super(...)`；再在 `zh_cn.json` 补 `item.<key>.name` 与 `item.<key>.desc`。无需改动任何注册表。

::: details 插件如何注册物品
`PluginContext` 提供 `registerItem` / `unregisterItem` 与 `registerItemEnergy(itemKey, energyValue)`。`ItemRegistry.unregister(item)` 按 `fullKey` 移除。插件注册的能量值即使物品尚未注册也会被 `EnergyService` 记下，等物品注册后生效。
:::

## 背包容量与堆叠

```java
private static final int BASE_CAPACITY = AppConfig.getInt("inventory.base_capacity", 30);
private static final int CAPACITY_PER_LEVEL = AppConfig.getInt("inventory.capacity_per_level", 5);

public int getInventoryCapacity(long playerId) {
    Player player = playerService.getPlayerById(playerId);
    int level = player != null ? player.getLevel() : 1;
    int baseCapacity = BASE_CAPACITY + (level - 1) * CAPACITY_PER_LEVEL;
    return baseCapacity + calculateCapacityBonus(playerId);
}
```

配置默认值写在 `src/main/resources/application.yml` 的 `inventory.base_capacity: 30`（初始背包格子数）与 `inventory.capacity_per_level: 5`（每升一级增加的背包格子数）。

| 容量来源 | 公式 / 数值 |
| --- | --- |
| 基础 | `30` 格 |
| 等级 | `+5 × (level - 1)` 格 |
| 已装备法宝 | 累加所有 `InventoryCapacityEffect.getCapacityBonus()`（空间戒指 +20） |
| 洞府存储 | `Cave.getStorageBonusForLevel(level) = level × 10` 格（上限 10 级 → +100） |

已占格数：`SELECT COUNT(*) FROM players_items WHERE player_id = ? AND quantity > 0`。背包满的判定是 `getInventoryUsedSlots() >= getInventoryCapacity()`，并且**只在「该 item_key 当前数量为 0」时才拦截**——已有物品继续累加不会报「背包已满」：

```java
private void checkCapacity(long playerId, String itemKey) {
    if (getItemCount(playerId, itemKey) == 0 && isInventoryFull(playerId)) {
        throw new RuntimeException("背包已满！当前容量: " + getInventoryCapacity(playerId) + " 格，请先清理背包或提升等级扩容");
    }
}
```

数据表 `players_items`（`DatabaseSchema.createPlayersItemsTable`）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 自增 |
| `player_id` | `BIGINT NOT NULL` | 外键 → `players(id)` ON DELETE CASCADE |
| `item_key` | `VARCHAR(128) NOT NULL` | `fullKey` |
| `quantity` | `BIGINT NOT NULL DEFAULT 1` | 数量 |
| `created_at` / `updated_at` | 时间戳 | |

唯一约束 `UNIQUE (player_id, item_key)`，所以一个物品在背包里**只有一行**，增删都走 upsert / 条件 UPDATE。

### 增删的原子性

| 方法 | 语义 |
| --- | --- |
| `addItem` | upsert：SQLite 用 `ON CONFLICT(player_id,item_key) DO UPDATE SET quantity = quantity + excluded.quantity`；MySQL 用 `ON DUPLICATE KEY UPDATE` |
| `removeItem` | 单条 `UPDATE ... WHERE player_id=? AND item_key=? AND quantity>=?`，检查与扣除一体，消除 TOCTOU |
| `removeItem` 成功后 | 附带 `DELETE ... WHERE quantity <= 0` 清理零行 |
| `addItems` / `removeItems` | 单事务批量；`removeItems` 先全量校验再逐个扣除，任一不足则整体回滚 |

公开的 `addItem(playerId, ...)` 会做参数校验（`quantity <= 0` 抛 `IllegalArgumentException`；key 未注册时若不含 `:` 会尝试补 `mtxgdn:` 前缀，仍不存在则抛「物品不存在」）并调用 `checkCapacity`；事务内使用的 `addItem(conn, ...)` 重载**不做容量校验**。

## 使用物品

`ItemService.useItem(playerId, itemKey)` 的流程：

1. `ItemRegistry.resolve` 解析物品；
2. **阵图特判**：若 `FormationService.treasureKeyToFormationKey(fullKey) != null`，转交 `FormationService.placeFormationFromTreasure`——使用 1 张阵图即布置对应 1 级阵法，不另扣灵石；
3. 事务内 `SELECT quantity ... FOR UPDATE` 锁行，数量 < 1 返回「背包中没有该物品」；
4. 先执行全部 `ItemEffect`（`BuffEffect` 走带 `Connection` 的重载），**再**扣除 1 个；
5. 触发插件事件 `PluginEvent.Type.ITEM_USED`，携带 `playerId` 与 `itemKey`。

效果执行失败会整体回滚，物品不丢。返回 `Map` 含 `success` / `message` / `item` / `effects`。

`com.mtxgdn.game.item` 下已实现的 `ItemEffect` 子类（共 15 个）：`HealEffect`（恢复 HP/MP，`hp(n)`/`mp(n)`/`of(hp,mp)`）、`ExpEffect`（直接加经验）、`ExpMultiplierEffect`（经验倍率 Buff，内存态）、`ReflectionBuffEffect`（伤害反弹 Buff，内存态）、`BuffEffect`（四维属性加成，`durationSeconds > 0` 写 `player_buffs`、`= 0` 直接改 `players` 永久属性）、`CurrencyEffect`（发放金币/灵石）、`InventoryCapacityEffect`（背包容量，装备时生效）、`AttributeResetEffect`（清空全部 Buff + 回满 HP/MP）、`PurificationEffect`（清除重伤并回血）、`RebirthEffect`（原地复活）、`TribulationPillEffect`（提示性效果，真实加成在 `RealmService` 突破流程中）、`TeleportEffect`（传送到太虚城 `MAIN_CITY_LOCATION_ID = 4`）、`LearnSkillEffect`（使用秘籍学习技能）、`EmptyEffect`（占位无效果）、`DebuffCleanEffect`（仅返回文案，**没有任何物品引用它**）。

## 分类代表性物品表

每个分类抽样若干项。价格列是 `Item.price`，堆叠列是 `Item.maxStack` 的声明值。

### 消耗品（CONSUMABLE）

| 名称 | key | 品质 | 价格 | 堆叠 | 用途 / 效果 |
| --- | --- | --- | --- | --- | --- |
| 回血丹 | `mtxgdn:healing_pill` | 凡品 | 10 | 99 | 恢复 50 生命 |
| 回蓝丹 | `mtxgdn:mana_pill` | 凡品 | 10 | 99 | 恢复 30 法力 |
| 回灵丹 | `mtxgdn:spirit_recovery_pill` | 良品 | 30 | 50 | 恢复 100 生命 + 80 法力 |
| 修炼丹 | `mtxgdn:cultivation_elixir` | 珍品 | 100 | 20 | 经验 +500 |
| 天元丹 | `mtxgdn:heaven_pill` | 神品 | 10000 | 5 | 经验 +10000 |
| 仙丹 | `mtxgdn:immortal_pill` | 神品 | 500 | 99 | 恢复 500 生命 + 500 法力 |
| 神力丹 | `mtxgdn:power_buff_pill` | 良品 | 50 | 30 | 攻击 +30 / 防御 +20，持续 60 秒 |
| 灵力丹 | `mtxgdn:spirit_boost_pill` | 珍品 | 80 | 99 | 灵力 +50，持续 300 秒 |
| 终极神力丹 | `mtxgdn:ultimate_power_pill` | 仙品 | 200 | 99 | 攻+50 / 防+50 / 速+20 / 灵+30，600 秒 |
| 经验加倍丹 | `mtxgdn:exp_multiplier_pill` | 珍品 | 300 | 10 | 经验获取 +50%，300 秒 |
| 反射丹 | `mtxgdn:damage_reflection_pill` | 良品 | 120 | 20 | 反弹 30% 伤害，120 秒 |
| 神行符 | `mtxgdn:speed_talisman` | 良品 | 40 | 20 | 速度 +25 / 灵力 +10，120 秒 |
| 洗髓丹 | `mtxgdn:attribute_reset_pill` | 珍品 | 500 | 10 | 清除全部 Buff 并回满 HP/MP |
| 复活丹 | `mtxgdn:rebirth_pill` | 仙品 | 5000 | 5 | 原地复活，生命与法力全满 |
| 渡劫丹 | `mtxgdn:tribulation_pill` | 仙品 | 500 | 5 | 突破大境界时自动消耗，成功率 +10% |
| 护符 | `mtxgdn:protect_charm` | 珍品 | 2000 | 10 | 强化碎裂时自动消耗 1 张，装备免碎 |
| 金袋 | `mtxgdn:gold_bag` | 凡品 | 0 | 999 | 获得 100 金币（不可交易） |
| 灵石袋 | `mtxgdn:spirit_stone_pouch` | 凡品 | 0 | 999 | 获得 5 下品灵石（不可交易） |
| 乾坤造化丹 | `mtxgdn:qiankun_zaohua_dan` | 神品 | 0 | 99 | 当前为 `EmptyEffect`，无实际效果 |

### 材料（MATERIAL）

| 名称 | key | 品质 | 价格 | 堆叠 | 用途 |
| --- | --- | --- | --- | --- | --- |
| 灵草 | `mtxgdn:spirit_grass` | 凡品 | 5 | 999 | 炼丹基础材料 |
| 铁矿石 | `mtxgdn:iron_ore` | 凡品 | 8 | 999 | 锻造基础材料 |
| 强化石 | `mtxgdn:enhance_stone` | 凡品 | 50 | 9999 | 强化装备消耗品 |
| 妖兽内丹 | `mtxgdn:beast_core` | 良品 | 60 | 999 | 中阶丹药材料 |
| 天火石 | `mtxgdn:heaven_fire_stone` | 珍品 | 200 | 99 | 洗髓丹 / 龙剑材料 |
| 星沙 | `mtxgdn:star_sand` | 仙品 | 500 | 50 | 洗髓丹 / 星辰法袍材料 |
| 龙鳞 | `mtxgdn:dragon_scale` | 神品 | 2000 | 20 | 锻造龙剑 / 麒麟护符 |
| 凤凰羽毛 | `mtxgdn:phoenix_feather` | 神品 | 2000 | 20 | 锻造凤甲 / 复活丹 / 麒麟护符 |
| 麒麟血 | `mtxgdn:qilin_blood` | 圣品 | 10000 | 10 | 麒麟护符 / 天元丹材料 |

### 法宝 / 装备（TREASURE）

| 名称 | key | 品质 | 价格 | 所需境界 | 效果 |
| --- | --- | --- | --- | --- | --- |
| 灵剑 | `mtxgdn:spirit_sword` | 珍品 | 3000 | 2 | 攻 +50 / 速 +10 / 灵 +20 |
| 空间戒指 | `mtxgdn:space_ring` | 珍品 | 5000 | 2 | 背包容量 +20 格 |
| 护身玉 | `mtxgdn:guardian_jade` | 仙品 | 8000 | 3 | 防 +100 / 灵 +50 |
| 星辰法袍 | `mtxgdn:star_robes` | 仙品 | 25000 | 3 | 攻 +40 / 防 +150 / 速 +40 / 灵 +120 |
| 玉甲 | `mtxgdn:jade_armor` | 神品 | 30000 | 4 | 攻 +80 / 防 +200 / 速 +30 / 灵 +100 |
| 龙剑 | `mtxgdn:dragon_sword` | 神品 | 50000 | 4 | 攻 +200 / 防 +50 / 速 +50 / 灵 +80 |
| 麒麟护符 | `mtxgdn:qilin_amulet` | 圣品 | 200000 | 5 | 攻 +150 / 防 +200 / 速 +100 / 灵 +200 |
| 聚灵阵图 | `mtxgdn:spirit_gathering_formation` | 珍品 | 300 | 1 | 使用即布置 1 级聚灵阵 |
| 护山大阵图 | `mtxgdn:mountain_protection_formation` | 仙品 | 800 | 1 | 使用即布置 1 级护山阵 |

阵图价格由 `FormationItem.getPrice(rarity, level)` 生成：`base(rarity) × level`，其中 `COMMON 50 / UNCOMMON 150 / RARE 300 / EPIC 800 / LEGENDARY 2000 / MYTHIC 5000`。

### 功法秘籍（SKILL_BOOK）

| 名称 | key | 品质 | 价格 | 效果 |
| --- | --- | --- | --- | --- |
| 基础剑诀 | `mtxgdn:basic_sword_manual` | 凡品 | 100 | 学习技能 ID 9 |
| 火龙术 | `mtxgdn:fire_dragon_art` | 仙品 | 5000 | 学习技能 ID 3 |
| 天雷符 | `mtxgdn:thunder_bolt_talisman` | 神品 | 20000 | 学习技能 ID 4 |

::: tip 「天雷符」是秘籍不是符箓
`ThunderBoltTalisman` 的 `ItemType` 是 `SKILL_BOOK`，效果为 `LearnSkillEffect.of(4)`，并不参与战斗道具逻辑。
:::

### 任务物品（QUEST）

| 名称 | key | 品质 | 堆叠 | 所需境界 | 可交易 |
| --- | --- | --- | --- | --- | --- |
| 任务信 | `mtxgdn:quest_letter` | 凡品 | 1 | 0 | 否 |
| 残卷 | `mtxgdn:fragment_scroll` | 良品 | 9 | 1 | 否 |
| 神秘令牌 | `mtxgdn:mystery_token` | 珍品 | 1 | 2 | 否 |
| 任务卷轴 | `mtxgdn:quest_scroll` | 仙品 | 1 | 3 | 否 |

### 货币（CURRENCY）

| 名称 | key | 品质 | 价格 | 堆叠 |
| --- | --- | --- | --- | --- |
| 下品灵石 | `mtxgdn:spirit_stone_low` | 凡品 | 1 | 999999 |
| 中品灵石 | `mtxgdn:spirit_stone_mid` | 良品 | 1000 | 999999 |
| 上品灵石 | `mtxgdn:spirit_stone_high` | 珍品 | 1000000 | 999999 |
| 极品灵石 | `mtxgdn:spirit_stone_supreme` | 仙品 | 1000000000 | 999999 |

汇率与持有上限见「经济系统」页的 `CurrencyEffect` 常量表。

### 种子（SEED）

| 名称 | key | 品质 | 价格 | 成熟时间（商店文案） |
| --- | --- | --- | --- | --- |
| 灵草种子 | `mtxgdn:spirit_grass_seed` | 凡品 | 10 | 60 秒 |
| 暗冰草种子 | `mtxgdn:dark_ice_grass_seed` | 良品 | 20 | 90 秒 |
| 火焰藤种子 | `mtxgdn:fire_vine_seed` | 良品 | 20 | 120 秒 |
| 千年人参种子 | `mtxgdn:thousand_year_ginseng_seed` | 珍品 | 30 | 180 秒 |
| 幽冥花种子 | `mtxgdn:nether_flower_seed` | 珍品 | 50 | 240 秒 |
| 血灵芝种子 | `mtxgdn:blood_lingzhi_seed` | 珍品 | 80 | 200 秒 |
| 星草种子 | `mtxgdn:star_grass_seed` | 仙品 | 100 | 300 秒 |
| 天山雪莲种子 | `mtxgdn:tianshan_snow_lotus_seed` | 神品 | 200 | 420 秒 |

::: warning 部分「种子」的 ItemType 是 MATERIAL
`PeachSeed`（蟠桃种子）、`GinsengFruitSeed`（人参果种子）、`DragonFruitSeed`（火龙果种子）、`ImmortalDateSeed`（仙枣种子）、`NineTurnGrassSeed`（九转还魂草种子）、`HeShouWuSeed`（何首乌种子）、`WanLingGrassSeed`（万灵草种子）、`PurpleRiverCartSeed`（紫河车种子）在源码里都声明为 `ItemType.MATERIAL`，只有声明为 `ItemType.SEED` 的那一批属于种子分类。
:::

## 指令速查

| 指令 | 别名 | 作用 | 权限 |
| --- | --- | --- | --- |
| `/背包` | `backpack` | 查看背包（`容量: 已用/上限` + 物品与描述） | `game.inventory.view` |
| `/使用 <物品>` | `itemuse` | 使用物品 | `game.item.use` |
| `/装备 <物品> <部位>` / `/卸下 <部位>` | `equip` / `unequip` | 穿戴 / 卸下装备 | `game.equipment.equip` |
| `/已装备` | `equipped` | 查看三栏位当前装备 | `game.inventory.view` |
| `/强化 <栏位>` | `enhance` | 强化已装备物品 | `game.equipment.enhance` |
| `/物品列表` | `itemmap` | 按类型分组的「中文名 ↔ key」映射表 | `game.player.info` |
| `/物品列表 [页数]` | `items` / `allitems` | 管理端分页全量列表（每页 20 条） | `admin.status` |
| `/回收 <物品> [数量]` | `recycle` | 回收为灵石（价格的 30%） | — |
| `/商店 [编号]` | `shop` | 灵石商店 | — |
| `/合成 制造 <配方ID>` | `craft` / `炼制` | 炼丹锻造 | — |
| `/转化 <物品> [数量]` | `exchange` / `convert` | 物品 → 能量（实验性） | — |
| `/发放 <玩家> <key> [数量]` | `give` | 管理端发放物品 | `admin.items.give` |

REST 侧对应 `GameResource` 的 `GET /game/equipment`、`POST /game/equipment/equip`、`POST /game/equipment/unequip`、`POST /game/equipment/enhance`，以及各指令自带的 `addRoute` 路由。

## 源码与文档不一致之处

以下数值**以源码为准**，`zh_cn.json` 的文案与代码不一致：

| 物品 | 文案（`zh_cn.json`） | 源码实际 |
| --- | --- | --- |
| 灵石袋 | 「打开可获得50灵石」 | `CurrencyEffect.of(0, 5, 0)` → 5 下品灵石 |
| 渡劫丹 | 「服用后渡劫成功率+20%」 | `RealmService` 中 `pillBonus = 10.0` → +10% |
| 护符 | 「使用后防御力+50，持续5分钟」 | 效果为 `EmptyEffect.INSTANCE`，仅作强化保底道具 |
| 传送符 | 「传送到任意已探索的秘境」 | `TeleportEffect` 固定传送到 `MAIN_CITY_LOCATION_ID = 4`（太虚城） |
| 洗髓丹 | 「重新分配属性点」 | 项目无属性点系统，实现为清空 Buff + 回满 HP/MP |
| 乾坤造化丹 | — | `ItemRarity.LEGENDARY` 但效果为 `EmptyEffect`，`price = 0`、`tradeable = false` |
