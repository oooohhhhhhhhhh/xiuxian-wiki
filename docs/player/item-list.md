# 物品列表

物品系统由 `data.mtxgdn.item` 包下的定义类驱动：启动时 `ItemScanner` 扫描并实例化继承 `Item` 的类，自动注册进 `ItemRegistry`。该目录共 **115 个定义文件**，其中 **114 个注册为可用物品**（抽象基类 `FormationItem` 无无参构造，不注册）。物品全 key 形如 `mtxgdn:<key>`；名称与描述取自语言文件 `data/mtxgdn/lang/zh_cn.json`；所有涉及物品的指令均支持**中文名**与 **key** 混用。

## 类型与稀有度

`ItemType`（显示名）与 `ItemRarity`（显示名 / 档位）枚举如下：

| 类型 | 显示名 | 数量 |
|------|--------|:---:|
| CONSUMABLE | 消耗品 | 23 |
| CURRENCY | 货币 | 4 |
| MATERIAL | 材料 | 61 |
| SEED | 种子 | 8 |
| SKILL_BOOK | 功法秘籍 | 3 |
| TREASURE | 法宝（承担装备职能） | 11 |
| QUEST | 任务物品 | 4 |

| 稀有度 | 显示名 | 档位 |
|--------|--------|:---:|
| COMMON | 凡品 | 1 |
| UNCOMMON | 良品 | 2 |
| RARE | 珍品 | 3 |
| EPIC | 仙品 | 4 |
| LEGENDARY | 神品 | 5 |
| MYTHIC | 圣品 | 6 |

> 使用物品由 `ItemService.useItem` 统一执行效果（事务内先验效果后扣物品）：治疗/回蓝为即时数值；带持续时间的加成经 `BuffService` 结算；部分物品的描述文案与代码实参不一致，本文效果一律以代码为准。

## 货币（CURRENCY，4）

| 物品 | key | 稀有度 | 说明 |
|------|-----|:---:|------|
| 下品灵石 | spirit_stone_low | 凡品 | 基础货币（1 倍灵气） |
| 中品灵石 | spirit_stone_mid | 良品 | 等值 1000 下品（2 倍灵气） |
| 上品灵石 | spirit_stone_high | 珍品 | 等值 100 万下品（3 倍灵气） |
| 极品灵石 | spirit_stone_supreme | 仙品 | 等值 10 亿下品（5 倍灵气） |

灵石支持提纯（低→高）与兑换（高→低），各档持有硬上限与自动合并见经济系统。

## 消耗品（CONSUMABLE，23）

