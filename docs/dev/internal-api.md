# 内部服务 API

服务端把玩法逻辑集中在 `com.mtxgdn.game.service` 包下的服务类里。
所有入口（QQ 指令、REST、WebSocket、Minecraft 通道、插件）都通过这些服务类操作游戏数据，
**不要绕开它们直接写 SQL**（并发约定、缓存、副作用都会漏掉）。

## 获取服务实例

统一走 `ServiceRegistry`，不要自己 `new`：

```java
import com.mtxgdn.common.service.ServiceRegistry;

PlayerService playerService = ServiceRegistry.getPlayerService();
TradeService  tradeService  = ServiceRegistry.getTradeService();
```

::: tip 为什么必须用 ServiceRegistry
1. **单例语义** —— 例如 `TradeService` 的静态块会启动定时调度器，
   自己 `new` 会多起一个调度器，导致到期回收被执行多次。
2. **可替换** —— 测试里可以替换成临时实现。
3. **依赖注入** —— 服务之间的依赖（如 `RealmService` 需要 `PlayerService`）
   由注册表统一装配，避免循环 `new`。
:::

实现上是双重检查锁的懒加载：

```java
public static PlayerService getPlayerService() {
    if (playerService == null) {
        synchronized (ServiceRegistry.class) {
            if (playerService == null) {
                playerService = new PlayerService();
            }
        }
    }
    return playerService;
}
```

## 服务清单

共 **26 个**服务。括号内是构造依赖。

### 角色与成长

| 服务 | 职责 |
| --- | --- |
| `PlayerService` | 角色增删改查、属性、修炼（打坐/停止）、灵根、经验与升级 |
| `RealmService`（`PlayerService`） | 境界突破、天劫、转世 |
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

### 社交与系统

| 服务 | 职责 |
| --- | --- |
| `SectService` | 宗门创建、成员、仓库 |
| `ChatService` | 世界频道与私聊 |
| `FriendService` | 好友关系 |
| `DailyService` | 每日计数与重置 |
| `MinecraftPlayerBindingService` | Minecraft 账号绑定 |

::: warning 有些领域没有注册进 ServiceRegistry
`ServiceRegistry` 只登记**核心玩法服务**（上面 26 个）。以下能力虽有自己的类，却**不注册**在 `ServiceRegistry`：

- `SeasonService`（季节）、`OfflineRewardService`（离线收益）、`RedeemCodeService`（兑换码）、
  `TeamService`（组队）、`EquipmentFixService`（装备修复）多以静态方法或按需 `new` 调用；
- 排行榜、玩家搜索等逻辑仍直接写在指令类里（`onebot/command/rank`、`search`）。

需要这些能力时按各自约定调用，不要假设它们走 `ServiceRegistry.getXxx()`。
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
    public String execute(CommandContext ctx, String[] args) {
        Player player = ServiceRegistry.getPlayerService().getPlayerById(ctx.getPlayerId());
        if (player == null) {
            return "请先创建角色。";
        }

        Map<String, Object> result = ServiceRegistry.getItemService()
                .addItem(player.getId(), "mtxgdn:spirit_grass", 1);

        if (!Boolean.TRUE.equals(result.get("success"))) {
            return "操作失败：" + result.get("message");
        }
        return "你获得了 1 株灵草。";
    }
}
```

指令类的写法详见[指令框架](/dev/commands)。
