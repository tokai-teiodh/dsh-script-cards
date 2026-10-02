// Headless smoke test for the dsh-script-cards client half.
//   node tests/smoke.mjs
//
// Drives the real lib/client.js through a minimal React substitute
// (tests/mini-react.mjs) and a fake host bridge, then exercises what the panel
// does: the two card families, the two-level board with a browser-style nav bar,
// the four card shapes, right-click menus, zoom/pan, the expand-and-blur
// animation, configurable archive directory names, a customisable colour
// palette, and — most importantly — that edits actually go back to disk through
// the bridge.
//
// What it does NOT cover: real DOM layout, CSS, SVG markers, and the real
// Typert gateway. Those still need a DSH restart.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHarness } from './mini-react.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.join(HERE, '..')
const CLIENT = path.join(PKG, 'lib', 'client.js')
// 角标必须等于包自己声明的 versionTag —— 别在这里写死版本号
const VERSION_TAG = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).dsh.versionTag

const ROOT = 'C:/proj'
const ARCHIVE_DIR = ROOT + '/剧本档案'
const CARDS_DIR = ARCHIVE_DIR + '/卡片'
const ARCH_DIR = ARCHIVE_DIR + '/归档'
const DOCS_DIR = ARCHIVE_DIR + '/文档'
const GRAPH = ARCHIVE_DIR + '/分支.json'

const G1 = 'card/chapter-g1.md'
const G2 = 'card/chapter-g2.md'
const N1 = 'card/node-n1.md'
const N2 = 'card/node-n2.md'
const N3 = 'card/node-n3.md'

let failures = 0
let checks = 0
function ok(cond, label, detail) {
  checks++
  if (cond) console.log('  ok    ' + label)
  else {
    failures++
    console.log('  FAIL  ' + label + (detail === undefined ? '' : '   -- got ' + JSON.stringify(detail)))
  }
}
function eq(got, want, label) { ok(got === want, label, got) }
function has(hay, needle, label) { ok(String(hay).indexOf(needle) !== -1, label, hay) }

const tick = () => new Promise((r) => setTimeout(r, 0))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── fixture: a virtual archive + a fake host bridge ──────────────────────────
// 全是中性的占位内容：这里只测面板行为，不该夹带任何真实剧本设定。
function md(meta, body) {
  const keys = ['id', 'type', 'title', 'code', 'chapter', 'mode', 'when', 'order', 'summary', 'tags', 'color', 'created', 'updated', 'source']
  const lines = ['---']
  for (const k of keys) if (meta[k] !== undefined && meta[k] !== '') lines.push(k + ': ' + meta[k])
  lines.push('---')
  return lines.join('\n') + '\n\n' + (body || '正文内容。') + '\n'
}

function makeFiles() {
  const f = {}
  const card = (file, meta, body) => { f[CARDS_DIR + '/' + file] = md(meta, body) }
  // branch family: canvas only
  card('chapter-g1.md', { id: 'chapter-g1', type: 'chapter', title: '章节甲', code: 'G1.1', summary: '第一章的简介', tags: '共通, 主线', updated: '2026-01-02' })
  card('chapter-g2.md', { id: 'chapter-g2', type: 'chapter', title: '章节乙', code: 'G1.2', when: '第99天', summary: '第二章的简介', tags: '共通' })
  card('node-n1.md', { id: 'node-n1', type: 'node', title: '节点一', when: '第4天', order: '10', summary: '节点的简介', tags: '日常' },
    '## 角色\n- 甲\n- 乙\n\n## 场景\n- 某地\n\n## 内容\n- 发生了某件事\n')
  card('node-n2.md', { id: 'node-n2', type: 'node', title: '节点二', when: '第2天', order: '20', summary: '另一个节点' })
  // N3 的 order 最小，是为了让它在本章节里排第一 —— Z 段要验的就是「一层的第一张卡片
  // 带着长长的选项列时，也不会被自己的选项列推下去」（用户报的「默认不居中」）。
  card('node-n3.md', { id: 'node-n3', type: 'node', title: '节点三', mode: 'branch', when: '第7天', order: '05', summary: '有分支的节点' })
  card('condition-c1.md', { id: 'condition-c1', type: 'condition', title: '条件一', when: '第4天' })
  card('result-r1.md', { id: 'result-r1', type: 'result', title: '结果一' })
  // archive family: grid only
  card('project-p.md', { id: 'project-p', type: 'project', title: '项目', summary: '项目总览', tags: '项目' })
  card('character-x.md', { id: 'character-x', type: 'character', title: '人物甲', summary: '人物简介', tags: '人物' })
  card('setting-y.md', { id: 'setting-y', type: 'setting', title: '设定甲', summary: '设定简介', tags: '系统' })
  card('scene-s1.md', { id: 'scene-s1', type: 'scene', title: '场次甲', when: '第4天', summary: '场次简介', tags: '事件' })
  card('beat-b1.md', { id: 'beat-b1', type: 'beat', title: '节拍甲', when: '第1周', order: '10', summary: '节拍简介', tags: '主线' })
  card('dialogue-d1.md', { id: 'dialogue-d1', type: 'dialogue', title: '台词甲', summary: '台词素材', tags: '台词' })
  card('open-o1.md', { id: 'open-o1', type: 'open', title: '待定甲', summary: '待拍板', tags: '待定' })
  card('decision-c1.md', { id: 'decision-c1', type: 'decision', title: '决定甲', summary: '已拍板', tags: '创作决定' })
  card('reference-r1.md', { id: 'reference-r1', type: 'reference', title: '参考甲', summary: '参考资料', tags: '参考' })
  f[ARCH_DIR + '/2026-01-02-归档.md'] = md({ id: 'a1', type: 'archive', title: '一次归档', summary: '归档简介', tags: '归档' })
  // 每张卡片一份的独立文档：章节 / 节点两类才有入口，这里给 G1 / N2 / N3 各一份。
  // N1 故意没有文档（验「还没有文档」），condition 那份是**空文件**（空文档不算有文档 ——
  // 保存空内容时本来就会把文件删掉，见 50-api 的 writeDoc）。
  f[DOCS_DIR + '/chapter-g1.md'] = '# 章节甲 · 文档\n\n这一章的写作笔记：开场要先冷。\n'
  f[DOCS_DIR + '/node-n2.md'] = '节点二的文档：这里放备注。\n'
  f[DOCS_DIR + '/node-n3.md'] = '节点三的文档。\n'
  f[DOCS_DIR + '/condition-c1.md'] = ''
  f[GRAPH] = JSON.stringify({
    version: 1,
    chapters: [G1, G2],
    nodes: {
      [G1]: { x: 40, y: 30, cx: null, cy: null, chapter: '', mode: '', color: '' },
      [G2]: { x: 320, y: 30, cx: null, cy: null, chapter: '', mode: '', color: '' },
      [N1]: { x: null, y: null, cx: 40, cy: 30, chapter: G1, mode: '', color: '#3FA46A' },
      [N2]: { x: null, y: null, cx: 280, cy: 30, chapter: G1, mode: '', color: '' },
      [N3]: { x: null, y: null, cx: 520, cy: 30, chapter: G1, mode: 'branch', color: '', choices: [{ id: 'o1', text: '选项甲', to: '' }] },
      'card/condition-c1.md': { x: null, y: null, cx: 40, cy: 220, chapter: G1, mode: '', color: '' },
      'card/result-r1.md': { x: null, y: null, cx: 280, cy: 220, chapter: G1, mode: '', color: '' },
      'card/node-gone.md': { x: null, y: null, cx: 760, cy: 30, chapter: G1, mode: '', color: '' },
    },
    edges: [{ from: N1, to: N2, label: '顺流而下', choice: '' }, { from: G1, to: G2, label: '接着走', choice: '' }],
  }, null, 2)
  return f
}

const files = makeFiles()
const writes = []
const removes = []
const calls = []

function makeBridge() {
  return {
    async fsList(root, dir) {
      calls.push({ method: 'fsList', root, dir })
      const names = new Map()
      for (const p of Object.keys(files)) {
        if (!p.startsWith(dir + '/')) continue
        const rest = p.slice(dir.length + 1)
        if (rest.indexOf('/') !== -1) continue
        names.set(rest, { name: rest, type: 'file' })
      }
      if (!names.size) {
        const exists = Object.keys(files).some((p) => p.startsWith(dir + '/'))
        return { ok: true, value: { entries: [], missing: !exists } }
      }
      return { ok: true, value: { entries: Array.from(names.values()), missing: false } }
    },
    async fsRead(root, p) {
      if (!Object.prototype.hasOwnProperty.call(files, p)) {
        return { ok: false, error: { code: 'error.notFound', message: '没有这个文件' } }
      }
      return { ok: true, value: { text: files[p] } }
    },
    async fsWrite(root, p, text) {
      files[p] = String(text)
      writes.push({ path: p, text: String(text) })
      return { ok: true, value: { ok: true } }
    },
    async fsMkdir(root, dir) {
      calls.push({ method: 'fsMkdir', root, dir })
      return { ok: true, value: { ok: true } }
    },
    async fsRemove(root, p) {
      delete files[p]
      removes.push(p)
      return { ok: true, value: { ok: true } }
    },
    async fsStat(root, p) {
      // 大小要如实报：面板靠它判断「空文档不算有文档」。
      const has = Object.prototype.hasOwnProperty.call(files, p)
      return { ok: true, value: { exists: has, type: 'file', size: has ? String(files[p]).length : 0 } }
    },
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────
const h = createHarness()
h.installGlobals()
globalThis.window.__ModuleLoader__ = { load(def) { globalThis.__captured = def } }

await import(pathToFileURL(CLIENT).href)
const def = globalThis.__captured
ok(!!def && def.id === 'dsh-script-cards', 'ModuleLoader got id=dsh-script-cards')

const plugin = def.factory(function (name) {
  if (name === 'react') return h.React
  throw new Error('unexpected require: ' + name)
})
ok(typeof plugin.apply === 'function', 'factory returns { apply }')
ok(plugin.inject.indexOf('remote') !== -1, "inject contains 'remote' (needed by $mount)")
ok(plugin.inject.indexOf('remote.workspaceFiles') !== -1, "inject contains 'remote.workspaceFiles' (read-only fallback)")

const bridge = makeBridge()
const slots = {}
const mounted = []
const tabs = []
const effects = []

const remoteStub = {
  $mount(c) { mounted.push(c); return Promise.resolve(function () {}) },
  workspaceFiles: {
    async list() { return { ok: false, error: { code: 'error.notFound' } } },
    async readAll() { return { ok: false, error: { code: 'error.notFound' } } },
  },
}

const ctx = {
  effect(fn, label) { effects.push(label); const d = fn(); return typeof d === 'function' ? d : function () {} },
  get(name) {
    if (name === 'slots') return { inject(n, fn) { fn() }, register(d, comp) { slots[d.name + '|' + (d.key || d.id || '')] = comp } }
    if (name === 'sidebarRightTabs') return { register(d) { tabs.push(d); return function () {} } }
    if (name === 'sidebarRight') return { openTab() {} }
    if (name === 'remote') return remoteStub
    if (name === 'remote.scriptCardsFs') return bridge
    return undefined
  },
}
ctx.remote = remoteStub

plugin.apply(ctx)

eq(mounted.length, 1, 'apply calls remote.$mount once')
eq(mounted[0].package, 'dsh-script-cards', '$mount contribution package name')
eq(mounted[0].descriptors.length, 6, 'contribution declares 6 methods')
ok(mounted[0].descriptors.every((d) => d.namespace === 'scriptCardsFs'), 'every descriptor uses the scriptCardsFs namespace')
ok(mounted[0].descriptors.every((d) => d.parameters[0].wire === 'root'), 'every method takes root as its first wire field')
ok(mounted[0].descriptors.every((d) => d.parameters.every((p) => p.codec.mode === 'strict')), 'every parameter codec is strict')
eq(tabs.length, 1, 'right-sidebar tab type registered once')
ok(effects.some((l) => String(l).indexOf('styles') !== -1), 'styles are injected through ctx.effect')

const PanelComp = slots['main|script-cards']
ok(typeof PanelComp === 'function', 'main slot got the panel component')
ok(typeof slots['sidebar.right.pane.tab|dsh-script-cards/panel'] === 'function', 'sidebar.right.pane.tab got the panel component too')

const useSessions = (sel) => sel({ byId: { s1: { cwd: ROOT } } })
const view = h.mount(h.createElement(PanelComp, { sessionId: 's1', useSessions }))
await tick()
await tick()

// ── A. grid view: archive family only ────────────────────────────────────────
console.log('\nA. grid view (archive family)')
has(view.text(), VERSION_TAG, 'header badge is ' + VERSION_TAG)
has(view.text(), '9 张存档卡', 'archive-card count is right (branch family excluded)')
eq(view.findAll('sc-tile').length, 9, 'exactly 9 tiles', view.findAll('sc-tile').length)
const tileTitles = view.findAll('sc-tiletitle').map((n) => view.textOf(n))
ok(tileTitles.indexOf('章节甲') === -1, 'chapter cards do not appear in the grid', tileTitles)
ok(tileTitles.indexOf('节点一') === -1, 'node cards do not appear in the grid', tileTitles)
ok(tileTitles.indexOf('节拍甲') !== -1, 'beat cards do appear in the grid', tileTitles)
ok(view.findAll('sc-tags').length >= 1, 'tiles have a tag strip')

const tile0 = view.findAll('sc-tile')[0]
view.click(tile0)
await tick()
// 这一条同时守着一次真机崩溃：组件被当普通函数调用时，它的 hook 会算到**调用者**头上，
// 选中卡片让「详情」那几个 hook 多出来，真 React 直接抛
// "Rendered more hooks than during the previous render" —— 整个面板当场白掉，
// 用户报的就是这个（「在主页拖动选中文本，插件整个崩溃，什么东西都选不出来」）。
ok(!!view.findMaybe('sc-h1'), 'clicking a card opens its detail (the render that used to blow the panel up)')
ok(view.textOf(view.find('sc-detail')).indexOf('选一张卡片看正文') === -1, 'and the detail pane really switched to that card')
view.click(view.findAll('sc-icon')[0])
await tick()
const stored = JSON.parse(h.storage()['dsh-script-cards:state'] || '{}')
const rec = stored[ROOT] || {}
eq((rec.star || []).length, 1, 'star went into localStorage')
eq(rec.view, 'grid', 'the sibling field view was not clobbered')
ok(Array.isArray(rec.pin), 'the pin field is still there')

// ── B. board L1: chapters + browser-style nav ────────────────────────────────
console.log('\nB. board level 1 (chapters)')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()

eq(view.findAll('sc-card').length, 2, 'level 1 shows the two chapters', view.findAll('sc-card').length)
eq(view.findAll('sc-card').map((n) => n.props['data-type']).join(','), 'chapter,chapter', 'level 1 is all chapters')
has(view.text(), '剧本档案', 'address bar shows the root crumb')
ok(view.findAll('sc-navbtn').length >= 3, 'nav bar has back/forward/up/refresh')
eq(view.findAll('sc-dockcard').length, 0, 'every chapter is placed, so the dock is empty')
ok(view.findAll('sc-edge').length >= 1, 'edges between chapters are drawn')
eq(view.findAll('sc-elabel').length, 1, 'only the line that already has a name shows anything')
eq(view.textOf(view.findAll('sc-elabel')[0]), '接着走', 'and it shows that name')

// ── C. drill into a chapter, then back/forward ───────────────────────────────
console.log('\nC. double-click drill-down / back / forward')
const chCard = view.findAll('sc-card').filter((n) => view.textOf(n).indexOf('G1.1') !== -1)[0]
view.fire(chCard, 'onDoubleClick', {})
await tick()
has(view.text(), 'G1.1 章节甲', 'address bar shows chapter code + name')
const l2types = view.findAll('sc-card').map((n) => n.props['data-type'])
eq(l2types.length, 5, 'level 2 shows the 5 cards of this chapter', l2types)
ok(l2types.indexOf('chapter') === -1, 'no chapter cards inside level 2', l2types)
ok(l2types.indexOf('condition') !== -1 && l2types.indexOf('result') !== -1, 'level 2 has condition + result cards', l2types)

const backBtn = view.findAll('sc-navbtn')[0]
eq(backBtn.props.disabled, false, 'back button is enabled')
view.click(backBtn)
await tick()
eq(view.findAll('sc-card').length, 2, 'back returns to level 1')

const fwdBtn = view.findAll('sc-navbtn')[1]
eq(fwdBtn.props.disabled, false, 'forward button is enabled (history exists)')
view.click(fwdBtn)
await tick()
eq(view.findAll('sc-card').length, 5, 'forward returns to level 2')

// ── D. condition/result ports ────────────────────────────────────────────────
console.log('\nD. condition has out only, result has in only')
const condCard = view.findAll('sc-card').filter((n) => n.props['data-type'] === 'condition')[0]
const resultCard = view.findAll('sc-card').filter((n) => n.props['data-type'] === 'result')[0]
const portsOf = (node) => {
  const all = []
  const walk = (n) => {
    if (!n) return
    if (n.kind === 'host' && String(n.props.className || '').indexOf('sc-port') !== -1) all.push(n)
    if (n.children) n.children.forEach(walk)
  }
  walk(node)
  return all
}
eq(portsOf(condCard).map((n) => n.props['data-port']).join(','), 'out', 'condition card exposes only an out port')
eq(portsOf(resultCard).map((n) => n.props['data-port']).join(','), 'in', 'result card exposes only an in port')

// ── E. branch node choices + linking ─────────────────────────────────────────
console.log('\nE. branch node choices and linking')
const branchCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === N3)[0]
ok(!!branchCard, 'the branch node is on the canvas')
eq(view.findAll('sc-choice').length, 1, 'its one choice is rendered', view.findAll('sc-choice').length)
const fromPort = view.findAll('sc-port').filter((n) => n.props['data-port'] === 'out' && n.props['data-choice'] === 'o1')[0]
ok(!!fromPort, 'the choice port carries data-choice')
view.fire(fromPort, 'onPointerDown', { clientX: 200, clientY: 200 })
await tick()
// 落到「节点一」的入口上（按 data-key 找卡片，别按渲染顺序取第一个 —— 卡片的顺序由
// 章节内的 order 决定，改动 fixture 排序会让「第一个入口」变成别的卡片）
const toCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === N1)[0]
const toPort = (function () {
  const out = []
  const visit = (n) => { if (!n) return; out.push(n); if (n.children) for (const c of n.children) visit(c) }
  visit(toCard)
  return out.filter((n) => n.kind === 'host' && n.props && n.props['data-port'] === 'in')[0]
})()
view.fire(toPort, 'onPointerUp', { clientX: 210, clientY: 210 })
await tick()
ok(JSON.parse(files[GRAPH]).edges.some((e) => e.choice === 'o1'), 'the edge dragged from a choice was written to the graph file')
eq(JSON.parse(files[GRAPH]).nodes[N3].choices[0].to, N1, 'the choice remembers which node it leads to')

// ── F. dragging a card persists its position ─────────────────────────────────
console.log('\nF. dragging a card')
const moveCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
view.fire(moveCard, 'onPointerDown', { button: 0, clientX: 100, clientY: 100 })
await tick()
view.window('pointermove', { clientX: 180, clientY: 160 })
await tick()
view.window('pointerup', { clientX: 180, clientY: 160 })
await tick()
const movedRec = JSON.parse(files[GRAPH]).nodes[N2]
ok(movedRec && movedRec.cx !== 280, 'the dragged position was written back to the graph file', movedRec)

// ── G. 展开态默认是浮动窗口；全屏遮罩模式仍然在（可切换） ──────────────────────
// 用户拍板：默认改成可拖动 / 可缩放的**浮动窗口**；老的「全屏遮罩 + 背景虚化」不删，
// 作为每个窗口自己的一种模式留着。所以这里先验浮动默认（画布不虚化、没有遮罩），
// 再验切到全屏才出现遮罩与虚化 —— 原先那两条「一展开就虚化 / 就有遮罩」的断言
// 编码的是旧行为，随这次改动一起改。
console.log('\nG. expand: a floating window by default (fullscreen scrim is a mode)')
const expandTarget = view.findAll('sc-card').filter((n) => n.props['data-key'] === N1)[0]
view.fire(expandTarget, 'onDoubleClick', {})
await tick()
ok(String(view.find('sc-stage').props.className).indexOf('blur') === -1, 'phase 1: the canvas is not blurred')
await wait(60)
ok(String(view.find('sc-stage').props.className).indexOf('blur') === -1, 'a floating window leaves the canvas readable (no blur)')
const overlay = view.findMaybe('sc-expand')
ok(!!overlay, 'the expanded window exists')
ok(String(overlay.props.className).indexOf('open') !== -1, 'the expanded window is open')
ok(String(overlay.props.className).indexOf('sc-float') !== -1, 'and it defaults to the floating mode')
eq(view.findMaybe('sc-scrim'), null, 'floating mode draws no backdrop scrim (the canvas stays usable)')
has(view.textOf(overlay), '角色', 'expanded view lists the characters section')
has(view.textOf(overlay), '场景', 'expanded view lists the scene section')
has(view.textOf(overlay), '内容', 'expanded view lists the content section')
eq(Number(overlay.props.style.width), 460, 'the window keeps the shared 460 width')
eq(Number(overlay.props.style.height), 430, 'and the shared height')
// 切到全屏遮罩：老行为原样还在
const modeBtn = () => view.findAll('sc-expandb').filter((n) => /^(全屏|浮动)$/.test(view.textOf(n)))[0]
view.click(modeBtn())
await tick()
ok(!!view.findMaybe('sc-scrim'), 'switching to 全屏 brings the backdrop scrim back')
ok(String(view.find('sc-stage').props.className).indexOf('blur') !== -1, 'and the canvas (other cards) blur again')
ok(String(view.find('sc-expand').props.className).indexOf('sc-full') !== -1, 'the window is marked as fullscreen')
eq(view.textOf(modeBtn()), '浮动', 'the toggle now offers the way back to the floating mode')
view.click(modeBtn())
await tick()
eq(view.findMaybe('sc-scrim'), null, 'switching back to 浮动 removes the scrim again')
ok(String(view.find('sc-stage').props.className).indexOf('blur') === -1, 'and un-blurs the canvas')

// ── H. edit in the overlay and write back to the card file ───────────────────
console.log('\nH. edit -> write back to the card file')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('编辑') !== -1)[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the editor modal opened')
const whenInput = view.findAll('sc-inp').filter((n) => n.tag === 'input' && n.props.value === '第4天')[0]
ok(!!whenInput, 'the time input holds the current value')
view.fire(whenInput, 'onChange', { target: { value: '第5天 清晨' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('保存') !== -1)[0])
await tick()
await tick()
const savedWrite = writes.filter((w) => w.path === CARDS_DIR + '/node-n1.md').pop()
ok(!!savedWrite, 'saving wrote the card file back')
ok(savedWrite && savedWrite.text.indexOf('when: 第5天 清晨') !== -1, 'the frontmatter time was rewritten')
ok(savedWrite && savedWrite.text.indexOf('## 角色') !== -1, 'the body survived')

// ── H2. a branch node lists its choices below when expanded ──────────────────
console.log('\nH2. branch node expanded: choices listed below')
view.click(view.find('sc-expandx'))
await tick()
ok(!view.findMaybe('sc-expand'), 'the overlay closed')
const n3Card = view.findAll('sc-card').filter((n) => n.props['data-key'] === N3)[0]
view.fire(n3Card, 'onDoubleClick', {})
await wait(60)
const ov2 = view.findMaybe('sc-expand')
ok(!!ov2, 'the branch node expanded')
has(view.textOf(ov2), '选项 (1)', 'expanded branch node lists its choices below')
has(view.textOf(ov2), '选项甲', 'the choice text is shown')
has(view.textOf(ov2), '→ 节点一', 'the choice names where it goes (it was linked in E)')
ok(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('添加 / 编辑选项') !== -1).length === 1, 'there is a one-click add/edit entry')
view.click(view.find('sc-expandx'))
await tick()
ok(!!view.findAll('sc-btn').filter((n) => view.textOf(n) === '自动排列').length, 'auto-arrange is one click away in the status bar')

// ── I. right-click menus ─────────────────────────────────────────────────────
console.log('\nI. right-click menus')
const menuTarget = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
view.fire(menuTarget, 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
const menu = view.findMaybe('sc-menu')
ok(!!menu, 'right-clicking a card opens a menu')
const menuText = view.textOf(menu)
for (const item of ['复制', '剪切', '粘贴', '原地复制', '染色', '展开', '移出画布', '删除']) {
  has(menuText, item, 'menu has ' + item)
}
has(menuText, 'Ctrl+C', 'menu shows Ctrl+C')
has(menuText, 'Ctrl+X', 'menu shows Ctrl+X')
has(menuText, '编辑色卡', 'the colour block offers a swatch editor')
const swatches = view.findAll('sc-swatch')
eq(swatches.length, 8, '8 built-in swatches by default')
eq(swatches[0].props.style.background, '#E5484D', 'no personal palette ships in the code')
ok(!!view.findMaybe('sc-colorinput'), 'a colour wheel input is there')
view.click(swatches[0])
await tick()
eq(JSON.parse(files[GRAPH]).nodes[N2].color, '#E5484D', 'dyeing was written to the graph file')

const canvas = view.find('sc-canvas')
view.fire(canvas, 'onContextMenu', { clientX: 500, clientY: 400 })
await tick()
const emptyText = view.textOf(view.findMaybe('sc-menu'))
has(emptyText, '新建', 'empty-space menu offers create')
has(emptyText, '粘贴', 'empty-space menu offers paste')
has(emptyText, '自动排列', 'empty-space menu offers auto-arrange')
has(emptyText, '常用类型', 'favourite type is configurable')
has(emptyText, '新建节点', 'level-2 menu can create a node')
has(emptyText, '新建条件', 'level-2 menu can create a condition')
has(emptyText, '新建结果', 'level-2 menu can create a result')

// ── I2. custom swatch palette stays in the browser ───────────────────────────
console.log('\nI2. custom swatch palette')
view.fire(menuTarget, 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('编辑色卡') !== -1)[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the swatch editor opened')
const swatchInput = view.findAll('sc-colorinput').pop()
view.fire(swatchInput, 'onChange', { target: { value: '#123456' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('加一个') !== -1)[0])
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '保存')[0])
await tick()
const uiAfter = JSON.parse(h.storage()['dsh-script-cards:state'] || '{}')[ROOT] || {}
ok((uiAfter.swatches || []).indexOf('#123456') !== -1, 'the custom swatch is stored in localStorage only', uiAfter.swatches)
eq((uiAfter.swatches || []).length, 9, 'the editor starts from what you see and appends')
eq((uiAfter.star || []).length, 1, 'writing swatches did not clobber the star list')

// ── I3. configurable archive directory names ────────────────────────────────
console.log('\nI3. configurable archive directory names')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '设置')[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the settings dialog opened')
const archiveInput = view.findAll('sc-inp').filter((n) => n.props.value === '剧本档案')[0]
ok(!!archiveInput, 'the archive-dir field holds the current default')
view.fire(archiveInput, 'onChange', { target: { value: 'script-archive' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '保存')[0])
await tick()
await tick()
const uiDirs = JSON.parse(h.storage()['dsh-script-cards:state'] || '{}')[ROOT].dirs
eq(uiDirs.archive, 'script-archive', 'the new archive dir name was stored')
const lastList = calls.filter((c) => c.method === 'fsList').pop()
ok(lastList && lastList.dir.indexOf('script-archive') !== -1, 'the panel re-scanned using the new directory name', lastList)
eq(lastList.root, ROOT + '/script-archive', 'the bridge root follows the configured archive dir')
// 换回去，别影响后面的断言
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '设置')[0])
await tick()
const backInput = view.findAll('sc-inp').filter((n) => n.props.value === 'script-archive')[0]
view.fire(backInput, 'onChange', { target: { value: '剧本档案' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '保存')[0])
await tick()
await tick()
eq(view.findAll('sc-card').length, 5, 'panel is back on the original archive (still inside the chapter)')
has(view.text(), 'G1.1 章节甲', 'the chapter crumb still resolves')

// ── J. zoom ──────────────────────────────────────────────────────────────────
// 滚轮是插件自己用 ref + addEventListener 挂的（React 的 onWheel 是 passive 的，
// preventDefault 在它里面无效），所以派发也得走 h.el。每次都重查画布节点：无头渲染器
// 没有事件委托，抓着旧节点等于抓着旧闭包里的 view。
console.log('\nJ. zoom')
const wheel = (ev) => view.el(view.find('sc-canvas'), 'wheel', ev)
const before = view.find('sc-boardtip').props.children
wheel({ deltaY: -120, clientX: 400, clientY: 300 })
await tick()
const after = view.find('sc-boardtip').props.children
ok(String(after) !== String(before), 'a plain wheel (no modifier) changes the zoom', [before, after])
ok(parseInt(String(after), 10) > parseInt(String(before), 10), 'scrolling up zooms in', [before, after])
has(view.find('sc-stage').props.style.transform, 'scale(', 'the canvas scales through a transform (relative positions hold)')
ok(!/NaN/.test(String(view.find('sc-stage').props.style.transform)), 'the transform stays numeric')

// ── K. keyboard shortcuts ────────────────────────────────────────────────────
// 快捷键只在「最近一次点击落在画布上」时生效，所以先照着真实顺序派发一次 pointerdown
// （捕获阶段挂在 window 上那颗，见 X 段）。
console.log('\nK. keyboard shortcuts')
const selCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
view.fire(selCard, 'onPointerDown', { button: 0, clientX: 100, clientY: 100 })
view.window('pointerdown', { clientX: 100, clientY: 100 })
await tick()
view.window('pointerup', { clientX: 100, clientY: 100 })
await tick()
const writesBefore = writes.length
const nodesBeforePaste = Object.keys(JSON.parse(files[GRAPH]).nodes).length
const keyEvent = (key, extra) => Object.assign({ key, target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() {} }, extra || {})
view.window('keydown', keyEvent('c', { ctrlKey: true }))
await tick()
view.window('keydown', keyEvent('v', { ctrlKey: true }))
await tick()
await tick()
ok(writes.length > writesBefore, 'Ctrl+C then Ctrl+V duplicated a card onto disk', writes.length - writesBefore)
// 同一处 prune 语义：粘贴出来的副本也必须真的落到画布上（不然就是「卡片有了、画布上没有」）
eq(Object.keys(JSON.parse(files[GRAPH]).nodes).length, nodesBeforePaste + 1, 'the pasted copy got a canvas node too')

// ── L. orphan pruning ────────────────────────────────────────────────────────
console.log('\nL. orphan pruning')
const graphFinal = JSON.parse(files[GRAPH])
ok(!graphFinal.nodes['card/node-gone.md'], 'a node whose card file vanished was pruned from the graph')
ok(!graphFinal.edges.some((e) => e.from === 'card/node-gone.md'), 'its edges were pruned too')

// ── M. context-menu actions under the real event order ───────────────────────
// 真实浏览器里点一项菜单的顺序是 mousedown → mouseup → click。早先关菜单用的是
// window 上**捕获阶段**的 mousedown，菜单在 click 之前就被卸载了，于是每一项都
// 没反应（用户报的就是这个：右键 → 新建，什么都不弹）。这一段把那个顺序补上。
console.log('\nM. context-menu actions under the real event order')
view.fire(canvas, 'onContextMenu', { clientX: 520, clientY: 420 })
await tick()
ok(!!view.findMaybe('sc-menu'), 'right-clicking empty canvas opens the menu')
ok(!!view.findMaybe('sc-menuback'), 'a dismiss backdrop sits behind the menu')
const newItem = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('新建节点') !== -1)[0]
ok(!!newItem, 'the create-node item is in the menu')
view.window('mousedown', { target: null })
await tick()
ok(!!view.findMaybe('sc-menu'), 'a mousedown does not tear the menu down before the click lands')
view.click(newItem)
await tick()
ok(!!view.findMaybe('sc-modal'), 'choosing 新建节点 actually opens the editor')

const nodesBefore = Object.keys(JSON.parse(files[GRAPH]).nodes)
view.fire(view.find('sc-inp'), 'onChange', { target: { value: '新建的节点甲' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('保存（写回') !== -1)[0])
await tick()
await tick()
const newWrite = writes.filter((w) => w.path.indexOf('/卡片/') !== -1 && w.text.indexOf('新建的节点甲') !== -1).pop()
ok(!!newWrite, 'the new card was really written to disk', writes.map((w) => w.path))
ok(!!newWrite && newWrite.text.indexOf('type: node') !== -1, 'the new file carries node frontmatter', newWrite && newWrite.text)
ok(!view.findMaybe('sc-modal'), 'the editor closed after saving')
const graphAfter = JSON.parse(files[GRAPH])
const newKeys = Object.keys(graphAfter.nodes).filter((k) => nodesBefore.indexOf(k) === -1)
eq(newKeys.length, 1, 'the new card got exactly one canvas node')
ok(!!graphAfter.nodes[newKeys[0]].chapter, 'the new node is attached to the current chapter', graphAfter.nodes[newKeys[0]])

view.fire(canvas, 'onContextMenu', { clientX: 300, clientY: 250 })
await tick()
ok(!!view.findMaybe('sc-menu'), 'the menu reopens for the backdrop check')
view.fire(view.find('sc-menuback'), 'onMouseDown', {})
await tick()
ok(!view.findMaybe('sc-menu'), 'pressing the backdrop dismisses the menu')

// ── N. a drag must survive React not having re-rendered yet ──────────────────
// 真实浏览器里 pointermove 之后 React 还没重渲染（setState 要排一个宏任务），紧跟着
// 派发的 pointerup 读到的还是上一帧的 state。要是把「拖到哪了」存在 state 里，松手时
// 拿到的就是原位/空值，卡片被写回原地 —— 用户报的「画布的拖动没有写」。
// 这一段用 defer 把这个时间差造出来：pointermove 与 pointerup 之间不许有渲染。
console.log('\nN. dragging: pointerup sees the live position, not a stale render')
const dragCardN = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
const cxBefore = JSON.parse(files[GRAPH]).nodes[N2].cx
view.defer(true)
view.fire(dragCardN, 'onPointerDown', { button: 0, clientX: 100, clientY: 100 })
view.window('pointermove', { clientX: 300, clientY: 260 })
view.window('pointerup', { clientX: 300, clientY: 260 })
view.defer(false)
view.flush()
await tick()
const cxAfter = JSON.parse(files[GRAPH]).nodes[N2].cx
ok(cxAfter !== cxBefore && cxAfter - cxBefore > 60, 'the card landed where it was dropped (200px right)', [cxBefore, cxAfter])
ok(!view.findAll('sc-card').some((n) => n.props['data-key'] === N2 && n.props.style.left !== cxAfter),
  'the card is drawn at the position that was written')

// ── O. branch node: choices are bound to nodes ───────────────────────────────
console.log('\nO. branch node: a choice knows where it goes')
const n3CardO = view.findAll('sc-card').filter((n) => n.props['data-key'] === N3)[0]
ok(!!n3CardO, 'the branch node is still on the canvas')
const oChoice = view.findAll('sc-choice').filter((n) => n.props['data-choice'] === 'o1')[0]
ok(!!oChoice, 'the choice is rendered')
ok(!!view.findMaybe('sc-choiceadd'), 'the card offers a ＋ option button without opening a dialog')
ok(String(oChoice.props.className).indexOf('linked') !== -1, 'a connected choice is marked as linked')
ok(!!view.findMaybe('sc-choicego'), 'the linked choice shows where it goes')

view.fire(n3CardO, 'onDoubleClick', {})
await wait(60)
const ov3 = view.findMaybe('sc-expand')
has(view.textOf(ov3), '→ 节点一', 'the expanded node names the target instead of saying it is unconnected')
ok(view.textOf(ov3).indexOf('还没连到节点') === -1, 'nothing claims to be unconnected any more')
view.click(view.find('sc-expandx'))
await tick()

const choicesBefore = JSON.parse(files[GRAPH]).nodes[N3].choices.length
view.click(view.find('sc-choiceadd'))
await tick()
await tick()
const gAdd = JSON.parse(files[GRAPH])
eq(gAdd.nodes[N3].choices.length, choicesBefore + 1, 'the ＋ button appended a choice')
eq(view.findAll('sc-choice').length, choicesBefore + 1, 'and the new choice is on the card')
eq(gAdd.nodes[N3].choices[1].to, '', 'the fresh choice starts unconnected')

const choiceEdge = view.findAll('sc-edgehit').filter((n) => n.props['data-edge'] === N3 + '->' + N1)[0]
ok(!!choiceEdge, 'the choice edge is on the canvas')
view.fire(choiceEdge, 'onContextMenu', { clientX: 300, clientY: 200 })
await tick()
// 右键不再当场删线（删一条设计好的连线太容易误触），而是弹一个小菜单。
const delLine = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('删除这条连线') !== -1)[0]
ok(!!delLine, 'right-clicking a line offers a menu instead of deleting it on the spot')
view.click(delLine)
await tick()
const gDel = JSON.parse(files[GRAPH])
ok(!gDel.edges.some((e) => e.from === N3 && e.to === N1), 'choosing 删除这条连线 deletes it')
eq(gDel.nodes[N3].choices[0].to, '', 'deleting the line also unlinks the choice')

// ── O2. creating a branch node straight from the menu ────────────────────────
// 「分歧节点」以前只能先建普通节点再右键改形态，而且新建时 mode 没写进图谱 ——
// 文件里是分歧、画布上却没有选项列。这一段把整条路走一遍。
console.log('\nO2. create a branch node directly')
view.fire(canvas, 'onContextMenu', { clientX: 520, clientY: 430 })
await tick()
const branchItem = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('新建分歧节点') !== -1)[0]
ok(!!branchItem, 'the empty-canvas menu offers 新建分歧节点')
view.click(branchItem)
await tick()
ok(!!view.findMaybe('sc-modal'), 'the editor opened for it')
const modeSel = view.findAll('sc-inp').filter((n) => n.tag === 'select')
  .filter((n) => (Array.isArray(n.props.children) ? n.props.children : []).some((o) => o && o.props && o.props.value === 'branch'))[0]
