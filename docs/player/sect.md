# 宗门

宗门是玩家组建的长期组织：可以收徒、捐献、共享仓库、升级、转让宗主、主动退位、解散，并在实验性开关打开时发起宗门战。实现位于 `src/main/java/com/mtxgdn/game/service/SectService.java`（2012 行）、实体 `game/entity/Sect.java`、`SectMember.java`，QQ 入口为 `src/main/java/com/mtxgdn/onebot/command/sect/SectCommand.java`（573 行）。

所有宗门操作都走**单条指令 + 子命令**形式：`/宗门 <子命令> [参数]`，别名 `sect`，权限节点 `game.sect.manage`，模块 `sect`。

## 子命令总览

| 子命令 | 中文别名 | 参数 | 谁可以用 | 说明 |
| --- | --- | --- | --- | --- |
| `create` | `创建` | `<宗门名> [描述]` | 任意玩家 | 创建宗门 |
| `join` | `加入` | `<宗门名> [留言]` | 未入宗玩家 | 提交入宗申请（可带留言） |
| `apply` | `申请` | `<宗门名>` | 未入宗玩家 | 同 `join`，但不带留言 |
| `list` | `列表` | — | 任意玩家 | 浏览天下宗门 |
| `top` | `排行` | — | 任意玩家 | 声望排行前 10 |
| `info` | `信息` | `[宗门名]` | 任意玩家 | 不填则看自己的宗门 |
| `members` | `成员` | — | 本宗成员 | 成员列表（按职位排序） |
| `pending` | `申请列表` | — | 宗主/副宗主/长老 | 待处理入宗申请 |
| `approve` | `通过` | `<玩家名>` | 宗主/副宗主/长老 | 通过申请 |
| `reject` | `拒绝` | `<玩家名>` | 宗主/副宗主/长老 | 拒绝申请 |
| `leave` | `退出` | — | 本宗成员 | 退出；宗主在独自一人时退出等于解散 |
| `kick` | `踢出` | `<玩家名>` | 宗主/副宗主/长老 | 逐出成员 |
| `appoint` | `任命` | `<玩家名> <职位>` | 宗主/副宗主/长老 | 修改职位 |
| `donate` | `捐献` | `<物品key> <数量>` | 本宗成员 | 捐入宗门仓库 |
| `warehouse` | `仓库` | — | 本宗成员 | 查看宗门仓库 |
| `take` | `取出` | `<物品key> <数量>` | 本宗成员 | 从仓库取出（普通弟子消耗贡献值） |
| `levelup` | `升级` | — | 宗主 | 消耗声望升级宗门 |
| `transfer` | `转让` | `<玩家名>` | 宗主 | 转让宗主之位（200 灵石） |
| `stepdown` | `退位`、`卸任` | — | 宗主 | 主动卸任，立刻按贡献选出继任者，自己降为副宗主 |
| `challenge` | `挑战`、`争夺` | `[接受]` | 宗主 / 竞争期挑战者 | 竞争期内发起或应战（三局两胜） |
| `war` | `宣战` | `<宗门名>` | 宗主 | 发起宗门战（实验性，默认关闭） |
| `disband` | `解散` | — | 宗主 | 解散宗门（不可恢复） |
| `help` | `帮助`、`?` | — | 任意玩家 | 帮助文本 |

`/宗门` 无参数或子命令无法识别时，都会回退到 `buildOverview`：已入宗显示宗门概览 + 快捷操作；未入宗显示"宗门大厅"引导。

### HTTP 接口

三条只读路由，权限节点均为 `game.sect.manage`：`GET sect/list`（宗门列表，含实算的 `maxMembers`）、`GET sect/info`（自己所属宗门，未入宗返回 `restOk("尚未加入宗门", null)`）、`GET sect/info/{sectId}`（指定宗门，不存在返回 `restError(400, "宗门不存在")`）。

`buildSectJson` 在玩家是该宗成员时额外输出 `myRole`、`myRoleDisplay`、`myContribution`。

## 创建宗门

`/宗门 create <宗门名> [描述]`。

