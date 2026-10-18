# 经济系统

本页覆盖货币、获取与消耗途径、竞拍行、灵庄、商店、签到、兑换比例。核心实现是 `src/main/java/com/mtxgdn/game/service/EconomyService.java`（1024 行）与 `src/main/java/com/mtxgdn/onebot/command/economy/**`，灵石底层由 `ItemService` 的灵石便捷方法实现。

## 货币种类

| 货币 | 存储位置 | 说明 |
| --- | --- | --- |
| 金币 | `players.gold` | 与灵石双向兑换（汇率不对称） |
| 下品灵石 | 物品 `mtxgdn:spirit_stone_low` | 基准计价单位，汇率 `1` |
| 中品灵石 | 物品 `mtxgdn:spirit_stone_mid` | 汇率 `1000` |
| 上品灵石 | 物品 `mtxgdn:spirit_stone_high` | 汇率 `1000000` |
| 极品灵石 | 物品 `mtxgdn:spirit_stone_supreme` | 汇率 `1000000000` |
| 旧版灵石 | 物品 `mtxgdn:spirit_stone` | 历史遗留 key，按 `1:1` 计入下品等值 |
| 洞府灵气 | `caves.spirit_energy` | 不是货币，但灵石提纯必须消耗它 |

灵石相关常量定义在 `src/main/java/com/mtxgdn/game/item/CurrencyEffect.java`：

```java
public static final long[] EXCHANGE_RATES = {1, 1000, 1000000, 1000000000L};
public static final double[] AURA_MULTIPLIERS = {1.0, 2.0, 3.0, 5.0};

/** 每个玩家可持有的各等级灵石硬上限，0表示无限制 */
public static final long[] MAX_HOLD_PER_GRADE = {0, 999999, 9999, 99};

/** 各等级灵石合并阈值（以下品等值计），超过此值自动向上一级合并 */
public static final long[] CONSOLIDATE_THRESHOLD_LOW = {2000, 2000000, 2000000000L, 0};

/** 灵石等级名称 */
public static final String[] GRADE_NAMES = {"下品灵石", "中品灵石", "上品灵石", "极品灵石"};
```

| 等级 | key | 汇率 | 持有上限 | 灵气倍率 |
| --- | --- | --- | --- | --- |
| 0 下品 | `mtxgdn:spirit_stone_low` | 1 | 无限制（`0`） | 1.0 |
| 1 中品 | `mtxgdn:spirit_stone_mid` | 1,000 | 999,999 | 2.0 |
| 2 上品 | `mtxgdn:spirit_stone_high` | 1,000,000 | 9,999 | 3.0 |
| 3 极品 | `mtxgdn:spirit_stone_supreme` | 1,000,000,000 | 99 | 5.0 |

::: warning 「灵气倍率」目前是一组**死常量**
`AURA_MULTIPLIERS` 在代码里没有任何引用点 —— 灵石提纯（`/提纯`）走的是自己的成功率和消耗规则，
不读这个数组。保留它只是历史遗留，别按它推算收益。
:::

::: tip 灵石按"下品等值"统一记账
`ItemService.getSpiritStoneCount(playerId)` = 各级数量 × 汇率求和，再加上旧版 `mtxgdn:spirit_stone` 的数量。因此**所有"需要 N 灵石"的判定都是下品等值**，玩家不必手上恰好是下品灵石。
:::

### 灵石面额：四档是"面额"，不是"稀有度"

::: warning 纠正一个常见误解
下品 / 中品 / 上品 / 极品**不是四种稀有度不同的灵石**，而是同一个数值的四种**面额**：

```text
1 极品 = 1,000 上品 = 1,000,000 中品 = 1,000,000,000 下品
```

它们之间唯一的区别是**占用的持有上限额度不同**（中品 999,999 / 上品 9,999 / 极品 99），
所以高面额的作用是**压缩大额资产的表示形式**，而不是"更值钱的稀有货币"。
游戏内**没有任何内容会直接发放**中品及以上的灵石 —— 高面额只可能由压缩产生，
或由玩家用 `/灵石兑换` 主动换。
:::

### 灵石入账：先记下品，再向上压缩

| 操作 | 行为 |
| --- | --- |
| `addSpiritStonesAuto(amount)` | 先把整笔数量记到**下品**，再调用 `compressSpiritStones` 按阈值向上合并 |
| `compressSpiritStones()` | 逐级（下品→中品→上品→极品）把"超过阈值"的部分按汇率换成上一级 |
| `removeSpiritStones(amount)` | 先扣旧版灵石，再从下品往上逐级消耗；若某级面额大于剩余需求，多扣一块并按汇率用**下品灵石找零** |

