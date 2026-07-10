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

## RealmService

境界突破服务，负责玩家境界突破逻辑。

### 类路径

```
com.mtxgdn.game.service.RealmService
```

### 核心方法

```java
RealmBreakthroughResult tryBreakthrough(long userId);
```

- 检查玩家灵力、灵石是否达到突破条件
- 消耗灵石，处理突破成功/失败逻辑
- 灵根品级影响成功率，心魔考验影响结果
- 返回突破结果：成功/失败/心魔等

---

## EnhanceService

装备强化服务，负责装备的强化升级。

### 类路径

```
com.mtxgdn.game.service.EnhanceService
```

### 核心方法

```java
int getEnhanceLevel(long playerId, String slot);
String getEquippedItemKey(long playerId, String slot);
Map<String, Object> enhanceItem(long playerId, String slot);
static int[] getEnhanceStatBonus(int enhanceLevel);
```

- 装备强化，消耗金币和强化石
- 强化等级越高成功率越低
- 失败可能降级或不变

---

## BuffService

Buff 效果管理服务，负责为玩家添加/移除各类增益效果。

### 类路径

```
com.mtxgdn.game.service.BuffService
```

### 核心方法

```java
void addBuff(long playerId, String buffId, int attackBonus, int defenseBonus,
             int speedBonus, int spiritBonus, int durationSeconds);
void removeBuff(long playerId, String buffId);
Map<String, Object> getActiveBuffs(long playerId);
void clearAllBuffs(long playerId);
int getTotalAttackBonus(long playerId);
int getTotalDefenseBonus(long playerId);
int getTotalSpeedBonus(long playerId);
int getTotalSpiritBonus(long playerId);
```

---

## FarmService

农场系统服务，负责灵田种植、浇水、施肥和收获。

### 类路径

```
com.mtxgdn.game.service.FarmService
```

### 核心方法

```java
List<FarmPlot> getPlots(long playerId);
Map<String, Object> plant(long playerId, int plotIndex, String seedKey);
Map<String, Object> water(long playerId, int plotIndex);
Map<String, Object> fertilize(long playerId, int plotIndex);
Map<String, Object> harvest(long playerId, int plotIndex);
Map<String, Object> clearPlot(long playerId, int plotIndex);
Map<String, Object> expandPlot(long playerId);
```

---

## HeartDemonService

心魔系统服务，负责闭关修炼时的心魔考验。

### 类路径

```
com.mtxgdn.game.service.HeartDemonService
```

### 核心方法

```java
HeartDemonResult processCultivation(long playerId, long rawExpGained, int elapsedSeconds);
```

- 闭关修炼时触发心魔考验
- 灵根品级影响心魔抗性
- 成功则获得额外灵力加成

---

## SecretRealmService

秘境探索服务，负责秘境区域发现和组队副本。

### 类路径

```
com.mtxgdn.game.service.SecretRealmService
```

### 核心方法

```java
List<SecretRealm> getAvailableAreas(long userId);
SecretRealmResult enterSecretRealm(long userId, String areaName);
SecretRealmResult enterRaid(long leaderId, String areaName);
```

---

## TechniqueService

功法系统服务，负责功法学习、装备和升级。

### 类路径

```
com.mtxgdn.game.service.TechniqueService
```

### 核心方法

```java
Technique getTechniqueById(long techniqueId);
List<Technique> getAllTechniques();
List<Technique> getPlayerTechniques(long playerId);
List<Technique> getEquippedTechniques(long playerId);
boolean hasTechnique(long playerId, long techniqueId);
Map<String, Object> learnTechnique(long playerId, long techniqueId);
Map<String, Object> equipTechnique(long playerId, long techniqueId);
Map<String, Object> unequipTechnique(long playerId, long techniqueId);
Map<String, Object> upgradeTechnique(long playerId, long techniqueId);
void addProficiency(long playerId, long techniqueId, int amount);
```

---

## TitleService

称号系统服务，负责称号的授予、撤销和装备。

### 类路径

```
com.mtxgdn.game.service.TitleService
```