ok(!!modeSel, 'the editor has a node-shape selector')
eq(modeSel.props.value, 'branch', 'the editor is already set to 分歧')
const keysBefore = Object.keys(JSON.parse(files[GRAPH]).nodes)
view.fire(view.find('sc-inp'), 'onChange', { target: { value: '分歧节点甲' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('保存（写回') !== -1)[0])
await tick()
await tick()
const gNew = JSON.parse(files[GRAPH])
const added = Object.keys(gNew.nodes).filter((k) => keysBefore.indexOf(k) === -1)
eq(added.length, 1, 'the branch node got one canvas node')
eq(gNew.nodes[added[0]].mode, 'branch', 'the graph records its mode, not just the file')
const addedWrite = writes.filter((w) => w.path.indexOf('.md') !== -1 && w.text.indexOf('分歧节点甲') !== -1).pop()
ok(!!addedWrite && addedWrite.text.indexOf('mode: branch') !== -1, 'the card file says mode: branch', addedWrite && addedWrite.text)
const addedCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === added[0])[0]
ok(!!addedCard, 'the new branch node is on the canvas')
eq(addedCard.props['data-type'], 'node', 'and it is a node')
eq(view.findAll('sc-choiceadd').length, 2, 'both branch nodes offer a ＋ option button (the new one has no choices yet)')

// ── P. chapter cards carry no time ───────────────────────────────────────────
console.log('\nP. chapters have no in-story time')
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
const chCardP = view.findAll('sc-card').filter((n) => n.props['data-key'] === G2)[0]
ok(!!chCardP, 'the second chapter is on level 1')
ok(view.textOf(chCardP).indexOf('第99天') === -1, 'a chapter card never prints a time, even when the file has one')
view.fire(chCardP, 'onContextMenu', { clientX: 320, clientY: 200 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('展开') !== -1)[0])
await wait(60)
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('在详情里编辑') !== -1)[0])
await tick()
const chModal = view.findMaybe('sc-modal')
ok(!!chModal, 'the chapter editor opened')
ok(view.textOf(chModal).indexOf('时间') === -1, 'the chapter editor has no time field')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('保存（写回') !== -1)[0])
await tick()
await tick()
const chWrite = writes.filter((w) => w.path === CARDS_DIR + '/chapter-g2.md').pop()
ok(!!chWrite, 'saving a chapter wrote its file back')
ok(!!chWrite && chWrite.text.indexOf('when:') === -1, 'saving a chapter drops the stale time line', chWrite && chWrite.text)
view.click(view.find('sc-expandx'))
await tick()

// ── Q. the canvas is drawn on the pixel grid ─────────────────────────────────
// 糊的根源是「缩放/平移一直走过渡 + 合成层拿旧位图拉伸 + 层原点落在小数像素上」。
console.log('\nQ. the canvas stays crisp')
const stageStyle = view.find('sc-stage').props.style
ok(/^translate\(-?\d+px,-?\d+px\) scale\(/.test(String(stageStyle.transform)), 'the stage origin is snapped to whole pixels', stageStyle.transform)
eq(stageStyle.transition, 'none', 'panning/zooming is not animated through a cached bitmap')
const styles = h.created().map((el) => el.textContent).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
ok(!/will-change\s*:\s*transform/.test(styles), 'nothing pins the 8000×8000 canvas into one composited layer')
const atZoom = () => parseInt(String(view.find('sc-boardtip').props.children), 10)
// 每次都重新查：无头渲染器没有事件委托，抓着旧节点等于抓着旧闭包里的 view。
const zoomBtn = (title) => view.findAll('sc-navbtn').filter((n) => n.props.title === title)[0]
view.click(zoomBtn('放大'))
await tick()
const z1 = atZoom()
view.click(zoomBtn('放大'))
await tick()
const z2 = atZoom()
ok(z2 > z1, 'the zoom buttons still zoom', [z1, z2])
ok([25, 33, 50, 67, 80, 100, 125, 150, 200].indexOf(z2) !== -1, 'zoom lands on a clean step, not 112%', z2)
view.click(zoomBtn('缩小'))
await tick()
eq(atZoom(), z1, 'zooming back out returns to the previous step')
wheel({ ctrlKey: true, deltaY: -120, clientX: 400, clientY: 300 })
await tick()
ok([25, 33, 50, 67, 80, 100, 125, 150, 200].indexOf(atZoom()) !== -1, 'Ctrl/⌘+wheel (trackpad pinch) lands on a clean step too', atZoom())

// ── R. blank canvas: left-drag pans ──────────────────────────────────────────
// 默认左键拖画布。要紧的是：卡片上的按下会冒泡到画布，那一路必须让开，不能把同一次
// 拖动接管成平移。
console.log('\nR. blank canvas: left-drag pans')
const translateOf = () => {
  const m = /^translate\((-?\d+)px,(-?\d+)px\)/.exec(String(view.find('sc-stage').props.style.transform))
  return { x: Number(m[1]), y: Number(m[2]) }
}
const blank = { getAttribute: () => null, parentNode: null }
const r0 = translateOf()
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 0, clientX: 400, clientY: 300, target: blank })
await tick()
ok(String(view.find('sc-canvas').props.className).indexOf('panning') !== -1, 'the canvas switches to a grabbing cursor while panning')
view.window('pointermove', { clientX: 460, clientY: 340 })
await tick()
view.window('pointerup', { clientX: 460, clientY: 340 })
await tick()
const r1 = translateOf()
eq(r1.x - r0.x, 60, 'left-drag moves the canvas sideways')
eq(r1.y - r0.y, 40, 'and up/down too (the wheel alone could only ever do one axis)')
ok(String(view.find('sc-canvas').props.className).indexOf('panning') === -1, 'the cursor goes back on release')

const rCard = view.findAll('sc-card')[0]
const onCardTarget = { getAttribute: (a) => (a === 'data-key' ? rCard.props['data-key'] : null), parentNode: null }
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 0, clientX: 200, clientY: 200, target: onCardTarget })
view.window('pointermove', { clientX: 260, clientY: 240 })
await tick()
view.window('pointerup', { clientX: 260, clientY: 240 })
await tick()
const r2 = translateOf()
eq(r2.x, r1.x, 'a press that starts on a card never pans the canvas sideways')
eq(r2.y, r1.y, 'nor vertically')

// ── S. wheel: plain = zoom, Shift/Alt = pan ──────────────────────────────────
console.log('\nS. wheel: zoom by default, modifiers pan')
const zoomNow = () => atZoom()
const s0 = translateOf()
const z0 = zoomNow()
wheel({ shiftKey: true, deltaY: 90 })
await tick()
const s1 = translateOf()
eq(s1.x, s0.x - 90, 'Shift+wheel moves the canvas sideways')
eq(s1.y, s0.y, 'Shift+wheel leaves the vertical position alone')
eq(zoomNow(), z0, 'Shift+wheel does not zoom')
wheel({ altKey: true, deltaY: 70 })
await tick()
const s2 = translateOf()
eq(s2.y, s1.y - 70, 'Alt+wheel moves the canvas vertically')
eq(s2.x, s1.x, 'Alt+wheel leaves the horizontal position alone')

// ── T. the option column is not clipped away ─────────────────────────────────
// 「分歧节点右边没有选项」的根子是 .sc-card 自己 overflow:hidden —— 选项列挂在
// left:100%（卡片盒子之外），整列连同出口圆点被裁掉；接口圆点也被裁成半个。
// 无头渲染器没有布局，看不到「被裁掉」，只能把这条样式契约钉死。
console.log('\nT. the option column is not clipped away')
const cssText = h.created().map((el) => el.textContent).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => (cssText.match(new RegExp('\\' + sel + '\\{[^}]*\\}')) || [''])[0]
const cardRule = rule('.sc-card')
ok(cardRule !== '', 'the .sc-card rule is in the stylesheet')
ok(cardRule.indexOf('overflow:hidden') === -1, 'a card does not clip its own overflow (the choice column lives outside the card box)', cardRule)
has(rule('.sc-choices'), 'left:100%', 'the choice column hangs off the card to the right')
const portRule = rule('.sc-port')
has(portRule, 'border-radius:50%', 'a port is a circle')
ok(portRule.indexOf('background:var(--sc-accent') === -1, 'a port is hollow — the accent colour is the ring, not the fill', portRule)
eq((portRule.match(/opacity:(\S+?)[;}]/) || [])[1], '.9', 'ports are visible without hunting for them with the mouse')
// 圆要「正」，三条：尺寸/偏移整数、描边够细、没有 transform 缩放。
// ① 半像素的圆栅格化后是一个发虚的椭圆；② 16px 的点套 2px 的圈，1 倍缩放下栅格化出来
// 是一个厚重的八边形（放大 10 倍看就是多边形的甜甜圈）—— 这两条都是用户报的「不是正圆」。
has(portRule, 'width:16px', 'a port is 16px wide')
has(portRule, 'height:16px', 'and 16px tall — an equal-sided box plus a 50% radius is the only real circle')
has(portRule, 'margin-top:-8px', 'the vertical offset is exactly half of that box')
has(portRule, 'border:1px solid', 'the ring is 1px — a 2px ring on a 16px dot rasterises into a chunky octagon')
has(rule('.sc-port.in'), 'left:-8px', 'the in port is offset by exactly half its size')
has(rule('.sc-port.out'), 'right:-8px', 'the out port too')
ok(portRule.indexOf('scale(') === -1, 'nothing scales a port (a transform on a 16px dot is what makes it fuzzy)', portRule)
// 选项列的几何：行高固定、列顶由 JS 算（行内 top），＋ 按钮排在最后一行下面。
has(rule('.sc-choice'), 'height:30px', 'option rows are a fixed height, so the rows below them cannot drift')
ok(rule('.sc-choice').indexOf('overflow:hidden') === -1, 'an option row does not clip its own port either', rule('.sc-choice'))
ok(rule('.sc-choices').indexOf('top:') === -1, 'the column top is not hard-coded in CSS any more (the geometry supplies it)')
// 标签条：平时**一点滚动条都看不到**，滑的时候才浮出自己画的一根（用户的要求）。
// 原生那条必须整个藏掉 —— Windows 会给它配两侧的三角箭头，很丑。
// 自己画的那根是绝对定位的覆盖层：出现/消失都不参与布局，所以不会有「悬停改尺寸」那种
// 高频抖（原来 :hover 里换滑块颜色，指针和元素会互相追着跑，整块布局跟着跳）。
const tagsRule = rule('.sc-tags')
has(tagsRule, 'scrollbar-width:none', 'the tag strip hides the native scrollbar entirely')
has(rule('.sc-tags::-webkit-scrollbar'), 'display:none', 'and the Chromium one too')
has(rule('.sc-tags::-webkit-scrollbar-button'), 'display:none', 'no arrow buttons (Windows draws them by default)')
ok(tagsRule.indexOf('scrollbar-width:thin') === -1, 'it no longer reserves space for a scrollbar it does not show', tagsRule)
has(rule('.sc-tagbar'), 'position:absolute', 'the bar shown while scrolling is an overlay — showing it shifts nothing')
eq(rule('.sc-tags:hover'), '', 'the strip has no hover rule any more (that is what used to jitter)')
// 原生滚动条藏掉之后，鼠标就抓不到那根滑块了，所以标签条自己得能按住横拖
// （用户报的「滑动功能整个没用了」）；拖动时标签文字不可选中，不然一拖就变成拖选文字。
has(tagsRule, 'cursor:grab', 'the strip says it can be dragged sideways')
has(tagsRule, 'user-select:none', 'dragging the strip cannot turn into selecting tag text')
has(rule('.sc-group,.sc-grid,.sc-tile,.sc-tiletitle,.sc-tilesum'), 'user-select:none', 'the whole grid page is unselectable (that drag was what crashed the panel)')
// 连线上那个输入框的层级：DOM 上它在卡片前面，线中点又常落在卡片底下，
// 不给它抬起来就只露半个（用户报的「输入框图层在最底下，看不全」）。
const zOf = (sel) => Number((rule(sel).match(/z-index:(\d+)/) || [])[1])
ok(zOf('.sc-elabel') > 0, 'an edge label paints above the cards (they carry no z-index at all)', zOf('.sc-elabel'))
ok(zOf('.sc-elabel') > zOf('.sc-choices'), 'and above the option column', [zOf('.sc-elabel'), zOf('.sc-choices')])
ok(zOf('.sc-elabeledit') >= zOf('.sc-elabel'), 'the input you type into sits on top of the label it replaces', [zOf('.sc-elabeledit'), zOf('.sc-elabel')])
ok(zOf('.sc-elabel') < zOf('.sc-expand'), 'but still below the expanded card', [zOf('.sc-elabel'), zOf('.sc-expand')])
// 组件不许当普通函数调用：那样它的 hook 会记到调用者头上，调用点的数量一变，真 React
// 就抛 "Rendered more hooks than during the previous render"，整个面板当场白掉。
// （替身现在也照着这条判据抛错，这里再把源码钉一遍。）
const bundle = fs.readFileSync(CLIENT, 'utf8')
const plainCalls = ['TagRow', 'Tile', 'ArchiveDetail', 'CardBody'].filter((n) => bundle.indexOf(n + '({') !== -1)
eq(plainCalls.join(','), '', 'no hook-bearing component is invoked as a plain function')
// 框选的框：不能挡点击（拖完那一下右键还要能落到卡片/空白上），层级要高过卡片
const mqRule = rule('.sc-marquee')
has(mqRule, 'pointer-events:none', 'the selection box never gets in the way of a click')
has(mqRule, 'position:absolute', 'the selection box is placed in canvas coordinates')
ok(zOf('.sc-marquee') > 0, 'and it paints above the cards it is selecting', zOf('.sc-marquee'))
// 连线必须是看得见的颜色：--dsw-alias-border-l2 是 12% 白，画成线等于全透明。
const edgeRule = rule('.sc-edge')
has(edgeRule, 'stroke:var(--dsw-alias-label-secondary)', 'edges use the secondary label colour, not a 12%-alpha border colour')
ok(edgeRule.indexOf('border-l2') === -1, 'no edge rule uses the border colour any more', edgeRule)
eq((edgeRule.match(/stroke-width:(\S+?)[;}]/) || [])[1], '1.5', 'the plain edge line is 1.5px')
ok(rule('.sc-edge.on').indexOf('stroke-width') === -1, 'the highlighted edge redeclares no width — it inherits the same 1.5px')
ok(rule('.sc-edge.temp').indexOf('stroke-width') === -1, 'and so does the rubber band')
// 箭头固定尺寸：原来 markerUnits:strokeWidth 会跟着线宽放大，同一个箭头两个大小。
const arrowMarker = (function () {
  const stack = [view.tree()]
  while (stack.length) {
    const n = stack.pop()
    if (!n) continue
    if (n.props && n.props.id === 'sc-arrow') return n
    if (n.children) for (const c of n.children) stack.push(c)
  }
  return null
})()
ok(!!arrowMarker, 'the arrow marker is in the tree')
eq(arrowMarker && arrowMarker.props.markerUnits, 'userSpaceOnUse', 'the arrowhead is a fixed size, not scaled by the stroke width')
// 连线层在 CSS 里被挪到 -4000（负坐标的卡片也能画），所以画路径的那个 <g> 必须原样补回来。
// 不补，整层线画在屏幕外 4000px 处：连线标签是普通 DOM、按画布坐标摆的，于是「标签在、
// 线不在」—— 用户报的「连线没有渲染出来，是全透明的」就是这个。
const edgePad = Number((rule('.sc-edges').match(/left:-(\d+)px/) || [])[1])
ok(edgePad > 0, 'the edge layer is offset to the upper left in CSS', rule('.sc-edges'))
const allTransforms = (function () {
  const out = []
  const stack = [view.tree()]
  while (stack.length) {
    const n = stack.pop()
    if (!n) continue
    if (n.props && n.props.transform) out.push(String(n.props.transform))
    if (n.children) for (const c of n.children) stack.push(c)
  }
  return out
})()
const shift = 'translate(' + edgePad + ',' + edgePad + ')'
eq(allTransforms.filter((t) => t === shift).length, 1, 'exactly one group shifts the paths back by the CSS offset (' + shift + ')')

// ── U. a rubber band starts at the option it was pulled from ─────────────────
console.log('\nU. a link drag starts at that option')
view.fire(view.findAll('sc-card').filter((n) => n.props['data-key'] === G1)[0], 'onDoubleClick', {})
await tick()
const n3rec = JSON.parse(files[GRAPH]).nodes[N3]
const linkPort = view.findAll('sc-port').filter((n) => n.props['data-port'] === 'out' && n.props['data-choice'] === 'o1')[0]
ok(!!linkPort, 'the option still has its own out port')
view.fire(linkPort, 'onPointerDown', { clientX: 300, clientY: 300 })
await tick()
const tempEdge = view.findAll('temp')[0]
ok(!!tempEdge, 'a rubber band is drawn while dragging')
const start = /^M(-?[\d.]+),(-?[\d.]+)/.exec(String(tempEdge && tempEdge.props.d))
ok(!!start, 'the rubber band has a start point', tempEdge && tempEdge.props.d)
const n3H0 = Number(view.findAll('sc-card').filter((n) => n.props['data-key'] === N3)[0].props.style.height)
const optRowCenter = Math.round(n3H0 / 2 - (2 * 30 + 1 * 5) / 2) + 15
eq(Number(start[2]), n3rec.cy + optRowCenter, 'it starts at that option row, not at the middle of the card')
ok(Number(start[2]) !== n3rec.cy + n3H0 / 2, "it is not the card's own out port either")
view.window('pointerup', { clientX: 300, clientY: 300 })
await tick()
ok(!view.findMaybe('temp'), 'the rubber band goes away when the drag ends')

// 真实 DOM 里起笔点是**量**出来的（圆点自己的 getBoundingClientRect 中心），不是按公式
// 猜的 —— 选项行高、卡片展开后的高度怎么变都对得上。这里塞一个假的 rect 证明它被用到。
const measured = { getBoundingClientRect: () => ({ left: 8, top: 6, width: 16, height: 16 }) }
view.fire(linkPort, 'onPointerDown', { clientX: 300, clientY: 300, currentTarget: measured })
await tick()
const temp2 = view.findAll('temp')[0]
const start2 = /^M(-?[\d.]+),(-?[\d.]+)/.exec(String(temp2 && temp2.props.d))
const tr = translateOf()
eq(Number(start2[1]), (16 - tr.x) / (atZoom() / 100), 'with a real port element the start point is measured off it')
view.window('pointerup', { clientX: 300, clientY: 300 })
await tick()

// ── V. one option keeps exactly one outgoing line ───────────────────────────
// 把某个选项改连到别的卡片时，旧的那条线必须跟着走。早先是「再加一条」：同一个选项
// 拖着两条线、分别指向两个节点，画布上就是一团乱麻（用户报的连接 bug 之一）。
console.log('\nV. one option keeps exactly one outgoing line')
function subtreeOf(root) {
  const out = []
  const visit = (n) => {
    if (!n) return
    out.push(n)
    if (n.children) for (const c of n.children) visit(c)
  }
  visit(root)
  return out
}
const cardNodeOf = (key) => view.findAll('sc-card').filter((n) => n.props['data-key'] === key)[0]
const portOf = (key, which, choice) => {
  const card = cardNodeOf(key)
  if (!card) return undefined
  return subtreeOf(card).filter((n) => n.kind === 'host' && n.props && n.props['data-port'] === which
    && (choice === undefined || n.props['data-choice'] === choice))[0]
}
async function linkTo(fromKey, toKey, choice) {
  view.fire(portOf(fromKey, 'out', choice), 'onPointerDown', { clientX: 300, clientY: 300 })
  await tick()
  view.fire(portOf(toKey, 'in'), 'onPointerUp', { clientX: 320, clientY: 320 })
  await tick()
}
await linkTo(N3, N1, 'o1')
eq(JSON.parse(files[GRAPH]).edges.filter((e) => e.from === N3 && e.choice === 'o1').length, 1, 'a drag from an option writes exactly one line')
await linkTo(N3, N2, 'o1')
const gV = JSON.parse(files[GRAPH])
const o1edges = gV.edges.filter((e) => e.from === N3 && e.choice === 'o1')
eq(o1edges.length, 1, 're-dragging that option moves its line instead of stacking a second one')
eq(o1edges[0].to, N2, 'the line points at the new target')
eq(gV.nodes[N3].choices.filter((c) => c.id === 'o1')[0].to, N2, 'and the option itself is bound to the new target')
eq(view.findAll('sc-edgehit').filter((n) => n.props['data-edge'] === N3 + '->' + N1).length, 0, 'the old line is gone from the canvas')

// 拉线时「哪里能落」得看得见：别的卡片入口点亮，源卡片自己不亮。
const otherChoice = (JSON.parse(files[GRAPH]).nodes[N3].choices || [])[1].id
view.fire(portOf(N3, 'out', otherChoice), 'onPointerDown', { clientX: 300, clientY: 300 })
await tick()
ok(String(portOf(N1, 'in').props.className).indexOf('hot') !== -1, 'while dragging, the other cards offer their in port as a drop target')
ok(String(portOf(N3, 'in').props.className).indexOf('hot') === -1, 'the source card is not offered as its own target')
ok(String(portOf(N3, 'out', otherChoice).props.className).indexOf('hot') !== -1, 'the port being dragged is highlighted')
view.window('pointerup', { clientX: 980, clientY: 480 })
await tick()
ok(String(portOf(N1, 'in').props.className).indexOf('hot') === -1, 'the highlight goes away when the drag ends')

// 选项列：整列按选项本身居中，＋ 按钮挂在最后一行下面（用户的要求）。
const choiceCol = subtreeOf(cardNodeOf(N3)).filter((n) => n.kind === 'host' && String(n.props.className).indexOf('sc-choices') !== -1)[0]
const rowCount = (JSON.parse(files[GRAPH]).nodes[N3].choices || []).length
eq(rowCount, 2, 'the branch node has two options at this point')
const n3Box = cardNodeOf(N3).props.style
eq(choiceCol.props.style.top, Math.round(Number(n3Box.height) / 2 - (rowCount * 30 + (rowCount - 1) * 5) / 2), 'the option column is vertically centred on the card')
ok(Number.isInteger(choiceCol.props.style.top), 'and it lands on a whole pixel')
// 直接子元素（无头渲染器把 JSX 里的数组包成一层 frag，得自己拆开）。
const directKids = (n) => {
  const out = []
  for (const c of n.children || []) {
    if (c && c.kind === 'frag') { for (const g of c.children || []) out.push(g) }
    else out.push(c)
  }
  return out.filter((x) => x && x.kind === 'host')
}
const colKids = directKids(choiceCol)
eq(colKids.length, rowCount + 1, 'the column holds the option rows plus the ＋ button')
eq(String(colKids[colKids.length - 1].props.className), 'sc-choiceadd', 'the ＋ option button hangs below the rows, so it never shifts the centring')

// ── W. two options may lead to the same card ────────────────────────────────
// 图谱去重必须带上 choice。只按 from+to 去重的话，第二次读盘会把「选项B → 结果」当成
// 重复的扔掉 —— 卡片上写着已连接、线上却没有线。用户自己那份 分支.json 里正是这样：
// 选项A 与 选项B 都写着指向「结果」，edges 里却只剩一条。
console.log('\nW. two options may lead to the same card')
await linkTo(N3, N2, otherChoice)
eq(JSON.parse(files[GRAPH]).edges.filter((e) => e.from === N3 && e.to === N2).length, 2, 'each option got its own line to the same card')
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '刷新画布')[0])
await tick()
await tick()
await tick()
const gW = JSON.parse(files[GRAPH])
eq(gW.edges.filter((e) => e.from === N3 && e.to === N2).length, 2, 'both lines survive a reload (dedupe has to key on the choice)')
eq(view.findAll('sc-edgehit').filter((n) => n.props['data-edge'] === N3 + '->' + N2).length, 2, 'both lines are drawn on the canvas')
eq((gW.nodes[N3].choices || []).filter((c) => c.to === N2).length, 2, 'both options still know where they go')