压缩规则：每级保留最多 `CONSOLIDATE_THRESHOLD_LOW[级]` 的下品等值，其余全部进位。

| 级 | 保留阈值（下品等值） | 即最多保留 |
| --- | --- | --- |
| 下品 | 2,000 | 2,000 个下品 |
| 中品 | 2,000,000 | 2,000 个中品 |
| 上品 | 2,000,000,000 | 2,000 个上品 |
| 极品 | 0 | 不参与压缩 |

::: tip 为什么每级要"留 2000 不换"
留下一点低面额，是为了让**配方与任务里点名 `mtxgdn:spirit_stone_low` 的需求仍能直接满足**。
若把下品全部换成中品，玩家手里就没有下品可扣了。极品没有"上一级"，
阈值 `0` 表示它不参与压缩。
:::

::: warning 压缩刻意不套用 `MAX_HOLD_PER_GRADE`
中品的硬上限是 999,999，而上品的合并阈值是 2,000,000（下品等值）= 2,000 个中品 ——
两者相差三个数量级。如果压缩时先按持有上限截断，`≥ 10 亿` 的资产会被永久卡在下品里
再也换不上去。因此压缩只看阈值、不看持有上限。
:::

::: details 实测例子（`SpiritStoneGradeTest` 断言的精确数值）
| 发放总量（下品等值） | 下品 | 中品 | 上品 | 极品 |
| --- | --- | --- | --- | --- |
| 500 | 500 | 0 | 0 | 0 |
| 1,000,000,000 | 2,000 | 2,998 | 997 | 0 |
| 10,000,000,000 | 2,000 | 2,998 | 2,997 | 7 |
| 123,456,789 | 2,789 | 2,454 | 121 | 0 |

总量守恒：`997 × 10⁶ + 2,998 × 1000 + 2,000 ≈ 1e9`。
极品只有在总资产 **> 20 亿**（上品保留 2,000 个 = 2e9）之后才会出现。
压缩后的高面额灵石**可以正常消费** —— 扣款会从高面额往下拆。
:::

::: warning 富甲一方称号的每日检查
`addSpiritStones(playerId, amount)`（**不带 `Connection` 的那个重载**）在 `amount > 0` 时调用
`checkMillionaireTitle`：灵石价值 ≥ `1,000,000` 时触发 `TitleService.checkAndGrantTitles`
授予「富甲一方」。该检查用内存 `ConcurrentHashMap.newKeySet()` 做**每玩家每日一次**去重，
避免灵石入账热点每次都查库；因此跨日重置依赖 `millionaireDate` 与当前日期比较。

带 `Connection` 的重载**不做**这个检查 —— 它跑在调用方的事务里，不该在里面再查库发称号。
:::

::: details 三个 `addSpiritStones` 重载的区别
| 重载 | 落账方式 | 压缩 | 持有上限 | 称号检查 |
| --- | --- | --- | --- | --- |
| `addSpiritStones(playerId, amount)` | 全量记下品 | ✅ | 不涉及 | ✅ |
| `addSpiritStones(conn, playerId, amount)` | 全量记下品 | ✅ | 不涉及 | ❌ |
| `addSpiritStones(playerId, amount, grade)` | **直接记指定面额** | ❌ | ✅（`grade > 0` 时超限抛「灵石持有已达上限」） | ✅ |

第三个重载是"显式发放某一档"的通道，`MAX_HOLD_PER_GRADE` 那组上限就是为它准备的护栏。
**所有按"下品等值"发放的地方都应该走前两个**，否则极品会变成"这次奖励发得多"的副产品。
:::

## 经济指令总览

| 指令 | 别名 | 参数 | 权限节点 | 模块 | 源码 |
| --- | --- | --- | --- | --- | --- |
| `/签到` | `signin` | 无 | 无（`null`） | `economy` | `SignInCommand` |
| `/商店` | `shop` | `[编号]` | 无（`null`） | `economy` | `ShopCommand` |
| `/回收` | `recycle` | `<物品名> [数量]` | 无（`null`） | `economy` | `RecycleCommand` |
| `/灵庄` | `bank` | `[存入\|取出\|利率]` | 无（`null`） | `economy` | `BankCommand` |
| `/拍卖` | `auction` | `[出售\|出价\|我的]` | 无（`null`） | `economy` | `AuctionCommand` |
| `/修炼加速` | `boost` | `<灵石数量>` | 无（`null`） | `economy` | `CultivateBoostCommand` |
| `/货币兑换` | `币兑`、`currency_exchange` | `金币\|灵石 <数量>` | `game.player.info` | `economy` | `CurrencyExchangeCommand` |
| `/灵石兑换` | `石兑` | `[数量] <从> <到>` | `game.player.info` | `economy` | `StoneExchangeCommand` |
| `/提纯` | `purify`、`灵石提纯` | `<下品\|中品\|上品>` | `game.stone.purify` | `economy` | `PurifyCommand` |

