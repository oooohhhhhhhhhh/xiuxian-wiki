# 装备与强化

装备系统由 `ItemService`（穿戴/卸下）、`EnhanceService`（强化）与 `EquipmentFixService`（数据一致性修复）三部分组成，数据落在 `players_equipment` 表。装备的**属性加成直接写进 `players` 表的四维字段**（不是临时 Buff），而**强化等级是独立的一层加成**，在读取最终属性时动态叠加。

关键源码：

| 文件 | 职责 |
| --- | --- |
| `src/main/java/com/mtxgdn/game/service/ItemService.java` | `equipItem` / `unequipItem` / `getEquipment` |
| `src/main/java/com/mtxgdn/game/service/EnhanceService.java` | 强化消耗、成功率、碎裂/降级、保底、加成公式 |
| `src/main/java/com/mtxgdn/game/service/EquipmentFixService.java` | 启动期/管理端装备数据一致性修复 |
| `src/main/java/com/mtxgdn/game/service/PlayerService.java` | `getFinalAttack` 等最终属性 = 称号加成 + 强化加成 |
| `src/main/java/com/mtxgdn/onebot/command/item/EquipCommand.java` | `/装备` |
| `src/main/java/com/mtxgdn/onebot/command/item/UnequipCommand.java` | `/卸下` |
| `src/main/java/com/mtxgdn/onebot/command/item/EquippedCommand.java` | `/已装备` |
| `src/main/java/com/mtxgdn/onebot/command/item/EnhanceCommand.java` | `/强化` |
| `src/main/java/com/mtxgdn/onebot/command/admin/FixEquipmentCommand.java` | `/修复装备`（管理） |

## 装备栏位

栏位是 `players_equipment.slot` 字符串（`VARCHAR(32)`），游戏约定 3 个：

| 栏位 | 中文 | 说明 |
| --- | --- | --- |
| `weapon` | 武器 | 灵剑、龙剑等 |
| `armor` | 防具 | 玉甲、凤凰铠甲、星辰法袍 |
| `accessory` | 饰品 | 护身玉、空间戒指、麒麟护符 |

::: warning 服务层不校验栏位白名单，也不校验物品类型
`ItemService.equipItem(playerId, itemKey, slot)` 直接 `ItemRegistry.resolve(itemKey)` 然后把 `slot` 原样写库，**不检查 slot 是否属于 `weapon/armor/accessory`，也不检查物品是不是装备**。栏位白名单只存在于三个指令的入参校验里：

```java
String[] validSlots = {"weapon", "armor", "accessory"};
```

REST 接口 `POST /game/equipment/equip` 只校验 `itemKey` / `slot` 非空，因此通过 HTTP 可以写入任意栏位名。
:::

数据表 `players_equipment`（`DatabaseSchema.createPlayersEquipmentTable`）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 自增 |
| `player_id` | `BIGINT NOT NULL` | 外键 → `players(id)` ON DELETE CASCADE |
| `slot` | `VARCHAR(32) NOT NULL` | 栏位名 |
| `item_key` | `VARCHAR(128) NOT NULL` | 物品 `fullKey` |
| `enhance_level` | `INT DEFAULT 0` | 强化等级，由 `DatabaseMigration.addEquipmentEnhanceLevelColumn` 增量补列 |
| `created_at` / `updated_at` | 时间戳 | |

约束 `UNIQUE (player_id, slot)`：**一个栏位只能有一件装备**，写入走 upsert。

## 穿戴装备

`ItemService.equipItem` 全流程包在一个事务里：

1. `ItemRegistry.resolve(itemKey)`，解析失败返回「物品不存在，请使用 /物品列表 查看可用物品」；
2. 校验背包里有该 `fullKey`（数量 < 1 → 「背包中没有该物品」）；
3. 若该栏位已装备**同一件**物品 → 「已装备该物品」；
4. **回退旧装备效果**：遍历旧装备的 `BuffEffect`，对 `> 0` 的攻击/防御/速度/灵力逐项 `addAttack(conn, ..., -bonus)`，再把旧装备 `+1` 放回背包；
5. 从背包扣除 1 个（失败则抛 `SQLException` 回滚整个事务）；
6. 写 `players_equipment`（SQLite `ON CONFLICT(player_id, slot) DO UPDATE`；MySQL `ON DUPLICATE KEY UPDATE`）；
7. **执行新装备效果**（写库成功之后），`BuffEffect` 走带 `Connection` 的重载；
8. 拼接返回文案 `装备了【名称 (fullKey)】: 攻击力 +50，...`。

::: tip 写入顺序是「先回退旧装备 → 再落库新装备 → 最后执行效果」
旧装备会**退回背包**，所以换装不会损失装备。注意事务内用的是 `addItem(conn, ...)` 内部重载，它**不做背包容量校验**（只有公开的 `addItem(playerId, ...)` 才调 `checkCapacity`），因此装备/卸下时即使背包已满也能写入，不会因容量拦截而回滚。
:::

