# 内部接口文档

修仙世界服务端采用分层架构，核心业务逻辑封装在 Service 层。本文档记录程序内部的核心服务类及其方法接口。

## 服务层架构

```
Controller层 (REST API / WebSocket / QQ Bot)
    |
    v
Service层 (PlayerService | CombatService | ItemService | SectService)
    |
    v
Repository层 (DatabaseManager | ItemRegistry)
    |
    v
数据库 (SQLite / MySQL)
```

---

## PlayerService

玩家管理核心服务，负责玩家数据的增删改查。

### 类路径

```
com.mtxgdn.game.service.PlayerService
```

### 核心方法

#### 获取玩家信息

```java
PlayerInfo getPlayerByUserId(long userId);
Player getPlayerById(long playerId);
PlayerInfo getPlayerInfoById(long playerId);
Player getPlayerRaw(long userId);
```

#### 创建玩家

```java
PlayerInfo createPlayer(long userId, String name);
```

创建玩家时自动随机抽取灵根，并根据灵根属性计算初始属性值。

#### 更新玩家数据

```java
void updatePlayer(long playerId, Player player);
void addExperience(long playerId, long exp);
void addGold(long playerId, long amount);
void addHp(long playerId, int amount);
void addMp(long playerId, int amount);
void addAttack(long playerId, int amount);
void addDefense(long playerId, int amount);
void addSpeed(long playerId, int amount);
void addSpirit(long playerId, int amount);
```

#### 修炼系统

```java
void updateCultivationProgress(long playerId, int progress);
void setCultivating(long playerId, boolean cultivating);
```

#### 玩家查询

```java
List<PlayerInfo> getAllPlayers(int limit, int offset);
List<PlayerInfo> searchPlayersByName(String name, int limit, int offset);
List<PlayerInfo> getTopByRealm(int limit);
List<PlayerInfo> getTopByPower(int limit);
List<PlayerInfo> getTopByWealth(int limit);
int getPlayerCount();
boolean existsByUserId(long userId);
```

#### 属性计算

```java
int getFinalAttack(Player player);
int getFinalDefense(Player player);
int getFinalMaxHp(Player player);
int getFinalMaxMp(Player player);
int getFinalSpeed(Player player);
int getFinalSpirit(Player player);
double getFinalCultivationSpeed(Player player);
double getFinalExpBonus(Player player);
double getFinalDropRateBonus(Player player);
```

#### 疗伤系统

```java
Map<String, Object> healPlayer(long playerId);
```

消耗灵石恢复全部生命和法力，费用为 (境界 + 1) * 50 灵石。

---

## CombatService

战斗系统服务，负责 PVP 切磋和 PVE 战斗逻辑。

### 类路径

```
com.mtxgdn.game.service.CombatService
```

### 核心方法

#### PVP 切磋

```java
CombatResult createChallenge(long challengerPlayerId, long targetPlayerId);
CombatResult acceptChallenge(long playerId);
String rejectChallenge(long targetPlayerId);
CombatResult pvpChallenge(long challengerPlayerId, long targetPlayerId);
```

#### PVE 战斗

```java
PveCombatResult pveFight(long playerId, Monster monster);
```

#### Boss 团战

```java
RaidCombatResult raidBossFight(List<Long> playerIds, List<BossForm> bossForms);
```

支持 Boss 多形态切换机制，玩家属性根据形态被削弱。

---

## ItemService

物品系统服务，负责背包管理、物品使用和装备系统。

### 类路径

```
com.mtxgdn.game.service.ItemService
```

### 核心方法

#### 添加物品

```java
boolean addItem(long playerId, String itemKey, long quantity);
boolean addItem(Connection conn, long playerId, String itemKey, long quantity);
boolean addItems(long playerId, Map<String, Long> items);
```

使用 upsert 机制，存在则累加，不存在则插入。支持事务内操作。

#### 移除物品

```java
boolean removeItem(long playerId, String itemKey, long quantity);
boolean removeItem(Connection conn, long playerId, String itemKey, long quantity);
boolean removeItems(long playerId, Map<String, Long> items);
```

原子操作，使用单条 SQL 完成检查加扣除，避免竞态条件。

#### 物品查询

```java
List<InventoryEntry> getInventory(long playerId);
long getItemCount(long playerId, String itemKey);
boolean hasItem(long playerId, String itemKey, long quantity);
```

#### 灵石便捷方法

```java
long getSpiritStoneCount(long playerId);
boolean addSpiritStones(long playerId, long amount);
boolean removeSpiritStones(long playerId, long amount);
```

#### 装备系统

```java
Map<String, Object> equipItem(long playerId, String itemKey, String slot);
Map<String, Object> unequipItem(long playerId, String slot);
String getEquippedItem(long playerId, String slot);
Map<String, String> getEquipment(long playerId);
```

装备槽位：weapon, armor, helmet, boots, accessory

#### 使用物品

```java
Map<String, Object> useItem(long playerId, String itemKey);
```

使用事务包裹，先执行物品效果，成功后再扣除物品。

---

## SectService

宗门系统服务，负责宗门创建、成员管理、仓库和宗门战。

### 类路径

```
com.mtxgdn.game.service.SectService
```

### 核心方法

#### 宗门查询

```java
List<Sect> getAllSects();
Sect getSectById(long sectId);
Sect getSectByName(String name);
Sect getPlayerSect(long playerId);
```

#### 创建宗门

```java
Map<String, Object> createSect(long playerId, String sectName, String description);
```

要求：境界达到金丹期以上，消耗 1000 灵石，宗门名称 2-8 个字符。

