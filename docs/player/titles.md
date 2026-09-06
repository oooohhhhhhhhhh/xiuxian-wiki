# 称号系统

称号是玩家的荣誉标识与成长加成的来源。内置称号定义在 `TitleRegistry`（`com.mtxgdn.game.title`，静态注册 19 个预设称号），归属 `TitleService` / `TitleCommand`。称号数据存于 `player_titles`（player_id + title_key + is_equipped）。

## 稀有度

`Title.Rarity` 共 **5 档**（显示名由 `getRarityLabel()` 定义）：

| 稀有度 | 显示名 | 内置称号数 |
|--------|--------|:---:|
| COMMON | 普通 | 3 |
| UNCOMMON | 稀有 | 5 |
| RARE | 珍贵 | 5 |
| EPIC | 史诗 | 4 |
| LEGENDARY | 传说 | 2 |

全部 19 个称号的逐项数值见 [称号列表](./title-list)。

## 称号加成

每个称号提供**固定属性**与**百分比加成**两类数值：

- 固定：攻击、防御、生命、法力、速度、灵力
- 百分比：修炼速度、经验加成、掉落率加成

称号加成经 `PlayerService` 的 `getFinalAttack / getFinalDefense / getFinalMaxHp / getFinalMaxMp / getFinalSpeed / getFinalSpirit / getFinalCultivationSpeed / getFinalExpBonus` 等汇总后作用于战斗与成长结算。

## 装备规则

- 同一时间只能装备 **1 个**称号；`equipTitle` 在同一事务内先卸下旧称号再装备新称号；
- 只能装备**已拥有**的称号（`/称号 装备` 从已拥有列表中匹配名称或 key）；
- 每个称号在定义中含**境界要求**（`requiredRealm`，大境界序号 0 凡人 ~ 8 渡劫等），见 [称号列表](./title-list) 的「境界」列；
- 授予去重：重复授予返回「已拥有该称号」。

## 获取途径

### 自动授予（玩法触发）

| 称号 | 触发条件（代码位置） |
|------|------|
| 初入仙途 | 创建角色自动获得（`PlayerService.createPlayer`） |
| 剑道学徒 | 学会技能时授予（`SkillService.learnSkill` 成功后调用，幂等 → 实为首个技能） |
| 炼丹学徒 | 制造成功 ≥ 1 次（`CraftingService` 触发称号检查） |
| 丹道尊者 | 制造成功 ≥ 100 次 |
| 破天者 | 跨大境界突破成功（`RealmService`） |
| 不朽尊者 | 境界达到化神（大境界序号 ≥ 5） |
| 逆天者 | 境界达到渡劫（≥ 8）；转世流程也会授予 |
| 大道之主 | 境界达到真仙（≥ 9） |
| 混沌帝尊 | 境界达到金仙（≥ 10） |
| 剑道宗师 | 最终攻击 ≥ 500 |
| 富甲一方 | 持有灵石（四档折合下品）≥ 1,000,000 |
| 秘境探险家 | 秘境通关（计数）≥ 20 |
| 擂台王者 | PVP 胜利 ≥ 50 |
| 首席弟子 | 加入宗门申请被批准（`SectService`） |
| 开山祖师 | 创建宗门成功（`SectService`） |
| 副本征服者 | 秘境副本 Boss 最后一击（`SecretRealmService`） |

自动检查入口 `TitleService.checkAndGrantTitles` 会在**战斗胜利、炼丹成功、突破、秘境探索、灵石入账**等行为后被调用（幂等，只授予尚未拥有的称号）。

> 捉虫达人、迎春使者、万兽之主 3 个称号在服务端代码中**没有自动授予路径**，属于运营 / 管理后台发放型称号（其中「迎春使者」描述为 2026 年春节活动限定）。

### 管理发放

管理后台 / 管理指令（`AdminResource` 与管理员指令）可对任意玩家授予或撤销任意称号（`grantTitle` / `revokeTitle`）。

## 指令

| 指令 | 说明 |
|------|------|
| `/称号` `/title` | 查看已拥有称号与当前装备称号 |
| `/称号 列表` | 浏览全部称号大全（按稀有度分组，含境界要求与加成） |
| `/称号 装备 <名称>` | 装备一个已拥有的称号 |
| `/称号 卸下` | 卸下当前称号 |

## 相关系统

- 全部称号数值一览 → [称号列表](./title-list)
- 炼丹计数与称号联动 → [制造系统](./crafting)
