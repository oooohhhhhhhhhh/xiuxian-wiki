# 每日系统

每日系统由三部分组成：**`player_daily` 表驱动的跨日计数/复位**、**天象（每日随机全局增益）**、以及**签到（`player_economy` 表，7 天循环）**。

相关源码：

| 关注点 | 文件 |
| --- | --- |
| 每日状态、天象、晨修、机缘 | `src/main/java/com/mtxgdn/game/service/DailyService.java` |
| 签到 | `src/main/java/com/mtxgdn/game/service/EconomyService.java` |
| 表结构 | `src/main/java/com/mtxgdn/db/DatabaseSchema.java`（`createPlayerDailyTable`） |
| 迁移 | `src/main/java/com/mtxgdn/db/DatabaseMigration.java`（`pvp_count` 列） |
| 指令 | `src/main/java/com/mtxgdn/onebot/command/daily/DailyCommand.java`、`MorningCommand.java`、`src/main/java/com/mtxgdn/onebot/command/economy/SignInCommand.java` |

## 一、指令

| 指令 | 别名 | 说明 | 权限 | 模块 |
| --- | --- | --- | --- | --- |
| `/天象` | `/daily` | 查看今日天象、今日机缘与奖励 | `game.player.info` | `cultivation` |
| `/晨修` | `/morning` | 每日晨修，获取天象加成 | `game.player.info` | `cultivation` |
| `/签到` | `/signin` | 每日签到领取灵石奖励 | — | `economy` |

`/签到` 同时注册了 REST 路由 `POST economy/signin`。

## 二、`player_daily` 表

```java
public static String createPlayerDailyTable(String pk, String tsDefault, DatabaseDialect dialect) {
    return "CREATE TABLE IF NOT EXISTS player_daily (" +
            "player_id BIGINT PRIMARY KEY, " +
            "last_morning_cultivation VARCHAR(16), " +
            "consecutive_days INT DEFAULT 0, " +
            "total_active_days INT DEFAULT 0, " +
            "last_daily_reset DATE DEFAULT (CURRENT_DATE), " +
            "exploration_count INT DEFAULT 0, " +
            "battle_count INT DEFAULT 0, " +
            "secret_realm_count INT DEFAULT 0, " +
            "skill_learn_count INT DEFAULT 0, " +
            "pvp_count INT DEFAULT 0, " +
            "exploration_rewarded INT DEFAULT 0, " +
            "battle_rewarded INT DEFAULT 0, " +
            "secret_realm_rewarded INT DEFAULT 0, " +
            "skill_learn_rewarded INT DEFAULT 0, " +
            "resonance7_awarded INT DEFAULT 0, " +
            "resonance30_awarded INT DEFAULT 0" +
            (dialect.supportsForeignKeysInCreateTable()
                    ? ", FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE"
                    : "") +
            ")";
}
```

| 字段 | 类型 | 说明 | 跨日是否复位 |
| --- | --- | --- | --- |
| `player_id` | BIGINT 主键 | 玩家 id，外键指向 `players(id)`（支持的方言） | — |
| `last_morning_cultivation` | VARCHAR(16) | 上次晨修日期（`yyyy-MM-dd`） | 不复位（用于判定「今日已晨修」） |
| `consecutive_days` | INT | 连续晨修天数 | 不复位 |
| `total_active_days` | INT | 累计晨修天数（只增不减） | 不复位 |
| `last_daily_reset` | DATE | 上次行级复位日期 | 复位时刷新为今日 |
| `exploration_count` | INT | 今日游历次数 | ✅ 归零 |
| `battle_count` | INT | 今日战斗次数 | ✅ 归零 |
| `secret_realm_count` | INT | 今日秘境次数 | ✅ 归零 |
| `skill_learn_count` | INT | 今日学技能次数 | ✅ 归零 |
| `pvp_count` | INT | 今日 PVP 切磋次数（发起 + 接受合计） | ✅ 归零 |
| `exploration_rewarded` | INT | 游历机缘奖励是否已领 | ✅ 归零 |
| `battle_rewarded` | INT | 战斗机缘奖励是否已领 | ✅ 归零 |
| `secret_realm_rewarded` | INT | 秘境机缘奖励是否已领 | ✅ 归零 |
| `skill_learn_rewarded` | INT | 学技能机缘奖励是否已领 | ✅ 归零 |
| `resonance7_awarded` | INT | 灵根共鸣 7 天奖励（终身一次） | ❌ 不复位 |
| `resonance30_awarded` | INT | 灵根共鸣 30 天奖励（终身一次） | ❌ 不复位 |

