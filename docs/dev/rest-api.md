# REST API 接口文档

修仙世界游戏服务端提供完整的 RESTful API，支持玩家管理、游戏系统操作、社交互动等功能。

## 基础信息

- **基础 URL**: `http://<host>:<port>/api`
- **认证方式**: Bearer Token（在请求头 `Authorization` 中携带）
- **数据格式**: JSON
- **响应格式**: `{ "success": boolean, "message": string, "data": any }`

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或Token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 玩家管理

### 获取玩家信息

```
GET /game/player
```

**响应示例**:
```json
{
  "success": true,
  "message": "",
  "data": {
    "id": 1,
    "name": "修仙者",
    "level": 5,
    "realm": "练气期",
    "spiritStones": 1000,
    "hp": 100,
    "maxHp": 100,
    "mp": 80,
    "maxMp": 80,
    "attack": 50,
    "defense": 30,
    "speed": 20,
    "critRate": 5,
    "critDamage": 150
  }
}
```

### 创建角色

```
POST /game/player/create
```

**请求体**:
```json
{
  "name": "玩家名称"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "角色创建成功",
  "data": {
    "playerId": 1,
    "spiritualRoot": "金灵根",
    "realm": "练气一层"
  }
}
```

---

## 境界突破

### 突破境界

```
POST /game/realm/breakthrough
```

**响应示例**:
```json
{
  "success": true,
  "message": "突破成功！恭喜进入筑基期",
  "data": {
    "oldRealm": "练气期",
    "newRealm": "筑基期",
    "bonus": {
      "hp": 200,
      "attack": 50
    }
  }
}
```

### 获取境界配置

```
GET /game/realm/config
```

---

## 修炼系统

### 开始修炼

```
POST /game/cultivate/start
```

### 停止修炼

```
POST /game/cultivate/stop
```

---

## 战斗系统

### PVP挑战

```
POST /game/pvp/challenge
```

**请求体**:
```json
{
  "targetPlayerId": 2
}
```

---

## 探索系统

### 游历探索

```
POST /game/exploration
```

**响应示例**:
```json
{
  "success": true,
  "message": "游历发现了一座古老的遗迹",
  "data": {
    "event": "发现遗迹",
    "rewards": [
      { "itemKey": "spirit_stone", "quantity": 500 },
      { "itemKey": "ancient_scroll", "quantity": 1 }
    ]
  }
}
```

### 获取秘境区域

```
GET /game/secret_realm/areas
```

### 进入秘境

```
POST /game/secret_realm/enter
```

**请求体**:
```json
{
  "area": "万妖谷"
}
```

---

## 物品系统

### 使用物品

```
POST /game/item/use
```

**请求体**:
```json
{
  "itemKey": "healing_pill"
}
```

### 获取背包

```
GET /game/inventory
```

### 获取物品注册表

```
GET /game/item/registry
```

---

## 装备系统

### 获取装备

```
GET /game/equipment
```

### 装备物品

```
POST /game/equipment/equip
```

**请求体**:
```json
{
  "itemKey": "sword_001",
  "slot": "weapon"
}
```

**装备槽位**: `weapon`, `armor`, `helmet`, `boots`, `accessory`

### 卸下装备

```
POST /game/equipment/unequip
```

**请求体**:
```json
{
  "slot": "weapon"
}
```

### 强化装备

```
POST /game/equipment/enhance
```

**请求体**:
```json
{
  "slot": "weapon"
}
```

---

## 技能系统

### 获取技能列表

```
GET /game/skills
```

### 获取我的技能

```
GET /game/skill/my
```

### 学习技能

```
POST /game/skill/learn
```

**请求体**:
```json
{
  "skillId": 1
}
```

---

## 功法系统

### 获取功法列表

```
GET /game/techniques
```

### 获取我的功法

```
GET /game/technique/my
```

### 学习功法

```
POST /game/technique/learn
```

**请求体**:
```json
{
  "techniqueId": 1
}
```

### 装备功法

```
POST /game/technique/equip
```

**请求体**:
```json
{
  "techniqueId": 1
}
```

### 升级功法

```
POST /game/technique/upgrade
```

**请求体**:
```json
{
  "techniqueId": 1
}
```

---

## 制造系统

### 获取配方

```
GET /game/crafting/recipes?category=alchemy
```

**分类**: `alchemy`（炼丹）, `crafting`（炼器）

### 制造物品

```
POST /game/crafting/craft
```

**请求体**:
```json
{
  "recipeId": 1
}
```

---

## 坊市系统

### 获取市场列表

```
GET /game/market
```

### 上架物品

```
POST /game/market/list
```

**请求体**:
```json
{
  "itemKey": "healing_pill",
  "quantity": 10,
  "priceSpiritStones": 500
}
```

### 购买物品

```
POST /game/market/buy
```

**请求体**:
```json
{
  "listingId": 1
}
```

### 取消上架

```
POST /game/market/cancel
```

**请求体**:
```json
{
  "listingId": 1
}
```

### 获取我的上架

```
GET /game/market/my_listings
```