| 物品 | key | 稀有度 | 效果（代码实参） | 参考价 |
|------|-----|:---:|------|:---:|
| 回血丹 | healing_pill | 凡品 | 恢复 50 生命 | 10 |
| 回蓝丹 | mana_pill | 凡品 | 恢复 30 法力 | 10 |
| 回灵丹 | spirit_recovery_pill | 良品 | 恢复 100 生命 + 80 法力 | 30 |
| 神力丹 | power_buff_pill | 良品 | 攻 +30、防 +20，持续 60 秒 | 50 |
| 神行符 | speed_talisman | 良品 | 速 +25、灵 +10，持续 120 秒 | 40 |
| 反射丹 | damage_reflection_pill | 良品 | 反弹 30% 所受伤害，持续 120 秒 | 120 |
| 清心丹 | purification_pill | 良品 | 清除负面/重伤状态并恢复生命（重伤 60% / 平时 20% 最大生命） | 80 |
| 传送符 | teleport_talisman | 良品 | 传送至主城（太虚城安全区） | 100 |
| 修炼丹 | cultivation_elixir | 珍品 | 获得 500 经验 | 100 |
| 经验加倍丹 | exp_multiplier_pill | 珍品 | 经验获取效率 +50%，持续 300 秒 | 300 |
| 大回血丹 | super_healing_pill | 珍品 | 恢复 200 生命 | 50 |
| 大回蓝丹 | super_mana_pill | 珍品 | 恢复 200 法力 | 50 |
| 灵力丹 | spirit_boost_pill | 珍品 | 灵力 +50，持续 300 秒 | 80 |
| 洗髓丹 | attribute_reset_pill | 珍品 | 清除全部增益 Buff 并回退加成，生命/法力回满 | 500 |
| 护符 | protect_charm | 珍品 | 无直接效果；强化碎裂时自动消耗 1 张保护装备 | 2000 |
| 复活丹 | rebirth_pill | 仙品 | 生命与法力立即回满（原地复活） | 5000 |
| 渡劫丹 | tribulation_pill | 仙品 | 突破大境界时自动消耗，成功率 +10% | 500 |
| 终极神力丹 | ultimate_power_pill | 仙品 | 攻 +50、防 +50、速 +20、灵 +30，持续 600 秒 | 200 |
| 天元丹 | heaven_pill | 神品 | 获得 10000 经验 | 10000 |
| 仙丹 | immortal_pill | 神品 | 恢复 500 生命 + 500 法力 | 500 |
| 乾坤造化丹 | qiankun_zaohua_dan | 神品 | 灵根重铸消耗品（无直接使用效果，不可交易） | - |
| 金袋 | gold_bag | 凡品 | 打开获得 100 金币（不可交易） | - |
| 灵石袋 | spirit_stone_pouch | 凡品 | 打开获得 5 下品灵石（不可交易） | - |

> 物品类构造与 `zh_cn.json` 描述已同步（如经验加倍丹 +50% × 300 秒、大回蓝丹恢复 200 法力、仙丹恢复 500 生命 + 500 法力），上表数值即实际效果。

## 法宝 / 装备（TREASURE，11）

装备机制见 [装备与强化](./equipment)。装备效果为穿戴后即时生效的固定攻/防/速/灵加成（`BuffEffect`，时长 0 = 永久）；空间戒指按装备状态提供背包容量 +20（背包基础容量 = 30 + 等级×5，另有洞府存储加成）。

| 物品 | key | 稀有度 | 攻/防/速/灵 | 需求境界 | 参考价 | 获取 |
|------|-----|:---:|:---:|:---:|:---:|------|
| 灵剑 | spirit_sword | 珍品 | 50/0/10/20 | 筑基 | 3000 | [制造](./crafting) |
| 空间戒指 | space_ring | 珍品 | 背包容量 +20 | 筑基 | 5000 | [制造](./crafting) |
| 护身玉 | guardian_jade | 仙品 | 0/100/0/50 | 金丹 | 8000 | [制造](./crafting) |
| 星辰法袍 | star_robes | 仙品 | 40/150/40/120 | 金丹 | 25000 | [制造](./crafting) |
| 玉甲 | jade_armor | 神品 | 80/200/30/100 | 元婴 | 30000 | 制造 / 秘境 |
| 龙剑 | dragon_sword | 神品 | 200/50/50/80 | 元婴 | 50000 | [制造](./crafting) |
| 凤凰铠甲 | phoenix_armor | 神品 | 60/300/20/60 | 元婴 | 60000 | [制造](./crafting) |
| 麒麟护符 | qilin_amulet | 圣品 | 150/200/100/200 | 化神 | 200000 | [制造](./crafting) |
| 聚灵阵（阵图） | spirit_gathering_formation | 珍品 | 无属性（/使用 布置 1 级聚灵阵） | 炼气 | 300 | 发放 · 见 [阵法](./formation) |
| 护山阵（阵图） | mountain_protection_formation | 仙品 | 无属性（/使用 布置 1 级护山大阵） | 炼气 | 800 | 发放 · 见 [阵法](./formation) |
| 净化阵（阵图） | purification_formation | 珍品 | 无属性（/使用 布置 1 级净化阵） | 炼气 | 300 | 发放 · 见 [阵法](./formation) |

## 材料（MATERIAL，61）

