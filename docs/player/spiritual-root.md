# 灵根系统

灵根（`SpiritualRoot`）是角色创建时抽取的**终身天赋**，决定基础属性加成、一条特殊效果以及修炼/战斗/经济等系统的额外收益。全部灵根定义在单个枚举里：`src/main/java/com/mtxgdn/game/entity/SpiritualRoot.java`。

相关源码：

| 关注点 | 文件 |
| --- | --- |
| 灵根与特效定义 | `src/main/java/com/mtxgdn/game/entity/SpiritualRoot.java` |
| 查看 / 重铸指令 | `src/main/java/com/mtxgdn/onebot/command/player/SpiritualRootCommand.java` |
| 管理员改灵根 | `src/main/java/com/mtxgdn/onebot/command/admin/SetRootCommand.java` |
| 创建角色抽取 | `src/main/java/com/mtxgdn/game/service/PlayerService.java`（`createPlayer`） |
| 重铸后属性重算 | `PlayerService.updateSpiritualRoot` |

## 一、指令

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `/灵根` | `/spiritualroot`、`/talent` | 查看灵根天赋（名称/品级/描述/属性加成/特殊效果） |
| `/灵根 重铸` | `/灵根 recast` | 重铸灵根，随机抽取一个新灵根 |
| `/修改灵根 <玩家ID> <灵根名称>` | `/setroot`、`/设置灵根` | 管理员私聊指令，需要 `admin.status` 权限；`/修改灵根 list` 列出全部枚举名 |

## 二、全部灵根

属性加成为**比例**（小数），实际生效时按 `base + (int)(base × 比例)` 计算。

| 枚举名 | 名称 | 品级 | 攻击 | 生命 | 法力 | 神识 | 防御 | 速度 | 特殊效果 | 效果值 | 抽取权重 | 初始可抽 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `HONGMENG` | 鸿蒙灵根 | PRIMORDIAL | +30% | +30% | +30% | +30% | +30% | +15% | `ALL_EFFECTS_ENHANCE` | 0.5 | 1 | ✅ |
| `TRUE_FIVE_ELEMENTS` | 正·五行灵根 | PERFECT | +25% | +25% | +25% | +25% | +25% | +10% | `FIVE_ELEMENTS_AFFINITY` | 1.0 | 1 | ❌ |
| `TAIYI_GOLDEN` | 太乙金灵根 | HEAVENLY | +15% | — | — | +5% | — | — | `CRIT_CHANCE` | 0.05 | 3 | ✅ |
| `QINGDI_WOOD` | 青帝木灵根 | HEAVENLY | — | +15% | — | — | — | +5% | `REGENERATION` | 0.03 | 3 | ✅ |
| `XUANMING_WATER` | 玄冥水灵根 | HEAVENLY | — | — | +15% | — | +5% | — | `MP_COST_REDUCTION` | 0.20 | 3 | ✅ |
| `LIHUO_FIRE` | 离火灵根 | HEAVENLY | +10% | — | — | +5% | — | +5% | `DAMAGE_BOOST` | 0.10 | 3 | ✅ |
| `HOUTU_EARTH` | 厚土灵根 | HEAVENLY | — | +10% | — | — | +15% | — | `DAMAGE_REDUCTION` | 0.15 | 3 | ✅ |
| `XUNFENG_WIND` | 巽风灵根 | VARIANT | +5% | — | — | — | — | +15% | `EXPLORATION_CD` | 0.30 | 5 | ✅ |
| `JINGLEI_THUNDER` | 惊雷灵根 | VARIANT | +5% | — | — | +15% | — | — | `CRIT_DAMAGE` | 0.30 | 5 | ✅ |
| `XUANBING_ICE` | 玄冰灵根 | VARIANT | — | — | +10% | — | +10% | — | `SKILL_DAMAGE` | 0.15 | 5 | ✅ |
| `GOLDEN_FIRE` | 金火灵根 | DUAL | +8% | — | — | +4% | — | — | `MONSTER_EXP` | 0.25 | 10 | ✅ |
| `WOODEN_WATER` | 木水灵根 | DUAL | — | +8% | +8% | — | — | — | `CULTIVATION_EFFICIENCY` | 0.15 | 10 | ✅ |
| `EARTHEN_GOLD` | 土金灵根 | DUAL | +4% | — | — | — | +8% | — | `TRADE_FEE_HALF` | 0.50 | 10 | ✅ |
| `FIRE_WOOD_EARTH` | 火土木灵根 | TRIPLE | +2% | +2% | — | — | +2% | — | `SPIRIT_STONE_DROP` | 0.20 | 10 | ✅ |
| `GOLDEN_WATER_WOOD` | 金水木灵根 | TRIPLE | — | — | +2% | +2% | — | +2% | `PROFICIENCY_BOOST` | 0.30 | 10 | ✅ |
| `FOUR_ELEMENTS` | 四象灵根 | QUAD | +2% | +2% | — | — | +2% | — | `NONE` | 0 | 14 | ✅ |
| `CHAOS_MIXED` | 混沌灵根 | MIXED | — | — | — | — | — | — | `LATE_BLOOMER` | 0.05 | 6 | ✅ |