// ── X. shortcuts stay out of the host chat box ──────────────────────────────
// 对话输入框是 contenteditable（不是 input/textarea）。早先这里无条件吃全局 Ctrl+V，
// 于是「打开剧本档案侧边栏之后，对话里粘不进字」（用户报的）。现在只有「最近一次点击
// 落在画布上」时才接管，可编辑区里一律让路。
console.log('\nX. shortcuts stay out of the host chat box')
const keyEv = (key, target, extra) => Object.assign({ key, target, preventDefault() {}, stopPropagation() {} }, extra || {})
const canvasNode = view.find('sc-canvas')
const chatTarget = { tagName: 'DIV', isContentEditable: true, parentNode: null, getAttribute: () => null }
const writesX = writes.length
view.window('pointerdown', { clientX: 1300, clientY: 900 })
await tick()
view.window('keydown', keyEv('v', canvasNode, { ctrlKey: true }))
await tick()
await tick()
eq(writes.length, writesX, 'a Ctrl+V after clicking outside the canvas is left to the host')
view.window('pointerdown', { clientX: 200, clientY: 200 })
await tick()
view.window('keydown', keyEv('v', chatTarget, { ctrlKey: true }))
await tick()
await tick()
eq(writes.length, writesX, 'a Ctrl+V typed in a contenteditable is left to the host')
view.window('keydown', keyEv('delete', chatTarget))
await tick()
await tick()
ok(!!view.findMaybe('sc-card'), 'and so are Delete / Ctrl+X — the host keeps its own editing keys')
view.window('keydown', keyEv('v', canvasNode, { ctrlKey: true }))
await tick()
await tick()
ok(writes.length > writesX, 'with the canvas as the last click target the shortcut still works')

// ── Y. a line follows the card while it is being dragged ────────────────────
// 卡片是跟着手走的，但连线原来取的是图谱里的旧坐标：拖动期间线钉在原地、松手才跳过去
// （用户报的「连线不能实时渲染」）。现在两边共用 liveRect，拖动过程中就该对上。
console.log('\nY. lines follow the card while it is being dragged')
const edgeStartXY = () => {
  const el = view.findAll('sc-edgehit').filter((n) => n.props['data-edge'] === N1 + '->' + N2)[0]
  const m = /^M(-?[\d.]+),(-?[\d.]+)/.exec(String(el && el.props.d))
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}
const yBefore = edgeStartXY()
ok(!!yBefore, 'the edge between the two nodes is on the canvas')
view.fire(cardNodeOf(N1), 'onPointerDown', { button: 0, clientX: 200, clientY: 200 })
await tick()
view.window('pointermove', { clientX: 260, clientY: 240 })
await tick()
const yDuring = edgeStartXY()
const liveCard = cardNodeOf(N1)
ok(!!yDuring && (yDuring.x !== yBefore.x || yDuring.y !== yBefore.y), 'the line moved while the drag is still going on', [yBefore, yDuring])
eq(yDuring.x, liveCard.props.style.left + Number(liveCard.props.style.width) + 8, 'the line starts at the right edge of where the card is right now')
eq(yDuring.y, liveCard.props.style.top + Number(liveCard.props.style.height) / 2, 'and at its vertical middle')
view.window('pointerup', { clientX: 260, clientY: 240 })
await tick()
const yAfter = edgeStartXY()
// 松手时卡片可能被「不许重叠」那条规矩挪开一点点，所以这里比的是**卡片现在的位置** ——
// 要验的是「线取的是卡片当前的矩形，不是图谱里那份旧坐标」，不是「卡片一定停在原地」。
// （cardRectOf 这个助手在这一段之后才定义，这里就地读一次。）
const yCardNode = cardNodeOf(N1)
const yCard = {
  x: Number(yCardNode.props.style.left), y: Number(yCardNode.props.style.top),
  w: Number(yCardNode.props.style.width), h: Number(yCardNode.props.style.height),
}
eq(yAfter.x, yCard.x + yCard.w + 8, 'after the drop the line still starts at the right edge of where the card is')
eq(yAfter.y, yCard.y + yCard.h / 2, 'and at its vertical middle')
ok(yAfter.x !== yBefore.x || yAfter.y !== yBefore.y, 'and it did move away from where the card started', [yBefore, yAfter])

// ── Z. auto-arrange leaves room for the option column ───────────────────────
// 分歧卡片右边那列选项**也算它占的地方**（卡片宽 + 14 的间距 + 156 的列）。
// 自动排列原来只按卡片宽度让位，选项列于是压在下一层卡片身上（用户报的
// 「自动排列会重叠」）。但让位**不能反过来挪卡片**：上一版把选项列的高度折进卡片的
// 占位里，卡片在占位里居中，结果同层的分歧卡片比别的卡片低一截（用户报的「默认不居中，
// 因为计算高度的时候把后面的选项也计算上了」）。现在的规矩：
//   卡片的位置只由卡片自己决定；选项列溢出的那部分，只体现在两张卡片之间的间距上。
console.log('\nZ. auto-arrange leaves room for the option column')
const addBtnOf = (key) => subtreeOf(cardNodeOf(key)).filter((n) => n.props && String(n.props.className).indexOf('sc-choiceadd') !== -1)[0]
const arrange = async () => {
  view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '自动排列')[0])
  await tick()
  await tick()
}
const cardPlaces = () => Object.keys(JSON.parse(files[GRAPH]).nodes).map((k) => {
  const n = cardNodeOf(k)
  return n ? { k: k, x: Number(n.props.style.left), y: Number(n.props.style.top) } : null
}).filter(Boolean)
// ① 先按原样（2 个选项）排一次
await arrange()
const zPlaces0 = cardPlaces()
const zY0 = zPlaces0.filter((p) => p.k === N3)[0].y
const zX = zPlaces0.filter((p) => p.k === N3)[0].x
const zNext0 = zPlaces0.filter((p) => p.x === zX && p.y > zY0).sort((a, b) => a.y - b.y)[0]
ok(!!zNext0, 'there is a card below it on the same column', zNext0)
// ② 把选项加到 8 个（选项列 310 高，卡片才 80），再排一次
for (let i = 0; i < 6; i++) {
  view.click(addBtnOf(N3))
  await tick()
}
eq((JSON.parse(files[GRAPH]).nodes[N3].choices || []).length, 8, 'the branch node now has eight options')
await arrange()
const zPlaces1 = cardPlaces()
const zN3card = zPlaces1.filter((p) => p.k === N3)[0]
ok(zN3card.y === zY0, 'adding options never moves the card itself', [zY0, zN3card.y])
const zNext1 = zPlaces1.filter((p) => p.x === zX && p.y > zN3card.y).sort((a, b) => a.y - b.y)[0]
ok(zNext1.y > zNext0.y, 'but the card under it is pushed down by the longer option column', [zNext0.y, zNext1.y])
const gZ = JSON.parse(files[GRAPH])
const OPT_COL_W = 14 + 156 // 与 src/80-board.js 的 CHOICE_DX + CHOICE_W 对齐
const footprint = (key) => {
  const node = cardNodeOf(key)
  if (!node) return null
  const st = node.props.style
  const h = Number(st.height)
  const rec = gZ.nodes[key] || {}
  const n = node.props['data-type'] === 'node' && rec.mode === 'branch' ? (rec.choices || []).length : 0
  // 选项列 = n 行 30px + (n-1) 个 5px 间距 + 5px 间距 + 30px 的「＋ 选项」，
  // 整列相对卡片上下居中，所以比卡片高的部分上下各溢一半。
  const colH = n * 30 + Math.max(0, n - 1) * 5 + 5 + 30
  const over = n ? Math.max(0, Math.ceil((colH - h) / 2)) : 0
  return {
    key: key,
    x: Number(st.left),
    y: Number(st.top),          // 卡片自己的位置：绝不因为选项列被挪
    top: Number(st.top) - over, // 连同溢出的选项列，整块的顶
    w: n ? Number(st.width) + OPT_COL_W : Number(st.width),
    h: h + over * 2,
  }
}
const places = Object.keys(gZ.nodes).map(footprint).filter(Boolean)
ok(places.length >= 3, 'the arrangement placed the cards', places.length)
const overlaps = []
for (let i = 0; i < places.length; i++) {
  for (let j = i + 1; j < places.length; j++) {
    const a = places[i]
    const b = places[j]
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.top < b.top + b.h && a.top + a.h > b.top) overlaps.push(a.key + ' × ' + b.key)
  }
}
eq(overlaps.length, 0, 'no two cards overlap once the option columns are counted', overlaps)
const zN3 = places.filter((p) => p.key === N3)[0]
const zN3W = Number(cardNodeOf(N3).props.style.width)
ok(!!zN3 && zN3.w >= zN3W + OPT_COL_W, 'the branch node makes room for its option column', zN3 && zN3.w)
// 卡片自己还得落在整数像素上（半像素的圆点看着就不圆）
ok(places.every((p) => Number.isInteger(p.y)), 'every card still lands on a whole pixel', places.filter((p) => !Number.isInteger(p.y)).map((p) => p.key))

// ── AA. 连线的名字：平时线上什么都不显示，点线才浮出输入框 ────────────────────
// 上一版把「连线」这个提示挂在每条线上，用户不要：不选中的时候直接隐藏。
// 现在点一下某条线，那条线上才出现输入框；回车 / 点别处保存，Esc 放弃。
// 另外，标签也绝不能塞进连线的 SVG 里 —— 浏览器不渲染 SVG 里的 HTML 元素，
// 它会是 0×0、看不见也点不到（无头渲染器不认命名空间，静态 HTML 又会被解析器把 div
// 弹出 svg，两边都看不出这个坑，所以这里顺着渲染树找「有没有标签挂在 svg 底下」）。
console.log('\nAA. a line shows nothing until you click it')
const labelsUnderSvg = function () {
  const bad = []
  const visit = (n, inSvg) => {
    if (!n) return
    const now = inSvg || (n.kind === 'host' && String(n.tag).toLowerCase() === 'svg')
    if (n.kind === 'host' && now && String(n.props.className || '').indexOf('sc-elabel') !== -1) bad.push(n)
    if (n.children) for (const c of n.children) visit(c, now)
  }
  visit(view.tree(), false)
  return bad.length
}
eq(labelsUnderSvg(), 0, 'no edge label lives inside the <svg> (the browser would draw it as nothing at all)')
eq(view.findAll('sc-elabel').length, 1, 'only the line that already has a name shows anything')
eq(view.textOf(view.findAll('sc-elabel')[0]), '顺流而下', 'and it shows that name')
const lineHits = view.findAll('sc-edgehit')
ok(lineHits.length >= 2, 'the canvas has lines to name', lineHits.length)
const unnamed = lineHits.filter((n) => n.props['data-echoice'] !== 'nope' && n.props['data-edge'] !== N1 + '->' + N2)[0]
ok(!!unnamed, 'there is an unnamed line to work with')
const edgesBefore = JSON.parse(files[GRAPH]).edges.length
view.click(unnamed)
await tick()
let nameInput = view.findMaybe('sc-elabeledit')
ok(!!nameInput, 'clicking a line puts an input box on it')
eq(nameInput && nameInput.props['data-edge'], unnamed.props['data-edge'], 'and the input belongs to that line')
eq(nameInput && nameInput.props.value, '', 'it starts empty on a line that had no name')
eq(view.findMaybe('sc-modal'), null, 'no dialog in the middle — the name is edited on the line itself')
view.fire(nameInput, 'onChange', { target: { value: '若答应' } })
await tick()
// 重新取一次节点：harness 里 setState 之后旧节点还是上一帧的 props（闭包里的值也是旧的）
nameInput = view.findMaybe('sc-elabeledit')
view.fire(nameInput, 'onKeyDown', { key: 'Enter' })
await tick()
await tick()
const gAA = JSON.parse(files[GRAPH])
eq(gAA.edges.filter((e) => e.label === '若答应').length, 1, 'Enter writes the name to the graph file')
eq(gAA.edges.length, edgesBefore, 'renaming does not add or drop a line')
eq(view.findMaybe('sc-elabeledit'), null, 'the input goes away once it is saved')
eq(view.findAll('sc-elabel').length, 2, 'now two lines show a name')
ok(!!view.findAll('sc-elabel').filter((n) => view.textOf(n) === '若答应').length, 'and the new name is on the canvas')
eq(labelsUnderSvg(), 0, 'the name tag is HTML, outside the SVG')
const chipOf = (text) => view.findAll('sc-elabel').filter((n) => view.textOf(n) === text)[0]
// 点名字 → 接着改；Esc = 放弃
view.click(chipOf('若答应'))
await tick()
let input2 = view.findMaybe('sc-elabeledit')
ok(!!input2, 'clicking a name lets you change it')
eq(input2 && input2.props.value, '若答应', 'the input starts from the current name')
view.fire(input2, 'onChange', { target: { value: '若答应（改）' } })
await tick()
input2 = view.findMaybe('sc-elabeledit')
view.fire(input2, 'onKeyDown', { key: 'Escape' })
await tick()
eq(JSON.parse(files[GRAPH]).edges.filter((e) => e.label === '若答应（改）').length, 0, 'Esc leaves the graph alone')
ok(!!chipOf('若答应'), 'and the old name is still on the line')
// 点到别处（失焦）= 保存
view.click(chipOf('若答应'))
await tick()
let input3 = view.findMaybe('sc-elabeledit')
view.fire(input3, 'onChange', { target: { value: '若答应（改）' } })
await tick()
input3 = view.findMaybe('sc-elabeledit')
view.fire(input3, 'onBlur', {})
await tick()
await tick()
eq(JSON.parse(files[GRAPH]).edges.filter((e) => e.label === '若答应（改）').length, 1, 'clicking elsewhere saves what you typed')
// 连线本身也能改名字：右键那条线，菜单里得有重命名（不再是一右键就删线）。
view.fire(view.findAll('sc-edgehit')[0], 'onContextMenu', { clientX: 300, clientY: 200 })
await tick()
const renItem = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('重命名连线') !== -1)[0]
ok(!!renItem, 'the line menu offers a rename')
// 菜单里的「重命名连线…」也走线上那个输入框，不再弹对话框
view.click(renItem)
await tick()
ok(!!view.findMaybe('sc-elabeledit'), 'the menu item reuses the on-line input instead of opening a dialog')
eq(view.findMaybe('sc-modal'), null, 'no dialog anywhere')
view.fire(view.findMaybe('sc-elabeledit'), 'onKeyDown', { key: 'Escape' })
await tick()
ok(!view.findMaybe('sc-menu'), 'and the menu closed behind it')

// ── AB. 标签条的滑块只在滑动时出现 ───────────────────────────────────────────
// 用户的要求：不动的时候隐藏，动起来才显现，而且不要两侧的三角箭头。
// 原生滚动条整个藏掉（也不占位），自己画的那根绝对定位覆盖上去 —— 它出现/消失不参与
// 布局，所以不会有「悬停改尺寸」那种高频抖。
console.log('\nAB. the tag strip bar only shows while scrolling')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '方片')[0])
await tick()
const strip = view.findAll('sc-tags')[0]
ok(!!strip, 'the grid has a tag strip')
eq(view.findMaybe('sc-tagbar'), null, 'nothing is drawn on it while it sits still')
view.el(strip, 'scroll', { target: { scrollWidth: 400, clientWidth: 100, scrollLeft: 150 } })
await tick()
ok(!!view.findMaybe('sc-tagbar'), 'scrolling brings the bar up')
const thumb = view.findMaybe('sc-tagthumb')
ok(!!thumb, 'with a thumb on it')
eq(thumb && thumb.props.style.width, '25%', 'the thumb is a quarter of the track when the content is four times as wide', thumb && thumb.props.style.width)
eq(thumb && thumb.props.style.left, '37.5%', 'scrolled halfway puts the middle of the thumb at the middle of the track', thumb && thumb.props.style.left)
// 停手 700ms 之后自己消失（这里多等 80ms 免得定时器边界抖动）
await wait(780)
eq(view.findMaybe('sc-tagbar'), null, 'and it goes away again shortly after the scrolling stops')

// ── AC. 标签条能按住横拖 ─────────────────────────────────────────────────────
// 用户报的：「主页面的滑条没了，但是滑动功能整个没用了」——原生的滑块藏掉之后，
// 鼠标就再也抓不到它，所以只能自己实现「按住标签条横着拖」。
console.log('\nAC. the tag strip can be dragged sideways')
const strip2 = view.findAll('sc-tags')[0]
const box = view.scrollBox(strip2)
box.scrollWidth = 400
box.clientWidth = 100
box.scrollLeft = 150
view.el(strip2, 'pointerdown', { clientX: 200 })
view.window('pointermove', { clientX: 150 })
await tick()
eq(box.scrollLeft, 200, 'dragging 50px left scrolls the strip 50px right')
ok(!!view.findMaybe('sc-tagbar'), 'and the bar stays up while your hand is still down')
view.window('pointerup', {})
await tick()
const stripNow = view.findAll('sc-tags')[0]
ok(!!stripNow, 'the strip is still there after the release')
ok(typeof stripNow.props.onClick === 'function', 'and it swallows the click that follows a drag (sliding must not open a card)')

// ── AE. 展开卡片之后，滚轮归卡片页面 ─────────────────────────────────────────
// 用户的要求：「点进去卡片之后，滚轮直接接管卡片页面的上滑下滑，不要去管桌布的缩放」。
console.log('\nAE. wheeling inside an expanded card scrolls it, not the canvas')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
const g1Card = view.findAll('sc-card').filter((n) => n.props['data-key'] === G1)[0]
view.fire(g1Card, 'onDoubleClick', {})
await tick()
const n2Card = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
view.fire(n2Card, 'onDoubleClick', {})
await wait(60)
ok(!!view.findMaybe('sc-expand'), 'a card is expanded again')
const zBefore = atZoom()
const tBefore = translateOf()
// 指针落在展开的卡片里：监听器自己判断 target 是不是它的后代
const insideExpand = { closest: (sel) => (sel === '.sc-expand' ? {} : null) }
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 400, clientY: 300, target: insideExpand })
await tick()
eq(atZoom(), zBefore, 'the canvas does not zoom while the pointer is over the expanded card')
eq(translateOf().x, tBefore.x, 'and it does not move sideways either')
// 指针在卡片外面：滚轮照旧缩放画布（这条证明上面那条不是因为滚轮整个失灵）
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 40, clientY: 460, target: blank })
await tick()
ok(atZoom() !== zBefore, 'outside the card the wheel still zooms the canvas', atZoom())
view.click(view.find('sc-expandx'))
await tick()

// ── AF. 右键框选多张 + 批量操作 ─────────────────────────────────────────────
// 用户的要求：「加一个右键框选多选的功能，方便批量操作（只在画布上生效）」。
console.log('\nAF. right-drag marquee selects several cards')
const toClient = (cx, cy) => {
  const t = translateOf()
  const s = atZoom() / 100
  return { clientX: Math.round(t.x + cx * s), clientY: Math.round(t.y + cy * s) }
}
const afA = toClient(-40, -40)
const afB = toClient(900, 520)
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 2, clientX: afA.clientX, clientY: afA.clientY, target: blank })
view.window('pointermove', { clientX: afB.clientX, clientY: afB.clientY, buttons: 2 })
await tick()
const mbox = view.findMaybe('sc-marquee')
ok(!!mbox, 'dragging with the right button draws a selection box')
ok(!!mbox && Number(mbox.props.style.width) > 0 && Number(mbox.props.style.height) > 0, 'the box has a real size while you drag', mbox && mbox.props.style)
view.window('pointerup', { clientX: afB.clientX, clientY: afB.clientY })
await tick()
eq(view.findMaybe('sc-marquee'), null, 'the box goes away when you let go')
const pickedNow = view.findAll('sc-card').filter((n) => String(n.props.className).indexOf(' on') !== -1)
const pickedKeys = pickedNow.map((n) => n.props['data-key'])
ok(pickedKeys.length >= 3, 'every card inside the box is selected at once', pickedKeys.length)
// 框选之后紧跟的右键（真实顺序：pointerup 之后立刻 contextmenu）不该弹菜单
view.fire(view.find('sc-canvas'), 'onContextMenu', { clientX: afB.clientX, clientY: afB.clientY, target: blank })
await tick()
eq(view.findMaybe('sc-menu'), null, 'the right-button release that ended the marquee does not open a menu')
// 整组一起拖：按住组里任意一张，整组跟着走
const groupA = view.findAll('sc-card').filter((n) => n.props['data-key'] === pickedKeys[0])[0]
const posOf = (k) => {
  const n = view.findAll('sc-card').filter((x) => x.props['data-key'] === k)[0]
  return n ? { x: Number(n.props.style.left), y: Number(n.props.style.top) } : null
}
const beforeDrag = pickedKeys.map((k) => ({ k: k, p: posOf(k) }))
const startPx = toClient(beforeDrag[0].p.x + 20, beforeDrag[0].p.y + 20)
// 画布上量到的位移 = 鼠标位移 ÷ 缩放（前面几节把缩放改到过 125%）
const afScale = atZoom() / 100
const dxCanvas = Math.round(60 / afScale)
const dyCanvas = Math.round(40 / afScale)
view.fire(groupA, 'onPointerDown', { button: 0, clientX: startPx.clientX, clientY: startPx.clientY })
view.window('pointermove', { clientX: startPx.clientX + 60, clientY: startPx.clientY + 40, buttons: 1 })
await tick()
const midDrag = pickedKeys.map((k) => posOf(k))
eq(midDrag[0].x - beforeDrag[0].p.x, dxCanvas, 'the card you grabbed follows the pointer')
eq(midDrag[1].x - beforeDrag[1].p.x, dxCanvas, 'and the rest of the group moves with it (same offset)')
eq(midDrag[1].y - beforeDrag[1].p.y, dyCanvas, 'on both axes')
view.window('pointerup', { clientX: startPx.clientX + 60, clientY: startPx.clientY + 40 })
await tick()
await tick()
const gAfterDrag = JSON.parse(files[GRAPH])
const movedKeys = pickedKeys.filter((k, i) => gAfterDrag.nodes[k] && gAfterDrag.nodes[k].cx === beforeDrag[i].p.x + dxCanvas)
eq(movedKeys.length, pickedKeys.length, 'every group member was written back to the graph file (one write, not one per card)')
// 右键落在选中组里 → 批量菜单；点「移出画布」整组离开画布
const groupB = view.findAll('sc-card').filter((n) => n.props['data-key'] === pickedKeys[1])[0]
const rPos = toClient(beforeDrag[1].p.x + dxCanvas + 20, beforeDrag[1].p.y + dyCanvas + 20)
view.fire(view.find('sc-canvas'), 'onPointerDown', {
  button: 2, clientX: rPos.clientX, clientY: rPos.clientY,
  target: { getAttribute: (a) => (a === 'data-key' ? pickedKeys[1] : null), parentNode: null },
})
view.fire(groupB, 'onContextMenu', { clientX: rPos.clientX, clientY: rPos.clientY })
await tick()
has(view.text(), '已选 ' + pickedKeys.length + ' 张', 'right-clicking inside the selection gives a batch menu')
// 真实浏览器里右键**总要松开**：不补这一下，marqueeRef 会一直挂着，后面所有画布手势
// （平移 / 框选）都会被它吃掉 —— 无头测试里就表现为「拖画布没反应」。
view.window('pointerup', { clientX: rPos.clientX, clientY: rPos.clientY })
// 批量删除：一个确认框盖住整组（先看一眼再取消，别真删，后面的断言还要用这些卡片）
const delMany = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('删除这 ' + pickedKeys.length + ' 张卡片文件') !== -1)[0]
ok(!!delMany, 'the batch menu can delete the whole selection in one go')
view.click(delMany)
await tick()
const batchDlg = view.findMaybe('sc-modal')
ok(!!batchDlg, 'a single confirm dialog covers the whole batch')
has(view.textOf(batchDlg), pickedKeys.length + ' 张卡片文件', 'the dialog says how many files it is about to delete')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '取消')[0])
await tick()
ok(!view.findMaybe('sc-modal'), 'cancelling it deletes nothing')
// 再打开一次批量菜单，换成「移出画布」
view.fire(view.find('sc-canvas'), 'onPointerDown', {
  button: 2, clientX: rPos.clientX, clientY: rPos.clientY,
  target: { getAttribute: (a) => (a === 'data-key' ? pickedKeys[1] : null), parentNode: null },
})
view.fire(view.findAll('sc-card').filter((n) => n.props['data-key'] === pickedKeys[1])[0], 'onContextMenu', { clientX: rPos.clientX, clientY: rPos.clientY })
await tick()
view.window('pointerup', { clientX: rPos.clientX, clientY: rPos.clientY })
await tick()
const outMany = view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('移出画布') !== -1)[0]
ok(!!outMany, 'the batch menu can put the whole selection back in the dock')
view.click(outMany)
await tick()
await tick()
const gAfterOut = JSON.parse(files[GRAPH])
eq(pickedKeys.filter((k) => gAfterOut.nodes[k].cx === null).length, pickedKeys.length, 'all of them left the canvas')
ok(view.findAll('sc-card').filter((n) => String(n.props.className).indexOf(' on') !== -1).length === 0, 'and the selection is cleared')

// ── AG. 每张卡片一份独立文档（只有章节 / 节点有入口） ─────────────────────────
// 用户的原话背景：「章节卡片和节点卡片要各有一份对应的文档，能直接在 dsh 应用里改」。
// 文档是**独立文件**（<档案目录>/<文档子目录>/<卡片文件名>），不是卡片正文；
// 空文档不落盘：内容 trim 后为空时，文件已存在就删掉、不存在就什么都不做。
console.log('\nAG. one document per card (chapter / node only)')
const kidsOf = (node) => {
  const out = []
  const visit = (n) => { if (!n) return; out.push(n); if (n.children) for (const c of n.children) visit(c) }
  visit(node)
  return out
}
const cardOf = (k) => view.findAll('sc-card').filter((n) => n.props['data-key'] === k)[0]
const badgeOf = (k) => kidsOf(cardOf(k)).filter((n) => n.kind === 'host' && String(n.props.className || '').indexOf('sc-docdot') !== -1)[0]
const winOf = (k) => view.findAll('sc-expand').filter((n) => n.props['data-win'] === k)[0]
const tabOf = (label) => view.findAll('sc-tab').filter((n) => view.textOf(n) === label)[0]
const btnOf = (label) => view.findAll('sc-btn').filter((n) => view.textOf(n) === label)[0]
// AF 里有一组卡片被移出画布了；自动排列会把这一层全部放回来
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '自动排列')[0])
await tick()
await tick()
ok(!!cardOf(N2), 'node N2 is on the canvas again')
ok(!!badgeOf(N2), 'a card that has a document shows the little corner badge')
ok(!badgeOf(N1), 'a card without one shows nothing')
ok(!badgeOf('card/condition-c1.md'), 'an empty document file does not count as "has a document"')

view.fire(cardOf(N2), 'onDoubleClick', {})
await wait(60)
ok(!!winOf(N2), 'the node window is open')
ok(!!tabOf('卡片') && !!tabOf('文档'), 'the window offers 卡片 | 文档 tabs')
eq(view.findMaybe('sc-docarea'), null, 'the card tab is the default — the document editor is not mounted yet')
view.click(tabOf('文档'))
await tick()
const docArea = view.findMaybe('sc-docarea')
ok(!!docArea, 'switching to 文档 mounts the DocEditor')
eq(docArea.props.value, files[DOCS_DIR + '/node-n2.md'], 'the editor loaded the document from disk')
ok(view.text().indexOf('剧本档案/文档/node-n2.md') !== -1, 'the status line shows the relative path')
has(view.text(), '已有文档（未改动）', 'and says the document has not been touched yet')
view.fire(docArea, 'onChange', { target: { value: '节点二的文档：改过一版。\n' } })
await tick()
has(view.text(), '● 未保存', 'editing marks the buffer dirty')
const writesBeforeDoc = writes.length
view.fire(view.findMaybe('sc-docarea'), 'onKeyDown', { key: 's', ctrlKey: true, stopPropagation() {}, preventDefault() {} })
await tick()
await tick()
const docWrite = writes.filter((w) => w.path === DOCS_DIR + '/node-n2.md').pop()
ok(!!docWrite, 'Ctrl+S wrote the document file')
ok(!!docWrite && docWrite.text.indexOf('改过一版') !== -1, 'with what was typed into the editor', docWrite && docWrite.text)
eq(writes.length, writesBeforeDoc + 1, 'and the card file was not touched (the document is a separate file)')
ok(!!calls.filter((c) => c.method === 'fsMkdir' && c.dir === DOCS_DIR).pop(), 'the document subdirectory is created before the first write (like cards/sub)')
has(view.text(), '已保存 ', 'the status line says when it was saved')
ok(view.text().indexOf('● 未保存') === -1, 'and the dirty mark is gone')

// 空文档不落盘：清空 → 保存 = 把文件删掉
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '   ' } })
await tick()
view.click(btnOf('保存'))
await tick()
await tick()
ok(!Object.prototype.hasOwnProperty.call(files, DOCS_DIR + '/node-n2.md'), 'an emptied document deletes the file (empty documents never stay on disk)')
ok(removes.indexOf(DOCS_DIR + '/node-n2.md') !== -1, 'and it went through fsRemove')
has(view.text(), '还没有文档', 'the status line says there is no document again')
const removesBefore = removes.length
view.click(btnOf('保存'))
await tick()
await tick()
eq(removes.length, removesBefore, 'saving an empty document again does not try to delete anything')
eq(writes.filter((w) => w.path === DOCS_DIR + '/node-n2.md').length, 1, 'and nothing gets created either')

// 再写一份非空的：角标应当自己回来
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '节点二的文档：回来了。\n' } })
await tick()
view.click(btnOf('保存'))
await tick()
await tick()
ok(Object.prototype.hasOwnProperty.call(files, DOCS_DIR + '/node-n2.md'), 'a non-empty document is written back')
view.click(view.find('sc-expandx'))
await tick()
ok(!!badgeOf(N2), 'the corner badge comes back once a document exists again')
ok(!badgeOf(N1), 'and the card without one still has none')

// 只有章节 / 节点有文档页：条件卡片什么都没有
view.fire(cardOf('card/condition-c1.md'), 'onDoubleClick', {})
await wait(60)
eq(view.findAll('sc-tab').length, 0, 'a condition card gets no document tab')
view.click(view.find('sc-expandx'))
await tick()
// 节点有页签，但文件不存在时是「还没有文档」，不是错误
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
has(view.text(), '还没有文档', 'a node without a document says so instead of erroring')
eq(view.findMaybe('sc-docarea').props.value, '', 'and the editor starts empty')
view.click(view.find('sc-expandx'))
await tick()