材料均为 `EmptyEffect`（无使用效果），作为炼丹 / 炼器 / 配方原料，按稀有度分组；参考价为物品定义的出售价（金币）。

### 凡品 / 良品

| 物品 | key | 稀有度 | 参考价 |
|------|-----|:---:|:---:|
| 灵草 | spirit_grass | 凡品 | 5 |
| 铁矿石 | iron_ore | 凡品 | 8 |
| 灵木 | spirit_wood | 凡品 | 15 |
| 强化石 | enhance_stone | 凡品 | 50 |
| 低阶肥料 | low_grade_fertilizer | 凡品 | 20 |
| 杀虫剂 | pesticide | 凡品 | 5 |
| 万灵草 | wan_ling_grass | 凡品 | 50 |
| 万灵草种子 | wan_ling_grass_seed | 凡品 | 30 |
| 银矿石 | silver_ore | 良品 | 20 |
| 灵泉水 | spirit_spring_water | 良品 | 30 |
| 暗冰草 | dark_ice_grass | 良品 | 30 |
| 火焰藤 | fire_vine | 良品 | 35 |
| 妖兽内丹 | beast_core | 良品 | 60 |
| 魔核 | demon_core | 良品 | 80 |
| 虎牙 | tiger_fang | 良品 | 40 |
| 中阶肥料 | mid_grade_fertilizer | 良品 | 50 |
| 功法残页 | scripture_page | 良品 | 50（研读 +200 经验） |
| 蟠桃 | peach | 良品 | 80 |
| 蟠桃种子 | peach_seed | 良品 | 50 |

### 珍品

| 物品 | key | 稀有度 | 参考价 |
|------|-----|:---:|:---:|
| 千年人参 | thousand_year_ginseng | 珍品 | 50 |
| 血灵芝 | blood_lingzhi | 珍品 | 80 |
| 千年何首乌 | thousand_year_heshouwu | 珍品 | 80 |
| 金矿石 | gold_ore | 珍品 | 50 |
| 蛇毒 | snake_venom | 珍品 | 60 |
| 幽冥花 | nether_flower | 珍品 | 30 |
| 鬼火精华 | ghost_fire_essence | 珍品 | 100 |
| 冰晶 | ice_crystal | 珍品 | 180 |
| 天火石 | heaven_fire_stone | 珍品 | 200 |
| 高阶肥料 | high_grade_fertilizer | 珍品 | 100 |
| 何首乌种子 | he_shou_wu_seed | 珍品 | 180 |
| 火龙果 | dragon_fruit | 珍品 | 250 |
| 火龙果种子 | dragon_fruit_seed | 珍品 | 150 |

### 仙品

| 物品 | key | 稀有度 | 参考价 |
|------|-----|:---:|:---:|
| 万年灵芝 | ten_thousand_year_lingzhi | 仙品 | 150 |
| 天山雪莲 | tianshan_snow_lotus | 仙品 | 200 |
| 秘银矿石 | mythril_ore | 仙品 | 200 |
| 龙骨 | dragon_bone | 仙品 | 300 |
| 星沙 | star_sand | 仙品 | 500 |
| 星草 | star_grass | 仙品 | 60 |
| 深海珊瑚 | deep_sea_coral | 仙品 | 150 |
| 天蚕丝 | sky_silk | 仙品 | 200 |
| 血玉髓 | blood_jade_marrow | 仙品 | 250 |
| 龙血晶 | dragon_blood_crystal | 仙品 | 5000 |
| 天玉 | heavenly_jade | 仙品 | 5000 |
| 灵珠 | spirit_pearl | 仙品 | 400 |
| 月华 | moon_essence | 仙品 | 350 |
| 仙枣 | immortal_date | 仙品 | 500 |
| 仙枣种子 | immortal_date_seed | 仙品 | 300 |
| 紫河车 | purple_river_cart | 仙品 | 700 |
| 紫河车种子 | purple_river_cart_seed | 仙品 | 400 |

### 神品 / 圣品