## 卸下装备

`ItemService.unequipItem(playerId, slot)`：

1. 查该栏位 `item_key`，为空 → 「该装备栏位为空」；
2. `ItemRegistry.get(itemKey)` 为空 → 「物品数据异常」；
3. `DELETE FROM players_equipment WHERE player_id = ? AND slot = ?`；
4. 物品 `+1` 回背包；
5. 对 `BuffEffect` 逐项反向扣除，文案 `卸下了【名称】: 攻击力 -50，...`。

::: warning 卸下不返还强化等级
`enhance_level` 存在 `players_equipment` 行上，卸下时整行被删除，**强化等级随之丢失**。重新穿上同一件装备，强化等级从 `+0` 开始。
:::

## 装备属性：两套加成来源

### 1. 装备自带的 `BuffEffect`

装备类物品（`ItemType.TREASURE`）全部使用 `durationSeconds = 0` 的 `BuffEffect`：

```java
// SpiritSword.java
super("mtxgdn", "spirit_sword", ItemType.TREASURE, ItemRarity.RARE,
    1, 3000, true, 2, BuffEffect.of(50, 0, 10, 20, 0));
//                         攻击  防御 速度 灵力  持续秒
```

`BuffEffect.isInstantEffect()` 返回 `durationSeconds <= 0`。当持续时间为 0 时，`execute` **直接修改 `players` 表的 `attack/defense/speed/spirit`**，不写 `player_buffs`：

```java
} else {
    if (attackBonus > 0) { playerService.addAttack(playerId, attackBonus); sb.append("攻击力 +").append(attackBonus).append("，"); }
    ...
}
```

因此装备加成是**永久属性**，不会被 Buff 过期清理逻辑回收，也**不会出现在 `/增益` 输出里**。

### 2. 强化等级加成

强化加成是**动态计算**的，不存在 `players` 表里。`PlayerService` 的最终属性读取时叠加：

```java
public int getFinalAttack(Player player) {
    return applyTitleBonus(player, player.getAttack(), t -> t.getAttackBonus())
            + getEnhanceBonus(player.getId())[0];
}

/** 读取三件装备的强化加成（攻击/防御/速度/灵力），强化等级真实生效于战斗属性 */
private int[] getEnhanceBonus(long playerId) {
    int[] total = {0, 0, 0, 0};
    String sql = "SELECT slot, enhance_level FROM players_equipment WHERE player_id = ? AND enhance_level > 0";
    ...
    int[] bonus = EnhanceService.getEnhanceStatBonus(rs.getInt("enhance_level"));
    for (int i = 0; i < 4; i++) total[i] += bonus[i];
}
```

所以最终属性 = **称号加成后的基础值 + 全部装备栏位的强化加成之和**。`getFinalSpeed` / `getFinalSpirit` 同理；`getFinalMaxHp` / `getFinalMaxMp` **不含**强化加成。

## 强化系统

`EnhanceService` 的常量与数组（下标 = **当前**强化等级，0~14）：

```java
private static final int MAX_ENHANCE_LEVEL = 15;
/** 连续失败保底：每失败一次 +5% 成功率，最多累计 6 次（+30%），成功后清零 */
private static final int MAX_PITY_STREAK = 6;
private static final int PITY_BONUS_PER_FAIL = 5;
```

| 当前等级 | 金币消耗 | 强化石消耗 | 基础成功率 | 碎裂率 | 降级率 |
| --- | --- | --- | --- | --- | --- |
| +0 | 500 | 1 | 95% | 0% | 0% |
| +1 | 800 | 1 | 90% | 0% | 0% |
| +2 | 1200 | 2 | 85% | 0% | 0% |
| +3 | 1800 | 2 | 80% | 0% | 0% |
| +4 | 2500 | 3 | 75% | 0% | 0% |
| +5 | 3500 | 4 | 65% | 2% | 8% |
| +6 | 5000 | 5 | 55% | 5% | 15% |
| +7 | 7000 | 7 | 45% | 8% | 20% |
| +8 | 10000 | 10 | 35% | 12% | 25% |
| +9 | 15000 | 14 | 25% | 18% | 25% |
| +10 | 22000 | 20 | 18% | 25% | 25% |
| +11 | 32000 | 28 | 12% | 35% | 20% |
| +12 | 48000 | 40 | 8% | 45% | 20% |
| +13 | 70000 | 55 | 5% | 55% | 15% |
| +14 | 100000 | 75 | 3% | 65% | 10% |

对应的源码数组：

