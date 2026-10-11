# 秘境探索

秘境是游历之外的第二个探索玩法：玩家指定一个秘境进入，服务端按区域境界生成妖兽/Boss，并按固定概率表派发事件。核心实现为 `src/main/java/com/mtxgdn/game/service/SecretRealmService.java`，秘境定义位于 `src/main/java/data/mtxgdn/secretrealm/`，基类与注册表位于 `src/main/java/com/mtxgdn/game/secretrealm/`。

## 指令与入口

| 指令 | 别名 | 说明 | 权限 |
| --- | --- | --- | --- |
| `/秘境` | `secret` | 列出当前境界可进入的秘境（含序号） | `game.secret_realm` |
| `/进入秘境 <名称或序号>` | `secret_enter` | 进入指定秘境 | `game.secret_realm` |

两者玩法模块均为 `secret_realm`。`/秘境` 输出 `[序号] 【名称】` + `所需境界` + `冷却` + 描述，末尾提示 `使用 /进入秘境 <秘境名称或序号> 进入`。

名称解析由 `SecretRealmRegistry.resolve(input)` 完成，匹配顺序为：

1. 完整 key（如 `mtxgdn:hunyuan_mansion`）；
2. 纯数字 → 按 `getByIndex(index)` 取**按 `requiredRealm` 升序排列**后的第 N 个（序号从 1 开始）；
3. 中文名精确相等；
4. 中文名 `contains`（忽略大小写）；
5. 完整 key `contains`（忽略大小写）。

::: warning 同境界秘境的序号顺序依赖注册顺序
`getSortedRealms()` 只按 `requiredRealm` 排序，`requiredRealm` 相同的秘境（如 `ancient_ruins` 与 `thunder_valley` 都是 3，`ancient_battlefield` 与 `nine_heavens_platform` 都是 4）相对顺序由 `SecretRealmScanner` 扫描并实例化 `data.mtxgdn.secretrealm` 包内类的顺序决定，属于文件系统/类路径顺序，**不保证跨环境一致**。脚本化调用请用中文名或 key，不要依赖序号。
:::

## 10 个秘境总表

`SecretRealm` 的构造签名为 `SecretRealm(namespace, key, requiredRealm, cooldownMs[, raid])`，定义于 `src/main/java/com/mtxgdn/game/secretrealm/SecretRealm.java`。名称与描述取自 `src/main/java/data/mtxgdn/lang/zh_cn.json` 的 `secretrealm.<key>.name` / `.desc`。

| key | 名称 | 所需境界 | 境界名 | 冷却（秒） | 团队副本 |
| --- | --- | --- | --- | --- | --- |
| `mtxgdn:wild_grassland` | 荒原草地 | 0 | 凡人 | 120 | 否 |
| `mtxgdn:dark_forest` | 暗夜森林 | 1 | 炼气期 | 180 | 否 |
| `mtxgdn:beast_mountain` | 妖兽山脉 | 2 | 筑基期 | 240 | 否 |
| `mtxgdn:ancient_ruins` | 上古遗迹 | 3 | 金丹期 | 300 | 否 |
| `mtxgdn:thunder_valley` | 雷霆峡谷 | 3 | 金丹期 | 300 | **是** |
| `mtxgdn:ancient_battlefield` | 古战场 | 4 | 元婴期 | 420 | 否 |
| `mtxgdn:nine_heavens_platform` | 九天平台 | 4 | 元婴期 | 480 | **是** |
| `mtxgdn:immortal_cave` | 仙人洞府 | 5 | 化神期 | 600 | **是** |
| `mtxgdn:hunyuan_mansion` | 混元仙府 | 6 | 合体期 | 900 | **是** |
| `mtxgdn:taixu_palace` | 太虚天宫 | 7 | 大乘期 | 1200 | **是** |

源码定义（每个文件仅一行构造调用）：

```java
public class HunyuanMansion extends SecretRealm {
    public HunyuanMansion() {
        super("mtxgdn", "hunyuan_mansion", 6, 900_000, true);
    }
}
```

### 区域描述

