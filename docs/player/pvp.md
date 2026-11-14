# PVP 切磋

PVP 采用"异步挑战 → 对方接受 → 立即结算"的模型，没有实时对战。全部逻辑集中在 `src/main/java/com/mtxgdn/game/service/CombatService.java` 的 `createChallenge` / `acceptChallenge` / `rejectChallenge` / `pvpChallenge` / `executePvp` 一组方法中。

## 指令入口

PVP 只有一个指令入口：`/挑战`（`/决斗`、`/切磋` 是兼容旧名字的别名）。
历史上曾有两个指令类重复实现 PVP（其中一个没有权限门控、也不推送通知），
已合并为 [`com.mtxgdn.game.command.combat.PvpCommand`](/dev/commands)；
PVE 的野外怪 / 个人 Boss / 团队 Boss 则各自拆成独立指令，不再混在 PVP 指令里。

| 指令 | 别名 | 用途 | 权限 |
| --- | --- | --- | --- |
| `/挑战 <角色名>` | `/pvp`、`/决斗`、`/切磋` | 发起 PVP 切磋 | `game.pvp.challenge` |
| `/挑战 接受` / `/挑战 拒绝` | `accept` / `reject` | 应战 / 回避 | 同上 |
| `/战斗` | `/battle`、`/fight` | 打野外怪物（PVE，见 [PVE 战斗](/player/combat)） | — |
| `/讨伐` | `/subjugate` | 打个人 Boss（PVE） | — |
| `/boss <玩家1> <玩家2> ...` | `/团本` | 团队 Boss（PVE，至少 2 人） | — |

`/挑战` 的行为：

* 无参数时显示**当前战斗策略**与提示；
* 发起后回复 `⚔ 你向【X】发起了切磋挑战！<战术>\n等待对方回应中（30秒）...`；
* 通过 `notifyTarget` 向被挑战者**推送 QQ 私聊通知**（优先使用当前渠道的绑定：QQ 官方渠道用 `QqOfficialBindingService(appId)`，OneBot 渠道用 `QqBindingService`），文案为 `⚔ 【X】向你发起了切磋挑战！<战术>\n回复 /挑战 接受 迎战，/挑战 拒绝 回避（30秒超时自动取消）`；
* 接受后战报通过 `sendBattleReport` **分条发送**（按空行、`-- 第 N 回合 --`、`🏆`、`🤝`、`获得`、`惜败` 等断点切分，每组最多 5 行）。

三条 PVE 指令直接结算、不经过"接受/拒绝"，它们的怪物与 Boss 数值见 [PVE 战斗](/player/combat)。

::: tip 没有"立即开打"的 PVP 指令
所有 **PVP** 入口都走 `createChallenge`，必须由被挑战者在 30 秒内回复"接受"才会真正结算。`pvpChallenge(challengerPlayerId, targetPlayerId)` 是唯一的"免确认直接开打"路径，它**只被 REST 接口调用**（`POST /api/game/pvp/challenge`，见 `GameBattleResource`），游戏内没有对应指令。
:::

## 挑战流程

```java
public CombatResult createChallenge(long challengerPlayerId, long targetPlayerId) {
    Player challenger = playerService.getPlayerById(challengerPlayerId);
    Player target = playerService.getPlayerById(targetPlayerId);

    if (challenger == null) return CombatResult.failure("挑战者角色不存在");
    if (target == null) return CombatResult.failure("对手角色不存在");
    if (challengerPlayerId == targetPlayerId) return CombatResult.failure("不能挑战自己");
    if (challenger.getHp() <= 0) return CombatResult.failure("你的生命值不足，无法发起挑战");
    if (target.getHp() <= 0) return CombatResult.failure("对手已阵亡，无法挑战");

    // 安全区禁止私斗（放在每日次数校验之前，避免被安全区拦下还白扣一次挑战次数）
    String safeZoneError = checkSafeZone(challengerPlayerId, targetPlayerId);
    if (safeZoneError != null) return CombatResult.failure(safeZoneError);

    if (!canParticipatePvp(challengerPlayerId)) {
        return CombatResult.failure("今日切磋次数已用完（每天最多 " + DAILY_PVP_LIMIT + " 次），明日再来吧");
    }
    recordPvpParticipation(challengerPlayerId);
    ...
}
```

### 发起方校验

