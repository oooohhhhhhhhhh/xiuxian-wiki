# 技能系统

技能是**战斗中的主动手段**：攻击型技能替代普通攻击打出更高伤害，治疗型技能在血量过半时自动回血，
防御型技能开局自动运转、提供整场战斗的减伤。技能**不需要装备**，学会即参与战斗（受法力与冷却约束）。

- 玩法模块：`skill`（`built_in_plugins.skill`，默认启用）
- 数据表：`skills`（技能定义）、`players_skills`（角色已学技能与等级/熟练度）
- 服务：`com.mtxgdn.game.service.SkillService`
- 指令：`com.mtxgdn.onebot.command.combat` 下的 `SkillsCommand`、`LearnSkillCommand`、`BattleTacticCommand`
- 战斗结算：`com.mtxgdn.game.service.CombatService`

## 技能全表

数据来自 `SkillService.insertDefaultSkills()`，服务启动时写入（`INSERT` 冲突会被忽略，已有同 ID 数据不会被覆盖）。
`required_realm` 对应境界 ID：0 凡人、1 炼气期、2 筑基期、3 金丹期、4 元婴期、5 化神期、6 合体期、7 大乘期、8 渡劫期、9 真仙、10 金仙。

| ID | 名称 | 类型 | 境界要求 | 学习金币 | 学习灵石 | 伤害 | 治疗 | 法力消耗 | 冷却字段 | 等级上限 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 烈火掌 | 攻击 | 炼气期 | 100 | 50 | 30 | — | 10 | 3 | 10 |
| 2 | 玄冰刺 | 攻击 | 筑基期 | 500 | 200 | 60 | — | 20 | 5 | 10 |
| 3 | 天雷咒 | 攻击 | 金丹期 | 2000 | 500 | 100 | — | 35 | 8 | 10 |
| 4 | 万剑诀 | 攻击 | 元婴期 | 5000 | 1000 | 180 | — | 50 | 10 | 10 |
| 5 | 回春术 | 治疗 | 凡人 | 200 | 100 | — | 60 | 15 | 10 | 10 |
| 6 | 甘霖普降 | 治疗 | 筑基期 | 800 | 300 | — | 150 | 30 | 15 | 10 |
| 7 | 风驰电掣 | 防御 | 炼气期 | 300 | 150 | — | — | 10 | 20 | 10 |
| 8 | 金刚护体 | 防御 | 筑基期 | 600 | 250 | — | — | 20 | 30 | 10 |
| 9 | 基础剑诀 | 攻击 | 凡人 | 50 | 20 | 20 | — | 8 | 2 | 10 |
| 10 | 紫霄神雷 | 攻击 | 合体期 | 20000 | 8000 | 300 | — | 80 | 12 | 10 |
| 11 | 焚天圣火 | 攻击 | 大乘期 | 50000 | 20000 | 450 | — | 120 | 15 | 10 |
| 12 | 混沌剑气 | 攻击 | 渡劫期 | 120000 | 50000 | 650 | — | 180 | 18 | 10 |
| 13 | 大道归一 | 攻击 | 真仙 | 300000 | 150000 | 900 | — | 250 | 20 | 10 |
| 14 | 天元回春 | 治疗 | 合体期 | 30000 | 10000 | — | 800 | 60 | 12 | 10 |
| 15 | 万象归元 | 治疗 | 大乘期 | 80000 | 30000 | — | 2000 | 90 | 15 | 10 |

技能类型由 `skill_type` 决定，`Skill` 实体只提供两个判定方法：

| `skill_type` | 判定方法 | 战斗行为 |
| --- | --- | --- |
| `0` | `isAttackSkill()` | 作为攻击手段参与选招 |
| `1` | `isHealSkill()` | 血量低于 50% 时优先释放 |
| `2` | 直接比较 `getSkillType() == 2` | 战斗**开局自动运转**，本场战斗减伤 |

::: warning `cooldown_seconds` 目前不参与战斗回合判定
该字段被写入 `skills` 表并映射到 `Skill.getCooldownSeconds()`，但 `CombatService` 的技能冷却用的是回合制硬编码规则
（`SkillCooldown.isReady`：同一技能**距上次使用至少 2 回合**才能再用），并未读取 `cooldown_seconds`。
表中的数值目前只是策划标注。
:::

## 学习条件与消耗

`SkillService.learnSkill(playerId, skillId)` 按顺序校验，失败时返回带错误码的结果：

