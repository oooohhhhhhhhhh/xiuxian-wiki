# 功法系统

功法是**永久属性加成的主要来源**：与技能不同，功法必须"装备（运转）"后才生效，最多同时运转 3 门。
功法提供六维属性加成（生命/法力/攻击/防御/速度/神识）以及四类倍率（修炼速度、经验、战斗伤害、减伤）。

- 玩法模块：`technique`（`built_in_plugins.technique`，默认启用）
- 数据表：`techniques`（功法定义）、`players_techniques`（角色已学功法、等级、是否运转）
- 服务：`com.mtxgdn.game.service.TechniqueService`
- 指令：`com.mtxgdn.onebot.command.technique.TechniqueCommand`（同时注册 6 条 HTTP 路由）

## 功法全表

数据来自 `TechniqueService.insertDefaultTechniques()`，按**名称幂等**插入（已存在同名功法则跳过，支持旧库增量补齐）。
境界要求同境界 ID 体系（0 凡人、1 炼气期、2 筑基期、3 金丹期、4 元婴期、5 化神期、6 合体期、7 大乘期、8 渡劫期）。

| 功法 | 类型 | 境界 | 学习（金币/灵石） | 升级基数（金币/灵石） | 上限 | 生命 | 法力 | 攻击 | 防御 | 速度 | 神识 | 修炼速度 | 经验 | 战斗伤害 | 减伤 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 吐纳术 | 修炼 | 凡人 | 0 / 0 | 200 / 50 | 10 | — | — | — | — | — | — | +5% | — | — | — |
| 铁骨功 | 防御 | 炼气期 | 500 / 100 | 300 / 80 | 10 | +30 | — | — | +10 | — | — | — | — | — | +3% |
| 锐金诀 | 攻击 | 炼气期 | 500 / 100 | 300 / 80 | 10 | — | — | +8 | — | — | — | — | — | +3% | — |
| 长春功 | 修炼 | 筑基期 | 1500 / 300 | 500 / 150 | 10 | +50 | +20 | — | — | — | — | +8% | +5% | — | — |
| 烈焰心经 | 攻击 | 筑基期 | 2000 / 400 | 600 / 200 | 10 | — | — | +15 | — | — | +5 | — | — | +5% | — |
| 玄水真解 | 防御 | 金丹期 | 3000 / 600 | 800 / 300 | 10 | — | +40 | — | +5 | — | — | +3% | — | — | +3% |
| 太虚经 | 辅助 | 金丹期 | 4000 / 800 | 1000 / 400 | **8** | — | — | — | — | — | +10 | +2% | +2% | — | — |
| 紫霄天诀 | 修炼 | 元婴期 | 8000 / 1500 | 1500 / 600 | 10 | +30 | +30 | +5 | +5 | +5 | +5 | +10% | +5% | +2% | +2% |
| 大衍剑诀 | 攻击 | 元婴期 | 10000 / 2000 | 2000 / 800 | 10 | — | — | +25 | — | — | +8 | — | — | +8% | — |
| 金刚不坏功 | 防御 | 化神期 | 15000 / 3000 | 3000 / 1200 | 10 | +80 | — | — | +20 | — | — | — | — | — | +6% |
| 混沌天经 | 修炼 | 化神期 | 20000 / 5000 | 5000 / 2000 | 10 | +50 | +50 | +10 | +10 | +10 | +10 | — | +15% | +10% | +5% |
| 混元一气诀 | 修炼 | 合体期 | 40000 / 10000 | 8000 / 3000 | 10 | +100 | +100 | +15 | +15 | +15 | +15 | +12% | +8% | +3% | +3% |
| 无极剑典 | 攻击 | 合体期 | 50000 / 12000 | 8000 / 3200 | 10 | — | — | +50 | — | — | +20 | — | — | +12% | — |
| 九转玄功 | 防御 | 大乘期 | 100000 / 30000 | 12000 / 5000 | 10 | +200 | — | — | +40 | — | — | — | — | — | +10% |
| 鸿蒙紫气经 | 修炼 | 渡劫期 | 250000 / 80000 | 20000 / 8000 | 10 | +150 | +150 | +25 | +25 | +25 | +25 | +15% | +12% | +6% | +6% |

::: warning 「混沌天经」的初始化数据比其它功法多一个数值
`insertDefaultTechniques` 中该行的字面量长度为 20（其它行均为 19）。按代码的读取顺序
（`row[15]` → 修炼速度、`row[16]` → 经验、`row[17]` → 战斗伤害、`row[18]` → 减伤），
实际入库的是**修炼速度 0、经验 +15%、战斗伤害 +10%、减伤 +5%**，末尾多出的 `0.05` 未被写入任何字段。
上表按实际生效值填写；如需修正请直接改源码数据行。
:::