::: details 同目录下的 `/转化` 不属于经济系统
`onebot/command/economy/ExchangeCommand.java` 虽然放在 `economy` 包下，但注册的是模块 `energy`、指令 `/转化`（别名 `exchange`、`convert`），用于物品与能量的互相转化，并受实验性插件开关 `experimental_energy_exchange` 控制。它与货币无关。
:::

### REST 接口

| 方法 | 路径 | 方法 | 路径 |
| --- | --- | --- | --- |
| POST | `economy/signin` | GET | `economy/auction/items` |
| GET | `economy/shop` | GET | `economy/auction/my` |
| POST | `economy/shop/buy`（body `id`） | POST | `economy/auction/create`（`itemKey`/`quantity`/`startPrice`/`hours`） |
| POST | `economy/recycle`（`itemKey`/`quantity`） | POST | `economy/auction/bid`（`listingId`/`amount`） |
| GET | `economy/bank/info` | POST | `economy/cultivate-boost`（`stones`） |
| POST | `economy/bank/deposit`（`type`/`amount`） | POST | `economy/purify` |
| POST | `economy/bank/withdraw`（`depositId`） | | |

## 金币 ↔ 灵石兑换

`/货币兑换 金币 <数量>` / `/货币兑换 灵石 <数量>`（`EconomyService.exchangeGoldToStones` / `exchangeStonesToGold`）。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `GOLD_TO_STONE_RATE` | `10` | 10 金币 → 1 下品灵石，`amount / 10` **向下取整** |
| `STONE_TO_GOLD_RATE` | `5` | 1 下品灵石 → 5 金币 |

| 方向 | 参数写法 | 最低额度 | 结果 |
| --- | --- | --- | --- |
| 金币 → 灵石 | `金币` 或 `gold`（不区分大小写） | `< 10` 报"至少需要 10 金币才能兑换灵石" | `stones = gold / 10` |
| 灵石 → 金币 | `灵石`、`stone`、`stones`（不区分大小写） | `< 1` 报"至少需要 1 下品灵石才能兑换金币" | `gold = stones * 5` |

::: warning 汇率不对称是有意设计
源码注释明确写道："汇率不对称，形成损耗"。同一笔价值往返一次：`100 金币 → 10 灵石 → 50 金币`，净损失 50%。两个方向都在**一个事务**内完成（`addGold(负数)` + `addSpiritStones` / `removeSpiritStones` + `addGold`）。
:::

指令层解析：`parts = args.trim().split("\\s+")`，`parts.length < 2` 时提示用法；数量 `Long.parseLong` 失败提示"数量必须是正整数"，`<= 0` 提示"数量必须大于 0"；方向非法提示"方向只能是: 金币（换灵石）或 灵石（换金币）"。无参数时展示帮助与当前余额（金币 + 下品灵石）。

## 灵石等级兑换

`/灵石兑换 [数量] <从> <到>`（`ItemService.exchangeSpiritStones`），例如 `/灵石兑换 1 中品 下品`。

| 规则 | 内容 |
| --- | --- |
| 方向 | **只能从高等级兑换为低等级**（`fromGrade > toGrade`），否则报"只能将高等级灵石兑换为低等级灵石" |
| 比例 | `rate = EXCHANGE_RATES[from] / EXCHANGE_RATES[to]`，即**每级 1:1000** |
| 数量 | 必须 `> 0`；来源灵石不足报"灵石不足" |
| 等级名 | `下品/low/0`、`中品/mid/1`、`上品/high/2`、`极品/supreme/3` |

成功返回 `fromAmount`、`fromGrade`、`toAmount`、`toGrade` 与文案"兑换成功！1 中品灵石 → 1000 下品灵石"。扣除与发放同事务。等级兑换按 1000 倍汇率**等值换算、不抽手续费**——手续费损耗只出现在金币↔灵石方向。

## 灵石提纯

`/提纯 <下品|中品|上品>`（`EconomyService.purifySpiritStone`）——消耗**洞府灵气** + 1000 块低级灵石，按概率产出 1 块高一级灵石。