| 顺序 | 校验 | 失败信息 | `code` |
| --- | --- | --- | --- |
| 1 | 技能存在 | `技能不存在` | 6101 |
| 2 | 未学过该技能 | `你已经学会了【X】` | 6102 |
| 3 | 角色存在 | `角色不存在` | 3001 |
| 4 | `player.realm >= skill.required_realm` | `境界不足，学习【X】需要达到更高境界` | 6103 |
| 5 | 金币足够（`player.gold >= learn_cost_gold`） | `金币不足，学习【X】需要 N 金币` | 6104 |
| 6 | 灵石足够（仅当 `learn_cost_spirit_stones > 0`） | `灵石不足，学习【X】需要 N 灵石` | 6104 |

通过后在**同一事务**内扣金币、扣灵石并插入 `players_skills (level = 1, proficiency = 0)`；
异常时整体回滚，返回 `学习技能失败: ...`（`code 6106`）。

学习成功还会触发两个副作用：

- `DailyService.onSkillLearn(playerId)` —— 每日任务进度；
- **自动授予称号「剑道学徒」**（`sword_student`），已拥有时静默跳过。

## 学习 / 升级指令

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `/技能` | `skills` | 列出全部技能：`[ID:1] 烈火掌 境界要求:炼气期 金币:100` |
| `/技能 升级 <技能ID>` | `upgrade` | 消耗熟练度提升技能等级 |
| `/学习 <技能名称或ID>` | `learn` | 学习技能，支持中文名或数字 ID |

- `/学习` 的参数若不是数字，会走 `SkillService.findSkillByName`（**名称完全相等或包含**即命中，取第一个匹配）。
- 权限：`/技能` 需要 `game.player.info`，`/学习` 需要 `game.skill.learn`。
- 战斗策略指令见下文；技能指令类**没有注册任何 HTTP 路由**，Web 端通过 WebSocket 指令通道调用。

### 熟练度与升级

熟练度的两个来源与两套换算：

| 场景 | 规则 | 代码位置 |
| --- | --- | --- |
| 战斗结算 | 本场战斗**用过的每个技能**各 +15 熟练度 | `CombatService.addSkillProficiency` |
| 灵根加成 | 拥有 `PROFICIENCY_BOOST` 效果的灵根，获取量 ×(1 + 效果值) | `SkillService.addProficiency` |
| 自动升满 | 累计熟练度达到 `当前等级 × 100` 时自动升级，可连续升级，最高 10 级 | `getProficiencyForNextLevel` |
| 手动升级 | `/技能 升级` 要求熟练度 ≥ `100 × (当前等级 + 1)`，一次性扣除该数量 | `SkillsCommand.upgradeSkill` |

::: warning 自动升级与手动升级的阈值不一致
`SkillService.getProficiencyForNextLevel(level) = level × 100`，而 `/技能 升级` 要求 `100 × (level + 1)`。
例如 1 级技能：战斗中累计 100 点即自动升到 2 级；但若想用指令手动升，需要 200 点。
两者是两套独立逻辑，源码如此。
:::

### 秘籍学习（道具升级技能）

`SkillService.learnSkillFromBook` 供秘籍类道具调用：

- 未学过：直接学会（1 级），只校验境界，**不消耗金币/灵石**；
- 已学过且未满级：等级 +1；
- 已满级：返回 `【X】已达满级 N 级，这本秘籍对你已无用处`。

## 技能在战斗中的作用

### 选招顺序

战斗每回合按固定优先级决策（PVP 与 PVE 共用同一套函数）：

1. **治疗优先**：血量 ≤ 50% 且法力够，且有可用治疗技能 → 释放治疗（`tryUseHealSkill`）。
2. **攻击技能**：在法力够、冷却就绪的攻击技能中选**缩放伤害最高**的一个（`selectAttackSkill`，按 `calculateScaledDamage` 降序）。
3. **普通攻击**：无可用技能时，PVP 用 `最终攻击`，PVE 用 `最终攻击 + 最终神识`。
4. **防御技能**：不占用回合，战斗**开局**一次性全部尝试运转（`tryUseDefensiveSkill`）。

### 数值公式

| 项目 | 公式 | 说明 |
| --- | --- | --- |
| 技能伤害 | `damage + damage × (level − 1) × 0.15` | 每级 +15% 基础伤害 |
| 技能法力消耗 | `mp_cost + mp_cost × (level − 1) × 0.15` | 每级 +15% 蓝耗 |
| 治疗量 | `heal_amount + heal_amount × (level − 1) × 0.15` | 每级 +15% 治疗 |
| 防御技能减伤 | `min(30, 实际蓝耗 × 50 / 100)`（%） | 蓝耗越高减伤越高，上限 30% |
| 技能冷却 | 距上次使用 ≥ 2 回合 | `SkillCooldown` 固定规则 |
| 暴击率 | `min(0.6, 最终速度 / 400) + 灵根暴击加成` | 上限 60% |
| 伤害浮动 | `±5`（`random.nextInt(-5, 6)`） | 每次结算 |
| 最终伤害 | `max(1, 基础伤害 + 浮动 − 防御 / 3)` | 再依次乘功法/阵法/技能减伤 |

