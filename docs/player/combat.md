# PVE 战斗

本页描述玩家与怪物（含野外怪、Boss、秘境守护者、团队 Boss）的战斗流程、伤害公式、战斗策略、Boss 机制与重伤/疗伤规则。核心实现为 `src/main/java/com/mtxgdn/game/service/CombatService.java`（1321 行），怪物模板为 `src/main/java/com/mtxgdn/game/entity/Monster.java`，Boss 形态为 `src/main/java/com/mtxgdn/game/entity/BossForm.java`。

## 战斗入口

所有 PVE 入口最终都调用 `CombatService.pveFight(playerId, monster)`（单人）或 `CombatService.raidBossFight(playerIds, bossForms)`（团队）。

| 入口 | 说明 | 怪物来源 |
| --- | --- | --- |
| `/战斗 战斗` | 野外怪物 | `PvpCommand.MONSTERS` 中 4 种固定怪随机一只 |
| `/讨伐 讨伐` | Boss | 硬编码的「千年妖王」 |
| `/boss boss <玩家1> <玩家2> ...` | 团队 Boss 战 | `PvpCommand.BOSS_FORMS` 三形态 |
| 游历事件 `monster` | 遭遇妖兽 | `Monster.random(玩家境界, random)` |
| 秘境事件 `encounter_monster` | 遭遇妖兽 | `Monster.random(秘境境界, random)` |
| 秘境事件 `encounter_boss` | 秘境守护者 | `Monster.createBossForRealm(秘境境界, random)` |
| 秘境团队副本 | 小怪 + 最终 Boss | `Monster.random` + `BossForm.createFormsForRealm` |

::: warning 指令必须重复子命令名
`com.mtxgdn.onebot.command.pvp.PvpCommand` 的别名是 `{"决斗", "切磋", "fight", "战斗", "讨伐", "boss"}`，其 `execute` 先判断 `arg.isBlank()` → 直接打印用法，再把 `arg` 的第一个空格分隔词当作子命令。因此代码路径实际要求 `/决斗 <角色名>`、`/战斗 战斗`、`/讨伐 讨伐`、`/boss boss <名字...>`。而该指令内嵌的用法文案写的是 `/战斗`、`/讨伐`、`/boss`，与代码路径不一致：只写这些会得到用法提示而非战斗。
:::

## 前置条件与次数

| 条件 | 失败提示 |
| --- | --- |
| 角色存在 | `角色不存在` |
| `players.hp > 0` | `你的生命值不足，无法战斗` |

::: tip PVE 没有次数限制
野外怪、Boss、秘境战斗都不计入每日次数，唯一的门槛是生命值。只有 PVP 有每日 10 次上限。
:::

## 属性来源

战斗读取的是**最终属性**（`PlayerService` 的 `getFinal*` 系列），由基础属性叠加称号加成与装备强化加成：

| 方法 | 构成 |
| --- | --- |
| `getFinalAttack` | `players.attack` + 称号 `attackBonus` + 装备强化攻击总和 |
| `getFinalDefense` | `players.defense` + 称号 `defenseBonus` + 装备强化防御总和 |
| `getFinalSpeed` | `players.speed` + 称号 `speedBonus` + 装备强化速度总和 |
| `getFinalSpirit` | `players.spirit` + 称号 `spiritBonus` + 装备强化灵力总和 |
| `getFinalMaxHp` / `getFinalMaxMp` | `players.max_hp` / `max_mp` + 称号加成 |

```java
public int getFinalAttack(Player player) {
    return applyTitleBonus(player, player.getAttack(), t -> t.getAttackBonus())
            + getEnhanceBonus(player.getId())[0];   // 装备强化：[攻击, 防御, 速度, 灵力]
}
```

强化加成来自 `players_equipment.enhance_level`，逐槽位累加 `EnhanceService.getEnhanceStatBonus(level)` 返回的四元组。

## 伤害公式（PVE 玩家 → 怪物）

`calculatePlayerDamageToMonster` 的完整链路：