// 文档子目录名也能改（和 卡片 / 归档 一样，按项目存在浏览器本地）
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '设置')[0])
await tick()
const docsInput = view.findAll('sc-inp').filter((n) => n.props.value === '文档')[0]
ok(!!docsInput, 'the settings dialog has a field for the document subdirectory')
view.fire(docsInput, 'onChange', { target: { value: 'doc' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '保存')[0])
await tick()
await tick()
eq(JSON.parse(h.storage()['dsh-script-cards:state'])[ROOT].dirs.docs, 'doc', 'the new document dir name was stored')
ok(!!calls.filter((c) => c.method === 'fsList' && c.dir.indexOf('/doc') !== -1).pop(), 'the panel re-scanned using the new document directory')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '设置')[0])
await tick()
view.fire(view.findAll('sc-inp').filter((n) => n.props.value === 'doc')[0], 'onChange', { target: { value: '文档' } })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '保存')[0])
await tick()
await tick()
ok(view.findAll('sc-card').length >= 5, 'back on the original document dir (still inside chapter 甲)')
ok(!!badgeOf(N2), 'and the documents are found there again')
// 旧记录里没有 docs 字段（甚至整个 dirs 都是老形状）→ 回落默认值，不报错、更不会拿空名字去扫盘
const legacy = JSON.parse(h.storage()['dsh-script-cards:state'])
legacy[ROOT] = Object.assign({}, legacy[ROOT], { dirs: { archive: '剧本档案', cards: '卡片', sub: '归档' } })
h.storage()['dsh-script-cards:state'] = JSON.stringify(legacy)
const listsBeforeLegacy = calls.filter((c) => c.method === 'fsList').length
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
const legacyLists = calls.filter((c) => c.method === 'fsList').slice(listsBeforeLegacy)
ok(legacyLists.some((c) => c.dir === DOCS_DIR), 'a legacy record without the docs field falls back to 文档 when re-scanning', legacyLists.map((c) => c.dir))
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '设置')[0])
await tick()
ok(!!view.findAll('sc-inp').filter((n) => n.props.value === '文档')[0], 'and the settings dialog shows the default again')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '取消')[0])
await tick()

// ── AH. 浮动窗口：拖动 / 缩放 / 钉住多开 / 位置与模式记住 ──────────────────────
// 用户拍板：「默认改成浮动窗口 —— 拖标题栏移动、右下角手柄缩放（最小尺寸约 320×220，
// 不能拖出画布可视区），标题栏有图钉与全屏/浮动两个切换按钮。钉住的不自动关，
// 可以同时开多个。位置与模式记住。」
console.log('\nAH. the floating window: drag, resize, pin, remember')
const winStyle = (k) => {
  const w = winOf(k)
  return { x: Number(w.props.style.left), y: Number(w.props.style.top), w: Number(w.props.style.width), h: Number(w.props.style.height) }
}
const partOf = (k, cls) => kidsOf(winOf(k)).filter((n) => n.props && String(n.props.className || '') === cls)[0]
const modeBtnOf = (k) => kidsOf(winOf(k)).filter((n) => n.props && /^(全屏|浮动)$/.test(view.textOf(n)))[0]
const winTitles = () => view.findAll('sc-expand').map((n) => view.textOf(n))
view.fire(cardOf(N2), 'onDoubleClick', {})
await wait(60)
eq(JSON.stringify(winStyle(N2)), JSON.stringify({ x: 220, y: 35, w: 460, h: 430 }), 'a fresh window lands centred at 460×430')
const head = partOf(N2, 'sc-expandh')
ok(!!head, 'the window has a title bar')
view.fire(head, 'onPointerDown', { button: 0, clientX: 300, clientY: 300 })
await tick()
view.window('pointermove', { clientX: 340, clientY: 320 })
await tick()
eq(winStyle(N2).x, 260, 'dragging the title bar moves the window with the pointer')
eq(winStyle(N2).y, 55, 'on both axes')
view.window('pointerup', { clientX: 340, clientY: 320 })
await tick()
const storedWins = JSON.parse(h.storage()['dsh-script-cards:state'])[ROOT].windows
ok(!!storedWins[N2], 'the window geometry was written to localStorage')
eq(storedWins[N2].x, 260, 'with the x it was dragged to')
eq(storedWins[N2].mode, 'float', 'and the mode it is in')
// 拖完那一下 click 要被吃掉（不然松手正好落在标题栏按钮上就误触了）
let swallowed = false
view.fire(partOf(N2, 'sc-expandh'), 'onClick', { preventDefault() {}, stopPropagation() { swallowed = true } })
ok(swallowed, 'the click that ends a drag is swallowed')
view.fire(partOf(N2, 'sc-expandh'), 'onPointerDown', { button: 0, clientX: 300, clientY: 300 })
view.window('pointermove', { clientX: 5000, clientY: 5000 })
await tick()
const far = winStyle(N2)
ok(far.x + far.w <= 900 && far.y + far.h <= 500, 'you cannot drag a window out of the visible canvas', far)
view.window('pointerup', { clientX: 5000, clientY: 5000 })
await tick()
const grip = partOf(N2, 'sc-expandgrip')
ok(!!grip, 'the window has a resize grip in the bottom-right corner')
view.fire(grip, 'onPointerDown', { button: 0, clientX: 400, clientY: 400 })
view.window('pointermove', { clientX: 100, clientY: 100 })
await tick()
eq(winStyle(N2).w, 320, 'shrinking stops at the 320 minimum width')
eq(winStyle(N2).h, 220, 'and the 220 minimum height')
view.window('pointermove', { clientX: 5000, clientY: 5000 })
await tick()
const big = winStyle(N2)
eq(big.w, 900, 'growing stops at the canvas width')
eq(big.h, 500, 'and at the canvas height')
view.window('pointerup', { clientX: 5000, clientY: 5000 })
await tick()

// 钉住：切卡片不关，可以同时开好几个
const pinOf = (k) => kidsOf(winOf(k)).filter((n) => n.props && String(n.props.className || '').indexOf('sc-expandb') !== -1 && view.textOf(n) === '')[0]
view.click(pinOf(N2))
await tick()
ok(String(pinOf(N2).props.className).indexOf('on') !== -1, 'the pin button lights up when pinned')
view.fire(cardOf(N3), 'onDoubleClick', {})
await wait(60)
eq(view.findAll('sc-expand').length, 2, 'a pinned window stays open while another card opens')
ok(!!winOf(N2) && !!winOf(N3), 'both windows are on screen at once')
ok(winTitles().length === 2, 'each window keeps its own title')
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
eq(view.findAll('sc-expand').length, 1, 'changing level closes the unpinned window only')
ok(!!winOf(N2), 'the pinned one is still there')
eq(view.findMaybe('sc-scrim'), null, 'and it is still floating, not fullscreen')
// 切到全屏 → 模式记进 localStorage；关掉再开，回到全屏
view.click(modeBtnOf(N2))
await tick()
eq(JSON.parse(h.storage()['dsh-script-cards:state'])[ROOT].windows[N2].mode, 'full', 'the mode is remembered in localStorage')
ok(!!view.findMaybe('sc-scrim'), 'fullscreen mode brings the scrim back')
view.click(view.find('sc-expandx'))
await tick()
eq(view.findAll('sc-expand').length, 0, 'the window is closed')
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N2), 'onDoubleClick', {})
await wait(60)
ok(String(winOf(N2).props.className).indexOf('sc-full') !== -1, 're-opening the same card comes back in fullscreen mode')
ok(!!view.findMaybe('sc-scrim'), 'with its scrim')
view.click(modeBtnOf(N2))
await tick()
eq(JSON.parse(h.storage()['dsh-script-cards:state'])[ROOT].windows[N2].mode, 'float', 'switching back to 浮动 is remembered too')
eq(view.findMaybe('sc-scrim'), null, 'and the scrim goes away')
// 浮动窗口不锁画布：它开着，画布照样能拖
const t0 = translateOf()
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 0, clientX: 800, clientY: 460, target: blank })
await tick()
view.window('pointermove', { clientX: 850, clientY: 470 })
await tick()
ok(translateOf().x !== t0.x, 'the canvas still pans while a floating window is open')
view.window('pointerup', { clientX: 850, clientY: 470 })
await tick()
ok(translateOf().x !== t0.x, 'the canvas still pans while a floating window is open')
view.window('pointerup', { clientX: 850, clientY: 470 })
await tick()
// 点窗口里面不许被画布当成「空白处按下」（否则点一下文档输入框就开始平移画布）
const insideTarget = { closest: (sel) => (sel === '.sc-expand' ? {} : null), parentNode: null }
const t1 = translateOf()
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 0, clientX: 400, clientY: 300, target: insideTarget })
await tick()
eq(translateOf().x, t1.x, 'pressing inside a window does not start a canvas pan')
ok(String(view.find('sc-canvas').props.className).indexOf('panning') === -1, 'and does not switch to the grabbing cursor')

// ── AI. 编辑弹窗的「字段 | 文档」页签 ─────────────────────────────────────────
console.log('\nAI. the editor modal gets a 字段 | 文档 tab pair')
// 弹窗与它后面那个浮动窗口各有一套页签，所以取**最后一个**匹配（弹窗渲染在面板之后）
const modalTab = (label) => view.findAll('sc-tab').filter((n) => view.textOf(n) === label).pop()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('在详情里编辑') !== -1)[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the editor modal is open')
ok(!!modalTab('字段') && !!modalTab('文档'), 'the modal offers 字段 | 文档')
eq(view.findMaybe('sc-docarea'), null, '字段 is the default tab — nothing mounts the document editor yet')
ok(!!btnOf('保存（写回卡片文件）'), 'the footer saves the card while 字段 is active')
ok(!btnOf('保存（写回文档）'), 'and does not offer the document save yet')
view.click(modalTab('文档'))
await tick()
ok(!!view.findMaybe('sc-docarea'), 'the document editor is mounted inside the modal')
ok(!!btnOf('保存（写回文档）'), 'the footer button switches to "save the document" — the visible button must save what you are editing')
ok(!btnOf('保存（写回卡片文件）'), 'so it cannot write the card file by mistake')
ok(!!btnOf('删除卡片文件'), 'deleting the card is still available from the document tab')
const cardWritesBefore = writes.filter((w) => w.path === CARDS_DIR + '/node-n2.md').length
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '从弹窗里写回的文档。\n' } })
await tick()
view.click(btnOf('保存（写回文档）'))
await tick()
await tick()
ok(!!writes.filter((w) => w.path === DOCS_DIR + '/node-n2.md' && w.text.indexOf('从弹窗里写回') !== -1).pop(), 'that button wrote the document file')
eq(writes.filter((w) => w.path === CARDS_DIR + '/node-n2.md').length, cardWritesBefore, 'and left the card file alone')
view.click(modalTab('字段'))
await tick()
ok(!!btnOf('保存（写回卡片文件）'), 'switching back restores the card save button')
view.click(btnOf('取消'))
await tick()
ok(!view.findMaybe('sc-modal'), 'the modal is closed')
view.click(view.find('sc-expandx'))
await tick()
// 条件卡片：窗口与弹窗都没有文档页签
view.fire(cardOf('card/condition-c1.md'), 'onDoubleClick', {})
await wait(60)
eq(view.findAll('sc-tab').length, 0, 'a condition card gets no document tab in its window')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('在详情里编辑') !== -1)[0])
await tick()
eq(view.findAll('sc-tab').length, 0, 'nor in its editor modal')
view.click(btnOf('取消'))
await tick()
// 还没有文件的新卡片：也没有文档页签（文件是保存时才生成的）
view.fire(view.find('sc-canvas'), 'onContextMenu', { clientX: 500, clientY: 400 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('新建节点') !== -1)[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the new-card editor opened')
eq(view.findAll('sc-tab').length, 0, 'a card that has no file yet gets no document tab')
view.click(btnOf('取消'))
await tick()
view.click(view.find('sc-expandx'))
await tick()

// ── AJ. 删卡片时的文档三选一 ─────────────────────────────────────────────────
console.log('\nAJ. deleting a card asks about its document')
const openDeleteMenu = (k) => {
  view.fire(cardOf(k), 'onContextMenu', { clientX: 300, clientY: 300 })
  return tick().then(function () {
    view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('删除卡片文件') !== -1)[0])
    return tick()
  })
}
// 没有文档的卡片：保持老流程，不打扰
await openDeleteMenu(N1)
await tick()
const plainDlg = view.findMaybe('sc-modal')
ok(!!plainDlg, 'a card without a document still gets the plain confirm')
ok(!btnOf('一起删除文档') && !btnOf('只删卡片、留着文档'), 'with no document question attached')
view.click(btnOf('取消'))
await tick()
// 有文档的卡片：三选一
await openDeleteMenu(N3)
await tick()
const docDlg = view.findMaybe('sc-modal')
ok(!!docDlg, 'a card with a document gets the three-way confirm')
has(view.textOf(docDlg), '一起删除文档', 'which offers to delete the document too')
has(view.textOf(docDlg), '只删卡片、留着文档', 'and to keep it')
has(view.textOf(docDlg), '文档/node-n3.md', 'and names the document file')
view.click(btnOf('取消'))
await tick()
ok(Object.prototype.hasOwnProperty.call(files, CARDS_DIR + '/node-n3.md'), 'cancelling deletes nothing')
await openDeleteMenu(N3)
await tick()
view.click(btnOf('只删卡片、留着文档'))
await tick()
await tick()
ok(!Object.prototype.hasOwnProperty.call(files, CARDS_DIR + '/node-n3.md'), 'the card file was deleted')
ok(Object.prototype.hasOwnProperty.call(files, DOCS_DIR + '/node-n3.md'), 'and the document was kept')
await openDeleteMenu(N2)
await tick()
view.click(btnOf('一起删除文档'))
await tick()
await tick()
ok(!Object.prototype.hasOwnProperty.call(files, CARDS_DIR + '/node-n2.md'), 'the card file was deleted')
ok(!Object.prototype.hasOwnProperty.call(files, DOCS_DIR + '/node-n2.md'), 'and the document went with it')
// 弹窗里写回的文档也要点亮卡片上的角标（onDocChange 必须把卡片一起带给面板）
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('在详情里编辑') !== -1)[0])
await tick()
view.click(view.findAll('sc-tab').filter((n) => view.textOf(n) === '文档').pop())
await tick()
ok(!badgeOf(N1), 'node N1 has no document yet')
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '第一次给节点一写文档。\n' } })
await tick()
view.click(btnOf('保存（写回文档）'))
await tick()
await tick()
ok(Object.prototype.hasOwnProperty.call(files, DOCS_DIR + '/node-n1.md'), 'the editor modal wrote N1 a document')
view.click(btnOf('取消'))
await tick()
ok(!!badgeOf(N1), 'and the corner badge lights up (onDocChange is wired to the card, not to a bare true)')
view.click(view.find('sc-expandx'))
await tick()

// ── AK. 文档：保存失败要说原始原因；桥不在时只读并说明 ───────────────────────
console.log('\nAK. the document editor reports the raw failure and goes read-only')
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
// 章节卡片的展开入口在右键菜单里（双击是「进入下级」）
view.fire(cardOf(G1), 'onContextMenu', { clientX: 200, clientY: 200 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('展开') !== -1)[0])
await wait(60)
ok(!!winOf(G1), 'the chapter window is open')
view.click(tabOf('文档'))
await tick()
eq(view.findMaybe('sc-docarea').props.value, files[DOCS_DIR + '/chapter-g1.md'], 'the chapter document loaded')
// (a) 保存失败：红条与状态行里必须是**原始**失败原因，而不是一句「保存失败」
const realWriteFn = bridge.fsWrite
bridge.fsWrite = async () => ({ ok: false, error: { code: 'error.unavailable', message: '磁盘满了（假装的）' } })
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '写不进去的内容。\n' } })
await tick()
view.click(btnOf('保存'))
await tick()
await tick()
has(view.text(), '磁盘满了（假装的）', 'the raw failure reason is shown in the notice bar')
has(view.textOf(view.find('sc-docstate')), '磁盘满了（假装的）', 'and on the editor status line too')
has(view.text(), '● 未保存', 'the buffer stays dirty — nothing pretends it was saved')
bridge.fsWrite = realWriteFn
view.click(btnOf('保存'))
await tick()
await tick()
eq(files[DOCS_DIR + '/chapter-g1.md'], '写不进去的内容。\n', 'saving works again once the bridge is back')
// (b) 桥不在（只读）：输入框只读、按钮禁用，并把原因写出来
const backWriteFn = bridge.fsWrite
bridge.fsWrite = undefined
view.click(tabOf('卡片'))
await tick()
view.click(tabOf('文档'))
await tick()
const roArea = view.findMaybe('sc-docarea')
ok(!!roArea && roArea.props.readOnly === true, 'in read-only mode the document textarea is read-only')
has(view.text(), '只读模式', 'and the window explains why it cannot write')
eq(btnOf('保存').props.disabled, true, 'the save button is disabled')
bridge.fsWrite = backWriteFn
view.click(view.find('sc-expandx'))
await tick()

// ── AL. 新界面的样式契约 ─────────────────────────────────────────────────────
// 替身不跑 CSS，所以「拖动的地方不许能选中文字」「文档输入框必须等宽」这类只能靠契约钉住
// （真浏览器里的实测在 tests/visual.mjs）。
console.log('\nAL. CSS contracts for the new UI')
ok(/\.sc-expandh\{[^}]*user-select:none/.test(cssText), 'the title bar (the drag handle) cannot select text while you drag')
ok(/\.sc-expandh\{[^}]*cursor:move/.test(cssText), 'the title bar shows that it is draggable')
ok(/\.sc-expandgrip\{[^}]*cursor:nwse-resize/.test(cssText), 'the corner grip is a real resize handle')
ok(/\.sc-expandgrip\{[^}]*user-select:none/.test(cssText), 'and resizing does not select text either')
// 文档输入区是**两层**：底下的彩色高亮层 + 上面文字透明的 textarea。
// 「两层排字必须逐项一致」这条只能在契约层钉：字体 / 行高 / 内边距 / 折行规则写在
// 同一条选择器里（.sc-dochl,.sc-docarea），改一条就等于两条一起改。
const bothLayers = (cssText.match(/\.sc-dochl,\.sc-docarea\{[^}]*\}/) || [''])[0]
ok(!!bothLayers, 'the highlight layer and the textarea share one typography rule')
ok(/font-family:ui-monospace/.test(bothLayers), 'both layers are monospaced')
ok(/line-height:/.test(bothLayers) && /padding:/.test(bothLayers), 'both layers share the line height and padding')
ok(/white-space:pre-wrap/.test(bothLayers) && /word-break:break-word/.test(bothLayers), 'both layers wrap identically')
ok(/^\.sc-dochl,\.sc-docarea/.test(bothLayers.trim()), 'and neither layer overrides the other from a later rule (position/padding only via that pair)')
ok(/\.sc-docarea\{[^}]*color:transparent/.test(cssText), 'the textarea text itself is transparent')
ok(/\.sc-docarea\{[^}]*caret-color:/.test(cssText), 'and the caret has its own colour (otherwise you cannot see where you type)')
ok(/\.sc-dochl\{[^}]*overflow:hidden/.test(cssText), 'the highlight layer never scrolls on its own')
ok(/\.sc-docarea\{[^}]*overflow-y:scroll/.test(cssText), 'the textarea always reserves its scrollbar (that is what JS compensates for)')
ok(/\.sc-docarea::selection\{[^}]*background:/.test(cssText), 'the selection has a background (transparent text would otherwise vanish when selected)')
ok(/\.sc-docquiet\{/.test(cssText), 'narration leading spaces get their own dim style')
ok(!/\.sc-docarea\{[^}]*user-select:none/.test(cssText), 'the document textarea stays selectable (it is an input)')
ok(/\.sc-docdot\{[^}]*position:absolute/.test(cssText), 'the "has a document" badge is a corner badge')
ok(/\.sc-tab\.on\{[^}]*border-bottom-color/.test(cssText), 'the active tab is visually the active one')
ok(/\.sc-expandbody\.sc-docbody\{[^}]*overflow:hidden/.test(cssText), 'the document tab hands the scrolling to the textarea itself')
ok(/\.sc-expand\.sc-full/.test(cssText), 'fullscreen mode still has its own rule (the old behaviour is kept)')
ok(/\.sc-docrole\{/.test(cssText), 'the role chip (正在写：…) has its own rule')
ok(/\.sc-menuinput\{/.test(cssText), 'and so does the speaker filter box in the menu')

// ── AM. 文档里的台词 / 旁白结构 ───────────────────────────────────────────────
// 用户拍板：「文档可以加一个结构，右键出菜单，然后可以选取已经之前方片界面定义的角色，
// 后面的话就自动变成这个角色说的话，Enter 换行结束这个角色的话（其中要加旁白，
// 但是左侧不显示人名）」。
//   台词 「角色名」：台词   ·   旁白 行首两个全角空格、不写人名
//   选人后进入「该角色说话」：Enter 结束这个角色，Shift+Enter 换行但仍是同一个角色。
console.log('\nAM. dialogue and narration in the document')
// 现加两张人物卡（名字取括号之前那一段）和一张台词素材卡（不该出现在菜单里）——
// 这样前面 A 段的卡片计数不受影响。
files[CARDS_DIR + '/character-wasurenagusa.md'] = md({ id: 'character-wn', type: 'character', title: '勿忘我（ワスレナグサ）', summary: '人物简介', tags: '人物' })
files[CARDS_DIR + '/character-genku.md'] = md({ id: 'character-gk', type: 'character', title: '幻驹山茶（ゲンク サザンカ）', summary: '人物简介', tags: '人物' })
files[CARDS_DIR + '/dialogue-d2.md'] = md({ id: 'dialogue-d2', type: 'dialogue', title: '台词素材乙', summary: '台词库', tags: '台词' })
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
const carea = () => view.findMaybe('sc-docarea')
const caretBox = () => view.caretBox(view.find('sc-docarea'))
const setCaretToEnd = () => {
  const n = String(carea().props.value).length
  caretBox().start = n
  caretBox().end = n
}
const base = files[DOCS_DIR + '/node-n1.md']
eq(carea().props.value, base, 'the document written earlier is still there')
setCaretToEnd()
// 菜单：全部人物 + 旁白 + 结束当前角色
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
ok(!!view.findMaybe('sc-menu'), 'right-clicking the document opens a menu')
const docMenuText = () => view.textOf(view.find('sc-menu'))
const menuItem = (label) => view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf(label) !== -1)[0]
has(docMenuText(), '勿忘我', 'the character list uses the name before the bracket')
ok(docMenuText().indexOf('（ワスレナグサ）') === -1, 'and does not print the bracketed reading', docMenuText())
has(docMenuText(), '幻驹山茶', 'another character card is in the list')
has(docMenuText(), '人物甲', 'a title without brackets is used as-is')
has(docMenuText(), '旁白', 'the menu offers narration')
has(docMenuText(), '结束当前角色', 'and a way to end the current role')
ok(docMenuText().indexOf('台词素材乙') === -1, 'dialogue-material cards are not speakers')
ok(!!view.findMaybe('sc-menuinput'), 'there is a filter box (the cast can grow)')
// 筛选
view.fire(view.find('sc-menuinput'), 'onChange', { target: { value: '勿忘' } })
await tick()
has(docMenuText(), '勿忘我', 'filtering keeps the matching character')
ok(docMenuText().indexOf('幻驹山茶') === -1, 'and drops the others', docMenuText())
// 中间态：往菜单上按一下鼠标，菜单必须还在。老坑是「捕获阶段的 mousedown 就关菜单」——
// 那样菜单在菜单项的 click 之前被卸载，点任何一项都没反应（真实顺序：mousedown → mouseup → click）。
view.window('mousedown', { target: null })
await tick()
ok(!!view.findMaybe('sc-menu'), 'a mousedown does not tear the menu down before the click lands')
view.fire(view.find('sc-menuinput'), 'onChange', { target: { value: '' } })
await tick()
view.click(menuItem('勿忘我'))
await tick()
const afterPick = base + '「勿忘我」：'
// 续行＝(前缀宽度 − 1) 个全角空格 + 一个全角冒号：`「勿忘我」：` 宽 6 → 5 空格 + 冒号，
// 冒号正落在首行冒号那一列（用户拍板的「冒号加回对齐位」）
const padCont = '　'.repeat(5) + '：'
eq(carea().props.value, afterPick, 'picking a character inserts the 「name」： prefix at the caret')
has(view.text(), '正在写：勿忘我', 'the status bar shows who is speaking')
eq(caretBox().start, afterPick.length, 'and the caret lands right after the prefix')
eq(view.findMaybe('sc-menu'), null, 'the menu closed on pick')
// 打字：stopPropagation 不能丢（画布快捷键 Delete / 空格 / Ctrl+V 不许被抢）
view.fire(carea(), 'onChange', { target: { value: afterPick + '你终于来了。' } })
await tick()
setCaretToEnd()
let stopped = false
view.fire(carea(), 'onKeyDown', { key: 'Enter', shiftKey: true, preventDefault() {}, stopPropagation() { stopped = true } })
await tick()
const afterShift = afterPick + '你终于来了。\n' + padCont
eq(carea().props.value, afterShift, 'Shift+Enter breaks the line and pads it out to the dialogue column (no repeated name)')
ok(stopped, 'typing stops propagation so the canvas shortcuts do not steal the key')
has(view.text(), '正在写：勿忘我', 'and the role is still active')
// 直接 Enter ＝ 这一句说完了
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', preventDefault() {}, stopPropagation() {} })
await tick()
eq(carea().props.value, afterShift + '\n', 'a plain Enter ends the role: it only breaks the line (no indent)')
ok(view.text().indexOf('正在写：') === -1, 'and the status bar drops the role')
// 旁白：两个全角空格、没有人名
view.fire(carea(), 'onContextMenu', { clientX: 320, clientY: 320 })
await tick()
view.click(menuItem('旁白'))
await tick()
eq(carea().props.value, afterShift + '\n　　', 'narration starts with exactly two full-width spaces and no name')
has(view.text(), '正在写：旁白', 'the status bar says it is narration')
view.fire(carea(), 'onChange', { target: { value: afterShift + '\n　　雨停了。' } })
await tick()
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', shiftKey: true, preventDefault() {}, stopPropagation() {} })
await tick()
eq(carea().props.value, afterShift + '\n　　雨停了。\n　　', 'narration continuations keep the same two full-width spaces')
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', preventDefault() {}, stopPropagation() {} })
await tick()
eq(carea().props.value, afterShift + '\n　　雨停了。\n　　\n', 'Enter ends the narration too')
ok(view.text().indexOf('正在写：') === -1, 'no role chip any more')
// 前缀不许塞进句子中间：光标在行中间时先补一个换行
const beforeMid = carea().props.value
const tailStart = beforeMid.length
view.fire(carea(), 'onChange', { target: { value: beforeMid + '前半句后半句' } })
await tick()
caretBox().start = tailStart + 3
caretBox().end = tailStart + 3
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(menuItem('人物甲'))
await tick()
const afterMid = beforeMid + '前半句\n「人物甲」：后半句'
eq(carea().props.value, afterMid, 'a prefix picked mid-line gets its own line first')
// 当前角色在菜单里打勾；「结束当前角色」只结束状态、不写任何东西
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
has(docMenuText(), '✓ 人物甲', 'the menu ticks the character currently being written')
view.click(menuItem('结束当前角色'))
await tick()
ok(view.text().indexOf('正在写：') === -1, '结束当前角色 clears the state')
eq(carea().props.value, afterMid, 'and writes nothing')
// 没有角色时那颗菜单项是灰的；普通行不带任何前缀
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
eq(view.findAll('sc-menuitem').filter((n) => view.textOf(n) === '结束当前角色')[0].props.disabled, true, 'with no role active, 结束当前角色 is disabled')
view.fire(view.find('sc-menuback'), 'onMouseDown', {})
await tick()
eq(view.findMaybe('sc-menu'), null, 'pressing the backdrop dismisses the document menu')
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', preventDefault() {}, stopPropagation() {} })
await tick()
eq(carea().props.value, afterMid + '\n', 'a plain line breaks without any prefix')
// 台词与旁白是**字面**写进 .md 的
view.click(btnOf('保存'))
await tick()
await tick()
const savedDoc = files[DOCS_DIR + '/node-n1.md']
has(savedDoc, '「勿忘我」：你终于来了。', 'the dialogue line is stored literally in the .md')
has(savedDoc, '「人物甲」：后半句', 'and so is the second character')
has(savedDoc, '你终于来了。\n' + padCont, 'and the continuation indent (spaces + colon) is literal text in the .md too')
has(savedDoc, '\n　　雨停了。', 'narration keeps its two full-width spaces')
// 编辑弹窗那条线共用同一个 DocEditor，也要能弹出人物菜单
view.click(tabOf('卡片'))
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('在详情里编辑') !== -1)[0])
await tick()
view.click(view.findAll('sc-tab').filter((n) => view.textOf(n) === '文档').pop())
await tick()
view.fire(view.findAll('sc-docarea').pop(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
has(view.textOf(view.findMaybe('sc-menu')), '人物甲', 'the editor-modal entry point gets the speaker menu too')
view.fire(view.find('sc-menuback'), 'onMouseDown', {})
await tick()
view.click(btnOf('取消'))
await tick()
view.click(view.find('sc-expandx'))
await tick()

// ── AN. 方片页给人物卡设「角色色」（tile 右键菜单） ───────────────────────────
// 用户要的：方片页的**人物卡**右键 → 挑颜色（写进卡片文件的 color，跟项目进 git）、
// 「清除」＝回到 tags 里的「印象色#rrggbb」；其它类型的卡不给入口（他明确讨厌多余入口）。
console.log('\nAN. the grid sets a character colour from the tile context menu')
// 现加一张带「印象色」tag 的人物卡：清掉角色色之后应当回到 tag 里那个颜色
files[CARDS_DIR + '/character-mikan.md'] = md({ id: 'character-mk', type: 'character', title: '蜜柑（ミカン）', summary: '人物简介', tags: '人物, 印象色#3FA46A' })
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '方片')[0])
await tick()
const tileOf = (title) => view.findAll('sc-tile').filter((n) => view.textOf(n).indexOf(title) !== -1)[0]
const accentOf = (title) => { const t = tileOf(title); return t && t.props.style ? String(t.props.style['--sc-accent'] || '') : '' }
const dyeOf = (title) => String((tileOf(title) || {}).props && tileOf(title).props.className || '').indexOf(' dye') !== -1
const beatTile = tileOf('节拍甲')
ok(!!tileOf('蜜柑') && !!beatTile, 'both a character tile and a non-character tile are on the grid')
// 颜色来源：没有 frontmatter color 时读 tags 里的「印象色#」
ok(dyeOf('蜜柑'), 'a character card with 印象色 in its tags is tinted without any extra file field')
eq(accentOf('蜜柑'), '#3FA46A', 'and it uses exactly the colour from that tag')
ok(!dyeOf('节拍甲'), 'a non-character card is not tinted')
// 入口克制：非人物卡右键不弹菜单
view.fire(beatTile, 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
eq(view.findMaybe('sc-menu'), null, 'right-clicking a non-character tile opens no menu at all')
// 人物卡右键 → 色卡菜单
view.fire(tileOf('蜜柑'), 'onContextMenu', { clientX: 320, clientY: 260 })
await tick()
ok(!!view.findMaybe('sc-menu'), 'right-clicking a character tile opens the colour menu')
has(view.textOf(view.find('sc-menu')), '角色色', 'the menu says what it is')
ok(view.findAll('sc-swatch').length >= 8, 'it reuses the canvas swatch palette')
ok(!!view.findAll('sc-btn').filter((n) => view.textOf(n) === '清除')[0], 'and offers 清除 (back to the 印象色 tag)')
// 中间态：mousedown 不许把菜单拆掉（当年那个捕获阶段关菜单的坑）
view.window('mousedown', { target: null })
await tick()
ok(!!view.findMaybe('sc-menu'), 'a mousedown does not tear the tile menu down before the click lands')
// 挑一个色 → 写进卡片文件
const swatch = view.findAll('sc-swatch')[0]
const picked = String(swatch.props.style.background)
view.click(swatch)
await tick()
await tick()
has(files[CARDS_DIR + '/character-mikan.md'], 'color: ' + picked, 'picking a swatch writes color into the card frontmatter')
eq(accentOf('蜜柑'), picked, 'the tile immediately shows the new colour')
has(view.text(), '角色色 ' + picked, 'and the panel says so')
eq(view.findMaybe('sc-menu'), null, 'the menu closes after picking')
// 清除 → 回到 tags 里的印象色
view.fire(tileOf('蜜柑'), 'onContextMenu', { clientX: 320, clientY: 260 })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '清除')[0])
await tick()
await tick()
ok(String(files[CARDS_DIR + '/character-mikan.md']).indexOf('color: ') === -1, 'clearing drops the color line from the frontmatter')
eq(accentOf('蜜柑'), '#3FA46A', 'and the tile falls back to the 印象色 tag')
// 同一份数据源：给人物甲设色之后，**文档里那个名字的颜色立刻跟着变**
view.fire(tileOf('人物甲'), 'onContextMenu', { clientX: 320, clientY: 260 })
await tick()
const sw2 = view.findAll('sc-swatch')[1] || view.findAll('sc-swatch')[0]
const picked2 = String(sw2.props.style.background)
view.click(sw2)
await tick()
await tick()
has(files[CARDS_DIR + '/character-x.md'], 'color: ' + picked2, 'the same path works for the other character card')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
const nameSpan = view.findAll('sc-docname').filter((n) => view.textOf(n).indexOf('人物甲') !== -1)[0]
ok(!!nameSpan, 'the document highlight layer renders the character name')
eq(nameSpan && nameSpan.props.style ? nameSpan.props.style.color : '', picked2, 'and it picks up the colour set on the grid page right away (one source of truth)')
view.click(view.find('sc-expandx'))
await tick()
// 清掉人物甲的色：没有印象色 tag 的人物就完全没有颜色了（标题回到正文色）
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '方片')[0])
await tick()
view.fire(tileOf('人物甲'), 'onContextMenu', { clientX: 320, clientY: 260 })
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '清除')[0])
await tick()
await tick()
ok(!dyeOf('人物甲'), 'with no colour left at all (no 印象色 tag either) the tile is no longer tinted')
view.fire(beatTile, 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
eq(view.findMaybe('sc-menu'), null, 'a non-character tile still gets no menu')

// ── AO. 文档草稿缓存（写一半切卡片不许丢） ───────────────────────────────────
// 用户原话：「加个缓存，防止文档写一半，想要切卡片的时候，直接没掉」。
// 草稿只存浏览器本地（dsh-script-cards:drafts → { [cardKey]: { text, at } }），
// 不进档案目录、不产生文件；存成功后清掉、重载/放弃草稿也清掉；只读模式不写；有上限。
console.log('\nAO. document drafts survive switching cards')
const DRAFT_LS = 'dsh-script-cards:drafts'
const draftsIn = () => {
  try { return JSON.parse(h.storage()[DRAFT_LS] || '{}') } catch (e) { return {} }
}
const N1DOC = 'card/node-n1.md'
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
const diskText0 = files[DOCS_DIR + '/node-n1.md']
eq(carea().props.value, diskText0, 'the document starts from what is on disk')
eq(draftsIn()[N1DOC], undefined, 'and there is no draft for it yet')
// 打字 → 草稿（节流 400ms）
const typed1 = diskText0 + '草稿里的一行。\n'
view.fire(carea(), 'onChange', { target: { value: typed1 } })
await tick()
await wait(520)
const d1 = draftsIn()[N1DOC]
ok(!!d1, 'typing leaves a draft in localStorage')
eq(d1 && d1.text, typed1, 'with what was typed')
ok(d1 && typeof d1.at === 'number' && d1.at > 0, 'and a timestamp')
eq(d1 ? Object.keys(d1).sort().join(',') : '', 'at,text', 'the draft entry is just text + at')
eq(files[DOCS_DIR + '/node-n1.md'], diskText0, 'and nothing was written to disk (drafts are not files)')
// 切卡片（关窗口再开）→ 草稿回到输入框，并且说清楚这是草稿
view.click(view.find('sc-expandx'))
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
eq(carea().props.value, typed1, 're-opening the card restores the draft instead of the stale disk text')
has(view.text(), '草稿 ', 'the status line says it is a draft')
has(view.text(), '未保存', 'and that it is not saved')
ok(!!btnOf('放弃草稿'), 'and there is a way to throw the draft away')
eq(files[DOCS_DIR + '/node-n1.md'], diskText0, 'the disk copy is still untouched')
// 放弃草稿 → 回盘上内容、草稿清掉
view.click(btnOf('放弃草稿'))
await tick()
await tick()
eq(carea().props.value, diskText0, '放弃草稿 puts the disk text back')
eq(draftsIn()[N1DOC], undefined, 'and drops the draft')
ok(!btnOf('放弃草稿'), 'the button disappears with the draft')
has(view.text(), '已有文档（未改动）', 'and the status line goes back to the disk state')
// 保存成功 → 草稿清掉
const typed2 = diskText0 + '这一行存了。\n'
view.fire(carea(), 'onChange', { target: { value: typed2 } })
await tick()
await wait(520)
ok(!!draftsIn()[N1DOC], 'a draft is recorded again while typing')
view.click(btnOf('保存'))
await tick()
await tick()
has(files[DOCS_DIR + '/node-n1.md'], '这一行存了。', 'saving writes the document')
eq(draftsIn()[N1DOC], undefined, 'and clears the draft (otherwise the next open would restore stale text)')
// 重载 → 草稿清掉
view.fire(carea(), 'onChange', { target: { value: typed2 + '重载会丢掉这一行。\n' } })
await tick()
await wait(520)
ok(!!draftsIn()[N1DOC], 'typing again leaves a draft')
view.click(btnOf('重载'))
await tick()
await tick()
eq(carea().props.value, files[DOCS_DIR + '/node-n1.md'], '重载 reads the disk copy back')
eq(draftsIn()[N1DOC], undefined, 'and clears the draft too')
// 只读模式（桥不在）不写草稿：别把只读时的浏览内容存进去
const writeFnKept = bridge.fsWrite
bridge.fsWrite = undefined
view.click(tabOf('卡片'))
await tick()
view.click(tabOf('文档'))
await tick()
eq(view.findMaybe('sc-docarea').props.readOnly, true, 'the editor is read-only without the bridge')
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '只读里敲的，不该被存下来' } })
await tick()
await wait(520)
eq(draftsIn()[N1DOC], undefined, 'read-only mode never writes a draft')
bridge.fsWrite = writeFnKept
view.click(tabOf('卡片'))
await tick()
view.click(tabOf('文档'))
await tick()
// 上限：最多 50 条，超出丢最旧的
const seeded = {}
for (let i = 0; i < 55; i++) seeded['card/draft-' + i + '.md'] = { text: 'd' + i, at: 1000 + i }
h.storage()[DRAFT_LS] = JSON.stringify(seeded)
const fileCount0 = Object.keys(files).length
view.fire(view.findMaybe('sc-docarea'), 'onChange', { target: { value: '触发一次草稿写入。' } })
await tick()
await wait(520)
const capped = draftsIn()
eq(Object.keys(capped).length, 50, 'the draft store is capped at 50 entries')
ok(!!capped[N1DOC], 'the newest draft (ours) is kept')
ok(!!capped['card/draft-54.md'], 'the newest seeded draft is kept')
ok(!capped['card/draft-5.md'] && !capped['card/draft-0.md'], 'the oldest ones were evicted')
eq(Object.keys(files).length, fileCount0, 'and none of this created any file in the archive')
view.click(view.find('sc-expandx'))
await tick()
// ── AO2. 草稿的两个洞：卸载时不许丢、定时器不许认错卡 ────────────────────────
// 洞一：打完最后一个字、400ms 内关窗（或切卡片）—— 卸载时必须**立刻 flush**，
//       不能把挂着的那条留给定时器（用户点名要防的就是这一段）。
console.log('\nAO2. drafts flush on unmount and never mark the wrong card')
delete h.storage()[DRAFT_LS]
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
const diskN1 = files[DOCS_DIR + '/node-n1.md']
view.fire(carea(), 'onChange', { target: { value: diskN1 + '最后一行，来不及等定时器。\n' } })
await tick()
view.click(view.find('sc-expandx'))
await tick()
ok(!!draftsIn()[N1DOC], 'closing the window right after typing still writes the draft (unmount flushes it)')
eq(draftsIn()[N1DOC] && draftsIn()[N1DOC].text, diskN1 + '最后一行，来不及等定时器。\n', 'with the last keystrokes included')
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
has(carea().props.value, '来不及等定时器', 'and re-opening the card gets that text back')
// 洞二：同一个编辑器换成另一张卡（编辑弹窗从这张换到那张）时，挂着的定时器不许把
//       **新卡**的状态行写成「草稿 …未保存」；写入仍要落到旧卡自己的 key 上。
const draftsBefore2 = draftsIn()
ok(!!draftsBefore2[N1DOC], 'N1 has a draft before the switch')
// 走真实路径：章节卡片的「下属节点」列表点一下 → 面板把编辑弹窗换到那张卡
// （同一个 CardEditor 实例，DocEditor 只是换了 props）。得先回到上级才有章节卡片。
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
view.fire(cardOf(G1), 'onContextMenu', { clientX: 200, clientY: 200 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('展开') !== -1)[0])
await wait(60)
view.click(tabOf('卡片'))
await tick()
const nodeRows = () => view.findAll('sc-nodelistrow')
ok(nodeRows().length >= 2, 'the chapter window lists its nodes')
// 第一行是「节点一」（order 10，最小的那个）；换卡要换到**另一张有文档页的卡**（node 类型）
const firstRow = nodeRows().filter((n) => view.textOf(n).indexOf('节点一') !== -1)[0] || nodeRows()[0]
view.click(firstRow)
await tick()
ok(!!view.findMaybe('sc-modal'), 'clicking a node row opens the editor modal for it')
view.click(view.findAll('sc-tab').filter((n) => view.textOf(n) === '文档').pop())
await tick()
ok(!!view.findMaybe('sc-docarea'), 'and the modal shows its document')
view.fire(view.findAll('sc-docarea').pop(), 'onChange', { target: { value: '这张卡的草稿，马上换卡。' } })
await tick()
// 立刻换成另一张卡（同一个 CardEditor 实例，DocEditor 只是换了 props）
const otherRow = nodeRows().filter((n) => view.textOf(n).indexOf('节点') !== -1 && view.textOf(n).indexOf('节点一') === -1)[0]
ok(!!otherRow, 'there is another node row to switch to')
view.click(otherRow)
await tick()
await wait(520)
eq(String((draftsIn()[N1DOC] || {}).text), '这张卡的草稿，马上换卡。', 'the pending draft is flushed to the card it belongs to')
eq(view.textOf(view.find('sc-docstate')).indexOf('草稿'), -1, 'switching cards never marks the new card as a draft')
eq(String(view.findMaybe('sc-docarea').props.value).indexOf('这张卡的草稿'), -1, 'and the new card shows its own content, not the old buffer')
view.click(btnOf('取消'))
await tick()
view.click(view.find('sc-expandx'))
await tick()