| 条件 | 规则 | 失败提示 |
| --- | --- | --- |
| 名称长度 | `trim()` 后 2~8 个字符 | 宗门名称需要 2-8 个字符 |
| 描述长度 | 最长 100 字符 | 宗门描述最多 100 个字符 |
| 境界 | `player.getRealm() >= Sect.MIN_LEVEL_CREATE`（`= 4`） | 境界不足，需要达到元婴期以上才能创建宗门（当前：X） |
| 未入宗 | `getPlayerSect(playerId) == null` | 你已经有宗门了，需要先退出才能创建新宗门 |
| 名称唯一 | `getSectByName(name) == null` | 宗门名称【X】已被使用 |
| 灵石 | `>= Sect.CREATE_COST_SPIRIT_STONES`（`= 500`） | 灵石不足，创建宗门需要 500 灵石（你目前有 N 灵石） |

创建过程在一个事务内完成：跨等级扣除 500 灵石 → 插入 `sects` → 插入 `sect_members`（`role = 'LEADER'`）。返回对象是**直接构造**的 `Sect`（而非事务内再查库），避免事务内跨连接查询读不到未提交数据。

::: tip 新宗门初始声望 1000
`INSERT INTO sects ... prestige` 显式写入 `1000L`，源码注释解释了原因："使宗门升级/宗门战在创建后即可积累使用，避免声望死锁"。若初始为 0，而升级又必须消耗声望，新宗门将永远无法升级。
:::

创建成功会授予称号 **`sect_founder`（开山祖师）**，失败被吞掉（`catch (Exception ignored)`），不影响创建结果。

::: warning 帮助文案的境界说明与代码不一致
`SectCommand.buildHelp()` 与 `buildOverview()` 写的是"需金丹期+500灵石"，但代码判定用 `Sect.MIN_LEVEL_CREATE = 4`，其注释为"元婴期（按 realm_config 大境界序号，realm>=4）"，服务端错误提示也是"需要达到元婴期以上"。**以代码判定为准**。
:::

## 入宗申请与审批

`/宗门 apply <宗门名>` 或 `/宗门 join <宗门名> [留言]`。

申请校验（`applyToSect`）：

| 校验 | 提示 |
| --- | --- |
| 角色存在 | 角色不存在 |
| 宗门存在 | 宗门不存在 |
| 未入宗 | 你已经有了宗门，需要先退出才能加入新宗门 |
| 成员未满 | 【X】成员已满（N/M） |
| 无重复 pending 申请 | 你已经向该宗门提交过申请，请等待审批 |

成员上限 `Sect.getMaxMembersForLevel(level) = 20 + (level - 1) × 5`。申请写入 `sect_applications`，初始 `status = 'pending'`。

审批（`approveApplication`）：

| 步骤 | 说明 |
| --- | --- |
| 申请有效性 | 不存在或非 `pending` → "申请不存在或已处理" |
| 审批人权限 | `approver.canManage()` 为假 → "你无权处理宗门申请" |
| 通过时复查人数 | 已满 → "宗门成员已满" |
| 通过 | `status = 'accepted'`，`addMember` 以 `role = 'OUTER_MEMBER'`（外门弟子）入宗，并授予称号 **`senior_disciple`（首席弟子）** |
| 拒绝 | `status = 'rejected'`，不产生成员记录 |
| 落库 | `UPDATE sect_applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?` |

::: warning 审批按玩家名匹配，且有并发窗口
`handleApprove` / `handleReject` 是在**待处理申请列表里按玩家名精确匹配**找到申请 ID，再调 `approveApplication`。同名玩家会导致匹配歧义；此外"查列表 → 审批"不是原子的，重复点击同一申请第二次会得到"申请不存在或已处理"。
:::

## 职位与权限

职位常量与判定逻辑在 `SectMember`：

| 职位常量 | 中文名 | `getRoleRank()` | `canManage()` |
| --- | --- | --- | --- |
| `LEADER` | 宗主 | 0 | ✅ |
| `VICE_LEADER` | 副宗主 | 1 | ✅ |
| `ELDER` | 长老 | 2 | ✅ |
| `INNER_MEMBER` | 内门弟子 | 3 | ❌ |
| `OUTER_MEMBER` | 外门弟子 | 4 | ❌ |

```java
/** 管理权限：宗主/副宗主/长老 */
public boolean canManage() { return isLeader() || isViceLeader() || isElder(); }

/** 能否踢出/任命对方（需先通过 canManage） */
public boolean canKickOrAppoint(SectMember target) {
    int myRank = getRoleRank();
    int targetRank = target.getRoleRank();
    return myRank < targetRank; // 排名数字越小权力越大，只能操作下级
}
```

### 任命职位