| 名称 | 描述 |
| --- | --- |
| 荒原草地 | 一片辽阔的荒野草原，常有低阶妖兽出没，适合初入修仙者历练。 |
| 暗夜森林 | 终年不见天日的诡异森林，树影婆娑，暗藏杀机。 |
| 妖兽山脉 | 巍峨的山脉之中盘踞着无数妖兽，危机与机遇并存。 |
| 上古遗迹 | 远古修仙者留下的遗迹，蕴含着失传的功法与宝物。 |
| 雷霆峡谷 | 终年被雷暴笼罩的峡谷，雷元素充沛，是淬炼肉身与法宝的绝佳之地。 |
| 古战场 | 万年前仙魔大战的遗迹，煞气冲天，但也遗落着无数神兵利器。 |
| 九天平台 | 悬浮于九天之上的远古试炼平台，只有元婴期以上的修士才能踏足。 |
| 仙人洞府 | 传说中飞升仙人遗留的洞府，内有惊天机缘，但也步步危机。 |
| 混元仙府 | 上古大能遗留的洞府，混沌灵气四溢，合体期修士方可踏足。 |
| 太虚天宫 | 悬于九天之上的仙家宫阙，法则交织，大乘期修士的终极试炼之地。 |

### 关于"层数"

::: warning 单人秘境没有"层数"字段
`SecretRealm` 只有 `requiredRealm`、`cooldownMs`、`raid` 三个数值属性，**不存在层数/关卡数配置**。单人进入即触发 1 次事件结算。唯一的"多阶段"结构出现在团队副本模式中：

* 小怪波数 `waveCount = Math.max(2, area.getRequiredRealm())`；
* 最终 Boss 有 **3 个形态**（`BossForm.createFormsForRealm`）。

因此下表的"波数"列只对 `raid = true` 的秘境有意义。
:::

| 秘境 | 团队副本波数 `max(2, requiredRealm)` | 最终 Boss 形态数 |
| --- | --- | --- |
| 荒原草地 | 2 | 3（不开放副本） |
| 暗夜森林 | 2 | 3（不开放副本） |
| 妖兽山脉 | 2 | 3（不开放副本） |
| 上古遗迹 | 3 | 3（不开放副本） |
| 雷霆峡谷 | 3 | 3 |
| 古战场 | 4 | 3（不开放副本） |
| 九天平台 | 4 | 3 |
| 仙人洞府 | 5 | 3 |
| 混元仙府 | 6 | 3 |
| 太虚天宫 | 7 | 3 |

## 进入条件与消耗

| 条件 | 失败提示 |
| --- | --- |
| 角色存在 | `角色不存在，请先创建角色` |
| 秘境可解析 | `未知的秘境: <输入>` |
| `player.realm >= area.requiredRealm` | `你的境界不足，无法进入【X】，需要达到Y境界` |
| `players.hp > 0` | `你已重伤，无法进入秘境，请先恢复生命值` |
| 冷却已过 | `你刚探索过【X】秘境，还需要等待一段时间才能再次进入` |

::: warning 秘境不消耗体力/物品，但冷却时间戳是全局共享的
`SecretRealmService.enterSecretRealm` 只读写 `players.last_secret_realm_time` 一个字段，**不区分秘境**。判定用的是目标秘境自己的 `cooldownMs`，但写入的是同一个时间戳。因此：

* 进过冷却 120 秒的荒原草地后，立刻进冷却 1200 秒的太虚天宫会被拒绝（因为 `now - lastTime = 0 < 1200000`）；
* 反之，从太虚天宫出来后，等满 120 秒即可进入荒原草地。

冷却检查与时间写入同样在单个事务内对 `players` 行加锁（`getForUpdateClause()`），避免并发重复进入。
:::

## 单人事件概率表

`generateRealmEvent` 用一次 `random.nextDouble()` 决定事件。**高境界秘境（`requiredRealm >= 6`，即混元仙府与太虚天宫）使用独立概率表**，Boss 遭遇率翻倍并新增专属奇遇。