// ── AP. 台词续行带冒号（对齐位）＋ 高亮层认人 ────────────────────────────────
// 用户拍板：续行＝(前缀宽度 − 1) 个全角空格 + 一个全角冒号，冒号落在首行冒号那一列；
// 高亮层里那个冒号用**当前角色**的颜色；普通行/旁白行/空行一来就清掉当前角色。
console.log('\nAP. continuation lines carry an aligned colon in the role colour')
delete h.storage()[DRAFT_LS]
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
setCaretToEnd()
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
// 蜜柑的 tags 里有「印象色#3FA46A」，所以她的名字与续行冒号都该是这个色
view.click(menuItem('蜜柑'))
await tick()
const apLine1 = String(carea().props.value)
has(apLine1, '「蜜柑」：', 'picking a character writes the full-width colon prefix')
setCaretToEnd()
const colonSpans = () => view.findAll('sc-docname').filter((n) => view.textOf(n) === '：')
const colonsBefore = colonSpans().length
view.fire(carea(), 'onKeyDown', { key: 'Enter', shiftKey: true, preventDefault() {}, stopPropagation() {} })
await tick()
// `「蜜柑」：`＝「1 + 蜜柑 2 + 」1 + ：1 ＝ 宽 5 → 续行＝ 4 个全角空格 + 冒号
const contMarker = '　'.repeat(4) + '：'
ok(String(carea().props.value).slice(-contMarker.length) === contMarker, 'Shift+Enter pads (width − 1) full-width spaces and lands the colon on the first line\'s column', JSON.stringify(String(carea().props.value).slice(-8)))
eq(colonSpans().length, colonsBefore + 1, 'the highlight layer renders one more continuation colon')
const newColon = colonSpans()[colonSpans().length - 1]
eq(newColon && newColon.props.style ? (newColon.props.style.color || '') : '', '#3FA46A', 'and colours it with the current role\'s colour')
// 旁白：两个全角空格、**不带冒号**
view.fire(carea(), 'onChange', { target: { value: String(carea().props.value) + '　　雨停了。' } })
await tick()
setCaretToEnd()
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(menuItem('旁白'))
await tick()
ok(String(carea().props.value).slice(-2) === '　　', 'narration still starts with two full-width spaces and no colon')
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', shiftKey: true, preventDefault() {}, stopPropagation() {} })
await tick()
ok(String(carea().props.value).slice(-2) === '　　', 'and its continuation keeps the two spaces (no colon)')
// 当前角色只在台词首行之后有效：普通行一来就清掉，后面那行的 `　　：` 不许被当成续行误染
setCaretToEnd()
view.fire(carea(), 'onKeyDown', { key: 'Enter', preventDefault() {}, stopPropagation() {} })
await tick()
setCaretToEnd()
const colonsBeforeStray = colonSpans().length
view.fire(carea(), 'onChange', { target: { value: String(carea().props.value) + '　　：这句不是蜜柑说的' } })
await tick()
eq(colonSpans().length, colonsBeforeStray, 'a colon after a plain line is not treated as a role continuation (no stale colour)')
ok(!view.findAll('sc-docname').some((n) => view.textOf(n).indexOf('这句不是蜜柑说的') !== -1), 'that line is rendered as plain text, not as a role line')

// ── AQ. 台词菜单按主角 / 配角 / 其他分组（方片页不动） ───────────────────────
console.log('\nAQ. the speaker menu groups the cast (the grid page is untouched)')
files[CARDS_DIR + '/character-iwasaki.md'] = md({ id: 'character-iw', type: 'character', title: '岩崎贤也', summary: '人物简介', tags: '人物, 主角' })
files[CARDS_DIR + '/character-rose.md'] = md({ id: 'character-rs', type: 'character', title: '绮丽蔷薇（キレイバラ）', summary: '人物简介', tags: '人物 攻略对象' })
files[CARDS_DIR + '/character-takamiya.md'] = md({ id: 'character-tk', type: 'character', title: '高宫诚', summary: '人物简介', tags: '人物, 配角' })
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
// 刷新之后这个文档窗口还在（刷新换的是 cards/speakers，不动浮窗），直接接着开菜单
ok(!!view.findMaybe('sc-docarea'), 'the document window survived the refresh')
setCaretToEnd()
view.fire(carea(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
const aqText = () => view.textOf(view.find('sc-menu'))
has(aqText(), '主角（2）', 'the 主角 group head counts the lead-tagged cards')
has(aqText(), '配角（1）', 'the 配角 group head counts the support-tagged card')
has(aqText(), '其他（4）', 'everything else falls into 其他')
has(aqText(), '岩崎贤也', 'a lead (tagged 主角) is listed')
has(aqText(), '绮丽蔷薇', 'a lead tagged with a space-separated keyword is recognised too')
has(aqText(), '高宫诚', 'a support character is listed')
ok(aqText().indexOf('主角（2）') < aqText().indexOf('配角（1）') && aqText().indexOf('配角（1）') < aqText().indexOf('其他（4）'), 'groups come in the order 主角 → 配角 → 其他')
// 筛选：只留命中的组，计数跟着变
view.fire(view.find('sc-menuinput'), 'onChange', { target: { value: '贤' } })
await tick()
has(aqText(), '主角（1）', 'filtering recounts the group')
ok(aqText().indexOf('配角') === -1 && aqText().indexOf('其他') === -1, 'and drops the groups with no hit')
view.fire(view.find('sc-menuinput'), 'onChange', { target: { value: '' } })
await tick()
view.fire(view.find('sc-menuback'), 'onMouseDown', {})
await tick()
view.click(view.find('sc-expandx'))
await tick()
// 方片页的分组一个都不许动（还是按卡片类型分）
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '方片')[0])
await tick()
const gridHeads = view.findAll('sc-group').map((n) => view.textOf(n))
ok(gridHeads.some((t) => /^人物 \(/.test(t)), 'the grid still groups by card type (人物)')
ok(!gridHeads.some((t) => /主角|配角/.test(t)), 'and never by the dialogue-menu groups')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()

// ── AR. 画布引用卡（「存档卡抽屉」拖取） ─────────────────────────────────────
// 用户拍板：拖进来的是**引用** —— 不新建文件、不改卡片文件，位置只写 分支.json 的
// refs[ctx][cardKey]；能摆能看能染、不能改内容、不连线、不参与自动排列。
console.log('\nAR. reference cards dragged in from the archive drawer')
const GRAPH_ONLY = (k) => k !== GRAPH
const cardSnap = () => Object.keys(files).filter(GRAPH_ONLY).sort().map((k) => k + '=' + files[k]).join('\n')
const snap0 = cardSnap()
const g0 = JSON.parse(files[GRAPH])
const g1pos0 = { x: g0.nodes['card/chapter-g1.md'].x, y: g0.nodes['card/chapter-g1.md'].y }
const g2pos0 = { x: g0.nodes['card/chapter-g2.md'].x, y: g0.nodes['card/chapter-g2.md'].y }
// 打开抽屉
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
await tick()
ok(!!view.findMaybe('sc-drawer'), 'the archive drawer opens from the nav bar')
has(view.textOf(view.find('sc-drawer')), '人物', 'it lists the archive family (grouped by type)')
has(view.textOf(view.find('sc-drawer')), '章节', 'and the branch cards of the other level')
ok(view.findAll('sc-draweritem').length >= 5, 'with cards in it', view.findAll('sc-draweritem').length)
// 从抽屉里拖一张人物卡到画布（左键）
const drawerDrag = async (title, cxp, cyp) => {
  const item = view.findAll('sc-draweritem').filter((n) => view.textOf(n).indexOf(title) !== -1)[0]
  ok(!!item, 'the drawer has «' + title + '»')
  view.fire(item, 'onPointerDown', { button: 0, clientX: 700, clientY: 300 })
  await tick()
  ok(!!view.findMaybe('sc-ghost'), 'dragging from the drawer shows a ghost card')
  const c = toClient(cxp, cyp)
  view.window('pointermove', { clientX: c.clientX, clientY: c.clientY })
  await tick()
  view.window('pointerup', { clientX: c.clientX, clientY: c.clientY })
  await tick()
}
await drawerDrag('人物甲', 300, 200)
const gRef = JSON.parse(files[GRAPH])
// 注意键是 cardKey(card)：人物卡住在「卡片/」里，所以是 card/<文件>（archive/ 是「归档/」那族的）
const refX = 'card/character-x.md'
ok(!!(gRef.refs && gRef.refs.top && gRef.refs.top[refX]), 'dropping a card on the top canvas writes refs.top[cardKey]')
ok(Number.isInteger(gRef.refs.top[refX].x) && Number.isInteger(gRef.refs.top[refX].y), 'with integer canvas coordinates', gRef.refs.top[refX])
// 卡片文件一个都没改、一个新文件都没建（唯一落盘目标就是 分支.json）
eq(cardSnap(), snap0, 'no card file changed and no new file was created')
eq(gRef.nodes[refX], undefined, 'and the referenced card got no node record either')
ok(!!view.findAll('sc-refcard').length, 'the reference is drawn on the canvas')
ok(!!view.findMaybe('sc-refcard') && !view.findAll('sc-refcard').some((n) => kidsOf(n).some((x) => x.kind === 'host' && String(x.props.className || '').indexOf('sc-port') !== -1)),
  'a reference card has no link ports')
// 进节点画布，把一张**章节卡**拖进来：写在这个章节自己的 ctx 下
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
await drawerDrag('章节乙', 260, 180)
const gRef2 = JSON.parse(files[GRAPH])
const ctxG1 = 'card/chapter-g1.md'
const refG2 = 'card/chapter-g2.md'
ok(!!(gRef2.refs[ctxG1] && gRef2.refs[ctxG1][refG2]), 'on a chapter canvas the ref is stored under that chapter\'s ctx')
eq(JSON.stringify({ x: gRef2.nodes[refG2].x, y: gRef2.nodes[refG2].y }), JSON.stringify(g2pos0), 'and the chapter card\'s own node x/y is untouched')
// 同一张卡在两个 ctx 下各存一份，互不影响
await drawerDrag('人物甲', 200, 340)
const gRef3 = JSON.parse(files[GRAPH])
const inTop = gRef3.refs.top[refX]
const inCtx = gRef3.refs[ctxG1][refX]
ok(!!inTop && !!inCtx, 'the same card can sit on both canvases at once')
ok(inTop.y !== inCtx.y, 'and each canvas keeps its own position', [inTop, inCtx])
eq(JSON.stringify({ x: gRef3.nodes[ctxG1].x, y: gRef3.nodes[ctxG1].y }), JSON.stringify(g1pos0), 'no level\'s own card was moved by any of this')
const refElOf = (key) => view.findAll('sc-refcard').filter((n) => n.props['data-key'] === key)[0]
ok(!!refElOf(refX), 'the dropped character reference is on this canvas')
// 在画布上拖动这张引用卡：只改 refs 里的 x/y，被引用卡自己的 nodes 记录一动不动
const rBefore = JSON.parse(files[GRAPH]).refs[ctxG1][refX]
const nodeRecBefore = JSON.stringify(JSON.parse(files[GRAPH]).nodes[refX] || null)
const dragA = toClient(rBefore.x + 60, rBefore.y + 40)
const dragB = toClient(rBefore.x + 170, rBefore.y + 130)
view.fire(refElOf(refX), 'onPointerDown', { button: 0, clientX: dragA.clientX, clientY: dragA.clientY })
await tick()
view.window('pointermove', { clientX: dragB.clientX, clientY: dragB.clientY })
await tick()
view.window('pointerup', { clientX: dragB.clientX, clientY: dragB.clientY })
await tick()
const rAfter = JSON.parse(files[GRAPH]).refs[ctxG1][refX]
ok(rAfter.x !== rBefore.x || rAfter.y !== rBefore.y, 'dragging a reference card moves it (writes refs[ctx][cardKey].x/y)')
ok(Number.isInteger(rAfter.x) && Number.isInteger(rAfter.y), 'the new position is integral')
eq(JSON.stringify(JSON.parse(files[GRAPH]).nodes[refX] || null), nodeRecBefore, 'and the referenced card\'s own node record is untouched by that drag')
ok(!!refElOf(refX), 'the dropped character reference is still on this canvas')
view.fire(refElOf(refX), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
const refMenu = view.textOf(view.find('sc-menu'))
has(refMenu, '染色', 'the reference menu offers dyeing')
has(refMenu, '从画布移开', 'and taking it off the canvas')
ok(refMenu.indexOf('删除卡片文件') === -1 && refMenu.indexOf('复制') === -1 && refMenu.indexOf('连线') === -1,
  'and nothing else (no delete / copy / link entries)', refMenu)
view.fire(view.find('sc-menuback'), 'onMouseDown', {})
await tick()
// 双击＝只读详情（没有编辑入口、没有文档页签）
view.fire(refElOf(refX), 'onDoubleClick', {})
await wait(60)
ok(!!winOf(refX), 'double-clicking a reference opens the detail window')
eq(view.findAll('sc-tab').length, 0, 'the reference detail has no tabs (no document page)')
eq(view.findMaybe('sc-docarea'), null, 'and no document editor')
ok(view.textOf(winOf(refX)).indexOf('要改内容回方片页') !== -1, 'it says to edit the content back on the grid page')
ok(!view.findAll('sc-btn').some((n) => view.textOf(n).indexOf('在详情里编辑') !== -1), 'and there is no edit entry at all')
view.click(view.find('sc-expandx'))
await tick()
// 「从画布移开」只删 refs 那条
view.fire(refElOf(refX), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('从画布移开') !== -1)[0])
await tick()
const gRef4 = JSON.parse(files[GRAPH])
eq(gRef4.refs[ctxG1][refX], undefined, '从画布移开 drops just that ref entry')
ok(!!gRef4.refs.top[refX], 'and leaves the other canvas\'s ref alone')
ok(!!files[CARDS_DIR + '/character-x.md'], 'the card file is still there (references never delete files)')
eq(cardSnap(), snap0, 'no card file touched, no file created')
// 自动排列不动引用卡
const beforeArrange = JSON.stringify(JSON.parse(files[GRAPH]).refs)
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '自动排列')[0])
await tick()
await tick()
eq(JSON.stringify(JSON.parse(files[GRAPH]).refs), beforeArrange, 'auto-arrange leaves the reference positions alone')
// 只读详情那条窗口关掉
if (winOf(refX)) { view.click(view.find('sc-expandx')); await tick() }
// 批量：框选一张原生卡 + 一张引用卡 → 「删除卡片文件」只数原生卡，引用卡只移开
// （就在这个章节画布上做：这里既有原生节点卡，也有刚拖进来的引用）
await drawerDrag('人物甲', 460, 360)
const gBeforeBatch = JSON.parse(files[GRAPH])
ok(!!gBeforeBatch.refs[ctxG1][refX], 'the character reference is back on this canvas')
const nativeKey = Object.keys(gBeforeBatch.nodes).filter(function (k) {
  const rec = gBeforeBatch.nodes[k]
  if (k.indexOf('chapter-') !== -1) return false
  if (rec.x === null || rec.cx === null) return false
  // 挑一张**没有文档**的：这样确认框就是最朴素的两步，不带文档三选一
  return !files[DOCS_DIR + '/' + k.replace(/^card\//, '')]
})[0]
ok(!!nativeKey, 'there is a placed native card without a document to mix into the batch', nativeKey)
const nativeFile = nativeKey.replace(/^card\//, '')
const rNative = gBeforeBatch.nodes[nativeKey]
const rRef = gBeforeBatch.refs[ctxG1][refX]
const rn = { x: rNative.cx, y: rNative.cy, w: 156, h: 112 }
const boxA = toClient(Math.min(rn.x, rRef.x) - 20, Math.min(rn.y, rRef.y) - 20)
const boxB = toClient(Math.max(rn.x + rn.w, rRef.x + rn.w) + 20, Math.max(rn.y + rn.h, rRef.y + rn.h) + 20)
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 2, clientX: boxA.clientX, clientY: boxA.clientY, target: blank })
view.window('pointermove', { clientX: boxB.clientX, clientY: boxB.clientY, buttons: 2 })
await tick()
view.window('pointerup', { clientX: boxB.clientX, clientY: boxB.clientY })
await tick()
const selNow = view.findAll('sc-card').filter((n) => String(n.props.className).indexOf(' on') !== -1 || String(n.props.className).indexOf('on ') !== -1).map((n) => n.props['data-key'])
ok(selNow.indexOf(refX) !== -1 && selNow.indexOf(nativeKey) !== -1, 'the marquee selects both the native card and the reference', selNow)
view.fire(refElOf(refX), 'onContextMenu', { clientX: 400, clientY: 400 })
await tick()
// 框选收尾的那一下右键是被吃掉的（AF 里的老规矩），所以再点一下才出批量菜单
view.fire(refElOf(refX), 'onContextMenu', { clientX: 400, clientY: 400 })
await tick()
const batchText = view.textOf(view.find('sc-menu'))
const selRefs = selNow.filter((k) => !!gBeforeBatch.refs[ctxG1][k])
const selNative = selNow.filter((k) => !gBeforeBatch.refs[ctxG1][k])
ok(selRefs.indexOf(refX) !== -1, 'the box mixes a reference in with the native cards')
ok(selNative.length >= 1, 'and at least one native card')
has(batchText, '删除这 ' + selNative.length + ' 张卡片文件', 'the batch delete counts only the native cards (references are not counted)')
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('删除这 ') !== -1)[0])
await tick()
ok(!!view.findMaybe('sc-modal'), 'the plain confirm appears for the native cards')
view.click(btnOf('删除'))
await tick()
await tick()
const gAfterBatch = JSON.parse(files[GRAPH])
for (const k of selNative) {
  eq(files[CARDS_DIR + '/' + k.replace(/^card\//, '')], undefined, 'native card file deleted: ' + k)
  ok(gAfterBatch.nodes[k] === undefined, 'and it left the graph: ' + k)
}
ok(!!files[CARDS_DIR + '/character-x.md'], 'the referenced card file was NOT deleted')
ok(!(gAfterBatch.refs[ctxG1] && gAfterBatch.refs[ctxG1][refX]), 'and the reference was only taken off the canvas')
// 卡片文件被删 → 重新载入时对应的 refs 一起消失，并且会回写一次
files[CARDS_DIR + '/character-y-will-vanish.md'] = md({ id: 'character-y', type: 'character', title: '临时人物乙', summary: '一会儿就删掉' })
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
await drawerDrag('临时人物乙', 480, 240)
const refY = 'card/character-y-will-vanish.md'
ok(!!JSON.parse(files[GRAPH]).refs[ctxG1][refY], 'a ref to the doomed character is in place')
delete files[CARDS_DIR + '/character-y-will-vanish.md']
const writesBeforeReload = writes.length
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '刷新')[0])
await tick()
await tick()
await tick()
const gPruned = JSON.parse(files[GRAPH])
ok(!gPruned.refs[ctxG1] || gPruned.refs[ctxG1][refY] === undefined, 'once the card file is gone the ref disappears on reload')
ok(writes.length > writesBeforeReload, 'and that pruning was written back to 分支.json')
// 只读模式：抽屉能看不能拖
const writeKept = bridge.fsWrite
bridge.fsWrite = undefined
const refsBeforeRO = JSON.stringify(JSON.parse(files[GRAPH]).refs || {})
const roItem = view.findAll('sc-draweritem').filter((n) => view.textOf(n).indexOf('人物甲') !== -1)[0]
view.fire(roItem, 'onPointerDown', { button: 0, clientX: 700, clientY: 300 })
await tick()
eq(view.findMaybe('sc-ghost'), null, 'in read-only mode the drawer does not start a drag')
has(view.text(), '只读', 'and it explains why (the panel is read-only)')
view.window('pointerup', { clientX: 500, clientY: 300 })
await tick()
eq(JSON.stringify(JSON.parse(files[GRAPH]).refs || {}), refsBeforeRO, 'nothing was dropped while read-only')
bridge.fsWrite = writeKept
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
await tick()
eq(view.findMaybe('sc-drawer'), null, 'the drawer closes again')
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()

// ── AS. 行首前缀整体删除（③b） ───────────────────────────────────────────────
// 用户原话：「应该把角色名当做一个整体，删除的时候整体删除，有的时候会出现删除一半的情况，
// 非常抽象」。三种前缀（角色首行 / 续行 `　　…：` / 旁白的两个全角空格）都按一整个删。
console.log('\nAS. the line-start prefix is deleted as one unit')
delete h.storage()[DRAFT_LS]
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
view.fire(cardOf(N1), 'onDoubleClick', {})
await wait(60)
view.click(tabOf('文档'))
await tick()
const careaAS = () => view.findMaybe('sc-docarea')
const setTextAS = async (v) => { view.fire(careaAS(), 'onChange', { target: { value: v } }); await tick() }
// 摆光标 / 选区：mini-react 的 caretBox 返回的是一个活盒子
const caretAS = (start, end) => { const b = view.caretBox(careaAS()); b.start = start; b.end = end === undefined ? start : end; return b }
const keyAS = async (key, at, extra) => {
  caretAS(at)
  view.fire(careaAS(), 'onKeyDown', Object.assign({ key: key, preventDefault() {}, stopPropagation() {} }, extra || {}))
  await tick()
}
// ①光标紧跟 `「勿忘我」：` 之后 Backspace → 整块前缀消失、正文留下、光标在行首
await setTextAS('「勿忘我」：你终于来了。')
await keyAS('Backspace', '「勿忘我」：'.length)
eq(careaAS().props.value, '你终于来了。', 'Backspace right after the 「name」: prefix removes the whole prefix')
eq(view.caretBox(careaAS()).start, 0, 'and the caret lands at the start of the line')
// ②光标在前缀中间（`「勿忘` 之后）Backspace → 也整块消失
await setTextAS('「勿忘我」：你终于来了。')
await keyAS('Backspace', '「勿忘'.length)
eq(careaAS().props.value, '你终于来了。', 'Backspace inside the prefix removes the whole thing too')
// ③行首 Delete → 整块消失
await setTextAS('「勿忘我」：你终于来了。')
await keyAS('Delete', 0)
eq(careaAS().props.value, '你终于来了。', 'Delete at the start of the line removes the whole prefix')
// ④前缀中间 Delete → 整块消失
await setTextAS('「勿忘我」：你终于来了。')
await keyAS('Delete', 3)
eq(careaAS().props.value, '你终于来了。', 'Delete inside the prefix removes the whole thing too')
// ⑤续行 `　　　　：` 整体删（不许只删冒号、把对齐空格留着）
await setTextAS('「勿忘我」：你终于来了。\n' + padCont + '伞收在门口就行。')
await keyAS('Backspace', ('「勿忘我」：你终于来了。\n' + padCont).length)
eq(careaAS().props.value, '「勿忘我」：你终于来了。\n伞收在门口就行。', 'the continuation prefix is removed as one block (spaces + colon together)')
// ⑥旁白行首 Backspace → 两个全角空格一起删
await setTextAS('　　雨停之后，屋檐还在滴水。')
await keyAS('Backspace', 2)
eq(careaAS().props.value, '雨停之后，屋檐还在滴水。', 'the narration prefix (two full-width spaces) goes in one go')
// ⑦普通行里 Backspace / Delete 行为不变（不许抢）
await setTextAS('普通的一行。')
caretAS(2)
let asPrevented = false
view.fire(careaAS(), 'onKeyDown', { key: 'Backspace', preventDefault() { asPrevented = true }, stopPropagation() {} })
await tick()
eq(careaAS().props.value, '普通的一行。', 'Backspace in a plain line is left to the browser (text unchanged here)')
ok(!asPrevented, 'and it does not preventDefault the browser default')
caretAS(2)
view.fire(careaAS(), 'onKeyDown', { key: 'Delete', preventDefault() { asPrevented = true }, stopPropagation() {} })
await tick()
ok(!asPrevented, 'Delete in a plain line is left to the browser too')
// ⑧有跨行选区时 Backspace 走默认
await setTextAS('「勿忘我」：你终于来了。\n　　雨停了。')
caretAS(3, 9)
asPrevented = false
view.fire(careaAS(), 'onKeyDown', { key: 'Backspace', preventDefault() { asPrevented = true }, stopPropagation() {} })
await tick()
ok(!asPrevented, 'a multi-line selection is not hijacked')
// 选中的整段正好落在前缀里 → 整块删（选中名字三个字删掉，别留下「」：）
await setTextAS('「勿忘我」：你终于来了。')
caretAS(1, 4)
view.fire(careaAS(), 'onKeyDown', { key: 'Backspace', preventDefault() {}, stopPropagation() {} })
await tick()
eq(careaAS().props.value, '你终于来了。', 'a selection inside the prefix still deletes the whole prefix (no 「」：leftovers)')
// ⑨删掉之后状态行不再写「正在写：XX」
await setTextAS('')
caretAS(0)
view.fire(careaAS(), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(menuItem('勿忘我'))
await tick()
has(view.text(), '正在写：勿忘我', 'the status bar shows the role being written')
await keyAS('Backspace', '「勿忘我」：'.length)
ok(view.text().indexOf('正在写：') === -1, 'deleting the prefix clears the role chip too')
view.click(view.find('sc-expandx'))
await tick()

// ── AT. 色卡菜单里的色盘不许把菜单顶掉（③c） ─────────────────────────────────
// 用户原话：「还有色盘界面，只要点击就会直接弹出去」—— 一点色盘，整块色卡菜单就没了。
// 两条成因都堵：色盘的 change 落到了「换色 + 关菜单」那条路上；遮罩的 mousedown 兜底。
console.log('\nAT. the colour palette keeps the menu open')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '方片')[0])
await tick()
const tileAT = () => view.findAll('sc-tile').filter((n) => view.textOf(n).indexOf('人物甲') !== -1)[0]
const openColorMenuAT = async () => {
  view.fire(tileAT(), 'onContextMenu', { clientX: 300, clientY: 300 })
  await tick()
}
await openColorMenuAT()
ok(!!view.findMaybe('sc-menu'), 'the tile colour menu opens')
const colorInputAT = () => view.findAll('sc-colorinput')[0]
ok(!!colorInputAT(), 'the menu has a colour palette input')
// ①点色盘（mousedown / click）→ 菜单还在
view.fire(colorInputAT(), 'onMouseDown', {})
await tick()
ok(!!view.findMaybe('sc-menu'), 'pressing the palette does not close the menu')
view.fire(colorInputAT(), 'onClick', {})
await tick()
ok(!!view.findMaybe('sc-menu'), 'clicking the palette does not close it either')
// ⑤选色卡：应用并关菜单 —— 这条老行为不许被改坏
view.click(view.findAll('sc-swatch')[0])
await tick()
eq(view.findMaybe('sc-menu'), null, 'picking a swatch still applies and closes the menu (unchanged)')
// ②色盘 change 带着**和当前一样**的值 → 颜色不变、菜单也不关
await openColorMenuAT()
const sameValue = String(files[CARDS_DIR + '/character-x.md'].match(/color:\s*(\S+)/)[1])
eq(String(colorInputAT().props.value).toLowerCase(), sameValue.toLowerCase(), 'the palette starts at the card\'s current colour')
const beforeSame = files[CARDS_DIR + '/character-x.md']
view.fire(colorInputAT(), 'onChange', { target: { value: sameValue.toUpperCase() } })
await tick()
eq(files[CARDS_DIR + '/character-x.md'], beforeSame, 'a change event carrying the same colour changes nothing (Chromium fires one when the picker opens)')
ok(!!view.findMaybe('sc-menu'), 'and the menu stays open')
// ③色盘 change 带新颜色 → 实时生效、菜单仍然开着
view.fire(colorInputAT(), 'onChange', { target: { value: '#112233' } })
await tick()
await tick()
has(files[CARDS_DIR + '/character-x.md'], 'color: #112233', 'a new colour from the palette is applied immediately')
ok(!!view.findMaybe('sc-menu'), 'and the menu is still open so you can keep adjusting')
// ④遮罩兜底：target 落在 .sc-menu 里就不关；外面才关
const backAT = view.find('sc-menuback')
const fakeInside = { closest: function (sel) { return sel === '.sc-menu' ? {} : null } }
const fakeOutside = { closest: function () { return null } }
view.fire(backAT, 'onMouseDown', { target: fakeInside })
await tick()
ok(!!view.findMaybe('sc-menu'), 'a mousedown whose target is inside the menu does not close it (backdrop fallback)')
view.fire(backAT, 'onMouseDown', { target: fakeOutside })
await tick()
eq(view.findMaybe('sc-menu'), null, 'a mousedown outside the menu still closes it')
// ⑥SwatchEditor 里的色盘：点开不许把弹窗收掉
await openColorMenuAT()
const editSwatchesAT = view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('编辑色卡') !== -1)[0]
ok(!!editSwatchesAT, 'the colour menu offers 编辑色卡…（a plain .sc-btn, like before）')
view.click(editSwatchesAT)
await tick()
const swModal = view.findMaybe('sc-modal')
ok(!!swModal, 'the swatch editor modal opens')
const swInput = view.findAll('sc-colorinput')[0]
ok(!!swInput, 'and it has a colour palette input')
view.fire(swInput, 'onMouseDown', {})
await tick()
view.fire(swInput, 'onClick', {})
await tick()
view.fire(swInput, 'onChange', { target: { value: String(swInput.props.value) } })
await tick()
ok(!!view.findMaybe('sc-modal'), 'opening/using that palette does not close the modal')
view.click(btnOf('取消'))
await tick()
eq(view.findMaybe('sc-modal'), null, 'the modal closes when you cancel it')
view.click(view.findAll('sc-segb').filter((n) => view.textOf(n) === '分支')[0])
await tick()