## 品质与等级

源码中功法**没有"品质"字段**——`techniques` 表与 `Technique` 实体都没有 rarity。
功法的强弱区分靠三个维度：

| 维度 | 字段 | 说明 |
| --- | --- | --- |
| 类型 | `type` | `CULTIVATION` 修炼 / `ATTACK` 攻击 / `DEFENSE` 防御 / `UTILITY` 辅助（指令中显示为 修炼/攻击/防御/辅助） |
| 境界门槛 | `required_realm` | 学习时的最低境界要求 |
| 等级上限 | `max_level` | 除太虚经为 8 外，其余均为 10 |

等级由 `players_techniques.level` 记录，从 1 开始，通过 `/功法 升级` 提升，升级会**把熟练度重置为 0**。

## 等级缩放公式

属性加成与倍率加成是两套不同的缩放（`Technique` 实体中的 `getScaled*` 方法）：

```java
// 六维属性：每级 +12% 基础值（向下取整）
public int getScaledHpBonus() { return hpBonus + (int)(hpBonus * (level - 1) * 0.12); }
public int getScaledAttackBonus() { return attackBonus + (int)(attackBonus * (level - 1) * 0.12); }
// ……mp/defense/speed/spirit 同理

// 四类倍率：每级 +8%
public double getScaledCultivationSpeedBonus() { return cultivationSpeedBonus * (1 + (level - 1) * 0.08); }
public double getScaledExpBonus() { return expBonus * (1 + (level - 1) * 0.08); }
public double getScaledCombatDamageBonus() { return combatDamageBonus * (1 + (level - 1) * 0.08); }
public double getScaledDamageReduction() { return damageReduction * (1 + (level - 1) * 0.08); }
```

以「紫霄天诀」攻击加成 +5 为例：1 级 +5、5 级 +7（`5 + 5×4×0.12 = 7.4` 取整）、10 级 +10。

## 学习 / 装备 / 卸下 / 升级

### 学习

`TechniqueService.learnTechnique` 校验顺序：

| 顺序 | 校验 | 失败提示 |
| --- | --- | --- |
| 1 | 功法存在 | `功法不存在` |
| 2 | 未学过 | `你已经学会了【X】` |
| 3 | 角色存在 | `角色不存在` |
| 4 | `player.realm >= required_realm` | `境界不足，学习【X】需更高境界` |
| 5 | 金币 ≥ `learn_cost_gold` | `金币不足，需要 N 金币` |
| 6 | 灵石 ≥ `learn_cost_spirit_stones` | `灵石不足，需要 N 灵石` |

通过后事务内扣金币、扣灵石，插入 `players_techniques (level = 1, proficiency = 0, is_equipped = 0)`。
**学习本身不加任何属性**，属性只在装备时生效（避免重复叠加）。

### 装备（运转）

- 上限 `TechniqueService.MAX_EQUIPPED = 3`，已满时提示 `最多只能同时运转 3 门功法，请先卸下一门`。
- 已装备再装备 → `【X】已在运转中`。
- 装备时把 `is_equipped` 置 1，并对 `players` 行执行属性累加：

```java
// TechniqueService.applyTechniqueBonuses
player.setMaxHp(player.getMaxHp() + technique.getScaledHpBonus());
player.setHp(Math.min(player.getHp() + technique.getScaledHpBonus(), player.getMaxHp()));
player.setMaxMp(player.getMaxMp() + technique.getScaledMpBonus());
player.setMp(Math.min(player.getMp() + technique.getScaledMpBonus(), player.getMaxMp()));
player.setAttack(player.getAttack() + technique.getScaledAttackBonus());
// ……防御/速度/神识同理
```

### 卸下

`removeTechniqueBonuses` 与 `applyTechniqueBonuses` **严格互逆**（六维属性各自减去缩放后的值，下限 0），
所以反复装卸不会无限叠加。注意 `hp`/`mp` 当前值不会因卸下而回退（只回退上限）。

### 升级

| 项目 | 公式 / 规则 |
| --- | --- |
| 金币消耗 | `upgrade_base_cost_gold × 当前等级` |
| 灵石消耗 | `upgrade_base_cost_spirit_stones × 当前等级` |
| 等级上限 | 达到 `max_level` 时提示 `【X】已达最高等级` |
| 已装备功法 | 升级后**先回退旧加成再施加新加成**（按新等级补差） |
| 熟练度 | 升级时 `proficiency` 重置为 0 |

以「紫霄天诀」为例：1→2 级需 1500 金币 + 600 灵石，9→10 级需 13500 金币 + 5400 灵石。

::: warning 功法熟练度目前不会被增加
`TechniqueService.addProficiency` 已实现，但全仓库**没有任何调用点**（战斗结算只给技能加熟练度）。
`players_techniques.proficiency` 因此恒为 0，功法的成长完全依赖花资源升级。
:::