`pvp_count` 是后加的列，由 `DatabaseMigration` 执行 `ALTER TABLE player_daily ADD COLUMN pvp_count INT DEFAULT 0` 补齐。

## 三、跨日复位：`ensureDailyReset`

```java
public void ensureDailyReset(long playerId) {
    String today = LocalDate.now().toString();
    String sql = "UPDATE player_daily SET " +
            "exploration_count = 0, battle_count = 0, secret_realm_count = 0, skill_learn_count = 0, pvp_count = 0, " +
            "exploration_rewarded = 0, battle_rewarded = 0, secret_realm_rewarded = 0, skill_learn_rewarded = 0, " +
            "last_daily_reset = ? WHERE player_id = ? AND (last_daily_reset IS NULL OR last_daily_reset <> ?)";
    ...
}
```

要点：

- **行级复位**：一条 UPDATE 把该玩家当天的全部计数与奖励标记一起归零，并把 `last_daily_reset` 刷成今日。
- **幂等**：`WHERE ... last_daily_reset <> today` 保证同一天内多次调用只生效一次。
- **调用时机**：每个计数型入口在累加前先调用（`onExplore` / `onBattle` / `onSecretRealm` / `onSkillLearn`），`getDailyInfo` 读取前调用，`CombatService` 在读写 PVP 次数前调用。
- **静态入口**：`DailyService.ensureDailyResetStatic(playerId)` 供跨系统调用。

::: tip 修复背景
源码注释指出：此前只有「触发当列」会在跨日归 1，其余列因共享 `last_daily_reset` 而跨日失效，机缘奖励标记也从不复位。现在改为**整行按日复位**，只有终身一次的灵根共鸣里程碑不在复位范围内。
:::

### 计数累加（同日内）

`dailyCountIncrementSql(countColumn)` 按方言生成 UPSERT，只做同日累加，不负责跨日判定：

```sql
-- SQLite
INSERT INTO player_daily (player_id, <col>, last_daily_reset) VALUES (?, 1, CURRENT_DATE)
ON CONFLICT(player_id) DO UPDATE SET <col> = <col> + 1, last_daily_reset = CURRENT_DATE

-- MySQL
INSERT INTO player_daily (player_id, <col>, last_daily_reset) VALUES (?, 1, CURRENT_DATE)
ON DUPLICATE KEY UPDATE <col> = <col> + 1, last_daily_reset = CURRENT_DATE
```

### 行创建

`getOrCreateDaily(playerId)` 先 `SELECT * FROM player_daily WHERE player_id = ?`，查不到时 `INSERT INTO player_daily (player_id) VALUES (?)` 后返回默认空对象（各计数为 0）。

## 四、天象

天象是**按自然日随机、全服一致**的全局增益。

```java
public CelestialPhenomenon getTodayPhenomenon() {
    LocalDate today = LocalDate.now();
    if (phenomenonDate == null || !phenomenonDate.equals(today)) {
        CelestialPhenomenon[] values = CelestialPhenomenon.values();
        todayPhenomenon = values[random.nextInt(values.length)];
        phenomenonDate = today;
    }
    return todayPhenomenon;
}
```

6 种天象等概率（各 1/6）。静态入口 `DailyService.getTodayPhenomenonStatic()` 供修炼/掉落等全局结算使用。

| 天象 | 描述 | 修炼 | 游历 | 战斗 | 灵石 |
| --- | --- | --- | --- | --- | --- |
| 紫气东来 | 晨曦紫气弥漫天地，修炼事半功倍 | ×1.30 | ×1.00 | ×1.00 | ×1.00 |
| 星辰耀天 | 满天星辰之力倾泻而下，游历收获颇丰 | ×1.00 | ×1.20 | ×1.20 | ×1.00 |
| 血月当空 | 血色月光笼罩大地，战斗之意空前高涨 | ×1.00 | ×1.00 | ×1.30 | ×1.00 |
| 灵潮涌动 | 天地灵潮汹涌而来，灵石遍地 | ×1.00 | ×1.00 | ×1.00 | ×1.50 |
| 枯荣交替 | 万物枯荣在一念之间，恢复之力大增 | ×1.00 | ×1.00 | ×1.00 | ×1.00 |
| 万籁俱寂 | 天地归于沉寂，一切收益微增 | ×1.05 | ×1.05 | ×1.05 | ×1.05 |

