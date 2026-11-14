# 内部服务 API

服务端把玩法逻辑集中在 `com.mtxgdn.game.service` 包下的服务类里。
所有入口（QQ 指令、REST、WebSocket、Minecraft 通道、插件）都通过这些服务类操作游戏数据，
**不要绕开它们直接写 SQL**（并发约定、缓存、副作用都会漏掉）。

## 获取服务实例

服务由 `ServiceContainer` 统一构造，业务类通过 **构造参数** 拿到只读查询面
`ServiceLookup`（容器实现它），**不要自己 `new` 服务**：

```java
public class PlayerService implements PlayerApi, BackgroundTaskOwner {
    private final ServiceLookup services;

    public PlayerService(ServiceLookup services) {
        this.services = services;
    }
}
```

拿查询面之后按需取服务：

```java
PlayerService playerService = services.getPlayerService();
TradeService  tradeService  = services.getTradeService();
```

::: tip 为什么这样设计
1. **同一套实例** —— 服务之间互相引用成环（`cave` ↔ `formation`、`player` 是几乎所有服务的上游），
   所以注入的是"查询面"而不是逐个服务实例；用时再取，环自然消失。
2. **可替换、可重置** —— `ServiceRegistry.install(...)` 换容器 = 换一整套服务实例，
   测试里每个测试类都能拿到干净实例；旧容器 `close()` 会停掉它启动的后台任务。
3. **静态门面只剩三个方法** —— `ServiceRegistry.container()/install()/reset()`。
   `ServiceInjectionMigrationTest` 锁死：业务类不得直接取容器，服务不得回落到静态容器。
:::

框架自己在"没有构造参数可用"的边界上取一次容器（指令由反射创建、REST 资源由 Jersey 创建、
WebSocket 静态持有者、启动流程），其余代码一律构造注入。实现是容器里的双重检查锁懒加载：

```java
public PlayerService getPlayerService() {
    if (playerService == null) {
        synchronized (this) {
            if (playerService == null) {
                playerService = new PlayerService(this);
            }
        }
    }
    return playerService;
}
```

## 服务清单

共 **30 个**服务（`ServiceContainer` 的 30 个字段）。括号内是构造依赖。

### 角色与成长

| 服务 | 职责 |
| --- | --- |
| `PlayerService` | 角色增删改查、属性、修炼（打坐/停止）、灵根、经验与升级 |
| `RealmService`（`PlayerService`） | 境界突破、天劫、**连败增益（pity）与凝实**、突破预览、转世 |
| `SkillService` | 技能定义与已学技能、默认技能写入 |
| `TechniqueService` | 功法定义、学习/装备/升级、默认功法写入 |
| `TitleService` | 称号获取与装备 |
| `BuffService` | Buff 的施加、查询与过期 |
| `EnhanceService` | 装备强化 |
| `HeartDemonService` | 心魔判定与结算 |
| `NewbieGuideService` | 新手引导进度 |

### 物品与经济

| 服务 | 职责 |
| --- | --- |
| `ItemService` | 背包读写、物品增删、灵石增减 |
| `CraftingService` | 配方与炼制、默认配方写入 |
| `EnergyService` | 能量与物品转化 |
| `EconomyService` | 拍卖行、灵庄、商店、签到、灵石流转 |
| `TradeService` | 坊市挂单、购买、取消、到期回收、价格历史 |

### 探索与战斗

| 服务 | 职责 |
| --- | --- |
| `ExplorationService`（`PlayerService`） | 游历与随机事件 |
| `SecretRealmService`（`PlayerService`） | 秘境进入与探索 |
| `CombatService` | PVE 战斗与伤害计算 |
| `MapService` | 地图地点、移动与灵气加成；**野外无限分片世界**（`resolveWilderness`、`teleportByUnlock`、`getChunkOf`、`isChunkPinned`、`recordFirstVisit`、`maintainWildernessIfNeeded`、`restockWilderness`、`getWildernessStats`） |
| `CaveService` | 洞府与灵力收集 |
| `FormationService` | 阵法布置与加成 |
| `FarmService` | 灵田种植与收获 |
| `WorldBossService` | 世界 Boss：全服共享血量、池子惰性重建、按伤害分红、超发熔断、挑战冷却 |
| `DurabilityService` | 装备耐久台账与修理 |

### 社交与系统

| 服务 | 职责 |
| --- | --- |
| `SectService` | 宗门创建、成员、仓库 |
| `ChatService` | 世界频道与私聊 |
| `FriendService` | 好友关系 |
| `DailyService` | 每日计数与重置 |
| `MinecraftPlayerBindingService` | Minecraft 账号绑定 |
| `OfflineRewardService` | 离线收益结算 |
| `RedeemCodeService` | 兑换码 |

