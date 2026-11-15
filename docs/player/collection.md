# 全图鉴

图鉴是**收集进度**系统：玩家在游戏里拿到/学会/到访的每一样东西，都会在图鉴里解锁一条记录，
并立刻发放该条目的奖励；一个分类全部集齐后，再发一次「集齐奖励」。

- 玩法模块：`collection`（`config/plugins/collection.yml` 的 `enabled`，默认启用）
- 指令：`/图鉴`（别名 `collection`、`atlas`），权限 `game.collection.view`
- 数据表：`player_collection`（迁移 `028`）
- 奖励配置：`config/collection.yml`（模板随 jar 释放，改完自动生效，无需重启）

## 分类与解锁条件

| 分类 | key | 全集来源 | 什么时候解锁 |
| --- | --- | --- | --- |
| 物品 | `item` | `ItemRegistry` 全部物品 | 物品**进入背包**时（掉落/交易/炼制/奖励等所有入包路径） |
| 称号 | `title` | `TitleRegistry` 全部称号 | 获得该称号时 |
| 功法 | `technique` | `TechniqueDefaults` 官方功法 | 学会该功法时 |
| 技能 | `skill` | `skills` 表全部技能 | 学会该技能时（含秘籍领悟） |
| 秘境 | `secret_realm` | `SecretRealmRegistry` 全部秘境 | 进入该秘境时（单人/团队都算） |
| 游历事件 | `exploration_event` | `ExplorationEventRegistry` 全部事件 | 游历中遭遇该事件时 |
| 地图地点 | `map_location` | 已加载的已知世界地点 | 到达该地点时（移动/传送符/付费传送） |
| 配方 | `recipe` | `recipes` 表全部配方 | 首次成功炼成该配方时 |

::: tip 每个分类的「全集」是运行时算的
不维护静态清单：物品/称号/秘境/事件读注册表，技能/配方/地图读数据库/地图快照。
新增一件物品/一个称号，图鉴会自动多一条条目，不需要改图鉴代码。
:::

## 指令

| 指令 | 别名 | 作用 |
| --- | --- | --- |
| `/图鉴` | `/collection`、`/atlas` | 总览：每个分类的 `已解锁/总数 (百分比)` 与总计 |
| `/图鉴 查看 <分类> [页码]` | `/图鉴 分类 …`、`/图鉴 list …` | 某分类的条目列表（每页 20 条），已解锁打 ✔、未解锁打 ✘ |
| `/图鉴 <分类>` | — | 等价于 `查看 <分类>`（未知子命令会当分类名） |
| `/图鉴 奖励` | `/图鉴 rewards` | 查看各分类的「解锁一条奖励 / 集齐全部奖励」 |

分类名可用中文（`物品`）或 key（`item`）。示例：

```text
══════ 全图鉴 ══════
▍物品 12/130 (9%)
▍称号 3/25 (12%)
▍功法 2/15 (13%)
...
──────────────
总计: 30/240 (12%)
提示: /图鉴 查看 <分类> 看条目；/图鉴 奖励 看奖励配置
```

```text
===== 物品图鉴 12/130 =====
[1] ✔ 回血丹（已解锁）
[2] ✘ 灵剑
...
第 1/7 页，/图鉴 查看 物品 2 翻页
```

`/图鉴 奖励` 的实际输出（物品显示中文名，不会出现 `mtxgdn:` 内部 key）：

```text
══════ 图鉴奖励 ══════
▍物品
  解锁一条: 金币 +50
  集齐全部: 金币 +20000、修炼丹 ×3
▍称号
  解锁一条: 金币 +1000、下品灵石 +10
  集齐全部: 金币 +100000、下品灵石 +500
...
（奖励在 config/collection.yml 里逐分类/逐条配置）
```

::: tip 首次访问会自动回填
`/图鉴` 第一次打开时会先做一次**回填**：扫描当前背包、装备、已有称号、已学功法/技能、
已探索地图，把"功能上线前就已经有的"补进图鉴（幂等，一个玩家只回填一次）。
秘境/游历事件/配方没有历史台账，只能从本功能上线后开始记录。
:::

## 奖励配置

奖励在 `config/collection.yml` 里配置，取值优先级：