天象在玩法中的消费点：

| 系统 | 应用方式 |
| --- | --- |
| 在线闭关 | `PlayerService.cultivationMultiplier` 中 `mult *= 天象.getCultivationMultiplier()` |
| 离线闭关 | `OfflineRewardService` 中 `rawExp *= 天象.getCultivationMultiplier()` |
| 晨修 | `phenom.applyCultivation(baseExp + bonusExp)`、`phenom.applySpiritStone(baseSpiritStones)` |
| 游历 | 收益结算后按 `> 1.0` 追加 `explorationMultiplier` 差额（`星辰耀天` / `万籁俱寂`） |
| PVE 战斗 | `applyCombat(monster.getExpReward() / getGoldReward() / getSpiritStoneReward())` |
| 每日机缘 | 游历 3 次奖励 `applyCultivation`、秘境 1 次奖励 `applySpiritStone` |

### `/天象` 输出

```text
===== 今日天象 =====
天象: 紫气东来
晨曦紫气弥漫天地，修炼事半功倍

今日机缘: 探索秘境 3 次
完成奖励: 经验值

使用 /晨修 进行每日修炼
```

`getDailyInfo` 另外返回 `cultivationBonus` / `explorationBonus` / `spiritStoneBonus` 三个百分比字符串（`(倍率 − 1) × 100 + "%"`），以及 `morningCultivationDone`、`consecutiveDays`、`totalActiveDays` 与 `fortunes` 明细。

## 五、每日机缘

四项「机缘」按阈值自动发放，奖励为**一次性**（发放后写 `*_rewarded = 1`）：

| 机缘 | 触发阈值 | 奖励 | 标记字段 |
| --- | --- | --- | --- |
| 游历 | `exploration_count >= 3` | `天象.applyCultivation((realm + 1) × 100)` 经验 | `exploration_rewarded` |
| 战斗 | `battle_count >= 1` | `(realm + 1) × 200` 金币 | `battle_rewarded` |
| 秘境 | `secret_realm_count >= 1` | `天象.applySpiritStone((realm + 1) × 100)` 灵石 | `secret_realm_rewarded` |
| 学技能 | `skill_learn_count >= 1` | `(realm + 1) × 80` 经验 | `skill_learn_rewarded` |

检查函数 `checkAndAwardDailyFortune(playerId)` 在每次计数累加后被调用，四项互相独立，可同一次调用中同时发放多项。

`getDailyInfo` 展示的「今日机缘」按固定优先级挑选**第一个未完成**的任务：

| 顺序 | 条件 | 展示任务 | 展示奖励 |
| --- | --- | --- | --- |
| 1 | `!explorationRewarded && explorationCount < 3` | 探索秘境 3 次 | 经验值 |
| 2 | `!battleRewarded && battleCount < 1` | 参与战斗 1 次 | 金币 |
| 3 | `!secretRealmRewarded && secretRealmCount < 1` | 进入秘境 1 次 | 灵石 |
| 4 | `!skillLearnRewarded && skillLearnCount < 1` | 学习技能 1 次 | 经验值 |
| 5 | 全部已完成 | 今日机缘已全部完成 | （空） |

`fortunes` 字段为四个键 `exploration` / `battle` / `secretRealm` / `skillLearn`，每项含 `current`（当前次数）、`target`（阈值，依次为 3 / 1 / 1 / 1）、`rewarded`（是否已领）。

## 六、晨修

`DailyService.doMorningCultivation(playerId)`，指令 `/晨修`。

| 项 | 规则 |
| --- | --- |
| 时间窗口 | 本地 `hour >= 5 && hour < 11`；否则回「晨修须在卯时至巳时（5:00~11:00）进行…现在是 N 时」 |
| 每日频次 | 1 次；`last_morning_cultivation == 今日` 时回「今日已晨修，紫气已收入体内，明日再来吧」 |
| 连续天数 | 上次为**昨天**则 `consecutive_days + 1`，否则重置为 1 |
| 基础经验 | `(realm + 1) × 50` |
| 连修加成 | `+ baseExp × (consecutive_days − 1) × 0.10` |
| 经验倍率链 | 天象 → 灵根 `CULTIVATION_EFFICIENCY`（`×1.15`） → 季节追加 `(seasonMultiplier − 1)` |
| 基础灵石 | `(realm + 1) × 10` |
| 灵石倍率链 | 天象 `applySpiritStone` → 灵根 `SPIRIT_STONE_DROP`（`×1.20`） → 季节 `getSpiritStoneMultiplier()` |
| 计数 | `total_active_days + 1` |
| 后续 | 调用 `checkSpiritualRootResonance` |