`/宗门 appoint <玩家名> <职位>`，职位可写中文或英文：

| 输入 | 解析结果 |
| --- | --- |
| `副宗主`、`vice_leader`、`viceleader` | `VICE_LEADER` |
| `长老`、`elder` | `ELDER` |
| `内门`、`内门弟子`、`inner`、`inner_member` | `INNER_MEMBER` |
| `外门`、`外门弟子`、`outer`、`outer_member` | `OUTER_MEMBER` |

| 限制 | 提示 |
| --- | --- |
| 无管理权限 | 只有宗主、副宗主和长老才能任命宗门职位 |
| 长老只能任命内门/外门 | 长老只能任命内门弟子和外门弟子 |
| 副宗主不能任命副宗主 | 副宗主不能任命副宗主，只有宗主可以 |
| 目标不在宗门 | 该玩家不在你的宗门中 |
| 目标为宗主 | 不能改变宗主的职位 |
| 目标为副宗主且自己非宗主 | 只有宗主才能改变副宗主的职位 |
| 长老操作长老 | 长老不能操作同级 |
| 职位未变化 | X 已经是Y |

### 踢出成员

`/宗门 kick <玩家名>`。

| 限制 | 提示 |
| --- | --- |
| 无管理权限 | 只有宗主、副宗主和长老才能踢人 |
| 目标不在宗门 | 该玩家不在你的宗门中 |
| 目标是宗主 | 不能踢出宗主 |
| 目标是副宗主且自己非宗主 | 只有宗主才能踢出副宗主 |
| 目标级别 ≥ 自己 | 不能踢出同级或更高级别的成员 |

### 退出宗门

`/宗门 leave`（`leaveSect`）：

- 未入宗 → "你没有加入任何宗门"。
- **宗主且宗门还有其他人** → "身为一宗之主，不可随意离开。请先转让宗主之位或解散宗门（/宗门 解散）"。
- **宗主且独自一人** → 直接解散：事务内依次 `DELETE FROM sect_warehouse` → `sect_applications` → `sect_members` → `sects`。
- 普通成员 → 删除自己的 `sect_members` 行。

::: tip 先退位，再退出
改造前宗主**既不能退位也不能退宗**，一旦宗主弃坑，这个宗门就永远没人能接手。
现在可以先 `/宗门 退位`（自己降为副宗主），再正常 `/宗门 退出`。
:::

## 宗主缺位继位与竞争期

这一段解决的是"**宗主弃坑 → 宗门死锁**"。两条路径都会进入同一套继位逻辑：

| 路径 | 触发 | 特点 |
| --- | --- | --- |
| 主动退位 | 宗主执行 `/宗门 退位` | **同步**执行，立刻选出继任者，不依赖定时任务 |
| 弃坑判定 | 低频扫描发现宗主长期不活跃 | 异步，由 `sect-succession-sweeper` 守护线程处理 |

### 主动退位（`/宗门 退位`）

| 校验 | 提示 |
| --- | --- |
| 未入宗 | 你没有加入任何宗门 |
| 非宗主 | 只有宗主才能退位 |
| 宗门只剩自己 | 你是宗门仅剩的成员，无人可以继任。若已无意经营，请使用 /宗门 解散 |

退位后：继任者升为 `LEADER`，**原宗主降为 `VICE_LEADER`**（不是踢出宗门），
随后他可以正常 `/宗门 退出`。

### 弃坑判定

扫描任务用 `players.last_active_time` 判定宗主是否弃坑（这是所有通道通用的活跃信号，
QQ / REST / Minecraft 任意一端活动都会刷新它）：

| 条件 | 值 |
| --- | --- |
| 判定阈值 | `sect.leader_absent_days`（默认 14 天，`0` = 关闭该判定） |
| 扫描间隔 | `sect.succession_sweep_seconds`（默认 600 秒，最小 30） |
| 首次执行延迟 | 45 秒（等数据库与服务注册表就绪） |
| 额外条件 | 宗门成员数必须 > 1；且 `last_active_time > 0` |

::: warning 为什么必须要求 `last_active_time > 0`
老库升级后这一列全是 `0`（表示"尚未观测到活跃"）。若把 `0` 当成纪元起点，
**升级瞬间会把全服宗主一次性判定成弃坑**。因此 `0` 被显式排除，
从每个玩家各自的下一次登录开始计时。
:::

### 继任者怎么选

