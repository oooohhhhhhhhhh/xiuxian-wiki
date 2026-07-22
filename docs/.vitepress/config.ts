import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '修仙世界 Wiki',
  description: '修仙世界游戏服务端官方文档',
  base: '/',
  cleanUrls: true,

  themeConfig: {

    nav: [
      { text: '首页', link: '/' },
      { text: '玩家指南', link: '/player/spiritual-root' },
      { text: '开发者文档', link: '/dev/rest-api' },
      { text: 'GitHub', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server' }
    ],

    sidebar: {
      '/player/': [
        {
          text: '核心系统',
          collapsed: false,
          items: [
            { text: '灵根系统', link: '/player/spiritual-root' },
            { text: '境界列表', link: '/player/realm-list' },
            { text: '境界突破', link: '/player/realm-breakthrough' },
            { text: '修炼系统', link: '/player/cultivation' },
            { text: '功法系统', link: '/player/techniques' },
            { text: 'Buff 系统', link: '/player/buff-system' },
          ]
        },
        {
          text: '战斗系统',
          collapsed: false,
          items: [
            { text: 'PVP 对战', link: '/player/pvp-combat' },
            { text: 'PVE 战斗', link: '/player/pve-combat' },
          ]
        },
        {
          text: '探索系统',
          collapsed: false,
          items: [
            { text: '游历探索', link: '/player/exploration' },
            { text: '秘境探索', link: '/player/secret-realm' },
          ]
        },
        {
          text: '社交与经济',
          collapsed: false,
          items: [
            { text: '宗门系统', link: '/player/sect' },
            { text: '好友系统', link: '/player/friends' },
            { text: '经济系统', link: '/player/economy' },
            { text: '坊市交易', link: '/player/market' },
          ]
        },
        {
          text: '洞府与农场',
          collapsed: false,
          items: [
            { text: '洞府系统', link: '/player/cave' },
            { text: '农场系统', link: '/player/farm' },
          ]
        },
        {
          text: '制造与养成',
          collapsed: false,
          items: [
            { text: '制造系统', link: '/player/crafting' },
            { text: '装备系统', link: '/player/equipment' },
            { text: '技能系统', link: '/player/skills' },
            { text: '称号系统', link: '/player/titles' },
          ]
        },
        {
          text: '游戏数据',
          collapsed: false,
          items: [
            { text: '物品列表', link: '/player/item-list' },
            { text: '游历事件', link: '/player/exploration-events' },
            { text: '称号列表', link: '/player/title-list' },
          ]
        },
      ],

      '/dev/': [
        {
          text: 'API 接口',
          collapsed: false,
          items: [
            { text: 'REST API', link: '/dev/rest-api' },
            { text: 'WebSocket 协议', link: '/dev/websocket' },
            { text: 'QQ 机器人指令', link: '/dev/qq-commands' },
          ]
        },
        {
          text: '开发指南',
          collapsed: false,
          items: [
            { text: '权限系统', link: '/dev/permissions' },
            { text: '插件开发', link: '/dev/plugin-development' },
            { text: '部署指南', link: '/dev/deployment' },
          ]
        },
        {
          text: '内部接口',
          collapsed: false,
          items: [
            { text: '核心服务 API', link: '/dev/internal-api' },
          ]
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
      copyright: '版本 v1.0.0',
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