### 核心方法

```java
Map<String, Object> grantTitle(long playerId, String titleKey);
Map<String, Object> revokeTitle(long playerId, String titleKey);
Map<String, Object> equipTitle(long playerId, String titleKey);
Map<String, Object> unequipTitle(long playerId);
List<Map<String, Object>> getPlayerTitles(long playerId);
Title getEquippedTitle(long playerId);
boolean hasTitle(long playerId, String titleKey);
```

---

## TradeService

交易系统服务，负责玩家间物品交易。

### 类路径

```
com.mtxgdn.game.service.TradeService
```

### 核心方法

```java
Map<String, Object> listItem(long playerId, String itemKey, int quantity, long priceSpiritStones);
Map<String, Object> buyItem(long buyerPlayerId, long listingId);
Map<String, Object> cancelListing(long playerId, long listingId);
List<TradeListing> getActiveListings();
List<TradeListing> getPlayerListings(long playerId);
```

---

## TeamService

队伍系统服务，负责队伍的创建、成员管理和解散。

### 类路径

```
com.mtxgdn.game.service.TeamService
```

> TeamService 是单例模式。

### 核心方法

```java
Team createTeam(long leaderId);
boolean invitePlayer(long inviterId, long targetId);
Team acceptInvite(long playerId);
void declineInvite(long playerId);
boolean leaveTeam(long playerId);
void dissolveTeam(long teamId);
boolean isInTeam(long playerId);
Team getTeam(long playerId);
```

---

## ChatService

聊天消息服务，负责世界频道和私聊消息。

### 类路径

```
com.mtxgdn.game.service.ChatService
```

### 核心方法

```java
ChatMessage sendWorldMessage(long senderPlayerId, String senderName, String content);
ChatMessage sendPrivateMessage(long senderPlayerId, String senderName,
                               long receiverPlayerId, String content);
List<ChatMessage> getWorldMessages(int limit);
List<ChatMessage> getPrivateMessages(long playerId1, long playerId2, int limit);
```

---

## MapService

地图系统服务，负责地图位置查询和玩家移动。

### 类路径

```
com.mtxgdn.game.service.MapService
```

### 核心方法

```java
MapLocation getLocation(long id);
MapLocation getLocationByName(String name);
List<MapLocation> getAllLocations();
List<MapLocation> getLocationsByRegion(String region);
long getPlayerLocationId(long playerId);
Map<String, Object> travel(long playerId, long targetLocationId);
Map<String, Object> getPlayerSurroundings(long playerId);
```

---

## FriendService

好友系统服务，负责好友请求、添加和删除。

### 类路径

```
com.mtxgdn.game.service.FriendService
```

### 核心方法

```java
Friend sendRequest(long playerId, long targetPlayerId);
boolean acceptRequest(long playerId, long requesterPlayerId);
boolean removeFriend(long playerId, long friendPlayerId);
List<Friend> getFriends(long playerId);
List<Friend> getPendingRequests(long playerId);
```

---

## EconomyService

经济系统服务，负责签到、回收、灵石转换和银行系统。

### 类路径

```
com.mtxgdn.game.service.EconomyService
```

### 核心方法

```java
Map<String, Object> signIn(long playerId);
Map<String, Object> recycleItem(long playerId, String itemKey, int quantity);
Map<String, Object> boostCultivation(long playerId, int stonesToBurn);
Map<String, Object> exchangeGoldToStones(long playerId, long goldAmount);
Map<String, Object> exchangeStonesToGold(long playerId, long stoneAmount);
Map<String, Object> bankDeposit(long playerId, String type, long amount);
Map<String, Object> bankWithdraw(long playerId, long depositId);
Map<String, Object> getBankInfo(long playerId);
```

---

## DailyService

日常任务服务，负责每日修炼和天象查询。

### 类路径

```
com.mtxgdn.game.service.DailyService
```

### 核心方法

```java
CelestialPhenomenon getTodayPhenomenon();
Map<String, Object> doMorningCultivation(long playerId);
Map<String, Object> getDailyInfo(long playerId);
```