| 源等级 | 目标 | 境界需求（realm 值） | 灵气消耗 | 基础成功率 |
| --- | --- | --- | --- | --- |
| 下品（0） | 中品 | `2`（筑基） | 100 | 90% |
| 中品（1） | 上品 | `4`（元婴） | 1,000 | 60% |
| 上品（2） | 极品 | `7`（大乘） | 10,000 | 30% |

```java
/** 提纯境界需求（按源等级 0/1/2）：筑基 / 元婴 / 大乘 */
private static final int[] PURIFY_REALM = {2, 4, 7};
/** 提纯单次消耗的洞府灵气（按源等级） */
private static final long[] PURIFY_AURA_COST = {100, 1000, 10000};
/** 提纯基础成功率（按源等级） */
private static final double[] PURIFY_BASE_RATE = {0.90, 0.60, 0.30};
/** 每次提纯消耗的源等级灵石数量（= 1 块高一级灵石的等值） */
private static final long PURIFY_STONE_COST = 1000;
```

- 成功率有**灵力加成**：`spiritBonus = Math.min(0.15, player.getSpirit() / 2000.0)`，最终 `Math.min(0.98, baseRate + spiritBonus)`，即最高 98%。
- 必须已有洞府，否则提示"提纯灵石需要借助洞府灵气，请先开辟洞府"。
- 事务内扣灵石、扣灵气（条件 UPDATE `WHERE id = ? AND spirit_energy >= ?`，影响 0 行则抛"洞府灵气不足"），成功才发放目标灵石。
- **失败也消耗**：1000 块源灵石与灵气都会消散。
- 帮助文案由 `getPurifyHelp(playerId)` 生成，末尾附带玩家当前四级灵石余额。
## 商店

`/商店` 浏览（`EconomyService.getShopItems()`），`/商店 <编号>` 购买（`buyFromShop`）。价格单位是**下品灵石**，每次购买 1 个。

| 编号 | 物品 | 价格（灵石） | 说明 |
| --- | --- | --- | --- |
| 1 | 回血丹 | 30 | 恢复 50 生命值 |
| 2 | 回蓝丹 | 25 | 恢复 30 法力值 |
| 3 | 回灵丹 | 60 | 恢复 100 生命 + 80 法力 |
| 4 | 修炼丹 | 150 | 获得 500 经验 |
| 5 | 渡劫丹 | 500 | 突破时 +10% 成功率 |
| 6 | 强化石 | 100 | 强化装备所需 |
| 7 | 灵草 | 20 | 炼丹基本材料 |
| 8 | 铁矿石 | 15 | 炼器基本材料 |
| 9 | 低级肥料 | 20 | 提高肥力 25%，助力作物生长 |
| 10 | 中级肥料 | 50 | 提高肥力 40%，更好的收成 |
| 11 | 高级肥料 | 100 | 提高肥力 60%，顶级收成 |
| 12 | 杀虫剂 | 30 | 清除农田病虫害 |
| 13 | 灵草种子 | 50 | 种植灵草，60 秒成熟 |
| 14 | 千年人参种子 | 200 | 种植千年人参，180 秒成熟 |
| 15 | 暗冰草种子 | 120 | 种植暗冰草，90 秒成熟 |
| 16 | 火焰藤种子 | 150 | 种植火焰藤，120 秒成熟 |
| 17 | 幽冥花种子 | 300 | 种植幽冥花，240 秒成熟（稀有） |
| 18 | 星草种子 | 500 | 种植星草，300 秒成熟（史诗） |
| 19 | 血灵芝种子 | 400 | 种植血灵芝，200 秒成熟（稀有） |
| 20 | 天山雪莲种子 | 1000 | 种植天山雪莲，420 秒成熟（传说） |

校验：`shopIndex < 1 || > 20` → "商品不存在（1~20）"；灵石不足 → "灵石不足，需要 N 下品灵石（当前: M）"。扣款与发货同事务。

## 物品回收

`/回收 <物品名> [数量]`（`EconomyService.recycleItem`），回收价为**物品原价的 30%**。

| 常量 | 值 |
| --- | --- |
| `RECYCLE_RATE` | `0.30` |

规则：

- 数量默认 1，必须 `> 0`。
- 物品不存在 → "物品不存在"；名称解析用 `ItemRegistry.resolve`（支持短 key）。
- **灵石本身不可回收**：`fullKey.startsWith("mtxgdn:spirit_stone")` → "灵石本身就是货币，无需回收"。
- **不可交易物品不可回收**：`!item.isTradeable()` → "该物品不可交易，无法回收"。
- 计算：`recycleValue = (long)(item.getPrice() * quantity * 0.30)`，`< 1` 时兜底为 `1`。
- 扣除物品与发放灵石同事务，成功文案"回收了【X】x N，获得 M 下品灵石"。

