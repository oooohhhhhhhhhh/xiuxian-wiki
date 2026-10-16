# Buff 系统

Buff 系统由 `BuffService` 统一实现，但内部其实是**三套互相独立的机制**：一套把属性加成持久化到 `player_buffs` 表（丹药/符箓类临时增益），另外两套只存在内存里（经验倍率、伤害反弹）。三者的查询入口不同，`/增益` 只能看到第一套。

关键源码：

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/game/service/BuffService.java` | 全部 Buff 逻辑（503 行） |
| `src/main/java/com/mtxgdn/game/item/BuffEffect.java` | 物品触发的属性 Buff |
| `src/main/java/com/mtxgdn/game/item/ExpMultiplierEffect.java` | 经验倍率 Buff |
| `src/main/java/com/mtxgdn/game/item/ReflectionBuffEffect.java` | 伤害反弹 Buff |
| `src/main/java/com/mtxgdn/game/item/AttributeResetEffect.java` | 洗髓丹：清空全部 Buff |
| `src/main/java/com/mtxgdn/onebot/command/item/BuffCommand.java` | `/增益` |
| `src/main/java/com/mtxgdn/rest/GameResource.java` | `GET /game/buff` |

## 三套机制对比

| 机制 | 存储 | 载体 | 过期回收 | 出现在 `/增益` | 出现在 `GET /game/buff` |
| --- | --- | --- | --- | --- | --- |
| 属性 Buff | `player_buffs` 表 | 丹药、符箓（`BuffEffect` 且 `durationSeconds > 0`） | 访问时即时过期 + 后台兜底每 60 秒扫一次（`buff.expire_sweep_seconds`，下限 10） | 是 | 是 |
| 经验倍率 Buff | `EXP_BOOSTS` 内存 Map | 经验加倍丹 | 30 秒一次的惰性清理 + 读取时判定 | **否** | **否** |
| 伤害反弹 Buff | `REFLECTION_BUFFS` 内存 Map | 反射丹 | 同上 | **否** | **否** |

```java
/** 经验倍率 Buff：playerId -> {percentX100, expireAtMs}（内存态，重启即失效，可接受） */
private static final Map<Long, long[]> EXP_BOOSTS = new java.util.concurrent.ConcurrentHashMap<>();
/** 伤害反弹 Buff：playerId -> {percentX100, expireAtMs} */
private static final Map<Long, long[]> REFLECTION_BUFFS = new java.util.concurrent.ConcurrentHashMap<>();
```
::: warning 经验倍率与伤害反弹 Buff 是内存态，重启即失效
`EXP_BOOSTS` / `REFLECTION_BUFFS` 不落库。服务器重启后玩家身上的「经验 +50%」和「反弹 30%」立即消失，**不返还道具也不补时长**。源码注释对此的说明是「重启即失效，可接受」。
:::

## 数据表 `player_buffs`

```java
"CREATE TABLE IF NOT EXISTS player_buffs (" +
    "id " + pk + ", " +
    "player_id BIGINT NOT NULL, " +
    "buff_id VARCHAR(64) NOT NULL, " +
    "attack_bonus INT DEFAULT 0, " +
    "defense_bonus INT DEFAULT 0, " +
    "speed_bonus INT DEFAULT 0, " +
    "spirit_bonus INT DEFAULT 0, " +
    "expire_time BIGINT NOT NULL, " +
    "created_at " + tsDefault +
    (dialect.supportsForeignKeysInCreateTable()
            ? ", FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE" : "") +
    ")"
