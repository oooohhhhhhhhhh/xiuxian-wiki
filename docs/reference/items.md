# 物品图鉴

服务端共注册 **114 个物品**。物品**不是配置文件**，而是**编译在 jar 里的 Java 类** ——
每个物品一个类，继承 `Item`，在构造函数里调 `super(...)` 自动注册。

## 物品系统结构

```
src/main/java/data/mtxgdn/item/          ← 115 个 .java = 114 个物品 + 1 个抽象基类 FormationItem
src/main/java/com/mtxgdn/game/item/
    ├── Item.java                        ← 基类（构造函数自动注册）
    ├── ItemRegistry.java                ← 注册表
    ├── ItemType.java                    ← 8 种类型
    ├── ItemRarity.java                  ← 6 个品质
    ├── ItemEffect.java / EmptyEffect.java
    └── ...
src/main/java/data/mtxgdn/lang/zh_cn.json ← 名称与描述文案
```

### 基类

```java
public class SpiritStone extends Item {
    public SpiritStone() {
        super("mtxgdn",                    // 命名空间
              "spirit_stone_low",          // key
              ItemType.CURRENCY,           // 类型
              ItemRarity.COMMON,           // 品质
              999999,                      // 堆叠上限
              1,                           // 参考价
              true,                        // 可交易
              0,                           // 需求境界
              EmptyEffect.INSTANCE);       // 效果（可变参数）
    }
}
```

构造函数末尾会调用 `ItemRegistry.register(this)`，所以**新增物品只需建类**，
不用改任何注册代码。

::: warning 类必须被实例化才会注册
`ItemRegistry.register` 在构造函数里，所以物品类必须有人 `new` 它。
服务端启动时统一实例化 `data.mtxgdn.item` 包下的全部物品类。

同名 `fullKey` 会被**后注册的覆盖**，并打一条 `物品覆盖` 警告日志。
:::

### 完整键（fullKey）

```
mtxgdn:spirit_stone_low
└─────┘ └──────────────┘
命名空间        key
```

| 方法 | 返回 |
| --- | --- |
| `getFullKey()` | `mtxgdn:spirit_stone_low` |
| `getNamespace()` | `mtxgdn` |
| `getKey()` | `spirit_stone_low` |
| `getNameKey()` | `item.spirit_stone_low.name` |
| `getDescKey()` | `item.spirit_stone_low.desc` |

::: tip 文档里写 key 还是 fullKey？
- 配置、指令、REST 参数里：**两种都行**，`ItemRegistry.resolve()` 都认
- 数据库里：存 `fullKey`
- 本页表格：列的是 **key**（省略 `mtxgdn:` 前缀）
:::

### 名称与描述

名称和描述从语言文件读：

```java
public String getName()        { return LangManager.get(nameKey); }
public String getDescription() { return LangManager.get(descKey); }
```

语言文件：`src/main/java/data/mtxgdn/lang/zh_cn.json`，键格式
`item.<key>.name` / `item.<key>.desc`。

::: danger 新增物品必须补语言条目
忘了加 `item.<key>.name` 会导致物品在游戏里显示为**键名本身**（如 `item.my_thing.name`），
而不是中文名。
:::

### 解析物品

`ItemRegistry.resolve(input)` 支持两种写法：

1. **精确 key / fullKey** —— `spirit_stone_low` 或 `mtxgdn:spirit_stone_low`
2. **中文名模糊匹配** —— 先按 `contains` 匹配译名与键名，再按完全相等匹配译名

```java
Item item = ItemRegistry.resolve("灵石");        // 模糊
Item item = ItemRegistry.resolve("下品灵石");     // 译名
Item item = ItemRegistry.resolve("spirit_stone_low"); // key
```

| 方法 | 说明 |
| --- | --- |
| `get(fullKey)` | 精确查（不模糊） |
| `resolve(input)` | 精确 → 模糊 |
| `findByTranslatedName(name)` | 只按译名 |
| `getByType(type)` | 按类型过滤 |
| `getByRarity(rarity)` | 按品质过滤 |
| `getAll()` / `count()` / `contains(key)` | 遍历与统计 |
| `unregister(item)` / `clear()` | 卸载（插件/测试用） |

## 类型

`ItemType` 共 8 种：

