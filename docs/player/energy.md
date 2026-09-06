# 能量转化

能量转化是「物品 ↔ 能量」互转系统：先把物品转化为能量，再用能量兑换回物品，玩家能量存于 `player_energy` 表。受实验开关 **`experimental.energy_exchange`** 控制（资源内默认 `true`），关闭时玩家侧指令与 REST 均返回「能量转化系统暂未开放」。

## 能量价值

- **默认**：物品的能量价值 = 物品自身价格 `price`（`EnergyService.resolveEnergyValue` 优先查自定义值，否则取 `price`，`price ≤ 0` 视为无价值）
- **插件覆盖**：插件通过 `PluginContext.registerItemEnergy(itemKey, energyValue)` 注册自定义能量值（数值须 > 0），`unregisterItemEnergy(itemKey)` 取消注册
- 灵石本身可转化：下品 = 1 能量、中品 = 1000、上品 = 10⁶、极品 = 10⁹（与面额等值一致）

## 转化规则

| 操作 | 指令 | 规则 |
|------|------|------|
| 物品 → 能量 | `/转化 <物品> [数量]` | 消耗物品，获得 `max(1, ⌊能量值 × 80%⌋) × 数量` 能量 |
| 能量 → 物品 | `/转化 兑换 <物品> [数量]` | 消耗 `能量值 × 数量` 能量，获得物品 |
| 查看可转化列表 | `/转化 列表` | 全部可转化物品按能量值降序 |

- **非等价交换**：物品转能量仅得原价 **80%**（20% 转化损耗，防「低价获取 → 全额转化 → 兑换高价」套利）；能量换回物品按原价，1 能量 = 1 价格
- 数量默认 1；能量不足 / 物品不足 / 无转化价值会拒绝并提示

## 玩家指令与 REST

QQ：`/转化`（别名 `/exchange`、`/convert`，模块 `energy`，子命令 `兑换` / `列表` / `help`）。

REST（模块门控 `energy`，实验关闭时返回 403）：

| 接口 | 方法 | 说明 |
|------|:---:|------|
| `/api/game/energy/convert` | POST | 物品→能量（body：`itemKey`、`quantity`） |
| `/api/game/energy/exchange` | POST | 能量→物品（body：`itemKey`、`quantity`） |
| `/api/game/energy/list` | GET | 可转化物品列表（含 `energyValue`） |
| `/api/game/energy/status` | GET | 我的能量值 |

## 管理员能量管理

| 操作 | QQ | REST |
|------|------|------|
| 查看 | `/能量管理 <玩家ID> 查看` | `GET /api/admin/energy/{playerId}` |
| 设置 | `/能量管理 <玩家ID> 设置 <值>` | `POST /api/admin/energy/set` |
| 增加 | `/能量管理 <玩家ID> 增加 <值>` | `POST /api/admin/energy/add` |
| 减少 | `/能量管理 <玩家ID> 减少 <值>` | `POST /api/admin/energy/remove` |

- QQ 别名 `/energyadmin`、`/energymanage`，权限码 `admin.status`，私聊限定；同样受实验开关约束
- 能量扣减为条件更新（`energy >= amount`），不会扣成负数

## 相关系统

- 插件注册能量值 API → [插件开发](../dev/plugin-development)
- 灵石面额与物品价格 → [经济与货币](./economy)