| 角色 | 排序规则 |
| --- | --- |
| **继任者** | 贡献最高 → 境界序位最高 → 玩家 ID 最小（末位保证同分时结果稳定） |
| **竞争者** | 余下成员里：职位最高 → 境界最高 → 贡献最高 → 玩家 ID 最小 |

现任宗主**不参与候选** —— 否则退位等于没退。

三条不变量：

1. **幂等**：`leader_absent_since = 0` 或竞争期未结束时直接返回，不重复换人；
2. **并发安全**：落库用条件更新（`WHERE leader_absent_since = 读到的值`），
   指令与扫描任务同时触发时只有一个生效；
3. **无候选时清标记**：宗门里没有可继位成员时清掉缺位标记，
   等有新成员加入后由扫描任务重新判定（不清的话每次扫描都会重复命中同一条记录）。

### 竞争期

继任者与最强竞争者的**境界序位差**小于 `sect.contest_level_gap`（默认 6，
约两个大境界）时，开启 `sect.contest_days`（默认 7 天）的**宗主竞争期**。
差距过大时挑战毫无意义，直接让继任者坐稳。

竞争期是**两段式**的：

```text
继位完成 ──→ 挑战者 /宗门 挑战 ──→ 宗主 /宗门 挑战 接受 ──→ 三局两胜
                    │                        │
                    └── 不发起 / 不应战 ──────┴──→ 到期后宗主保住位置
```

| 操作者 | 指令 | 效果 |
| --- | --- | --- |
| 挑战者 | `/宗门 挑战` | 标记「已发起」，等宗主应战 |
| 宗主 | `/宗门 挑战` | 查看竞争期状态（截止时间、挑战者、是否已发起） |
| 宗主 | `/宗门 挑战 接受` | 应战，立即三局两胜 |
| 其他人 | — | 「只有本宗宗主或竞争期挑战者可以操作」 |

争夺战规则：

| 项 | 规则 |
| --- | --- |
| 局数 | `CONTEST_ROUNDS = 3`，先赢 `CONTEST_WINS_NEEDED = 2` 局者胜 |
| 属性归一化 | 境界更高的一方按境界序位比例压低，**下限 `MIN_CONTEST_RATIO = 0.5`** |
| 归一化范围 | 只作用于内存副本，**绝不回写**玩家真实属性 |
| 结果 | 挑战者胜 → 挑战者成为宗主、原宗主降为副宗主；宗主胜 → 位置不变 |

::: tip 为什么要归一化
争夺战考校的应该是灵根 / 装备 / 属性分配这些"构筑"，而不是单纯比谁境界高。
下限 0.5 保证高境界一方仍占优，但不会变成"境界高就必胜"。
:::

`/宗门 信息` 会在缺位或竞争期时追加一行状态：

- 宗主缺位中：等待同门按贡献继任（自 X 起）
- 宗主竞争期至 X，挑战者：某某（已发起，待宗主应战）/（尚未发起）

::: details 配置项
| 键 | 默认 | 作用 |
| --- | --- | --- |
| `sect.leader_absent_days` | `14` | 宗主连续不活跃多少天判定弃坑；`0` = 关闭 |
| `sect.contest_days` | `7` | 竞争期持续天数 |
| `sect.contest_level_gap` | `6` | 境界序位差小于该值才开竞争期 |
| `sect.succession_sweep_seconds` | `600` | 继位扫描间隔（秒），最小 30 |
:::

## 宗门等级

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `MAX_LEVEL` | `10` | 最高等级 |
| `MAX_MEMBERS_BASE` | `20` | 1 级宗门成员上限 |
| `MAX_MEMBERS_PER_LEVEL` | `5` | 每升 1 级增加的上限 |
| `LEVEL_UP_PRESTIGE_PER_LEVEL` | `1000` | 每级消耗声望基数 |

```java
public static int getMaxMembersForLevel(int level) {
    return MAX_MEMBERS_BASE + (level - 1) * MAX_MEMBERS_PER_LEVEL;
}

public static long getLevelUpCost(int currentLevel) {
    return currentLevel * LEVEL_UP_PRESTIGE_PER_LEVEL;
}
```

| 等级 | 成员上限 | 升到下一级所需声望 |
| --- | --- | --- |
| 1 | 20 | 1,000 |
| 2 | 25 | 2,000 |
| 3 | 30 | 3,000 |
| 4 | 35 | 4,000 |
| 5 | 40 | 5,000 |
| 6 | 45 | 6,000 |
| 7 | 50 | 7,000 |
| 8 | 55 | 8,000 |
| 9 | 60 | 9,000 |
| 10 | 65 | —（已达上限） |