---

## 社交系统

### 获取好友列表

```
GET /game/friend/list
```

### 获取好友申请

```
GET /game/friend/pending
```

### 添加好友

```
POST /game/friend/add
```

**请求体**:
```json
{
  "targetPlayerId": 2
}
```

### 接受好友

```
POST /game/friend/accept
```

**请求体**:
```json
{
  "requesterPlayerId": 2
}
```

### 删除好友

```
POST /game/friend/remove
```

**请求体**:
```json
{
  "friendPlayerId": 2
}
```

---

## 宗门系统

### 创建宗门

```
POST /game/sect/create
```

**请求体**:
```json
{
  "name": "天道宗",
  "description": "修仙正道第一宗"
}
```

### 加入宗门

```
POST /game/sect/join/{sectId}
```

### 获取宗门成员

```
GET /game/sect/members
```

### 获取宗门申请

```
GET /game/sect/applications
```

### 审批申请

```
POST /game/sect/approve/{appId}
POST /game/sect/reject/{appId}
```

### 离开宗门

```
POST /game/sect/leave
```

### 踢出成员

```
POST /game/sect/kick/{targetPlayerId}
```

### 任命职位

```
POST /game/sect/appoint
```

**请求体**:
```json
{
  "targetPlayerId": 2,
  "role": "elder"
}
```

**职位**: `leader`（宗主）, `elder`（长老）, `member`（成员）

### 宗门仓库

```
GET /game/sect/warehouse
POST /game/sect/donate
POST /game/sect/take
```

### 宗门升级

```
POST /game/sect/levelup
```

### 宗门宣战

```
POST /game/sect/war/{targetSectId}
```

### 获取宗门排行榜

```
GET /game/sect/top
```

---

## 称号系统

### 获取所有称号

```
GET /game/title/all
```

### 获取我的称号

```
GET /game/title/my
```

### 获取当前称号

```
GET /game/title/active
```

### 装备称号

```
POST /game/title/equip
```

**请求体**:
```json
{
  "titleKey": "first_blood"
}
```

### 卸下称号

```
POST /game/title/unequip
```

---

## 队伍系统

### 创建队伍

```
POST /game/team/create
```

### 邀请玩家

```
POST /game/team/invite
```

**请求体**:
```json
{
  "targetPlayerId": 2
}
```

### 接受邀请

```
POST /game/team/accept
```

### 离开队伍

```
POST /game/team/leave
```

### 获取队伍信息

```
GET /game/team/info
```

---

## 聊天系统

### 获取世界聊天

```
GET /game/chat/world?limit=20
```

### 获取私聊记录

```
GET /game/chat/private/{targetPlayerId}?limit=20
```

### 发送世界聊天

```
POST /game/chat/world
```

**请求体**:
```json
{
  "content": "大家好！"
}
```

### 发送私聊

```
POST /game/chat/private
```

**请求体**:
```json
{
  "targetPlayerId": 2,
  "content": "私聊内容"
}
```

---

## 排行榜

### 获取排行榜

```
GET /game/rank?type=realm&limit=50
```

**类型**: `realm`（境界）, `spirit_stones`（灵石）, `attack`（攻击）

---

## 地图系统

### 获取周边地图

```
GET /game/map
```

### 移动到指定位置

```
POST /game/map/travel/{locationId}
```

### 获取所有地点

```
GET /game/map/locations
```

---

## 日常系统

### 获取日常信息

```
GET /game/daily
```

### 晨间修炼

```
POST /game/daily/morning_cultivation
```

---

## 其他

### 获取服务器状态

```
GET /game/status
```

### 搜索玩家

```
GET /game/players/search?name=xxx
```

### 获取所有玩家

```
GET /game/players?limit=100&offset=0
```

### 获取灵根信息

```
GET /game/spiritual_roots
```

---

## 新人奖励配置

### 获取新人奖励配置

```
GET /admin/newbie-reward/config
```

**权限**: `admin.config.manage`

**响应示例**:
```json
{
  "code": 200,
  "enabled": true,
  "goldReward": 1000,
  "spiritStoneReward": 100,
  "spiritStoneGrade": 0,
  "items": [
    { "itemKey": "healing_pill", "quantity": 10 },
    { "itemKey": "mana_pill", "quantity": 10 }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| enabled | boolean | 是否启用新人奖励 |
| goldReward | long | 金币奖励数量 |
| spiritStoneReward | long | 灵石奖励数量 |
| spiritStoneGrade | int | 灵石等级（0-下品，1-中品，2-上品，3-极品） |
| items | array | 物品奖励列表 |

### 更新新人奖励配置

```
POST /admin/newbie-reward/config
```

**权限**: `admin.config.manage`

**请求体**:
```json
{
  "enabled": true,
  "goldReward": 1000,
  "spiritStoneReward": 100,
  "spiritStoneGrade": 0,
  "items": [
    { "itemKey": "healing_pill", "quantity": 10 },
    { "itemKey": "mana_pill", "quantity": 10 }
  ]
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "配置保存成功"
}
```