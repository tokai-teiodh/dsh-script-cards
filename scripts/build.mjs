// dsh-script-cards — 客户端半边构建：把 src/*.js 按顺序拼成 lib/client.js
//
// 为什么要拼：客户端半边必须是**一个** `__ModuleLoader__.load(...)` 调用，
// 但两千多行挤在一个文件里没法维护，而且新字段/新视图每次都要整文件重写。
// 所以源码拆成 src/ 下的若干片段，构建时按 PARTS 顺序拼进同一个 factory 作用域
// （片段之间共享作用域，所以函数声明可以直接互相调用）。
//
// ⚠ 构建带**自检**（2026-10 加）：写完产物立刻跑一遍 tests/smoke.mjs，
//   不通过就把 lib/client.js 还原成构建前那一份并以非零退出。
//   起因是一次真实事故：改到一半 build 了一下，「能 build 但会白屏」的产物
//   （调用改名后的旧函数）留在盘上，应用一重启整个面板白掉 —— 渲染期错误
//   连崩溃日志都不写。自检让这种产物永远落不到盘上。
//   `--check` 那条路**不跑**自检（它只比对产物与源码是否一致，改产物的是上面那条）。
//
// 用法：node scripts/build.mjs        （npm run build，含自检）
//       node scripts/build.mjs --check（只校验产物是否与源码一致，不写文件）

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'lib', 'client.js')
const SMOKE = path.join(ROOT, 'tests', 'smoke.mjs')
// 自检的输出进临时文件、不进管道：管道在本机的受限沙箱里会 EPERM，
// 而构建是**任何人**都会跑的一步，不能挑环境。
const SMOKE_LOG = path.join(os.tmpdir(), 'dsh-script-cards-build-selfcheck.log')

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
  '92-doc',
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

/**
 * 产物自检：跑 tests/smoke.mjs（客户端半边那套无头测试）。
 * 输出重定向到临时文件（不用管道：受限沙箱下管道会 EPERM）。
 * @returns {{ ok: boolean, text: string, why: string }}
 */
function selfCheck() {
  let fd = null
  let res = null
  try {
    fd = fs.openSync(SMOKE_LOG, 'w')
    res = spawnSync(process.execPath, [SMOKE], { cwd: ROOT, stdio: ['ignore', fd, fd] })
  } catch (e) {
    return { ok: false, text: '', why: String(e && e.message ? e.message : e) }
  } finally {
    if (fd !== null) { try { fs.closeSync(fd) } catch (e) { /* 忽略 */ } }
  }
  const text = fs.existsSync(SMOKE_LOG) ? fs.readFileSync(SMOKE_LOG, 'utf8') : ''
  if (res && res.error) return { ok: false, text, why: String(res.error.message || res.error) }
  if (!res || res.status !== 0) return { ok: false, text, why: 'tests/smoke.mjs 退出码 ' + (res ? res.status : '?') }
  return { ok: true, text, why: '' }
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
  const res = selfCheck()
  if (!res.ok) {
    // 回滚：宁可留着上一份能跑的产物，也不让「能 build 但会白屏」的那份落盘。
    if (prev === null) fs.rmSync(OUT, { force: true })
    else fs.writeFileSync(OUT, prev, 'utf8')
    const red = '\u001b[31m'
    const off = '\u001b[0m'
    console.error('')
    console.error(red + '!! 这次构建没通过自检，产物已回滚' + off + '（' + res.why + '）')
    console.error('   ' + (prev === null ? '构建前没有产物，已经把刚写的那份删掉' : '已还原成构建前那一份（' + prev.length + ' bytes）'))
    console.error('   修完源码再跑一次 `npm run build`；自检就是 tests/smoke.mjs。')
    console.error('   失败原因的最后几行：')
    const tail = String(res.text || '').split('\n').filter((l) => l.trim() !== '').slice(-20)
    for (const l of tail) console.error('   | ' + l)
    process.exit(1)
  }
  const line = String(res.text).split('\n').filter((l) => l.indexOf('ALL GREEN') !== -1).pop()
  console.log('build: 自检通过 — ' + (line ? line.trim() : 'tests/smoke.mjs 绿'))
}
