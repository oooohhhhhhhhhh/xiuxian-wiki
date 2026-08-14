# 物品列表

游戏注册物品共 **114 个**（`data.mtxgdn.item`），物品 key 规则为 `mtxgdn:<key>`。所有涉及物品的指令均支持**中文名**与 **key** 混用。

## 类型与稀有度

| 类型 | 说明 |
|------|------|
| CONSUMABLE | 消耗品（丹药 / 符箓 / 袋子） |
| MATERIAL | 材料（矿石 / 灵材 / 果实 / 种子 / 肥料） |
| TREASURE | 法宝（承担装备职能） |
| SKILL_BOOK | 功法秘籍（使用学习技能） |
| QUEST | 任务物品 |
| CURRENCY | 货币（四档灵石） |
| SEED | 种子（8 种可种植） |

| 稀有度 | 显示名 |
|--------|--------|
| COMMON | 凡品 |
| UNCOMMON | 良品 |
| RARE | 珍品 |
| EPIC | 仙品 |
| LEGENDARY | 神品 |
| MYTHIC | 圣品 |

## 货币（4）

| 物品 | key | 价值 |
|------|-----|------|
| 下品灵石 | spirit_stone_low | 基础货币（1） |
| 中品灵石 | spirit_stone_mid | = 1000 下品 |
| 上品灵石 | spirit_stone_high | = 100 万下品 |
| 极品灵石 | spirit_stone_supreme | = 10 亿下品 |

## 丹药与消耗品（23）

| 物品 | key | 稀有度 | 效果 |
|------|-----|:---:|------|
| 回血丹 | healing_pill | 凡品 | 恢复 50 生命 |
| 回蓝丹 | mana_pill | 凡品 | 恢复 30 法力 |
| 回灵丹 | spirit_recovery_pill | 良品 | 恢复 100 生命 + 80 法力 |
| 神力丹 | power_buff_pill | 良品 | 攻+30 防+20（60 秒） |
| 清心丹 | purification_pill | 良品 | 清除负面状态（文案） |
| 传送符 | teleport_talisman | 良品 | 传送（文案） |
| 反射丹 | damage_reflection_pill | 良品 | 防+30（120 秒） |
| 修炼丹 | cultivation_elixir | 珍品 | +500 经验 |
| 洗髓丹 | attribute_reset_pill | 珍品 | 重分配属性（文案） |
| 经验加倍丹 | exp_multiplier_pill | 珍品 | 空 Buff（无效果） |
| 大回血丹 | super_healing_pill | 珍品 | 恢复 200 生命 |
| 大回蓝丹 | super_mana_pill | 珍品 | 恢复 200 法力 |
| 灵力丹 | spirit_boost_pill | 珍品 | 灵力+50（300 秒） |
| 神行符 | speed_talisman | 良品 | 速+25 灵+10（120 秒） |
| 天元丹 | heaven_pill | 神品 | +10000 经验 |
| 护符 | protect_charm | 珍品 | 无效果 |
| 渡劫丹 | tribulation_pill | 仙品 | 渡劫成功率（当前未生效） |
| 复活丹 | rebirth_pill | 仙品 | 满血满蓝复活 |
| 仙丹 | immortal_pill | 神品 | 恢复 500 生命 + 500 法力 |
| 终极神力丹 | ultimate_power_pill | 仙品 | 攻防速灵全加成（600 秒） |
| 金袋 | gold_bag | 凡品 | 100 金币 |
| 灵石袋 | spirit_stone_pouch | 凡品 | 50 下品灵石 |
| 乾坤造化丹 | qiankun_zaohua_dan | 神品 | 灵根重铸消耗品 |

## 法宝（装备，11）

