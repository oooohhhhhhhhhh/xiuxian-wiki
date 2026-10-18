# 世界 Boss

世界 Boss 是**全服共享同一份血量**的公共目标：你打掉多少，血条就扣多少，其他玩家接着打剩下的。
奖励按**伤害比例分红**而不是击杀独占 —— 参与就有份，补最后一刀另有加成。

实现位于 `src/main/java/com/mtxgdn/game/service/WorldBossService.java`（796 行），
实体 `game/entity/WorldBoss.java`、`WorldBossDamage.java`，
QQ 入口为 `src/main/java/com/mtxgdn/onebot/command/worldboss/WorldBossCommand.java`（353 行）。

相关源码：

| 关注点 | 文件 |
| --- | --- |
| 池子生成 / 惰性重建 / 挑战 / 结算 | `src/main/java/com/mtxgdn/game/service/WorldBossService.java` |
| Boss 实体与伤害台账实体 | `src/main/java/com/mtxgdn/game/entity/WorldBoss.java`、`WorldBossDamage.java` |
| QQ 指令与 HTTP 路由 | `src/main/java/com/mtxgdn/onebot/command/worldboss/WorldBossCommand.java` |
| 内置模块注册 | `src/main/java/com/mtxgdn/plugin/builtin/WorldBossPlugin.java` |
| 建表 | `src/main/java/com/mtxgdn/db/DatabaseSchema.java`（`createWorldBossesTable` / `createWorldBossDamageTable`） |

## 一、与另外两种 Boss 的分工

| 类型 | 血量归属 | 奖励来源 | 实现 |
| --- | --- | --- | --- |
| 个人 PVE Boss | 只属于你这一场战斗 | 战斗结算自带掉落 | `CombatService.pveFight` |
| 团队 Raid Boss | 属于进入副本的这一队 | 三形态推进 + 击杀奖励 | `CombatService.raidBossFight` |
| **世界 Boss** | **全服共享，直接落库** | **按伤害比例从预算里分红** | `WorldBossService` |

世界 Boss 走的是普通 PVE 战斗的模拟流程，但把 Boss 转成怪物时**奖励字段全部置零**
（`toMonster`）—— 否则同一场战斗会同时发"普通怪掉落"和"伤害分红"两份奖励。

## 二、指令

| 指令 | 别名 | 参数 | 说明 | 权限码 | 模块 |
| --- | --- | --- | --- | --- | --- |
| `/世界boss` | `worldboss` | — | 查看当前 Boss 池（血量、预算、你的累计伤害与冷却） | `game.player.info` | `world_boss` |
| `/世界boss 挑战` | `challenge`、`打` | `[序号\|名称\|BossID]` | 出手挑战；不带参数默认第 1 只 | `game.pvp.challenge` | `world_boss` |
| `/世界boss 排行` | `rank`、`贡献` | `[序号\|名称\|BossID]` | 查看该 Boss 的伤害榜（前 10） | `game.player.info` | `world_boss` |
| `/世界boss 刷新` | `refresh` | — | **管理员**强制重建整池 | `admin.database.access` | `world_boss` |
| `/世界boss help` | `帮助`、`?` | — | 帮助 | — | `world_boss` |

目标选择的优先级：纯数字先当**序号**（1 起），超出池子大小再当 **Boss ID**；
非数字先精确匹配名称，再按名称包含匹配。

## 三、Boss 池与生命周期

一个池子里默认 3 只 Boss，按序号切成**低 / 中 / 高**三档境界区间（数量不等于 3 时按比例分档，
首尾两档一定覆盖到上下界）。

| 项 | 规则 |
| --- | --- |
| 池子数量 | `world_boss.boss_count`（默认 3，范围 1–10） |
| 境界上限 | 取**全服最高境界**，至少 3（新服也不会三只都是 0 境界的同一只怪） |
| 名称 / 描述 / 攻防速 | 复用 `Monster.createBossForRealm(realm, random)`，与普通 Boss 同一套本地化文案 |
| 血量 | 同境界普通 Boss × `hp_multiplier`（默认 12），并**夹到 `Integer.MAX_VALUE`** |
| 灵石预算 | `200 × (realm + 1)²` |
| 修为预算 | `2000 × (realm + 1)³` |
| 整池重建周期 | `respawn_hours`（默认 4 小时） |