## 指令

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `/功法` | `technique`、`tj` | 显示"你的功法"列表（等级、是否运转中） |
| `/功法 列表` | `list` | 功法大全：ID、名称、境界要求、类型、学习消耗、上限、描述 |
| `/功法 我的` | `my`、`mine` | 同上"我的功法" |
| `/功法 学习 <功法ID>` | `learn` | 学习功法（**只接受数字 ID**） |
| `/功法 装备 <功法ID>` | `equip` | 开始运转 |
| `/功法 卸下 <功法ID>` | `unequip`、`uninstall` | 停止运转 |
| `/功法 升级 <功法ID>` | `upgrade` | 消耗金币与灵石升 1 级 |

- 分类为"战斗"，`permission` 为 `null`（不额外校验权限，但仍要求已绑定并已创建角色）。
- 所有子命令都要求参数为数字 ID，非法输入提示 `功法ID无效`。

### HTTP 路由

路由由 `UnifiedRestResource`（`@Path("/game")`）统一分发，完整前缀为 `/api/game/`。

| 方法 | 完整路径 | 说明 |
| --- | --- | --- |
| GET | `/api/game/technique/list` | 全部功法定义（含所有加成字段） |
| GET | `/api/game/technique/my` | 我的功法 |
| POST | `/api/game/technique/learn` | 学习 |
| POST | `/api/game/technique/equip` | 装备 |
| POST | `/api/game/technique/unequip` | 卸下 |
| POST | `/api/game/technique/upgrade` | 升级 |

## 加成如何进入计算

| 加成 | 读取方法 | 进入点 |
| --- | --- | --- |
| 六维属性 | 装备时直接累加到 `players` 行 | 战斗/状态展示均读取 `players` 的最终值 |
| 修炼速度 | `getEquippedCultivationSpeedBonus` | `PlayerService.cultivationMultiplier`：`mult *= (1 + 加成)` |
| 经验 | `getEquippedExpBonus` | `PlayerService.getFinalExpBonus`：与称号经验加成**相加**后作为经验倍率 |
| 战斗伤害 | `getEquippedCombatDamageBonus` | `CombatService`：`damage *= (1 + 加成)` |
| 减伤 | `getEquippedDamageReduction` | `CombatService`：`damage *= (1 − 减伤)`，与技能减伤、阵法减伤依次叠加 |

```java
// PlayerService.cultivationMultiplier —— 功法修炼速度
double techniqueBonus = ServiceRegistry.getTechniqueService().getEquippedCultivationSpeedBonus(player.getId());
if (techniqueBonus > 0) {
    mult *= (1 + techniqueBonus);
}
```

## 与技能的区别

| 维度 | 功法 | 技能 |
| --- | --- | --- |
| 是否需要装备 | **必须装备**，最多 3 门 | 学会即参与战斗 |
| 作用 | 属性 + 修炼/经验/战斗倍率（常驻） | 主动输出、治疗、战斗内减伤 |
| 成长 | 花金币+灵石升级，属性按等级缩放 | 熟练度累积升级 |
| 境界校验 | 仅学习时校验 | 仅学习时校验 |
| 数据表 | `techniques` / `players_techniques` | `skills` / `players_skills` |

详见 [技能系统](./skills)。

## 表字段

`techniques`：

| 字段 | 说明 |
| --- | --- |
| `id` / `name` / `description` | 主键、名称、描述 |
| `required_realm` | 学习境界要求 |
| `learn_cost_gold` / `learn_cost_spirit_stones` | 学习消耗 |
| `upgrade_base_cost_gold` / `upgrade_base_cost_spirit_stones` | 升级基数（乘当前等级） |
| `type` | `CULTIVATION` / `ATTACK` / `DEFENSE` / `UTILITY` |
| `max_level` | 等级上限 |
| `hp_bonus` / `mp_bonus` / `attack_bonus` / `defense_bonus` / `speed_bonus` / `spirit_bonus` | 六维基础加成 |
| `cultivation_speed_bonus` / `exp_bonus` / `combat_damage_bonus` / `damage_reduction` | 四类倍率 |

`players_techniques`：

| 字段 | 说明 |
| --- | --- |
| `player_id` + `technique_id` | 联合唯一键 |
| `level` | 当前等级，默认 1 |
| `proficiency` | 熟练度（当前无写入来源） |
| `is_equipped` | 是否运转中 |

## 相关页面

- [技能系统](./skills) —— 战斗中的主动手段
- [修炼系统](./cultivation) —— 修炼倍率构成
- [PVE 战斗](./combat) / [PVP 对战](./pvp) —— 战斗倍率与减伤的落地场景
- [玩家玩法总览与全指令表](./)
