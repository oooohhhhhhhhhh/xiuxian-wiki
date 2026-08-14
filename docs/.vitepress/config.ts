import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '修仙世界 Wiki',
  description: '修仙世界游戏服务端官方文档（玩家指南 · 开发者文档）',
  base: '/xiuxian-wiki/',
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/guide/quickstart' },
      { text: '玩家指南', link: '/player/spiritual-root' },
      { text: '开发者文档', link: '/dev/architecture' },
      { text: 'GitHub', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          collapsed: false,
          items: [
            { text: '项目简介', link: '/guide/overview' },
            { text: '快速开始', link: '/guide/quickstart' },
          ],
        },
      ],

      '/player/': [
        {
          text: '核心系统',
          collapsed: false,
          items: [
            { text: '灵根系统', link: '/player/spiritual-root' },
            { text: '境界一览', link: '/player/realm-list' },
            { text: '境界突破与天劫', link: '/player/realm-breakthrough' },
            { text: '修炼系统', link: '/player/cultivation' },
            { text: '功法系统', link: '/player/techniques' },
            { text: '技能系统', link: '/player/skills' },
            { text: 'Buff 系统', link: '/player/buff-system' },
          ],
        },
        {
          text: '战斗系统',
          collapsed: false,
          items: [
            { text: 'PVE 战斗与 Boss', link: '/player/pve-combat' },
            { text: 'PVP 对战', link: '/player/pvp-combat' },
            { text: '阵法系统', link: '/player/formation' },
          ],
        },
        {
          text: '探索系统',
          collapsed: false,
          items: [
            { text: '游历探索', link: '/player/exploration' },
            { text: '游历事件一览', link: '/player/exploration-events' },
            { text: '秘境探索', link: '/player/secret-realm' },
            { text: '世界地图', link: '/player/map' },
            { text: '洞府系统', link: '/player/cave' },
            { text: '季节系统', link: '/player/season' },
          ],
        },
        {
          text: '养成与生产',
          collapsed: false,
          items: [
            { text: '制造系统', link: '/player/crafting' },
            { text: '装备与强化', link: '/player/equipment' },
            { text: '农场系统', link: '/player/farm' },
            { text: '称号系统', link: '/player/titles' },
          ],
        },
        {
          text: '经济系统',
          collapsed: false,
          items: [
            { text: '经济与货币', link: '/player/economy' },
            { text: '坊市交易', link: '/player/market' },
            { text: '能量转化', link: '/player/energy' },
          ],
        },
        {
          text: '社交系统',
          collapsed: false,
          items: [
            { text: '宗门系统', link: '/player/sect' },
            { text: '好友与聊天', link: '/player/friends' },
            { text: '每日系统', link: '/player/daily' },
            { text: '答题系统', link: '/player/quiz' },
          ],
        },
        {
          text: '游戏数据',
          collapsed: false,
          items: [
            { text: '物品列表', link: '/player/item-list' },
            { text: '称号列表', link: '/player/title-list' },
          ],
        },
      ],

      '/dev/': [
        {
          text: '总览',
          collapsed: false,
          items: [
            { text: '架构总览', link: '/dev/architecture' },
            { text: '配置说明', link: '/dev/config' },
            { text: '部署指南', link: '/dev/deployment' },
          ],
        },
        {
          text: 'API 接口',
          collapsed: false,
          items: [
            { text: 'REST API', link: '/dev/rest-api' },
            { text: 'WebSocket 协议', link: '/dev/websocket' },
            { text: 'QQ 机器人指令', link: '/dev/qq-commands' },
          ],
        },
        {
          text: '开发指南',
          collapsed: false,
          items: [
            { text: '权限系统', link: '/dev/permissions' },
            { text: '数据库设计', link: '/dev/database' },
            { text: '插件开发', link: '/dev/plugin-development' },
            { text: '适配器与外部接入', link: '/dev/adapters' },
            { text: '内部服务 API', link: '/dev/internal-api' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索',
            buttonAriaLabel: '搜索文档',
          },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server' },
    ],

    footer: {
      message: '修仙世界 © 2026',
      copyright: '文档随服务端 V1.4.1-beta1 同步',
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short',
      },
    },

    editLink: {
      pattern: 'https://github.com/oooohhhhhhhhhh/xiuxian-wiki/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    outline: {
      level: [2, 3],
      label: '页面导航',
    },
  },

  markdown: {
    theme: 'github-dark',
    lineNumbers: true,
  },
})
