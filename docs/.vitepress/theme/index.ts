import DefaultTheme from 'vitepress/theme'
import './custom.css'
import type { Router } from 'vitepress/client'

/**
 * 浏览器端 Mermaid 渲染。
 *
 * VitePress 本身不支持 ```mermaid，config.ts 里的 markdown.config 只负责把它
 * 转成 <pre class="mermaid">源码</pre>，画图这一步在这里完成：
 *   - 懒加载 mermaid：只有页面真的出现图时才会去下载那个 chunk
 *   - 跟随浅色 / 深色模式重画（mermaid 的颜色是写死在 SVG 里的，换主题必须重渲染）
 *   - SPA 路由切换后重新扫描页面
 */

type MermaidApi = typeof import('mermaid').default

let mermaidPromise: Promise<MermaidApi> | null = null

/**
 * mermaid 默认（useMaxWidth: true）会把图缩放到容器宽度。
 * 架构图这种宽图算出来有 3700px，压进 688px 的正文栏后字号只剩 3px，
 * 等于白画。这里统一按原始尺寸输出，超出部分交给外层容器横向滚动。
 */
const WIDE_DIAGRAM_TYPES = [
  'flowchart', 'swimlane', 'sequence', 'gantt', 'journey', 'class', 'state',
  'er', 'pie', 'quadrantChart', 'xyChart', 'requirement', 'mindmap', 'ishikawa',
  'kanban', 'timeline', 'gitGraph', 'c4', 'sankey', 'block', 'packet',
  'treeView', 'architecture', 'eventmodeling', 'radar', 'venn', 'cynefin',
]

const NATURAL_SIZE_CONFIG = Object.fromEntries(
  WIDE_DIAGRAM_TYPES.map((type) => [type, { useMaxWidth: false }]),
)

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default)
  }
  return mermaidPromise
}

/** VitePress 切换配色就是在 <html> 上加 / 去 .dark */
function currentTheme(): 'default' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'default'
}

async function renderMermaid(): Promise<void> {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (nodes.length === 0) return

  const theme = currentTheme()
  const pending: HTMLElement[] = []

  for (const node of nodes) {
    if (node.dataset.mermaidRendered === 'true') {
      // 已经画过：配色没变就别动，否则每次路由切换都要闪一下
      if (node.dataset.mermaidTheme === theme) continue
      // 配色变了：用最初保存的源码把容器还原，再交给 mermaid 重画
      node.textContent = node.dataset.mermaidSource ?? ''
      node.removeAttribute('data-processed')
    } else {
      // 第一次渲染前先留一份源码（mermaid 渲染后会把它替换成 SVG）
      node.dataset.mermaidSource = node.textContent ?? ''
    }
    node.dataset.mermaidTheme = theme
    pending.push(node)
  }

  if (pending.length === 0) return

  try {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      ...NATURAL_SIZE_CONFIG,
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: 'inherit',
    })
    await mermaid.run({ nodes: pending })
    for (const node of pending) {
      node.dataset.mermaidRendered = 'true'
    }
  } catch (err) {
    // 渲染失败时容器里还留着源码，不会白屏
    console.error('[mermaid] 渲染失败：', err)
  }
}

/**
 * 首次进入页面时 onAfterRouteChanged 是在 app.mount() 之前触发的，
 * 此时 DOM 还是服务端预渲染的结果，直接改会打断 hydration，
 * 所以推迟一个宏任务，等挂载完成再画。
 */
function renderAfterMount(): void {
  setTimeout(() => {
    void renderMermaid()
  }, 0)
}

function setupMermaid(router: Router): void {
  router.onAfterRouteChanged = () => renderAfterMount()

  // 切换浅色 / 深色时重画（renderMermaid 内部会判断配色是否真的变了）
  new MutationObserver(() => {
    void renderMermaid()
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  // 兜底：onAfterRouteChanged 万一没覆盖到首屏，load 之后再扫一次
  if (document.readyState === 'complete') {
    renderAfterMount()
  } else {
    window.addEventListener('load', renderAfterMount, { once: true })
  }
}

export default {
  extends: DefaultTheme,
  enhanceApp({ router }: { router: Router }) {
    // 服务端渲染时也会走 enhanceApp，这里必须挡掉
    if (typeof window === 'undefined') return
    setupMermaid(router)
  },
}