::: warning 有些能力不在容器里
`ServiceContainer` 只登记**核心玩法服务**（上面 30 个）。以下能力虽有自己的类，但不在容器里：

- `SeasonService`（季节）：状态与方法全是 `static` 的"全局时钟"，调度器由容器统一启停
  （`startScheduler()` / `stopScheduler()`），但实例本身还没收编；
- `TeamService`（组队）：纯内存单例，按需取同一实例；
- `EquipmentFixService`（装备修复）：启动期一次性修复。

需要这些能力时按各自约定调用，不要假设能通过 `services.getXxxService()` 拿到。
:::

## 数据库访问

### 直接取连接

```java
try (Connection conn = DatabaseManager.getConnection();
     PreparedStatement ps = conn.prepareStatement("SELECT * FROM players WHERE id = ?")) {
    ps.setLong(1, playerId);
    try (ResultSet rs = ps.executeQuery()) {
        ...
    }
}
```

::: danger 必须用 try-with-resources
连接来自连接池（`database.pool_max` 默认 4，SQLite 建议 2~8）。
泄漏连接会迅速耗尽池，表现为请求全部卡死。
:::

### 事务

`DatabaseManager` 提供两个事务包装器：

```java
// 有返回值
Long listingId = DatabaseManager.runTransaction(conn -> {
    // 同一个 conn 上做多步操作
    ...
    return id;
});

// 无返回值
DatabaseManager.runTransaction(conn -> {
    ...
});
```

实现是标准的「关自动提交 → 执行 → 提交 / 异常回滚」：

```java
public static <T> T runTransaction(SQLFunction<T> function) {
    try (Connection conn = getConnection()) {
        conn.setAutoCommit(false);
        try {
            T result = function.run(conn);
            conn.commit();
            return result;
        } catch (Exception e) {
            try { conn.rollback(); } catch (SQLException ignored) {}
            throw new RuntimeException("事务执行失败", e);
        } finally {
            conn.setAutoCommit(true);
        }
    } catch (SQLException e) {
        throw new RuntimeException("事务执行失败", e);
    }
}
```

### 为什么有些方法接受 `Connection` 参数

需要「抢占 + 发放」原子完成时，service 会把 `Connection` 作为参数传进来，
让调用方控制事务边界。典型写法：

```java
DatabaseManager.runTransaction(conn -> {
    // 1. 条件更新抢占（只有抢到的一方能继续）
    int claimed = tradeService.claimListing(conn, listingId, "cancelled");
    if (claimed == 0) {
        return null;   // 没抢到，事务里什么都不做
    }
    // 2. 发放物品（同一事务，失败一起回滚）
    itemService.addItem(conn, sellerId, itemKey, quantity);
    return null;
});
```

::: danger 不要跨事务做"先读后写"
`SELECT` 出来的状态在 `UPDATE` 时可能已经变了。
判断"能不能操作"必须由带条件的 `UPDATE` 的**影响行数**决定，
不能靠前面 `SELECT` 的结果。详见[数据库设计](/dev/database)。
:::

## 调用约定

::: tip 一、返回结果用 Map 或实体，不要直接回文案
服务方法返回结构化的结果（如 `Map<String, Object>` 带 `success`、`message`、数值字段），
由各入口自己渲染成 QQ 消息 / JSON / WS 帧。

这样同一个服务能被 QQ 指令和 REST 同时复用，文案也容易改。
:::

::: warning 二、失败要返回 `success=false` 而不是抛异常
抛异常会被上层映射成 500 或"服务器错误"，
而业务失败（余额不足、境界不够）应该给出可读的失败原因。
:::

::: danger 三、服务里不要读 HTTP 上下文
服务类不应依赖 Jersey 的 `Request`/`Response` 或 QQ 消息对象，
否则 REST 和 QQ 两个入口就没法共用。
:::

## 一个完整的调用例子

```java
public class MyCommand extends Command {
    public MyCommand() {
        super(new String[]{"示例", "example"}, "示例指令", "用法: /示例", "my.module", "game.example");
    }

    @Override
    public void execute(CommandContext ctx) {
        PlayerInfo p = requirePlayerInfo(ctx);
        if (p == null) return;

        boolean added = services().getItemService()
                .addItem(p.getId(), "mtxgdn:spirit_grass", 1);

        ctx.reply(added ? "你获得了 1 株灵草。" : "操作失败：背包已满或物品不存在。");
    }
}
```

指令类的写法详见[指令框架](/dev/commands)。