```java
baseDamage = attackSkill != null
        ? attackSkill.getDamage() + (int)(attackSkill.getDamage() * (level - 1) * 0.15)   // 再乘 SKILL_DAMAGE
        : playerService.getFinalAttack(attacker) + playerService.getFinalSpirit(attacker); // 普攻也吃灵力
baseDamage = applyDamageBoosts(baseDamage, attackerRoot);   // DAMAGE_BOOST
double critChance = Math.min(0.6, playerService.getFinalSpeed(attacker) / 400.0);
if (attackerRoot.hasEffect(SpecialEffect.CRIT_CHANCE)) critChance += attackerRoot.getEffectValue();
if (random.nextDouble() < critChance) baseDamage = (int)(baseDamage * critMult);   // critMult = 1.5 + CRIT_DAMAGE
return Math.max(1, baseDamage + random.nextInt(-5, 6) - defender.getDefense() / 3);
```

| 步骤 | 公式 | 备注 |
| --- | --- | --- |
| 1. 选技能 | 遍历技能列表，取**第一个**满足 `isAttackSkill() && scaledMpCost <= currentMp && cooldown.isReady()` 的技能 | 需 `currentMp > 0`；PVE **不按伤害排序**，按技能列表顺序 |
| 2a. 技能基础伤害 | `skill.damage + (int)(skill.damage × (level-1) × 0.15)` | 每级 +15% 基础伤害 |
| 2b. 普攻基础伤害 | `getFinalAttack + getFinalSpirit` | 普攻也吃灵力 |
| 3. 灵根技能增伤 | `× (1 + effectValue)`，条件 `SKILL_DAMAGE` | 玄冰灵根 0.15 |
| 4. 灵根通用增伤 | `× (1 + effectValue)`，条件 `DAMAGE_BOOST` | 离火灵根 0.10 |
| 5. 暴击率 | `min(0.6, getFinalSpeed / 400.0)` + 灵根 `CRIT_CHANCE` 值 | 速度 240 即满 60% 上限 |
| 6. 暴击倍率 | `1.5` + 灵根 `CRIT_DAMAGE` 值 | 惊雷灵根为 1.8 |
| 7. 随机浮动 | `random.nextInt(-5, 6)` → **-5 ~ +5** | 加减法，非百分比 |
| 8. 怪物防御 | `- monster.getDefense() / 3`（整数除法） | 防御只抵消 1/3 |
| 9. 保底 | `Math.max(1, ...)` | 伤害永不为 0 |
| 10. 功法增伤 | `× techDamageMult`，`= 1 + getEquippedCombatDamageBonus(playerId)` | 战前取一次 |

::: warning 暴击率上限 60%
源码注释明确：`// 暴击率随速度收益递减，上限 60%（原 speed/200 后期必暴击）`。灵根 `CRIT_CHANCE` 的加成是在**取 min 之后**再加的，因此理论上限是 `0.6 + 灵根值`（太乙金灵根为 0.65）。
:::

## 伤害公式（PVE 怪物 → 玩家）

```java
int adjustedDefense = (int)(playerService.getFinalDefense(defender) * (1 - debuff));
int finalDamage = Math.max(1, attacker.getAttack() + random.nextInt(-4, 5) - adjustedDefense / 3);
```

返回后还要依次施加三层减伤：

| 顺序 | 减伤来源 | 公式 | 上限 |
| --- | --- | --- | --- |
| 0 | 灵根 `DAMAGE_REDUCTION` | `× (1 - effectValue)`，厚土灵根 0.15 | — |
| 1 | 防御型技能 | `max(1, damage × (100 - min(90, pct)) / 100)` | 90% |
| 2 | 功法 `damage_reduction` | `max(1, damage × (1 - techReduction))` | — |
| 3 | 阵法防御加成 | `max(1, damage × (1 - formationReductionPct / 100.0))` | — |

怪物侧随机浮动是 `nextInt(-4, 5)` → **-4 ~ +4**（比玩家的 -5~+5 略窄），且**没有暴击**。

### 防御型技能

`tryUseDefensiveSkill` 在战斗开始时（第 0 回合）自动运转所有 `skillType == 2` 的技能，减伤百分比 = **蓝耗 × 50 / 100**（整数除法，即蓝耗的一半），硬上限 **30%**，并取 `Math.max` 与已有减伤合并。多个防御技能取最大值而非累加。

## 先手判定与回合上限

```java
boolean playerFirst = playerService.getFinalSpeed(player) >= monster.getSpeed();
```

速度**大于等于**怪物速度即玩家先手，平手算玩家先手。