// ── AU. 抽屉自己吃滚轮（用户报「存档卡没法用滚轮上下滑动」） ────────────────────
// 悬停在抽屉上时滚轮归抽屉：画布不缩放、**也不许 preventDefault**（拦了默认行为它就
// 滚不动了）。标记是属性 data-wheel="own"，不按类名硬编码。
console.log('\nAU. the drawer takes the wheel over from the canvas')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
await tick()
const drawerEl = () => view.findMaybe('sc-drawer')
ok(!!drawerEl(), 'the drawer is open')
eq(String(drawerEl().props['data-wheel'] || ''), 'own', 'the drawer is marked as a wheel-owning panel')
const zoomAU = () => parseInt(String(view.find('sc-boardtip').props.children), 10)
const zAU0 = zoomAU()
// 注：滚轮是插件自己用 ref + addEventListener 挂在 .sc-canvas 上的（见 AE），所以这里
// 也走原生监听器：`view.el(canvas, 'wheel', ev)`，ev.target 用来冒充「指针落在哪」。
// ①对抽屉里的元素派发 wheel → 不缩放、也没被 preventDefault
let auPrevented = false
const itemAU = view.findAll('sc-draweritem')[0]
ok(!!itemAU, 'the drawer has items to wheel over')
const drawerTarget = { closest: function (sel) { return sel === '[data-wheel="own"]' ? {} : null } }
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 700, clientY: 300, target: drawerTarget, preventDefault() { auPrevented = true } })
await tick()
eq(zoomAU(), zAU0, 'wheeling over a drawer item does not zoom the canvas')
ok(!auPrevented, 'and it does not preventDefault (that would break the drawer\'s own scrolling)')
let auMoved = false
const auT0 = translateOf()
let auX = null
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 700, clientY: 120, target: drawerTarget, preventDefault() { auPrevented = true } })
await tick()
eq(zoomAU(), zAU0, 'wheeling over the drawer itself does not zoom either')
ok(!auPrevented, 'and is left to the browser (the nearest scroll ancestor is the drawer)')
auX = translateOf()
eq(auX.x, auT0.x, 'and the canvas does not pan while you wheel over the drawer')
eq(auX.y, auT0.y, 'vertically either')
// ②画布上的 wheel → 照旧缩放（现状不许被改坏）
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 400, clientY: 300, target: blank, preventDefault() {} })
await tick()
ok(zoomAU() > zAU0, 'wheeling on the canvas still zooms in', [zAU0, zoomAU()])
// ③浮窗里的 wheel 仍然不被拦（顶层双击章节卡是「进入下级」，所以用右键菜单展开一个窗）
view.fire(cardOf(G1), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf('展开') !== -1)[0])
await wait(60)
ok(!!view.findMaybe('sc-expand'), 'a window is open')
const zBeforeWin = zoomAU()
let winPrevented = false
const winTarget = { closest: function (sel) { return sel === '[data-wheel="own"]' || sel === '.sc-expand' ? {} : null } }
view.el(view.find('sc-canvas'), 'wheel', { deltaY: -120, clientX: 400, clientY: 300, target: winTarget, preventDefault() { winPrevented = true } })
await tick()
ok(!winPrevented, 'the window still swallows the wheel without touching the default')
eq(zoomAU(), zBeforeWin, 'and the canvas does not zoom under it')
eq(String(view.find('sc-expand').props['data-wheel'] || ''), 'own', 'the window root carries the same marker')
view.click(view.find('sc-expandx'))
await tick()
// ④CSS 契约：抽屉自己滚、头部 sticky、旧的内层滚动容器没了
const cssAU = fs.readFileSync('src/10-css.js', 'utf8')
const drawerRule = cssAU.slice(cssAU.indexOf('.sc-drawer{'), cssAU.indexOf('.sc-drawersticky'))
has(drawerRule, 'overflow-y:auto', 'the drawer is itself a vertical scroll container')
has(drawerRule, 'overscroll-behavior:contain', 'and it does not chain the scroll to the page')
has(cssAU.slice(cssAU.indexOf('.sc-drawersticky{'), cssAU.indexOf('.sc-drawerhead{')), 'position:sticky', 'the header row sticks to the top while the list scrolls')
ok(cssAU.indexOf('.sc-drawerbody') === -1, 'the old inner scroll container is gone (one container only)')
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
await tick()

// ── AV. 画布上的独立对象（文本框 / 矩形方框）· 逻辑分组 · shift+右键多选 ──────
// 用户的原话：「添加一个功能分组，能够选取卡片，然后分组，能够对组内对象进行统一操作」
// 「再添加一个shift加右键的多选，以前的框选要保留」「添加一个无依赖的文本框…右键创建」
// 「添加一个无内容的矩形方框，只可以改颜色」。之后他明确了两条边界：文本框与方框是
// **两个独立对象、互不绑定**；分组是**逻辑**的 —— 悬停出淡背景、右键那块空白处唤起
// 整组、点卡片本身仍然只走单卡逻辑。
console.log('\nAV. standalone objects, logical groups, shift+right-click multi-select')
const CTX_G1 = G1
// 读盘上那个独立对象（没写进去就返回 null —— 断言自己会红，别让测试崩在中途）
const objOnDisk = (id) => ((((JSON.parse(files[GRAPH]).objects || {})[CTX_G1] || {})[id]) || null)
// 回到上级再进去，别依赖前面几段留下的位置
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '回到上级')[0])
await tick()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '归位')[0])
await tick()
view.fire(cardOf(G1), 'onDoubleClick', {})
await tick()
const nativeKeys = () => view.findAll('sc-card').filter((n) => !n.props['data-ref']).map((n) => n.props['data-key'])
const l2keys = nativeKeys()
ok(l2keys.indexOf(N1) !== -1 && l2keys.length >= 2, 'we are on the chapter level with cards to play with', l2keys)
const PB = l2keys.filter((k) => k !== N1)[0]
const gAV0 = JSON.parse(files[GRAPH])
ok(!gAV0.objects || !Object.keys(gAV0.objects).length, 'the fixture graph starts without objects')
ok(!gAV0.groups || !Object.keys(gAV0.groups).length, 'and without groups')

const openBlank = (cx, cy) => {
  const p = toClient(cx, cy)
  view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 2, clientX: p.clientX, clientY: p.clientY, target: blank })
  view.fire(view.find('sc-canvas'), 'onContextMenu', { clientX: p.clientX, clientY: p.clientY, target: blank })
  view.window('pointerup', { clientX: p.clientX, clientY: p.clientY })
  return p
}
const pickItem = (needle) => view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf(needle) !== -1)[0]
const writesToGraph = () => writes.filter((w) => w.path === GRAPH).length
const objNodes = (kind) => view.findAll('sc-obj').filter((n) => n.props['data-obj'] === kind)
const objRect = (id) => {
  const n = view.findAll('sc-obj').filter((x) => x.props['data-key'] === 'obj/' + id)[0]
  return n ? { x: Number(n.props.style.left), y: Number(n.props.style.top), w: Number(n.props.style.width), h: Number(n.props.style.height) } : null
}
const selectedKeys = () => [].concat(view.findAll('sc-card'), view.findAll('sc-obj'))
  .filter((n) => String(n.props.className).indexOf(' on') !== -1)
  .map((n) => n.props['data-key'])
const cardRectOf = (k) => {
  const n = view.findAll('sc-card').filter((x) => x.props['data-key'] === k)[0]
  return n ? { x: Number(n.props.style.left), y: Number(n.props.style.top), w: Number(n.props.style.width), h: Number(n.props.style.height) } : null
}

// ① 右键空白处：菜单里有「新建文本框 / 新建矩形方框」
openBlank(780, 430)
await tick()
has(view.text(), '新建文本框', 'the empty-canvas menu can create a text box')
has(view.text(), '新建矩形方框', 'and an empty rectangle')

// ② 建文本框：写进 objects[ctx]、建完直接进编辑态、改完的字落盘
const wText0 = writesToGraph()
view.click(pickItem('新建文本框'))
await tick()
await tick()
const textEl = objNodes('text')[0]
ok(!!textEl, 'the text box lands on the canvas')
const textId = String(textEl.props['data-key']).replace(/^obj\//, '')
const textKey = 'obj/' + textId
const textRec0 = (JSON.parse(files[GRAPH]).objects || {})[CTX_G1] || {}
ok(!!textRec0[textId], 'the text box is written into 分支.json under this canvas')
eq(textRec0[textId] && textRec0[textId].kind, 'text', 'with kind=text')
eq(writesToGraph() - wText0, 1, 'creating it wrote the graph exactly once')
const editArea = view.findMaybe('sc-objedit')
ok(!!editArea, 'a brand-new text box opens its editor right away')
view.fire(editArea, 'onChange', { target: { value: '第二幕 转折' } })
await tick()
// 重新取一次节点：onBlur 那个闭包要拿改完之后那一帧的（旧节点上还带着空值）
view.fire(view.find('sc-objedit'), 'onBlur', {})
await tick()
await tick()
eq((objOnDisk(textId) || {}).text, '第二幕 转折', 'the typed text is saved back')
ok(view.text().indexOf('第二幕 转折') !== -1, 'and the canvas shows it')

// ③ 建矩形方框：**无内容**、有默认底色，右键菜单里没有「编辑文字」
openBlank(300, 430)
await tick()
view.click(pickItem('新建矩形方框'))
await tick()
await tick()
const rectEl = objNodes('rect')[0]
ok(!!rectEl, 'the rectangle lands on the canvas too')
const rectId = String(rectEl.props['data-key']).replace(/^obj\//, '')
const rectRec0 = objOnDisk(rectId) || {}
eq(rectRec0.kind, 'rect', 'with kind=rect')
ok(rectRec0.text === undefined, 'a rectangle carries no content at all', rectRec0.text)
ok(/^#[0-9a-fA-F]{3,8}$/.test(String(rectRec0.color || '')), 'and it starts with a colour', rectRec0.color)
view.fire(objNodes('rect')[0], 'onContextMenu', { clientX: 400, clientY: 300 })
await tick()
ok(!!view.findMaybe('sc-swatches'), 'its menu offers the colour swatches')
ok(view.text().indexOf('编辑文字') === -1, 'and no text editing (it has no content)')
const swatchAV = view.findAll('sc-swatch')[2]
const swatchHex = String(swatchAV.props.style.background)
view.click(swatchAV)
await tick()
await tick()
eq((objOnDisk(rectId) || {}).color, swatchHex, 'picking a colour writes it')

// ④ 拖动独立对象：跟手，松手只写一次
const rp0 = objRect(rectId)
const wMove0 = writesToGraph()
const grab = toClient(rp0.x + 8, rp0.y + 8)
view.fire(objNodes('rect')[0], 'onPointerDown', { button: 0, clientX: grab.clientX, clientY: grab.clientY })
view.window('pointermove', { clientX: grab.clientX + 50, clientY: grab.clientY + 30, buttons: 1 })
await tick()
const rpMid = objRect(rectId)
// 拖动时会吸附对齐（不按 Shift 时不吸，位置就是指针算出来的；容差留着不影响）
ok(Math.abs((rpMid.x - rp0.x) - 50) <= 6, 'the rectangle follows the pointer (within the snap range)', rpMid.x - rp0.x)
ok(Math.abs((rpMid.y - rp0.y) - 30) <= 6, 'on both axes', rpMid.y - rp0.y)
view.window('pointerup', { clientX: grab.clientX + 50, clientY: grab.clientY + 30 })
await tick()
await tick()
eq(writesToGraph() - wMove0, 1, 'the drag wrote the graph exactly once')
eq((objOnDisk(rectId) || {}).x, rpMid.x, 'and the new spot is on disk')

// ⑤ 右下角手柄缩放（和浮窗同一个手势）
const wr0 = writesToGraph()
const gp = toClient(rpMid.x + rpMid.w, rpMid.y + rpMid.h)
view.fire(view.findAll('sc-objgrip')[0], 'onPointerDown', { button: 0, clientX: gp.clientX, clientY: gp.clientY })
view.window('pointermove', { clientX: gp.clientX + 40, clientY: gp.clientY + 20, buttons: 1 })
view.window('pointerup', { clientX: gp.clientX + 40, clientY: gp.clientY + 20 })
await tick()
await tick()
const rpBig = objRect(rectId)
eq(rpBig.w, rpMid.w + 40, 'the grip resizes the rectangle')
eq(rpBig.h, rpMid.h + 20, 'on both axes')
ok(writesToGraph() - wr0 >= 1, 'and the new size is written back')

// ⑥ shift+右键＝切换选中、不弹菜单；不带 shift 的右键照旧弹菜单
view.fire(cardOf(N1), 'onContextMenu', { clientX: 240, clientY: 220 })
await tick()
ok(!!view.findMaybe('sc-menu'), 'a plain right-click still opens the card menu')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()
eq(view.findMaybe('sc-menu'), null, 'and clicking elsewhere closes it')
view.fire(cardOf(N1), 'onContextMenu', { shiftKey: true, clientX: 240, clientY: 220 })
await tick()
eq(view.findMaybe('sc-menu'), null, 'shift+right-click does not open a menu')
eq(selectedKeys().join(','), N1, 'it selects that card instead')
view.fire(cardOf(PB), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 220 })
await tick()
eq(selectedKeys().slice().sort().join(','), [N1, PB].sort().join(','), 'the next shift+right-click adds to the selection')
view.fire(cardOf(PB), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 220 })
await tick()
eq(selectedKeys().join(','), N1, 'and shift+right-click again takes it back out')

// ⑦ 编成一组（在批量菜单里）
view.fire(cardOf(PB), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 220 })
await tick()
eq(selectedKeys().length, 2, 'two cards are selected')
const wGroup0 = writesToGraph()
view.fire(cardOf(N1), 'onContextMenu', { clientX: 240, clientY: 220 })
await tick()
has(view.text(), '已选 2 张', 'right-clicking inside the selection gives the batch menu')
view.click(pickItem('编成一组'))
await tick()
await tick()
const gGroup = JSON.parse(files[GRAPH])
ok(!!(gGroup.groups && gGroup.groups[CTX_G1] && gGroup.groups[CTX_G1].length === 1), 'the two cards are now a group in 分支.json')
eq(gGroup.groups[CTX_G1][0].keys.slice().sort().join(','), [N1, PB].sort().join(','), 'and the group holds exactly those two')
eq(writesToGraph() - wGroup0, 1, 'grouping wrote the graph once')

// ⑧ 悬停在组的地盘上 → 底下浮出一层淡背景；移开就没了
const b1 = cardRectOf(N1)
const b2 = cardRectOf(PB)
const bx = Math.min(b1.x, b2.x)
const bb = Math.max(b1.y + b1.h, b2.y + b2.h)
const hoverIn = toClient(bx - 6, bb - 6)
view.window('pointermove', { clientX: hoverIn.clientX, clientY: hoverIn.clientY })
await tick()
const bgEl = view.findMaybe('sc-groupbg')
ok(!!bgEl, 'hovering the group area floats a faint background under it')
eq(Number(bgEl && bgEl.props.style.left), bx - 12, 'and it hugs the group')
const away = toClient(20, 470)
view.window('pointermove', { clientX: away.clientX, clientY: away.clientY })
await tick()
eq(view.findMaybe('sc-groupbg'), null, 'the background goes away when the pointer leaves')

// ⑨ 右键组里的空白处 → 整组菜单
openBlank(bx - 6, bb - 6)
await tick()
has(view.text(), '这一组 2 个', 'right-clicking the blank spot inside the group summons the whole group')
ok(!!pickItem('整组复制一份') && !!pickItem('整组移出画布') && !!pickItem('取消编组'), 'the group menu can copy / clear / ungroup it')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()

// ⑩ 拖动组里任何一张＝整组走（一次写回）
const beforeG = { a: cardRectOf(N1), b: cardRectOf(PB) }
const gw0 = writesToGraph()
const gs = toClient(beforeG.a.x + 12, beforeG.a.y + 12)
view.fire(cardOf(N1), 'onPointerDown', { button: 0, clientX: gs.clientX, clientY: gs.clientY })
view.window('pointermove', { clientX: gs.clientX + 40, clientY: gs.clientY + 24, buttons: 1 })
await tick()
const midG = { a: cardRectOf(N1), b: cardRectOf(PB) }
eq(midG.b.x - beforeG.b.x, 40, 'dragging one group member drags the other with it')
eq(midG.b.y - beforeG.b.y, 24, 'on both axes')
view.window('pointerup', { clientX: gs.clientX + 40, clientY: gs.clientY + 24 })
await tick()
await tick()
eq(writesToGraph() - gw0, 1, 'the group drag wrote the graph once')
const gMoved = JSON.parse(files[GRAPH])
// 松手时整组可能被「卡片不许重叠」那条规矩整体推开一点（推开只平移，不动组内相对位置），
// 所以比的是「两张卡被挪了同样多」＋「组内间距没变」，而不是「正好 40」。
const gdA = gMoved.nodes[N1].cx - beforeG.a.x
const gdB = gMoved.nodes[PB].cx - beforeG.b.x
const gdyA = gMoved.nodes[N1].cy - beforeG.a.y
const gdyB = gMoved.nodes[PB].cy - beforeG.b.y
eq(gdA, gdB, 'both members of the group were written back by the same amount', [gdA, gdB])
eq(gdyA, gdyB, 'on y too', [gdyA, gdyB])
eq(gMoved.nodes[PB].cx - gMoved.nodes[N1].cx, beforeG.b.x - beforeG.a.x, 'and the group kept its inner spacing')
// 松手之后这一组不和别的卡片压着 —— 「卡片不许重叠」那条规矩（2026-10-02 拍板）在这里也生效
const gRectOf = (k) => {
  const n = cardNodeOf(k)
  return { x: Number(n.props.style.left), y: Number(n.props.style.top), w: Number(n.props.style.width), h: Number(n.props.style.height) }
}
const gHits = view.findAll('sc-card')
  .filter((n) => n.props['data-key'] !== N1 && n.props['data-key'] !== PB)
  .filter((n) => {
    const o = { x: Number(n.props.style.left), y: Number(n.props.style.top), w: Number(n.props.style.width), h: Number(n.props.style.height) }
    return [N1, PB].some((k) => {
      const m = gRectOf(k)
      return m.x < o.x + o.w && m.x + m.w > o.x && m.y < o.y + o.h && m.y + m.h > o.y
    })
  })
eq(gHits.length, 0, 'and after the drop the group overlaps no other card', gHits.map((n) => n.props['data-key']))

// ⑪ 按住 Alt 只拖这一张（想把某一张拽出组时用）
const solo0 = cardRectOf(PB)
const other0 = cardRectOf(N1)
const sp = toClient(solo0.x + 12, solo0.y + 12)
view.fire(cardOf(PB), 'onPointerDown', { button: 0, altKey: true, clientX: sp.clientX, clientY: sp.clientY })
view.window('pointermove', { clientX: sp.clientX + 30, clientY: sp.clientY, buttons: 1 })
await tick()
eq(Math.abs((cardRectOf(PB).x - solo0.x) - 30) <= 6, true, 'holding Alt drags only the card you grabbed')
eq(cardRectOf(N1).x, other0.x, 'and leaves the rest of the group where it was')
view.window('pointerup', { clientX: sp.clientX + 30, clientY: sp.clientY })
await tick()
await tick()

// ⑫ 自动排列：整组当一块，组内相对位置不许被拆开
const relBefore = (() => { const a = cardRectOf(N1); const b = cardRectOf(PB); return { dx: b.x - a.x, dy: b.y - a.y } })()
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('自动排列') !== -1)[0])
await tick()
await tick()
const relAfter = (() => { const a = cardRectOf(N1); const b = cardRectOf(PB); return { dx: b.x - a.x, dy: b.y - a.y } })()
eq(relAfter.dx, relBefore.dx, 'auto-arrange keeps the group internal offsets (x)')
eq(relAfter.dy, relBefore.dy, 'and (y)')
ok(!!(JSON.parse(files[GRAPH]).groups || {})[CTX_G1], 'the group survives auto-arrange')

// ⑬ 整组复制一份：卡片复制成新文件，副本自动编成新的一组
const filesBefore = Object.keys(files).length
const gb2 = (() => { const a = cardRectOf(N1); const b = cardRectOf(PB); return { x: Math.min(a.x, b.x), b: Math.max(a.y + a.h, b.y + b.h) } })()
openBlank(gb2.x - 6, gb2.b - 6)
await tick()
view.click(pickItem('整组复制一份'))
await tick()
await tick()
await tick()
const gCopied = JSON.parse(files[GRAPH])
const groupsNow = (gCopied.groups && gCopied.groups[CTX_G1]) || []
eq(groupsNow.length, 2, 'copying a group makes a second group out of the copies')
const copyGroup = groupsNow.filter((g) => g.keys.indexOf(N1) === -1)[0]
ok(!!copyGroup && copyGroup.keys.length === 2, 'the copy has both members')
ok(Object.keys(files).length > filesBefore, 'and the copied cards are real files')

