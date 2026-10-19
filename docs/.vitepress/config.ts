import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '修仙世界 Wiki',
  description: '修仙世界游戏服务端官方文档（安装运维 · 玩家玩法 · 开发者文档 · 数据参考）',
  base: '/xiuxian-wiki/',
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '安装运维', link: '/guide/install' },
      { text: '玩家玩法', link: '/player/' },
      { text: '开发者文档', link: '/dev/architecture' },
      { text: '数据参考', link: '/reference/items' },
      {
        text: '链接',
        items: [
          { text: 'GitHub 仓库', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server' },
          { text: '问题反馈', link: 'https://github.com/oooohhhhhhhhhh/xiuxian-server/issues' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '安装与运维',
          collapsed: false,
          items: [
            { text: '项目总览', link: '/guide/' },
            { text: '安装与首次启动', link: '/guide/install' },
            { text: '配置详解', link: '/guide/config' },
            { text: '插件开关', link: '/guide/plugins' },
            { text: '生产部署与升级', link: '/guide/deploy' },
            { text: '常见问题', link: '/guide/faq' },
          ],
        },
      ],

      '/player/': [
        {
          text: '总览',
          collapsed: false,
          items: [
            { text: '玩法总览与全指令表', link: '/player/' },
            { text: '账号与角色', link: '/player/account' },
          ],
        },
        {
          text: '修炼与成长',
          collapsed: false,
          items: [
            { text: '修炼系统', link: '/player/cultivation' },
            { text: '境界与突破', link: '/player/realm' },
            { text: '新手引导', link: '/player/guide' },
            { text: '灵根系统', link: '/player/spiritual-root' },
            { text: '功法系统', link: '/player/techniques' },
            { text: '技能系统', link: '/player/skills' },
            { text: 'Buff 系统', link: '/player/buff' },
            { text: '称号系统', link: '/player/titles' },
            { text: '阵法系统', link: '/player/formation' },
          ],
        },
        {
          text: '战斗',
          collapsed: false,
          items: [
            { text: 'PVE 战斗', link: '/player/combat' },
            { text: 'PVP 对战', link: '/player/pvp' },
            { text: '世界 Boss', link: '/player/world-boss' },
          ],
        },
        {
          text: '探索与地图',
          collapsed: false,
          items: [
            { text: '游历探索', link: '/player/exploration' },
            { text: '秘境探索', link: '/player/secret-realm' },
            { text: '世界地图', link: '/player/map' },
            { text: '野外（无限分片世界）', link: '/player/wilderness' },
            { text: '洞府系统', link: '/player/cave' },
            { text: '季节系统', link: '/player/season' },
          ],
        },
        {
          text: '物品与生产',
          collapsed: false,
          items: [
            { text: '物品系统', link: '/player/items' },
            { text: '装备与强化', link: '/player/equipment' },
            { text: '炼丹与锻造', link: '/player/crafting' },
            { text: '灵田农场', link: '/player/farm' },
            { text: '能量转化', link: '/player/energy' },
          ],
        },
        {
          text: '经济',
          collapsed: false,
          items: [
            { text: '经济系统', link: '/player/economy' },
            { text: '坊市交易', link: '/player/market' },
          ],
        },
        {
          text: '社交与日常',
          collapsed: false,
          items: [
            { text: '宗门系统', link: '/player/sect' },
            { text: '社交系统', link: '/player/social' },
            { text: '每日系统', link: '/player/daily' },
          ],
        },
      ],

      '/dev/': [
        {
          text: '入门',
          collapsed: false,
          items: [
            { text: '开发者文档索引', link: '/dev/' },
            { text: '架构总览', link: '/dev/architecture' },
            { text: '数据库设计', link: '/dev/database' },
            { text: '内部服务 API', link: '/dev/internal-api' },
          ],
        },
        {
          text: '对外接口',
          collapsed: false,
          items: [
            { text: 'REST API', link: '/dev/rest-api' },
            { text: 'WebSocket 协议', link: '/dev/websocket' },
            { text: '指令框架', link: '/dev/commands' },
          ],
        },
        {
          text: '扩展开发',
          collapsed: false,
          items: [
            { text: '权限系统', link: '/dev/permissions' },
            { text: '多语言（i18n）', link: '/dev/i18n' },
            { text: '消息通道与适配器', link: '/dev/adapters' },
            { text: '插件开发', link: '/dev/plugin-dev' },
            { text: 'Web 管理控制台', link: '/dev/webadmin' },
          ],
        },
      ],

      '/reference/': [
        {
          text: '数据参考',
          collapsed: false,
          items: [
            { text: '物品全表', link: '/reference/items' },
            { text: '境界全表', link: '/reference/realms' },
            { text: '配置项全表', link: '/reference/config-keys' },
            { text: '数据文件与目录', link: '/reference/data-files' },
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
      message: '修仙世界 · 服务端文档',
      copyright: '以源码为准，随版本更新',
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short',
      },
    },

    outline: {
      level: [2, 3],
      label: '本页导航',
    },

    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
  },

  markdown: {
    // 浅色 / 深色各配一套高亮主题。
    // 原来只写单个 'github-dark'：shiki 会把深色主题的浅色字（如 #E1E4E8）
    // 直接内联成 style="color:#E1E4E8"，而代码块背景在浅色模式下是浅灰
    // （--vp-code-block-bg → --vp-c-bg-alt），结果浅色模式里代码几乎看不见。
    // 写成 { light, dark } 后 shiki 输出 --shiki-light / --shiki-dark 变量，
    // 由 vitepress 默认主题的 .vp-code span 规则按当前模式切换。
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: true,

    // VitePress 原生不认 ```mermaid，默认会当成未知语言丢进普通代码块，
    // 于是线上看到的就是一大段 mermaid 源码。
    // 这里只把它换成一段带源码的容器，真正的画图在 theme/index.ts 里做。
    config: (md) => {
      const defaultFence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (/^mermaid(\s|$)/.test(token.info.trim())) {
          // v-pre 阻止 Vue 把图里的 {{...}}（mermaid 的六边形节点语法）
          // 当成插值表达式；内容转义后放进 <pre>，Mermaid 读取其 innerHTML 还原源码。
          return `<pre class="mermaid" v-pre>${md.utils.escapeHtml(token.content)}</pre>\n`
        }
        return defaultFence(tokens, idx, options, env, self)
      }
    },
  },
})