## 兑换码

兑换码是运营侧发放福利的渠道：管理员在后台「兑换码」页（`webadmin/assets/js/modules/redeemCodes.js`）
生成码并配置奖励，玩家在游戏里用 `/兑换 <码>`（别名 `/redeem`，权限码 `game.redeem.code`）领取。

| 项目 | 说明 |
| --- | --- |
| 奖励内容 | 金币、灵石、灵力（经验）、物品列表，可组合 |
| 使用次数上限 | `max_uses`；`0` 表示**不限次数**，达到上限后码自动变为 `redeemed` |
| 过期时间 | `expires_at`，过期后拒绝并自动标记为 `expired` |
| 每人限兑 | **每个角色对同一个码只能兑一次**，重复兑换提示「你已经兑换过此码了」 |

兑换在一个事务里完成「查重 → 记录兑换 → 递增使用次数 → 发放奖励」，因此并发下不会超发。

::: warning 两个容易踩的点
- 兑换码里配置的**物品 key 必须真实存在**：不存在的 key 会被静默跳过（不报错、也不发放），
  配置完最好先用测试号兑一次核对。
- 奖励列表为空时直接提示「兑换码配置为空」，不会消耗次数。
:::

数据落在 `redeem_codes`（码本身）与 `redeemed_codes`（谁兑过哪个码）两张表，详见[数据库设计](/dev/database)。
管理端接口为 `/api/admin/redeem-codes`，见 [REST API](/dev/rest-api)。

## 每日签到

`/签到`（`EconomyService.signIn`）。奖励按**连续天数 1~7 循环**发放。

| 连续天数 | 奖励 | 发放物品 |
| --- | --- | --- |
| 第 1 天 | 下品灵石 x50 | `spirit_stone_low` ×50 |
| 第 2 天 | 下品灵石 x80 + 灵草 x2 | `spirit_stone_low` ×80、`spirit_grass` ×2 |
| 第 3 天 | 下品灵石 x120 + 铁矿石 x3 | `spirit_stone_low` ×120、`iron_ore` ×3 |
| 第 4 天 | 下品灵石 x160 + 回血丹 x2 | `spirit_stone_low` ×160、`healing_pill` ×2 |
| 第 5 天 | 下品灵石 x200 + 强化石 x1 | `spirit_stone_low` ×200、`enhance_stone` ×1 |
| 第 6 天 | 下品灵石 x260 + 回蓝丹 x2 | `spirit_stone_low` ×260、`mana_pill` ×2 |
| 第 7 天 | 下品灵石 x350 + 修炼丹 x1 | `spirit_stone_low` ×350、`cultivation_elixir` ×1 |

连续天数推进逻辑：

```java
if (rec.lastSignIn != null) {
    java.time.LocalDate last = java.time.LocalDate.parse(rec.lastSignIn);
    if (last.plusDays(1).equals(java.time.LocalDate.now())) {
        newStreak = rec.streak % 7 + 1;   // 连续：循环推进
    } else {
        newStreak = 1;                     // 断签：重置
    }
} else {
    newStreak = 1;
}
```

| 规则 | 说明 |
| --- | --- |
| 日期基准 | `java.time.LocalDate.now().toString()`（服务器本地日期，格式 `yyyy-MM-dd`） |
| 重复签到 | 当天已签 → "今日已签到，明日再来吧" |
| 循环 | `streak % 7 + 1`，第 7 天之后回到第 1 天 |
| 并发防护 | 事务内行锁复查：`SELECT last_sign_in FROM player_economy WHERE player_id = ?`，**非 SQLite 时追加 `FOR UPDATE`** |
| 写入 | `updateSignIn` 用 upsert：SQLite 走 `ON CONFLICT(player_id) DO UPDATE`，MySQL 走 `ON DUPLICATE KEY UPDATE` |

::: warning 签到日期用本地时区
`last_sign_in` 存的是 `LocalDate` 字符串，判定完全依赖服务器本地时区与系统时钟。跨时区部署或改系统时间会直接影响"是否算连续"。
:::

## 灵石修炼加速

`/修炼加速 <灵石数量>`（`EconomyService.boostCultivation`）。

| 常量 | 值 |
| --- | --- |
| `STONES_PER_BOOST` | `100`（每 100 灵石 = 1 小时） |
| `BOOST_MULTIPLIER` | `1.5` |