**单条覆盖 > 分类默认 > 全局默认 > 代码内置默认**

```yaml
categories:                 # 分类开关：false = 不再记录、不再发奖（已记录数据保留）
  item: true
  title: true

# 可选：全局兜底
# default_reward: { gold: 0 }
# default_completion_reward: { gold: 0 }

rewards:
  title:                    # 分类 key
    default: { gold: 1000, spirit_stones: 10 }        # 该分类每条解锁的默认奖励
    completion: { gold: 100000, spirit_stones: 500 }  # 集齐奖励
    entries:                                          # 单条覆盖
      arena_champion: { gold: 5000, spirit_stones: 50 }

  item:
    default: { gold: 50 }
    completion: { gold: 20000, items: { "mtxgdn:cultivation_elixir": 3 } }
```

奖励字段（都可选，负数会被忽略/归零）：

| 字段 | 含义 |
| --- | --- |
| `gold` | 金币 |
| `spirit_stones` | 下品灵石（按面额自动压缩成中/上/极品） |
| `exp` | 修为 |
| `items` | `{ 物品 key: 数量 }`，未知 key 会在发放时跳过并记日志；指令里显示物品中文名，解析不到才显示 key |

::: warning 显式 `{}` 与「没配置」不同
`entries: { mtxgdn:spirit_sword: {} }` 表示"这条**不发奖**"，不会回落到分类默认。
:::

::: tip 改文件不用重启
`CollectionConfig` 按文件指纹（修改时间 + 大小）判断是否需要重读，下一次读取自动生效。
配置写坏/文件缺失不会让图鉴崩掉：会回落到代码内置默认，并在控制台打印告警。
:::

奖励与「已解锁」写入在**同一个事务**里：写解锁行成功后才发奖；
`player_collection` 的 `UNIQUE (player_id, category, entry_key)` 保证同一条只发一次。
集齐奖励也复用这张表（`entry_key = '__completion__'` 的伪条目），所以"只发一次"同样由唯一约束保证。

## REST

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `collection/overview` | `game.collection.view` | 总览：`categories[]`（`key`/`name`/`unlocked`/`total`/`percent`/`completed`/`completionReward`）+ 总计 |
| GET | `collection/category?name=<分类>&page=<页码>` | `game.collection.view` | 分类详情：条目数组 `key`/`name`/`unlocked`/`unlockedAt` + 分页信息；`name` 支持中文或 key |

两条接口都挂在 `/api/game/` 前缀下，首次调用同样会触发一次回填。

## 数据表

`player_collection`（迁移 `028_player_collection_table`，新装由 `DatabaseSchema` 直接建）：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `player_id` | 外键 → `players(id)` ON DELETE CASCADE |
| `category` | 分类 key（`item`/`title`/…） |
| `entry_key` | 条目 key（物品是 `mtxgdn:xxx`、称号是 titleKey、地图地点是地点 id…） |
| `unlocked_at` | 解锁时间（毫秒时间戳） |
| `reward_granted` | 奖励已发放标记（当前恒为 1，留作审计） |

约束 `UNIQUE (player_id, category, entry_key)` + 索引 `idx_player_collection_player (player_id, category)`。

## 模块开关与容错

- 关掉 `collection` 模块（`config/plugins/collection.yml` 的 `enabled: false`）：
  指令/REST 被门控拒绝，解锁钩子全部变成空操作，已有记录保留；
- 图鉴的解锁钩子是**纯旁路**：记录失败、奖励发放失败（如背包满）都不会影响主玩法
  （物品照常入包、称号照常授予）；物品奖励因背包满失败时，解锁记录仍然保留、奖励跳过；
- 某分类在 `categories` 里关掉后，该分类不再记录、不再发奖，全量进度里也不再显示。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 总览里少了某个分类 | 该分类在 `config/collection.yml` 的 `categories` 里被关掉了，或模块被停用 |
| 解锁了但没有奖励 | 该条目配置了 `{}`；或奖励物品 key 不存在；或背包满导致物品奖励被跳过 |
| 老玩家图鉴是空的 | 首次 `/图鉴` 会回填可反推的部分；秘境/游历/配方无法回填 |
| 改完奖励没生效 | 检查 `config/collection.yml` 是否被正确解析（控制台会打印解析失败告警） |