| 物品 | key | 稀有度 | 参考价 |
|------|-----|:---:|:---:|
| 龙鳞 | dragon_scale | 神品 | 2000 |
| 凤凰羽毛 | phoenix_feather | 神品 | 2000 |
| 日精 | sun_essence | 神品 | 800 |
| 龙心 | dragon_heart | 神品 | 1000 |
| 五色神石 | five_colored_divine_stone | 神品 | 500 |
| 凤凰胆 | phoenix_gallbladder | 神品 | 800 |
| 麒麟角 | qilin_horn | 神品 | 600 |
| 人参果 | ginseng_fruit | 神品 | 1000 |
| 人参果种子 | ginseng_fruit_seed | 神品 | 500 |
| 麒麟血 | qilin_blood | 圣品 | 10000 |
| 九转还魂草 | nine_turn_grass | 圣品 | 2000 |
| 九转还魂草种子 | nine_turn_grass_seed | 圣品 | 1000 |

## 种子（SEED 类型，8）

`SEED` 类型为初始 8 种作物种子（堆叠 999），均可通过农场种植（作物参数见 [农场系统](./farm)）。

| 种子 | key | 稀有度 | 收获作物 |
|------|-----|:---:|------|
| 灵草种子 | spirit_grass_seed | 凡品 | 灵草 |
| 暗冰草种子 | dark_ice_grass_seed | 良品 | 暗冰草 |
| 火焰藤种子 | fire_vine_seed | 良品 | 火焰藤 |
| 千年人参种子 | thousand_year_ginseng_seed | 珍品 | 千年人参 |
| 幽冥花种子 | nether_flower_seed | 珍品 | 幽冥花 |
| 血灵芝种子 | blood_lingzhi_seed | 珍品 | 血灵芝 |
| 星草种子 | star_grass_seed | 仙品 | 星草 |
| 天山雪莲种子 | tianshan_snow_lotus_seed | 神品 | 天山雪莲 |

> 扩展 8 种作物（蟠桃 / 人参果 / 火龙果 / 仙枣 / 九转还魂草 / 何首乌 / 万灵草 / 紫河车）的种子在物品定义中属于 `MATERIAL` 类型（堆叠 1、定义需求境界 1），已列入上面材料表，同样可种植。

## 功法秘籍（SKILL_BOOK，3）

| 物品 | key | 稀有度 | 效果 |
|------|-----|:---:|------|
| 基础剑诀 | basic_sword_manual | 凡品 | 学会技能「基础剑诀」（技能 9） |
| 火龙术 | fire_dragon_art | 仙品 | 学会技能「天雷咒」（技能 3） |
| 天雷符 | thunder_bolt_talisman | 神品 | 学会技能「万剑诀」（技能 4） |

## 任务物品（QUEST，4）

| 物品 | key | 稀有度 | 说明 |
|------|-----|:---:|------|
| 任务信 | quest_letter | 凡品 | 任务道具（不可交易） |
| 残卷 | fragment_scroll | 良品 | 任务道具（不可交易） |
| 神秘令牌 | mystery_token | 珍品 | 任务道具（不可交易） |
| 任务卷轴 | quest_scroll | 仙品 | 任务道具（不可交易） |

## 获取途径（概览）

- **制造**：33 种配方产出丹药 / 装备 / 消耗品 / 种子 → [制造系统](./crafting)
- **农场**：16 种作物收获灵植材料与果实 → [农场系统](./farm)
- **探索**：游历随机事件与秘境 Boss / 掉落产出材料、装备与种子 → [游历事件一览](./exploration-events)、[秘境探索](./secret-realm)
- **商店 / 坊市 / 拍卖 / 签到 / 兑换码 / PVP**：金币与灵石计价购买、玩家交易、活动与每日发放（见 [经济系统](./economy) 等页面）

## 相关系统

- 装备强化消耗强化石 / 护符 → [装备与强化](./equipment)
- 灵石提纯 / 兑换 → [经济系统](./economy)
- 种子种植参数 → [农场系统](./farm)