| 模式 | 先手规则 | 回合上限 |
| --- | --- | --- |
| PVE 单人 | `getFinalSpeed(player) >= monster.getSpeed()` → 玩家先手 | 30 |
| PVP | `getFinalSpeed(challenger) >= getFinalSpeed(target)` → 挑战方先手 | 20 |
| 团队 Boss | 固定为玩家全员先动，之后 Boss 随机攻击一名存活成员 | 50 |

## 技能冷却与回合内动作顺序

技能冷却由内部类 `SkillCooldown` 控制，单位是**回合数**而非秒：

```java
boolean isReady(Skill skill, int currentRound) {
    Integer last = lastUsedRound.get(skill.getId());
    return last == null || currentRound - last >= 2;   // 用后隔一回合才恢复
}
```

| 先手方 | 顺序 |
| --- | --- |
| 玩家先手 | 灵根回复 → 治疗判定（成功则**整个回合结束**） → 玩家攻击 → 若怪物未死则怪物攻击 → 反弹判定 |
| 怪物先手 | 灵根回复 → 怪物攻击 → 反弹判定 → 治疗判定 → 玩家攻击 |

::: tip 治疗会"占用"一次出手
`processPveRoundPlayerFirst` 中若 `tryUseHealSkill` 返回 `true`，函数立即 `return false` —— 本回合**玩家和怪物都不再出手**。怪物先手的 `processPveRoundMonsterFirst` 中怪物已经打完，治疗不会取消本回合的玩家攻击。
:::

### 治疗、法力、灵根回复与反弹

治疗技能 `skillType == 1`，触发条件为**当前血量 ≤ 最大血量的一半**：

```java
if (state.playerHp > player.getMaxHp() / 2) return false;
int healAmount = skill.getHealAmount() + (int)(skill.getHealAmount() * (skill.getLevel() - 1) * 0.15);
state.playerHp = Math.min(player.getMaxHp(), state.playerHp + healAmount);
```

治疗量同样按每级 +15% 缩放，且封顶于最大生命值。

| 项目 | 公式 |
| --- | --- |
| 技能蓝耗 | `mpCost + (int)(mpCost × (level-1) × 0.15)` |
| 灵根 `MP_COST_REDUCTION` | `× (1 - effectValue)`，玄冥水灵根 0.20 |
| 当前法力扣除 | `state.playerMp = Math.max(0, state.playerMp - mpOut[0])` |
| 灵根 `REGENERATION` 回血 | 每回合开始 `min(maxHp, hp + (int)(maxHp × effectValue))`，青帝木灵根 0.03 |
| 伤害反弹 | `Math.max(1, mDamage * reflectPercent / 100)`，反射丹 120 秒内 30% |

灵根回复在 PVP 中双方都会应用（`applyRegeneration`）；反弹来源是 `BuffService.getReflectionPercent(playerId)`。反弹行为差异：

| 场景 | 行为 |
| --- | --- |
| PVE 玩家先手 | 怪物打完后判定，可**反杀怪物**（返回 `true` 判定玩家胜利） |
| PVE 怪物先手 | 怪物打完后先判定反弹，再判定治疗与玩家攻击 |
| PVP | 防守方反弹伤害给攻击方，**可反杀攻击方**（此时胜者变为防守方） |

## 战斗策略

指令：`/战斗策略 <猛攻|均衡|防守>`（别名 `/战术`、`/tactic`），玩法模块 `skill`。策略持久化在 `players.battle_strategy`，默认 `balanced`（`getTactic` 在字段为 null 时回退 `"balanced"`）。

| 别名集合 | 内部值 | 实际效果（PVP） |
| --- | --- | --- |
| `猛攻` / `aggressive` / `进攻` / `猛` | `aggressive` | `mpReserve = 0`；技能按 `calculateScaledDamage` **降序**取伤害最高者 |
| `均衡` / `balanced` / `平衡` / `均` | `balanced` | `mpReserve = 0`；技能同样按伤害降序取最高者 |
| `防守` / `defensive` / `防御` / `守` | `defensive` | `mpReserve = currentMp / 2`；**保留一半法力**，`currentMp <= mpReserve` 时放弃技能改用普攻 |