| 顺序 | 条件 | 失败提示 |
| --- | --- | --- |
| 1 | 挑战者角色存在 | `挑战者角色不存在` |
| 2 | 目标角色存在 | `对手角色不存在` |
| 3 | 不是自己 | `不能挑战自己` |
| 4 | 挑战者 `hp > 0` | `你的生命值不足，无法发起挑战` |
| 5 | 目标 `hp > 0` | `对手已阵亡，无法挑战` |
| 6 | **双方都不在安全区** | `【X】乃安全区，城中禁止私斗，请先离开此地再切磋` / `对方身处安全区【X】，无法对其发起挑战` |
| 7 | 今日次数 < 10 | `今日切磋次数已用完（每天最多 10 次），明日再来吧` |
| 8 | **立即扣 1 次** | — |
| 9 | 目标没有未超时的待处理挑战 | `【X】正在被他人挑战中，稍后再试` |
| 10 | 自己也没有未超时的待处理挑战 | `你已向【X】发起了挑战，等待对方回应中` |

::: tip 安全区校验刻意排在次数校验之前
`checkSafeZone` 在 `canParticipatePvp` 之前执行，因此被安全区拦下**不会白扣一次挑战次数**。源码注释："放在每日次数校验之前，避免被安全区拦下还白扣一次挑战次数"。
:::

::: warning 第 8 步先于第 9/10 步
次数在挂起检查之前就被扣掉了。因此"目标正在被别人挑战"或"自己已有挂起挑战"这类失败，**同样会消耗挑战者的当日次数**。
:::

### 待处理挑战的存储

```java
private final Map<Long, PendingChallenge> pendingChallenges = new ConcurrentHashMap<>();
```

* key 是**被挑战者**的 playerId，value 记录挑战者 id/名字、目标 id/名字与创建时间；
* 因此一个目标同时只能挂 1 个待处理挑战；
* 每次 `createChallenge` 都会先 `pendingChallenges.values().removeIf(PendingChallenge::isExpired)` 清理超时项。

### 超时

```java
private static final long CHALLENGE_TIMEOUT_MS = 30_000;

public boolean isExpired() { return System.currentTimeMillis() - createdAt > CHALLENGE_TIMEOUT_MS; }
```

超时 30 秒后挑战自动失效，`acceptChallenge` 会返回 `没有待接受的挑战，可能已超时`。

### 接受

```java
public CombatResult acceptChallenge(long playerId) {
    PendingChallenge challenge = pendingChallenges.remove(playerId);
    if (challenge == null || challenge.isExpired()) {
        return CombatResult.failure("没有待接受的挑战，可能已超时");
    }
    if (challenge.targetPlayerId != playerId) {
        return CombatResult.failure("你无法接受此挑战");
    }
    if (!canParticipatePvp(playerId)) {
        return CombatResult.failure("今日切磋次数已用完（每天最多 " + DAILY_PVP_LIMIT + " 次），明日再来吧");
    }
    recordPvpParticipation(playerId);
    return executePvp(challenge.challengerPlayerId, challenge.targetPlayerId);
}
```

::: warning 接受方次数用尽时挑战会被静默吞掉
第 1 行就 `pendingChallenges.remove(playerId)`，而次数校验在第 4 行。若接受方当日次数已满，挑战对象已经被移除，返回失败后**无法再次接受**（除非对方重新发起）。
:::

### 拒绝

`rejectChallenge(targetPlayerId)` 直接移除待处理项并返回挑战者名字，用于提示 `已拒绝【X】的挑战` / `你拒绝了【X】的切磋挑战`。**拒绝方不消耗次数**，但发起方的次数已经被扣掉，不会退还。

## 每日次数限制

```java
/** PVP 每日参与次数限制（发起+接受合计，持久化到数据库，重启不丢失） */
private static final int DAILY_PVP_LIMIT = 10;
```

| 项目 | 说明 |
| --- | --- |
| 上限 | 10 次 / 天 |
| 计数口径 | **发起与接受合计**：`createChallenge` 扣发起方 1 次，`acceptChallenge` 扣接受方 1 次 |
| 存储 | `player_daily.pvp_count`（列由 `DatabaseMigration` 的 `ALTER TABLE player_daily ADD COLUMN pvp_count INT DEFAULT 0` 补充） |
| 跨天重置 | 依赖 `player_daily.last_daily_reset`；读写前都会先调 `DailyService.ensureDailyReset(playerId)` |
| 原子递增 | SQLite 用 `ON CONFLICT(player_id) DO UPDATE ... CASE WHEN last_daily_reset = ? THEN pvp_count + 1 ELSE 1 END`；MySQL 用 `ON DUPLICATE KEY UPDATE ... IF(last_daily_reset = ?, pvp_count + 1, 1)` |
| 降级 | 读表失败（列不存在等）时记录 stderr 并返回 0，即**视为未使用次数** |