| 枚举 | 显示名 | 本服物品数 |
| --- | --- | --- |
| `CONSUMABLE` | 消耗品 | 23 |
| `EQUIPMENT` | 装备 | **0** |
| `MATERIAL` | 材料 | 61 |
| `SKILL_BOOK` | 功法秘籍 | 3 |
| `TREASURE` | 法宝 | 11 |
| `QUEST` | 任务物品 | 4 |
| `CURRENCY` | 货币 | 4 |
| `SEED` | 种子 | 8 |
| | **合计** | **114** |

::: warning `EQUIPMENT` 类型目前没有物品
枚举里定义了「装备」，但 `data.mtxgdn.item` 下**没有任何** `ItemType.EQUIPMENT` 的物品。

玩家装备走的是**另一套体系**（`players_equipment` 表 + 装备服务），
不从 `ItemRegistry` 取。详见[装备与强化](/player/equipment)。
:::

## 品质

`ItemRarity` 共 6 档。枚举里确实定义了 `tier` 字段（`getTier()`），但**当前没有任何调用方**——全仓库检索 `getTier()` 命中的全是灵根的 `SpiritualRoot.getTier()`，与物品品质无关。

| 枚举 | 显示名 | tier | 物品数 |
| --- | --- | --- | --- |
| `COMMON` | 凡品 | 1 | 16 |
| `UNCOMMON` | 良品 | 2 | 21 |
| `RARE` | 珍品 | 3 | 29 |
| `EPIC` | 仙品 | 4 | 27 |
| `LEGENDARY` | 神品 | 5 | 17 |
| `MYTHIC` | 圣品 | 6 | 4 |

## 货币：四种灵石

货币类物品共 4 种，是**整个经济系统的基准**：

| key | 名称 | 品质 | 参考价（下品灵石） |
| --- | --- | --- | --- |
| `spirit_stone_low` | 下品灵石 | 凡品 | 1 |
| `spirit_stone_mid` | 中品灵石 | 良品 | 1,000 |
| `spirit_stone_high` | 上品灵石 | 珍品 | 1,000,000 |
| `spirit_stone_supreme` | 极品灵石 | 仙品 | 1,000,000,000 |

四种灵石堆叠上限都是 `999999`，都可交易。

::: tip 兑换比例是 1000:1
1 中品 = 1,000 下品；1 上品 = 1,000 中品 = 1,000,000 下品；
1 极品 = 1,000 上品 = 1,000,000,000 下品。

游戏内兑换走 **`/灵石兑换`**（别名 `石兑`）指令：

```
/灵石兑换 [数量] <从> <到>
示例: /灵石兑换 1 极品 下品
```
:::

::: warning 灵石兑换是精确 1000:1，没有损耗
`ItemService.exchangeSpiritStones` 用 `rate = getExchangeRate(from) / getExchangeRate(to)`、
`targetAmount = amount * rate` 计算，**不扣手续费、不产生损耗**。