写入使用方言化 UPSERT（SQLite `ON CONFLICT(player_id) DO UPDATE` / MySQL `ON DUPLICATE KEY UPDATE`），把 `last_morning_cultivation`、`consecutive_days` 覆盖为新值，`total_active_days` 在冲突时 `+ 1`（首次插入固定为 1）。

经验与灵石入账在同一事务内完成（`playerService.addExperience(conn, ...)` + `itemService.addSpiritStones(conn, ...)`）。

`/晨修` 在成功时追加两行：

```text
获得灵力: +{expGained}
获得灵石: +{spiritStonesGained}
```

::: warning 晨修不走心魔判定
`doMorningCultivation` 直接发放经验，不调用 `HeartDemonService`。心魔只出现在闭关结算（`/停止`）与洞府打坐中。
:::

## 七、灵根共鸣

`checkSpiritualRootResonance(playerId, player)` 在晨修后检查 `total_active_days`，两个里程碑均为**终身一次性**：

| 条件 | 奖励（按灵根比例放大） | 标记 |
| --- | --- | --- |
| `total_active_days == 7 && !resonance7_awarded` | 生命 `applyHpBonus(50)`、法力 `applyMpBonus(25)`、攻击 `applyAttackBonus(5)`、防御 `applyDefenseBonus(3)`、速度 `applySpeedBonus(3)`、神识 `applySpiritBonus(5)` | `resonance7_awarded` |
| `total_active_days == 30 && !resonance30_awarded` | 生命 `applyHpBonus(100)`、法力 `applyMpBonus(50)`、攻击 `applyAttackBonus(10)`、防御 `applyDefenseBonus(5)`、速度 `applySpeedBonus(5)`、神识 `applySpiritBonus(10)` | `resonance30_awarded` |

判定使用 `==` 精确比较，因此**只有在累计活跃天数恰好等于 7 / 30 的那次晨修**才触发；若某次晨修跳过了该值（例如一次性 +2），对应里程碑不会补发。灵根为空时不触发。触发时记录日志：`{玩家名} {共鸣文案}`。

## 八、签到

签到状态存在 `player_economy` 表（`last_sign_in` VARCHAR、`streak` INT），7 天一轮循环。

```java
private static final String[][] SIGN_IN_REWARDS = {
    {"下品灵石 x50", "mtxgdn:spirit_stone_low", "50"},
    {"下品灵石 x80 + 灵草 x2", "mtxgdn:spirit_stone_low", "80", "mtxgdn:spirit_grass", "2"},
    {"下品灵石 x120 + 铁矿石 x3", "mtxgdn:spirit_stone_low", "120", "mtxgdn:iron_ore", "3"},
    {"下品灵石 x160 + 回血丹 x2", "mtxgdn:spirit_stone_low", "160", "mtxgdn:healing_pill", "2"},
    {"下品灵石 x200 + 强化石 x1", "mtxgdn:spirit_stone_low", "200", "mtxgdn:enhance_stone", "1"},
    {"下品灵石 x260 + 回蓝丹 x2", "mtxgdn:spirit_stone_low", "260", "mtxgdn:mana_pill", "2"},
    {"下品灵石 x350 + 修炼丹 x1", "mtxgdn:spirit_stone_low", "350", "mtxgdn:cultivation_elixir", "1"},
};
```

| streak | 奖励展示文本 | 实际发放物品 |
| --- | --- | --- |
| 1 | 下品灵石 x50 | `mtxgdn:spirit_stone_low` × 50 |
| 2 | 下品灵石 x80 + 灵草 x2 | `spirit_stone_low` × 80、`mtxgdn:spirit_grass` × 2 |
| 3 | 下品灵石 x120 + 铁矿石 x3 | `spirit_stone_low` × 120、`mtxgdn:iron_ore` × 3 |
| 4 | 下品灵石 x160 + 回血丹 x2 | `spirit_stone_low` × 160、`mtxgdn:healing_pill` × 2 |
| 5 | 下品灵石 x200 + 强化石 x1 | `spirit_stone_low` × 200、`mtxgdn:enhance_stone` × 1 |
| 6 | 下品灵石 x260 + 回蓝丹 x2 | `spirit_stone_low` × 260、`mtxgdn:mana_pill` × 2 |
| 7 | 下品灵石 x350 + 修炼丹 x1 | `spirit_stone_low` × 350、`mtxgdn:cultivation_elixir` × 1 |