| 规则 | 说明 |
| --- | --- |
| 前置条件 | 必须正在修炼（`player.isCultivating()`），否则"请先开始修炼（/修炼），才能使用灵石加速" |
| 最低数量 | `< 100` → "至少需要 100 下品灵石才能加速修炼" |
| 取整 | `boostHours = stonesToBurn / 100`，实际消耗 `boostHours * 100`（不足 100 的尾数不消耗） |
| 额外经验 | `normalExp = 修炼速度(realm) × boostHours × 3600`；`bonusExp = normalExp × (1.5 - 1.0)` |

即加速的收益以**额外经验**形式一次性发放（`playerService.addExperience`），不改变修炼状态本身。扣灵石与发经验同事务。

## 灵庄（银行）

`/灵庄` 查看账户，`/灵庄 存入 <活期|7天|30天|90天> <数量>`，`/灵庄 取出 <编号>`，`/灵庄 利率`。

### 存款产品

| 类型 | 类型参数 | 期限 | 利率 | 说明 |
| --- | --- | --- | --- | --- |
| 活期 | `current` | 无 | 日利 `0.002`（0.2%）**复利** | `matures_at = 0`，随时可取 |
| 七日期 | `fixed_7` | 7 天 | `0.04`（4%） | 到期一次性付息 |
| 月满期 | `fixed_30` | 30 天 | `0.15`（15%） | 到期一次性付息 |
| 季定期 | `fixed_90` | 90 天 | `0.40`（40%） | 到期一次性付息 |

```java
private static final Object[][] FIXED_DEPOSIT_PLANS = {
    {7, "七日期", 4},
    {30, "月满期", 15},
    {90, "季定期", 40},
};

/** 活期日利率 0.2%（30 天复利约 6.2%，低于定期，保证定期产品有意义） */
private static final double CURRENT_DAILY_RATE = 0.002;
```

### 存入

校验：`amount < 100` → "灵庄起存 100 下品灵石"；余额不足 → "灵石不足，需要 N，当前仅有 M"；类型非四种之一 → "未知存款类型: X（可选: current/fixed_7/fixed_30/fixed_90）"。

存入用 `removeSpiritStones`（**跨等级扣款**），随后插入 `player_bank` 记录：`deposit_type`、`principal`、`rate`、`deposited_at`、`matures_at`（定期 = 当前时间 + `days × 86400000`，活期 = `0`）。返回存款编号（自增主键）。

### 取出与利息

| 类型 | 利息公式 | 备注 |
| --- | --- | --- |
| 活期 | `principal × (1 + rate)^已存天数 - principal` | `已存天数 = (now - deposited_at) / 86400000`（整数除法，**不足 1 天不计息**） |
| 定期（未到期） | `0` | 文案"（提前取出，无利息）"，**损失全部利息** |
| 定期（已到期） | `principal × rate` | 文案"（已到期，全额利息）" |

取出流程：

```java
DatabaseManager.runTransaction(conn -> {
    // 条件认领：仅当存款仍为 active 时才能取出，防止并发双取（本金+利息重复发放）
    if (!markBankDepositDone(conn, depositId, interest)) {
        throw new SQLException("存款已被取出");
    }
    itemService.addItem(conn, playerId, CurrencyEffect.SPIRIT_STONE_LOW, dep.principal + interest);
    return null;
});
```

`markBankDepositDone` 执行 `UPDATE player_bank SET status = 'withdrawn', interest_earned = ? WHERE id = ? AND status = 'active'`——影响 0 行即抛异常，防止并发双取导致本金+利息重复发放。

::: warning 灵庄取款一律发下品灵石（未走压缩）
`bankWithdraw` 用的是 `itemService.addItem(conn, playerId, SPIRIT_STONE_LOW, principal + interest)`，
**不是** `addSpiritStones`。因此取款得到的是清一色下品灵石，不会按面额压缩；
而存入时扣的却是跨等级汇总后的灵石。这是存/取面额处理的不对称点。

实际影响有限（下品没有持有上限，取出来的下品可以在下次入账时被压缩，
也可以用 `/灵石兑换` 手动换），但"存 1 个极品、取出 10 亿下品"的观感确实不好。
:::

### 账户总览

`/灵庄` 输出随身灵石、存于灵庄本金合计、预估利息合计，以及每笔存款的类型/本金/预估利息/备注。备注文案分三种：活期为 `已存 N 天，日利 0.2%`；定期未到期为 `剩余 N 天到期，利率 X%（到期前取款无利息）`（`N = remainingMs / 86400000 + 1`）；定期已到期为 `已到期！可取款，利率 X%`，并计入 `totalPendingInterest`。

