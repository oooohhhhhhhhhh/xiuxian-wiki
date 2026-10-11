# 称号系统

称号是**全局唯一的单件"装饰+加成"**：一个角色同一时间只能装备 1 个称号，装备后提供六维属性与四类倍率加成
（修炼速度、经验、掉落率），并在 `/状态` 中显示在角色信息最前面。

- 玩法模块：`title`（`built_in_plugins.title`，默认启用）
- 数据表：`player_titles`（角色已获得称号与装备状态）
- 称号定义：`com.mtxgdn.game.title.TitleRegistry`（**硬编码在代码中，不落库**）
- 服务：`com.mtxgdn.game.service.TitleService`
- 指令：`com.mtxgdn.onebot.command.player.TitleCommand`

::: tip 称号定义不存数据库
`TitleRegistry.init()` 在首次构造 `TitleService` 时把 19 个称号注册进内存 `LinkedHashMap`；
数据库只记录"某角色拥有哪个称号 key、是否装备"。因此调整称号数值只需改代码，无需改表。
:::

## 称号全表

参数顺序取自 `TitleRegistry.title(...)`：品质 → 境界要求 → 攻击/生命/法力/防御/速度/神识 → 修炼速度/经验/掉落率。
"获取条件"一列均为源码中的实际授予点；未标注自动授予点的称号只能通过管理端发放。

| 称号 | key | 品质 | 境界要求 | 获取条件 | 加成 |
| --- | --- | --- | --- | --- | --- |
| 初入仙途 | `beginner` | 普通 | 0 | **创建角色时自动授予** | 攻击 +3，法力 +5，经验 +5% |
| 剑道学徒 | `sword_student` | 普通 | 0 | **学会第一个技能时授予** | 攻击 +5，经验 +5% |
| 炼丹学徒 | `pill_apprentice` | 普通 | 0 | **炼丹次数 ≥ 1** | 生命 +10，经验 +5% |
| 擂台王者 | `arena_champion` | 稀有 | 2 | **PVP 胜场 ≥ 50** | 攻击 +8，生命 +15，法力 +10，防御 +8，神识 +2，经验 +8% |
| 秘境探险家 | `exploration_master` | 稀有 | 2 | **秘境探索次数 ≥ 20** | 攻击 +5，生命 +10，法力 +10，防御 +5，速度 +10，神识 +3，经验 +10%，掉落 +5% |
| 富甲一方 | `millionaire` | 稀有 | 3 | **灵石 ≥ 1,000,000** | 攻击 +10，生命 +15，法力 +15，防御 +5，速度 +5，神识 +5，经验 +10%，掉落 +5% |
| 剑道宗师 | `sword_master` | 珍贵 | 3 | **最终攻击 ≥ 500** | 攻击 +15，生命 +20，法力 +20，防御 +10，速度 +10，神识 +10，修炼 +5%，经验 +12%，掉落 +5% |
| 丹道尊者 | `alchemy_lord` | 珍贵 | 3 | **炼丹次数 ≥ 100** | 攻击 +10，生命 +50，法力 +20，防御 +8，速度 +5，神识 +8，修炼 +5%，经验 +15%，掉落 +5% |
| 万兽之主 | `beast_tamer` | 珍贵 | 3 | 无自动授予点（管理端发放） | 攻击 +12，生命 +30，法力 +25，防御 +10，速度 +8，神识 +8，经验 +12%，掉落 +8% |
| 破天者 | `sky_breaker` | 珍贵 | 4 | **大境界突破成功** | 攻击 +10，生命 +30，法力 +25，防御 +8，速度 +10，神识 +15，修炼 +5%，经验 +10% |
| 不朽尊者 | `immortal_venerable` | 史诗 | 5 | **境界 ≥ 化神期（5）** | 攻击 +20，生命 +50，法力 +40，防御 +15，速度 +15，神识 +20，修炼 +10%，经验 +20%，掉落 +10% |
| 逆天者 | `heaven_defier` | 史诗 | 8 | **境界 ≥ 渡劫期（8）** 或 **`/转世` 成功** | 攻击 +25，生命 +40，法力 +50，防御 +20，速度 +15，神识 +15，修炼 +10%，经验 +20%，掉落 +10% |
| 开山祖师 | `sect_founder` | 史诗 | 6 | **创建宗门** | 攻击 +15，生命 +80，法力 +60，防御 +15，速度 +20，神识 +25，修炼 +15%，经验 +20%，掉落 +10% |
| 大道之主 | `dao_lord` | 传说 | 9 | **境界 ≥ 真仙（9）** | 攻击 +30，生命 +100，法力 +80，防御 +25，速度 +25，神识 +30，修炼 +20%，经验 +30%，掉落 +15% |
| 混沌帝尊 | `chaos_emperor` | 传说 | 10 | **境界 = 金仙（10）** | 攻击 +40，生命 +150，法力 +100，防御 +30，速度 +30，神识 +40，修炼 +25%，经验 +35%，掉落 +20% |
| 首席弟子 | `senior_disciple` | 稀有 | 1 | **宗门入宗申请被通过** | 攻击 +12，生命 +20，法力 +20，防御 +8，速度 +5，神识 +5，修炼 +3%，经验 +8% |
| 迎春使者 | `event_spring` | 珍贵 | 2 | 2026 年春节活动限定（管理端发放） | 攻击 +20，生命 +50，法力 +30，防御 +10，速度 +10，神识 +10，修炼 +5%，经验 +15%，掉落 +10% |
| 捉虫达人 | `bug_hunter` | 史诗 | 1 | 无自动授予点（管理端发放） | 攻击 +5，生命 +20，法力 +20，防御 +5，速度 +5，神识 +5，修炼 +5%，经验 +10%，掉落 +5% |
| 副本征服者 | `raid_conqueror` | 稀有 | 1 | **团队 Boss 最后一击** | 攻击 +15，生命 +30，法力 +20，防御 +10，速度 +8，神识 +5，修炼 +5%，经验 +12%，掉落 +8% |

