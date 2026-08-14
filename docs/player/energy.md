# 能量转化

能量转化是「等价交换」式物品能量互转系统：**物品 → 能量 → 物品** 闭环。受实验开关 `experimental.energy_exchange` 控制（默认开启）。

## 能量价值

- 主程序物品的能量价值 = **物品自身价格（price）**
- 插件可通过 `PluginContext.registerItemEnergy(itemKey, energyValue)` 注册自定义能量值
- 灵石本身可转化（下品=1 能量、中品=1000、上品=10⁶、极品=10⁹），形成灵石 ↔ 能量的无损互转

## 转化规则

| 操作 | 指令 | 规则 |
|------|------|------|
| 物品 → 能量 | `/转化 <物品> [数量]` | 消耗物品，获得 `能量值 × 数量` |
| 能量 → 物品 | `/转化 兑换 <物品> [数量]` | 消耗能量，获得物品 |
| 查看列表 | `/转化 列表` | 全部可转化物品按能量值降序 |

- **等价交换**：双向 1 能量 = 1 价格，无损耗、无手续费
- 数量默认 1；能量不足 / 物品不足会拒绝

## 管理员管理

| 操作 | 指令 | REST |
|------|------|------|
| 查看能量 | `/能量管理 <玩家ID> 查看` | `GET /api/admin/energy/{playerId}` |
| 设置能量 | `/能量管理 <玩家ID> 设置 <值>` | `POST /api/admin/energy/set` |
| 增加能量 | `/能量管理 <玩家ID> 增加 <值>` | `POST /api/admin/energy/add` |
| 减少能量 | `/能量管理 <玩家ID> 减少 <值>` | `POST /api/admin/energy/remove` |

## 玩家 REST API

`GET /api/game/energy/status`（我的能量）、`GET /api/game/energy/list`（可转化物品）、`POST /api/game/energy/convert`（物品→能量）、`POST /api/game/energy/exchange`（能量→物品）。

## 相关系统

- 插件能量值注册 → [插件开发](../dev/plugin-development)
- 物品价格 → [物品列表](./item-list)