::: warning 字段类型与命名易混淆
`player_bank` 的 `deposited_at` 与 `matures_at` 是 **`BIGINT`**（毫秒时间戳），而 `created_at`/`updated_at` 是标准时间戳；`getBankDeposit` 用 `rs.getLong("deposited_at")` 读取，与写入的 `System.currentTimeMillis()` 一致。
:::

## 竞拍行

`/拍卖`（查看列表）、`/拍卖 出售 <物品名> <数量> <起价> [小时默认24]`、`/拍卖 出价 <编号> <价格>`、`/拍卖 我的`。

### 上架竞拍

`EconomyService.createAuction(playerId, itemKey, quantity, startPrice, hours)`：

| 校验/规则 | 内容 |
| --- | --- |
| 物品存在 | `ItemRegistry.resolve` 非空，否则"物品不存在" |
| 数量与起拍价 | 必须 `> 0`，否则"数量和起拍价必须大于 0" |
| 背包 | 必须持有足够数量，否则"背包中没有足够的【X】" |
| 时长 | `realHours = Math.min(Math.max(hours, 1), 72)`，即 **1~72 小时** |
| 手续费率 | 写入 `fee_rate = 0.07`（**硬编码在 INSERT 中**） |
| 物品 | 上架时立即 `removeItem` 扣除，与插入 `auction_listings` 同事务 |

::: warning `hours` 解析失败会被静默忽略
`AuctionCommand.createAuction` 对第 5 个参数 `try { hours = Integer.parseInt(parts[4]); } catch (NumberFormatException ignored) {}`——解析失败时**沿用默认值 24**，不报错。服务层再夹到 1~72。
:::

### 出价

`placeBid` 全程单事务，顺序：

1. `getAuctionListingForUpdate` 读竞拍（`status = 'active'`；**非 SQLite 时追加 `FOR UPDATE`**），读不到 → "该拍卖不存在或已结束"。
2. 自拍校验 → "不能竞拍自己的物品"。
3. 最低出价：`minBid = currentBid != null ? currentBid + 1 : startPrice`，低于则"出价必须高于当前出价"（**至少加价 1 灵石**）。
4. 余额校验 → "灵石不足，需要 N（当前: M）"。
5. **退还前一位出价人全额**：`addSpiritStones(conn, currentBidderId, currentBid)`。
6. 扣除新出价人灵石：`removeSpiritStones(conn, bidder, amount)`。
7. 写入 `auction_bids` 明细。
8. 条件更新：`UPDATE auction_listings SET current_bid = ?, current_bidder_id = ? WHERE id = ? AND status = 'active'`，影响 0 行 → "拍卖已结束"（此时整个事务回滚，不会出现"钱扣了但没出价成功"）。

### 结算

结算**不是定时任务**，而是在 `getActiveAuctionItems()` 与 `getPlayerAuctionItems()` 被调用时**惰性触发** `settleExpiredAuctions()`：

```java
try (PreparedStatement claimPs = innerConn.prepareStatement(
        "UPDATE auction_listings SET status = 'ended' WHERE id = ? AND status = 'active'")) {
    claimPs.setLong(1, listingId);
    int claimed = claimPs.executeUpdate();
    if (claimed == 0) return null;
}

if (bidderId != null && currentBid > 0) {
    long fee = Math.max(1, (long)(currentBid * feeRate));
    // 卖家收到扣除手续费后的灵石；手续费作为系统税费直接销毁
    itemService.addSpiritStones(innerConn, sellerId, currentBid - fee);
    itemService.addItem(innerConn, bidderId, itemKey, qty);
} else {
    itemService.addItem(innerConn, sellerId, itemKey, qty);
}
```

| 情形 | 结果 |
| --- | --- |
| 有有效出价 | 卖家得 `当前出价 - 手续费`，物品归最高出价人；手续费 `max(1, 出价 × 0.07)` **作为系统税费销毁** |
| 无人出价 | 物品原路退回卖家 |

::: warning 结算依赖查询触发
若长时间没人执行 `/拍卖` 或调用 `economy/auction/items`，到期的竞拍会一直停留在 `active`，卖家既拿不到灵石、买家也拿不到物品。条件 UPDATE 抢占保证并发/重复调用下不会重复结算。
:::

### 输出格式

`/拍卖` 逐条输出 `#ID 物品 x数量 起价:N 当前:出价或"无人出价" 剩余:文案`，末尾附"你的灵石: N"与三条用法提示。`estimateRemaining` 文案规则：`> 0` 小时 → `N小时`；`> 0` 分钟 → `N分钟`；否则 `即将结束`；已过期 → `已结束`；`end_time` 为 `NULL` → `--`。`/拍卖 我的` 查询带 `LIMIT 20`。