```java
private static boolean canParticipatePvp(long playerId) {
    int count = getDailyPvpCount(playerId);
    return count < DAILY_PVP_LIMIT;
}
```

## 胜负判定

`executePvp` 是实际结算函数。

### 战斗参数

| 项目 | 值 |
| --- | --- |
| 回合上限 | 20 |
| 先手 | `getFinalSpeed(challenger) >= getFinalSpeed(target)` → 挑战方先手（速度平手也归挑战方） |
| 每回合顺序 | 灵根回复 → 先手方行动 → 后手方行动 |
| 行动内容 | 血量 ≤ 50% 优先治疗，否则按战斗策略选技能或普攻 |
| 判定 | 任一方 HP ≤ 0 立即结束，该方判负 |
| 20 回合打满 | 按剩余 HP 多者胜；相等为 `平局` |

```java
private String determinePvpWinner(int challengerHp, int targetHp, String challengerName, String targetName) {
    if (challengerHp > targetHp) return challengerName;
    else if (targetHp > challengerHp) return targetName;
    else return "平局";
}
```

### 伤害与增伤/减伤链（PVP 专属顺序）

`processPvpRound` 中，攻击方伤害先乘功法增伤，再依次经防守方三层减伤：

| 步骤 | 来源 | 公式 |
| --- | --- | --- |
| 1 | 技能或普攻基础伤害 | 技能：`damage + (int)(damage × (level-1) × 0.15)`；普攻：`getFinalAttack(attacker)`（**不含灵力**） |
| 2 | 灵根 `SKILL_DAMAGE` | 仅技能：`× (1 + effectValue)` |
| 3 | 灵根 `DAMAGE_BOOST` | `× (1 + effectValue)` |
| 4 | 暴击 | 概率 `min(0.6, getFinalSpeed/400) + 灵根 CRIT_CHANCE`；倍率 `1.5 + 灵根 CRIT_DAMAGE` |
| 5 | 随机浮动 | `random.nextInt(-5, 6)` → -5 ~ +5 |
| 6 | 防守方防御 | `- getFinalDefense(defender) / 3`（整数除法），保底 1 |
| 7 | 防守方灵根 `DAMAGE_REDUCTION` | `× (1 - effectValue)`，保底 1 |
| 8 | 攻击方功法增伤 | `× techDamageMult` = `1 + getEquippedCombatDamageBonus` |
| 9 | 防守方防御技能减伤 | `max(1, damage × (100 - min(90, pct)) / 100)` |
| 10 | 防守方功法减伤 | `max(1, damage × (1 - techReduction))` |
| 11 | 防守方阵法减伤 | `max(1, damage × (1 - formationReductionPct / 100.0))` |

::: tip PVP 普攻不加灵力，PVE 加
`calculatePvpDamage` 的普攻分支是 `baseDamage = playerService.getFinalAttack(attacker)`；PVE 的 `calculatePlayerDamageToMonster` 则是 `getFinalAttack(attacker) + getFinalSpirit(attacker)`。同一名玩家在两种模式下的普攻伤害不同。
:::

### 伤害反弹

防守方若持有反射 Buff（`BuffService.getReflectionPercent`，反射丹 30%），会把伤害的一部分反弹给攻击方：

```java
int reflectPercent = services.getBuffService().getReflectionPercent(defender.getId());
if (reflectPercent > 0 && damage > 0) {
    int reflected = Math.max(1, damage * reflectPercent / 100);
    attackerState.playerHp -= reflected;
    ...
    if (attackerState.playerHp <= 0) {
        attackerState.playerHp = 0;
        return defender.getName();
    }
}
```

反弹**可以直接反杀攻击方**，此时胜者变为防守方。

### 开局防御技能

双方在第 0 回合各自自动运转全部 `skillType == 2` 的技能（如金刚护体），减伤 = `min(30, 蓝耗 × 50 / 100)`，取最大值。

## 安全区与险地

PK 的**准入**与**收益**由两个互相独立的字段控制：`is_safe_zone` 决定「能不能打」，`danger_level` 决定「赢了能抢多少」。

### 安全区禁止私斗

任一方身处 `is_safe_zone` 的地点，切磋即被拒绝：