```java
private static final int[] ENHANCE_GOLD_COST = {
    500, 800, 1200, 1800, 2500, 3500, 5000, 7000, 10000, 15000,
    22000, 32000, 48000, 70000, 100000
};
private static final int[] ENHANCE_STONE_COST = {
    1, 1, 2, 2, 3, 4, 5, 7, 10, 14, 20, 28, 40, 55, 75
};
private static final int[] ENHANCE_SUCCESS_RATE = {
    95, 90, 85, 80, 75, 65, 55, 45, 35, 25, 18, 12, 8, 5, 3
};
private static final int[] ENHANCE_BREAK_RATE = {
    0, 0, 0, 0, 0, 2, 5, 8, 12, 18, 25, 35, 45, 55, 65
};
private static final int[] ENHANCE_DEGRADE_RATE = {
    0, 0, 0, 0, 0, 8, 15, 20, 25, 25, 25, 20, 20, 15, 10
};
```

### 强化判定顺序

```java
int pityStreak = Math.min(MAX_PITY_STREAK, FAIL_STREAK.getOrDefault(pityKey, 0));
int effectiveSuccessRate = Math.min(95, successRate + pityStreak * PITY_BONUS_PER_FAIL);
int roll = random.nextInt(100);
```

事务内先扣金币与强化石，再按 `roll` 分支：

| 条件 | 结果 |
| --- | --- |
| `roll < effectiveSuccessRate` | `success`：`enhance_level + 1` |
| `failRoll < breakRate && currentLevel >= 5` 且背包有护符 | `protected`：消耗 1 张 `mtxgdn:protect_charm`，装备免碎 |
| `failRoll < breakRate && currentLevel >= 5` 且无护符 | `break`：`DELETE` 装备行，**装备直接消失** |
| `failRoll < breakRate + degradeRate && currentLevel > 0` | `degrade`：`enhance_level - 1` |
| 其他 | `fail`：材料消耗，等级不变 |

其中 `failRoll = roll - effectiveSuccessRate`。

::: warning 强化的四个要点
1. **消耗先扣**：金币和强化石在任何失败分支都不会返还。
2. **碎裂即销毁**：`break` 分支执行 `DELETE FROM players_equipment`，装备**不会回到背包**，是真正的消失。
3. **碎裂只在 +5 及以上可能发生**：`ENHANCE_BREAK_RATE[0..4]` 全为 0，且代码显式要求 `currentLevel >= 5`。
4. **护符只挡碎裂**：护符不影响降级与普通失败，且**只在会碎裂的那一次**被消耗。
:::

### 连续失败保底

| 项 | 值 |
| --- | --- |
| 保底键 | `playerId + ":" + slot` |
| 每失败一次 | `+5%` 成功率 |
| 最大累计 | 6 次 → `+30%` |
| 成功率硬上限 | `95%`（`Math.min(95, ...)`） |
| 清零时机 | **仅 `success`**；`break` / `protected` / `degrade` / `fail` 都算失败并累加 |
| 存储 | `ConcurrentHashMap<String, Integer> FAIL_STREAK`，**内存态，重启即失效** |

### 强化属性加成公式

```java
private static final double ENHANCE_ATK_MULTIPLIER    = 0.06;
private static final double ENHANCE_DEF_MULTIPLIER    = 0.06;
private static final double ENHANCE_SPD_MULTIPLIER    = 0.04;
private static final double ENHANCE_SPIRIT_MULTIPLIER = 0.04;

public static int[] getEnhanceStatBonus(int enhanceLevel) {
    if (enhanceLevel <= 0) return new int[]{0, 0, 0, 0};
    return new int[]{
        (int)(enhanceLevel * 12 * ENHANCE_ATK_MULTIPLIER * enhanceLevel),
        (int)(enhanceLevel * 10 * ENHANCE_DEF_MULTIPLIER * enhanceLevel),
        (int)(enhanceLevel *  8 * ENHANCE_SPD_MULTIPLIER * enhanceLevel),
        (int)(enhanceLevel *  6 * ENHANCE_SPIRIT_MULTIPLIER * enhanceLevel)
    };
}
```

化简后为：攻击 `0.72 × L²`、防御 `0.60 × L²`、速度 `0.32 × L²`、灵力 `0.24 × L²`，均向下取整。

| 强化等级 | 攻击 | 防御 | 速度 | 灵力 |
| --- | --- | --- | --- | --- |
| +1 | 0 | 0 | 0 | 0 |
| +2 | 2 | 2 | 1 | 0 |
| +3 | 6 | 5 | 2 | 2 |
| +4 | 11 | 9 | 5 | 3 |
| +5 | 18 | 15 | 8 | 6 |
| +6 | 25 | 21 | 11 | 8 |
| +7 | 35 | 29 | 15 | 11 |
| +8 | 46 | 38 | 20 | 15 |
| +9 | 58 | 48 | 25 | 19 |
| +10 | 72 | 60 | 32 | 24 |
| +11 | 87 | 72 | 38 | 29 |
| +12 | 103 | 86 | 46 | 34 |
| +13 | 121 | 101 | 54 | 40 |
| +14 | 141 | 117 | 62 | 47 |
| +15 | 162 | 135 | 72 | 54 |