### 品级显示名

| Tier 枚举 | 显示名 |
| --- | --- |
| `PRIMORDIAL` | 鸿蒙灵根 |
| `PERFECT` | 正灵根 |
| `HEAVENLY` | 天灵根 |
| `VARIANT` | 异灵根 |
| `DUAL` | 双灵根 |
| `TRIPLE` | 三灵根 |
| `QUAD` | 四灵根 |
| `MIXED` | 杂灵根 |

### 原始描述文本

| 灵根 | 描述 |
| --- | --- |
| 鸿蒙灵根 | 诞生于鸿蒙初辟之时的至高灵根，蕴含宇宙本源之力，所有灵根效果增强50% |
| 正·五行灵根 | 天地间最完美的灵根，五元素100%亲和，万法皆通 |
| 太乙金灵根 | 金系天灵根，锐金之气贯体，攻伐无双 |
| 青帝木灵根 | 木系天灵根，生生不息，枯木亦可逢春 |
| 玄冥水灵根 | 水系天灵根，上善若水，法力如海 |
| 离火灵根 | 火系天灵根，焚尽八荒，威势滔天 |
| 厚土灵根 | 土系天灵根，不动如山，坚不可摧 |
| 巽风灵根 | 异灵根，来去如风，踪迹难寻 |
| 惊雷灵根 | 异灵根，天威浩荡，一击惊雷 |
| 玄冰灵根 | 异灵根，冰封万里，寒彻骨髓 |
| 金火灵根 | 金火双灵根，真金不怕烈火炼 |
| 木水灵根 | 木水双灵根，水木清华，滋养道基 |
| 土金灵根 | 土金双灵根，金石为开，商道亨通 |
| 火土木灵根 | 火土木三灵根，生生不息，厚德载物 |
| 金水木灵根 | 金水木三灵根，道心通明，悟性过人 |
| 四象灵根 | 金木火土四灵根，四象轮转，中正平和 |
| 混沌灵根 | 五行俱全，世人谓之杂灵根，然混沌之中蕴藏无限可能 |

## 三、特殊效果 `SpecialEffect`

完整枚举（17 项）：`NONE`、`CRIT_CHANCE`、`REGENERATION`、`MP_COST_REDUCTION`、`DAMAGE_BOOST`、`DAMAGE_REDUCTION`、`EXPLORATION_CD`、`CRIT_DAMAGE`、`SKILL_DAMAGE`、`MONSTER_EXP`、`CULTIVATION_EFFICIENCY`、`TRADE_FEE_HALF`、`SPIRIT_STONE_DROP`、`PROFICIENCY_BOOST`、`LATE_BLOOMER`、`FIVE_ELEMENTS_AFFINITY`、`ALL_EFFECTS_ENHANCE`。