`/宗门 levelup` 仅宗主可用，校验：非宗主 → "只有宗主才能升级宗门"；已满级 → "宗门已达到最高等级 10 级"；声望不足 → "声望不足，升级需要 N 声望（当前：M）"。升级语句同时写 `level`、扣 `prestige`、更新 `max_members`。

### 声望来源

| 来源 | 数量 | 位置 |
| --- | --- | --- |
| 创建宗门初始值 | +1,000 | `createSect` |
| 捐献物品（任何成员） | `max(1, 数量 / 10)` | `donateToWarehouse` |
| `addContribution` 正数 | `+= amount`（贡献值与声望同步增加） | `addContribution` |
| 宗门战胜利 | `+500` | `declareWar` |
| 宗门战失败 | `-500`（下限 0） | `declareWar` |
| 宗门升级 | `-currentLevel × 1000` | `levelUp` |
| 宣战 | `-1000` | `declareWar` |

## 宗门仓库

| 常量/规则 | 内容 |
| --- | --- |
| 唯一约束 | `UNIQUE (sect_id, item_key)`，同物品累加数量 |
| 写入方式 | upsert：SQLite 用 `ON CONFLICT(sect_id, item_key) DO UPDATE`，MySQL 用 `ON DUPLICATE KEY UPDATE` |
| 取出成本 | `getItemContributionCost(item) = max(10, item.getPrice() / 5)` |
| 捐献所得贡献 | 普通弟子：`quantity × max(2, item.getPrice() / 10)`；管理职位：`0` |

### 捐献

`/宗门 donate <物品key> <数量>`：

1. 必须是宗门成员 → "你不是该宗门成员"。
2. 物品存在（`ItemRegistry.resolve`）→ "物品不存在"；数量 `> 0`。
3. 背包数量足够 → "背包中【X】数量不足"。
4. 事务内：扣背包物品 → upsert `sect_warehouse` → 普通弟子加贡献值 → **任何成员**都加声望 `max(1, 数量 / 10)`。

::: tip 为什么管理职位捐献不给贡献值
源码注释直接说明了这个防刷设计：

> 修复刷贡献 bug：管理职位（宗主/副宗主/长老）可以免费从仓库取出物品，若捐献时仍发放贡献值，则取出→捐献→取出无限循环即可刷取海量贡献值。因此管理职位捐献不再获得贡献值（其特权已是免费取物），仅普通弟子捐献获得贡献值。贡献值按物品价格折算（约为取出成本的 1/3~1/2），保证"捐低价物换高价物"无利可图。

管理职位的返回文案会明确说明："（管理职位可免费取物，捐献不再获得贡献值，以防刷取）"。
:::

### 取出

`/宗门 take <物品key> <数量>`：

| 身份 | 成本 | 提示 |
| --- | --- | --- |
| 管理职位（宗主/副宗主/长老） | **免费** | 已从宗门仓库取出【X】×N |
| 内门/外门弟子 | `max(10, 价格/5) × 数量` 贡献值 | 贡献值不足，取出【X】×N 需要 C 贡献值（当前：M） |

并发安全设计（单事务 + 条件扣除）：

```java
// 贡献值：条件扣除
"UPDATE sect_members SET contribution = contribution - ? WHERE id = ? AND contribution >= ?"
// 仓库数量：条件扣除
"UPDATE sect_warehouse SET quantity = quantity - ? WHERE sect_id = ? AND item_key = ? AND quantity >= ?"
```

任一 `executeUpdate() == 0` 就抛异常回滚，因此**贡献值、仓库数量、背包发放三者原子完成**，不会出现并发超取或重复取物。

::: warning 取出命令的实际权限比帮助文案宽
`/宗门 help` 写的是"从仓库取出（宗主/副宗主/长老）"，但 `withdrawFromWarehouse` 对**任何宗门成员**都放行，只是普通弟子要付贡献值。`/宗门 warehouse` 输出也会据此区分提示。
:::

## 宗主转让

`/宗门 transfer <玩家名>`（`transferLeader`）。