::: tip `+1` 不加任何属性
`(int)(1 × 12 × 0.06 × 1) = (int)0.72 = 0`，四项全为 0。真正的收益从 `+2` 开始，且是**平方增长**——`+15` 单件提供 攻 162 / 防 135 / 速 72 / 灵 54，三栏位满强化合计 攻 486 / 防 405 / 速 216 / 灵 162。
:::

## 装备数据一致性修复

`EquipmentFixService.fixEquipmentData()` 是一个**幂等的一次性修复任务**（静态 `hasRun` 保证单进程只跑一次）：

```java
public void fixEquipmentData() {
    if (hasRun) { LOG.info("装备数据修复已执行过，跳过"); return; }
    hasRun = true;
    ...
}
```

对每个玩家执行 `fixPlayerEquipment`：

| 检测 | 处理 |
| --- | --- |
| `players_equipment.item_key` 在 `ItemRegistry` 中不存在 | 打 `warn` 日志并 `DELETE` 该装备行 |
| 已装备物品在背包中**同时存在** | 从背包扣 1 个（去重），记 `fixed` |
| 背包里有 `ItemType.EQUIPMENT` 物品但未装备 | 仅打 `warn` 日志提示，**不做任何修改** |

触发方式：`/修复装备`（别名 `fixequip`，权限 `admin.fix.equipment`）或启动流程调用。日志汇总为「装备数据检查完成: 修复 N 个玩家, 错误 N 个」。

::: warning 「修复」不是耐久度修理
项目**没有耐久度字段**，`EquipmentFixService` 修的是数据一致性（幽灵装备、背包与装备表重复计数），与战斗损耗无关。全仓库 grep `durability` 无匹配。
:::

## 指令与接口

| 指令 | 别名 | 用法 | 权限 |
| --- | --- | --- | --- |
| `/装备 <物品> <部位>` | `equip` | `/装备 灵剑 weapon` | `game.equipment.equip` |
| `/卸下 <部位>` | `unequip` | `/卸下 weapon` | `game.equipment.equip` |
| `/已装备` | `equipped` | 展示武器/防具/饰品三行 | `game.inventory.view` |
| `/强化 <栏位>` | `enhance` | `/强化 weapon` | `game.equipment.enhance` |
| `/修复装备` | `fixequip` | 全服装备数据修复 | `admin.fix.equipment` |

`/强化` 的输出格式（`EnhanceCommand`）：

```text
===== 装备强化 =====
装备: 灵剑
栏位: weapon
当前等级: +3
成功率: 80%
消耗: 1800金币 + 2强化石

强化成功！装备强化等级提升至 +4
```

REST 接口（`GameResource`）：

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/game/equipment` | `game.inventory.view` | 返回 `slots` 对象，每个栏位含物品 JSON + `enhanceLevel`，等级 > 0 时附 `enhanceAtk/enhanceDef/enhanceSpd/enhanceSpirit` |
| `POST` | `/game/equipment/equip` | `game.equipment.equip` | Body `{itemKey, slot}` |
| `POST` | `/game/equipment/unequip` | `game.equipment.equip` | Body `{slot}` |
| `POST` | `/game/equipment/enhance` | `game.equipment.enhance` | Body `{slot}` |

## 强化返回字段

`EnhanceService.enhanceItem` 返回的 `Map` 字段（供指令与 Web 端消费）：

| 字段 | 含义 |
| --- | --- |
| `slot` / `itemName` | 栏位与装备名 |
| `currentLevel` | 强化前的等级 |
| `costGold` / `costStones` | 本次消耗 |
| `successRate` | **含保底加成后**的实际成功率 |
| `breakRate` | 当前等级的碎裂率 |
| `pityStreak` | 当前累计失败次数（0~6） |
| `success` | 请求是否被正常处理（**不是强化是否成功**） |
| `enhanceSuccess` | 强化是否真的成功 |
| `newLevel` | 成功或降级后的等级 |
| `broken` / `brokenItem` | 碎裂标记与装备名 |
| `protected` | 护符生效标记 |
| `degraded` | 降级标记 |
| `message` | 展示文案 |

::: tip `success` 与 `enhanceSuccess` 是两个不同的语义
`success` 表示「这次强化请求被系统正常受理」；强化失败（含碎裂、降级、材料消耗）时 `success = false`，`enhanceSuccess = false`，而系统异常时两者同为 `false` 但 `message` 以「强化失败，系统异常: 」开头。
:::
