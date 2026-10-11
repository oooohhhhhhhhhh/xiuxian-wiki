# 能量系统

能量是一个**独立于金币与灵石的数值货币**，存在 `player_energy` 表里（`BIGINT`，代码中无上限）。它本身不能直接用于战斗或修炼，唯一用途是**在「等价交换」中兑换物品**；而能量的唯一常规来源是**把物品转化为能量**。

能量系统拆成两层：

| 层 | 名称 | 配置键 | 默认 | 内容 |
| --- | --- | --- | --- | --- |
| 稳定模块 | 能量系统 | `plugins.energy` | `true` | `EnergyService`、`player_energy` 表、能量读写 |
| 实验性插件 | 能量转化 / 等价交换 | `plugins.experimental_energy_exchange` | `true` | `/转化` 指令与 `energy/*` REST 接口 |

关键源码：

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/game/service/EnergyService.java` | 能量读写、物品能量值解析、转化损耗 |
| `src/main/java/com/mtxgdn/onebot/command/economy/ExchangeCommand.java` | `/转化` 与 4 个 REST 路由 |
| `src/main/java/com/mtxgdn/onebot/command/admin/EnergyAdminCommand.java` | `/能量管理` 与 4 个管理 REST 路由 |
| `src/main/java/com/mtxgdn/plugin/experimental/EnergyExchangePlugin.java` | 实验性插件定义 |
| `src/main/java/com/mtxgdn/db/DatabaseSchema.java` | `createPlayerEnergyTable` |

## 数据表

```java
public static String createPlayerEnergyTable(String pk, DatabaseDialect dialect) {
    return "CREATE TABLE IF NOT EXISTS player_energy (" +
            "player_id BIGINT PRIMARY KEY, " +
            "energy BIGINT DEFAULT 0" +
            (dialect.supportsForeignKeysInCreateTable()
                    ? ", FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE"
                    : "") +
            ")";
}
```

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `player_id` | `BIGINT PRIMARY KEY` | 玩家 ID，与 `players.id` 一对一 |
| `energy` | `BIGINT DEFAULT 0` | 能量值，**没有上限、没有下限约束** |

`EnergyService` 的公开方法：

| 方法 | 行为 |
| --- | --- |
| `getEnergy(playerId)` | 查不到行时返回 `0` |
| `setEnergy(playerId, energy)` | 覆盖写（SQLite `ON CONFLICT(player_id) DO UPDATE`；MySQL `ON DUPLICATE KEY UPDATE`），**不做非负校验** |
| `addEnergy(playerId, amount)` | `amount <= 0` 直接返回；否则先 `ensureRowExists` 再 `UPDATE ... SET energy = energy + ?` |
| `removeEnergy(playerId, amount)` | 条件更新 `WHERE player_id = ? AND energy >= ?`，返回是否扣成功；`amount <= 0` 视为成功 |

::: tip 扣能量是原子的，加能量不是「事务内」的
`removeEnergy` 用 `WHERE energy >= ?` 做条件更新，并发下不会扣成负数；但**能量与物品的交换不是同一个事务**（见下节「一致性风险」）。
:::

## 能量来源

| 来源 | 规则 | 代码位置 |
| --- | --- | --- |
| 物品转化 | 每个物品获得 `max(1, floor(price × 0.8))` 能量 | `EnergyService.resolveConvertGain` |
| 插件自定义能量值 | 优先于物品 `price` | `EnergyService.registerItemEnergy` |
| 管理端发放 | `/能量管理 <玩家ID> 增加 <数值>` 或 `POST admin/energy/add` | `EnergyAdminCommand` |

全仓库搜索 `addEnergy(` 只有三处调用：`ExchangeCommand`（转化）、`EnergyAdminCommand`（指令与 REST 发放）。**没有修炼、打坐、任务、签到等玩法直接产出能量**。

### 物品 → 能量：80% 损耗

```java
/** 物品→能量 转化损耗率（转化只得原价 80%，兑换按原价，防止低成本物品套利） */
public static final double CONVERT_LOSS_RATE = 0.8;

public static long resolveEnergyValue(String itemKey) {
    Long custom = getCustomEnergyView().get(itemKey);
    if (custom != null) return custom;              // 插件注册值优先
    Item item = ItemRegistry.get(itemKey);
    return (item != null && item.getPrice() > 0) ? item.getPrice() : 0;  // 回退到物品 price
}

public static long resolveConvertGain(String itemKey) {
    long value = resolveEnergyValue(itemKey);
    if (value <= 0) return 0;
    return Math.max(1, (long) (value * CONVERT_LOSS_RATE));
}
```

规则总结：**能量值来源优先级**是「插件注册值 > `Item.price`」，两者都没有（或 `price <= 0`）时能量值为 `0`；**转化只得 80%**，向下取整且**至少 1**；**兑换按 100% 原价**，不享受任何折扣。因此「物品 → 能量 → 同一物品」是**净亏 20%** 的循环。

### 插件注册自定义能量值

```java
/** 插件注册的自定义物品能量值 key=fullKey → value=能量值 */
private static final Map<String, Long> customEnergyValues = new LinkedHashMap<>();

public static void registerItemEnergy(String itemKey, long energyValue) {
    if (energyValue <= 0) throw new IllegalArgumentException("能量值必须大于0: " + itemKey);
    customEnergyValues.put(itemKey, energyValue);
    customEnergyView = null; // 使缓存失效
}
```

| 要点 | 说明 |
| --- | --- |
| 插件入口 | `PluginContext.registerItemEnergy(itemKey, energyValue)` / `unregisterItemEnergy(itemKey)` |
| 校验 | `energyValue <= 0` 抛 `IllegalArgumentException` |
| 未注册物品 | 能量值仍会被记下，等物品注册后生效（源码注释明确） |
| 缓存 | `customEnergyView` 是 `Collections.unmodifiableMap` 快照，注册/注销时置 `null` 失效 |
| 查询 | `getCustomEnergyValues()` 返回只读视图 |

::: warning 自定义能量值会**完全覆盖**物品价格
`resolveEnergyValue` 命中自定义值后直接返回，不会与 `price` 做任何比较。插件把某物品的能量值设得比 `price` 低（或高）都会被无条件采用，这是设计上的扩展点，也是经济平衡的风险点。
:::

## 能量用途：兑换物品

`/转化 兑换 <物品> [数量]`（`ExchangeCommand.doConvertEnergyToItem`）：

1. 检查 `experimental_energy_exchange` 插件是否启用，未启用直接回复「能量转化系统暂未开放。」；
2. `ItemRegistry.resolve` 解析物品；
3. `energyPerItem = EnergyService.resolveEnergyValue(fullKey)`，`<= 0` 时拒绝：「该物品没有转化价值，无法用能量兑换。」；
4. `totalCost = energyPerItem × quantity`；
5. 能量不足 → 「能量不足！需要 N 能量，当前只有 M 能量。」；
6. `removeEnergy` 扣能量；
7. `itemService.addItem(playerId, item.getFullKey(), quantity)` 入包。

### 代表性物品的能量价值

| 物品 | key | `price`（兑换价 = 能量成本） | 转化获得（80%） |
| --- | --- | --- | --- |
| 下品灵石 | `mtxgdn:spirit_stone_low` | 1 | 1 |
| 中品灵石 | `mtxgdn:spirit_stone_mid` | 1,000 | 800 |
| 上品灵石 | `mtxgdn:spirit_stone_high` | 1,000,000 | 800,000 |
| 极品灵石 | `mtxgdn:spirit_stone_supreme` | 1,000,000,000 | 800,000,000 |
| 灵草 | `mtxgdn:spirit_grass` | 5 | 4 |
| 铁矿石 | `mtxgdn:iron_ore` | 8 | 6 |
| 回血丹 | `mtxgdn:healing_pill` | 10 | 8 |
| 强化石 | `mtxgdn:enhance_stone` | 50 | 40 |
| 妖兽内丹 | `mtxgdn:beast_core` | 60 | 48 |
| 修炼丹 | `mtxgdn:cultivation_elixir` | 100 | 80 |
| 天火石 | `mtxgdn:heaven_fire_stone` | 200 | 160 |
| 聚灵阵图 | `mtxgdn:spirit_gathering_formation` | 300 | 240 |
| 星沙 | `mtxgdn:star_sand` | 500 | 400 |
| 龙鳞 | `mtxgdn:dragon_scale` | 2,000 | 1,600 |
| 灵剑 | `mtxgdn:spirit_sword` | 3,000 | 2,400 |
| 护身玉 | `mtxgdn:guardian_jade` | 8,000 | 6,400 |
| 天元丹 | `mtxgdn:heaven_pill` | 10,000 | 8,000 |
| 麒麟护符 | `mtxgdn:qilin_amulet` | 200,000 | 160,000 |

::: tip 下品灵石是唯一的「无损」转化
`price = 1` 时 `(long)(1 × 0.8) = 0`，被 `Math.max(1, ...)` 抬到 `1`。因此下品灵石 **1 个 ⇄ 1 能量**，来回无损耗。其余物品都是 `floor(price × 0.8)`，一定有 20% 损失。
:::

### 无法转化的物品

`price = 0` 的物品全部不可转化，`resolveConvertGain` 返回 `0`，`/转化` 会回「【X】没有转化价值，无法转化为能量。」：`gold_bag`（金袋）、`spirit_stone_pouch`（灵石袋）、`qiankun_zaohua_dan`（乾坤造化丹）、`quest_letter`（任务信）、`fragment_scroll`（残卷）、`mystery_token`（神秘令牌）、`quest_scroll`（任务卷轴），前缀均为 `mtxgdn:`。

::: warning 兑换只认 `resolveEnergyValue`，不认 `tradeable`
`/转化 兑换` 与 `/转化 <物品>` 都**不检查 `item.isTradeable()`**。而回收（`EconomyService.recycleItem`）会拒绝 `!isTradeable()` 的物品。两者判定口径不同，`price > 0` 但 `tradeable = false` 的物品（如 `mtxgdn:spirit_stone_pouch` 的 `price = 0`，暂无实例）在兑换侧仍会被放行。
:::

## 指令

### `/转化`（别名 `exchange`、`convert`）

```java
super(new String[]{"转化", "exchange", "convert"},
        "将物品转化为能量，或将能量兑换为物品",
        "/转化 <物品> [数量]\n/转化 兑换 <物品> [数量]\n/转化 列表",
        "实用功能", null);
setModule("energy");
registerSub("兑换", this::doConvertEnergyToItem);
registerSub("列表", this::doList);
registerSub(new String[]{"help", "帮助"}, this::doHelp);
```

| 用法 | 说明 |
| --- | --- |
| `/转化 <物品> [数量]` | 物品 → 能量（默认数量 1） |
| `/转化 兑换 <物品> [数量]` | 能量 → 物品 |
| `/转化 列表` | 按转化获得值**降序**列出所有可转化物品 |
| `/转化 help` | 帮助 + 当前能量 + 转化/兑换比例说明 |

`/转化 help` 的固定文案（`当前能量: <energy>` 后接）：`/转化 <物品> [数量] - 将物品转化为能量`、`/转化 兑换 <物品> [数量] - 用能量兑换物品`、`/转化 列表 - 查看所有可转化物品`，末尾两行说明 `物品转化为能量 = 原价 × 80%（20% 转化损耗）` 与 `能量兑换物品 = 物品原价`。

转化成功的回复：

```text
转化成功！
消耗: 灵草 x3
获得能量: 12
（每个 灵草 = 4 能量，含 20% 转化损耗）
当前能量: <energy>
```

### `/能量管理`（别名 `energyadmin`、`energymanage`）

仅私聊、权限 `admin.status`，且**要求 `experimental_energy_exchange` 已启用**：

| 用法 | 说明 |
| --- | --- |
| `/能量管理 <玩家ID> 查看`（`view`） | 查看目标玩家能量 |
| `/能量管理 <玩家ID> 设置 <数值>`（`set`） | 覆盖设置，负数被拒绝 |
| `/能量管理 <玩家ID> 增加 <数值>`（`add`） | 增加，`<= 0` 被拒绝 |
| `/能量管理 <玩家ID> 减少 <数值>`（`remove`） | 减少，不足时拒绝 |

未启用插件时的提示：

```text
能量转化系统暂未开放，请在 config/plugins.yml 中将 experimental_energy_exchange 设为 true（或在 WebUI「插件管理」页启用该实验性插件）。
```

## REST 接口

### 玩家侧（`ExchangeCommand.addRoute`）

| 方法 | 路径 | Body / 参数 | 返回 |
| --- | --- | --- | --- |
| `POST` | `energy/convert` | `{"itemKey": "...", "quantity": 10}` | `code`、`message`、`itemName`、`itemKey`、`quantity`、`energyGained`、`currentEnergy` |
| `POST` | `energy/exchange` | `{"itemKey": "...", "quantity": 10}` | `code`、`message`、`itemName`、`itemKey`、`quantity`、`energyCost`、`currentEnergy` |
| `GET` | `energy/list` | — | `code`、`items[]`（`itemKey`、`itemName`、`energyValue`，按 `energyValue` 降序） |
| `GET` | `energy/status` | — | `code`、`playerId`、`energy` |

四个接口在插件停用时统一返回 `code = 403` + 「能量转化系统暂未开放」。

::: warning `/转化 列表` 与 `energy/list` 的排序基准不同
- `/转化 列表` 按 `resolveConvertGain`（**80% 后**的值）排序；
- `GET energy/list` 按 `resolveEnergyValue`（**原价**）排序，并只返回 `energyValue > 0` 的物品。

两者物品集合一致，但排序键与展示数值不同：列表指令显示「转化获得 N 能量」，HTTP 接口返回的是原价 `energyValue`。
:::

### 管理侧（`EnergyAdminCommand.addRoute`）

| 方法 | 路径 | 权限 | Body |
| --- | --- | --- | --- |
| `GET` | `admin/energy/{playerId}` | `admin.status` | — |
| `POST` | `admin/energy/set` | `admin.status` | `{"playerId": 1, "energy": 1000}` |
| `POST` | `admin/energy/add` | `admin.status` | `{"playerId": 1, "energy": 500}` |
| `POST` | `admin/energy/remove` | `admin.status` | `{"playerId": 1, "energy": 300}` |

四个接口同样受 `experimental_energy_exchange` 门控，停用时返回 `code = 403`。`set` 拒绝负数（`energy < 0` → `code 400`），`add` / `remove` 拒绝 `<= 0`，玩家不存在返回 `code 404`。

## 实验性插件：`experimental_energy_exchange`

```java
/**
 * 实验性插件：能量转化 / 等价交换。
 * <p>
 * 配置键: {@code plugins.experimental_energy_exchange}（默认 true，见 config/plugins.yml）
 * 功能: 物品转化为能量、能量兑换物品（{@code /转化}、{@code /交换} 指令与
 * {@code energy/convert}、{@code energy/exchange} 接口）。
 * <p>
 * 与稳定模块 {@code energy}（能量系统）相互独立：本插件管的是“等价交换”这层实验性玩法，
 * 由旧 {@code config/experimental.yml} 的 {@code experimental.energy_exchange} 迁移而来。
 */
public class EnergyExchangePlugin extends BuiltInPlugin {
    @Override public String getName() { return "experimental_energy_exchange"; }
    @Override public String getVersion() { return "0.1.0"; }
    @Override public String getCategory() { return "experimental"; }
    @Override public boolean getDefaultEnabled() { return true; }
}
```

| 属性 | 值 |
| --- | --- |
| 插件名 | `experimental_energy_exchange` |
| 版本 | `0.1.0` |
| 分类 | `experimental` |
| 默认启用 | `true`（源码注释：旧 `experimental.yml` 中 `energy_exchange` 默认 `true`，保持默认开启） |
| 配置键 | `plugins.experimental_energy_exchange` |
| 启用钩子 | `onEnable` → 日志「实验性功能已启用: 能量转化（等价交换）」 |
| 停用钩子 | `onDisable` → 日志「实验性功能已停用: 能量转化（等价交换）」 |

`config/plugins.yml` 中的声明：

```yaml
  # ---- 实验性插件（独立于稳定玩法，默认按各自默认值）----
  # 停用即整体关闭该实验性内容：相关指令/接口会被门控拒绝。
  # 这两个开关由旧 experimental.yml 的 sect_war / energy_exchange 迁移而来。
  experimental_sect_war: false         # 宗门战（实验性，默认关闭）
  experimental_energy_exchange: true   # 能量转化/等价交换（实验性，默认开启）
```

门控判断走 `BuiltInPluginRegistry.isModuleEnabled(name)`，内部调用 `isEnabledOrUnknown`：**未注册的模块名一律视为启用**（`return entry == null || entry.active;`），避免把未知模块误判为「已停用」而永久封禁其命令。

::: warning 未知模块名默认放行
如果 `experimental_energy_exchange` 未在注册表中出现（例如自定义构建裁剪了该插件），`isEnabledOrUnknown` 返回 `true`，**门控会放行**而不是拦截。停用必须在 `plugins.yml` 里显式写 `false`（或通过 WebUI「插件管理」页停用）才会生效。
:::

插件还提供 `PluginContext.isExperimentalFeatureEnabled(key)` 作为通用查询入口：

```java
public boolean isExperimentalFeatureEnabled(String key) {
    return BuiltInPluginRegistry.isModuleEnabled(key);
}
```

## 一致性风险

`ExchangeCommand` 的两个方向都是**两步非事务操作**：

```java
// 物品 → 能量
itemService.removeItem(p.getId(), fullKey, quantity);
energyService.addEnergy(p.getId(), totalEnergy);

// 能量 → 物品
if (!energyService.removeEnergy(p.getId(), totalCost)) { ... }
itemService.addItem(p.getId(), item.getFullKey(), quantity);
```

| 方向 | 风险 |
| --- | --- |
| 物品 → 能量 | `removeItem` 与 `addEnergy` 之间进程崩溃 → 物品已扣、能量未加 |
| 能量 → 物品 | `removeEnergy` 成功后若 `addItem` 抛异常（**背包已满**）→ **能量已扣、物品未得，且不返还** |

背包满时 `ItemService.checkCapacity` 会抛：

```java
throw new RuntimeException("背包已满！当前容量: " + capacity + " 格，请先清理背包或提升等级扩容");
```

该异常在 `ExchangeCommand.doConvertEnergyToItem` 中**没有捕获**，会向上冒泡到指令框架。因此兑换前应先确认背包有空位。

::: details 对比：合成系统是事务化的
`CraftingService.craft` 用 `DatabaseManager.runTransaction(conn -> {...})` 把材料、金币、灵石扣除与产物发放包在同一个事务里；`ItemService.removeItems` 也保证「任一物品不足则全部回滚」。能量交换没有做到这一点。
:::

## 模块开关一览

| 配置键 | 默认 | 影响 |
| --- | --- | --- |
| `plugins.energy` | `true` | 能量系统模块（`EnergyService` 本体；`/转化` 指令的 `setModule("energy")`） |
| `plugins.experimental_energy_exchange` | `true` | `/转化`、`/能量管理`、`energy/*`、`admin/energy/*` 的门控 |