| 校验 | 提示 |
| --- | --- |
| 自己是宗主 | 只有宗主才能转让 |
| 对方在宗门中 | 对方不在你的宗门中 |
| 对方不是宗主 | 对方已经是宗主了 |
| 对方角色存在 | 接收者角色不存在 |
| 对方境界 ≥ `MIN_LEVEL_CREATE` | 接收者境界不足，需要达到元婴期以上才能成为宗主（当前：X） |
| 灵石 ≥ `TRANSFER_COST_SPIRIT_STONES`（200） | 灵石不足，转让宗主之位需要 200 灵石（你目前有 N 灵石） |

事务内三步：扣 200 灵石 → `sects.leader_player_id` 改为接收者 → **原宗主降为 `VICE_LEADER`**、接收者升为 `LEADER`。返回文案会说明"从此退居副宗主之位"。

## 解散宗门

`/宗门 disband`（`disbandSect`）——仅宗主可用。事务内依次删除：`sect_warehouse` → `sect_applications` → `sect_members` → `sects`。

::: danger 解散不可恢复
仓库中的所有物品、成员关系、申请记录会一并物理删除。若表启用了外键（`dialect.supportsForeignKeysInCreateTable()` 为真），`sect_members`/`sect_applications`/`sect_warehouse` 还有 `ON DELETE CASCADE` 指向 `sects`，删除顺序虽已显式列出，但整体是硬删除。
:::

## 宗门战（实验性）

`/宗门 war <宗门名>`（`declareWar`）。由实验性插件开关控制：

```java
/** 实验性插件名：宗门战（开关见 config/plugins.yml 的 plugins.experimental_sect_war，默认关闭）。 */
private static final String SECT_WAR_PLUGIN = "experimental_sect_war";

if (!com.mtxgdn.plugin.BuiltInPluginRegistry.getInstance().isEnabledOrUnknown(SECT_WAR_PLUGIN)) {
    result.put("success", false);
    result.put("message", "宗门战为实验性内容，当前未开放（可在 config/plugins.yml 中启用 experimental_sect_war）");
    return result;
}
```

配置默认值（`src/main/resources/plugins.yml`）：

```yaml
experimental_sect_war: false         # 宗门战（实验性，默认关闭）
```

::: warning 门控覆盖三个入口
源码注释说明：宗门战停用后，**REST / WebSocket / 指令三个入口统一拒绝**，因为它们最终都调用 `SectService.declareWar`。注意判定用的是 `isEnabledOrUnknown`——开关项缺失时按"未知"处理并放行。
:::

### 宣战条件

| 常量 | 值 |
| --- | --- |
| `DECLARE_WAR_PRESTIGE_COST` | `1000` |
| `DECLARE_WAR_SPIRIT_STONE_COST` | `300` |
| `WAR_MEMBERS_PER_SIDE` | `5` |
| `WAR_WIN_PRESTIGE` | `500` |

| 校验 | 提示 |
| --- | --- |
| 自己是宗主 | 只有宗主才能发起宗门战 |
| 目标不是自己宗门 | 不能对自己的宗门宣战 |
| 目标宗门存在 | 目标宗门不存在 |
| 目标有成员 | 目标宗门没有成员 |
| 冷却 | 目标宗门刚经历过宗门战，还需等待 N 小时才能再次宣战 |
| 宗门声望 ≥ 1000 | 宗门声望不足，宣战需要 1000 声望（当前：X） |
| 个人灵石 ≥ 300 | 灵石不足，宣战需要 300 灵石（你目前有 N 灵石） |

冷却规则：**同一防守方 24 小时内只能被宣战一次**。实现是 `SELECT MAX(created_at) FROM sect_wars WHERE defender_sect_id = ?`，用 `24 * 3600 * 1000` 毫秒窗口计算剩余时间，剩余时间以小时向上取整（`Math.max(1, remaining / 3600000)`）。

宣战后事务内扣灵石 + 扣宗门声望。

### 战斗模拟

出战名单：`selectFighters(members, 5)`——按**境界降序**、同境界按**等级降序**取前 5 名。双方各 5 人，逐位对位单挑 `min(攻方人数, 守方人数)` 场。

单挑规则（`simulateDuel`）：

| 规则 | 内容 |
| --- | --- |
| 先手 | `aSpd >= bSpd` 则攻方先手 |
| 回合上限 | `maxRounds = 15` |
| 灵根再生 | 每回合开始，持有 `REGENERATION` 效果的一方回复 `maxHp × effectValue` |
| 伤害 | `calcWarDamage(atk, atkRoot, def, defRoot)` |
| 判定 | 任一方 HP ≤ 0 即结束；15 回合打满则比 **HP 百分比**，高者胜（`aPct >= bPct` 判攻方胜） |

