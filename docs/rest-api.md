# REST API

修仙世界提供完整的 REST API 接口，支持玩家认证、游戏操作和管理后台功能。

## 认证方式

### 用户认证
- 使用 JWT Token
- Token 放在 `Authorization` 头中
- 格式：`Bearer <token>`

### 管理员认证
- 使用独立的管理员 JWT Token
- 需要在配置文件中设置管理员账号密码

## 基础 API

### 用户注册

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "player@example.com",
  "password": "password123",
  "code": "123456"
}
```

### 用户登录

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "player@example.com",
  "password": "password123"
}
```

### 获取验证码

```
POST /api/auth/send-code
Content-Type: application/json

{
  "email": "player@example.com"
}
```

## 游戏 API

### 玩家信息

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/player/status` | `game.player.info` | 获取玩家状态 |
| GET | `/api/game/player/info` | `game.player.info` | 获取玩家详细信息 |

### 背包系统

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/item/backpack` | `game.item.view` | 查看背包 |
| POST | `/api/game/item/use` | `game.item.use` | 使用物品 |
| POST | `/api/game/item/equip` | `game.item.equip` | 装备物品 |
| POST | `/api/game/item/unequip` | `game.item.equip` | 卸下装备 |

### 修炼系统

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/cultivation/start` | `game.cultivation.start` | 开始修炼 |
| POST | `/api/game/cultivation/stop` | `game.cultivation.stop` | 停止修炼 |
| GET | `/api/game/cultivation/status` | `game.cultivation.view` | 修炼状态 |

### 境界突破

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/realm/breakthrough` | `game.realm.breakthrough` | 突破境界 |

### 农场系统

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/farm/plots` | `game.farm.view` | 查看农田状态 |
| POST | `/api/game/farm/plant` | `game.farm.plant` | 种植种子 |
| POST | `/api/game/farm/water` | `game.farm.water` | 浇水 |
| POST | `/api/game/farm/fertilize` | `game.farm.fertilize` | 施肥 |
| POST | `/api/game/farm/harvest` | `game.farm.harvest` | 收获 |
| POST | `/api/game/farm/clear` | `game.farm.clear` | 清理 |
| POST | `/api/game/farm/expand` | `game.farm.expand` | 扩建 |

### Buff 系统

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/buff` | `game.player.info` | 查看当前 Buff |

### 兑换码

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/game/redeem` | `game.redeem.code` | 使用兑换码 |

### 坊市交易

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/economy/market/listings` | `game.market.view` | 查看挂单 |
| POST | `/api/game/economy/market/list` | `game.market.list` | 挂单出售 |
| POST | `/api/game/economy/market/buy` | `game.market.buy` | 购买物品 |
| DELETE | `/api/game/economy/market/listings/{id}` | `game.market.manage` | 撤回挂单 |

### 排行榜

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/game/ranking/realm` | `game.ranking.view` | 境界榜 |
| GET | `/api/game/ranking/power` | `game.ranking.view` | 战力榜 |
| GET | `/api/game/ranking/wealth` | `game.ranking.view` | 财富榜 |

## 管理后台 API

### 管理员登录

```
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### 玩家管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/players` | `admin.players.view` | 查看玩家列表 |
| GET | `/api/admin/players/{playerName}` | `admin.players.view` | 查看玩家详情 |
| POST | `/api/admin/players/{playerName}/edit` | `admin.players.edit` | 编辑玩家 |
| POST | `/api/admin/items/give` | `admin.items.give` | 发放物品 |

### 兑换码管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/admin/redeem/generate` | `admin.redeem.manage` | 生成兑换码 |
| GET | `/api/admin/redeem/list` | `admin.redeem.view` | 查看兑换码 |
| DELETE | `/api/admin/redeem/{code}` | `admin.redeem.manage` | 删除兑换码 |

### 黑名单管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/blacklist` | `admin.blacklist.view` | 查看黑名单 |
| POST | `/api/admin/blacklist` | `admin.blacklist.manage` | 添加黑名单 |
| DELETE | `/api/admin/blacklist/{qqNumber}` | `admin.blacklist.manage` | 移除黑名单 |