| 特效 | 效果值 | 实际生效公式 | 生效位置 |
| --- | --- | --- | --- |
| `NONE` | 0 | 无效果 | 四象灵根 |
| `CRIT_CHANCE` | 0.05 | `critChance = min(0.6, finalSpeed / 400.0) + 0.05` | `CombatService`（PVE/PVP 普攻）；`SectService` 宗门战：有该特效时暴击率取 `effectValue`，否则固定 `0.05` |
| `CRIT_DAMAGE` | 0.30 | `critMult = 1.5 + 0.30` | `CombatService`、`SectService` |
| `DAMAGE_BOOST` | 0.10 | `damage × (1 + 0.10)` | `CombatService.applyDamageBoosts`、`SectService` |
| `DAMAGE_REDUCTION` | 0.15 | `damage × (1 − 0.15)`（防御方） | `CombatService`、`SectService` |
| `MP_COST_REDUCTION` | 0.20 | 技能法力消耗 `× (1 − 0.20)` | `CombatService.calculateScaledMpCost` |
| `SKILL_DAMAGE` | 0.15 | 技能基础伤害 `× (1 + 0.15)` | `CombatService.calculateSkillDamage`、`SectService` |
| `REGENERATION` | 0.03 | 每回合回复 `(int)(maxHp × 0.03)` | `CombatService.applyRegeneration`（玩家与团队 Boss 战）、`SectService` |
| `MONSTER_EXP` | 0.25 | 怪物经验 `× (1 + 0.25)`（天象加成后再乘） | `CombatService` PVE 胜利结算 |
| `SPIRIT_STONE_DROP` | 0.20 | 灵石收益 `× (1 + 0.20)` | `CombatService`（怪物灵石）、`SecretRealmService`（宝藏事件）、`DailyService`（晨修灵石） |
| `CULTIVATION_EFFICIENCY` | 0.15 | 修炼倍率 `× (1 + 0.15)` | `PlayerService.cultivationMultiplier`（在线闭关）、`OfflineRewardService`（离线闭关）、`DailyService`（晨修经验） |
| `TRADE_FEE_HALF` | 0.50 | 交易手续费减半：`max(1, baseRate / 2)` | `TradeService.calculateFee`（`TRADE_FEE_RATE = 0.05`） |
| `PROFICIENCY_BOOST` | 0.30 | 技能熟练度增量 `× (1 + 0.30)` | `SkillService.addProficiency` |
| `EXPLORATION_CD` | 0.30 | 游历冷却 `= 300000ms × (1 − 0.30)` = 210 秒 | `ExplorationService.calculateEffectiveCooldown`、`ExploreCommand` |
| `LATE_BLOOMER` | 0.05 | 见下方「混沌灵根机制」 | `HeartDemonService`、`RealmService` |
| `FIVE_ELEMENTS_AFFINITY` | 1.0 | 仅声明，源码中未见消费点 | — |
| `ALL_EFFECTS_ENHANCE` | 0.5 | `effectEnhancementMultiplier() = 1.5`，放大数值型特效 | `FarmService.calculateSpiritualRootBonus` |

::: warning `FIVE_ELEMENTS_AFFINITY` 与「初始可抽」
`TRUE_FIVE_ELEMENTS`（正·五行灵根）是唯一通过三参数构造器 `initializable = false` 声明的灵根。它在**创建角色抽取**（`drawRandom`）中会被跳过，但在**重铸抽取**（`drawRandomForRecast`）中会被纳入随机池。源码中除了枚举声明与 `SpiritualRootCommand` 的格式化分支外，没有检索到该特效的消费点。
:::

### 混沌灵根机制（`LATE_BLOOMER`）

| 场景 | 效果 |
| --- | --- |
| 心魔抗性 | `rootResist += 2.0` |
| 突破成功率 | 品级 `MIXED` 且 `realm >= 4` 时 **+15%**，否则 **−10%** |
| 突破成功 | `bonus = max(1, (int)(5 × 0.05)) = 1`，攻击/防御/速度各加 `(int)(bonus × (1 + 对应灵根比例))`（混沌灵根比例为 0，即各 +1） |
| 渡劫失败 | `bonus = max(1, (int)(3 × 0.05)) = 1`，同样各加 `(int)(bonus × (1 + 比例))` |