```java
int mpReserve = isDefensive ? Math.max(0, currentMp / 2) : 0;
Skill attackSkill = selectAttackSkill(skills, currentMp, mpReserve, attackerRoot, isAggressive, cooldown, round);
```

`calculateScaledDamage(skill)` = `skill.damage + (int)(skill.damage × (level-1) × 0.15)`，与技能实际基础伤害公式一致。

::: warning 战斗策略只影响 PVP；猛攻与均衡在代码路径上等价
`getTactic` 只在 `executePvp` 中被读取，并通过 `processPvpRound` 传入 `calculatePvpDamage`。PVE 的 `calculatePlayerDamageToMonster` 签名里**没有策略参数**，其技能选择是"按列表顺序取第一个可用攻击技能"。因此 `/战斗策略` 对打野外怪、Boss、秘境怪均无效果。

即使是在 PVP 中，`isAggressive` 也只被用于日志文案（`tacticText = isAggressive ? "猛攻" : ...`），技能排序与法力保留在猛攻/均衡下完全一致。源码注释亦写明：`// 默认（均衡）与猛攻都优先选择伤害最高的可用技能；防守由 mpReserve 控制保留法力`。
:::

## 野外怪物模板

`com.mtxgdn.onebot.command.pvp.PvpCommand.MONSTERS` 的 4 只固定怪，构造参数顺序为 `(名称, HP, 攻击, 防御, 速度, 境界, 是否Boss, 掉落表, 掉落率, 经验, 金币, 灵石, 描述)`：

| 名称 | HP | 攻击 | 防御 | 速度 | 境界 | 掉落率 | 经验 | 金币 | 灵石 | 掉落表 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 野猪精 | 80 | 20 | 50 | 3 | 3 | 0.30 | 100 | 20 | 5 | 灵草种子、回血丹 |
| 青狼 | 100 | 30 | 70 | 4 | 4 | 0.40 | 150 | 30 | 8 | 灵草种子、回血丹、回蓝丹 |
| 黑熊妖 | 150 | 60 | 100 | 5 | 5 | 0.35 | 200 | 40 | 10 | 回血丹、回蓝丹、回灵丹 |
| 白骨精 | 180 | 40 | 150 | 6 | 6 | 0.30 | 250 | 50 | 15 | 回蓝丹、回灵丹、修炼丹 |

这些怪物属性**固定，不随玩家境界缩放**。`handleFight` 每次都会 new 一个副本再交给战斗，避免 `monster.hp` 被上一场战斗改坏。

## Boss

::: tip 三种 Boss 不是一回事
本页讲的是**个人 PVE Boss**（一次性对手，血量只属于你这一场）与**团队 Raid Boss**（血量属于这一队）。
另有一种**世界 Boss**：血量全服共享、直接落库、奖励按伤害比例分红，
见[世界 Boss](/player/world-boss)。
:::

### 千年妖王（`/讨伐 讨伐`）

| 项目 | 值 | 项目 | 值 |
| --- | --- | --- | --- |
| HP | 500 | 境界 | 5 |
| 攻击 | 200 | 是否 Boss | `true` |
| 防御 | 100 | 掉落表 | 修炼丹、灵剑 |
| 速度 | 80 | 掉落率 | 0.50 |
| 经验 / 金币 / 灵石 | 500 / 100 / 50 | 描述 | 千年妖王，修为深厚，已修炼出人形 |

### 团队 Boss（`/boss boss <名字...>`）

使用 `PvpCommand.BOSS_FORMS` 三形态（与秘境副本共用同一套 `BossForm` 结构）：

| 形态 | 名称 | HP 倍率 | 攻击倍率 | 防御倍率 | 速度倍率 | 玩家削弱 | 掉落概率 | 奖励表 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 千年妖王·人形 | 1.0 | 1.0 | 1.0 | 1.0 | 10% | 0.5 | 空 |
| 1 | 千年妖王·兽形 | 1.2 | 1.3 | 1.1 | 0.9 | 15% | 0.6 | 空 |
| 2 | 千年妖王·狂暴 | 1.5 | 1.5 | 1.3 | 0.7 | 20% | 0.8 | 空 |

```java
int totalHp = 0;
for (BossForm form : bossForms) totalHp += (int)(form.getHpMultiplier() * 500 * (bossForms.indexOf(form) + 1));
// 单体面板：HP = hpMult × 500 × (index+1)，攻击 = 500 × atkMult，防御 = 300 × defMult，速度 = 100 × spdMult
```