防御技能的实际减伤（按 1 级与 10 级对比，未计灵根蓝耗减免）：

| 技能 | 1 级蓝耗 | 1 级减伤 | 10 级蓝耗 | 10 级减伤 |
| --- | --- | --- | --- | --- |
| 风驰电掣 | 10 | 5% | 23 | 11% |
| 金刚护体 | 20 | 10% | 47 | 23% |

### 减伤叠加顺序

攻击方伤害先乘**功法伤害倍率**，随后防守方按顺序削减：

```java
// CombatService.processPvpRound
if (attackerState.techDamageMult > 1.0) damage = (int) (damage * attackerState.techDamageMult);   // 功法
damage = applyDamageReduction(damage, defenderState.damageReductionPercent);                       // 防御型技能，上限 90%
if (defenderState.techReduction > 0) damage = Math.max(1, (int) (damage * (1 - defenderState.techReduction))); // 功法减伤
if (defenderState.formationReductionPct > 0) damage = Math.max(1, (int) (damage * (1 - pct / 100.0)));        // 阵法
```

每一层都保底 1 点伤害。

## 战斗策略

`/战斗策略` 写入 `players.battle_strategy`，战斗中由 `CombatService.getTactic` 读取（为空时按 `balanced` 处理）。

| 策略 | 指令别名 | 战斗中的实际效果 |
| --- | --- | --- |
| 猛攻 `aggressive` | `进攻`、`猛`、`aggressive` | 标记为猛攻（战斗日志中显示"猛攻"），不保留法力 |
| 均衡 `balanced` | `平衡`、`均`、`balanced` | 默认策略，不保留法力 |
| 防守 `defensive` | `防御`、`守`、`defensive` | 法力保留一半（`mpReserve = 当前法力 / 2`），低于该线不再放技能，战斗日志显示"沉稳" |

::: tip 猛攻与均衡的差异
`selectAttackSkill` 对两者都选"缩放伤害最高"的技能，区别只体现在日志标注上；
真正改变行为的是**防守**——它通过保留一半法力限制技能释放频率，从而延长战斗、减少被秒风险。
:::

指令用法：

```text
/战斗策略            查看当前策略
/战斗策略 猛攻       切换为猛攻
/战斗策略 均衡       切换为均衡
/战斗策略 防守       切换为防守
```

## `skills` 与 `players_skills` 表字段

`skills`（技能定义）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 技能 ID |
| `name` / `description` | VARCHAR | 名称与描述 |
| `required_realm` | INT | 学习所需境界 ID |
| `learn_cost_gold` | BIGINT | 学习金币 |
| `learn_cost_spirit_stones` | BIGINT | 学习灵石 |
| `damage` | INT | 基础伤害（治疗/防御技能为 0） |
| `mp_cost` | INT | 基础法力消耗 |
| `cooldown_seconds` | INT | 冷却字段（当前战斗未使用） |
| `skill_type` | INT | 0 攻击 / 1 治疗 / 2 防御 |
| `heal_amount` | INT | 基础治疗量 |
| `max_level` | INT | 等级上限（默认 10） |

`players_skills`（角色技能）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `player_id` + `skill_id` | BIGINT | 联合唯一键，一个角色一条技能记录 |
| `level` | INT | 当前等级，默认 1 |
| `proficiency` | INT | 熟练度 |
| `created_at` / `updated_at` | TIMESTAMP | 时间戳 |

## 与功法、称号的区别

| 维度 | 技能 | 功法 |
| --- | --- | --- |
| 生效方式 | 学会即参与战斗，无需装备 | 必须**装备**（最多 3 门）才加属性 |
| 主要作用 | 战斗中的主动输出 / 治疗 / 减伤 | 永久属性加成 + 修炼速度 + 战斗倍率 |
| 成长方式 | 熟练度升级（战斗使用累积） | 花金币与灵石升级，属性按等级缩放 |
| 是否消耗 | 学习消耗金币 + 灵石 | 学习、升级都消耗金币 + 灵石 |

详见 [功法系统](./techniques)。

## 相关页面

- [PVE 战斗](./combat) —— 技能在打怪中的完整回合流程
- [PVP 对战](./pvp) —— 每日 10 次切磋与技能对抗
- [功法系统](./techniques) —— 属性与倍率加成
- [灵根系统](./spiritual-root) —— 技能伤害 / 蓝耗 / 熟练度加成的来源
- [玩家玩法总览与全指令表](./)
