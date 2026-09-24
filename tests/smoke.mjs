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
  card('node-n3.md', { id: 'node-n3', type: 'node', title: '节点三', mode: 'branch', when: '第7天', order: '30', summary: '有分支的节点' })
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
    async fsMkdir() { return { ok: true, value: { ok: true } } },
    async fsRemove(root, p) {
      delete files[p]
      removes.push(p)
      return { ok: true, value: { ok: true } }
    },
    async fsStat(root, p) {
      return { ok: true, value: { exists: Object.prototype.hasOwnProperty.call(files, p), type: 'file', size: 0 } }
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
ok(view.findAll('sc-elabel').length >= 1, 'edges carry a clickable label')

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
const toPort = view.findAll('sc-port').filter((n) => n.props['data-port'] === 'in')[0]
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

// ── G. expand: centre, grow, blur the background ─────────────────────────────
console.log('\nG. expand animation')
const expandTarget = view.findAll('sc-card').filter((n) => n.props['data-key'] === N1)[0]
view.fire(expandTarget, 'onDoubleClick', {})
await tick()
ok(String(view.find('sc-stage').props.className).indexOf('blur') === -1, 'phase 1: not blurred yet')
await wait(60)
ok(String(view.find('sc-stage').props.className).indexOf('blur') !== -1, 'phase 2: the canvas (and other cards) blur')
const overlay = view.findMaybe('sc-expand')
ok(!!overlay, 'the expanded layer exists')
ok(String(overlay.props.className).indexOf('open') !== -1, 'the expanded layer is open')
has(view.textOf(overlay), '角色', 'expanded view lists the characters section')
has(view.textOf(overlay), '场景', 'expanded view lists the scene section')
has(view.textOf(overlay), '内容', 'expanded view lists the content section')
ok(!!view.findMaybe('sc-scrim'), 'a backdrop scrim is rendered')

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
view.fire(choiceEdge, 'onContextMenu', {})
await tick()
const gDel = JSON.parse(files[GRAPH])
ok(!gDel.edges.some((e) => e.from === N3 && e.to === N1), 'right-clicking a line deletes it')
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
// 悬停不许改尺寸：`height:0` → `:hover{height:5px}` 这种写法会让指针和元素互相追着跑
// （滑块出现把内容顶走 → 取消悬停 → 缩回去 → 又悬停），整块布局跟着高频抖。
ok(rule('.sc-tags').indexOf('scrollbar-width:thin') !== -1, 'the tag strip reserves its scrollbar space instead of toggling it on hover')
eq((rule('.sc-tags::-webkit-scrollbar') || '').indexOf('height:0'), -1, 'the tag strip scrollbar does not appear/disappear on hover')
has(rule('.sc-tags:hover::-webkit-scrollbar-thumb'), 'background', 'hovering only recolours the thumb, it does not resize anything')
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
eq(Number(start[2]), n3rec.cy + 23, 'it starts at that option row, not at the middle of the card')
ok(Number(start[2]) !== n3rec.cy + 40, "it is not the card's own out port either")
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
eq(choiceCol.props.style.top, Math.round(80 / 2 - (rowCount * 30 + (rowCount - 1) * 5) / 2), 'the option column is vertically centred on the card')
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
eq(yDuring.x, liveCard.props.style.left + 184 + 8, 'the line starts at the right edge of where the card is right now')
eq(yDuring.y, liveCard.props.style.top + 40, 'and at its vertical middle')
view.window('pointerup', { clientX: 260, clientY: 240 })
await tick()
const yAfter = edgeStartXY()
eq(yAfter.x, yDuring.x, 'dropping it does not jump the line somewhere else')
eq(yAfter.y, yDuring.y, 'nor vertically')

console.log('\n' + (failures === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures) + '  (' + checks + ' checks, ' + view.renderCount() + ' renders)')
if (failures !== 0) process.exit(1)