### 鸿蒙灵根机制（`ALL_EFFECTS_ENHANCE`）

```java
/** 数值型特效的增强后取值：未持有该特效返回 0，持有则 = 原始值 × 增强系数。 */
public double getEnhancedEffectValue(SpecialEffect e) {
    return effect == e ? effectValue * effectEnhancementMultiplier() : 0;
}

public double effectEnhancementMultiplier() {
    return hasEffect(SpecialEffect.ALL_EFFECTS_ENHANCE) ? 1.5 : 1.0;
}
```

源码注释明确说明：单灵根设定下当前可被放大的只有**农场契合加成路径**（`FarmService` 已 `×1.5`）；`getEnhancedEffectValue` 是预留的统一语义入口。

## 四、灵根在农场中的契合加成

`FarmService.getSpiritualRootBonus(root, cropElement)` 按作物元素类型返回加成比例，随后统一乘 `root.effectEnhancementMultiplier()`（鸿蒙 `×1.5`，其余 `×1.0`）。

| 灵根 | 契合元素加成 | 非契合加成 |
| --- | --- | --- |
| 正·五行灵根 | 全部元素 +20% | — |
| 青帝木灵根 | WOOD +30% | +10% |
| 玄冥水灵根 | WATER +30% | +10% |
| 离火灵根 | FIRE +30% | +10% |
| 厚土灵根 | EARTH +30% | +10% |
| 太乙金灵根 | METAL +30% | +10% |
| 玄冰灵根 | ICE +25% | +5% |
| 巽风灵根 | LIGHT +20% | +5% |
| 惊雷灵根 | FIRE +20% | +5% |
| 金火灵根 | METAL / FIRE +15% | +5% |
| 木水灵根 | WOOD / WATER +15% | +5% |
| 土金灵根 | EARTH / METAL +15% | +5% |
| 火土木灵根 | FIRE / WOOD / EARTH +10% | +3% |
| 金水木灵根 | METAL / WATER / WOOD +10% | +3% |
| 鸿蒙灵根 | 固定 +50%（再 `×1.5`） | — |

## 五、抽取与更换

### 创建角色抽取

`PlayerService.createPlayer` 调用 `SpiritualRoot.drawRandom(new Random())`，即**按权重在 `initializable = true` 的 16 个灵根中抽取**（正·五行灵根被排除）。

```java
private static SpiritualRoot drawRandom(Random random, boolean allowNonInitializable) {
    int effectiveWeight = 0;
    for (int i = 0; i < values.length; i++) {
        if (allowNonInitializable || values[i].initializable) effectiveWeight += WEIGHTS[i];
    }
    int roll = random.nextInt(effectiveWeight);
    // 按枚举声明顺序累加权重，命中即返回
    ...
    return CHAOS_MIXED;   // 兜底
}
```

| 抽取池 | 总权重 | 各灵根概率 |
| --- | --- | --- |
| 初始抽取（`drawRandom`） | **101** | 权重 / 101 |
| 重铸抽取（`drawRandomForRecast`） | **102** | 权重 / 102 |

初始属性在创建时即以灵根加成结算：生命 `applyHpBonus(100)`、法力 `applyMpBonus(50)`、攻击 `applyAttackBonus(10)`、防御 `applyDefenseBonus(5)`、速度 `applySpeedBonus(5)`、神识 `applySpiritBonus(5)`。

### 重铸（`/灵根 重铸`）

| 条件 | 值 |
| --- | --- |
| 境界要求 | `realm >= 3`（金丹期及以上），否则提示「灵根重铸需要达到【金丹期】及以上境界」 |
| 道具消耗 | `mtxgdn:qiankun_zaohua_dan`（乾坤造化丹） × 1 |
| 灵石消耗 | `RECAST_SPIRIT_STONE_COST = 500000` |
| 抽取方式 | `SpiritualRoot.drawRandomForRecast(new Random())`（含正·五行灵根） |