| 事件 | eventType | 普通秘境（realm < 6） | 高境界秘境（realm ≥ 6） |
| --- | --- | --- | --- |
| 区域专属奇遇 | `chaos_spring` / `heavenly_treasury` | — | 15% |
| 发现宝藏 | `encounter_treasure` | 20% | 20% |
| 遭遇妖兽 | `encounter_monster` | 20% | 10% |
| 遭遇秘境守护者（Boss） | `encounter_boss` | 10% | **20%** |
| 采集灵草 | `encounter_herb` | 15% | 10% |
| 遇到散修 | `encounter_cultivator` | 13% | 10% |
| 发现遗迹 | `encounter_ruins` | 10% | 7% |
| 遭遇机关陷阱 | `encounter_trap` | 7% | 5% |
| 一无所获 | `encounter_nothing` | 5% | 3% |

::: tip 妖兽与守护者按"秘境境界"生成，不按玩家境界
`Monster.random(area.getRequiredRealm(), random)` 与 `Monster.createBossForRealm(area.getRequiredRealm(), random)`。源码注释明确说明这是为了修正"高境界玩家在低阶秘境也遇强怪、区域难度形同虚设"的问题。
:::

## 各事件奖励详解

下表中 `realm = player.getRealm() + 1`，`req = area.getRequiredRealm()`。

### encounter_treasure — 发现宝藏

| 产出 | 公式 |
| --- | --- |
| 金币 | `random.nextLong(realm*50, realm*300 + 100)` |
| 灵石 | `random.nextLong(realm*10, realm*80 + 20)` |

灵石额外受灵根特效 `SPIRIT_STONE_DROP`（火土木三灵根，值 0.20）加成：

```java
SpiritualRoot root = player.getSpiritualRoot();
if (root != null && root.hasEffect(SpiritualRoot.SpecialEffect.SPIRIT_STONE_DROP)) {
    spiritStones = (long)(spiritStones * (1 + root.getEffectValue()));
}
```

### encounter_monster — 遭遇妖兽

调用 `CombatService.pveFight` 实打一场，奖励完全由 `PveCombatResult` 转发。

### encounter_boss — 遭遇秘境守护者

`Monster.createBossForRealm(req, random)`，其内部使用 `effectiveRealm = max(0, req - 1)` 选择 Boss 名称与描述：

| `req` | `effectiveRealm` | Boss 名称 | 描述 |
| --- | --- | --- | --- |
| 0 | 0 | 草原霸主·奔雷兽 | 荒野草原的王者，一身皮毛刀枪不入，奔袭间雷光闪烁 |
| 1 | 1 | 暗影领主·噬魂蛛皇 | 盘踞在幽暗森林深处的巨型蛛皇，毒液可腐蚀修士的护体灵气 |
| 2 | 2 | 兽王·金翼裂天雕 | 百兽山脉的绝对统治者，双翅展开遮天蔽日，爪可裂金断石 |
| 3 | 3 | 遗迹守卫·青铜巨像 | 上古遗迹的守护者，由青铜铸就的巨像，拳风可摧山岳 |
| 4 | 4 | 战场英魂·不灭战将 | 古战场中残留的英魂所化，战意不灭，杀伐之气冲天 |
| 5 | 5 | 洞府守护灵·九霄剑魂 | 仙人遗留的剑意化形而成，剑气纵横三万里，一剑光寒十九州 |
| 6 | 6 | 混沌真君·太虚老祖 | 太虚秘境之主，举手投足间混沌翻涌，可颠倒乾坤 |
| 7 | 7 | 大乘圣祖·无量天尊 | 证得大乘的古老存在，一言一行皆有法则相随 |

Boss 数值由 `Monster.createBoss(name, max(1, effectiveRealm), desc, random)` 生成。

::: tip 高境界秘境守护者额外掉落传说材料
`req >= 6` 且战斗胜利时，再随机掉落 1 件传说材料：

```java
private static final String[] LEGENDARY_MATERIALS = {
        "mtxgdn:five_colored_divine_stone", "mtxgdn:dragon_heart", "mtxgdn:qilin_blood",
        "mtxgdn:phoenix_gallbladder", "mtxgdn:ten_thousand_year_lingzhi",
        "mtxgdn:heaven_pill", "mtxgdn:qiankun_zaohua_dan"
};
```

即：五色神石、龙心、麒麟血、凤凰胆、万年灵芝、天元丹、乾坤造化丹。掉落会覆盖 `result.itemGained` 并把 `itemQuantity` 累加 1。
:::