## 经济数据面板

`EconomyService.getEconomyStats()`（供 Web 管理台/接口使用）：

| 字段 | 口径 |
| --- | --- |
| `totalStones` | 全服灵石**下品等值**合计：下品 ×1、中品 ×1000、上品 ×1000000、极品 ×1000000000，旧版 `mtxgdn:spirit_stone` 按数量 ×1 |
| `totalGold` | `SELECT SUM(gold) FROM players` |
| `totalPlayers` | `SELECT COUNT(*) FROM players` |
| `last24hTradeVolume` | `SELECT COUNT(*) FROM trade_listings WHERE status = 'sold'` |
| `error` | 查询异常时的错误消息 |

::: danger `last24hTradeVolume` 名不符实
`estimate24hVolume` 的 SQL **没有任何时间条件**，它统计的是**历史累计已成交挂单数**，不是"近 24 小时成交量"。字段名具有误导性，使用时请按实际口径理解。
:::

## 数据表

`player_economy`（`DatabaseSchema.createPlayerEconomyTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `player_id` | `BIGINT PRIMARY KEY` | 玩家 ID |
| `last_sign_in` | `VARCHAR(16)` | 最后签到日期（`yyyy-MM-dd`） |
| `streak` | `INT DEFAULT 0` | 连续签到天数（1~7 循环） |
| `cultivation_boost_count` | `INT DEFAULT 0` | 修炼加速次数计数 |
| `total_stones_spent` | `BIGINT DEFAULT 0` | 累计消耗灵石 |
| `total_stones_earned` | `BIGINT DEFAULT 0` | 累计获得灵石 |

::: tip 后三个字段当前未被 EconomyService 写入
签到路径只读写 `last_sign_in` 与 `streak`；`cultivation_boost_count`、`total_stones_spent`、`total_stones_earned` 是预留字段，`EconomyService` 中没有对应的 UPDATE 语句。
:::

`player_bank`（`DatabaseSchema.createPlayerBankTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 存款编号，`/灵庄 取出` 用它 |
| `player_id` | `BIGINT NOT NULL` | 玩家 ID |
| `deposit_type` | `VARCHAR(16) NOT NULL DEFAULT 'current'` | `current` / `fixed_7` / `fixed_30` / `fixed_90` |
| `principal` | `BIGINT NOT NULL DEFAULT 0` | 本金（下品灵石等值） |
| `interest_earned` | `BIGINT NOT NULL DEFAULT 0` | 取款时写入的实得利息 |
| `rate` | `DOUBLE NOT NULL` | 活期为日利率，定期为到期总利率 |
| `deposited_at` | `BIGINT NOT NULL` | 存入时间（毫秒时间戳） |
| `matures_at` | `BIGINT DEFAULT 0` | 到期时间（毫秒时间戳），活期为 `0` |
| `status` | `VARCHAR(16) NOT NULL DEFAULT 'active'` | `active` / `withdrawn` |
| `created_at` / `updated_at` | 时间戳 | 创建/更新时间 |

`auction_listings`（`DatabaseSchema.createAuctionListingsTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 竞拍编号 |
| `seller_player_id` | `BIGINT NOT NULL` | 卖家 |
| `item_key` | `VARCHAR(128) NOT NULL` | 物品全 key |
| `quantity` | `INT NOT NULL` | 件数 |
| `start_price` | `BIGINT NOT NULL` | 起拍价（下品灵石） |
| `current_bid` | `BIGINT DEFAULT NULL` | 当前最高出价，`NULL` 表示无人出价 |
| `current_bidder_id` | `BIGINT DEFAULT NULL` | 当前最高出价人 |
| `fee_rate` | `DOUBLE DEFAULT 0.07` | 手续费率（`createAuction` 显式写 `0.07`） |
| `status` | `VARCHAR(16) DEFAULT 'active'` | `active` / `ended` |
| `end_time` | `TIMESTAMP NOT NULL` | 截止时间 |
| `created_at` / `updated_at` | 时间戳 | 创建/更新时间 |

`auction_bids`（`DatabaseSchema.createAuctionBidsTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `listing_id` | `BIGINT NOT NULL` | 所属竞拍 |
| `bidder_player_id` | `BIGINT NOT NULL` | 出价人 |
| `amount` | `BIGINT NOT NULL` | 出价金额 |
| `created_at` | 时间戳 | 出价时间 |

`auction_bids` 每笔出价插一行，从不更新或删除；被超越的出价在 `auction_listings.current_bid` 上被覆盖，但明细表保留了完整加价历史。当前没有针对该表的清理任务（与 `trade_price_history` 不同）。