// ⑭ 别的写入不许把 objects / groups 冲掉（老代码手拼图谱字面量时的老毛病）
// 拿一张**不在组里**的卡（刚复制出来的副本）来改色，顺便验证复制的卡片真的上了画布
const spareKey = nativeKeys().filter((k) => k !== N1 && k !== PB)[0]
ok(!!spareKey, 'the copied cards are on the canvas too', nativeKeys())
view.fire(cardOf(spareKey), 'onContextMenu', { clientX: 520, clientY: 320 })
await tick()
view.click(view.findAll('sc-swatch')[0])
await tick()
await tick()
const gKeep = JSON.parse(files[GRAPH])
const keepObjs = (gKeep.objects && gKeep.objects[CTX_G1]) || {}
ok(!!keepObjs[textId], 'an unrelated write keeps the text box')
ok(!!keepObjs[rectId], 'and the rectangle')
ok(!!(gKeep.groups && gKeep.groups[CTX_G1] && gKeep.groups[CTX_G1].length >= 2), 'and the groups')

// ⑮ 旧的右键框选照旧（用户要求保留），而且现在也能框到独立对象
view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 2, clientX: toClient(0, 0).clientX, clientY: toClient(0, 0).clientY, target: blank })
const mEnd = toClient(880, 470)
view.window('pointermove', { clientX: mEnd.clientX, clientY: mEnd.clientY, buttons: 2 })
await tick()
view.window('pointerup', { clientX: mEnd.clientX, clientY: mEnd.clientY })
await tick()
const marqueeKeys = selectedKeys()
ok(marqueeKeys.length >= 3, 'the old right-drag marquee still selects several things', marqueeKeys.length)
ok(marqueeKeys.indexOf(textKey) !== -1, 'and it picks up standalone objects too', marqueeKeys)

// ⑯ 独立对象移出画布＝直接删掉（它没有文件），并顺手清掉散架的组
// 刚框选完的第一下右键会被吃掉（真实浏览器里 pointerup 之后紧跟的那次 contextmenu），
// 所以要点两次 —— 第二次才真的弹菜单。
view.fire(objNodes('text')[0], 'onContextMenu', { clientX: 400, clientY: 200 })
await tick()
view.fire(objNodes('text')[0], 'onContextMenu', { clientX: 400, clientY: 200 })
await tick()
view.click(pickItem('删除这个文本框'))
await tick()
await tick()
eq(objNodes('text').length, 0, 'deleting an object takes it off the canvas')
ok(!((JSON.parse(files[GRAPH]).objects || {})[CTX_G1] || {})[textId], 'and out of 分支.json')

// ── AW. 卡片改大小 · 拖动对齐 · 自动排列只排选中的几张 · 名字与时间两行 ────────
// 用户 2026-10-01 的要求：「添加一个可以修改卡片高度和宽度的功能（这个记得要适配自动排列）
// 同时把时间和卡片名字的显示错开了（也就是写成两行）防止互相重叠现象的出现」，
// 另外两条：「拖动的时候能不能加个对齐，这样子排起来更好看」「自动排列应该可以只选几个进行自动排列」。
console.log('\nAW. per-card size, drag snapping, arranging just the selection')
const subOf = (root) => {
  const out = []
  const visit = (n) => { if (!n) return; out.push(n); (n.children || []).forEach(visit) }
  visit(root)
  return out
}
const clsOf = (n) => String((n.props && n.props.className) || '')
const gripOf = (k) => subOf(cardNodeOf(k)).filter((n) => clsOf(n).indexOf('sc-cardgrip') !== -1)[0]
const clearSel = () => {
  const p = toClient(20, 470)
  view.fire(view.find('sc-canvas'), 'onPointerDown', { button: 0, clientX: p.clientX, clientY: p.clientY, target: blank })
  view.window('pointerup', { clientX: p.clientX, clientY: p.clientY })
}
const arrangeBtn = () => view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('自动排列') !== -1)[0]

// ① 名字与时间分两行：时间单独占一行，标题那一行里没有它
const withWhen = nativeKeys().filter((k) => subOf(cardNodeOf(k)).some((x) => clsOf(x).indexOf('sc-cardwhenline') !== -1))[0]
ok(!!withWhen, 'a node card shows its time on its own line', nativeKeys())
const whenLine = subOf(cardNodeOf(withWhen)).filter((x) => clsOf(x).indexOf('sc-cardwhenline') !== -1)[0]
const titleRow = subOf(cardNodeOf(withWhen)).filter((x) => clsOf(x).indexOf('sc-cardrow') !== -1)[0]
ok(!!whenLine && !!titleRow, 'both the time line and the title row are there')
ok(view.textOf(titleRow).indexOf(view.textOf(whenLine)) === -1, 'the title row no longer holds the time', view.textOf(titleRow))
has(fs.readFileSync('src/80-board.js', 'utf8'), 'sc-cardwhen sc-cardwhenline', 'the source keeps the time on its own line')

// ② 卡片右下角有缩放手柄；拖它改宽高，写进这张卡片的记录
ok(view.findAll('sc-cardgrip').length >= 3, 'cards carry a resize grip', view.findAll('sc-cardgrip').length)
const rzKey = nativeKeys().filter((k) => k !== withWhen)[0]
const rz0 = cardRectOf(rzKey)
const wrp0 = toClient(rz0.x + rz0.w, rz0.y + rz0.h)
const wRz0 = writesToGraph()
view.fire(gripOf(rzKey), 'onPointerDown', { button: 0, clientX: wrp0.clientX, clientY: wrp0.clientY })
view.window('pointermove', { clientX: wrp0.clientX + 60, clientY: wrp0.clientY + 30, buttons: 1 })
await tick()
const rzMid = cardRectOf(rzKey)
eq(rzMid.w, rz0.w + 60, 'dragging the grip makes the card wider')
eq(rzMid.h, rz0.h + 30, 'and taller')
view.window('pointerup', { clientX: wrp0.clientX + 60, clientY: wrp0.clientY + 30 })
await tick()
await tick()
const gRz = JSON.parse(files[GRAPH])
eq(gRz.nodes[rzKey].w, rz0.w + 60, 'the width is written into that card record')
eq(gRz.nodes[rzKey].h, rz0.h + 30, 'and so is the height')
eq(writesToGraph() - wRz0, 1, 'the resize wrote the graph once')
// 下限夹住：往左上猛拖也不会把卡片缩成一条线
const rpSmall = toClient(rzMid.x + rzMid.w, rzMid.y + rzMid.h)
view.fire(gripOf(rzKey), 'onPointerDown', { button: 0, clientX: rpSmall.clientX, clientY: rpSmall.clientY })
view.window('pointermove', { clientX: rpSmall.clientX - 900, clientY: rpSmall.clientY - 900, buttons: 1 })
await tick()
const rzSmall = cardRectOf(rzKey)
ok(rzSmall.w >= 110 && rzSmall.h >= 72, 'the size is clamped at the low end', rzSmall)
view.window('pointerup', { clientX: rpSmall.clientX - 900, clientY: rpSmall.clientY - 900 })
await tick()
await tick()

// ③ 右键「重置为默认大小」：记录里的 w / h 清掉，卡片回到这一档的默认尺寸
view.fire(cardNodeOf(rzKey), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
view.click(pickItem('重置为默认大小'))
await tick()
await tick()
const gReset = JSON.parse(files[GRAPH])
ok(gReset.nodes[rzKey].w === undefined || gReset.nodes[rzKey].w === null, 'reset clears the custom width', gReset.nodes[rzKey].w)
eq(cardRectOf(rzKey).w, 156, 'and the card is back to the default width')
has(fs.readFileSync('src/85-boardview.js', 'utf8'), '重置为默认大小', 'the card menu offers that reset')

// ④ 自动排列按自定义尺寸算占位（用户特意点的「记得要适配自动排列」）
// 拿「不同层」的两张卡来验：给图谱补一条连线（上游 → 下游）再刷新画布。
// ⚠ 下游要挑**不在同一个组里**的卡：编过组的成员在排列里是一个单元，内部相对位置不动。
const upstream = N1
const follower = nativeKeys().filter((k) => k !== N1 && k !== PB)[0]
const gLink = JSON.parse(files[GRAPH])
gLink.edges = (gLink.edges || []).filter((e) => !(e.from === upstream && e.to === follower))
gLink.edges.push({ from: upstream, to: follower, label: '', choice: '' })
files[GRAPH] = JSON.stringify(gLink, null, 2)
view.click(view.findAll('sc-navbtn').filter((n) => n.props.title === '刷新画布')[0])
await tick()
await tick()
clearSel()
await tick()
view.click(arrangeBtn())
await tick()
await tick()
const narrowX = cardRectOf(follower).x
const wk0 = cardRectOf(upstream)
const wp = toClient(wk0.x + wk0.w, wk0.y + wk0.h)
view.fire(gripOf(upstream), 'onPointerDown', { button: 0, clientX: wp.clientX, clientY: wp.clientY })
view.window('pointermove', { clientX: wp.clientX + 200, clientY: wp.clientY, buttons: 1 })
view.window('pointerup', { clientX: wp.clientX + 200, clientY: wp.clientY })
await tick()
await tick()
eq(cardRectOf(upstream).w, wk0.w + 200, 'the upstream card got much wider')
clearSel()
await tick()
view.click(arrangeBtn())
await tick()
await tick()
ok(cardRectOf(follower).x > narrowX, 'auto-arrange pushes the next level further right for a wider card', [narrowX, cardRectOf(follower).x])

// ⑤ 拖动时对齐吸附（**按住 Shift** —— 2026-10-02 起不按 Shift 就完全不吸）：上边缘差 3px
//    → 正好吸上去，并且拖的过程中出现辅助线
clearSel()
const anchor = cardRectOf(PB)
const mover = nativeKeys().filter((k) => k !== PB && k !== upstream)[0]
const mv0 = cardRectOf(mover)
const wstart = toClient(mv0.x + 10, mv0.y + 10)
const dragDx = 40
const dragDy = anchor.y + 3 - mv0.y
view.fire(cardNodeOf(mover), 'onPointerDown', { button: 0, clientX: wstart.clientX, clientY: wstart.clientY })
view.window('pointermove', { clientX: wstart.clientX + dragDx, clientY: wstart.clientY + dragDy, buttons: 1, shiftKey: true })
await tick()
eq(cardRectOf(mover).y, anchor.y, 'dragging near another card with Shift held snaps to its top edge')
ok(view.findAll('sc-guide').length >= 1, 'and an alignment guide shows up while you drag', view.findAll('sc-guide').length)
view.window('pointerup', { clientX: wstart.clientX + dragDx, clientY: wstart.clientY + dragDy })
await tick()
await tick()
eq(view.findAll('sc-guide').length, 0, 'the guides go away when you let go')

// ⑥ 自动排列只排选中的几张（用户的要求）：层里别的卡片一个都不许动
const gNow = JSON.parse(files[GRAPH])
const inGroup = {}
;(((gNow.groups || {})[CTX_G1]) || []).forEach((g) => g.keys.forEach((k) => { inGroup[k] = true }))
const free = nativeKeys().filter((k) => !inGroup[k])
const pickPair = free.length >= 2 ? free.slice(0, 2) : nativeKeys().slice(0, 2)
const a1 = pickPair[0]
const a2 = pickPair[1]
clearSel()
view.fire(cardNodeOf(a1), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 300 })
view.fire(cardNodeOf(a2), 'onContextMenu', { shiftKey: true, clientX: 340, clientY: 300 })
await tick()
has(view.text(), '自动排列（选中的 2 张）', 'the arrange button says it will only touch the selection')
const others = nativeKeys().filter((k) => k !== a1 && k !== a2)
const posOfKey = (k) => cardRectOf(k).x + ':' + cardRectOf(k).y
const othersBefore = others.map(posOfKey).join(',')
// 先把其中一张拖歪（按住 Alt＝只拖这一张，位置离开布局网格）——
// 不然「排完还正好在原位」，断言等于没测。
const wBeforeDrag = cardRectOf(a1)
const wds = toClient(wBeforeDrag.x + 10, wBeforeDrag.y + 10)
view.fire(cardNodeOf(a1), 'onPointerDown', { button: 0, altKey: true, clientX: wds.clientX, clientY: wds.clientY })
view.window('pointermove', { clientX: wds.clientX + 90, clientY: wds.clientY + 60, buttons: 1 })
view.window('pointerup', { clientX: wds.clientX + 90, clientY: wds.clientY + 60 })
await tick()
await tick()
const draggedAway = posOfKey(a1)
ok(draggedAway !== wBeforeDrag.x + ':' + wBeforeDrag.y, 'the card really moved before the arrange', draggedAway)
const pairAfterDrag = pickPair.map(posOfKey).join(',')
view.click(arrangeBtn())
await tick()
await tick()
eq(others.map(posOfKey).join(','), othersBefore, 'cards outside the selection did not move')
ok(pickPair.map(posOfKey).join(',') !== pairAfterDrag, 'the selected ones were re-arranged', pickPair.map(posOfKey))
// 批量菜单里也有这一项
view.fire(cardNodeOf(a1), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
ok(!!pickItem('自动排列这 2 个'), 'the batch menu can arrange just those two')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()
await tick()

// ── AX. 改大小时吸附 · 辅助线只到下一张卡 · 分组入口 · 横排 ────────────────────
// 用户 2026-10-01 真机反馈的四条：「拖动改变大小的时候也加一个对齐」「对齐的线不要太长，
// 只要到下一个卡片就行，剩下的部分逐渐隐藏」「并没有看到你的分组功能出现在哪里，右键
// 菜单没有」「自动排列，它只能竖着排，没法横着排」。
console.log('\nAX. resize snapping, short guide lines, a grouping entry, horizontal arrange')

// ① 改大小时也吸附（**按住 Shift**）：把右边缘拖到离另一张卡左边缘 3px 的地方，应该正好吸上
clearSel()
await tick()
const axKeys = nativeKeys()
const rsKey = axKeys[0]
const rsOther = axKeys[1]
const rs0 = cardRectOf(rsKey)
const rsOtherRect = cardRectOf(rsOther)
const wantW = rsOtherRect.x - rs0.x + 3
const rsP = toClient(rs0.x + rs0.w, rs0.y + rs0.h)
view.fire(gripOf(rsKey), 'onPointerDown', { button: 0, clientX: rsP.clientX, clientY: rsP.clientY })
view.window('pointermove', { clientX: rsP.clientX + (wantW - rs0.w), clientY: rsP.clientY, buttons: 1, shiftKey: true })
await tick()
eq(cardRectOf(rsKey).w, rsOtherRect.x - rs0.x, 'resizing snaps the right edge onto the next card')
ok(view.findAll('sc-guide').length >= 1, 'and a guide shows up while resizing too')
view.window('pointerup', { clientX: rsP.clientX + (wantW - rs0.w), clientY: rsP.clientY })
await tick()
await tick()

// ② 辅助线别太长：只覆盖「被拖的那张 + 对齐到的那张」，不是铺满画布
clearSel()
await tick()
const gA = nativeKeys()[0]
const gB = nativeKeys()[1]
const ga0 = cardRectOf(gA)
const gb0 = cardRectOf(gB)
const ags = toClient(ga0.x + 10, ga0.y + 10)
const gTargetX = gb0.x + 3
view.fire(cardNodeOf(gA), 'onPointerDown', { button: 0, clientX: ags.clientX, clientY: ags.clientY })
view.window('pointermove', { clientX: ags.clientX + (gTargetX - ga0.x), clientY: ags.clientY, buttons: 1, shiftKey: true })
await tick()
const guideEls = view.findAll('sc-guide')
const vGuide = guideEls.filter((n) => String(n.props.className).indexOf('sc-guidev') !== -1)[0]
const hGuide = guideEls.filter((n) => String(n.props.className).indexOf('sc-guideh') !== -1)[0]
ok(!!(vGuide || hGuide), 'a guide is drawn while dragging')
if (vGuide) {
  const gs1 = Number(vGuide.props.style.top)
  const gh = Number(vGuide.props.style.height)
  const gaNow = cardRectOf(gA)
  const gbNow = cardRectOf(gB)
  ok(gh > 0 && gh < 1600, 'the guide stops at the two cards instead of crossing the whole canvas', [gs1, gh])
  ok(gs1 <= Math.min(gaNow.y, gbNow.y) + 1 && gs1 + gh >= Math.max(gaNow.y + gaNow.h, gbNow.y + gbNow.h) - 1, 'and it still covers both cards', [gs1, gh, gaNow.y, gbNow.y])
} else if (hGuide) {
  const gx1 = Number(hGuide.props.style.left)
  const gw = Number(hGuide.props.style.width)
  const gaNow = cardRectOf(gA)
  const gbNow = cardRectOf(gB)
  ok(gw > 0 && gw < 1600, 'the guide stops at the two cards instead of crossing the whole canvas', [gx1, gw])
  ok(gx1 <= Math.min(gaNow.x, gbNow.x) + 1 && gx1 + gw >= Math.max(gaNow.x + gaNow.w, gbNow.x + gbNow.w) - 1, 'and it still covers both cards', [gx1, gw])
}
view.window('pointerup', { clientX: ags.clientX + (gTargetX - ga0.x), clientY: ags.clientY })
await tick()
await tick()
has(fs.readFileSync('src/10-css.js', 'utf8'), 'linear-gradient(to bottom,transparent', 'the guide fades out at both ends (source contract)')

// ③ 分组的入口：单卡菜单里有（没选够时灰掉并写清怎么选），空白处菜单里也有
clearSel()
await tick()
view.fire(cardNodeOf(gA), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
const grpHint = pickItem('编成一组')
ok(!!grpHint, 'the card menu mentions grouping now', view.text().slice(0, 80))
ok(!!grpHint && grpHint.props.disabled === true, 'and greys it out until two cards are selected')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()
view.fire(cardNodeOf(a1), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 300 })
view.fire(cardNodeOf(a2), 'onContextMenu', { shiftKey: true, clientX: 340, clientY: 300 })
await tick()
// 选中两张后右键其中一张：走的是**批量菜单**（选中集合里的那一下右键），那一项是可点的
view.fire(cardNodeOf(a1), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
const grpNow = pickItem('编成一组')
ok(!!grpNow && !grpNow.props.disabled, 'with two selected the menu can group them', view.textOf(grpNow || {}))
view.click(grpNow)
await tick()
await tick()
const gGrp = (JSON.parse(files[GRAPH]).groups || {})[CTX_G1] || []
ok(gGrp.some((g) => g.keys.indexOf(a1) !== -1 && g.keys.indexOf(a2) !== -1), 'and it really writes a group')
// 选中还在：右键**空白处**那条入口同样可点（空白处菜单不清选择）
openBlank(700, 400)
await tick()
const grpEmpty = pickItem('把选中的 2 个编成一组')
ok(!!grpEmpty && !grpEmpty.props.disabled, 'the empty-canvas menu can group the selection too')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()
clearSel()
await tick()

// ④ 横排：同一层的两张卡左右并排（以前只能竖着排）
const edgesNow = (JSON.parse(files[GRAPH]).edges || []).map((e) => e.from + '>' + e.to)
const linkedPair = (x, y) => edgesNow.indexOf(x + '>' + y) !== -1 || edgesNow.indexOf(y + '>' + x) !== -1
const hPool = nativeKeys()
let hKeys = null
for (let i = 0; i < hPool.length && !hKeys; i++) {
  for (let j = i + 1; j < hPool.length; j++) {
    if (!linkedPair(hPool[i], hPool[j])) { hKeys = [hPool[i], hPool[j]]; break }
  }
}
ok(!!hKeys, 'found two cards with no line between them', hPool)
clearSel()
await tick()
view.fire(cardNodeOf(hKeys[0]), 'onContextMenu', { shiftKey: true, clientX: 300, clientY: 300 })
view.fire(cardNodeOf(hKeys[1]), 'onContextMenu', { shiftKey: true, clientX: 340, clientY: 300 })
await tick()
const hBtn = view.findAll('sc-btn').filter((n) => view.textOf(n).indexOf('横排') !== -1)[0]
ok(!!hBtn, 'the status bar has a horizontal arrange button')
view.click(hBtn)
await tick()
await tick()
eq(cardRectOf(hKeys[0]).y, cardRectOf(hKeys[1]).y, 'horizontal arrange puts the two on the same row')
ok(cardRectOf(hKeys[1]).x > cardRectOf(hKeys[0]).x, 'side by side, left to right', [cardRectOf(hKeys[0]).x, cardRectOf(hKeys[1]).x])
// 竖排还是老样子：同一列、上下堆叠（两个方向真的不一样）
view.click(arrangeBtn())
await tick()
await tick()
eq(cardRectOf(hKeys[0]).x, cardRectOf(hKeys[1]).x, 'the vertical arrange stacks them in one column instead')
ok(cardRectOf(hKeys[1]).y > cardRectOf(hKeys[0]).y, 'one above the other', [cardRectOf(hKeys[0]).y, cardRectOf(hKeys[1]).y])
// 批量菜单里也有横排
view.fire(cardNodeOf(hKeys[0]), 'onContextMenu', { clientX: 300, clientY: 300 })
await tick()
ok(!!pickItem('横排这 2 个'), 'the batch menu offers the horizontal arrange too')
view.fire(view.find('sc-menuback'), 'onMouseDown', { target: {} })
await tick()
await tick()

// ⑰ 源码契约：图谱读写两侧都要认得 objects / groups（少一处就是每次落盘都冲掉）
const apiAV = fs.readFileSync('src/50-api.js', 'utf8')
has(apiAV, 'objects: graph.objects', 'the graph writer serialises objects')
has(apiAV, 'groups: graph.groups', 'and groups')
const modelAV = fs.readFileSync('src/30-model.js', 'utf8')
has(modelAV, 'out.objects = normObjects(raw.objects)', 'the graph reader normalises objects')
has(modelAV, 'out.groups = normGroups(raw.groups)', 'and groups')
has(fs.readFileSync('src/50-api.js', 'utf8'), 'objects: graph.objects || {}', 'and they survive a graph write through the bridge')
// ⑱ 源码契约：文本框**不要底**（用户原话「文本框不要底」）—— 不填底色，下面的色块透上来；
// 矩形方框那边照旧要有色（它就只有颜色这一件事）。
const cssObjAV = fs.readFileSync('src/10-css.js', 'utf8')
has((cssObjAV.match(/\.sc-objtext\{[^}]*\}/) || [''])[0], 'background:transparent', 'the canvas text box has no fill')
has((cssObjAV.match(/\.sc-objrect\{[^}]*\}/) || [''])[0], 'background:color-mix', 'the rectangle box still has its colour')

// ── AZ. 画布层序（用户 2026-10-01 拍板）─────────────────────────────────────────
// 从下往上：分组背景 → 有颜色的方框 → 文字 → 其他所有卡片。DOM 顺序就是叠放顺序，
// 三层互不穿插（没有哪张卡被压到文字底下）。真浏览器里摸点的那一版在 visual 的 objects 幕。
console.log('\nAZ. canvas stacking order: colour box, then text, then every card')
// 前面的小节可能把对象删掉了，这里先补齐：画布上同时要有方框、文本框和卡片
if (!objNodes('text').length) {
  openBlank(620, 430)
  await tick()
  view.click(pickItem('新建文本框'))
  await tick()
  await tick()
  const edAZ = view.findMaybe('sc-objedit')
  if (edAZ) { view.fire(edAZ, 'onBlur', {}); await tick() }
}
if (!objNodes('rect').length) {
  openBlank(300, 430)
  await tick()
  view.click(pickItem('新建矩形方框'))
  await tick()
  await tick()
}
const orderAZ = []
;(function walkAZ(n) {
  if (!n) return
  if (n.kind === 'host') {
    const cls = String(n.props.className || '')
    if (cls.indexOf('sc-groupbg') !== -1) orderAZ.push('group')
    else if (cls.indexOf('sc-objrect') !== -1) orderAZ.push('rect')
    else if (cls.indexOf('sc-objtext') !== -1) orderAZ.push('text')
    else if (cls.indexOf('sc-card') !== -1) orderAZ.push('card')
  }
  if (n.children) for (const c of n.children) walkAZ(c)
})(view.tree())
const firstAZ = (k) => orderAZ.indexOf(k)
const lastAZ = (k) => orderAZ.lastIndexOf(k)
ok(firstAZ('rect') !== -1 && firstAZ('text') !== -1 && firstAZ('card') !== -1,
  'the canvas has a colour box, a text box and cards', orderAZ)
ok(lastAZ('rect') < firstAZ('text'), 'the colour box is below the text box', orderAZ)
ok(lastAZ('text') < firstAZ('card'), 'and both of them are below every card (cards never sink under a text box)', orderAZ)
// 分组背景只在悬停某个组的时候才画出来（树里不一定有），所以它的位置用源码契约钉住：
// 渲染那一块里这几个数组的先后顺序就是叠放顺序
const bvAZ = fs.readFileSync('src/85-boardview.js', 'utf8')
const endAZ = bvAZ.indexOf('...guideEls')
const orderBlockAZ = bvAZ.slice(Math.max(0, endAZ - 600), endAZ)
const atAZ = (s) => orderBlockAZ.indexOf(s)
ok(endAZ > 0 && atAZ('groupBgEl') !== -1 && atAZ('groupBgEl') < atAZ('rectEls') &&
  atAZ('rectEls') < atAZ('textEls') && atAZ('textEls') < atAZ('cardEls') &&
  atAZ('cardEls') < atAZ('refEls'),
  'the render block keeps 分组背景 < 方框 < 文字 < 卡片 < 引用卡', orderBlockAZ.replace(/\s+/g, ' ').slice(-160))

// ── AY. 底部状态栏：最多两行、超出的从最上面藏、按钮不被裁 ──────────────────────
// 面板一窄，那几句提示就换行，整条状态栏跟着长高、把画布往上挤（他原话：「他在界面
// 缩短的时候会抬高」）。做法：提示整块套一层能限高又裁溢出的 .sc-statushelp，
// 按钮留在它外面 —— 里面是被裁掉的那一半，外面才是永远完整的那半。
// 排版本身要靠真浏览器（AY 只钉结构与源码契约，量高度在 tests/visual.mjs 的
// statusbar / statuswide 两幕）。
console.log('\nAY. the status bar stays two lines tall and never clips its buttons')
const statusBar = view.find('sc-status')
const statusHelp = view.findMaybe('sc-statushelp')
ok(!!statusHelp, 'the status bar wraps its hints in .sc-statushelp')
ok(!!statusHelp && statusBar.children.indexOf(statusHelp) !== -1, 'and that block is a direct child of the status bar')
const helpText = statusHelp ? view.textOf(statusHelp) : ''
ok(/上级：|下级：/.test(helpText), 'the level hint lives inside that block', helpText.slice(0, 24))
ok(helpText.indexOf('Ctrl+A 全选') !== -1, 'and so do the canvas hints')
ok(helpText.indexOf('自动排列') === -1 && helpText.indexOf('横排') === -1, 'the arrange buttons stay outside the clipped block')
ok(view.textOf(statusBar).indexOf('自动排列') !== -1, 'but they are still in the status bar')
ok(view.textOf(statusBar).indexOf('归位') !== -1, 'and the zoom buttons too')
const cssAY = fs.readFileSync('src/10-css.js', 'utf8')
const helpRule = (cssAY.match(/\.sc-statushelp\{[^}]*\}/) || [''])[0]
has(helpRule, 'max-height:33px', 'the hint block is capped at two lines')
has(helpRule, 'overflow:hidden', 'and clips whatever does not fit')
has(helpRule, 'align-content:flex-end', 'and keeps the bottom lines (it hides from the top down)')

// ── BA. 缩略图（用户 2026-10-02 原话）─────────────────────────────────────────
// 「右下角加一个缩略图按钮，按下之后所有卡片相对位置不变，但是只显示标题（分为两行，
//  这样大小合适），同时相对距离随之缩小，这个还要适配已经改变长宽比的卡片」
console.log('\nBA. the thumbnail view: title-only tiles, one scale, custom aspect ratios')
const subBA = (root) => {
  const out = []
  const visit = (n) => { if (!n) return; out.push(n); (n.children || []).forEach(visit) }
  visit(root)
  return out
}
const clsBA = (n) => String((n.props && n.props.className) || '')
const miniBtnBA = () => view.findAll('sc-btn').filter((n) => view.textOf(n) === '缩略图')[0]
const tilesBA = () => view.findAll('sc-minitile')
const tileOfBA = (k) => tilesBA().filter((n) => n.props['data-key'] === k)[0]
const tileBoxBA = (n) => ({
  x: Number(n.props.style.left), y: Number(n.props.style.top),
  w: Number(n.props.style.width), h: Number(n.props.style.height),
})
const centerBA = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const shownKeysBA = () => view.findAll('sc-card').map((n) => n.props['data-key'])
const partOfBA = (k, cls) => {
  const n = cardNodeOf(k)
  if (!n) return null
  return subBA(n).filter((x) => clsBA(x).indexOf(cls) !== -1)[0] || null
}
const nameOfBA = (k) => {
  const code = partOfBA(k, 'sc-cardcode')
  const name = partOfBA(k, 'sc-cardname')
  return (code ? view.textOf(code) + ' ' : '') + (name ? view.textOf(name) : '')
}
const barCtrlBA = () => subBA(view.find('sc-status'))
  .filter((n) => n.kind === 'host' && /(^|\s)(sc-btn|sc-navbtn)(\s|$)/.test(clsBA(n)))
const refreshBA = () => view.findAll('sc-navbtn').filter((n) => n.props.title === '刷新画布')[0]

// ① 这颗按钮在右下角 —— 也就是状态栏最右边那一颗
ok(!!miniBtnBA(), 'the status bar has a thumbnail button')
eq(view.textOf(barCtrlBA()[barCtrlBA().length - 1]), '缩略图',
  'and it is the right-most button of the status bar (the bottom-right corner)')

// ② 先把画布摆成一个**已知**的布局再量：三张卡片放到固定的三个点，
//    其余卡片先撤下画布（还在堆叠条里，只是不占画布）。缩略图的几何这样才好核。
const pickBA = nativeKeys().slice(0, 3)
eq(pickBA.length, 3, 'three cards to measure with', nativeKeys())
const SPREAD_BA = [{ x: 40, y: 40 }, { x: 520, y: 300 }, { x: 260, y: 200 }]
const gBA = JSON.parse(files[GRAPH])
for (const key of Object.keys(gBA.nodes || {})) {
  delete gBA.nodes[key].x; delete gBA.nodes[key].y
  delete gBA.nodes[key].cx; delete gBA.nodes[key].cy
}
pickBA.forEach(function (k, i) {
  const rec = gBA.nodes[k] || (gBA.nodes[k] = {})
  rec.x = SPREAD_BA[i].x; rec.y = SPREAD_BA[i].y
  rec.cx = SPREAD_BA[i].x; rec.cy = SPREAD_BA[i].y
  // 前面几小节改过的宽高先清掉：这三张都回到这一档的默认尺寸，量出来的比例才是已知的
  delete rec.w
  delete rec.h
})
gBA.objects = {}
gBA.refs = {}
files[GRAPH] = JSON.stringify(gBA, null, 2)
view.click(refreshBA())
await tick()
await tick()
const keysBA = shownKeysBA()
eq(keysBA.length, 3, 'the canvas shows exactly those three cards', keysBA)
const rectBA = {}
const nameBA = {}
const sumBA = {}
for (const k of keysBA) {
  rectBA[k] = cardRectOf(k)
  nameBA[k] = nameOfBA(k)
  const s = partOfBA(k, 'sc-cardsum')
  sumBA[k] = s ? view.textOf(s) : ''
}