| 形态 | HP | 攻击 | 防御 | 速度 |
| --- | --- | --- | --- | --- |
| 0 | 500 | 500 | 300 | 100 |
| 1 | 1200 | 650 | 330 | 90 |
| 2 | 2250 | 750 | 390 | 70 |

总血量 500 + 1200 + 2250 = **3950**。形态按剩余 HP 百分比推进：`< 66%` → 形态 1，`< 33%` → 形态 2，只升不降。玩家削弱 `playerDebuffPercent` 双向生效：玩家造成的伤害 `damage = damage * (1 - debuff)`，同时玩家防御在减伤计算中也被 `adjustedDefense = getFinalDefense * (1 - debuff)` 削弱。

::: warning `/boss boss ...` 这条入口不发放任何奖励
`CombatService.raidBossFight` 本身只做战斗结算与 HP 回写，**不发放经验/金币/灵石/物品**；奖励逻辑写在调用方 `SecretRealmService.enterRaid` 中。而 `PvpCommand.handleRaidBoss` 只把 `RaidCombatResult` 格式化成战报文本，没有任何发奖代码，`BOSS_FORMS` 的 `rewardTable` 也都是 `new String[0]`。因此走这个入口打完团队 Boss，玩家只会得到战报与可能被打空的 HP（进入重伤），没有任何收益。想要团队 Boss 掉落请走 `/进入秘境 <raid秘境名>` 的副本流程。

另外该入口要求 `playerIds.size() >= 2`，否则提示 `团队Boss战需要至少2名玩家！用法：/boss <玩家1> <玩家2> ...`。
:::

## 战斗奖励

### 胜利结算（`buildPveResult`）

| 产出 | 公式 / 修正 |
| --- | --- |
| 经验 | `monster.expReward` → 天象 `applyCombat` → 灵根 `MONSTER_EXP` `× (1 + effectValue)`（金火灵根 0.25） |
| 金币 | `monster.goldReward` → 天象 `applyCombat` |
| 灵石 | `monster.spiritStoneReward` → 天象 `applySpiritStone` → 灵根 `SPIRIT_STONE_DROP` `× (1 + effectValue)`（火土木三灵根 0.20） |
| 物品 | `dropChance = monster.lootChance × SeasonService.getDropMultiplier()`，命中则从 `lootTable` 随机 1 件 |

季节掉落倍率：春 1.05 / 夏 1.00 / 秋 1.15 / 冬 0.90。

### 战败结算

`hpLost = Math.max(0, initialHp - Math.max(0, playerHp))`，`message` 为 `被【X】击败，损失了 N 点生命值`。

战败**没有额外惩罚**（不掉物品、不掉经验），只是 HP 会被写成战后真实值，可能为 0 从而进入重伤。

### 战后持久化与熟练度

无论胜负，都会：

1. `addSkillProficiency(playerId, usedSkillIds)`：本场使用过的每个技能熟练度 +15；
2. `player.setHp(...)` / `player.setMp(...)` + `updatePlayer`，写入**真实战后** HP/MP；
3. 触发插件事件 `COMBAT_ENDED`，携带 `playerId`、`monsterName`、`playerWon`。

PVP 额外调用 `DailyService.onBattle(playerId)` 递增 `player_daily.battle_count`，并触发每日机缘：`battleCount >= 1` 且未领 → 金币 `(realm+1) × 200`。

## 怪物生成公式

`Monster.random(realm, random)` 的基准值：`baseAtk = 5 + realm*12`、`baseDef = 2 + realm*4`、`baseSpd = 3 + realm*2`、`baseHp = 30 + realm*35`，实际值在此基础上加一段随机量。