```

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 自增 |
| `player_id` | `BIGINT NOT NULL` | 外键 → `players(id)` ON DELETE CASCADE |
| `buff_id` | `VARCHAR(64) NOT NULL` | Buff 标识，由四维加成拼成 |
| `attack_bonus` | `INT DEFAULT 0` | 攻击加成 |
| `defense_bonus` | `INT DEFAULT 0` | 防御加成 |
| `speed_bonus` | `INT DEFAULT 0` | 速度加成 |
| `spirit_bonus` | `INT DEFAULT 0` | 灵力加成 |
| `expire_time` | `BIGINT NOT NULL` | 过期时间戳（毫秒，`System.currentTimeMillis()` 基准） |
| `created_at` | 时间戳 | 创建时间 |

`DatabaseMigration.createPlayerBuffsTable` 用同样的语句做旧库补表。表上**没有** `UNIQUE (player_id, buff_id)` 约束，唯一性由 `BuffService.addBuff` 的「先查后插」在事务内保证。

## 属性 Buff 的 buffId 命名规则

`BuffEffect` 用四维加成拼出 `buffId`：

```java
buffService.addBuff(playerId, "buff_" + attackBonus + "_" + defenseBonus + "_" + speedBonus + "_" + spiritBonus,
    attackBonus, defenseBonus, speedBonus, spiritBonus, durationSeconds);
```

格式：`buff_<攻击>_<防御>_<速度>_<灵力>`

| 物品 | buffId |
| --- | --- |
| 神力丹 | `buff_30_20_0_0` |
| 灵力丹 | `buff_0_0_0_50` |
| 终极神力丹 | `buff_50_50_20_30` |
| 神行符 | `buff_0_0_25_10` |

::: tip buffId 只由数值决定，与物品无关
两个不同物品只要四维加成完全相同，就会共用同一个 `buffId`，后用的只会刷新前者的时长。当前内置物品中没有数值冲突的组合。装备类物品的 `BuffEffect` 因为 `durationSeconds = 0`，**不会**生成 `buffId`。
:::

## 属性 Buff 列表

`BuffEffect.of(攻击, 防御, 速度, 灵力, 持续秒)`，`durationSeconds > 0` 的才写入 `player_buffs`：

| Buff 名称（道具） | 道具 key | 攻击 | 防御 | 速度 | 灵力 | 持续 | buffId |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 神力丹 | `mtxgdn:power_buff_pill` | +30 | +20 | 0 | 0 | 60 秒 | `buff_30_20_0_0` |
| 神行符 | `mtxgdn:speed_talisman` | 0 | 0 | +25 | +10 | 120 秒 | `buff_0_0_25_10` |
| 灵力丹 | `mtxgdn:spirit_boost_pill` | 0 | 0 | 0 | +50 | 300 秒 | `buff_0_0_0_50` |
| 终极神力丹 | `mtxgdn:ultimate_power_pill` | +50 | +50 | +20 | +30 | 600 秒 | `buff_50_50_20_30` |

这就是全部会写入 `player_buffs` 的道具。

### 内存态 Buff 列表

| Buff 名称（道具） | 道具 key | 参数 | 持续 | 生效位置 |
| --- | --- | --- | --- | --- |
| 经验加倍丹 | `mtxgdn:exp_multiplier_pill` | 经验获取 +50% | 300 秒 | `PlayerService.addExperience` |
| 反射丹 | `mtxgdn:damage_reflection_pill` | 伤害反弹 30% | 120 秒 | `CombatService` 两处 |

经验倍率的实际生效代码：

```java
public void addExperience(Connection conn, long playerId, long exp) throws SQLException {
    Player player = getPlayerById(playerId);
    if (player != null) {
        exp = (long) (exp * getFinalExpBonus(player));
        // 经验翻倍丹等 Buff 加成
        double buffMult = ServiceRegistry.getBuffService().getExpMultiplier(playerId);
        if (buffMult > 1.0) {
            exp = (long) (exp * buffMult);
        }
    }
    ...
}
```

伤害反弹的生效位置：

| 场景 | 代码 |
| --- | --- |
| PvP / 玩家对玩家 | `CombatService` 第 408 行：`int reflectPercent = ...getReflectionPercent(defender.getId());` 反弹给 `attacker` |
| PvE / 玩家对怪物 | `CombatService.reflectMonsterDamage`：反弹给怪物，并可能**反杀怪物**（返回 `true` 表示怪物被打死） |

两处都是 `Math.max(1, damage * reflectPercent / 100)`——伤害为 1 时也会反弹至少 1 点。

## 加 Buff：同名只刷新时长

`BuffService.addBuff(playerId, buffId, atk, def, spd, spirit, durationSeconds)` 全程在一个事务里：

1. 查 `SELECT id FROM player_buffs WHERE player_id = ? AND buff_id = ?`；
2. **已存在** → 只 `UPDATE expire_time = ?`，**不重复叠加属性**，直接返回；
3. 不存在 → `INSERT` 新行，然后按非零项逐项把加成写进 `players` 表：

```java
PlayerService playerService = ServiceRegistry.getPlayerService();
if (attackBonus != 0) playerService.addAttack(conn, playerId, attackBonus);
if (defenseBonus != 0) playerService.addDefense(conn, playerId, defenseBonus);
if (speedBonus != 0) playerService.addSpeed(conn, playerId, speedBonus);
if (spiritBonus != 0) playerService.addSpirit(conn, playerId, spiritBonus);
```

::: warning 属性加成直接写进 `players` 表，不是「读取时动态计算」
`player_buffs` 只是「记账本」：真正生效的是 `players.attack/defense/speed/spirit` 已被加上去的部分。因此：

- 最终属性 `getFinalAttack` = 称号加成后的 `players.attack` + 强化加成，**Buff 加成已经包含在 `players.attack` 里**；
- 过期或移除时必须**精确反向扣除**，否则属性会漂移；
- 重复使用同种丹药只刷新时长，不会二次加属性（否则会出现属性叠乘）。
:::

## 过期回收

属性 Buff 采用**「访问时即时过期」+「后台低频兜底」**两条通道：

```java
private static final int EXPIRE_SWEEP_SECONDS =
        Math.max(10, com.mtxgdn.util.AppConfig.getInt("buff.expire_sweep_seconds", 60));