### 连签规则

```java
if (rec.lastSignIn != null) {
    LocalDate last = LocalDate.parse(rec.lastSignIn);
    if (last.plusDays(1).equals(LocalDate.now())) {
        newStreak = rec.streak % 7 + 1;   // 连续签到：1→2→…→7→1 循环
    } else {
        newStreak = 1;                     // 断签：重置为第 1 天
    }
} else {
    newStreak = 1;
}
```

| 情形 | 结果 |
| --- | --- |
| 今日已签到（`last_sign_in == today`） | 拒绝，回「今日已签到，明日再来吧」 |
| 上次签到是昨天 | `streak = streak % 7 + 1` |
| 断签（间隔 ≥ 2 天） | `streak = 1` |
| 从未签到 | `streak = 1` |

### 并发保护

1. 进入事务前先做一次 `last_sign_in == today` 预检。
2. 事务内**行锁复查**：`SELECT last_sign_in FROM player_economy WHERE player_id = ?`（MySQL 追加 `FOR UPDATE`），若已是今日则回滚并返回「今日已签到」。
3. 发奖与更新 `last_sign_in` / `streak` 在同一事务内，任一步失败即整体回滚。

`/签到` 回复格式：

```text
☀ 签到成功！
连续签到第 3 天
下品灵石 x120 + 铁矿石 x3

📅 本周进度: ●●●○○○○
```

## 九、其它每日限制

### PVP 每日次数

| 项 | 值 |
| --- | --- |
| 常量 | `CombatService.DAILY_PVP_LIMIT = 10` |
| 计数口径 | 发起 + 接受合计 |
| 存储 | `player_daily.pvp_count`，**持久化，重启不丢失** |
| 跨日 | 读写前调用 `ensureDailyReset`，跨天自动归零 |
| 超限提示 | `今日切磋次数已用完（每天最多 10 次），明日再来吧` |
| 降级 | 读取失败（表/列不存在）时记录日志并视为 0 |

原子递增 SQL 与 `dailyCountIncrementSql` 同构，只是把跨日分支内联进 UPSERT：SQLite 用 `pvp_count = CASE WHEN last_daily_reset = ? THEN pvp_count + 1 ELSE 1 END`，MySQL 用 `pvp_count = IF(last_daily_reset = ?, pvp_count + 1, 1)`。

### 好友拜访

`FriendService.visitFriend` 的每日限制是**内存态**（`DAILY_VISITS`），跨天时由 `ensureVisitDate()` 整体 `clear()`：

| 项 | 规则 |
| --- | --- |
| 限制 | 每日每位好友限一次 |
| 超限提示 | `今日已拜访过该好友，明日再来吧` |
| 奖励 | 双方各得 `(realm + 1) × 30` 经验与 `(realm + 1) × 5` 灵石，按各自境界计算 |
| 前置 | 必须是好友，且不能拜访自己 |

::: warning 内存态限制重启即失效
好友拜访次数保存在静态 `ConcurrentHashMap` 中，**服务重启会清空当日拜访记录**；跨日清空则依赖进程内日期比较。需要强一致时请以 `player_daily` 中的计数为准。
:::

## 十、重置时间汇总

| 系统 | 判定基准 | 复位方式 |
| --- | --- | --- |
| 每日机缘计数 / 奖励标记 / PVP 次数 | `LocalDate.now()`（服务器本地时区） | `player_daily` 行级 UPDATE，读写前触发 |
| 晨修 | `LocalDate.now()` 字符串与 `last_morning_cultivation` 比对 | 判定式，不物理清零 |
| 天象 | `LocalDate.now()` | 日期变化时重新随机并缓存 |
| 签到 | `LocalDate.now()` 与 `player_economy.last_sign_in` 比对 | 判定式；连签天数按 `% 7` 循环 |
| 好友拜访 | `LocalDate.now()` | 进程内 `clear()` |
| 灵根共鸣 | 无日期概念，按 `total_active_days` | 终身一次性，不重置 |

::: danger 时区
所有「每日」判定都使用 **JVM 默认时区** 的 `LocalDate.now()`。部署时请确认容器的 `TZ` 与玩家预期一致，否则会出现「凌晨 8 点才刷新」这类偏移。
:::
