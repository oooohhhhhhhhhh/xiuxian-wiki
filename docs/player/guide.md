# 新手引导

服务端内置一套**新手引导（软引导）**，帮助新玩家熟悉主线玩法。它不卡进度，任何一步不做都能正常游玩。

实现是 `com.mtxgdn.game.service.NewbieGuideService`，由两块组成：

- **主线引导**：`checkAndAdvance(playerId, player, action)`，按「打坐 → 停止 → 游历 → 秘境 → 进入秘境 → 突破 → 晨修 → 出师」推进 `players.tutorial_step`；
- **发现提示**：`checkDiscovery(playerId, player, action)`，玩家第一次用到某功能时，在回复末尾附一条一次性 **💡** 提示（用 `players.tutorial_tips` 位掩码去重）。

两部分状态都落在 `players` 表，**不额外建表**：

| 存储字段 | 类型 | 含义 |
| --- | --- | --- |
| `players.tutorial_step` | INT | 主线进度（1~8；`-1` = 已完成/出师） |
| `players.tutorial_tips` | INT | 位掩码，记录哪些 💡 提示已展示过（不重复弹） |

## 主线引导（`checkAndAdvance`）

建号时 `tutorial_step` 初始为 **1**。玩家按主线顺序做完关键动作时，服务端把进度推进到下一步，并在回复里附带下一阶段提示；未到该步就做动作则无提示、也不推进。

| 步骤 | 触发动作 | 推进到 |
| --- | --- | --- |
| 1 | 角色创建（`buildCreateMessage`，QQ/MC 通道建号后私聊推送欢迎语） | 2 |
| 2 | `/打坐`（`cultivate_start`） | 3 |
| 3 | `/停止`（`cultivate_stop`） | 4 |
| 4 | `/游历`（`explore`） | 5 |
| 5 | `/秘境`（`secret_areas`） | 6 |
| 6 | `/进入秘境`（`secret_enter`） | 7 |
| 7 | `/突破`（`breakthrough`） | 8 |
| 8 | `/晨修`（`morning`） | **-1（出师）** |

当 `tutorial_step == -1` 表示引导结束，不再触发任何主线提示。

::: tip 「💡」什么时候弹
每条主线消息末尾的 `💡` 是给玩家的下一步/替代玩法指引（如「看看 `/背包`、去 `/坊市`」）。
它们只在**恰好推进主线的那一步**出现，重复做同一动作不会再弹。
:::

## 💡 发现提示（`checkDiscovery`）

若干功能在**第一次**被玩家使用时会额外追加一条发现提示。`tutorial_tips` 是位掩码，`setTutorialTips(tips | flag)` 置位后同功能不再重复弹。

| 触发动作 | 位 | 内容要点 |
| --- | --- | --- |
| `spiritual_root`（/灵根） | `1` | 灵根天赋说明（修炼效率、渡劫成功率、心魔抗性、特殊效果） |
| `market`（/坊市） | `2` | 坊市买卖、5% 手续费、土金灵根优惠 |
| `pvp`（/挑战） | `4` | 挑战消耗体力、失败受伤、建议筑基后再战 |
| `skills`（/技能） | `8` | 技能查看/学习/熟练度、同名技能书直升 1 级 |
| `equipment`（/已装备 等） | `16` | 装备加成、秘境掉率高 |
| `morning_tip`（/晨修） | `32` | 每日一次、天象加成持续 24 小时 |
| `daily`（/天象） | `64` | 天象每天刷新、每日任务 |
| `help`（/帮助） | `128` | 指令列表指引 |
| `item_use`（/使用） | `256` | 物品使用 / 坊市交易 |
| `backpack`（/背包） | `512` | 背包物品可 /使用 或上架坊市 |
| `equip`（/装备） | `2048` | 穿戴/卸下/部位说明 |

这些提示**附加在对应指令的正常回复末尾**，不影响指令结果。

## 新手奖励（`NewbieRewardConfig`）

`config/newbie_reward.json` 控制建号时是否发放初始奖励。**默认 `enabled=false`，默认不发放**；开启后可配金币、灵石（含品阶）与物品列表。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 是否发放新手奖励 |
| `goldReward` | `0` | 初始金币 |
| `spiritStoneReward` | `0` | 初始灵石数量 |
| `spiritStoneGrade` | `0` | 灵石品阶（0=下品） |
| `items` | `[]` | 初始物品列表：`{ "itemKey", "quantity" }`（`itemKey` 必须真实存在） |

该文件由 `GameConfigLoader` 首次释放到 `<jar目录>/config/newbie_reward.json`；删除后回落到内置默认（`enabled=false`）。键的完整说明见[配置项全表](/reference/config-keys)。

## 灵根彩蛋

建号欢迎语里，`ROOT_EASTER_EGGS` 为 5 种灵根附带一句专属彩蛋文案（太乙金灵根 / 混沌灵根 / 土金灵根 / 惊雷灵根 / 玄冰灵根），其余灵根走通用欢迎语。

## 与新人相关的其它自动行为

- 建号自动授予称号「初入仙途」（`beginner`），见[称号系统](/player/titles)；
- 若启用玩家数据文件化，建号后立即导出一份该玩家的 JSON 文件，见[账号与角色](/player/account)。

---

新手引导是**软引导**：不卡进度，任何一步都不做也不会影响正常游玩，随时可以跳去自由探索。