品质颜色（`Title.getRarityColor`）：普通 `§7`、稀有 `§a`、珍贵 `§9`、史诗 `§5`、传说 `§6`。

::: warning 境界要求不参与装备校验
`requiredRealm` 只在 `/称号 列表` 里展示（显示为 `境界要求: LvN`），
`TitleService.equipTitle` **不检查境界**——只要拥有该称号就能装备。
:::

## 获取途径

### 自动授予点

| 触发行为 | 授予方式 | 代码位置 |
| --- | --- | --- |
| 创建角色 | 直接授予 `beginner` | `PlayerService.createPlayer` |
| 学会第一个技能 | 直接授予 `sword_student`（失败静默） | `SkillService.learnSkill` |
| 大境界突破成功 | 直接授予 `sky_breaker` + `checkAndGrantTitles` | `RealmService`（两条突破成功路径都调用） |
| 转世成功 | 直接授予 `heaven_defier` | `ReincarnateCommand` |
| 创建宗门 | 直接授予 `sect_founder` | `SectService.createSect` |
| 入宗申请通过 | 直接授予 `senior_disciple` | `SectService.approveApplication` |
| 团队 Boss 最后一击 | 直接授予 `raid_conqueror` | `SecretRealmService`（Raid 结算） |
| PVP 获胜 | 胜场 +1 后执行 `checkAndGrantTitles` | `CombatService` |
| 秘境探索完成 | 探索计数 +1 后执行 `checkAndGrantTitles` | `SecretRealmService` |
| 炼丹完成 | 炼丹计数 +1 后执行 `checkAndGrantTitles` | `CraftingService` |
| 灵石价值达到 100 万 | 执行 `checkAndGrantTitles` | `ItemService`（灵石增加时判定） |

`checkAndGrantTitles` 一次性检查 10 个条件（幂等，已拥有则跳过）：

```java
// TitleService.checkAndGrantTitles
grantIf(granted, playerId, "immortal_venerable", player.getRealm() >= 5);
grantIf(granted, playerId, "heaven_defier",      player.getRealm() >= 8);
grantIf(granted, playerId, "dao_lord",           player.getRealm() >= 9);
grantIf(granted, playerId, "chaos_emperor",      player.getRealm() >= 10);
grantIf(granted, playerId, "sword_master", playerService.getFinalAttack(player) >= 500);
grantIf(granted, playerId, "millionaire", itemService.getSpiritStoneCount(playerId) >= 1_000_000L);
grantIf(granted, playerId, "exploration_master", player.getSecretRealmCount() >= 20);
grantIf(granted, playerId, "arena_champion",     player.getPvpWins() >= 50);
grantIf(granted, playerId, "alchemy_lord",       player.getCraftCount() >= 100);
grantIf(granted, playerId, "pill_apprentice",    player.getCraftCount() >= 1);
```