伤害公式（`calcWarDamage`）：基础值取攻击力，攻击方灵根的 `SKILL_DAMAGE` 与 `DAMAGE_BOOST` 各按 `×(1 + 效果值)` 放大；暴击率在无 `CRIT_CHANCE` 灵根时为基础 5%，倍率 1.5 并叠加 `CRIT_DAMAGE` 效果值；随后 `+ random(0~10) - 5` 作随机浮动、`- 防御/3` 作防御减免、下限 1，最后若防御方有 `DAMAGE_REDUCTION` 再按 `×(1 - 效果值)` 削减，最终 `Math.max(1, round(dmg))`。

胜负判定：`attackerWins > defenderWins` 则攻方胜，否则守方胜（**平局算守方胜**）。

奖励与记录：

| 项 | 内容 |
| --- | --- |
| 胜方 | `prestige += WAR_WIN_PRESTIGE`（500） |
| 负方 | `prestige = MAX(0, prestige - 500)`（SQLite）/ `GREATEST(0, prestige - 500)`（MySQL） |
| 战报 | 写入 `sect_wars.battle_log`（TEXT，逐行文本），同时写入 `attacker_wins`、`defender_wins`、`winner_sect_id`、`prestige_stake` |

返回字段：`success`、`message`、`battleLog`、`attackerWins`、`defenderWins`、`winner`。指令侧在有战报时把 `message` 与 `battleLog` 拼接后回复。

::: warning 声望奖励与战报写入不在同一事务
扣灵石/扣声望在一个事务内，但后续的**声望奖励、负方扣声望、`sect_wars` 插入是三条独立语句**（共享一个 `Connection`，但未包在显式事务里）。若中途异常（如 `保存宗门战记录失败`），可能出现声望已结算而战报缺失的情况。
:::

## 贡献值

`addContribution(sectId, playerId, amount)`（供其他系统调用）：

- `UPDATE sect_members SET contribution = contribution + ? WHERE sect_id = ? AND player_id = ?`。
- 影响 0 行 → "更新失败，该玩家不在宗门中"。
- `amount > 0` 时同步 `UPDATE sects SET prestige = prestige + ? WHERE id = ?`，即**贡献值与宗门声望 1:1 增长**。

::: warning 贡献值没有"增加来源"的玩家指令
`SectCommand` 没有暴露"缴纳灵石换贡献"之类的入口，`addContribution` 是给内部其他模块调用的 API。玩家实际获得贡献值的路径目前只有**捐献物品**（且仅普通弟子）。
:::

## 数据表