// ③ 按下去：整块画布换成缩略图那一层，正常画布不再渲染
view.click(miniBtnBA())
await tick()
await tick()
ok(!!view.findMaybe('sc-mini'), 'pressing it swaps the canvas for the thumbnail layer')
eq(view.findMaybe('sc-stage'), null, 'and the normal canvas is not drawn underneath (only titles are on screen)')
eq(view.findAll('sc-card').length, 0, 'no full card is left on screen')
eq(tilesBA().length, 3, 'every card on the canvas has its own tile')
ok(String(miniBtnBA().props.className).indexOf('sc-btn-on') !== -1, 'the button shows the thumbnail is on')
ok(view.textOf(view.find('sc-statushelp')).indexOf('缩略图') !== -1, 'the status bar switches to thumbnail hints')
ok(view.textOf(view.find('sc-statushelp')).indexOf('点一张卡片') !== -1, 'and says how to get back out')

// ④ 每张牌子上**只有标题**（两行封顶的那条在 CSS 里，真浏览器量在 visual 的 mini 幕）
const richBA = keysBA.filter((k) => sumBA[k].length > 4)[0]
ok(!!richBA, 'one of the cards has a summary to compare against', Object.keys(sumBA).map((k) => sumBA[k].length))
const tileRich = tileOfBA(richBA)
ok(!!tileRich, 'that card has a tile')
const hostsRich = subBA(tileRich).filter((n) => n.kind === 'host')
eq(hostsRich.length, 2, 'a tile is just the tile plus one line')
eq(clsBA(hostsRich[1]), 'sc-minititle', 'and that line is the title element')
eq(view.textOf(tileRich), nameBA[richBA], 'a tile shows exactly the name the card shows')
ok(view.textOf(tileRich).indexOf(sumBA[richBA]) === -1, 'and nothing of the card body', view.textOf(tileRich))
ok(keysBA.every((k) => view.textOf(tileOfBA(k)) === nameBA[k]), 'every tile is title-only')
const objsBA = () => view.findAll('sc-miniobj')
eq(objsBA().length, 0, 'and no text box / rectangle tile (there is none on this canvas)')

// ⑤ 一个比例：相对位置一个不差、距离整体变小
const A = pickBA[0]
const B = pickBA[1]
const ca = centerBA(rectBA[A])
const cb = centerBA(rectBA[B])
const ta = centerBA(tileBoxBA(tileOfBA(A)))
const tb = centerBA(tileBoxBA(tileOfBA(B)))
const dxc = cb.x - ca.x
const dyc = cb.y - ca.y
const dxt = tb.x - ta.x
const dyt = tb.y - ta.y
const rx = dxt / dxc
const ry = dyt / dyc
ok(rx > 0.05 && rx < 0.95, 'the whole layout is shrunk, not redrawn somewhere else', rx)
ok(Math.abs(rx - ry) / Math.abs(rx) < 0.06, 'x and y share one single scale (relative positions are unchanged)', [rx, ry])
ok(Math.abs(Math.atan2(dyc, dxc) - Math.atan2(dyt, dxt)) < 0.05,
  'and the bearing between the two cards is unchanged', [dyc / dxc, dyt / dxt])
ok(Math.hypot(dxt, dyt) < Math.hypot(dxc, dyc) - 10,
  'the distance between them shrank', [Math.hypot(dxc, dyc), Math.hypot(dxt, dyt)])

// ⑥ 适配改过长宽比的卡片：把一张卡改成很宽的形状，它的牌子还是那个形状
view.click(miniBtnBA())
await tick()
await tick()
eq(view.findMaybe('sc-mini'), null, 'pressing it again leaves the thumbnail')
ok(!!view.findMaybe('sc-stage'), 'and the normal canvas is back')
const wideBA = pickBA[1]
const gWide = JSON.parse(files[GRAPH])
gWide.nodes[wideBA].w = 360
gWide.nodes[wideBA].h = 96
files[GRAPH] = JSON.stringify(gWide, null, 2)
view.click(refreshBA())
await tick()
await tick()
const rWide = cardRectOf(wideBA)
const rNorm = cardRectOf(pickBA[0])
eq(rWide.w, 360, 'the card really is wide now')
view.click(miniBtnBA())
await tick()
await tick()
const tWide = tileBoxBA(tileOfBA(wideBA))
const tNorm = tileBoxBA(tileOfBA(pickBA[0]))
ok(Math.abs(tWide.w / tWide.h - rWide.w / rWide.h) < 0.25,
  'a widened card keeps its own aspect ratio in the thumbnail', [tWide.w / tWide.h, rWide.w / rWide.h])
ok(tWide.w > tNorm.w + 10, 'so its tile is wider than a default card tile', [tWide.w, tNorm.w])
ok(Math.abs(tNorm.w / tNorm.h - rNorm.w / rNorm.h) < 0.25,
  'and a default card keeps its own ratio too', [tNorm.w / tNorm.h, rNorm.w / rNorm.h])

// ⑦ 点一张牌子 = 退出缩略图并回到那张卡（视口把它摆到画布中间、连缩放都不动）
const jumpBA = pickBA[2]
const zoomBA = atZoom()
view.click(tileOfBA(jumpBA))
await tick()
await tick()
eq(view.findMaybe('sc-mini'), null, 'clicking a tile leaves the thumbnail')
ok(!!view.findMaybe('sc-stage'), 'the canvas is back')
ok(selectedKeys().indexOf(jumpBA) !== -1, 'and the card you clicked is the selected one', selectedKeys())
const t7 = translateOf()
const s7 = atZoom() / 100
const cx7 = t7.x + (rectBA[jumpBA].x + rectBA[jumpBA].w / 2) * s7
const cy7 = t7.y + (rectBA[jumpBA].y + rectBA[jumpBA].h / 2) * s7
ok(Math.abs(cx7 - 450) <= 3 && Math.abs(cy7 - 250) <= 3,
  'the view is centred on that card (the canvas is 900×500 here)', [cx7, cy7])
eq(atZoom(), zoomBA, 'and the zoom level is left alone')

// ⑧ 点空白处也退出
view.click(miniBtnBA())
await tick()
await tick()
ok(!!view.findMaybe('sc-mini'), 'back in the thumbnail')
view.click(view.find('sc-mini'))
await tick()
await tick()
eq(view.findMaybe('sc-mini'), null, 'clicking the empty space leaves the thumbnail as well')

// ⑨ 换一层画布就不留在缩略图里（缩略图看的是当前这一层的摆法）
view.click(miniBtnBA())
await tick()
await tick()
ok(!!view.findMaybe('sc-mini'), 'in the thumbnail once more')
const upBtnBA = view.findAll('sc-crumb').filter((n) => n.tag === 'button')[0]
if (upBtnBA) {
  view.click(upBtnBA)
  await tick()
  await tick()
  eq(view.findMaybe('sc-mini'), null, 'going back up to the chapter list leaves the thumbnail')
  // 上一层画布上的章节卡在前面都被撤下来了 → 这块画布是空的，按钮该置灰
  eq(shownKeysBA().length, 0, 'the chapter list canvas is empty here')
  eq(miniBtnBA().props.disabled, true, 'the thumbnail button is greyed out when there is nothing to shrink')
} else {
  ok(!upBtnBA, 'already on the top canvas: there is no level above to walk away to')
}

// ⑩ 源码契约：一条比例、牌子宽度取自卡片自己的长宽比、标题两行封顶、层是不透明的一整层
// （detail 只给 needle：这几个 haystack 是整份源码，红了不该往终端倒 13 万字符）
const inFileBA = (hay, needle, label) => ok(String(hay).indexOf(needle) !== -1, label, needle.slice(0, 48))
const bvBA = fs.readFileSync('src/85-boardview.js', 'utf8')
inFileBA(bvBA, 'w = clamp(h * ratio, MINI_TILE_W_MIN, MINI_TILE_W_MAX)',
  'the tile width is computed from the card own aspect ratio')
inFileBA(bvBA, 'const k = clamp(Math.min(availW / bw, availH / bh), MINI_S_MIN, MINI_S_MAX)',
  'one single scale shrinks the whole layout')
inFileBA(bvBA, "'data-wheel': 'own',", 'the thumbnail layer swallows the wheel (the canvas behind is not drawn)')
const cssBA = fs.readFileSync('src/10-css.js', 'utf8')
const miniTitleBA = (cssBA.match(/\.sc-minititle\{[^}]*\}/) || [''])[0]
inFileBA(miniTitleBA, '-webkit-line-clamp:2', 'the tile title is clamped to two lines')
inFileBA(miniTitleBA, 'overflow:hidden', 'and whatever does not fit is clipped')
inFileBA((cssBA.match(/\.sc-mini\{[^}]*\}/) || [''])[0], 'background:var(--dsw-alias-bg-layer-1)',
  'the thumbnail layer is opaque (nothing shows through from the canvas behind)')

// ── BB. 卡片不许重叠（松手后自动让开）＋ 右键双击那条线＝删除 ────────────────────
// 用户 2026-10-02 原话：「除了文本框，和颜色框之外的卡片，它不能重叠」「还有就是加一个右键
// 双击连线…取消连线的快捷方式」。问下来的四条口径：拖动/改大小**松手后自动让开**（拖的过程中
// 允许压着）、**原生卡＋引用卡**都算、手势加在**那条线**上、画布上已经压着的老卡片**先不动**。
console.log('\nBB. cards never overlap (they step aside on release) and right-double-clicking a line deletes it')
const G1K = 'card/chapter-g1.md'
const G2K = 'card/chapter-g2.md'
const boxOfBB = (n) => ({
  x: Number(n.props.style.left), y: Number(n.props.style.top),
  w: Number(n.props.style.width), h: Number(n.props.style.height),
})
const rectOfBB = (k) => {
  const n = cardNodeOf(k)
  return n ? boxOfBB(n) : null
}
const refRectOfBB = (k) => {
  const n = view.findAll('sc-refcard').filter((x) => x.props['data-key'] === k)[0]
  return n ? boxOfBB(n) : null
}
const overlapsBB = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const overlapPairsBB = () => {
  const list = view.findAll('sc-card').map((n) => ({ key: n.props['data-key'], r: boxOfBB(n) }))
  const bad = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlapsBB(list[i].r, list[j].r)) bad.push(list[i].key + ' × ' + list[j].key)
    }
  }
  return bad
}

// 摆一个已知的顶层画布：两张章节卡（176×120），其余落位全撤掉
const gBB = JSON.parse(files[GRAPH])
for (const key of Object.keys(gBB.nodes || {})) {
  delete gBB.nodes[key].x; delete gBB.nodes[key].y
  delete gBB.nodes[key].cx; delete gBB.nodes[key].cy
  delete gBB.nodes[key].w; delete gBB.nodes[key].h
}
gBB.nodes[G1K].x = 40; gBB.nodes[G1K].y = 40
gBB.nodes[G2K].x = 400; gBB.nodes[G2K].y = 40
gBB.objects = {}
gBB.refs = {}
files[GRAPH] = JSON.stringify(gBB, null, 2)
view.click(refreshBA())
await tick()
await tick()
// 视角归位：让「可见区」就是画布左上角那一块 —— ③ 那条「别把卡片推出可见范围」要靠它才确定
view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '归位')[0])
await tick()
eq(view.findAll('sc-card').length, 2, 'the top canvas holds exactly the two chapter cards', view.findAll('sc-card').map((n) => n.props['data-key']))
eq(rectOfBB(G1K).w, 176, 'a chapter card is 176 wide here')
eq(overlapPairsBB().length, 0, 'and they start out clear of each other')

// ① 拖到邻居身上：拖的过程中允许压着，一松手挪到最近的空位（这里＝贴着邻居的左边）
{
  const a0 = rectOfBB(G1K)
  const p0 = toClient(a0.x + 20, a0.y + 20)
  const p1 = toClient(a0.x + 320, a0.y + 20)
  view.fire(cardNodeOf(G1K), 'onPointerDown', { button: 0, clientX: p0.clientX, clientY: p0.clientY })
  view.window('pointermove', { clientX: p1.clientX, clientY: p1.clientY, buttons: 1 })
  await tick()
  ok(overlapsBB(rectOfBB(G1K), rectOfBB(G2K)), 'while you drag it, it may sit on top of the other card', [rectOfBB(G1K), rectOfBB(G2K)])
  view.window('pointerup', { clientX: p1.clientX, clientY: p1.clientY })
  await tick()
  await tick()
  const a1 = rectOfBB(G1K)
  eq(overlapsBB(a1, rectOfBB(G2K)), false, 'but on release it steps aside')
  eq(a1.x, rectOfBB(G2K).x - a1.w, 'and lands flush against the neighbour it hit (the nearest free spot)')
  eq(a1.y, a0.y, 'without wandering off in the other axis')
  eq(overlapPairsBB().length, 0, 'no two cards overlap any more', overlapPairsBB())
  eq(JSON.parse(files[GRAPH]).nodes[G1K].x, a1.x, 'and that spot is what got written to the graph')
  eq(JSON.parse(files[GRAPH]).nodes[G1K].y, a1.y, 'on both axes')
}

// ② 文本框 / 方框不受这条约束：卡片可以压在它上面，它也不会被卡片推开
{
  openBlank(700, 400)
  await tick()
  view.click(pickItem('新建文本框'))
  await tick()
  await tick()
  const edBB = view.findMaybe('sc-objedit')
  if (edBB) { view.fire(edBB, 'onBlur', {}); await tick() }
  const textId = String(objNodes('text')[0].props['data-key']).replace(/^obj\//, '')
  const t0 = objRect(textId)
  ok(!!t0, 'a text box is on the canvas', t0)
  // 拖一张卡片压在文本框上
  const a0 = rectOfBB(G1K)
  const want = { x: Math.round(t0.x + t0.w / 2 - a0.w / 2), y: Math.round(t0.y + t0.h / 2 - a0.h / 2) }
  const q0 = toClient(a0.x + 20, a0.y + 20)
  const q1 = toClient(a0.x + 20 + (want.x - a0.x), a0.y + 20 + (want.y - a0.y))
  view.fire(cardNodeOf(G1K), 'onPointerDown', { button: 0, clientX: q0.clientX, clientY: q0.clientY })
  view.window('pointermove', { clientX: q1.clientX, clientY: q1.clientY, buttons: 1 })
  view.window('pointerup', { clientX: q1.clientX, clientY: q1.clientY })
  await tick()
  await tick()
  const a1 = rectOfBB(G1K)
  ok(Math.abs(a1.x - want.x) <= 6 && Math.abs(a1.y - want.y) <= 6, 'a card may be dropped straight onto a text box (objects are exempt)', [a1, want])
  ok(overlapsBB(a1, objRect(textId)), 'and it really is sitting on it')
  eq(objRect(textId).x, t0.x, 'the text box did not budge')
  eq(objRect(textId).y, t0.y, 'on either axis')
  // 反过来：把文本框拖到卡片上 —— 它照旧停在放手的地方，卡片也不动
  const cardNow = rectOfBB(G1K)
  const tb = objRect(textId)
  const t1 = { x: Math.round(cardNow.x + cardNow.w / 2 - tb.w / 2), y: Math.round(cardNow.y + cardNow.h / 2 - tb.h / 2) }
  const o0 = toClient(tb.x + 8, tb.y + 8)
  const o1 = toClient(tb.x + 8 + (t1.x - tb.x), tb.y + 8 + (t1.y - tb.y))
  view.fire(objNodes('text')[0], 'onPointerDown', { button: 0, clientX: o0.clientX, clientY: o0.clientY })
  view.window('pointermove', { clientX: o1.clientX, clientY: o1.clientY, buttons: 1 })
  view.window('pointerup', { clientX: o1.clientX, clientY: o1.clientY })
  await tick()
  await tick()
  ok(Math.abs((objRect(textId).x - t1.x)) <= 6 && Math.abs((objRect(textId).y - t1.y)) <= 6,
    'dragging a text box onto a card leaves it where you dropped it', [objRect(textId), t1])
  ok(overlapsBB(objRect(textId), rectOfBB(G1K)), 'objects are allowed to cover cards')
  eq(rectOfBB(G1K).y, cardNow.y, 'and the card under it was not pushed away')
}

// ③ 改大小撑到邻居身上：尺寸照他改的算，位置让开（往上/往左都会跑出可见区，所以往下去）
{
  const g3 = JSON.parse(files[GRAPH])
  g3.nodes[G1K].x = 40; g3.nodes[G1K].y = 40
  delete g3.nodes[G1K].w; delete g3.nodes[G1K].h
  files[GRAPH] = JSON.stringify(g3, null, 2)
  view.click(refreshBA())
  await tick()
  await tick()
  const grip = subOf(cardNodeOf(G1K)).filter((n) => clsOf(n).indexOf('sc-cardgrip') !== -1)[0]
  const a0 = rectOfBB(G1K)
  const gp0 = toClient(a0.x + a0.w, a0.y + a0.h)
  view.fire(grip, 'onPointerDown', { button: 0, clientX: gp0.clientX, clientY: gp0.clientY })
  view.window('pointermove', { clientX: gp0.clientX + 300, clientY: gp0.clientY, buttons: 1 })
  await tick()
  view.window('pointerup', { clientX: gp0.clientX + 300, clientY: gp0.clientY })
  await tick()
  await tick()
  const a1 = rectOfBB(G1K)
  eq(a1.w, 176 + 300, 'the new width is the one you dragged')
  eq(overlapPairsBB().length, 0, 'and the grown card stepped aside instead of overlapping', overlapPairsBB())
  eq(a1.y, 40 + 120, 'it went below the neighbour (the only escape that stays on screen)')
  eq(a1.x, 40, 'keeping its left edge')
  const g3b = JSON.parse(files[GRAPH])
  eq(g3b.nodes[G1K].w, 476, 'the size is what got written')
  eq(g3b.nodes[G1K].y, a1.y, 'together with the new spot')
}

// ④ 引用卡也算「卡片」：从抽屉拖一张压在卡片上，它自己让开
{
  view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
  await tick()
  const target = rectOfBB(G1K)
  await drawerDrag('人物甲', target.x + target.w / 2, target.y + target.h / 2)
  await tick()
  await tick()
  const refK = 'card/character-x.md'
  ok(!!(JSON.parse(files[GRAPH]).refs || {}).top && !!(JSON.parse(files[GRAPH]).refs.top || {})[refK], 'the reference landed on this canvas')
  const rr = refRectOfBB(refK)
  eq(overlapsBB(rr, rectOfBB(G1K)), false, 'the reference card does not overlap the card it was dropped on')
  ok(rr.x >= 0 && rr.y >= 0, 'and it stayed inside the canvas instead of being pushed off the top-left corner', rr)
  view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '存档卡')[0])
  await tick()
}

// ⑤ 右键双击那条线＝直接删掉它（第一下照旧弹菜单）
{
  const ensureEdgeBB = async () => {
    const g = JSON.parse(files[GRAPH])
    if (g.edges.some((e) => e.from === G1K && e.to === G2K)) return
    g.edges = (g.edges || []).filter((e) => !(e.from === G1K && e.to === G2K))
    g.edges.push({ from: G1K, to: G2K, label: '接着走', choice: '' })
    files[GRAPH] = JSON.stringify(g, null, 2)
    view.click(refreshBA())
    await tick()
    await tick()
  }
  const edgeHitBB = () => view.findAll('sc-edgehit').filter((n) => n.props['data-edge'] === G1K + '->' + G2K)[0]
  const hasEdgeBB = () => JSON.parse(files[GRAPH]).edges.some((e) => e.from === G1K && e.to === G2K)
  const menuBtn = (needle) => view.findAll('sc-menuitem').filter((n) => view.textOf(n).indexOf(needle) !== -1)[0]
  await ensureEdgeBB()
  ok(!!edgeHitBB(), 'there is a line between the two chapter cards')
  has(view.textOf(view.find('sc-statushelp')), '右键双击', 'the status bar says the shortcut out loud')
  // 第一下：照旧弹菜单
  view.fire(edgeHitBB(), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  ok(!!view.findMaybe('sc-menu'), 'right-clicking the line still opens its menu')
  ok(!!menuBtn('重命名连线') && !!menuBtn('删除这条连线'), 'with the same rename / delete entries')
  has(view.textOf(view.find('sc-menu')), '右键双击', 'and the menu itself spells the gesture out')
  // 第二下落在菜单上（右键双击多半就打在这儿）＝双击 → 直接删线
  view.fire(view.find('sc-menu'), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  await tick()
  ok(!hasEdgeBB(), 'a right double-click on the line deletes it outright')
  eq(view.findMaybe('sc-menu'), null, 'and the menu goes with it')
  // 时间窗：右键之后隔了 2 秒再点，就不算双击（菜单照旧只是关掉）
  const realNowBB = Date.now
  let clockBB = realNowBB()
  Date.now = () => clockBB
  await ensureEdgeBB()
  view.fire(edgeHitBB(), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  ok(!!view.findMaybe('sc-menu'), 'the menu is open again')
  clockBB += 2000
  view.fire(view.find('sc-menu'), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  await tick()
  ok(hasEdgeBB(), 'a second right-click two seconds later is not a double-click — the line stays')
  Date.now = realNowBB
  // 第二下落在菜单外面的线上（遮罩）：40px 以内也算双击
  view.fire(edgeHitBB(), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  view.fire(view.find('sc-menuback'), 'onContextMenu', { clientX: 326, clientY: 212 })
  await tick()
  await tick()
  ok(!hasEdgeBB(), 'a second right-click just off the menu (still on the line) counts as a double-click too')
  // 隔得远的那一下不算：只是把菜单关掉
  await ensureEdgeBB()
  view.fire(edgeHitBB(), 'onContextMenu', { clientX: 300, clientY: 200 })
  await tick()
  view.fire(view.find('sc-menuback'), 'onContextMenu', { clientX: 700, clientY: 600 })
  await tick()
  await tick()
  ok(hasEdgeBB(), 'but a second right-click far away does not delete anything')
  eq(view.findMaybe('sc-menu'), null, 'it just closes the menu')
}

// ── BC. 对齐吸附：按住 Shift 才吸（用户 2026-10-02 原话）────────────────────────
// 「拖动之后按住 shift 出现引导线，如果不按 shift，那就不出现引导线，这样子自由一点」。
// 追问后的两条口径：**不按 Shift ＝ 完全不吸、也没有线**（不是「照旧吸、只是不出线」），
// 而且**改大小照同一个规矩**。文本框 / 方框走的是同一套吸附，一并在这一节钉住。
console.log('\nBC. alignment snapping only while Shift is held')
const G1BC = 'card/chapter-g1.md'
const G2BC = 'card/chapter-g2.md'
// 摆一个已知场景：两张章节卡（176×120），一张在左上一张在右边；对象和引用卡清空
{
  const g = JSON.parse(files[GRAPH])
  for (const key of Object.keys(g.nodes || {})) {
    delete g.nodes[key].x; delete g.nodes[key].y
    delete g.nodes[key].cx; delete g.nodes[key].cy
    delete g.nodes[key].w; delete g.nodes[key].h
  }
  g.nodes[G1BC].x = 40; g.nodes[G1BC].y = 40
  g.nodes[G2BC].x = 400; g.nodes[G2BC].y = 40
  g.objects = {}
  g.refs = {}
  files[GRAPH] = JSON.stringify(g, null, 2)
  view.click(refreshBA())
  await tick()
  await tick()
  view.click(view.findAll('sc-btn').filter((n) => view.textOf(n) === '归位')[0])
  await tick()
  eq(view.findAll('sc-card').length, 2, 'BC starts from a known two-card canvas', view.findAll('sc-card').map((n) => n.props['data-key']))
  eq(rectOfBB(G1BC).w, 176, 'and the left card is at its default size')
  // 手势得说得出口：状态栏最后那一句就是这个规矩（面板一窄从最上面藏，最后一行才永远看得见）
  has(view.textOf(view.find('sc-statushelp')), '按住 Shift', 'the status bar spells the Shift gesture out')
}

// ① 拖动：不按 Shift＝完全自由（不吸、不画线）；同一格按住 Shift 立刻吸上；松开又放开；
//    松手写进图谱的是**自由**那一版，不是吸过的那一版。
{
  const a0 = rectOfBB(G1BC)
  const p0 = toClient(a0.x + 20, a0.y + 20)
  // 目标位置：上边缘落在邻居上边缘下方 3px —— 老规矩（一直吸）会把它吸到同一条线上
  const p1 = toClient(a0.x + 20 + 3, a0.y + 20 + 3)
  view.fire(cardNodeOf(G1BC), 'onPointerDown', { button: 0, clientX: p0.clientX, clientY: p0.clientY })
  view.window('pointermove', { clientX: p1.clientX, clientY: p1.clientY, buttons: 1 })
  await tick()
  const free = rectOfBB(G1BC)
  eq(free.y, a0.y + 3, 'without Shift the card sits exactly where the pointer says (3px shy of the neighbour)')
  eq(free.x, a0.x + 3, 'on both axes')
  eq(view.findAll('sc-guide').length, 0, 'and no guide line is drawn at all')
  // 同一个坐标，按住 Shift：下一次 pointermove 就吸上并画出辅助线（一帧一判）
  view.window('pointermove', { clientX: p1.clientX, clientY: p1.clientY, buttons: 1, shiftKey: true })
  await tick()
  eq(rectOfBB(G1BC).y, rectOfBB(G2BC).y, 'pressing Shift mid-drag snaps it on the very next move')
  ok(view.findAll('sc-guide').length >= 1, 'and that is when the guide appears', view.findAll('sc-guide').length)
  // 松开 Shift：回到指针算出来的位置，线也收掉
  view.window('pointermove', { clientX: p1.clientX, clientY: p1.clientY, buttons: 1 })
  await tick()
  eq(rectOfBB(G1BC).y, a0.y + 3, 'letting Shift go frees it again')
  eq(view.findAll('sc-guide').length, 0, 'and takes the guide away with it')
  view.window('pointerup', { clientX: p1.clientX, clientY: p1.clientY })
  await tick()
  await tick()
  const rec = JSON.parse(files[GRAPH]).nodes[G1BC]
  eq(rec.y, a0.y + 3, 'what gets written to the graph is the free position')
  eq(rec.x, a0.x + 3, 'on both axes')
  eq(view.findAll('sc-guide').length, 0, 'and nothing is left over after the drop')
}

// ② 改大小同理：不按 Shift 拖到哪儿是哪儿，按住 Shift 才吸到邻居的边上
{
  const g = JSON.parse(files[GRAPH])
  g.nodes[G1BC].x = 40; g.nodes[G1BC].y = 40
  delete g.nodes[G1BC].w; delete g.nodes[G1BC].h
  files[GRAPH] = JSON.stringify(g, null, 2)
  view.click(refreshBA())
  await tick()
  await tick()
  const a0 = rectOfBB(G1BC)
  const other = rectOfBB(G2BC)
  const wantW = other.x - a0.x + 3
  const gp0 = toClient(a0.x + a0.w, a0.y + a0.h)
  const gp1 = toClient(a0.x + a0.w + (wantW - a0.w), a0.y + a0.h)
  view.fire(gripOf(G1BC), 'onPointerDown', { button: 0, clientX: gp0.clientX, clientY: gp0.clientY })
  view.window('pointermove', { clientX: gp1.clientX, clientY: gp1.clientY, buttons: 1 })
  await tick()
  eq(rectOfBB(G1BC).w, wantW, 'without Shift the width is exactly the one you dragged')
  eq(view.findAll('sc-guide').length, 0, 'and no guide while resizing either')
  view.window('pointermove', { clientX: gp1.clientX, clientY: gp1.clientY, buttons: 1, shiftKey: true })
  await tick()
  eq(rectOfBB(G1BC).w, other.x - a0.x, 'with Shift the edge snaps flush onto the neighbour')
  ok(view.findAll('sc-guide').length >= 1, 'and the guide comes with it', view.findAll('sc-guide').length)
  view.window('pointerup', { clientX: gp1.clientX, clientY: gp1.clientY, shiftKey: true })
  await tick()
  await tick()
  eq(JSON.parse(files[GRAPH]).nodes[G1BC].w, other.x - a0.x, 'and the snapped size is what got written')
}

// ③ 文本框 / 方框：同一套规矩（它们本来就和卡片用同一个吸附）
{
  openBlank(700, 430)
  await tick()
  view.click(pickItem('新建文本框'))
  await tick()
  await tick()
  const ed = view.findMaybe('sc-objedit')
  if (ed) { view.fire(ed, 'onBlur', {}); await tick() }
  const tbId = String(objNodes('text')[0].props['data-key']).replace(/^obj\//, '')
  const t0 = objRect(tbId)
  const card0 = rectOfBB(G2BC)
  const wantX = card0.x + 3
  const d0 = toClient(t0.x + 8, t0.y + 8)
  const d1 = toClient(t0.x + 8 + (wantX - t0.x), t0.y + 8)
  view.fire(objNodes('text')[0], 'onPointerDown', { button: 0, clientX: d0.clientX, clientY: d0.clientY })
  view.window('pointermove', { clientX: d1.clientX, clientY: d1.clientY, buttons: 1 })
  await tick()
  eq(objRect(tbId).x, wantX, 'a text box is free too while Shift is up')
  eq(view.findAll('sc-guide').length, 0, 'and it draws no guide either')
  view.window('pointermove', { clientX: d1.clientX, clientY: d1.clientY, buttons: 1, shiftKey: true })
  await tick()
  eq(objRect(tbId).x, card0.x, 'holding Shift snaps the text box onto the card edge')
  ok(view.findAll('sc-guide').length >= 1, 'guide and all', view.findAll('sc-guide').length)
  view.window('pointerup', { clientX: d1.clientX, clientY: d1.clientY })
  await tick()
  await tick()
  eq(((JSON.parse(files[GRAPH]).objects || {}).top || {})[tbId].x, card0.x, 'and the snapped spot is what got saved')
}

// 替身自己的 hook 守卫也得是活的，否则「组件被当普通函数调用」这类崩溃在无头测试里
// 永远看不见 —— 这正是它一路全绿的原因。放在最后跑：它会换掉全局 window。
console.log('\nAD. the harness refuses a component whose hook count changes')
const guard = createHarness()
guard.installGlobals({})
function Guarded(props) {
  if (props.extra) guard.React.useState(0)
  return guard.React.createElement('div', null, 'x')
}
guard.mount(guard.React.createElement(Guarded, { extra: false }))
let guardFired = false
try {
  guard.mount(guard.React.createElement(Guarded, { extra: true }))
} catch (e) {
  guardFired = String(e && e.message).indexOf('hook 顺序') !== -1
}
ok(guardFired, 'the harness throws when a component calls a different number of hooks (same rule as real React)')

console.log('\n' + (failures === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures) + '  (' + checks + ' checks, ' + view.renderCount() + ' renders)')
if (failures !== 0) process.exit(1)