| 项目 | `Monster.random(realm, random)` | `Monster.createBoss(name, realm, desc, random)` |
| --- | --- | --- |
| 掉落率 | `0.30 + nextDouble() × 0.15` → 0.30~0.45 | `0.60 + nextDouble() × 0.25` → 0.60~0.85 |
| 经验 | `realm*80 + nextLong(realm*40 + 10)` | `realm*250 + nextLong(realm*120 + 50)` |
| 金币 | `nextLong(realm*20 + 10)` | `nextLong(realm*80 + 30)` |
| 灵石 | `nextLong(realm*10 + 5)` | `nextLong(realm*40 + 20)` |
| HP | `baseHp + nextInt(realm*20 + 10)` | `80 + realm*120 + nextInt(realm*60 + 30)` |
| 攻击 | `baseAtk + nextInt(realm*8 + 5)` | `15 + realm*30 + nextInt(realm*15 + 10)` |
| 防御 | `baseDef + nextInt(realm*3 + 2)` | `8 + realm*12 + nextInt(realm*6 + 5)` |
| 速度 | `baseSpd + nextInt(realm*3 + 1)` | `5 + realm*5 + nextInt(realm*4 + 3)` |

* 名称：`MONSTER_PREFIXES`（14 个）× `MONSTER_NAMES`（12 个）拼接，共 168 种。前缀池：烈焰、冰霜、暗影、血牙、铁甲、疾风、毒雾、岩石、幽冥、金翅、霜月、邪眼、嗜血、枯骨；名称池：妖狼、巨蟒、魔蛛、赤虎、黑熊、妖鹰、石魔、蛇妖、蝎王、魅狐、尸鬼、蝠妖。
* `createBossForRealm(realm, random)` 先取 `effectiveRealm = max(0, realm - 1)` 选名称与描述，再调 `createBoss(name, max(1, effectiveRealm), desc, random)`。

## 重伤与疗伤

### 重伤状态

重伤即 `players.hp <= 0`（战后 `Math.max(0, playerHp)` 写入）。重伤会阻断以下行为：

| 被阻断的行为 | 提示 |
| --- | --- |
| `/游历` | `你已重伤，无法游历，请先恢复生命值` |
| `/进入秘境` | `你已重伤，无法进入秘境，请先恢复生命值` |
| PVE 战斗 | `你的生命值不足，无法战斗` |
| 团队 Boss 战 | `你的生命值不足，无法参加Boss战` |
| PVP 挑战（发起方） | `你的生命值不足，无法发起挑战` |
| PVP 挑战（目标） | `对手已阵亡，无法挑战` |

### 疗伤指令

`/疗伤`（别名 `heal`），权限 `game.player.info`，玩法模块 `player`。

| 项目 | 内容 |
| --- | --- |
| 消耗 | `(player.getRealm() + 1) × 50` 灵石（按**下品等值**扣除） |
| 效果 | `UPDATE players SET hp = max_hp, mp = max_mp` —— **生命与法力同时回满** |
| 已满血 | 直接返回 `你的生命值已满，无需治疗。`，不扣灵石 |
| 灵石不足 | `灵石不足！疗伤需要 N 灵石，你只有 M 灵石。\n你可以服用回血丹回复生命，或等待自然恢复。` |

### 离线自然恢复

`OfflineRewardService.recoverHpMp` 在玩家上线时结算（`last_offline_time` 距今 ≥ 30 秒才触发），恢复比例 `recoverPercent = Math.min(1.0, elapsedSeconds / 60.0 * 0.02)`。

| 项目 | 值 |
| --- | --- |
| 恢复速度 | 每离线 1 分钟恢复最大值的 **2%** |
| 恢复上限 | 100%（即离线 50 分钟即回满） |
| 离线结算上限 | `MAX_OFFLINE_SECONDS = 8 × 3600`（8 小时） |
| 法力恢复 | 同样按 `recoverPercent` 比例恢复 |

::: tip 离线恢复只按"最大值百分比"，与当前血量无关
`hpRecovered = (int)(maxHp * recoverPercent)`，再经 `addHp` 内部封顶。因此从 1 点血和从半血开始离线，只要离线时长相同，恢复量就相同。
:::

### 其他恢复途径

| 途径 | 说明 |
| --- | --- |
| 丹药 | 回血丹 +50、大回血丹 +200、回灵丹 +100 生命/+80 法力、仙丹 +500/+500 |
| 游历事件 `spirit_spring` | 回血 `maxHp/4 + nextInt(maxHp/4)`，回蓝同理 |
| 灵根 `REGENERATION` | 战斗中每回合回 `maxHp × 3%` |
| 治疗技能 | `skillType == 1`，血量 ≤ 50% 时自动释放 |
| 阵法 | 护山大阵提供 `formationReductionPct` 减伤，间接提升生存 |