### 管理端发放

- REST：`AdminResource` 提供按 `playerId` + `titleKey` 授予称号的接口（内部调用 `TitleService.grantTitle`）。
- 管理端也可撤销：`TitleService.revokeTitle` 删除 `player_titles` 中对应行。
- 因此 `beast_tamer`、`event_spring`、`bug_hunter` 这三个称号目前**只有管理端能给出**。

## 装备与卸下

| 规则 | 说明 |
| --- | --- |
| 只能装备 1 个 | `equipTitle` 在同一事务内先 `unequipCurrentTitle` 再 `equipNewTitle` |
| 必须已拥有 | 未拥有时返回 `你未拥有该称号` |
| 名称匹配 | `/称号 装备 <名称>` 支持**完全相等、包含匹配或直接输入 titleKey**（取第一个命中） |
| 卸下 | `/称号 卸下` 把所有 `is_equipped = 1` 的行置 0；没有装备时提示 `当前未装备任何称号` |

## 加成如何进入计算

所有称号加成通过 `PlayerService` 的 `applyTitleBonus` 收口，读取的都是**当前装备的那一个**称号：

| 最终属性方法 | 加成字段 | 叠加关系 |
| --- | --- | --- |
| `getFinalAttack` | `attackBonus` | 基础攻击 + 称号加成 + 装备强化加成 |
| `getFinalDefense` | `defenseBonus` | 基础防御 + 称号加成 + 强化加成 |
| `getFinalMaxHp` / `getFinalMaxMp` | `hpBonus` / `mpBonus` | 基础上限 + 称号加成 |
| `getFinalSpeed` | `speedBonus` | 基础速度 + 称号加成 + 强化加成 |
| `getFinalSpirit` | `spiritBonus` | 基础神识 + 称号加成 + 强化加成 |
| `getFinalCultivationSpeed` | `cultivationSpeedBonus` | **以 1.0 为基数的乘算因子** |
| `getFinalExpBonus` | `expBonus` | 1.0 + 称号经验 + 已装备功法经验之和 |
| `getFinalDropRateBonus` | `dropRateBonus` | 以 0 为基数，直接作为掉落率增量 |

```java
// PlayerService —— 称号加成的统一入口
private double applyTitleBonus(Player player, double base,
                              java.util.function.Function<Title, Double> bonusExtractor) {
    Title title = getEquippedTitle(player.getId());
    if (title != null) base += bonusExtractor.apply(title);
    return base;
}
```

修炼速度的落地位置在 `cultivationMultiplier`：`mult *= getFinalCultivationSpeed(player)`，
所以装备「混沌帝尊」（修炼 +25%）会让整体修炼倍率再 ×1.25。

## 指令

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `/称号` | `title`、`chenghao` | 查看已拥有称号（装备中的用 `▶` 标记）与当前称号详情 |
| `/称号 列表` | `list`、`all` | 称号大全，按品质分组展示名称、描述、境界要求、攻击/生命/经验加成 |
| `/称号 装备 <名称>` | `equip` | 装备称号 |
| `/称号 卸下` | `unequip` | 卸下当前称号 |

- 分类"我的角色"，`permission` 为 `null`。
- 称号指令类**没有注册 HTTP 路由**。

::: details `/称号 列表` 只显示部分加成
`listAllTitles` 的输出里只拼接了 `攻击`、`生命`、`经验` 三项非零加成，
法力/防御/速度/神识/修炼速度/掉落率需要查看本页表格或 `/状态` 中的实际效果。
:::

## `player_titles` 表字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 记录 ID |
| `player_id` | BIGINT | 角色 ID |
| `title_key` | VARCHAR(64) | 称号 key（对应 `TitleRegistry`） |
| `is_equipped` | BOOLEAN | 是否装备中 |
| `acquired_at` | TIMESTAMP | 获得时间 |
| 唯一键 | `(player_id, title_key)` | 同一称号不会重复授予 |

## 相关页面

- [修炼系统](./cultivation) —— 称号修炼速度的实际作用
- [PVP 对战](./pvp) —— 擂台王者的获取场景
- [秘境探索](./secret-realm) —— 秘境探险家、副本征服者
- [宗门系统](./sect) —— 开山祖师、首席弟子
- [状态与角色信息](./account) —— 称号在 `/状态` 中的展示
- [玩家玩法总览与全指令表](./)
