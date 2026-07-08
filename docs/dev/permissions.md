# 权限系统

修仙世界服务端采用 RBAC（基于角色的访问控制）模型进行权限管理。

## 权限模型

### 用户 - 角色 - 权限关系

```
用户 (Player)
    └── 关联 ──→ 角色 (Role)
                    └── 包含 ──→ 权限 (Permission)
```

### 权限等级

| 等级 | 角色 | 说明 |
|------|------|------|
| 0 | guest | 游客，未登录用户 |
| 1 | player | 普通玩家 |
| 2 | vip | VIP 玩家 |
| 3 | moderator | 版主，可管理聊天和部分功能 |
| 4 | admin | 管理员，拥有全部权限 |
| 5 | owner | 所有者，最高权限 |

---

## 权限列表

### 玩家权限

| 权限标识 | 说明 | 默认角色 |
|----------|------|----------|
| `game.player.create` | 创建角色 | player |
| `game.player.info` | 查看自己的信息 | player |
| `game.player.update` | 修改自己的信息 | player |
| `game.cultivation.start` | 开始修炼 | player |
| `game.cultivation.stop` | 停止修炼 | player |
| `game.breakthrough` | 突破境界 | player |
| `game.exploration` | 游历探索 | player |
| `game.secret_realm.enter` | 进入秘境 | player |
| `game.item.use` | 使用物品 | player |
| `game.equipment.equip` | 装备物品 | player |
| `game.equipment.enhance` | 强化装备 | player |
| `game.skill.learn` | 学习技能 | player |
| `game.technique.learn` | 学习功法 | player |
| `game.crafting.craft` | 制造物品 | player |
| `game.market.list` | 上架物品 | player |
| `game.market.buy` | 购买物品 | player |
| `game.friend.add` | 添加好友 | player |
| `game.friend.remove` | 删除好友 | player |
| `game.chat.world` | 世界聊天 | player |
| `game.chat.private` | 私聊 | player |
| `game.pvp.challenge` | PVP挑战 | player |
| `game.title.equip` | 装备称号 | player |
| `game.team.create` | 创建队伍 | player |
| `game.team.join` | 加入队伍 | player |
| `game.sect.create` | 创建宗门 | player |
| `game.sect.join` | 加入宗门 | player |

### VIP 权限

| 权限标识 | 说明 |
|----------|------|
| `game.vip.bonus` | 获取VIP加成 |
| `game.vip.skip_cooldown` | 跳过冷却时间 |
| `game.vip.double_reward` | 双倍奖励 |

### 版主权限

| 权限标识 | 说明 |
|----------|------|
| `admin.chat.mute` | 禁言玩家 |
| `admin.chat.kick` | 踢出频道 |
| `admin.chat.clear` | 清理聊天记录 |
| `admin.report.handle` | 处理举报 |
| `admin.player.warn` | 警告玩家 |

### 管理员权限

| 权限标识 | 说明 |
|----------|------|
| `admin.player.view` | 查看玩家信息 |
| `admin.player.ban` | 封禁玩家 |
| `admin.player.unban` | 解封玩家 |
| `admin.player.reset` | 重置玩家数据 |
| `admin.server.shutdown` | 关闭服务器 |
| `admin.server.reload` | 重新加载配置 |
| `admin.economy.add` | 添加灵石 |
| `admin.economy.set` | 修改灵石 |
| `admin.item.give` | 给予物品 |
| `admin.player.setattr` | 修改属性 |
| `admin.player.setrealm` | 修改境界 |
| `admin.broadcast` | 发送广播 |
| `admin.online.view` | 查看在线列表 |
| `admin.qq.bind` | 绑定QQ |
| `admin.qq.unbind` | 解绑QQ |
| `admin.sect.disband` | 解散宗门 |
| `admin.sect.war` | 强制宗门战 |

### 所有者权限

| 权限标识 | 说明 |
|----------|------|
| `admin.*` | 所有管理员权限 |
| `system.*` | 所有系统权限 |
| `plugin.*` | 所有插件权限 |

---

## API 接口

### 获取当前权限

```
GET /auth/permissions
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "role": "player",
    "permissions": [
      "game.player.create",
      "game.player.info",
      "game.cultivation.start"
    ]
  }
}
```

### 检查权限

```
GET /auth/check?permission=game.player.create
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "permission": "game.player.create",
    "granted": true
  }
}
```

### 管理员接口

#### 获取所有角色

```
GET /admin/roles
```

#### 获取角色权限

```
GET /admin/roles/{roleName}/permissions
```

#### 修改角色权限

```
POST /admin/roles/{roleName}/permissions
```

**请求体**:
```json
{
  "permissions": ["game.player.create", "game.player.info"]
}
```

#### 设置玩家角色

```
POST /admin/players/{playerId}/role
```

**请求体**:
```json
{
  "role": "vip"
}
```

---

## 权限检查机制

### 在代码中检查权限

```java
@PreAuthorize("hasPermission('game.player.create')")
@PostMapping("/game/player/create")
public ApiResponse createPlayer() {
    // 只有拥有 game.player.create 权限的用户才能访问
    return gameApi.createPlayer();
}
```

### 自定义权限注解

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('admin')")
public @interface AdminOnly {
}
```

---

## 权限配置

权限配置文件位于 `config/permissions.yml`：

```yaml
roles:
  player:
    level: 1
    permissions:
      - game.player.create
      - game.player.info
      - game.cultivation.start
      - game.cultivation.stop
      - game.breakthrough
      - game.exploration
      - game.item.use
      - game.equipment.equip
      - game.market.list
      - game.market.buy
      - game.friend.add
      - game.friend.remove
      - game.chat.world
      - game.chat.private
      - game.pvp.challenge
  
  vip:
    level: 2
    inherit: player
    permissions:
      - game.vip.bonus
      - game.vip.skip_cooldown
      - game.vip.double_reward
  
  admin:
    level: 4
    permissions:
      - admin.player.view
      - admin.player.ban
      - admin.player.unban
      - admin.server.shutdown
      - admin.economy.add
      - admin.item.give
      - admin.broadcast
```

---

## 注意事项

1. **权限继承**：高等级角色自动继承低等级角色的权限
2. **权限校验**：所有敏感操作必须进行权限校验
3. **最小权限原则**：只授予必要的最小权限
4. **日志记录**：所有权限变更操作都会记录日志
5. **权限缓存**：权限信息会缓存在 Redis 中，变更后需要刷新缓存