```java
private String checkSafeZone(long challengerPlayerId, long targetPlayerId) {
    MapLocation challengerZone = mapService.getLocation(mapService.getPlayerLocationId(challengerPlayerId));
    if (challengerZone != null && challengerZone.isSafeZone()) {
        return "【" + challengerZone.getName() + "】乃安全区，城中禁止私斗，请先离开此地再切磋";
    }
    MapLocation targetZone = mapService.getLocation(mapService.getPlayerLocationId(targetPlayerId));
    if (targetZone != null && targetZone.isSafeZone()) {
        return "对方身处安全区【" + targetZone.getName() + "】，无法对其发起挑战";
    }
    return null;
}
```

| 项目 | 说明 |
| --- | --- |
| 判定依据 | **只看 `is_safe_zone`**，与危险度无关 |
| 覆盖路径 | `/挑战` 发起与 `/挑战 接受` 两条 PVP 入口都会校验 |
| 出厂安全区 | 青云村、苍月镇、太虚城、天机阁（这 4 地的危险度也都是 0） |

::: tip 为什么两个字段要分离
危险度决定"赢了能抢多少"，安全区决定"能不能打"。分开判定，管理员即使把某地危险度误填成 0，也不会意外开放 PK。

历史上 🛡 标记**只是展示、并未真正生效**；现在它已真正拦截私斗。
:::

### 险地 PK 掠夺

危险度 ≥3（高危 / 极危）的地点，胜者夺走败者的灵石：

```java
/** 险地掠夺的最低危险度：危险度 ≥3（高危 / 极危）才算"险地"。 */
private static final int PK_LOOT_MIN_DANGER = 3;
/** 险地掠夺比例：每 1 级危险度夺走败者 5% 灵石（危险度 3 → 15%，4 → 20%）。 */
private static final double PK_LOOT_RATIO_PER_DANGER = 0.05;
```

| 危险度 | 掠夺比例 |
| --- | --- |
| 0~2 | 0（不掠夺） |
| 3 高危 | 15% |
| 4 极危 | 20% |

实现要点：

| 项 | 说明 |
| --- | --- |
| 计算式 | `loot = max(1, round(败者灵石 × 0.05 × 危险度))` |
| 防并发造币 | 以 `removeSpiritStones` 的**返回值**为准，只有真正扣成功才发放 |
| 门槛为何设在 3 | 让 PK 收益只存在于真正的凶地——否则全图都会变成猎杀场，低危地带也会被大号堵门 |
| 适用范围 | 所有 PVP 路径共用 `executePvp`，因此掠夺对它们都生效 |
| 战报文案 | 结算时输出 `☠ {危险度名称}之地，……` |

## 奖励与惩罚

### 胜利方

| 产出 | 公式 |
| --- | --- |
| 经验 | `calculateExpReward(winner, loser, challengerWon, isTie)` |
| 金币 | `random.nextLong(50, 200)` → 50 ~ 199 |
| 天象修正 | 经验与金币都再经 `DailyService.getTodayPhenomenonStatic().applyCombat()` |

```java
private long calculateExpReward(Player winner, Player loser, boolean challengerWon, boolean isTie) {
    if (isTie) return 0;
    int realmDiff = winner.getRealm() - loser.getRealm();
    long baseExp = 50 + loser.getLevel() * 10L;
    if (realmDiff < 0) {
        baseExp *= 2;
    }
    return baseExp + random.nextLong(0, 30);
}
```

| 项目 | 说明 |
| --- | --- |
| 基础经验 | `50 + 败者等级 × 10` |
| 越级奖励 | 胜者境界**低于**败者时 `× 2` |
| 随机附加 | `+ nextLong(0, 30)` → 0 ~ 29 |
| 平局 | 经验与金币均为 0 |

### 战败方

在**安全区与低危地点（危险度 0~2）没有任何额外惩罚**：不掉经验、不掉金币、不掉物品。后果只有 HP/MP 被写成战斗结束时的真实值（可能为 0 → 重伤），以及当日 PVP 次数已消耗。