### encounter_herb — 采集灵草

掉落池 5 项：`spirit_grass`、`healing_pill`、`mana_pill`、`spirit_spring_water`、`beast_core`（比游历的灵草事件多一项妖兽内丹）。数量 `random.nextInt(1, 3)` → 1~2。未注册时兜底经验 `realm × 30`。

### encounter_cultivator — 遇到散修

| 区间 | 结果 |
| --- | --- |
| `[0, 0.5)` | 经验 `realm × 120` |
| `[0.5, 0.8)` | 灵石 `realm × 30` |
| `[0.8, 1.0)` | 5 件物品池随机一件，60% 概率真给；否则金币 `realm × 100` |

物品池为 `spirit_grass`、`iron_ore`、`healing_pill`、`mana_pill`、`spirit_recovery_pill`。

### encounter_ruins — 发现遗迹

| 区间 | 结果 |
| --- | --- |
| `[0, 0.4)` | 16 件稀有物品池随机 1 件 |
| `[0.4, 0.75)` | 灵石 `realm × 150` |
| `[0.75, 1.0)` | 经验 `realm × 200` |

稀有物品池在游历版 12 件基础上多 4 件：`heavenly_jade`（天玉）、`enhance_stone`（强化石）、`protect_charm`（护符）、`tribulation_pill`（渡劫丹）。

::: warning 首档未注册时"零产出"
`if (roll < 0.4)` 分支中 `ItemRegistry.contains(rareItem)` 为假时没有任何 `else`，该次秘境探索不产生任何奖励（与游历 `ruins` 事件降级发灵石的写法不同）。
:::

### encounter_trap — 遭遇机关陷阱

| 项目 | 内容 |
| --- | --- |
| 扣血 | `maxHp/10 + random.nextInt(maxHp/8)` |
| 下限保护 | `Math.max(1, player.getHp() - hpLoss)` |
| 奖励 | 无 |

写入方式与游历不同：这里用 `player.setHp(newHp)` + `playerService.updatePlayer(...)` 走实体更新路径。

### encounter_nothing — 一无所获

经验 `realm × 10` 保底。

### chaos_spring — 混沌灵泉（仅混元仙府）

| 产出 | 公式 |
| --- | --- |
| 经验 | `(req + 1) × 2000 + random.nextLong(2000, 8000)` → 以 req=6 计为 14000 ~ 21999 |
| 灵石 | `(req + 1) × 150 + random.nextLong(100, 500)` → 以 req=6 计为 1150 ~ 1549 |

### heavenly_treasury — 天宫宝库（仅太虚天宫）

从 `LEGENDARY_MATERIALS` 中随机取 1 件，通过 `ItemRegistry.contains` 校验后发放。

## 团队副本模式

入口为 `SecretRealmService.enterRaid(leaderId, areaName)`（`raid = true` 的 5 个秘境可用）。

| 校验 | 失败提示 |
| --- | --- |
| 角色存在 | `角色不存在，请先创建角色` |
| 秘境可解析 | `未知的秘境: <输入>` |
| `area.isRaid()` | `该秘境不支持团队副本模式` |
| 有团队 | `你需要先创建或加入一个团队` |
| 发起者是队长 | `只有队长可以发起副本挑战` |
| 成员 ≥ 2 人 | `团队人数不足，至少需要2人` |
| 全员 `realm >= req` | `团队成员【X】境界不足，无法进入` |
| 全员 `hp > 0` | `团队成员【X】已重伤，无法进入` |
| 全员冷却已过 | `【X】刚探索过秘境，还需要等待 N 秒` |

通过后为**所有成员**写入 `last_secret_realm_time = now`。

### 小怪阶段

```
waveCount = max(2, area.getRequiredRealm())
for wave in 1..waveCount:
    monsterCount = random.nextInt(1, 3)     // 1~2 只
    对每只怪：按成员顺序依次 pveFight，直到有人获胜或全员倒下
```

每只怪由 `Monster.random(area.getRequiredRealm(), random)` 生成。只要有一名成员击败该怪即换下一只；全员 `hp <= 0` 时中断并判定失败。奖励按成员战斗结果累加到 `expGained` / `goldGained` / `spiritStonesGained`。