---

## EnergyService

精力系统服务，用于限制每日操作次数。

### 类路径

```
com.mtxgdn.game.service.EnergyService
```

### 核心方法

```java
static void registerItemEnergy(String itemKey, long energyValue);
long getEnergy(long playerId);
void addEnergy(long playerId, long amount);
boolean removeEnergy(long playerId, long amount);
```

- 精力系统，用于限制每日操作次数
- 物品可配置精力值

---

## OfflineRewardService

离线奖励服务，负责玩家上线时结算离线修炼收益。

### 类路径

```
com.mtxgdn.game.service.OfflineRewardService
```

### 核心方法

```java
OfflineRewardResult processOfflineRewards(long userId);
```

- 玩家上线时结算离线修炼收益
- 根据离线时长和境界计算奖励

---

## UserService

用户管理服务，负责用户注册、登录和密码修改。

### 类路径

```
com.mtxgdn.service.UserService
```

### 核心方法

#### 用户注册

```java
Response register(String username, String rawPassword, String email, String code);
```

- 支持邮箱验证码注册
- 当 `verify_code.enabled=true` 时必须提供邮箱和验证码
- 邮箱唯一性校验：一个邮箱只能注册一个用户
- 邮箱类型限制：仅允许白名单域名（qq.com, 163.com, 126.com, gmail.com, outlook.com, hotmail.com）

#### 用户登录

```java
Response login(String username, String rawPassword);
User authenticate(String username, String rawPassword);
```

#### 修改密码

```java
Response changePassword(long userId, String oldPassword, String newPassword);
```

#### 删除用户

```java
Response deleteUser(long userId);
```

#### 更新邮箱

```java
void updateUserEmail(long userId, String email);
String getUserEmail(long userId);
```

- updateUserEmail：仅当用户邮箱为空或已相同时才更新，避免覆盖已有邮箱；支持email为null的情况
- getUserEmail：获取用户当前邮箱

---

## VerificationCodeService

验证码服务，负责验证码的生成、存储和验证。

### 类路径

```
com.mtxgdn.service.VerificationCodeService
```

### 核心方法

#### 生成并存储验证码

```java
String generateAndStoreCode(String email);
```

- 生成6位数字验证码
- 有效期5分钟
- 速率限制：默认60秒内同一邮箱只能发送一次

#### 验证验证码

```java
boolean verifyCode(String email, String code);
```

#### 检查是否可以发送

```java
boolean canSendCode(String email);
```

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

---

## Item 系统扩展

### 物品注册

物品通过 `com.mtxgdn.game.item.ItemScanner` 自动扫描 `data.mtxgdn.item` 包下所有继承 `Item` 的 public 类（需有无参构造），扫描到即可注册。

创建自定义物品只需在该包下新建类：

```java
package data.mtxgdn.item;
import com.mtxgdn.game.item.*;

public class MyItem extends Item {
    public MyItem() {
        super("mtxgdn", "my_item_key", ItemType.CONSUMABLE, ItemRarity.RARE, 99, 100, true, 0, new MyEffect());
    }
}
```

### 秘境区域

秘境通过 `SecretRealmScanner` 自动扫描 `data.mtxgdn.secretrealm` 包下所有继承 `SecretRealm` 的类，扫描到即可注册。

```java
package data.mtxgdn.secretrealm;
import com.mtxgdn.game.secretrealm.*;

public class MyRealm extends SecretRealm {
    public MyRealm() {
        super("mtxgdn", "my_realm", 3, 300000, true);
    }
}
```

### 游历事件

游历事件通过 `ExplorationEventScanner` 自动扫描 `data.mtxgdn.exploration` 包下所有继承 `ExplorationEvent` 的类，扫描到即可注册。

```java
package data.mtxgdn.exploration;
import com.mtxgdn.game.exploration.*;

public class MyExplorationEvent extends ExplorationEvent {
    public MyExplorationEvent() {
        super("mtxgdn", "my_event", 50, "发现了一处神秘遗迹");
    }
}
```