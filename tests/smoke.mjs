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
  card('chapter-g2.md', { id: 'chapter-g2', type: 'chapter', title: '章节乙', code: 'G1.2', summary: '第二章的简介', tags: '共通' })
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
has(view.textOf(ov2), '还没连到节点', 'an unconnected choice says so')
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

// ── J. zoom and pan ──────────────────────────────────────────────────────────
console.log('\nJ. zoom and pan')
const before = view.find('sc-boardtip').props.children
view.fire(canvas, 'onWheel', { ctrlKey: true, deltaY: -120, clientX: 400, clientY: 300 })
await tick()
const after = view.find('sc-boardtip').props.children
ok(String(after) !== String(before), 'Ctrl+wheel changed the zoom', [before, after])
ok(parseInt(String(after), 10) > parseInt(String(before), 10), 'scrolling up zooms in', [before, after])
has(view.find('sc-stage').props.style.transform, 'scale(', 'the canvas scales through a transform (relative positions hold)')
view.fire(canvas, 'onWheel', { deltaY: 100, clientX: 400, clientY: 300 })
await tick()
ok(!!view.find('sc-stage'), 'plain wheel panning does not throw')

// ── K. keyboard shortcuts ────────────────────────────────────────────────────
console.log('\nK. keyboard shortcuts')
const selCard = view.findAll('sc-card').filter((n) => n.props['data-key'] === N2)[0]
view.fire(selCard, 'onPointerDown', { button: 0, clientX: 100, clientY: 100 })
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

console.log('\n' + (failures === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures) + '  (' + checks + ' checks, ' + view.renderCount() + ' renders)')
if (failures !== 0) process.exit(1)
