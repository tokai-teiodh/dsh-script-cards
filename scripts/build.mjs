// dsh-script-cards — 客户端半边构建：把 src/*.js 按顺序拼成 lib/client.js
//
// 为什么要拼：客户端半边必须是**一个** `__ModuleLoader__.load(...)` 调用，
// 但两千多行挤在一个文件里没法维护，而且新字段/新视图每次都要整文件重写。
// 所以源码拆成 src/ 下的若干片段，构建时按 PARTS 顺序拼进同一个 factory 作用域
// （片段之间共享作用域，所以函数声明可以直接互相调用）。
//
// 用法：node scripts/build.mjs        （npm run build）
//       node scripts/build.mjs --check（只校验产物是否与源码一致，不写文件）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'lib', 'client.js')

// 顺序即拼接顺序。函数声明会提升，所以片段之间的调用不受顺序限制，
// 但顶层的 `const` 必须在自己被使用之前先求值 —— 保持「基础设施在前」。
const PARTS = [
  '00-head',
  '10-css',
  '20-util',
  '30-model',
  '40-store',
  '50-api',
  '60-grid',
  '70-menu',
  '80-board',
  '85-boardview',
  '90-inspector',
  '95-panel',
  '99-apply',
]

const HEAD = `// dsh-script-cards — client half (browser)   ${'${VERSION_PLACEHOLDER}'}
//
// ⚠ 本文件由 scripts/build.mjs 从 src/*.js 生成，不要直接编辑；
//   改源码后跑 \`npm run build\`（或 \`npm run check\`）。
//
// 剧本档案面板：右侧栏停靠页 + 左侧栏全屏页。两个视图
//   方片   按类型分组的自适应方片网格（只收「存档类」卡片）
//   分支   两级画布：上级排章节、下级排章节内的情节（只收 chapter/node/condition/result）
//
// 卡片文件走宿主半边 Typert 桥（本包 lib/index.js）读写，结构图谱落盘到
// <工作区>/剧本档案/分支.json，随项目走、可纳入 git。桥不可用时退化为
// 「只读 + 浏览器 localStorage」，并在面板顶部提示。

window.__ModuleLoader__.load({
  id: 'dsh-script-cards',
  factory: function (require) {
`

const FOOT = `  },
})
`

function build() {
  const chunks = []
  const version = readVersion()
  chunks.push(HEAD.replace('${VERSION_PLACEHOLDER}', version))
  for (const name of PARTS) {
    const file = path.join(SRC, name + '.js')
    if (!fs.existsSync(file)) throw new Error('missing source part: ' + file)
    const text = fs.readFileSync(file, 'utf8').replace(/\s+$/, '')
    chunks.push('    // ═══ src/' + name + '.js ' + '═'.repeat(Math.max(0, 56 - name.length)) + '\n' + indent(text) + '\n')
  }
  chunks.push(FOOT)
  return chunks.join('\n')
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : '  ' + line))
    .join('\n')
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const minor = String(pkg.version || '0.0.0')
  const tag = pkg.dsh && pkg.dsh.versionTag ? String(pkg.dsh.versionTag) : ''
  return tag || ('v' + minor)
}

const check = process.argv.indexOf('--check') !== -1
const next = build()
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null

if (check) {
  if (prev !== next) {
    console.error('client.js is STALE — run: node scripts/build.mjs')
    process.exit(1)
  }
  console.log('build: up to date (' + next.length + ' bytes)')
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, next, 'utf8')
  console.log('build: lib/client.js <- ' + PARTS.length + ' parts (' + next.length + ' bytes)')
}
