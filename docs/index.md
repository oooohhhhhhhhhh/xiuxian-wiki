---
layout: home

hero:
  name: 修仙世界
  text: 服务端文档
  tagline: 一个可自托管的修仙题材游戏服务端 —— QQ 机器人 / Minecraft / REST / WebSocket 多端接入
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/install
    - theme: alt
      text: 玩家玩法
      link: /player/
    - theme: alt
      text: 开发者文档
      link: /dev/architecture

features:
  - icon: 🧘
    title: 修炼与境界
    details: 打坐闭关、离线收益、心魔劫、境界突破与天劫（连败增益 + 凝实极境）、转世重修。修炼速度由境界、季节、地点、灵根、功法、称号、天象、阵法八项倍率累乘决定。
  - icon: 🗺️
    title: 探索与秘境
    details: 游历随机事件、世界地图与灵气加成、十座秘境的层级与掉落、洞府灵力收集、季节轮转。
  - icon: ⚔️
    title: 战斗系统
    details: PVE 战斗与 Boss、PVP 挑战与决斗、世界 Boss（全服共享血量 + 伤害分红）、技能与战斗策略、阵法加成、装备强化与属性成长。
  - icon: 🏪
    title: 经济与交易
    details: 坊市挂单（限时自动下架、成交价格历史）、拍卖行、灵庄、商店、签到；灵石四档按面额自动压缩；手续费随灵根特效浮动。
  - icon: 🏯
    title: 宗门与社交
    details: 宗门创建与管理、宗门仓库、宗主退位与弃坑自动继位、竞争期争夺战、好友与聊天、组队、排行榜、玩家搜索。
  - icon: 🔌
    title: 多端接入
    details: OneBot 与 QQ 官方机器人、Minecraft 内嵌通道、REST API、WebSocket、Web 管理控制台，共用同一套玩法逻辑。
  - icon: 🧩
    title: 插件化
    details: 25 个内置玩法模块可按需启停（另有 2 个实验性插件与 4 个消息通道开关），支持第三方插件 jar。停用后其指令、接口与定时任务一并失效。
  - icon: 🗄️
    title: 数据与运维
    details: SQLite / MySQL 双支持，启动时自动幂等迁移；玩家数据文件化存储；升级只需替换 jar。
---

## 这是什么

一个用 Java 写的修仙题材游戏服务端。玩家可以通过 **QQ 群/私聊**、**Minecraft 内嵌通道**、
**REST API** 或 **WebSocket** 任意一端游玩，所有入口最终调用同一套玩法服务，
不存在"某个端功能少一块"的情况。

## 从哪看起

| 你的角色 | 建议入口 |
| --- | --- |
| 想自己开一个服 | [安装与首次启动](/guide/install) → [配置详解](/guide/config) → [生产部署](/guide/deploy) |
| 想了解游戏怎么玩 | [玩家玩法总览与全指令表](/player/) |
| 想写客户端 / 机器人 | [REST API](/dev/rest-api) · [WebSocket 协议](/dev/websocket) · [指令框架](/dev/commands) |
| 想改服务端代码 | [架构总览](/dev/architecture) → [数据库设计](/dev/database) → [内部服务 API](/dev/internal-api) |
| 想写插件 | [插件开发](/dev/plugin-dev) |
| 想查具体数据 | [物品全表](/reference/items) · [境界全表](/reference/realms) · [配置项全表](/reference/config-keys) |

::: tip 文档与代码同步
本套文档以服务端源码为唯一依据逐项核对写成，涉及数值（倍率、费率、默认值）的地方
均取自代码而非估计值。若文档与代码不一致，以代码为准。
:::

## 技术栈

| 项目 | 说明 |
| --- | --- |
| 语言 / 构建 | Java 23、Maven，打包为可直接 `java -jar` 运行的 shaded jar |
| HTTP / WebSocket | Jersey 4 + Grizzly |
| 数据库 | SQLite（默认，零配置）或 MySQL，启动时自动迁移 |
| 配置 | SnakeYAML；内置模板 + 外部 `config/` 覆盖 |
| 管理台 | 内置静态 Web 控制台（原生 ES Module，无构建步骤） |
| 机器人接入 | OneBot 协议 / QQ 官方机器人 API |