::: tip 没有内存态，也没有定时器
血量直接落库，**服务重启后血条原样还在**。到期重建走的是读取时的惰性判断
（`WorldBoss.isExpired`）：任何一次读取发现池子为空、数量不符或已过期，就当场重建。
因此不需要任何 `ScheduledExecutorService`。
:::

重建时会**先删旧池的伤害台账，再删旧 Boss** —— 否则台账会随着每次重建无限累积。

::: warning 击杀不等于立刻刷新
某只 Boss 被打死后，它的 `hp = 0`、`killed_at` 与 `killer_player_id` 被写入，
但它**不会单独复活**：整池仍按 `expires_at` 一起重建。
在此期间列表里显示「已被击杀　最后一刀：某某」。
:::

## 四、挑战流程与限制

`/世界boss 挑战` 的执行顺序是刻意的：**先抢占冷却槽 → 再打 → 最后在同一事务里扣血并结算奖励**。
先抢占是为了让"连点两下"这种并发只会有一次真正进入战斗；扣血与发奖同事务，
是为了不出现"血扣了但没发奖"或"发了奖但血没扣"。

| 拒绝条件 | 提示 |
| --- | --- |
| Boss 已被击杀 | 【X】已被击杀，整池将在 … 重建 |
| 角色不存在 | 角色不存在 |
| 生命值 ≤ 0 | 你的生命值不足，无法挑战世界Boss |
| 正在闭关 | 闭关中无法挑战世界Boss，请先 `/停止` 结束打坐 |
| 境界序位差 ≥ `max_stage_gap` | 境界差距过大，不可挑战（需境界序位差小于 9，当前差 N） |
| 冷却未过 | 挑战冷却中，还需等待 N 分 N 秒 |

**境界序位** = `大境界 × 3 + 小境界`。判定用的是
`|玩家境界序位 − Boss境界序位|`，Boss 的境界序位按 `realm × 3` 计算，
所以 `max_stage_gap` 默认 9 大致等于"三个大境界"。

**挑战冷却**默认 300 秒（`challenge_cooldown_seconds`，`0` = 不限制）。
本项目没有体力系统，若不限次，一个高境界玩家可以连着把 Boss 打死，其他人连参与的份都没有。
冷却记在伤害台账的 `last_hit_at` 上，并用**条件更新**抢占，并发下只会有一次成功。

## 五、奖励：按伤害分红

每次挑战的奖励公式（`settleDamage`，全程在一个事务内、对 Boss 行 `SELECT … FOR UPDATE` 之后计算）：

```
本次伤害 = min(起始血量, 起始血量 − 战斗结束时怪物剩余血量)
灵石 = 灵石预算 × 本次伤害 / 最大血量
修为 = 修为预算 × 本次伤害 / 最大血量
若本次补上最后一刀：修为 += 修为预算 × kill_bonus_ratio（默认 0.2）
```

::: tip 为什么"天然不会超发"
累计伤害不会超过最大血量，所以全服累计发放**结构性地**不超过预算 ——
不依赖事后核对，也不怕并发。这是把"击杀独占奖励"换成"按伤害分红"换来的性质。
:::

举例：某 Boss 最大血量 120,000、灵石预算 8,000、修为预算 64,000。

| 玩家 | 本次伤害 | 灵石 | 修为 |
| --- | --- | --- | --- |
| A | 12,000（10%） | 800 | 6,400 |
| B | 30,000（25%） | 2,000 | 16,000 |
| C | 78,000（65%，补最后一刀） | 5,200 | 41,600 + 12,800（击杀加成） |

### 超发熔断

单次奖励超过 `max_single_reward`（默认 1,000,000）时，改发 `上限 / (5 + rand(6))`，
即落回阈值的 1/10 ~ 1/5 之间，并在战报里明示「⚠ 本次奖励过高，已按超发熔断折算发放」。

这不是日常路径 —— 正常的伤害分红已经被预算限死。它防的是**配置事故**
（比如把 `exp_budget` 多写一个零）被一次击杀放大成经济崩溃。
高境界 Boss 的修为预算按境界立方增长，确实会撞上这个阈值，这正是它存在的意义。