| 物品 | key | 稀有度 | 装备属性（攻/防/速/灵） |
|------|-----|:---:|:---:|
| 灵剑 | spirit_sword | 珍品 | 50/10/10/20 |
| 护身玉 | guardian_jade | 仙品 | 0/100/0/50 |
| 星辰法袍 | star_robes | 仙品 | 40/150/40/120 |
| 玉甲 | jade_armor | 神品 | 80/200/30/100 |
| 龙剑 | dragon_sword | 神品 | 200/50/50/80 |
| 凤凰铠甲 | phoenix_armor | 神品 | 60/300/20/60 |
| 麒麟护符 | qilin_amulet | 圣品 | 150/200/100/200 |
| 空间戒指 | space_ring | 珍品 | 背包 +20 格 |
| 聚灵阵 | spirit_gathering_formation | 珍品 | 无效果（占位） |
| 护山阵 | mountain_protection_formation | 仙品 | 无效果（占位） |
| 净化阵 | purification_formation | 珍品 | 无效果（占位） |

## 材料（61）

### 基础材料与矿石

| 物品 | key | 稀有度 | 价格 |
|------|-----|:---:|:---:|
| 灵草 | spirit_grass | 凡品 | 5 |
| 铁矿石 | iron_ore | 凡品 | 8 |
| 灵木 | spirit_wood | 凡品 | 15 |
| 强化石 | enhance_stone | 凡品 | 50 |
| 妖兽内丹 | beast_core | 良品 | 60 |
| 魔核 | demon_core | 良品 | 80 |
| 灵泉水 | spirit_spring_water | 良品 | 30 |
| 银矿石 | silver_ore | 良品 | 20 |
| 虎牙 | tiger_fang | 良品 | 40 |
| 暗冰草 | dark_ice_grass | 良品 | 30 |
| 火焰藤 | fire_vine | 良品 | 35 |
| 千年人参 | thousand_year_ginseng | 珍品 | 50 |
| 血灵芝 | blood_lingzhi | 珍品 | 80 |
| 金矿石 | gold_ore | 珍品 | 50 |
| 蛇毒 | snake_venom | 珍品 | 60 |
| 幽冥花 | nether_flower | 珍品 | 30 |
| 千年何首乌 | thousand_year_heshouwu | 珍品 | 80 |
| 冰晶 | ice_crystal | 珍品 | 180 |
| 天火石 | heaven_fire_stone | 珍品 | 200 |
| 鬼火精华 | ghost_fire_essence | 珍品 | 100 |
| 万年灵芝 | ten_thousand_year_lingzhi | 仙品 | 150 |
| 天山雪莲 | tianshan_snow_lotus | 仙品 | 200 |
| 秘银矿石 | mythril_ore | 仙品 | 200 |
| 龙骨 | dragon_bone | 仙品 | 300 |
| 星沙 | star_sand | 仙品 | 500 |
| 星辰草 | star_grass | 仙品 | 60 |
| 深海珊瑚 | deep_sea_coral | 仙品 | 150 |
| 天蚕丝 | sky_silk | 仙品 | 200 |
| 血玉髓 | blood_jade_marrow | 仙品 | 250 |
| 龙血晶 | dragon_blood_crystal | 仙品 | 5000 |
| 天玉 | heavenly_jade | 仙品 | 5000 |
| 灵珠 | spirit_pearl | 仙品 | 400 |
| 月华 | moon_essence | 仙品 | 350 |
| 龙鳞 | dragon_scale | 神品 | 2000 |
| 凤凰羽毛 | phoenix_feather | 神品 | 2000 |
| 日精 | sun_essence | 神品 | 800 |
| 龙心 | dragon_heart | 神品 | 1000 |
| 五色神石 | five_colored_divine_stone | 神品 | 500 |
| 凤凰胆 | phoenix_gallbladder | 神品 | 800 |
| 麒麟角 | qilin_horn | 神品 | 600 |
| 麒麟血 | qilin_blood | 圣品 | 10000 |
| 功法残页 | scripture_page | 良品 | 50（研读 +200 经验） |

### 农场果实与种子（15）