但在**险地（危险度 ≥3）**，败者会被胜者夺走 `5% × 危险度` 的灵石（高危 15%、极危 20%），详见上文[险地 PK 掠夺](#险地-pk-掠夺)。

### 战后共同处理

| 项目 | 说明 |
| --- | --- |
| 双方 HP/MP 持久化 | `challenger.setHp(Math.max(0, state.playerHp))` 等，再 `updatePlayer` |
| 技能熟练度 | 双方各自使用过的技能 `addProficiency(playerId, skillId, 15)` |
| 每日计数 | 双方各调一次 `DailyService.onBattle(playerId)` → `player_daily.battle_count + 1` |
| 每日机缘 | `battleCount >= 1` 且未领 → 金币 `(realm+1) × 200` |
| 胜场计数 | 非平局时 `playerService.incrementPvpWins(winnerId)` → `players.pvp_wins + 1` |
| 称号检查 | 胜者调用 `TitleService.checkAndGrantTitles` |
| 行为日志 | REST 入口额外写 `PlayerActionLogger.logCombat(..., "PVP", ...)` |
| 插件事件 | `COMBAT_ENDED`，携带 `playerId`、`targetPlayerId`、`winner` |

平局时 `actualWinner == null`，因此不发奖励、不计胜场、不检查称号，但**双方仍会各消耗 1 次每日 PVP 次数并各计 1 次 battle_count**。

## 防刷限制汇总

| # | 限制 | 实现位置 | 说明 |
| --- | --- | --- | --- |
| 1 | 每日 10 次 | `DAILY_PVP_LIMIT = 10` | 发起与接受合计，持久化到 `player_daily.pvp_count`，重启不丢失 |
| 2 | 挑战 30 秒超时 | `CHALLENGE_TIMEOUT_MS = 30_000` | 超时自动失效，`acceptChallenge` 拒绝 |
| 3 | 目标同时只能被一人挑战 | `pendingChallenges` 以 `targetPlayerId` 为 key | 冲突时返回 `【X】正在被他人挑战中，稍后再试` |
| 4 | 挑战者同时只能挂一个挑战 | 同一 map 以挑战者 id 反查 | 冲突时返回 `你已向【X】发起了挑战，等待对方回应中` |
| 5 | 不能挑战自己 | `challengerPlayerId == targetPlayerId` | 双保险：指令侧也做了一次判断 |
| 6 | 双方都必须非重伤 | `getHp() <= 0` 检查 | 发起方与目标方都校验 |
| 7 | 平局不计胜场 | `if (actualWinner != null && !isTie)` | 防止用平局互刷 `pvp_wins` |
| 8 | 次数按天重置 | `DailyService.ensureDailyReset` | 读写 `pvp_count` 前都会先复位整行 |
| 9 | 并发安全 | `ConcurrentHashMap` + `removeIf(isExpired)` | 待处理挑战无持久化，重启即全部丢失 |

::: tip 所有入口共享同一个 CombatService
指令通过 `Command.services()` 拿到的是 `ServiceContainer` 里的同一个 `CombatService` 实例，`pendingChallenges` 就存在该实例里，因此 `/挑战 X` 发出的挑战可以用 `/挑战 接受` 接下。
待处理挑战**只在内存**，服务端一旦重启会全部消失（30 秒超时也会让它失效）。
:::

## 相关称号

| key | 名称 | 条件 | 加成 |
| --- | --- | --- | --- |
| `arena_champion` | 擂台王者 | `players.pvp_wins >= 50` | 稀有度 UNCOMMON，属性加成见 `TitleRegistry` |

判定代码位于 `TitleService.checkAndGrantTitles`：

```java
grantIf(granted, playerId, "arena_champion", player.getPvpWins() >= 50);  // 擂台王者
```

## REST 接口

`POST /api/game/pvp/challenge`（`src/main/java/com/mtxgdn/rest/GameBattleResource.java`），权限 `game.pvp.challenge`。

| 项目 | 内容 |
| --- | --- |
| 请求体 | `{"targetPlayerId": <long>}` |
| 校验 | `targetPlayerId <= 0` → `GameErrorCode.PARAM_MISSING` |
| 行为 | 直接调用 `combatService.pvpChallenge(challengerPlayerId, targetPlayerId)`，**跳过接受确认环节** |
| 返回字段 | `winner`、`challengerWon`、`challengerName`、`targetName`、`challengerRemainingHp`、`targetRemainingHp`、`totalRounds`、`expReward`、`goldReward`、`battleLog` |
| 失败 | `GameMessage.restError(400, combatResult.getMessage())` |

`pvpChallenge` 与 `createChallenge` 一样先校验次数并扣减，然后直接进 `executePvp`。它**不检查**待处理挑战冲突，因此 REST 路径可以绕过"目标正在被挑战中"的限制。