## 六、数据表

### `world_bosses`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BIGINT 主键 | Boss ID |
| `scope` | VARCHAR(64) NOT NULL | 池子归属键，单世界服务器固定 `global` |
| `slot` | INT NOT NULL | 池内序号（1..N），与 `scope` 组成唯一键 |
| `name` / `description` | VARCHAR | 名称与描述 |
| `realm` | INT | 境界（大境界 id） |
| `hp` / `max_hp` | BIGINT | **当前共享血量** / 生成时的满血 |
| `attack` / `defense` / `speed` | INT | 三围 |
| `stone_budget` / `exp_budget` | BIGINT | 灵石 / 修为预算（分红基数） |
| `expires_at` | BIGINT | 整池重建时间戳（毫秒） |
| `killed_at` | BIGINT | 击杀时间，`0` = 未死 |
| `killer_player_id` | BIGINT NULL | 补最后一刀的人（外键 `ON DELETE SET NULL`） |
| `created_at` / `updated_at` | 时间戳 | |

约束：`UNIQUE (scope, slot)`；索引 `idx_world_bosses_scope_expires` on `(scope, expires_at)`。

::: tip 为什么 `slot` 要和 `scope` 组成唯一键
两个请求同时发现池子过期、同时重建时，后写入的那个会撞唯一键失败，
捕获后重新读取即可 —— 不会出现两套 Boss。
:::

### `world_boss_damage`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `boss_id` | BIGINT NOT NULL | 所属 Boss |
| `player_id` | BIGINT NOT NULL | 玩家（外键 `ON DELETE CASCADE`） |
| `damage` | BIGINT | 累计伤害 |
| `hits` | INT | 出手次数 |
| `last_hit_at` | BIGINT | 最近一次出手时间戳，**挑战冷却就记在这里** |

约束：`UNIQUE (boss_id, player_id)`。台账在整池重建时一并清空。

## 七、HTTP 接口

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/game/worldboss/list` | `game.player.info` | 当前 Boss 池 |
| `POST` | `/game/worldboss/challenge` | `game.pvp.challenge` | 出手挑战 |
| `GET` | `/game/admin/world-boss` | `admin.database.access` | 管理员视角的池子详情 |
| `POST` | `/game/admin/world-boss/refresh` | `admin.database.access` | 强制重建整池 |

## 八、配置

全部键位于 `world_boss.*`，逐项说明见[配置项全表](/reference/config-keys#_15e-世界-boss-world-boss)。

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `scope` | `global` | 池子归属键。将来若要「按群 / 按分线」各有一批，改这里即可，不必改表结构 |
| `boss_count` | `3` | 池内 Boss 数（1–10） |
| `respawn_hours` | `4` | 整池重建周期（小时） |
| `hp_multiplier` | `12` | 相对同境界普通 Boss 的血量倍率 |
| `max_stage_gap` | `9` | 境界序位差达到该值即不可挑战 |
| `challenge_cooldown_seconds` | `300` | 每人每只 Boss 的挑战冷却（`0` = 不限制） |
| `max_single_reward` | `1000000` | 单次奖励熔断阈值 |
| `kill_bonus_ratio` | `0.2` | 补最后一刀者额外获得的修为比例 |

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 列表里三只 Boss 都是 0 境界 | 全服最高境界就是 0（新服）。境界上限至少取 3，但生成区间仍从 0 起 |
| 打死之后没刷新 | 击杀不触发单独刷新，整池按 `expires_at` 统一重建；管理员可用 `/世界boss 刷新` 立即换一批 |
| 一直提示冷却中 | 每人**每只 Boss** 独立冷却，换一只 Boss 不受影响；冷却值见 `challenge_cooldown_seconds` |
| 奖励比预想少很多 | 检查是否触发了超发熔断（战报会明示），或该 Boss 的预算本身较低（预算按境界平方/立方增长） |
| 挑战后伤害为 0 | 战斗没打掉 Boss 的血（例如你被击败）。此时仍会记一次出手并开始冷却 |
| 血条和战斗里的数字对不上 | Boss 血量落库是 `BIGINT`，但战斗模拟里的怪物血量是 `int`，生成时已夹到 `Integer.MAX_VALUE`；超过该值的配置不会生效 |