static {
    // 首个 tick 延迟 30 秒，避开数据库初始化与启动高峰
    scheduler.scheduleAtFixedRate(() -> {
        try { checkExpiredBuffs(); } catch (Throwable t) { LOG.warn("增益过期兜底回收任务异常: " + t); }
    }, 30, EXPIRE_SWEEP_SECONDS, TimeUnit.SECONDS);

    scheduler.scheduleAtFixedRate(BuffService::cleanupExpiredMemoryBuffs, 30, 30, TimeUnit.SECONDS);
}
```

| 任务 | 首次延迟 | 周期 | 行为 |
| --- | --- | --- | --- |
| `expirePlayerBuffs`（惰性） | — | 每次访问 | 玩家读取或操作 Buff 时，在业务事务内即时结算该玩家已过期的行 |
| `checkExpiredBuffs`（兜底） | 30 秒 | **`buff.expire_sweep_seconds`，默认 60 秒、下限 10 秒** | 查出 `expire_time <= now` 的行 → 事务内逐项反向扣属性 → `DELETE FROM player_buffs WHERE expire_time <= ?` |
| `cleanupExpiredMemoryBuffs` | 30 秒 | 30 秒 | 清理 `EXP_BOOSTS` / `REFLECTION_BUFFS` 中已过期的条目 |

::: tip 为什么还需要兜底任务
增益加成是**物化在 `players` 表上的**（加成直接写进了玩家属性）。玩家离线后不会再访问 Buff，惰性过期就没有触发点，属性会一直虚高，所以必须保留一条与玩家行为无关的低频通道。

但代价不应与表总量相关：配合 `idx_player_buffs_expire` 索引（`player_buffs(expire_time)`），单次代价只与"已过期的行数"相关。原实现是**每秒**执行一次 `WHERE expire_time <= ?` 的全表扫描，本改造把它降到默认 60 秒一次，活跃玩家则完全由访问时的惰性过期即时处理。
:::

调度器是**守护线程**（线程名 `buff-expire-sweeper`，`setDaemon(true)`），不会阻止 JVM 退出；需要显式关闭时调 `BuffService.shutdownScheduler()`。

内存 Buff 即使没被清理线程扫到，读取时也会判定过期并顺手移除：

```java
public double getExpMultiplier(long playerId) {
    long[] boost = EXP_BOOSTS.get(playerId);
    if (boost == null || boost[1] <= System.currentTimeMillis()) {
        if (boost != null) EXP_BOOSTS.remove(playerId);
        return 1.0;
    }
    return 1.0 + boost[0] / 100.0;
}
```

## 主动清除

| 方法 | 作用范围 | 实现要点 |
| --- | --- | --- |
| `removeAllBuffs(playerId)` | **仅未过期的** `player_buffs` 行 | 先 `SELECT buff_id ... WHERE expire_time > now`，再逐个 `removeBuff` |
| `removeBuff(playerId, buffId)` | 单个 buffId | 读出四维 → `DELETE` → 反向扣属性 |
| `clearAllBuffs(playerId)` | **全部** `player_buffs` 行（含已过期） | 一次性 `SUM` 四维 → `DELETE` 全部 → 反向扣总和 |
| `removeAllBuffs` 的触发 | 洗髓丹（`AttributeResetEffect`） | `new BuffService().removeAllBuffs(playerId)`，同时 `addHp/addMp(Integer.MAX_VALUE)` 回满血蓝 |

洗髓丹的实际效果：

```java
public String execute(long playerId, PlayerService playerService, ItemService itemService) {
    new BuffService().removeAllBuffs(playerId);
    playerService.addHp(playerId, Integer.MAX_VALUE);
    playerService.addMp(playerId, Integer.MAX_VALUE);
    return "洗髓伐毛！已清除全部增益状态，生命与法力恢复至满值，";
}
```

::: warning 洗髓丹**清不掉**经验倍率与伤害反弹 Buff
`removeAllBuffs` 只操作 `player_buffs` 表；`EXP_BOOSTS` / `REFLECTION_BUFFS` 是独立的内存 Map，没有任何清除入口。服用洗髓丹后 `/增益` 会显示空，但经验加倍丹的 +50% 仍在生效。
:::

::: details `clearAllBuffs` 与 `reloadBuffsOnStartup` 是未使用的代码
全仓库 grep 只在 `BuffService` 内部找到这两个方法的定义，没有任何调用点。`clearAllBuffs` 的 `SELECT` **不过滤 `expire_time`**，会把已过期但尚未回收的行也计入总扣除额，语义上与 `removeAllBuffs` 不同；`reloadBuffsOnStartup` 会把未过期行的加成再加一遍到 `players`，而加成在 `players` 表里跨重启保留，正常流程下不应调用（否则重复叠加）。两者均为死代码。
:::

## 查询

### `getActiveBuffs(playerId)`

```sql
SELECT buff_id, attack_bonus, defense_bonus, speed_bonus, spirit_bonus, expire_time
FROM player_buffs WHERE player_id = ? AND expire_time > ?
```

返回 `Map`：`buffs` 为列表，每项含 `id`、`attackBonus`、`defenseBonus`、`speedBonus`、`spiritBonus`、`remainingSeconds`；另有 `count`。

`remainingSeconds` 用整数除法并夹到非负：

```java
buffInfo.put("remainingSeconds", Math.max(0, (rs.getLong("expire_time") - now) / 1000));
```

### 总加成

| 方法 | SQL 聚合列 |
| --- | --- |
| `getTotalAttackBonus` | `SUM(attack_bonus)` |
| `getTotalDefenseBonus` | `SUM(defense_bonus)` |
| `getTotalSpeedBonus` | `SUM(speed_bonus)` |
| `getTotalSpiritBonus` | `SUM(spirit_bonus)` |

四个方法都走同一个私有实现 `getTotalBonus(playerId, column)`，SQL 为 `SELECT COALESCE(SUM(<column>), 0) FROM player_buffs WHERE player_id = ? AND expire_time > ?`，**查询异常时返回 0** 而不是抛异常。

## 指令与接口

### `/增益`（别名 `buff`）

```java
super(new String[]{"增益", "buff"}, "查看当前增益状态", "/增益", "实用功能", null);
setModule("buff");
```

输出格式：

```text
=== 当前增益状态 ===
ID: buff_30_20_0_0
  攻击力: +30
  防御力: +20
  剩余时间: 42秒