但它也是**单向**的：`fromGrade <= toGrade` 时直接拒绝，提示「只能将高等级灵石兑换为低等级灵石」——
不能用它把小灵石合成大灵石。**向上合并是自动的**：按"下品等值"发放灵石时
`ItemService.compressSpiritStones` 会按阈值把超额部分折成更高面额
（见[经济系统](/player/economy#灵石面额-四档是-面额-不是-稀有度)）。

另外两条容易混淆的指令，**损耗在它们身上**：

| 指令 | 作用 | 损耗 |
| --- | --- | --- |
| `/货币兑换`（`币兑`） | 金币 ↔ 下品灵石 | 汇率不对称：10 金币 → 1 下品灵石；1 下品灵石 → 5 金币 |
| `/交换` | 物品 → 能量 | **20% 转化损耗**（只得原价 80%） |
:::

## 全部物品

### 货币（`CURRENCY`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `spirit_stone_high` | 上品灵石 | 珍品 | 999999 | 1,000,000 | ✅ | — |
| `spirit_stone_low` | 下品灵石 | 凡品 | 999999 | 1 | ✅ | — |
| `spirit_stone_mid` | 中品灵石 | 良品 | 999999 | 1,000 | ✅ | — |
| `spirit_stone_supreme` | 极品灵石 | 仙品 | 999999 | 1,000,000,000 | ✅ | — |

::: tip 「堆叠上限」和「灵石持有上限」是两回事
上表的 `999999` 是**物品表的堆叠上限**，对四档灵石都一样。
灵石真正的持有上限另有一组常量（`MAX_HOLD_PER_GRADE`：下品无限 / 中品 999,999 /
上品 9,999 / 极品 99），只在"显式发放某一档"时生效；按"下品等值"发放的路径
会自动向上压缩面额，不受这组上限约束。详见[经济系统](/player/economy#灵石面额-四档是-面额-不是-稀有度)。
:::

### 消耗品（`CONSUMABLE`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `attribute_reset_pill` | 洗髓丹 | 珍品 | 10 | 500 | ✅ | 2 |
| `cultivation_elixir` | 修炼丹 | 珍品 | 20 | 100 | ✅ | 1 |
| `damage_reflection_pill` | 反射丹 | 良品 | 20 | 120 | ✅ | 1 |
| `exp_multiplier_pill` | 经验加倍丹 | 珍品 | 10 | 300 | ✅ | 2 |
| `gold_bag` | 金袋 | 凡品 | 999 | 0 | ❌ | — |
| `healing_pill` | 回血丹 | 凡品 | 99 | 10 | ✅ | — |
| `heaven_pill` | 天元丹 | 神品 | 5 | 10,000 | ✅ | 4 |
| `immortal_pill` | 仙丹 | 神品 | 99 | 500 | ✅ | — |
| `mana_pill` | 回蓝丹 | 凡品 | 99 | 10 | ✅ | — |
| `power_buff_pill` | 神力丹 | 良品 | 30 | 50 | ✅ | 1 |
| `protect_charm` | 护符 | 珍品 | 10 | 2,000 | ✅ | 1 |
| `purification_pill` | 清心丹 | 良品 | 30 | 80 | ✅ | 1 |
| `qiankun_zaohua_dan` | 乾坤造化丹 | 神品 | 99 | 0 | ❌ | — |
| `rebirth_pill` | 复活丹 | 仙品 | 5 | 5,000 | ✅ | 3 |
| `speed_talisman` | 神行符 | 良品 | 20 | 40 | ✅ | 1 |
| `spirit_boost_pill` | 灵力丹 | 珍品 | 99 | 80 | ✅ | — |
| `spirit_recovery_pill` | 回灵丹 | 良品 | 50 | 30 | ✅ | — |
| `spirit_stone_pouch` | 灵石袋 | 凡品 | 999 | 0 | ❌ | — |
| `super_healing_pill` | 大回血丹 | 珍品 | 99 | 50 | ✅ | — |
| `super_mana_pill` | 大回蓝丹 | 珍品 | 99 | 50 | ✅ | — |
| `teleport_talisman` | 传送符 | 良品 | 20 | 100 | ✅ | 1 |
| `tribulation_pill` | 渡劫丹 | 仙品 | 5 | 500 | ✅ | 3 |
| `ultimate_power_pill` | 终极神力丹 | 仙品 | 99 | 200 | ✅ | — |

### 材料（`MATERIAL`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `beast_core` | 妖兽内丹 | 良品 | 999 | 60 | ✅ | 1 |
| `blood_jade_marrow` | 血玉髓 | 仙品 | 999 | 250 | ✅ | — |
| `blood_lingzhi` | 血灵芝 | 珍品 | 999 | 80 | ✅ | — |
| `dark_ice_grass` | 暗冰草 | 良品 | 999 | 30 | ✅ | — |
| `deep_sea_coral` | 深海珊瑚 | 仙品 | 999 | 150 | ✅ | — |
| `demon_core` | 魔核 | 良品 | 999 | 80 | ✅ | 1 |
| `dragon_blood_crystal` | 龙血晶 | 仙品 | 50 | 5,000 | ✅ | 3 |
| `dragon_bone` | 龙骨 | 仙品 | 999 | 300 | ✅ | — |
| `dragon_fruit` | 火龙果 | 珍品 | 1 | 250 | ✅ | 1 |
| `dragon_fruit_seed` | 火龙果种子 | 珍品 | 1 | 150 | ✅ | 1 |
| `dragon_heart` | 龙心 | 神品 | 999 | 1,000 | ✅ | — |
| `dragon_scale` | 龙鳞 | 神品 | 20 | 2,000 | ✅ | 4 |
| `enhance_stone` | 强化石 | 凡品 | 9999 | 50 | ✅ | — |
| `fire_vine` | 火焰藤 | 良品 | 999 | 35 | ✅ | — |
| `five_colored_divine_stone` | 五色神石 | 神品 | 999 | 500 | ✅ | — |
| `ghost_fire_essence` | 鬼火精华 | 珍品 | 999 | 100 | ✅ | — |
| `ginseng_fruit` | 人参果 | 神品 | 1 | 1,000 | ✅ | 1 |
| `ginseng_fruit_seed` | 人参果种子 | 神品 | 1 | 500 | ✅ | 1 |
| `gold_ore` | 金矿石 | 珍品 | 999 | 50 | ✅ | — |
| `he_shou_wu_seed` | 何首乌种子 | 珍品 | 1 | 180 | ✅ | 1 |
| `heaven_fire_stone` | 天火石 | 珍品 | 99 | 200 | ✅ | 2 |
| `heavenly_jade` | 天玉 | 仙品 | 99 | 5,000 | ✅ | 2 |
| `high_grade_fertilizer` | 高阶肥料 | 珍品 | 999 | 100 | ✅ | — |
| `ice_crystal` | 冰晶 | 珍品 | 99 | 180 | ✅ | 2 |
| `immortal_date` | 仙枣 | 仙品 | 1 | 500 | ✅ | 1 |
| `immortal_date_seed` | 仙枣种子 | 仙品 | 1 | 300 | ✅ | 1 |
| `iron_ore` | 铁矿石 | 凡品 | 999 | 8 | ✅ | — |
| `low_grade_fertilizer` | 低阶肥料 | 凡品 | 999 | 20 | ✅ | — |
| `mid_grade_fertilizer` | 中阶肥料 | 良品 | 999 | 50 | ✅ | — |
| `moon_essence` | 月华 | 仙品 | 999 | 350 | ✅ | — |
| `mythril_ore` | 秘银矿石 | 仙品 | 999 | 200 | ✅ | — |
| `nether_flower` | 幽冥花 | 珍品 | 999 | 30 | ✅ | — |
| `nine_turn_grass` | 九转还魂草 | 圣品 | 1 | 2,000 | ✅ | 1 |
| `nine_turn_grass_seed` | 九转还魂草种子 | 圣品 | 1 | 1,000 | ✅ | 1 |
| `peach` | 蟠桃 | 良品 | 1 | 80 | ✅ | 1 |
| `peach_seed` | 蟠桃种子 | 良品 | 1 | 50 | ✅ | 1 |
| `pesticide` | 杀虫剂 | 凡品 | 50 | 5 | ✅ | 10 |
| `phoenix_feather` | 凤凰羽毛 | 神品 | 20 | 2,000 | ✅ | 4 |
| `phoenix_gallbladder` | 凤凰胆 | 神品 | 999 | 800 | ✅ | — |
| `purple_river_cart` | 紫河车 | 仙品 | 1 | 700 | ✅ | 1 |
| `purple_river_cart_seed` | 紫河车种子 | 仙品 | 1 | 400 | ✅ | 1 |
| `qilin_blood` | 麒麟血 | 圣品 | 10 | 10,000 | ✅ | 5 |
| `qilin_horn` | 麒麟角 | 神品 | 999 | 600 | ✅ | — |
| `scripture_page` | 功法残页 | 良品 | 10 | 50 | ✅ | — |
| `silver_ore` | 银矿石 | 良品 | 999 | 20 | ✅ | — |
| `sky_silk` | 天蚕丝 | 仙品 | 999 | 200 | ✅ | — |
| `snake_venom` | 蛇毒 | 珍品 | 999 | 60 | ✅ | — |
| `spirit_grass` | 灵草 | 凡品 | 999 | 5 | ✅ | — |
| `spirit_pearl` | 灵珠 | 仙品 | 999 | 400 | ✅ | — |
| `spirit_spring_water` | 灵泉水 | 良品 | 999 | 30 | ✅ | — |
| `spirit_wood` | 灵木 | 凡品 | 999 | 15 | ✅ | — |
| `star_grass` | 星草 | 仙品 | 999 | 60 | ✅ | — |
| `star_sand` | 星沙 | 仙品 | 50 | 500 | ✅ | 3 |
| `sun_essence` | 日精 | 神品 | 999 | 800 | ✅ | — |
| `ten_thousand_year_lingzhi` | 万年灵芝 | 仙品 | 999 | 150 | ✅ | — |
| `thousand_year_ginseng` | 千年人参 | 珍品 | 999 | 50 | ✅ | — |
| `thousand_year_heshouwu` | 千年何首乌 | 珍品 | 999 | 80 | ✅ | — |
| `tianshan_snow_lotus` | 天山雪莲 | 仙品 | 999 | 200 | ✅ | — |
| `tiger_fang` | 虎牙 | 良品 | 999 | 40 | ✅ | — |
| `wan_ling_grass` | 万灵草 | 凡品 | 1 | 50 | ✅ | 1 |
| `wan_ling_grass_seed` | 万灵草种子 | 凡品 | 1 | 30 | ✅ | 1 |

### 种子（`SEED`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `blood_lingzhi_seed` | 血灵芝种子 | 珍品 | 999 | 80 | ✅ | — |
| `dark_ice_grass_seed` | 暗冰草种子 | 良品 | 999 | 20 | ✅ | — |
| `fire_vine_seed` | 火焰藤种子 | 良品 | 999 | 20 | ✅ | — |
| `nether_flower_seed` | 幽冥花种子 | 珍品 | 999 | 50 | ✅ | — |
| `spirit_grass_seed` | 灵草种子 | 凡品 | 999 | 10 | ✅ | — |
| `star_grass_seed` | 星草种子 | 仙品 | 999 | 100 | ✅ | — |
| `thousand_year_ginseng_seed` | 千年人参种子 | 珍品 | 999 | 30 | ✅ | — |
| `tianshan_snow_lotus_seed` | 天山雪莲种子 | 神品 | 999 | 200 | ✅ | — |

### 法宝（`TREASURE`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `dragon_sword` | 龙剑 | 神品 | 1 | 50,000 | ✅ | 4 |
| `guardian_jade` | 护身玉 | 仙品 | 1 | 8,000 | ✅ | 3 |
| `jade_armor` | 玉甲 | 神品 | 1 | 30,000 | ✅ | 4 |
| `mountain_protection_formation` | 护山阵 | 仙品 | 1 | 800 | ✅ | 1 |
| `phoenix_armor` | 凤凰铠甲 | 神品 | 1 | 60,000 | ✅ | 4 |
| `purification_formation` | 净化阵 | 珍品 | 1 | 300 | ✅ | 1 |
| `qilin_amulet` | 麒麟护符 | 圣品 | 1 | 200,000 | ✅ | 5 |
| `space_ring` | 空间戒指 | 珍品 | 1 | 5,000 | ✅ | 2 |
| `spirit_gathering_formation` | 聚灵阵 | 珍品 | 1 | 300 | ✅ | 1 |
| `spirit_sword` | 灵剑 | 珍品 | 1 | 3,000 | ✅ | 2 |
| `star_robes` | 星辰法袍 | 仙品 | 1 | 25,000 | ✅ | 3 |

### 功法秘籍（`SKILL_BOOK`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `basic_sword_manual` | 基础剑诀 | 凡品 | 1 | 100 | ✅ | — |
| `fire_dragon_art` | 火龙术 | 仙品 | 1 | 5,000 | ✅ | 3 |
| `thunder_bolt_talisman` | 天雷符 | 神品 | 1 | 20,000 | ✅ | 5 |

### 任务物品（`QUEST`）

| key | 名称 | 品质 | 堆叠上限 | 参考价 | 可交易 | 需求境界 |
| --- | --- | --- | --- | --- | --- | --- |
| `fragment_scroll` | 残卷 | 良品 | 9 | 0 | ❌ | 1 |
| `mystery_token` | 神秘令牌 | 珍品 | 1 | 0 | ❌ | 2 |
| `quest_letter` | 任务信 | 凡品 | 1 | 0 | ❌ | — |
| `quest_scroll` | 任务卷轴 | 仙品 | 1 | 0 | ❌ | 3 |

## 非交易物品

以下 7 个物品 `tradeable = false`，**不能上架坊市**：

| key | 名称 | 说明 |
| --- | --- | --- |
| `fragment_scroll` | 残卷 | 任务/收集品 |
| `gold_bag` | 金袋 | 开袋得灵石 |
| `mystery_token` | 神秘令牌 | 任务/兑换 |
| `qiankun_zaohua_dan` | 乾坤造化丹 | 灵根重铸用 |
| `quest_letter` | 任务信 | 任务物品 |
| `quest_scroll` | 任务卷轴 | 任务物品 |
| `spirit_stone_pouch` | 灵石袋 | 开袋得灵石 |

::: warning 绑定类物品靠 tradeable 控制
`tradeable` 只影响**坊市上架**。玩家之间直接给予、宗门仓库存取是否受限，
要看对应服务自己的校验逻辑。
:::

## 境界门槛

`requiredRealm` 大于 0 的物品，数值是**大境界 id**（对应 `realm_config.json` 的 `id` 字段）：

| 境界 id | 境界 | 物品数（举例） |
| --- | --- | --- |
| 1 | 炼气期 | 种子、灵草、低阶丹药（约 25 个） |
| 2 | 筑基期 | `space_ring`、`spirit_sword`、`ice_crystal`、`heaven_fire_stone` |
| 3 | 金丹期 | `star_robes`、`tribulation_pill`、`guardian_jade`、`dragon_blood_crystal` |
| 4 | 元婴期 | `dragon_sword`、`jade_armor`、`phoenix_armor`、`heaven_pill` |
| 5 | 化神期 | `qilin_amulet`、`qilin_blood`、`thunder_bolt_talisman` |
| 10 | 金仙 | `pesticide` |

::: danger `Item.getRequiredRealm()` 目前没有任何调用方
全仓库检索 `getRequiredRealm`，命中全部来自 `Recipe` / `Skill` / `Technique` / `Title` / `SecretRealm`，
**没有任何一处调用 `Item.getRequiredRealm()`**。

也就是说：**这一列现在只是数据，不构成任何实际门槛**——玩家即使境界不够，也能持有和使用这些物品。
下表的数值反映的是设计意图，不是运行时的真实限制。
:::

::: warning `pesticide` 的数值看起来很可疑
`pesticide`（杀虫剂）的 `requiredRealm` 是 **10**，也就是**金仙**。
这几乎肯定是笔误（其他农具类都是 0/1），但代码事实如此。

由于上面说的"没有任何调用方"，这个笔误目前**不会**导致杀虫剂用不了；
但如果将来给物品加上境界校验，它会立刻变成一颗地雷。
:::

## 探索事件与秘境

物品之外，还有两类数据也是 Java 类：

| 目录 | 数量 | 说明 |
| --- | --- | --- |
| `data/mtxgdn/explorationevent/` | 13 | 游历事件（灵草、妖兽、商人、遗迹、陷阱等） |
| `data/mtxgdn/secretrealm/` | 10 | 秘境（太虚宫、九霄台、雷谷、古战场等） |

详见[游历探索](/player/exploration)与[秘境副本](/player/secret-realm)。

## 新增一个物品

1. 在 `data/mtxgdn/item/` 建类：

```java
package data.mtxgdn.item;

import com.mtxgdn.game.item.EmptyEffect;
import com.mtxgdn.game.item.Item;
import com.mtxgdn.game.item.ItemRarity;
import com.mtxgdn.game.item.ItemType;

public class MyPill extends Item {
    public MyPill() {
        super("mtxgdn", "my_pill", ItemType.CONSUMABLE, ItemRarity.RARE,
              99, 500, true, 2, EmptyEffect.INSTANCE);
    }
}
```

2. **补语言条目**（`data/mtxgdn/lang/zh_cn.json`）：

```json
"item.my_pill.name": "我的丹药",
"item.my_pill.desc": "吃了会变强。"
```

3. 如果需要使用效果，把 `EmptyEffect.INSTANCE` 换成自己的 `ItemEffect` 实现。

4. 需要掉落/产出的话，去对应服务（秘境、游历、农田、炼制配方）里引用
   `ItemRegistry.resolve("my_pill")`。

5. 编译重启，在 **管理后台 → 数据库 → items**、`/全物品列表` 或 `/物品列表` 里确认出现。

::: tip 没有 `/物品图鉴` 这个指令
`game.item.registry`（显示名「查看物品图鉴」）是一个**权限码**，不是指令名。实际可用的指令是：

| 指令 | 别名 | 作用 |
| --- | --- | --- |
| `/全物品列表 [页数]` | `items`、`allitems` | 分页浏览全部物品（仅私聊，默认第 1 页） |
| `/物品列表` | `itemmap` | 查看物品中文名与 key 的映射表 |
| `/物品图鉴` | — | **不存在** |
:::
