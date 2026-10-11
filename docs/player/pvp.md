# PVP 切磋

PVP 采用"异步挑战 → 对方接受 → 立即结算"的模型，没有实时对战。全部逻辑集中在 `src/main/java/com/mtxgdn/game/service/CombatService.java` 的 `createChallenge` / `acceptChallenge` / `rejectChallenge` / `pvpChallenge` / `executePvp` 一组方法中。

## 指令入口

游戏内存在**两个**都能发起 PVP 的指令类，它们共用同一套服务方法，但交互体验不同。

### `/挑战`（`com.mtxgdn.onebot.command.combat.PvpCommand`）

| 别名 | 用法 | 权限 |
| --- | --- | --- |
| `挑战`、`pvp` | `/挑战 <角色名>` | `game.pvp.challenge` |
| | `/挑战 接受`（`accept`） | 同上 |
| | `/挑战 拒绝`（`reject`） | 同上 |

特点：

* 无参数时显示**当前战斗策略**与提示；
* 发起后回复 `⚔ 你向【X】发起了切磋挑战！<战术>\n等待对方回应中（30秒）...`；
* 通过 `notifyTarget` 向被挑战者**推送 QQ 私聊通知**（优先使用当前渠道的绑定：QQ 官方渠道用 `QqOfficialBindingService(appId)`，OneBot 渠道用 `QqBindingService`），文案为 `⚔ 【X】向你发起了切磋挑战！<战术>\n回复 /挑战 接受 迎战，/挑战 拒绝 回避（30秒超时自动取消）`；
* 接受后战报通过 `sendBattleReport` **分条发送**（按空行、`-- 第 N 回合 --`、`🏆`、`🤝`、`获得`、`惜败` 等断点切分，每组最多 5 行）。

### `/决斗`（`com.mtxgdn.onebot.command.pvp.PvpCommand`）

| 别名 | 用法 | 权限 |
| --- | --- | --- |
| `决斗`、`切磋`、`fight` | `/决斗 <角色名>` | 无（`permission = null`） |
| `战斗` | `/战斗 战斗`（打野外怪，非 PVP） | 无 |
| `讨伐` | `/讨伐 讨伐`（打 Boss，非 PVP） | 无 |
| `boss` | `/boss boss <名字...>`（团队 Boss，非 PVP） | 无 |

特点：

* 无参数时只打印用法；
* 发起后**不推送私聊通知**，被挑战者需自行感知；
* 接受后一次性返回整段战报。

### 两者的实质区别

| 维度 | `/挑战` | `/决斗` |
| --- | --- | --- |
| 服务方法 | `createChallenge` → `acceptChallenge` | `createChallenge` → `acceptChallenge` |
| 权限校验 | `game.pvp.challenge` | 无 |
| 被挑战者通知 | QQ 私聊推送 | 无 |
| 战报呈现 | 分条（每组 ≤ 5 行） | 单条长文本 |
| 无参数行为 | 显示当前战术 | 显示用法 |
| 战斗策略显示 | 发起方与目标方都显示 | 不显示 |

::: tip 没有"立即开打"的 PVP 指令
所有指令入口都走 `createChallenge`，必须由被挑战者在 30 秒内回复"接受"才会真正结算。`pvpChallenge(challengerPlayerId, targetPlayerId)` 是唯一的"免确认直接开打"路径，它**只被 REST 接口调用**（`POST /api/game/pvp/challenge`，见 `GameResource.pvpChallenge`），游戏内没有对应指令。
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
| 6 | 今日次数 < 10 | `今日切磋次数已用完（每天最多 10 次），明日再来吧` |
| 7 | **立即扣 1 次** | — |
| 8 | 目标没有未超时的待处理挑战 | `【X】正在被他人挑战中，稍后再试` |
| 9 | 自己也没有未超时的待处理挑战 | `你已向【X】发起了挑战，等待对方回应中` |

::: warning 第 7 步先于第 8/9 步
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
int reflectPercent = ServiceRegistry.getBuffService().getReflectionPercent(defender.getId());
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

**没有任何额外惩罚**：不掉经验、不掉金币、不掉物品。唯一的后果是 HP/MP 被写成战斗结束时的真实值（可能为 0 → 重伤），以及当日 PVP 次数已消耗。

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

::: warning 两个指令类持有的 CombatService 实例不同，跨指令接受会失败
`pendingChallenges` 是 `CombatService` 的实例字段：

* `com.mtxgdn.onebot.command.combat.PvpCommand` 用 `ServiceRegistry.getCombatService()`（共享实例）；
* `com.mtxgdn.onebot.command.pvp.PvpCommand` 在构造函数里 `this.combatService = new CombatService()`（**独立实例**）；
* `SecretRealmService`、`ExplorationService` 也各自 `new CombatService()`。

因此用 `/挑战 X` 发出的挑战只能由 `/挑战 接受` 接下；用 `/决斗 X` 发出的挑战只能由 `/决斗 接受` 接下。混用会得到 `没有待接受的挑战，可能已超时`。另外服务端一旦重启，所有待接受挑战立即消失。
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

`POST /api/game/pvp/challenge`（`src/main/java/com/mtxgdn/rest/GameResource.java`），权限 `game.pvp.challenge`。

| 项目 | 内容 |
| --- | --- |
| 请求体 | `{"targetPlayerId": <long>}` |
| 校验 | `targetPlayerId <= 0` → `GameErrorCode.PARAM_MISSING` |
| 行为 | 直接调用 `combatService.pvpChallenge(challengerPlayerId, targetPlayerId)`，**跳过接受确认环节** |
| 返回字段 | `winner`、`challengerWon`、`challengerName`、`targetName`、`challengerRemainingHp`、`targetRemainingHp`、`totalRounds`、`expReward`、`goldReward`、`battleLog` |
| 失败 | `GameMessage.restError(400, combatResult.getMessage())` |

`pvpChallenge` 与 `createChallenge` 一样先校验次数并扣减，然后直接进 `executePvp`。它**不检查**待处理挑战冲突，因此 REST 路径可以绕过"目标正在被挑战中"的限制。