【总增益】
攻击力 +30 | 防御力 +20 | 速度 +0 | 灵力 +0
```

无 Buff 时输出「暂无临时增益效果」。注意 `/增益` 只列出**非零**的项。

### `GET /game/buff`

`GameResource.getPlayerBuffs()`，权限 `game.player.info`：

| 字段 | 说明 |
| --- | --- |
| `buffs[]` | `id`、`attackBonus`、`defenseBonus`、`speedBonus`、`spiritBonus`、`remainingSeconds` |
| `count` | Buff 条数 |
| `totalAttackBonus` / `totalDefenseBonus` / `totalSpeedBonus` / `totalSpiritBonus` | 四维总加成 |

## 模块门控

`buff` 模块的开关只影响**过期回收线程**，不影响加 Buff：

```java
private static void cleanupExpiredMemoryBuffs() {
    // 内置模块门控：Buff 模块停用后暂停内存增益清理
    if (!com.mtxgdn.plugin.BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("buff")) return;
    ...
}

private static void checkExpiredBuffs() {
    // 内置模块门控：Buff 模块停用后暂停过期增益清理
    if (!com.mtxgdn.plugin.BuiltInPluginRegistry.getInstance().isEnabledOrUnknown("buff")) return;
    ...
}
```

`config/plugins.yml` 中的声明：

```yaml
  buff: true                   # Buff 系统（增益效果）
