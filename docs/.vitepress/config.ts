import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '修仙世界 Wiki',
  description: '修仙世界游戏服务端官方文档',
  cleanUrls: true,
  
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '游戏系统', link: '/spiritual-root' },
      { text: '技术文档', link: '/rest-api' },
      { text: 'GitHub', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server' }
    ],
    
    sidebar: [
      {
        text: '🎮 游戏系统',
        collapsed: false,
        items: [
          {
            text: '核心系统',
            collapsed: true,
            items: [
              { text: '灵根系统', link: '/spiritual-root' },
              { text: '境界突破', link: '/realm-breakthrough' },
              { text: '修炼系统', link: '/cultivation' },
              { text: '农场系统', link: '/farm' },
              { text: 'Buff系统', link: '/buff-system' }
            ]
          },
          {
            text: '战斗系统',
            collapsed: true,
            items: [
              { text: 'PVP对战', link: '/pvp-combat' },
              { text: 'PVE战斗', link: '/pve-combat' }
            ]
          },
          {
            text: '探索系统',
            collapsed: true,
            items: [
              { text: '游历探索', link: '/exploration' },
              { text: '秘境探索', link: '/secret-realm' }
            ]
          },
          {
            text: '社交经济',
            collapsed: true,
            items: [
              { text: '坊市交易', link: '/market' },
              { text: '宗门系统', link: '/sect' },
              { text: '好友系统', link: '/friends' }
            ]
          },
          {
            text: '辅助系统',
            collapsed: true,
            items: [
              { text: '制造系统', link: '/crafting' },
              { text: '装备系统', link: '/equipment' },
              { text: '技能系统', link: '/skills' },
              { text: '称号系统', link: '/titles' }
            ]
          }
        ]
      },
      {
        text: '🛠️ 技术文档',
        collapsed: false,
        items: [
          { text: 'REST API', link: '/rest-api' },
          { text: 'WebSocket协议', link: '/websocket' },
          { text: 'QQ机器人指令', link: '/qq-commands' },
          { text: '权限系统', link: '/permissions' },
          { text: '插件开发', link: '/plugin-development' },
          { text: '部署指南', link: '/deployment' }
        ]
      },
      {
        text: '📊 游戏数据',
        collapsed: false,
        items: [
          { text: '物品列表', link: '/item-list' },
          { text: '秘境列表', link: '/realm-list' },
          { text: '游历事件', link: '/exploration-events' },
          { text: '称号列表', link: '/title-list' }
        ]
      }
    ],
    
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索',
            buttonAriaLabel: '搜索'
          },
          modal: {
            displayDetails: '显示详情',
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询',
            footer: {
              selectText: '选择',
              navigateText: '切换'
            }
          }
        }
      }
    },
    
    footer: {
      message: '修仙世界 © 2026',
      copyright: '版本 v1.0.0'
    },
    
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    },
    
    editLink: {
      pattern: 'https://github.com/oooohhhhhhhhhh/xiuxian-wiki/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    }
  },
  
  markdown: {
    theme: 'github-dark',
    lineNumbers: true
  }
})
