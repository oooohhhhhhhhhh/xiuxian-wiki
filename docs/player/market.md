# 坊市（玩家交易）

坊市是玩家之间用**灵石**买卖物品的挂单市场。它由 `TradeService`（`src/main/java/com/mtxgdn/game/service/TradeService.java`）实现，QQ 指令位于 `src/main/java/com/mtxgdn/onebot/command/market/`。

与[竞拍行](/player/economy#竞拍行)的区别：坊市是**一口价挂单**（谁先买谁得），竞拍行是**竞价**（到点结算给出价最高者）。

## 指令总览

所有坊市指令的权限节点都是 `game.player.info`，模块名为 `trade`。

| 指令 | 别名 | 参数 | 说明 | 源码 |
| --- | --- | --- | --- | --- |
| `/坊市` | `market` | 无 | 查看全部在售挂单（最多显示 15 条） | `MarketCommand.java` |
| `/上架` | `list` | `<物品key> <数量> <灵石价格>` | 把背包装物品挂入坊市 | `ListItemCommand.java` |
| `/我的挂单` | `mylistings` | 无 | 查看自己的在售挂单与剩余时间 | `MyListingsCommand.java` |
| `/购买` | `buy` | `<挂单ID>` | 买下一张挂单 | `BuyItemCommand.java` |
| `/撤单` | `cancellisting` | `<挂单ID>` | 撤回自己的挂单，物品退回背包 | `CancelListingCommand.java` |
| `/行情` | `price` | `<物品名或ID> [天数]` | 查看近期成交均价/最低/最高 | `MarketPriceCommand.java` |

::: warning 指令名以源码注册为准
源码注册的是 **`/撤单`**（不是"取消上架"）与 **`/我的挂单`**（不是"我的上架"）。`TradeService` 与 `DatabaseSchema` 的注释里出现过"我的上架"字样，那只是文档注释，**指令注册名是 `/我的挂单`**。
:::

### HTTP 接口

`MarketPriceCommand` 额外注册了一条 REST 路由：

| 方法 | 路径 | 权限 | 参数 |
| --- | --- | --- | --- |
| GET | `market/price` | `game.market.view` | `itemKey`（或 `item`）、`days` |

返回 JSON 字段：`code`（200 成功 / 400 参数或物品不存在 / 500 服务器错误）、`success`，以及 `getPriceHistory` 的全部字段（见下文"行情统计口径"）。`itemKey` 为空时返回 `code=400`、`message="请提供 itemKey 查询参数"`。

## 上架流程

`/上架 <物品key> <数量> <灵石价格>`，例如 `/上架 回血丹 5 100`。

服务端校验（`TradeService.listItem`）：

| 校验项 | 规则 | 失败提示 |
| --- | --- | --- |
| 数量下限 | `quantity > 0` | 数量必须大于 0 |
| 数量上限 | `quantity <= 999,999` | 数量不能超过 999,999 |
| 价格下限 | `priceSpiritStones > 0` | 价格必须大于 0 |
| 价格上限 | `priceSpiritStones <= 999,999,999` | 价格不能超过 999,999,999 灵石 |
| 物品存在 | `ItemRegistry.resolve(itemKey)` 非空 | 物品不存在，请使用 /物品列表 查看可用物品 |
| 背包数量 | 事务内 `SELECT quantity ... FOR UPDATE`（MySQL） | 背包中没有足够的【X】，当前: N，需要: M |

指令层的解析细节（`ListItemCommand`）：

- 参数按 `\s+` 切成最多 3 段，**物品名可以带空格**（例如 `/上架 千年人参种子 2 300`）。
- 数量用 `Integer.parseInt` 解析，失败提示"数量必须是整数"。
- 价格用 `Long.parseLong` 解析，失败提示"价格必须是整数（单位：灵石）"。这里刻意用 `long` 而不是 `int`：若用 `int`，超出 999,999,999 的输入会先被解析器拒绝，玩家看到的是误导性的"必须是整数"，而不是服务端的超限提示。
- 物品 key 支持短 key，`ItemRegistry.resolve` 会自动补 `mtxgdn:` 前缀；落库时统一写 `item.getFullKey()`。

上架在**一个事务**内完成：先锁行检查背包数量 → `removeItem` 扣除物品 → 插入 `trade_listings`（含 `fee` 与 `expires_at`）。物品是**立即从背包扣除**的，挂单期间不在背包里。

## 挂单时限与到期自动下架

| 配置项 | 默认值 | 含义 |
| --- | --- | --- |
| `market.listing_duration_hours` | `72` | 挂单有效时长（小时），到期自动下架并把物品退回卖家 |

配置读取处对下限做了保护：`Math.max(1, AppConfig.getInt("market.listing_duration_hours", 72))`，即**至少 1 小时**。`TradeService.getListingDurationHours()` 对外暴露该值。

到期时间在上架时一次性算好写入 `expires_at`：

```java
ps.setTimestamp(6, new java.sql.Timestamp(
        System.currentTimeMillis() + LISTING_DURATION_HOURS * 3600_000L));
```

### 到期回收任务

`TradeService` 的静态初始化块注册了一个**守护线程**单线程调度器（线程名 `trade-market-sweeper`）：

| 任务 | 首次延迟 | 周期 | 动作 |
| --- | --- | --- | --- |
| 到期挂单回收 | 20 秒 | 60 秒 | `sweepExpiredListings()` |
| 价格历史清理 | 5 分钟 | `market.price_history_cleanup_interval_hours`（默认 6）小时 | `cleanupPriceHistory()` |

设计要点：

- 首次延迟 20 秒是为了等数据库初始化完成；清理任务首次延迟 5 分钟以避开启动高峰。
- 两个任务**共用同一个单线程调度器**：都是低频 DB 操作，串行执行反而避免互相争抢连接。
- 调度体整体 `try/catch(Throwable)`，**一次失败不会终止后续所有 tick**。
- 线程 `setDaemon(true)`，不阻止 JVM 退出；`TradeService.shutdown()` 可显式停止（服务端关闭/测试清理时调用）。

### 回收的并发安全：先抢占，再退回

回收不是"读到就退"，而是**条件 UPDATE 抢占成功的一方负责退物**：

```java
Boolean claimed = DatabaseManager.runTransaction(conn -> {
    // 先抢占：只有把 active 改成 expired 成功的一方负责退回物品。
    // 否则会与买家并发购买竞争，导致物品被退回两次（复制物品）。
    try (PreparedStatement claim = conn.prepareStatement(
            "UPDATE trade_listings SET status = 'expired' WHERE id = ? AND status = 'active'")) {
        claim.setLong(1, listingId);
        if (claim.executeUpdate() == 0) return Boolean.FALSE;
    }
    itemService.addItem(conn, sellerId, itemKey, qty);
    return Boolean.TRUE;
});
```

`executeUpdate() == 0` 意味着该挂单已被买家买走（`sold`）或被卖家撤回（`sold`），此时**直接跳过退物**，从而避免同一份物品被退回两次。

### 僵尸挂单的双重防护

只靠 60 秒一次的定时任务不够——任务间隔内到期的挂单仍可能被购买，出现"买家买到已到期挂单、卖家物品却已被回收退回"的复制漏洞。因此**所有读写路径都额外过滤到期时间**：

| 场景 | SQL 条件 |
| --- | --- |
| 购买/撤回时读挂单 | `status = 'active' AND (expires_at IS NULL OR expires_at > ?)` |
| `/坊市` 在售列表 | `status = 'active' AND (expires_at IS NULL OR expires_at > ?)` |
| `/我的挂单` | 同上，另加 `seller_player_id = ?` |
| 回收任务扫描 | `status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?` |
| 在售最低价统计 | `status = 'active' AND quantity > 0 AND (expires_at IS NULL OR expires_at > ?)` |

### 老库回填

历史挂单的 `expires_at` 为 `NULL`（表示永不过期）。`backfillLegacyExpiry()` 按 `created_at + 配置时长` 回填，让时限对老数据同样生效：

- 用 Java 计算时间戳而非 SQL 日期函数，避免 SQLite/MySQL 方言差异。
- `created_at` 缺失时以**当前时间**为基准，避免这些挂单永远不过期。
- 回填条件带 `AND expires_at IS NULL`，可重复执行而不会覆盖已有值。
- 只做一次，由 `AtomicBoolean BACKFILL_DONE` 控制；**只有回填成功才置位**——若失败也置位，历史挂单将永远拿不到到期时间。

## 手续费

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `TRADE_FEE_RATE` | `0.05`（5%） | `TradeService` |
| 最低兜底 | `1` 灵石 | `calculateFee` |
| `TRADE_FEE_HALF` 减半 | 再除以 2，仍受最低 1 灵石兜底 | `calculateFee` |

```java
private long calculateFee(long playerId, long priceSpiritStones) {
    long baseRate = (long)(priceSpiritStones * TRADE_FEE_RATE);
    Player seller = playerService.getPlayerById(playerId);
    boolean halfFee = seller != null && seller.getSpiritualRoot() != null
            && seller.getSpiritualRoot().hasEffect(SpiritualRoot.SpecialEffect.TRADE_FEE_HALF);
    return halfFee ? Math.max(1, baseRate / 2) : Math.max(1, baseRate);
}
```

- 计算方式是**向下取整**（`(long)` 强转），再取 `max(1, ...)`。
- 减免来自灵根特效 `TRADE_FEE_HALF`（数值 `0.50`，展示名"交易手续费减半"），持有者为**土金灵根**（`EARTHEN_GOLD`，双灵根，描述"土金双灵根，金石为开，商道亨通"）。
- 手续费在**上架时计算并写入挂单的 `fee` 字段**，但**不在上架时从卖家扣灵石**。结算时才从货款里扣：

```java
long sellerReceive = listing.priceSpiritStones - listing.fee;
if (!itemService.addSpiritStones(conn, listing.sellerPlayerId, sellerReceive)) {
    throw new SQLException("发放灵石失败");
}
```

| 场景 | 卖家实收 | 说明 |
| --- | --- | --- |
| 成功卖出 | `售价 - fee` | 买家付**全额售价**，抽成从卖家货款中扣除 |
| 到期自动下架 | 物品退回，**无灵石进出** | 手续费未预扣，因此实际没有可退的钱 |
| 主动撤单 | 物品退回，**无灵石进出** | 同上 |

::: tip 关于"手续费不退还"的提示文案
`/撤单` 与 `/我的挂单` 的返回文案写着"坊市抽成不退还"/"手续费不退还"，但代码路径中手续费**只在成交时从货款里扣**，上架环节没有扣过灵石。因此对卖家而言，撤单/到期在灵石上没有任何损失，损失的只是"没卖出去"。
:::

## 购买流程

`/购买 <挂单ID>`，挂单 ID 来自 `/坊市` 输出里的 `[ID]`。

`TradeService.buyItem` 全程在一个事务内，顺序如下：

1. `getListingForUpdate` 读挂单，条件为 `id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`；读不到 → "该挂单不存在或已被购买"。
2. 自购校验：`listing.sellerPlayerId == buyerPlayerId` → "不能购买自己的物品"。
3. 余额校验：`itemService.getSpiritStoneCount(conn, buyerPlayerId)` 与售价比较，不足 → "灵石不足，需要 N 灵石，当前仅有 M 灵石"。
4. **抢占**：`markListingAsSold` 执行 `UPDATE trade_listings SET status = 'sold' WHERE id = ? AND status = 'active'`；影响行数为 0 → "挂单已失效"。
5. `executePurchase`：
   - `removeSpiritStones(conn, buyer, price)` —— 跨等级扣除灵石，自动找零；
   - `addItem(conn, buyer, itemKey, quantity)` —— 物品入买家背包；
   - `addSpiritStones(conn, seller, price - fee)` —— 卖家到账；
   - `recordPriceHistory(...)` —— 写成交历史。

::: tip 灵石按"下品等值"结算
`getSpiritStoneCount` / `removeSpiritStones` 都是**跨等级折算**的：等级汇率 `EXCHANGE_RATES = {1, 1000, 1000000, 1000000000}`。扣除时从下品往上逐级消耗，若某一级面额大于剩余需求，就多扣一块并按汇率用**下品灵石找零**。所以买家不需要手上恰好是下品灵石。
:::

## 撤回挂单

`/撤单 <挂单ID>`（`TradeService.cancelListing`）。撤回与购买走**同一条并发安全路径**——挂单必须在事务内读取：

```java
DatabaseManager.runTransaction(conn -> {
    TradeListing listing = getListingForUpdate(conn, listingId);
    if (listing == null) throw new SQLException("该挂单不存在或已被购买");
    if (listing.sellerPlayerId != playerId) throw new SQLException("这不是你的挂单");
    int removed = markListingAsSold(conn, listingId);
    if (removed == 0) throw new SQLException("挂单已失效");
    itemService.addItem(conn, playerId, listing.itemKey, listing.quantity);
    ...
});
```

源码注释里的反例说明了为什么不能"事务外读快照"：

> 撤回读到 active 快照 → 回收任务抢先置 expired 并退物 → 撤回再把 active 改成 sold 又退一次 → 玩家凭空多出一份物品。

## 行情统计口径

`/行情 <物品名或ID> [天数]`。天数解析规则（`MarketPriceCommand`）：

- 取参数**最后一段空格之后**的内容尝试 `Integer.parseInt`；成功则把前面部分当作物品名（因此**物品名可以含空格**），失败则整串都是物品名。
- 天数为 `0`（未指定）时用默认窗口。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `DEFAULT_QUOTE_DAYS` | `7` | 未指定天数时的默认统计窗口 |
| `MAX_QUOTE_DAYS` | `90` | 窗口上限，`Math.min(days, 90)`，防止一次拉全表 |

统计 SQL 针对 `trade_price_history` 按 `item_key` + `sold_at >= since` 聚合：

```sql
SELECT COUNT(*) AS cnt, MIN(unit_price) AS minp, MAX(unit_price) AS maxp,
       AVG(unit_price) AS avgp, SUM(quantity) AS qty
FROM trade_price_history WHERE item_key = ? AND sold_at >= ?
```

| 输出字段 | 口径 |
| --- | --- |
| `tradeCount` | 成交**笔数**（`COUNT(*)`），不是件数 |
| `totalQuantity` | 成交**件数合计**（`SUM(quantity)`） |
| `minUnitPrice` / `maxUnitPrice` | 成交**单价**的最小值/最大值 |
| `avgUnitPrice` | 成交单价的算术平均，`Math.round(AVG(...))` 取整 |
| `lowestActiveUnitPrice` | **当前在售**挂单的最低单价，仅在存在时输出 |

**单价 = 总价 ÷ 数量**。写入时 `unitPrice = Math.max(1, totalPrice / quantity)`（向下取整、最低 1），理由是同一物品的挂单数量不同，只有单价之间才可比。当前在售最低价同样按单价算：

```sql
SELECT MIN(CAST(price_spirit_stones AS DOUBLE) / quantity) AS lowest
FROM trade_listings WHERE item_key = ? AND status = 'active' AND quantity > 0
  AND (expires_at IS NULL OR expires_at > ?)
```

无成交记录时的文案会提示"可参考当前在售最低价定价"；两者都没有时提示"坊市当前没有该物品在售，你可以自由定价"。

### 价格历史保留与清理

| 配置项 | 默认值 | 含义 |
| --- | --- | --- |
| `market.price_history_keep_days` | `30` | 成交历史保留天数，下限保护 `Math.max(1, ...)` |
| `market.price_history_cleanup_interval_hours` | `6` | 清理任务执行间隔（小时），下限保护 `Math.max(1, ...)` |

```sql
DELETE FROM trade_price_history WHERE sold_at < ?
```

清理间隔取小时级、保留粒度是天级的：历史表只增不减会无限膨胀，必须定期删除。删除条数 > 0 时会打一条 INFO 日志（`坊市已清理过期价格历史 N 条（保留 30 天）`）。

::: warning 写入历史失败不影响成交
`recordPriceHistory` 自带 try/catch，失败只记 WARN 日志（`写入坊市价格历史失败（不影响成交）`）。历史是辅助信息，成交本身已经完成，不应因历史写失败而回滚。同理，若某段时间历史写入一直失败，行情会出现统计缺口。
:::

## 数据表

`trade_listings`（`DatabaseSchema.createTradeListingsTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 挂单 ID，`/购买`、`/撤单` 用它 |
| `seller_player_id` | `BIGINT NOT NULL` | 卖家玩家 ID |
| `item_key` | `VARCHAR(128) NOT NULL` | 物品全 key（`mtxgdn:` 前缀） |
| `quantity` | `INT NOT NULL` | 挂单件数 |
| `price_spirit_stones` | `BIGINT NOT NULL` | 总价（下品灵石等值） |
| `fee` | `BIGINT NOT NULL DEFAULT 0` | 上架时算出的手续费 |
| `status` | `VARCHAR(16) DEFAULT 'active'` | `active` / `sold` / `expired` |
| `expires_at` | `TIMESTAMP DEFAULT NULL` | 到期时间；`NULL` 表示历史遗留挂单（永不过期） |
| `created_at` / `updated_at` | 时间戳 | 创建/更新时间 |

`status` 的三个取值对应的写入点：

| 取值 | 写入者 | 含义 |
| --- | --- | --- |
| `active` | `createListing`（默认值） | 在售 |
| `sold` | `markListingAsSold`（购买成功、主动撤单） | 已成交/已撤回，物品已交付或已退回 |
| `expired` | 回收任务的条件 UPDATE | 到期下架，物品已退回 |

`trade_price_history`（`DatabaseSchema.createTradePriceHistoryTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `item_key` | `VARCHAR(128) NOT NULL` | 物品全 key |
| `unit_price` | `BIGINT NOT NULL` | 单价 = 总价 ÷ 数量（最低 1） |
| `quantity` | `INT NOT NULL` | 本笔成交件数 |
| `total_price` | `BIGINT NOT NULL` | 本笔成交总价 |
| `sold_at` | 时间戳（默认当前时间） | 成交时间，行情窗口与清理都基于它 |

索引：

| 索引 | 表与列 | 服务场景 |
| --- | --- | --- |
| `idx_trade_listings_status_expires` | `trade_listings (status, expires_at)` | 回收任务每 60 秒扫描、在售筛选 |
| `idx_trade_listings_seller_status` | `trade_listings (seller_player_id, status)` | `/我的挂单` 按卖家查 |
| `idx_trade_price_item_time` | `trade_price_history (item_key, sold_at)` | 行情查询，避免全表扫描 |

::: details 为什么专门为这两张表补索引
`DatabaseSchema` 的注释指出：`trade_listings` 此前**一个索引都没有**，而它有两处高频访问——回收任务每 60 秒执行一次 `WHERE status='active' AND expires_at <= ?`，`/坊市` 每次都要 `WHERE status='active' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`。没有索引时两者都是全表扫描，挂单量增长后每 60 秒一次的扫描会持续占用数据库。
:::

## 输出格式参考

`/坊市` 单条挂单的渲染格式（`MarketCommand`）：

```text
===== 坊市 =====
[12] 回血丹 (mtxgdn:healing_pill) x5  售价:100灵石(单价 20)  剩2天3时
[13] 灵草 (mtxgdn:spirit_grass) x10  售价:200灵石(单价 20)  剩5时12分

使用 /行情 <物品名> 查看近期成交均价，辅助定价
```

- 最多显示 15 条，超出后追加 `...(仅显示前15条)`。
- `数量 > 1` 时补 `(单价 N)`，便于横向比较不同挂单。
- 剩余时间格式（`formatRemaining`）：`> 0` 天 → `N天N时`；`> 0` 小时 → `N时N分`；否则 `max(1, 分钟)分`；`<= 0` → `已到期`。
- 列表按 `created_at DESC` 排序（最新挂单在前）。
- 空列表时提示"坊市上空空荡荡，还没有人挂单"。
- `/坊市` 之后还会调用 `GuideService.checkDiscovery(..., "market")`，首次使用可能追加一条新手引导发现提示。

`/我的挂单` 会额外显示手续费与"永不过期"标记：

```text
===== 我的挂单 =====
[12] 回血丹 x5  售价:100灵石  手续费:5灵石  剩2天3时
使用 /撤单 <ID> 撤单
挂单到期后将自动下架，物品退回背包（手续费不退还）
```

`/行情 灵草 30` 的输出：

```text
===== 【灵草】行情 =====
统计窗口: 近 30 天
成交笔数: 18
成交总量: 240
均价: 21 灵石/个
最低: 15 灵石/个
最高: 33 灵石/个
当前在售最低: 20 灵石/个

💡 定价建议: 略低于 20 灵石/个更容易卖出
```

## 相关配置

```yaml
# ┌──────────────────────────────────────────────────────────────┐
# │ 15b. 坊市（挂单时限 + 成交价格历史）                         │
# └──────────────────────────────────────────────────────────────┘
market:
  listing_duration_hours: 72   # 挂单有效时长（小时），到期自动下架并把物品退回卖家
  price_history_keep_days: 30  # 成交价格历史保留天数（超期由清理任务删除）
  price_history_cleanup_interval_hours: 6  # 价格历史清理任务执行间隔（小时）
```

::: warning 常量是静态 final，改配置需重启
`LISTING_DURATION_HOURS`、`PRICE_HISTORY_KEEP_DAYS`、`PRICE_HISTORY_CLEANUP_INTERVAL_HOURS` 都是 `static final`，在类初始化时读取一次配置并启动调度器。修改 `application.yml` 后需要**重启服务端**才生效，运行期热改不会影响已加载的值。
:::

## 常见问题

| 现象 | 原因 |
| --- | --- |
| `/购买` 报"该挂单不存在或已被购买" | 挂单已被买走、已到期，或 ID 不存在 |
| `/购买` 报"挂单已失效" | 抢占条件 UPDATE 影响 0 行：并发下被别人抢先买走 |
| `/撤单` 报"这不是你的挂单" | 挂单 ID 属于其他玩家 |
| 物品挂了但背包里没了 | 上架时物品即从背包扣除，撤回或到期才退回 |
| `/行情` 显示"近期无成交记录" | 窗口内没有成交，或历史已被清理任务删除（保留 30 天） |
| 挂单长期占位不下架 | `expires_at` 为 `NULL` 的历史遗留挂单，等 `backfillLegacyExpiry()` 首次成功回填后即按时限回收 |