```

::: warning 停用 `buff` 模块会让所有属性 Buff 变成永久
停用后两个回收任务直接 `return`，`player_buffs` 里的行永不过期、属性加成也永不回退——**玩家会永久保留已获得的临时增益**。这是一个容易被忽略的副作用，停用该模块前应先清空 `player_buffs`。
:::

## 装备的「永久加成」不是 Buff

装备类物品的 `BuffEffect` 使用 `durationSeconds = 0`，`BuffEffect.isInstantEffect()` 返回 `true`，走另一条分支——**直接修改 `players` 表且不写 `player_buffs`**：

```java
@Override
public boolean isInstantEffect() {
    return durationSeconds <= 0;
}
```

```java
} else {
    if (attackBonus > 0) { playerService.addAttack(playerId, attackBonus); sb.append("攻击力 +").append(attackBonus).append("，"); }
    if (defenseBonus > 0) { playerService.addDefense(playerId, defenseBonus); ... }
    if (speedBonus > 0) { playerService.addSpeed(playerId, speedBonus); ... }
    if (spiritBonus > 0) { playerService.addSpirit(playerId, spiritBonus); ... }
}
```

| 项 | 装备类 `BuffEffect` | 丹药类 `BuffEffect` |
| --- | --- | --- |
| `durationSeconds` | `0` | `> 0` |
| 写入 `player_buffs` | 否 | 是 |
| 出现于 `/增益` | **否** | 是 |
| 回退时机 | 卸下/替换装备时（`ItemService`） | 过期或主动清除时 |
| 可被洗髓丹清除 | **否** | 是 |

因此装备提供的属性是**永久属性**，卸下装备才会回退。详见「装备与强化」页。

## 其他会改四维属性的系统（不是 Buff）

以下系统也直接修改 `players` 四维字段，但**不经过 `BuffService`、不可清除、不会过期**，排查属性异常时需要一并考虑：

| 系统 | 数值 | 触发 |
| --- | --- | --- |
| 天象共鸣（7 日 / 30 日） | HP +50/+100、MP +25/+50、攻 +5/+10、防 +3/+5、速 +3/+5、灵 +5/+10（经灵根倍率折算） | `DailyService.awardResonance` |
| 强化等级 | 攻/防/速/灵 按 `0.72/0.60/0.32/0.24 × L²` | `PlayerService.getEnhanceBonus`，读取时动态叠加 |
| 称号 | 各项加成 | `PlayerService.applyTitleBonus`，读取时动态叠加 |

## 线程与关闭

`BuffService` 无实例状态，大量调用点直接 `new BuffService()`；`EXP_BOOSTS`、`REFLECTION_BUFFS`、`scheduler` 都是 `static`，调度器由类静态块在**首次使用该类时**启动，`new BuffService()` 不会创建新线程。关闭走 `BuffService.shutdownScheduler()`，由 `ServerShutdownHook` 注册（`hook.addTask(BuffService::shutdownScheduler)`）。
