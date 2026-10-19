/**
 * 校验 wiki 里内部链接的目标文件都存在。
 *
 * 为什么要这个脚本：vitepress build 在这台机器上会挂在
 * "spawn UNKNOWN"（getGitTimestamp 要 fork git，而沙箱不允许
 * 管道式 spawn），于是 build 阶段的死链检查跑不起来。
 * 死链是文档最常见的退化方式，不能因为构建跑不了就不检查。
 *
 * 用法: node check-links.mjs [起始目录]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'docs';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.vitepress') continue;
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.md')) files.push(full);
  }
})(root);

let bad = 0, checked = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  // markdown 链接 ](target)，排除外链与锚点
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    let target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = target.split('#')[0];
    if (!target) continue;

    checked++;
    const base = path.dirname(file);
    const resolved = target.startsWith('/')
      ? path.join(root, target.slice(1))
      : path.resolve(base, target);

    // 允许 目录/index.md、.md、无后缀
    const candidates = [
      resolved,
      resolved + '.md',
      path.join(resolved, 'index.md'),
    ];
    if (!candidates.some(c => fs.existsSync(c))) {
      bad++;
      console.log('死链: ' + file + '  →  ' + m[1]);
    }
  }
}
console.log('\n检查 ' + checked + ' 条内部链接，死链 ' + bad + ' 条');
process.exit(bad ? 1 : 0);