#### 成员管理

```java
List<SectMember> getSectMembers(long sectId);
SectMember getMember(long sectId, long playerId);
SectMember getPlayerMember(long playerId);
```

#### 申请管理

```java
Map<String, Object> applyToSect(long playerId, long sectId, String message);
List<SectApplication> getPendingApplications(long sectId);
Map<String, Object> approveApplication(long approverPlayerId, long applicationId, boolean approved);
```

#### 退出踢人

```java
Map<String, Object> leaveSect(long playerId);
Map<String, Object> kickMember(long kickerPlayerId, long targetPlayerId);
Map<String, Object> appointMember(long appointerPlayerId, long targetPlayerId, String newRole);
```

职位：LEADER, VICE_LEADER, ELDER, INNER_MEMBER, OUTER_MEMBER

#### 仓库系统

```java
List<SectWarehouseItem> getWarehouse(long sectId);
Map<String, Object> donateToWarehouse(long playerId, long sectId, String itemKey, int quantity);
Map<String, Object> withdrawFromWarehouse(long playerId, long sectId, String itemKey, int quantity);
```

#### 宗门升级

```java
Map<String, Object> levelUp(long playerId);
```

#### 宗主转让

```java
Map<String, Object> transferLeader(long fromPlayerId, long toPlayerId);
```

#### 宗门战

```java
Map<String, Object> declareWar(long attackerPlayerId, long defenderSectId);
```

---

## SkillService

技能系统服务，负责技能学习、熟练度管理。

### 类路径

```
com.mtxgdn.game.service.SkillService
```

### 核心方法

#### 技能查询

```java
Skill getSkillById(long skillId);
Skill findSkillByName(String name);
List<Skill> getAllSkills();
List<Skill> getPlayerSkills(long playerId);
Skill getPlayerSkill(long playerId, long skillId);
boolean hasSkill(long playerId, long skillId);
```

#### 学习技能

```java
Map<String, Object> learnSkill(long playerId, long skillId);
Map<String, Object> learnSkillFromBook(long playerId, long skillId);
```

#### 熟练度管理

```java
int getProficiencyForNextLevel(int currentLevel);
Map<String, Object> addProficiency(long playerId, long skillId, int amount);
```

熟练度公式：当前等级 * 100

---

## ExplorationService

探索系统服务，负责游历探索逻辑。

### 类路径

```
com.mtxgdn.game.service.ExplorationService
```

### 核心方法

```java
ExplorationResult explore(long userId);
```

冷却时间 60 秒（灵根可缩短），随机触发游历事件。

---

## 其他服务

| 服务类 | 路径 | 职责 |
|--------|------|------|
| BuffService | com.mtxgdn.game.service.BuffService | Buff效果管理 |
| ChatService | com.mtxgdn.game.service.ChatService | 聊天消息处理 |
| CraftingService | com.mtxgdn.game.service.CraftingService | 制造系统 |
| DailyService | com.mtxgdn.game.service.DailyService | 日常任务 |
| EconomyService | com.mtxgdn.game.service.EconomyService | 经济系统 |
| EnergyService | com.mtxgdn.game.service.EnergyService | 精力系统 |
| EnhanceService | com.mtxgdn.game.service.EnhanceService | 装备强化 |
| FarmService | com.mtxgdn.game.service.FarmService | 农场系统 |
| FriendService | com.mtxgdn.game.service.FriendService | 好友系统 |
| HeartDemonService | com.mtxgdn.game.service.HeartDemonService | 心魔系统 |
| MapService | com.mtxgdn.game.service.MapService | 地图系统 |
| NewbieGuideService | com.mtxgdn.game.service.NewbieGuideService | 新手引导 |
| OfflineRewardService | com.mtxgdn.game.service.OfflineRewardService | 离线奖励 |
| RealmService | com.mtxgdn.game.service.RealmService | 境界突破 |
| RedeemCodeService | com.mtxgdn.game.service.RedeemCodeService | 兑换码 |
| SecretRealmService | com.mtxgdn.game.service.SecretRealmService | 秘境探索 |
| TechniqueService | com.mtxgdn.game.service.TechniqueService | 功法系统 |
| TitleService | com.mtxgdn.game.service.TitleService | 称号系统 |
| TradeService | com.mtxgdn.game.service.TradeService | 交易系统 |
| TeamService | com.mtxgdn.game.service.TeamService | 队伍系统 |

---

## 数据访问层

### DatabaseManager

```java
Connection getConnection();
boolean isSqlite();
<T> T runTransaction(Function<Connection, T> action);
```

### ItemRegistry

```java
void register(Item item);
Item get(String key);
Item resolve(String key);
boolean contains(String key);
List<Item> getAll();
```

### ExplorationEventRegistry

```java
void register(ExplorationEvent event);
ExplorationEvent randomByWeight(Random random);
```

---

## 事务处理规范

服务层方法遵循以下事务规范：

1. 读操作：不需要事务，直接使用 DatabaseManager.getConnection()
2. 写操作：使用 DatabaseManager.runTransaction() 包裹
3. 多表操作：必须使用事务，确保数据一致性
4. 嵌套事务：内部方法接收 Connection 参数，由调用方管理事务

示例：

```java
public Map<String, Object> useItem(long playerId, String itemKey) {
    return DatabaseManager.runTransaction(conn -> {
        // 1. 检查物品
        // 2. 执行效果
        // 3. 扣除物品
        return result;
    });
}

public boolean addItem(Connection conn, long playerId, String itemKey, long quantity) {
    // 使用外部传入的连接，不开启新事务
}
```