### 最终 Boss 阶段

所有小怪清完后，若仍有存活成员，则进入 `CombatService.raidBossFight(memberIds, bossForms)`，`bossForms = BossForm.createFormsForRealm(req)`。

三个形态的倍率（`BossForm.createFormsForRealm`）：

| 形态 | HP 倍率 | 攻击倍率 | 防御倍率 | 速度倍率 | 玩家削弱 | 掉落概率 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.0 | 1.0 | 1.0 | 1.0 | 5% | 50% |
| 1 | 1.4 | 1.3 | 1.2 | 1.1 | 10% | 65% |
| 2 | 2.0 | 1.6 | 1.4 | 1.2 | 15% | 80% |

由倍率换算出的实际 Boss 面板：

| 形态 | HP | 攻击 | 防御 | 速度 |
| --- | --- | --- | --- | --- |
| 0 | `1.0 × 500 × 1 = 500` | `500 × 1.0 = 500` | `300 × 1.0 = 300` | `100 × 1.0 = 100` |
| 1 | `1.4 × 500 × 2 = 1400` | `500 × 1.3 = 650` | `300 × 1.2 = 360` | `100 × 1.1 = 110` |
| 2 | `2.0 × 500 × 3 = 3000` | `500 × 1.6 = 800` | `300 × 1.4 = 420` | `100 × 1.2 = 120` |

Boss 总血量 `calculateBossTotalHp` = 500 + 1400 + 3000 = **4900**。形态按剩余血量百分比推进（只在升级时切换，不回退）：`< 66%` → 形态 1，`< 33%` → 形态 2。战斗最多 **50 回合**。

`playerDebuffPercent` 直接乘在玩家造成的伤害上（`damage = damage * (1 - debuff)`），同时也降低玩家防御参与减伤计算。Boss 每回合随机挑选一名存活成员攻击。

### 副本胜利奖励

| 项目 | 公式 |
| --- | --- |
| 基础经验 | `(req + 1) × 500` |
| 基础金币 | `(req + 1) × 300` |
| 基础灵石 | `(req + 1) × 100` |
| 组队加成 | `teamBonus = 1 + 0.2 × (成员数 - 1)` |
| 天象修正 | 经验/金币走 `applyCombat`，灵石走 `applySpiritStone` |
| 人均 | `总额 / 成员数`，仅发放给 `hp > 0` 的成员 |

物品掉落：对每名存活成员，以**最终形态**的 `rewardChance` 概率从该形态的 `rewardTable` 中随机取 1 件发放。

| 形态档位（`min(req, 5)`） | 奖励表 |
| --- | --- |
| 0 | 灵草、铁矿石、回血丹、回蓝丹、妖兽内丹 |
| 1 | 修炼丹、灵石袋、灵剑、护身玉 |
| 2 | 功法残页、基础剑诀、神力丹、神行符 |
| 3 | 龙血晶、强化石、火龙术、玉甲 |
| 4 | 五色神石、天火石、龙骨、天元丹、天蚕丝 |
| 5 | 龙心、麒麟血、凤凰胆、万年灵芝、乾坤造化丹 |

### 副本称号

最后一击的成员获得称号 `raid_conqueror`（副本征服者，稀有度 UNCOMMON），日志输出 `🏆 【X】获得了「副本征服者」称号！`。

## 每日计数与称号

| 触发点 | 行为 |
| --- | --- |
| 单人进入成功 | `DailyService.onSecretRealm(playerId)` 递增 `player_daily.secret_realm_count` |
| 单人进入成功 | `playerService.incrementSecretRealmCount(playerId)` 递增 `players.secret_realm_count`，并调用 `TitleService.checkAndGrantTitles(player)` |
| 副本结束 | 对队长调用一次 `DailyService.onSecretRealm(leaderId)` |

相关称号（`src/main/java/com/mtxgdn/game/title/TitleRegistry.java`）：

| key | 名称 | 条件 |
| --- | --- | --- |
| `exploration_master` | 秘境探险家 | `players.secret_realm_count >= 20` |
| `raid_conqueror` | 副本征服者 | 团队副本最终一击 |