`sects`（`DatabaseSchema.createSectsTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | 宗门 ID |
| `name` | `VARCHAR(32) NOT NULL UNIQUE` | 宗门名（唯一） |
| `description` | `VARCHAR(256) DEFAULT ''` | 描述，默认文案"一个新兴的修仙宗门" |
| `leader_player_id` | `BIGINT NOT NULL` | 宗主玩家 ID |
| `level` | `INT DEFAULT 1` | 宗门等级，上限 10 |
| `prestige` | `BIGINT DEFAULT 0` | 声望（创建时显式写 1000） |
| `max_members` | `INT DEFAULT 20` | 成员上限（升级时同步更新） |
| `leader_absent_since` | `BIGINT DEFAULT 0` | 宗主被标记缺位的时间戳，`0` = 在任 |
| `contest_until` | `BIGINT DEFAULT 0` | 竞争期截止时间戳，`0` = 无竞争期 |
| `contest_challenger_id` | `BIGINT NULL` | 竞争期挑战者玩家 ID |
| `contest_requested` | `INT DEFAULT 0` | 挑战者是否已发起（`1` = 等宗主应战） |
| `created_at` / `updated_at` | 时间戳 | 创建/更新时间 |

最后四个字段由 `DatabaseMigration` 以独立的 `ALTER TABLE` 补齐（每列一个 try/catch，
失败只记日志不中断启动），因此老库升级后可以直接使用，不需要手工改表。

`sect_members`（`DatabaseSchema.createSectMembersTable`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `sect_id` | `BIGINT NOT NULL` | 宗门 ID |
| `player_id` | `BIGINT NOT NULL`，**`UNIQUE (player_id)`** | 玩家 ID，**一个玩家只能属于一个宗门** |
| `role` | `VARCHAR(16) NOT NULL DEFAULT 'MEMBER'` | 职位；建表默认值 `MEMBER` 并不在业务代码中使用（业务只写 `LEADER`/`VICE_LEADER`/`ELDER`/`INNER_MEMBER`/`OUTER_MEMBER`） |
| `contribution` | `BIGINT DEFAULT 0` | 贡献值 |
| `joined_at` | 时间戳（默认当前时间） | 加入时间，成员列表次级排序键 |

`sect_applications`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `sect_id` / `player_id` | `BIGINT NOT NULL` | 申请宗门 / 申请人 |
| `message` | `VARCHAR(256) DEFAULT ''` | 申请留言 |
| `status` | `VARCHAR(16) NOT NULL DEFAULT 'pending'` | `pending` / `accepted` / `rejected` |
| `created_at` / `updated_at` | 时间戳 | 申请时间 / 处理时间 |

`sect_warehouse`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `sect_id` | `BIGINT NOT NULL` | 宗门 ID |
| `item_key` | `VARCHAR(128) NOT NULL` | 物品全 key |
| `quantity` | `INT NOT NULL DEFAULT 1` | 数量，**`UNIQUE (sect_id, item_key)`** |
| `donated_by_player_id` | `BIGINT DEFAULT NULL` | 最后一位捐献者（每次捐献覆盖） |
| `created_at` / `updated_at` | 时间戳 | 首次入仓 / 最近更新 |

`sect_wars`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | 主键 | |
| `attacker_sect_id` / `defender_sect_id` | `BIGINT NOT NULL` | 攻方 / 守方 |
| `winner_sect_id` | `BIGINT DEFAULT NULL` | 胜方 |
| `attacker_wins` / `defender_wins` | `INT DEFAULT 0` | 比分 |
| `prestige_stake` | `BIGINT DEFAULT 0` | 声望赌注（写入 `WAR_WIN_PRESTIGE`） |
| `battle_log` | `TEXT` | 完整战报文本 |
| `created_at` | 时间戳 | 宣战时间，**也是 24 小时冷却的判定依据** |

## 排序与展示

`getAllSects()` 按 `prestige DESC, level DESC`；`getTopSects(10)` 按 `prestige DESC LIMIT ?`；`getSectMembers()` 按 `LEADER → VICE_LEADER → ELDER → INNER_MEMBER → 其他` 的角色序号、同级按 `joined_at`。成员数由子查询 `(SELECT COUNT(*) FROM sect_members sm WHERE sm.sect_id = s.id)` 实时统计。成员列表里境界名缺失时回退显示 `"练气" + playerRealm + "层"`（`handleMembers`）。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 创建宗门报"境界不足" | `realm < 4`；帮助文案写的"金丹期"不准确，实际要求元婴期 |
| 入宗申请后无人处理 | 需要宗主/副宗主/长老执行 `/宗门 pending` 再 `/宗门 approve <玩家名>` |
| 宗主无法退出 | 宗门还有其他人时必须先 `transfer`、`stepdown`（退位）或 `disband` |
| 长老无法任命副宗主 | 长老只能任命内门弟子和外门弟子 |
| 管理职位捐献没加贡献 | 设计如此，防止"取出→捐献→取出"刷贡献 |
| 宗主一个月没上线，宗门没人能管 | 系统会在 `leader_absent_days`（默认 14 天）后标记缺位并按贡献自动继位；若已关闭该判定（设为 `0`），需要管理员手工处理 |
| 宗门显示"宗主缺位中"但一直没换人 | 宗门里没有其他成员（无候选时会清掉标记），或竞争期还没结束 |
| 竞争期到了但宗主没应战 | 到期后现任继续担任，只清字段 —— 这是设计如此 |
| 挑战者发起了挑战，宗主看不到 | 宗主执行 `/宗门 挑战`（不带参数）即可查看竞争期状态 |
| `/宗门 war` 报"实验性内容，当前未开放" | `plugins.experimental_sect_war` 为 `false`（默认） |
| 宣战报"还需等待 N 小时" | 该防守方 24 小时内已被宣战过 |
| 仓库物品"数量不足"但界面显示还有 | 取出是条件扣除，并发下先到先得；也可能是查询与扣除之间的时间差 |
