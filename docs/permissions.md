# 权限系统

项目采用 RBAC + 细粒度权限码的双层权限模型。

## 角色层级

| 角色 | 级别 | 说明 |
|------|------|------|
| `SUPER_ADMIN` | 100 | 超级管理员，拥有所有权限 |
| `ADMIN` | 90 | 管理员，拥有大部分管理权限 |
| `MODERATOR` | 80 | 版主，拥有部分管理权限 |
| `PLAYER` | 10 | 普通玩家，拥有游戏基础权限 |
| `GUEST` | 0 | 访客，仅拥有浏览权限 |

## 权限码列表

### 游戏权限

| 权限码 | 说明 | 默认角色 |
|--------|------|----------|
| `game.player.info` | 查看玩家信息 | PLAYER |
| `game.item.view` | 查看物品 | PLAYER |
| `game.item.use` | 使用物品 | PLAYER |
| `game.item.equip` | 装备物品 | PLAYER |
| `game.cultivation.start` | 开始修炼 | PLAYER |
| `game.cultivation.stop` | 停止修炼 | PLAYER |
| `game.cultivation.view` | 查看修炼状态 | PLAYER |
| `game.realm.breakthrough` | 突破境界 | PLAYER |
| `game.farm.view` | 查看农场 | PLAYER |
| `game.farm.plant` | 种植 | PLAYER |
| `game.farm.water` | 浇水 | PLAYER |
| `game.farm.fertilize` | 施肥 | PLAYER |
| `game.farm.harvest` | 收获 | PLAYER |
| `game.farm.clear` | 清理 | PLAYER |
| `game.farm.expand` | 扩建 | PLAYER |
| `game.market.view` | 查看坊市 | PLAYER |
| `game.market.list` | 挂单 | PLAYER |
| `game.market.buy` | 购买 | PLAYER |
| `game.market.manage` | 管理挂单 | PLAYER |
| `game.ranking.view` | 查看排行榜 | PLAYER |
| `game.redeem.code` | 使用兑换码 | PLAYER |

### 社交权限

| 权限码 | 说明 | 默认角色 |
|--------|------|----------|
| `game.friend.add` | 添加好友 | PLAYER |
| `game.friend.remove` | 删除好友 | PLAYER |
| `game.friend.chat` | 好友聊天 | PLAYER |
| `game.sect.create` | 创建宗门 | PLAYER |
| `game.sect.join` | 加入宗门 | PLAYER |
| `game.sect.manage` | 管理宗门 | ADMIN |

### 战斗权限

| 权限码 | 说明 | 默认角色 |
|--------|------|----------|
| `game.combat.pvp` | PVP 对战 | PLAYER |
| `game.combat.pve` | PVE 战斗 | PLAYER |
| `game.exploration.start` | 开始游历 | PLAYER |
| `game.secretrealm.enter` | 进入秘境 | PLAYER |

### 管理权限

| 权限码 | 说明 | 默认角色 |
|--------|------|----------|
| `admin.players.view` | 查看玩家 | ADMIN |
| `admin.players.edit` | 编辑玩家 | ADMIN |
| `admin.items.give` | 发放物品 | ADMIN |
| `admin.redeem.view` | 查看兑换码 | ADMIN |
| `admin.redeem.manage` | 管理兑换码 | ADMIN |
| `admin.blacklist.view` | 查看黑名单 | ADMIN |
| `admin.blacklist.manage` | 管理黑名单 | ADMIN |
| `admin.server.manage` | 服务器管理 | SUPER_ADMIN |
| `admin.debug` | 调试指令 | ADMIN |

## 权限继承

### 角色继承
高等级角色自动继承低等级角色的所有权限。

### 权限前缀
- `game.*` 前缀权限自动授予 PLAYER 角色
- `qq.*` 前缀权限自动授予 PLAYER 角色
- `admin.*` 前缀权限需要手动分配

## 权限检查

### 代码中的权限检查

```java
@RequirePermission("game.item.use")
public Response useItem(String itemKey) {
    // 使用物品逻辑
}
```

### API 请求中的权限检查
每个 API 请求都会经过 `PermissionFilter` 过滤，检查用户是否拥有所需权限。