| 物品 | key | 稀有度 | 说明 |
|------|-----|:---:|------|
| 蟠桃 / 蟠桃种子 | peach / peach_seed | 良品 | 种植 |
| 人参果 / 种子 | ginseng_fruit / ginseng_fruit_seed | 神品 | 种植 |
| 火龙果 / 种子 | dragon_fruit / dragon_fruit_seed | 珍品 | 种植 |
| 仙枣 / 种子 | immortal_date / immortal_date_seed | 仙品 | 种植 |
| 九转还魂草 / 种子 | nine_turn_grass / nine_turn_grass_seed | 圣品 | 种植 |
| 何首乌种子 | he_shou_wu_seed | 珍品 | 种植（→千年何首乌） |
| 万灵草 / 种子 | wan_ling_grass / wan_ling_grass_seed | 凡品 | 种植 |
| 紫河车 / 种子 | purple_river_cart / purple_river_cart_seed | 仙品 | 种植 |

### 肥料与农药（4）

| 物品 | key | 效果 |
|------|-----|------|
| 低阶肥料 | low_grade_fertilizer | 肥力 +25 |
| 中阶肥料 | mid_grade_fertilizer | 肥力 +40 |
| 高阶肥料 | high_grade_fertilizer | 肥力 +60 |
| 杀虫剂 | pesticide | 清除作物病虫害 |

## 技能书（3）

| 物品 | key | 对应技能 |
|------|-----|------|
| 基础剑诀 | basic_sword_manual | 技能 9（基础剑诀） |
| 火龙术 | fire_dragon_art | 技能 3（天雷咒） |
| 天雷符 | thunder_bolt_talisman | 技能 4（万剑诀） |

## 任务物品（4）

| 物品 | key | 稀有度 |
|------|-----|:---:|
| 任务信 | quest_letter | 凡品 |
| 残卷 | fragment_scroll | 良品 |
| 神秘令牌 | mystery_token | 珍品 |
| 任务卷轴 | quest_scroll | 仙品 |

## 种子（SEED 类型，8）

| 物品 | key | 稀有度 | 种植产物 |
|------|-----|:---:|------|
| 灵草种子 | spirit_grass_seed | 凡品 | 灵草 |
| 暗冰草种子 | dark_ice_grass_seed | 良品 | 暗冰草 |
| 火焰藤种子 | fire_vine_seed | 良品 | 火焰藤 |
| 千年人参种子 | thousand_year_ginseng_seed | 珍品 | 千年人参 |
| 幽冥花种子 | nether_flower_seed | 珍品 | 幽冥花 |
| 血灵芝种子 | blood_lingzhi_seed | 珍品 | 血灵芝 |
| 星辰草种子 | star_grass_seed | 仙品 | 星辰草 |
| 天山雪莲种子 | tianshan_snow_lotus_seed | 神品 | 天山雪莲 |

## 物品获取途径

- **游历事件**：灵草、矿石、种子、稀有材料、法宝（详见 [游历事件一览](./exploration-events)）
- **秘境探索**：常见 / 稀有掉落（详见 [秘境探索](./secret-realm)）
- **制造**：31 种配方产出（详见 [制造系统](./crafting)）
- **商店**：`EconomyService.SHOP_ITEMS`（21 种商品，灵石计价）：回血丹 30、回蓝丹 25、回灵丹 60、修炼丹 150、渡劫丹 500、强化石 100、灵草 20、铁矿石 15、肥料 20/50/100、杀虫剂 30、种子 50~1000
- **签到**：7 天循环奖励（灵石 / 灵草 / 铁矿石 / 回血丹 / 强化石 / 回蓝丹 / 修炼丹）
- **农场**：种植收获（详见 [农场系统](./farm)）
- **PVP**：胜利奖励

## 相关系统

- 物品使用 → [Buff 系统](./buff-system)
- 装备与强化 → [装备与强化](./equipment)
- 回收 / 商店 / 坊市 → [经济系统](./economy)、[坊市交易](./market)