扣道具与扣灵石在同一事务内完成（`DatabaseManager.runTransaction`），任一步失败即回滚。

### 更换后的属性重算

`PlayerService.updateSpiritualRoot` 会把**基础属性按新灵根重新计算**（不是叠加）：

```java
int baseHp = 100, baseMp = 50, baseAtk = 10, baseDef = 5, baseSpd = 5, baseSpi = 5;
// max_hp = applyHpBonus(100)，hp = min(旧hp, 新max_hp)（MySQL 用 LEAST）
// max_mp = applyMpBonus(50)，mp = min(旧mp, 新max_mp)
// attack/defense/speed/spirit 同样按 base × (1 + 灵根比例)
```

::: danger 重铸会重置基础属性
`updateSpiritualRoot` 用 `base` 常量重算攻击/防御/速度/神识，**不保留**此前通过突破、称号共鸣等途径累加的属性。重铸前请确认角色状态。
:::

### 灵根共鸣（长期激励）

`DailyService` 在累计活跃天数达到里程碑时按灵根加成比例发放属性（终身一次，见 `daily.md`）：

| 里程碑 | 奖励 |
| --- | --- |
| `total_active_days == 7` | 生命 `applyHpBonus(50)`、法力 `applyMpBonus(25)`、攻击 `applyAttackBonus(5)`、防御 `applyDefenseBonus(3)`、速度 `applySpeedBonus(3)`、神识 `applySpiritBonus(5)` |
| `total_active_days == 30` | 生命 `applyHpBonus(100)`、法力 `applyMpBonus(50)`、攻击 `applyAttackBonus(10)`、防御 `applyDefenseBonus(5)`、速度 `applySpeedBonus(5)`、神识 `applySpiritBonus(10)` |

## 六、`/灵根` 输出示例

```text
🔮 灵根天赋
══════════
灵根：木水灵根
品级：双灵根
描述：木水双灵根，水木清华，滋养道基

══ 属性加成 ══
生命 +0.08
法力 +0.08

特殊效果：CULTIVATION_EFFICIENCY
效果值：+15% 修炼效率
```

::: details 效果值的显示格式
`SpiritualRootCommand.formatEffect` 对 `CULTIVATION_EFFICIENCY`、`CRIT_CHANCE`、`DAMAGE_BOOST`、`DAMAGE_REDUCTION`、`SKILL_DAMAGE`、`MP_COST_REDUCTION`、`EXPLORATION_CD`、`CRIT_DAMAGE`、`MONSTER_EXP`、`SPIRIT_STONE_DROP`、`PROFICIENCY_BOOST` 按 `× 100` 显示为百分比；`REGENERATION` 直接显示原值（`+0.03%`）；`TRADE_FEE_HALF` 显示为「交易手续费减半」；其余走 `default` 分支输出原始 `double`。
:::

## 七、数据库字段

| 表 | 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| `players` | `spiritual_root` | 字符串 | 存 `SpiritualRoot` 枚举名 |

读取时 `PlayerService.safeParseSpiritualRoot` 兼容旧版元素名（大小写不敏感）：

| 旧值 | 映射到 |
| --- | --- |
| `METAL` | `TAIYI_GOLDEN` |
| `WOOD` | `QINGDI_WOOD` |
| `WATER` | `XUANMING_WATER` |
| `FIRE` | `LIHUO_FIRE` |
| `EARTH` | `HOUTU_EARTH` |
| `WIND` | `XUNFENG_WIND` |
| `THUNDER` | `JINGLEI_THUNDER` |
| `ICE` | `XUANBING_ICE` |
| 其他 | 先尝试 `valueOf`，失败回退 `CHAOS_MIXED` |

空值或空白字符串同样回退为 `CHAOS_MIXED`。
