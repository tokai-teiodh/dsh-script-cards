// 视觉回归：把**真实**的 src/10-css.js 喂给一个无头浏览器，渲染一张分支画布截图。
//
//   node tests/visual.mjs                     # 深色主题，100% 缩放 → .visual/canvas-dark.png
//   node tests/visual.mjs --theme light       # 浅色主题
//   node tests/visual.mjs --zoom 0.5          # 缩小到 50%（看圆点/线在小尺寸下还正不正）
//   node tests/visual.mjs --probe             # 顺便打印关键元素的计算样式
//
// 为什么需要它：tests/smoke.mjs 用的是自写的极小 React 替身，**没有布局引擎、不跑 CSS**，
// 所以「连线画到屏幕外 4000px」「选项列被 overflow:hidden 裁掉」「圆点落在半像素上变成
// 一团」这类问题在无头断言里全是绿的，只能在真浏览器里看。这一课踩过两次，于是留个工具。
//
// 主题色（--dsw-alias-*）优先从装好的 DSH 里读真实值（--asar <app.asar>，或自动找常见
// 安装路径）；读不到就用下面这份内置的兜底值，颜色够用、截图照样能看。
//
// 需要本机有一个 Edge/Chrome。找不到就用 --edge <路径> 指定。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.join(HERE, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] && process.argv[i + 1].charAt(0) !== '-' ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.indexOf('--' + name) !== -1

const THEME = arg('theme', 'dark')
const ZOOM = Number(arg('zoom', '1')) || 1
// 设备像素比：默认 2 好看清楚；排查「圆点不正圆」这类栅格化问题要用真机那一档（Windows 100% = 1）
const DPR = Number(arg('dpr', '2')) || 2
const PROBE = has('probe')
// 场景：canvas = 老的那张画布探针页；另外四个是这次新加的界面 ——
//   float  浮动窗口（默认展开形态：标题栏 + 图钉 + 全屏/浮动 + 页签 + 缩放手柄）
//   pinned 钉住多开（两个浮窗同时开着）
//   full   全屏遮罩模式（背景变暗、画布虚化）
//   doc    展开态的「文档」页签（DocEditor：脏标记 / 已保存 / 路径 / 等宽输入框）
const SCENES = ['canvas', 'float', 'pinned', 'full', 'doc', 'talk', 'grid', 'refs', 'objects', 'statusbar', 'statuswide', 'mini']
const SCENE = arg('scene', 'canvas')
const WIN_SIZE = { canvas: [900, 700], float: [900, 700], pinned: [900, 720], full: [900, 700], doc: [1000, 780], talk: [1060, 780], grid: [900, 700], refs: [980, 620], objects: [900, 620], statusbar: [360, 620], statuswide: [1180, 620], mini: [900, 620] }
const OUT = arg('out', '')

// ── 兜底主题色（真值的快照；有 asar 就用 asar 里的） ──────────────────────────
const FALLBACK = {
  light: {
    'bg-base': '#fff', 'bg-layer-1': '#fff', 'bg-layer-2': '#fff',
    'label-primary': '#0f1115', 'label-secondary': '#61666b',
    'border-l1': '#0000000a', 'border-l2': '#0000001a',
    'brand-primary': '#0f1115', 'state-error-primary': '#ec1313',
  },
  dark: {
    'bg-base': '#151517', 'bg-layer-1': '#232324', 'bg-layer-2': '#2c2c2e',
    'label-primary': '#f9fafb', 'label-secondary': '#cfd3d6',
    'border-l1': '#ffffff0f', 'border-l2': '#ffffff1f',
    'brand-primary': '#f9fafb', 'state-error-primary': '#f25a5a',
  },
}

function fallbackCss(theme) {
  const vars = Object.keys(FALLBACK[theme]).map((k) => '--dsw-alias-' + k + ':' + FALLBACK[theme][k] + ';').join('')
  return ':root{' + vars + '}'
}

// ── 真颜色：DSH 把主题表当纯 CSS 打包在 app.asar 里 ──────────────────────────
function tokensFromAsar(asarPath) {
  const text = fs.readFileSync(asarPath).toString('latin1')
  const out = []
  const seen = new Set()
  for (const needle of ['--dsw-static-neutral-bluish-00:', '--dsw-static-neutral-bluish-950:', '--dsw-alias-bg-base:']) {
    let i = 0
    while (true) {
      const at = text.indexOf(needle, i)
      if (at === -1) break
      i = at + 1
      const open = text.lastIndexOf('{', at)
      const close = text.indexOf('}', at)
      if (open === -1 || close === -1) break
      if (seen.has(open)) continue
      seen.add(open)
      let s = open - 1
      while (s > 0 && !'{};'.includes(text[s - 1]) && open - s < 200) s--
      let sel = text.slice(s, open).trim()
      // 基础色板那条规则的「选择器」是内联 CSS 的 JS 注释横幅，当作 :root 处理
      if (!/^[a-zA-Z:.[\]()\-_=~*>+,\s"']+$/.test(sel)) sel = ':root'
      out.push({ at: open, css: sel + '{' + text.slice(open + 1, close) + '}' })
    }
  }
  return out.sort((a, b) => a.at - b.at).map((r) => r.css).join('\n')
}

function findAsar() {
  const explicit = arg('asar', process.env.DSH_ASAR || '')
  if (explicit) return fs.existsSync(explicit) ? explicit : null
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
    path.join(process.env.PROGRAMFILES || '', 'DeepSeek Harness', 'resources', 'app.asar'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'DeepSeek Harness', 'resources', 'app.asar'),
  ]
  for (const p of roots) if (p && fs.existsSync(p)) return p
  return null
}

function findBrowser() {
  const explicit = arg('edge', process.env.DSH_BROWSER || '')
  if (explicit) return explicit
  const candidates = [
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const p of candidates) if (p && fs.existsSync(p)) return p
  return null
}

// ── 画布几何：与 src/80-board.js 的常量保持一致 ───────────────────────────────
const CHOICE_H = 30
const CHOICE_GAP = 5
const CHOICE_W = 156
const CHOICE_DX = 14
const PORT_DX = 8
const EDGE_PAD = 4000

const choiceTop = (h, n) => Math.round(h / 2 - (n * CHOICE_H + Math.max(0, n - 1) * CHOICE_GAP) / 2)
const choiceRect = (r, i, n) => ({ x: r.x + r.w + CHOICE_DX, y: r.y + choiceTop(r.h, n) + i * (CHOICE_H + CHOICE_GAP), w: CHOICE_W, h: CHOICE_H })
const outPoint = (r, i, n) => (i < 0
  ? { x: r.x + r.w + PORT_DX, y: r.y + r.h / 2 }
  : (function () { const c = choiceRect(r, i, n); return { x: c.x + c.w + PORT_DX, y: c.y + c.h / 2 } })())
const inPoint = (r) => ({ x: r.x - PORT_DX, y: r.y + r.h / 2 })

function edgePath(a, b) {
  const dx = Math.max(26, Math.abs(b.x - a.x) * 0.45)
  return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y
}

const NODE = { w: 156, h: 112 }
const RESULT = { w: 144, h: 86 }
const CONDITION = { w: 144, h: 86 }
const A = { x: 40, y: 60, w: NODE.w, h: NODE.h }
const B = { x: 400, y: 40, w: NODE.w, h: NODE.h }
const C = { x: 400, y: 240, w: RESULT.w, h: RESULT.h }
const D = { x: 40, y: 260, w: CONDITION.w, h: CONDITION.h }
const OPTIONS = ['选项A', '选项B', '很长的选项名字用来看省略号']
const N = OPTIONS.length

const edgePlain = edgePath(outPoint(A, -1, 0), inPoint(B))
const edgeOn = edgePath(outPoint(B, 1, N), inPoint(C))
const edgeInto = edgePath(outPoint(D, -1, 0), inPoint(C))
const edgeTemp = edgePath({ x: 470, y: 330 }, { x: 640, y: 420 })

const card = (r, body, extra) =>
  '<div class="sc-card" style="left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px">' + body + (extra || '') + '</div>'

const optionRows = OPTIONS.map((text, i) =>
  '<div class="sc-choice' + (i === 1 ? ' linked' : '') + '" title="' + text + '">' +
  '<span class="sc-choicetext">' + text + '</span>' +
  '<span class="sc-choicego">' + (i === 1 ? '→' : '') + '</span>' +
  '<div class="sc-port out" data-port="out"></div></div>').join('')

// 背景：一块带卡片/连线的画布，新的那几幕都把浮窗摆在这块画布上面
function backdrop(blurred) {
  const opt = OPTIONS.map((text, i) =>
    '<div class="sc-choice' + (i === 1 ? ' linked' : '') + '" title="' + text + '">' +
    '<span class="sc-choicetext">' + text + '</span>' +
    '<span class="sc-choicego">' + (i === 1 ? '→' : '') + '</span>' +
    '<div class="sc-port out" data-port="out"></div></div>').join('')
  return `
  <div class="sc-stage${blurred ? ' blur' : ''}" style="transform:translate(0px,0px) scale(${ZOOM})">
    <div class="sc-dots"></div>
    <svg class="sc-edges" width="8000" height="8000">
      <defs>
        <marker id="sc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L6,3 z" class="sc-arrowhead"></path></marker>
      </defs>
      <g transform="translate(${EDGE_PAD},${EDGE_PAD})">
        <g><path class="sc-edgehit" d="${edgePlain}"></path><path class="sc-edge" d="${edgePlain}" marker-end="url(#sc-arrow)"></path></g>
      </g>
    </svg>
    ${card(A, '<div class="sc-cardrow"><span class="sc-cardname">节点甲</span><span class="sc-cardwhen">第4天</span></div><div class="sc-cardsum">节点甲的简介。</div>', '<div class="sc-port in"></div><div class="sc-port out"></div><div class="sc-docdot" title="这张卡片有文档"></div>')}
    ${card(B, '<div class="sc-cardrow"><span class="sc-cardname">分歧节点甲</span></div><div class="sc-cardsum">这里要分岔。</div>',
      '<div class="sc-choices" style="top:' + choiceTop(B.h, N) + 'px">' + opt + '<button class="sc-choiceadd">＋ 选项</button></div><div class="sc-port in"></div>')}
    ${card(C, '<div class="sc-cardkind">结果</div><div class="sc-cardmono">结果甲</div>', '<div class="sc-port in"></div>')}
    ${card(D, '<div class="sc-cardkind">条件</div><div class="sc-cardmono">条件甲</div>', '<div class="sc-port in"></div><div class="sc-port out"></div>')}
  </div>`
}

// 高亮层的静态标记（照 92-doc.js 的 highlightNodes 摆）：行首 `「名字」：` 上色、
// 续行那个「对齐的冒号」也用**当前角色**的颜色、旁白行首那两个全角空格压暗。
// 当前角色只在台词首行之后有效，普通行/旁白行/空行一来就清掉（别把后面的冒号误染）。
// 换行跟着每行最后一段走（外层是 white-space:pre-wrap）。
function hlSpans(text, colors) {
  const lines = String(text).split('\n')
  const out = []
  let cur = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nl = i === lines.length - 1 ? '' : '\n'
    const m = /^「(.+?)」：/.exec(line)
    if (m) {
      cur = m[1]
      const col = (colors || {})[cur] || ''
      out.push('<span class="sc-docname"' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(m[0]) + '</span>')
      out.push('<span>' + esc(line.slice(m[0].length) + nl) + '</span>')
      continue
    }
    const cont = cur ? /^([　]+)(：)/.exec(line) : null
    if (cont) {
      const col = (colors || {})[cur] || ''
      out.push('<span class="sc-docquiet">' + esc(cont[1]) + '</span>')
      out.push('<span class="sc-docname"' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(cont[2]) + '</span>')
      out.push('<span>' + esc(line.slice(cont[0].length) + nl) + '</span>')
      continue
    }
    cur = ''
    if (line.slice(0, 2) === '　　') {
      out.push('<span class="sc-docquiet">　　</span>')
      out.push('<span>' + esc(line.slice(2) + nl) + '</span>')
      continue
    }
    out.push('<span>' + esc(line + nl) + '</span>')
  }
  return out.join('')
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 引用卡（存档卡抽屉拖进来的）：结构照 80-board.js 的 RefCard 摆。
// 借用分支卡那套形状，右上角**没有**连线圆点、左下角挂「引用」角标（别和 .sc-docdot 撞）。
function refcard(o) {
  const style = 'left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px' +
    (o.accent ? ';--sc-accent:' + o.accent : '')
  const cls = 'sc-card sc-refcard' + (o.accent ? ' dye' : '')
  return '<div class="' + cls + '" style="' + style + '" data-key="' + esc(o.key || '') + '" data-type="' + esc(o.type || 'node') + '" data-ref="1">' +
    '<div class="sc-refkind">' + esc(o.typeLabel || '节点') + '</div>' +
    '<div class="sc-cardname">' + esc(o.title || '') + '</div>' +
    '<div class="sc-cardsum">' + esc(o.summary || '') + '</div>' +
    '<div class="sc-refbadge">引用</div>' +
    '</div>'
}

// 存档卡抽屉：结构照 85-boardview 的抽屉摆 —— **整体就是滚动容器**（悬停在任何位置
// 滚轮都滚它），头部 + 筛选框自己在 .sc-drawersticky 里 sticky 挂着。
function drawer(o) {
  const groups = o.groups || []
  // top:74px —— 静态页里导航条是浮在画布上的，抽屉往下让开它（真机上抽屉在 .sc-canvas
  // 里、本来就在导航条下面）
  return '<div class="sc-drawer" data-wheel="own" style="width:260px;top:74px">' +
    '<div class="sc-drawersticky">' +
    '<div class="sc-drawerhead"><span>存档卡</span><span class="sc-spacer"></span><button class="sc-btn">×</button></div>' +
    '<input class="sc-inp full sc-menuinput" placeholder="筛选卡片…" value="">' +
    '</div>' +
    groups.map(function (g) {
      return '<div class="sc-drawerhead2">' + esc(g.label) + '</div>' +
        g.items.map(function (it) {
          return '<div class="sc-draweritem" data-key="' + esc(it.key || '') + '">' +
            '<span class="sc-draweritemtitle"' + (it.accent ? ' style="color:' + it.accent + '"' : '') + '>' + esc(it.title) + '</span>' +
            '<span class="sc-draweritemkind">' + esc(it.kind || '') + '</span></div>'
        }).join('')
    }).join('') +
    '<div class="sc-drawerhint">按住拖到画布上＝摆一张引用（不改卡片文件、不连线）</div>' +
    '</div>'
}

// 一个浮窗的静态标记（结构与 85-boardview 渲染出来的一致）
function win(opts) {
  const o = opts || {}
  const cls = 'sc-expand sc-' + (o.mode === 'full' ? 'full' : 'float') + ' open'
  const style = 'left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px;z-index:' + (o.z || 30)
  const tab = o.tab === 'doc' ? 'doc' : 'card'
  const tabs = '<div class="sc-tabs">' +
    '<button class="sc-tab' + (tab === 'card' ? ' on' : '') + '">卡片</button>' +
    '<button class="sc-tab' + (tab === 'doc' ? ' on' : '') + '">文档</button></div>'
  const bar = '<div class="sc-docbar">' +
    '<button class="sc-btn sc-btn-on">保存</button><button class="sc-btn">重载</button>' +
    (o.role ? '<span class="sc-docrole">正在写：' + o.role + '</span>' : '') +
    '<span class="sc-spacer"></span>' +
    '<span class="sc-docstate' + (o.dirty ? ' dirty' : '') + '">' + (o.dirty ? '● 未保存' : '已保存 14:07') + '</span></div>' +
    '<div class="sc-docpath">剧本档案/文档/' + o.file + '</div>'
  // 人物菜单（文稿页右键弹出来的那个）：结构照 MenuList + 92-doc 的 items 摆
  const speakerMenu = '<div class="sc-menu" id="probe-speakermenu" style="left:' + (o.menuX || 300) + 'px;top:' + (o.menuY || 220) + 'px">' +
    '<input class="sc-inp full sc-menuinput" placeholder="筛选人物…" value="">' +
    '<div class="sc-menuhead">主角（2）</div>' +
    '<button class="sc-menuitem"><span>✓ 勿忘我</span></button>' +
    '<button class="sc-menuitem"><span>幻驹山茶</span></button>' +
    '<div class="sc-menuhead">其他（1）</div>' +
    '<button class="sc-menuitem"><span>人物甲</span></button>' +
    '<div class="sc-menusep"></div>' +
    '<button class="sc-menuitem"><span>旁白</span><span class="k">不写人名</span></button>' +
    '<button class="sc-menuitem"><span>结束当前角色</span></button>' +
    '</div>'
  // 文档页＝**两层**：底下 .sc-dochl 是彩字高亮层，上面 .sc-docarea 的文字透明。
  // 两层都放在 .sc-dochlwrap 里（它负责边框、底色和高度），排版逐项一致。
  const docBody = '<div class="sc-dochlwrap" id="probe-dochlwrap">' +
    '<div class="sc-dochl" id="probe-dochl">' + hlSpans(o.doc || '', o.colors) + '</div>' +
    '<textarea class="sc-docarea" id="probe-docarea" spellcheck="false">' + esc(o.doc || '') + '</textarea>' +
    '</div>'
  const body = tab === 'doc'
    ? '<div class="sc-doc">' + bar + docBody +
      (o.menu ? speakerMenu : '') + '</div>'
    : '<div class="sc-meta"><span>时间：第4天</span><span>文件：' + o.file + '</span></div>' +
      '<div class="sc-tagwrap"><div class="sc-tags"><span class="sc-tag">日常</span><span class="sc-tag">主线</span></div></div>' +
      '<div class="sc-h2">下属节点</div>' +
      '<div class="sc-nodelist">' +
      '<div class="sc-nodelistrow"><span class="n">节点</span><span class="t">节点一</span></div>' +
      '<div class="sc-nodelistrow"><span class="n">节点</span><span class="t">节点二</span></div>' +
      '<div class="sc-nodelistrow"><span class="n">条件</span><span class="t">条件一</span></div>' +
      '</div>' +
      '<div class="sc-h2">原文</div><div class="sc-p">这一章的正文从这里开始。</div>'
  // data-wheel="own"：浮窗自己吃滚轮（见 85-boardview 的 onWheel），画布别跟着缩放
  return '<div class="' + cls + '" data-wheel="own" style="' + style + '" data-key="' + o.file + '">' +
    '<div class="sc-expandh">' +
    '<h3>' + (o.title || 'G1.1 章节甲') + '</h3><span class="sc-tag">' + (o.type || '章节') + '</span>' +
    '<span class="sc-spacer"></span>' +
    '<button class="sc-expandb' + (o.pin ? ' on' : '') + '" title="钉住">' +
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="' + (o.pin ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.3"><path d="M6 1.6h4l-.6 4 2.1 2.1H4.5L6.6 5.6z"></path><path d="M8 7.7V14.4"></path></svg></button>' +
    '<button class="sc-expandb">' + (o.mode === 'full' ? '浮动' : '全屏') + '</button>' +
    '<button class="sc-expandx">×</button>' +
    '</div>' + tabs +
    '<div class="sc-expandbody' + (tab === 'doc' ? ' sc-docbody' : '') + '">' + body + '</div>' +
    (o.mode === 'full' ? '' : '<div class="sc-expandgrip" title="拖动缩放"></div>') +
    '</div>'
}

// 方片页（grid）那一幕用的标记：分组标题 + 一组 tile + 一张人物卡的色卡菜单。
// 结构与 60-grid.js 渲染出来的一致：人物卡的标题染角色色（.sc-tile.dye + --sc-accent）。
function tile(o) {
  const accent = o.accent || ''
  return '<div class="sc-tile' + (accent ? ' dye' : '') + '"' + (accent ? ' style="--sc-accent:' + accent + '"' : '') + '>' +
    '<div class="sc-tiletop">' +
    '<div class="sc-tiletitle">' + esc(o.title) + '</div>' +
    '<div class="sc-tileacts"><button class="sc-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"></path></svg></button></div>' +
    '</div>' +
    '<div class="sc-tagwrap"><div class="sc-tags"><span class="sc-tag">' + esc(o.type || '人物') + '</span>' + (o.tag ? '<span class="sc-tag">' + esc(o.tag) + '</span>' : '') + '</div></div>' +
    '<div class="sc-tilesum">' + esc(o.sum || '') + '</div>' +
    '</div>'
}

// 人物卡右键弹出来的「角色色」菜单（色卡那一套：swatches + 色盘 + 清除）
function colorMenu(x, y, current) {
  const list = ['#E5484D', '#E5A33D', '#3FA46A', '#3E7BC4', '#7A5AF8', '#C86AA8', '#5B6472', '#C9CED6']
  return '<div class="sc-menu" id="probe-colormenu" style="left:' + x + 'px;top:' + y + 'px">' +
    '<div class="sc-menuhead">角色色（写进卡片文件的 color，跟项目进 git）</div>' +
    '<div class="sc-swatches">' + list.map(function (hex) {
      return '<button class="sc-swatch' + (String(current).toLowerCase() === hex.toLowerCase() ? ' sc-swatchsel' : '') + '" style="background:' + hex + '" title="' + hex + '"></button>'
    }).join('') + '</div>' +
    '<div class="sc-colorrow"><input class="sc-colorinput" type="color" value="' + (current || list[0]) + '"><span>色盘</span>' +
    '<span style="flex:1"></span><button class="sc-btn">编辑色卡…</button><button class="sc-btn">清除</button></div>' +
    '</div>'
}

const DOC_TEXT = [
  '## 这一章要解决的问题',
  '',
  '- 开场先冷：不要一上来就把冲突端出来。',
  '- 甲和乙的第一次照面，谁先开口？',
  '- 场景切几次？三次以上读者会散。',
  '',
  '## 已经定下来的',
  '',
  '- 时间线：第 4 天傍晚，雨停之后。',
  '- 视角：跟着甲走，不切乙的内心。',
  '- 结尾留一个钩子，但不要一上来就抛新的谜。',
  '',
  '## 待定',
  '',
  '- 第三章那段回溯要不要留（留给下次会话决定）。',
  '- 乙的那句台词是留着还是砍掉（读起来太顺了，反而像旁白）。',
  '- 道具要不要提前出现一次，方便后文回收。',
  '',
  '## 备注',
  '',
  '这一版先按「甲先开口」写，写完再回头看重音够不够。',
  '文档是独立文件，改这里不会动卡片正文。',
].join('\n')

// 台词 / 旁白的文档：行首是前缀，续行补和前缀等宽的全角空格（对着台词那一列），
// 旁白用两个全角空格开头。角色色来自人物卡（真机上 frontmatter 的 color /
// tags 里的 `印象色#RRGGBB`）。
const TALK_COLORS = { '勿忘我': '#8EB2FC', '幻驹山茶': '#E5A33D' }
const TALK_TEXT = [
  '「勿忘我」：你终于来了。',
  // 续行＝(前缀宽度 − 1) 个全角空格 + 一个全角冒号：`「勿忘我」：` 宽 6 → 5 空格 + 冒号
  // （用 repeat 拼，免得数不清到底敲了几个全角空格）
  '　'.repeat(5) + '：伞收在门口就行。',
  '　　雨停之后，屋檐还在滴水。',
  '「幻驹山茶」：我带了茶，凉了就不好喝了。',
].join('\n')

/**
 * 底部状态栏那一幕的正文（窄 / 宽两幕共用同一份 markup，只有窗口宽度不同）：
 * 提示整块套在 .sc-statushelp 里，最多两行，多出来的**从最上面往下藏**；
 * 右边那几颗按钮在它外面，永远完整可见。
 * 结构照 85-boardview 的真实渲染顺序：.sc-status > .sc-statushelp(提示…)
 * + .sp + 自动排列 / 横排 + 缩放条。
 */
const STATUS_HINTS = [
  '下级：排本章节的情节顺序（双击卡片展开）',
  '· 空白处左键拖动平移 · 滚轮缩放（Shift/Alt+滚轮左右上下）',
  '· 右键空白处新建卡片 / 文本框 / 方框 · 粘贴',
  '· 点连线给它起名字（右键改名 / 删线）',
  '· 右键拖框选多张 · shift+右键点卡片加选 · Ctrl+A 全选',
]

function statusbarMarkup() {
  return '<div class="sc-nav" style="position:absolute;left:0;right:0;top:0;z-index:50">' +
    '<button class="sc-navbtn">‹</button><button class="sc-navbtn">›</button>' +
    '<button class="sc-navbtn">⌂</button><button class="sc-navbtn">⟳</button>' +
    '<div class="sc-addr"><span class="sc-crumb">剧本档案</span><span class="sc-crumbsep">/</span>' +
    '<span class="sc-crumb cur">G1.1 章节甲</span></div>' +
    '<span class="sc-boardtip">100%</span>' +
    '</div>' +
    '<div class="sc-stage" style="transform:translate(24px,64px) scale(1)">' +
    '<div class="sc-dots"></div>' +
    card({ x: 20, y: 60, w: 156, h: 112 },
      '<div class="sc-cardrow"><span class="sc-cardname">节点一</span></div>' +
      '<div class="sc-cardwhen sc-cardwhenline">第4天</div>' +
      '<div class="sc-cardsum">窄面板下的样子。</div>') +
    '</div>' +
    '<div class="sc-status" style="position:absolute;left:0;right:0;bottom:0;z-index:50">' +
    '<div class="sc-statushelp">' +
    STATUS_HINTS.map(function (t) { return '<span>' + t + '</span>' }).join('') +
    '</div>' +
    '<span class="sp"></span>' +
    '<button class="sc-btn">自动排列</button>' +
    '<button class="sc-btn">横排</button>' +
    '<div class="sc-zoombar"><button class="sc-navbtn">－</button><button class="sc-navbtn">＋</button>' +
    '<button class="sc-btn">归位</button></div>' +
    // 缩略图那本按钮在状态栏最右边（2026-10-02 加的）：窄面板下也得完整看得见
    '<button class="sc-btn">缩略图</button>' +
    '</div>'
}

function sceneMarkup(scene) {
  if (scene === 'statusbar' || scene === 'statuswide') return statusbarMarkup()
  if (scene === 'mini') {
    // 缩略图（用户 2026-10-02：「右下角加一个缩略图按钮，按下之后所有卡片相对位置不变，
    // 但是只显示标题（分为两行，这样大小合适），同时相对距离随之缩小，这个还要适配已经
    // 改变长宽比的卡片」）。结构照 85-boardview 的真实渲染顺序：
    //   .sc-canvas > .sc-mini（不透明的一整层）> svg.sc-miniedges + .sc-minitile + .sc-miniobj
    // 牌子尺寸＝高度取缩小后的卡片高度（夹在 24~42，两行 10px 标题刚好装下）、
    // 宽度＝高度 × 这张卡自己的长宽比。三张牌子分别是：普通节点（156×112）、
    // **加宽过**的卡片（360×96 → 3.75:1，牌子明显更宽）、标题特别长的一张（用来量两行封顶）。
    const tiles = [
      { x: 60, y: 74, w: 58, h: 42, key: 'card/node-n1.md', title: '节点一：面试三女神' },
      { x: 210, y: 190, w: 158, h: 42, key: 'card/node-n2.md', title: '节点二（加宽过的卡片）', dye: '#8EB2FC' },
      { x: 470, y: 330, w: 58, h: 42, key: 'card/node-n3.md', title: '一个很长很长的卡片标题要占满两行之后被裁掉' },
    ]
    return '<div class="sc-nav" style="position:absolute;left:0;right:0;top:0;z-index:50">' +
      '<button class="sc-navbtn">‹</button><button class="sc-navbtn">›</button>' +
      '<button class="sc-navbtn">⌂</button><button class="sc-navbtn">⟳</button>' +
      '<button class="sc-btn">存档卡</button>' +
      '<div class="sc-addr"><span class="sc-crumb">剧本档案</span><span class="sc-crumbsep">/</span>' +
      '<span class="sc-crumb cur">G1.1 章节甲</span></div>' +
      '<span class="sc-boardtip">100%</span>' +
      '</div>' +
      '<div class="sc-mini" data-mini="1" data-wheel="own">' +
      '<svg class="sc-miniedges" width="100%" height="100%">' +
      '<path class="sc-miniedge" d="M118,95 C160,95 168,211 210,211"></path>' +
      '<path class="sc-miniedge" d="M368,211 C420,211 428,351 470,351"></path>' +
      '</svg>' +
      '<div class="sc-miniobj rect" data-key="obj/r1" style="left:300px;top:60px;width:120px;height:60px;--sc-accent:#3FA46A"></div>' +
      '<div class="sc-miniobj text" data-key="obj/t1" style="left:640px;top:440px;width:90px;height:44px"></div>' +
      tiles.map(function (t) {
        return '<div class="sc-minitile' + (t.dye ? ' dye' : '') + '" data-key="' + t.key + '"' +
          (t.dye ? ' style="--sc-accent:' + t.dye + ';left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px"' :
            ' style="left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px"') + '>' +
          '<div class="sc-minititle">' + t.title + '</div></div>'
      }).join('') +
      '</div>' +
      '<div class="sc-status" style="position:absolute;left:0;right:0;bottom:0;z-index:50">' +
      '<div class="sc-statushelp">' +
      '<span>缩略图：整块画布只留标题（位置按比例缩到一屏）</span>' +
      '<span>· 点一张卡片＝退出缩略图并回到那张卡 · 点空白处或再按一次「缩略图」退出</span>' +
      '</div>' +
      '<span class="sp"></span>' +
      '<button class="sc-btn">自动排列</button>' +
      '<button class="sc-btn">横排</button>' +
      '<div class="sc-zoombar"><button class="sc-navbtn">－</button><button class="sc-navbtn">＋</button>' +
      '<button class="sc-btn">归位</button></div>' +
      '<button class="sc-btn sc-btn-on">缩略图</button>' +
      '</div>'
  }
  if (scene === 'refs') {
    // 引用卡那一幕：存档卡抽屉开着 + 画布上一张章节引用、一张人物引用（用角色色）、
    // 一张原生节点卡。引用卡没有连线圆点，左下角一个「引用」角标。
    // 这一幕的「画布」就是外壳给的那个（.sc-wrap > .sc-board > .sc-canvas 已经是
    // position:relative;height:100vh）：导航条贴顶、状态行贴底、抽屉浮在右侧，
    // 卡片放在 stage 里往下让开导航条。
    return '<div class="sc-nav" style="position:absolute;left:0;right:0;top:0;z-index:50">' +
      '<button class="sc-navbtn">‹</button><button class="sc-navbtn">›</button>' +
      '<button class="sc-navbtn">⌂</button><button class="sc-navbtn">⟳</button>' +
      '<button class="sc-btn sc-btn-on">存档卡</button>' +
      '<div class="sc-addr"><span class="sc-crumb cur">剧本档案</span></div>' +
      '<span class="sc-boardtip">100%</span>' +
      '</div>' +
      '<div class="sc-stage" style="transform:translate(0px,64px) scale(1)">' +
      '<div class="sc-dots"></div>' +
      card({ x: 60, y: 120, w: 176, h: 120 },
        '<div class="sc-cardrow"><span class="sc-cardname">G1 第一章</span></div><div class="sc-cardsum">本层的原生卡：能连线、能编辑。</div>',
        '<div class="sc-port in"></div><div class="sc-port out"></div>') +
      refcard({ x: 300, y: 90, w: 176, h: 120, key: 'card/chapter-g2.md', type: 'chapter', typeLabel: '章节', title: 'G2 第二章', summary: '引用：卡片文件在章节那层，这里只是摆了个位置。' }) +
      refcard({ x: 300, y: 260, w: 156, h: 112, key: 'card/character-x.md', type: 'node', typeLabel: '人物', title: '勿忘我（ワスレナグサ）', summary: '总在雨里等人。', accent: '#8EB2FC' }) +
      refcard({ x: 60, y: 300, w: 156, h: 112, key: 'card/node-n5.md', type: 'node', typeLabel: '节点', title: '节点五（别的章节）', summary: '这张卡没手染、也没有角色色。' }) +
      '</div>' +
      drawer({
        groups: [
          { label: '人物（3）', items: [{ title: '勿忘我（ワスレナグサ）', kind: '人物', accent: '#8EB2FC' }, { title: '幻驹山茶（ゲンク サザンカ）', kind: '人物', accent: '#E5A33D' }, { title: '人物甲', kind: '人物' }] },
          { label: '章节（2）', items: [{ title: 'G1 第一章', kind: '章节' }, { title: 'G2 第二章', kind: '章节' }] },
        ],
      }) +
      '<div class="sc-status" style="position:absolute;left:0;right:0;bottom:0;z-index:50">' +
      '<span>上级：排列章节（双击章节卡片进入下级）</span><span class="sp"></span>' +
      '<button class="sc-btn">自动排列</button></div>'
  }
  if (scene === 'objects') {
    // 独立对象那一幕：一个矩形方框（半透明底色）+ 压在它上面的文本框（角色色 + 缩放手柄），
    // 底下那层是分组悬停时浮出来的淡背景，右边一张原生卡用来比层级。
    // DOM 顺序照 85-boardview 的真实渲染顺序（用户 2026-10-01 拍板的层序，从下往上）：
    // 分组背景 → 有颜色的方框 → 文字 → 其他所有卡片。
    const groupBg = '<div class="sc-groupbg" data-group="g1" style="left:40px;top:130px;width:320px;height:170px"></div>'
    const nodeCard = '<div class="sc-card" data-key="card/node-n1.md" data-type="node" style="left:400px;top:150px;width:156px;height:112px">' +
      '<div class="sc-cardrow"><span class="sc-cardname">节点一</span></div>' +
      // 名字与时间分两行（用户的要求），右下角带缩放手柄
      '<div class="sc-cardwhen sc-cardwhenline">第4天</div>' +
      '<div class="sc-cardsum">节点的简介</div>' +
      '<div class="sc-cardgrip"></div></div>'
    // 拖动时的对齐辅助线：只画到「和它对齐的那张卡片」为止（不是铺满画布）
    const guide = '<div class="sc-guide sc-guidev" data-guide="v" style="left:260px;top:150px;height:220px"></div>'
    const boxRect = '<div class="sc-obj sc-objrect" data-key="obj/r1" data-obj="rect" style="left:60px;top:150px;width:220px;height:110px;--sc-accent:#3FA46A">' +
      '<div class="sc-objgrip"></div></div>'
    const boxText = '<div class="sc-obj sc-objtext dye" data-key="obj/t1" data-obj="text" style="left:80px;top:175px;width:200px;height:64px;--sc-accent:#8EB2FC">' +
      '<div class="sc-objbody">第二幕 转折</div><div class="sc-objgrip"></div></div>'
    // 又一张卡，压在方框与文字上（只盖住右边一截，文本框中心还露在外面）：
    // 用来量「卡片在最上面」—— 三层叠在一起的那一点，摸到的必须是卡片。
    const overCard = '<div class="sc-card" data-key="card/node-n2.md" data-type="node" style="left:200px;top:170px;width:156px;height:112px">' +
      '<div class="sc-cardrow"><span class="sc-cardname">节点二</span></div>' +
      '<div class="sc-cardsum">我压在文字和色块上面。</div></div>'
    return '<div class="sc-nav" style="position:absolute;left:0;right:0;top:0;z-index:50">' +
      '<button class="sc-navbtn">‹</button><button class="sc-navbtn">›</button>' +
      '<button class="sc-navbtn">⌂</button><button class="sc-navbtn">⟳</button>' +
      '<button class="sc-btn">存档卡</button>' +
      '<div class="sc-addr"><span class="sc-crumb">剧本档案</span><span class="sc-crumbsep">/</span>' +
      '<span class="sc-crumb cur">G1.1 章节甲</span></div>' +
      '<span class="sc-boardtip">100%</span>' +
      '</div>' +
      '<div class="sc-stage" style="transform:translate(24px,64px) scale(1)">' +
      '<div class="sc-dots"></div>' + guide + groupBg + boxRect + boxText + nodeCard + overCard +
      '</div>' +
      '<div class="sc-status" style="position:absolute;left:0;right:0;bottom:0;z-index:50">' +
      '<span>下级：排本章节的情节顺序（双击卡片展开）</span><span class="sp"></span>' +
      '<button class="sc-btn">自动排列</button></div>'
  }
  if (scene === 'grid') {
    // 方片页：人物卡右键弹「角色色」菜单 + 一张已经设过色的人物卡
    return '<div class="sc-body">' +
      '<div class="sc-list" style="width:330px">' +
      '<input class="sc-search" value="" placeholder="搜标题 / 简介 / 标签">' +
      '<div class="sc-items">' +
      '<div class="sc-group">人物 (3)</div>' +
      '<div class="sc-grid">' +
      tile({ title: '勿忘我（ワスレナグサ）', sum: '总在雨里等人。', tag: '印象色#8EB2FC', accent: '#8EB2FC' }) +
      tile({ title: '幻驹山茶（ゲンク サザンカ）', sum: '话不多，茶泡得好。', accent: '#E5A33D' }) +
      tile({ title: '蜜柑（ミカン）', sum: '嗓门大，心软。', tag: '印象色#3FA46A', accent: '#3FA46A' }) +
      '</div>' +
      '<div class="sc-group">设定 (1)</div>' +
      '<div class="sc-grid">' +
      tile({ title: '设定甲', type: '设定', sum: '这一条不是人物卡，右键不弹菜单。' }) +
      '</div>' +
      '</div></div>' +
      '<div class="sc-detail"><h1 class="sc-h1">勿忘我（ワスレナグサ）</h1>' +
      '<div class="sc-meta"><span class="sc-tag">人物</span><span>更新：2026-10-01</span></div>' +
      '<div class="sc-p">右边这张菜单就是右键人物卡弹出来的：挑一个色写进卡片文件的 color，</div>' +
      '<div class="sc-p">「清除」＝回到 tags 里的印象色。方片页本身只在标题上描一下角色色。</div>' +
      '</div>' +
      colorMenu(430, 210, '#8EB2FC') +
      '</div>'
  }
  if (scene === 'float') {
    return backdrop() + win({ x: 220, y: 120, w: 460, h: 430, file: 'chapter-g1.md' })
  }
  if (scene === 'pinned') {
    return backdrop() +
      win({ x: 40, y: 60, w: 420, h: 400, file: 'chapter-g1.md', pin: true, z: 30 }) +
      win({ x: 330, y: 250, w: 420, h: 400, file: 'node-n2.md', title: '节点二', type: '节点', z: 32 })
  }
  if (scene === 'full') {
    // 老的全屏遮罩模式：背景（含其他卡片）虚化 + 变暗，窗口固定在正中
    return backdrop(true) +
      '<div class="sc-scrim on"></div>' +
      win({ x: 220, y: 135, w: 460, h: 430, mode: 'full', file: 'chapter-g1.md' })
  }
  if (scene === 'doc') {
    return backdrop() +
      win({ x: 20, y: 30, w: 460, h: 560, tab: 'doc', dirty: true, file: 'chapter-g1.md', doc: DOC_TEXT }) +
      win({ x: 500, y: 30, w: 460, h: 560, tab: 'doc', dirty: false, file: 'node-n2.md', title: '节点二', type: '节点', doc: '节点二的文档：这里放备注。\n', colors: TALK_COLORS })
  }
  if (scene === 'talk') {
    // 台词 / 旁白：首行带全角冒号 + 续行对齐 + 名字着色 + 旁白缩进 + 右键人物菜单
    return backdrop() +
      win({
        x: 20, y: 20, w: 620, h: 600, tab: 'doc', dirty: true, file: 'node-n1.md',
        title: '节点一', type: '节点', role: '勿忘我', menu: true, menuX: 690, menuY: 150,
        doc: TALK_TEXT, colors: TALK_COLORS,
      })
  }
  return null
}

function buildHtml(tokenCss, scene) {
  const css = fs.readFileSync(path.join(PKG, 'src', '10-css.js'), 'utf8')
  const a = css.indexOf('`') + 1
  const b = css.lastIndexOf('`')
  if (a <= 0 || b <= a) throw new Error('src/10-css.js: 找不到 CSS 模板串')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>dsh-script-cards visual · ${scene}</title>
<style>
${tokenCss}
html,body{margin:0;padding:0;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif}
.sc-wrap{height:100vh}
${css.slice(a, b)}
</style></head>
<body ${THEME === 'dark' ? 'data-ds-dark-theme' : ''}>
<div class="sc-wrap"><div class="sc-board"><div class="sc-canvas" style="position:relative;height:100vh">
${scene === 'canvas' ? canvasMarkup() : sceneMarkup(scene)}
</div></div></div>
<script>
${PROBE_SCRIPT}
</script>
</body></html>`
}

function canvasMarkup() {
  return `
  <div class="sc-stage" style="transform:translate(0px,0px) scale(${ZOOM})">
    <div class="sc-dots"></div>
    <svg class="sc-edges" width="8000" height="8000">
      <defs>
        <marker id="sc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L6,3 z" class="sc-arrowhead"></path></marker>
        <marker id="sc-arrow-on" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L6,3 z" class="sc-arrowhead-on"></path></marker>
      </defs>
      <g transform="translate(${EDGE_PAD},${EDGE_PAD})">
        <g><path class="sc-edgehit" d="${edgePlain}"></path><path class="sc-edge" d="${edgePlain}" marker-end="url(#sc-arrow)"></path></g>
        <g><path class="sc-edgehit" d="${edgeOn}"></path><path class="sc-edge on" d="${edgeOn}" marker-end="url(#sc-arrow-on)"></path></g>
        <g><path class="sc-edgehit" d="${edgeInto}"></path><path class="sc-edge" d="${edgeInto}" marker-end="url(#sc-arrow)"></path></g>
        <path class="sc-edge temp" d="${edgeTemp}"></path>
      </g>
    </svg>
    <!-- 连线标签必须在 svg **外面**。放进 <g> 里的话，浏览器不渲染 SVG 里的 HTML 元素
         （0×0、点不到），可是静态 HTML 看不出这一点 —— HTML 解析器遇到 <g> 里的 <div>
         会直接把它弹出 svg，于是页面照样正常。React 走的是 createElementNS，才会中招。
         所以这里照真实结构摆，并且下面用探测断言它不是 svg 的后代、量得到、点得到。 -->
    <div class="sc-elabel" id="probe-label" style="left:${(outPoint(A, -1, 0).x + inPoint(B).x) / 2}px;top:${(outPoint(A, -1, 0).y + inPoint(B).y) / 2}px" data-edge="lbl1" title="点一下改名字：顺流而下">顺流而下</div>
    <!-- 起名字的输入框与标签一样，DOM 上在卡片**前面**。真机上线的中点常常正好落在一张
         卡片底下，所以这里摆一张压住中点的卡片、再摆一个压在卡片上的输入框：
         光有 z-index 才看得全（用户报的「输入框图层在最底下，看不全」）。 -->
    <div class="sc-card" id="probe-lblcover" style="left:250px;top:64px;width:150px;height:56px"><div class="sc-cardsum">压住连线中点的卡片</div></div>
    <input class="sc-elabel sc-elabeledit" id="probe-edit" style="left:126px;top:289px" value="若答应">
    ${card(A, '<div class="sc-cardrow"><span class="sc-cardname">节点甲</span><span class="sc-cardwhen">第4天</span></div><div class="sc-cardsum">节点甲的简介。</div>', '<div class="sc-port in"></div><div class="sc-port out"></div>')}
    ${card(B, '<div class="sc-cardrow"><span class="sc-cardname">分歧节点甲</span></div><div class="sc-cardsum">这里要分岔。</div>',
      '<div class="sc-choices" style="top:' + choiceTop(B.h, N) + 'px">' + optionRows + '<button class="sc-choiceadd">＋ 选项</button></div><div class="sc-port in"></div>')}
    ${card(C, '<div class="sc-cardkind">结果</div><div class="sc-cardmono">结果甲</div>', '<div class="sc-port in"></div>')}
    ${card(D, '<div class="sc-cardkind">条件</div><div class="sc-cardmono">条件甲</div>', '<div class="sc-port in"></div><div class="sc-port out"></div>')}
    <div class="sc-tagwrap" style="position:absolute;left:240px;top:520px;width:180px">
      <div class="sc-tags"><span class="sc-tag">共通</span><span class="sc-tag">主线</span><span class="sc-tag">日常</span><span class="sc-tag">很长的一个标签</span></div>
      <div class="sc-tagbar"><div class="sc-tagthumb" style="left:0;width:40%"></div></div>
    </div>
  </div>
  <!-- 对话框：宽度必须和展开的卡片一致（460 = PANEL_W），里面 width:100% 的输入框
       不许撑出横向滚动条（那是 box-sizing:border-box 的活）—— 用户报的「输入框和展开的
       卡片宽度不一样，下面还有一个滑条」。静态页面里就能量出来。 -->
  <div class="sc-modal" style="position:absolute;left:400px;top:40px;right:auto;bottom:auto;padding:0;background:transparent">
    <div class="sc-modalbox" id="probe-modalbox">
      <div class="sc-modalh"><h3>编辑卡片</h3></div>
      <div class="sc-modalb" id="probe-modalb">
        <div class="sc-frow"><label class="sc-field"><span class="sc-lbl">简介</span><input class="sc-inp full" value="卡片最下面显示的一行"></label></div>
        <div class="sc-frow"><label class="sc-field"><span class="sc-lbl">标签</span><input class="sc-inp wide" value="共通, 主线"></label></div>
      </div>
      <div class="sc-modalf"><button class="sc-btn">取消</button><button class="sc-btn sc-btn-on">保存</button></div>
    </div>
  </div>`
}

// 探针脚本：canvas 那一幕走 __probe（老的、逐元素的计算样式断言）；
// 新那几幕走 __probeAll（浮窗 / 遮罩 / 文档编辑器的计算样式）。
const PROBE_SCRIPT = `
window.__probe = function () {
  const pick = function (el, props) {
    const cs = getComputedStyle(el)
    const o = {}
    for (const p of props) o[p] = cs.getPropertyValue(p)
    const r = el.getBoundingClientRect()
    o.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
    return o
  }
  const out = { theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light', items: [] }
  document.querySelectorAll('.sc-port').forEach(function (el, i) {
    out.items.push({ what: 'port#' + i + ' ' + el.className, v: pick(el, ['width', 'height', 'border-radius', 'border-top-width', 'border-top-color', 'background-color', 'opacity']) })
  })
  document.querySelectorAll('.sc-edge').forEach(function (el, i) {
    out.items.push({ what: 'edge#' + i + ' ' + el.className, v: pick(el, ['stroke', 'stroke-width', 'opacity', 'fill']) })
  })
  const col = document.querySelector('.sc-choices')
  if (col) out.items.push({ what: 'choices', v: pick(col, ['top', 'left', 'width']) })
  // 选项列的**实测**高度：自动排列的占位（卡片 + 选项列）就是按它算的，
  // 公式（n 行 × 30 + 间距 × 5 + ＋按钮 30）必须和真布局对得上。
  out.colHeight = col ? Math.round(col.getBoundingClientRect().height) : null
  out.colRows = document.querySelectorAll('.sc-choice').length
  const lbl = document.getElementById('probe-label')
  if (lbl) {
    const v = pick(lbl, ['position', 'pointer-events', 'background-color', 'color', 'font-size', 'opacity', 'z-index'])
    v.namespaceURI = lbl.namespaceURI
    // 自己是不是 svg 的后代？是的话浏览器不会画它（连线标签踩过的坑）
    let p = lbl.parentNode
    v.insideSvg = false
    while (p && p.nodeType === 1) { if (String(p.nodeName).toLowerCase() === 'svg') { v.insideSvg = true; break } p = p.parentNode }
    const r = lbl.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    v.hitAtCenter = hit ? (hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : String(hit.className)) : null
    v.hitIsLabel = hit === lbl
    // 中点下面有没有压着一张卡片（有，displacement 才算真的测了层级）
    const cover = document.getElementById('probe-lblcover')
    if (cover) {
      const cr = cover.getBoundingClientRect()
      v.cardOverlap = cr.left <= cx && cr.right >= cx && cr.top <= cy && cr.bottom >= cy
      v.coverZ = getComputedStyle(cover).zIndex
    }
    out.items.push({ what: 'elabel', v: v })
  } else {
    out.items.push({ what: 'elabel', v: { missing: true } })
  }
  // 起名字的输入框：必须压在卡片上面（它 DOM 顺序在卡片前面），否则只露半个
  const ed = document.getElementById('probe-edit')
  if (ed) {
    const v2 = pick(ed, ['position', 'z-index', 'width', 'height', 'cursor'])
    const r2 = ed.getBoundingClientRect()
    const hit2 = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2)
    v2.hitAtCenter = hit2 ? (hit2.className && hit2.className.baseVal !== undefined ? hit2.className.baseVal : String(hit2.className)) : null
    v2.hitIsEdit = hit2 === ed
    out.items.push({ what: 'elabeledit', v: v2 })
  } else {
    out.items.push({ what: 'elabeledit', v: { missing: true } })
  }
  // 对话框：宽度对不对、里面的输入框有没有撑出横向滚动条
  const mbox = document.getElementById('probe-modalbox')
  const mbody = document.getElementById('probe-modalb')
  if (mbox && mbody) {
    const inp = mbody.querySelector('.sc-inp.full')
    const full = inp ? inp.getBoundingClientRect() : null
    const body = mbody.getBoundingClientRect()
    out.modal = {
      boxWidth: Math.round(mbox.getBoundingClientRect().width),
      bodyClient: mbody.clientWidth,
      bodyScroll: mbody.scrollWidth,
      inputOuter: full ? Math.round(full.width) : null,
      inputOverflows: !!full && (full.left < body.left - 0.5 || full.right > body.right + 0.5),
      inputBoxSizing: inp ? getComputedStyle(inp).boxSizing : null,
    }
  }
  // 标签条：原生滚动条藏干净了没有
  const tags = document.querySelector('.sc-tags')
  if (tags) {
    const cs = getComputedStyle(tags)
    out.tags = {
      height: Math.round(tags.getBoundingClientRect().height),
      scrollbarWidth: cs.scrollbarWidth,
      overflowX: cs.overflowX,
      scrollable: tags.scrollWidth > tags.clientWidth,
      // 拖动时不许选中文字（一拖就变拖选是那次崩溃的入口）
      userSelect: cs.userSelect,
      cursor: cs.cursor,
    }
  }
  return out
}

// 真机上这一步是 92-doc.js 里那个 effect：textarea 常驻一根滚动条（overflow-y:scroll），
// 那几像素会占掉正文宽度，高亮层没有滚动条 —— 所以按**实测**滚动条宽度给高亮层补右内边距，
// 两层的可用宽度才一样（差一点折行位置就错开）。静态探针页没有 React，这里照做一遍。
window.__scenePrep = function () {
  document.querySelectorAll('.sc-dochlwrap').forEach(function (wrap) {
    const area = wrap.querySelector('.sc-docarea')
    const hl = wrap.querySelector('.sc-dochl')
    if (!area || !hl) return
    const sb = Math.max(0, (area.offsetWidth || 0) - (area.clientWidth || 0))
    hl.style.paddingRight = (10 + sb) + 'px'
  })
}

// 浮窗 / 遮罩 / 文档编辑器：量的是这次新加的界面。截图之外还得能自己判断
// 「标题栏能不能拖、手柄是不是缩放手柄、遮罩盖住没有、文档输入框是不是等宽又够高」。
window.__probeAll = function () {
  const pick = function (el, props) {
    const cs = getComputedStyle(el)
    const o = {}
    for (const p of props) o[p] = cs.getPropertyValue(p)
    const r = el.getBoundingClientRect()
    o.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
    return o
  }
  const out = { scene: document.title.split('· ').pop(), theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light', windows: [] }
  document.querySelectorAll('.sc-expand').forEach(function (el) {
    const v = pick(el, ['border-radius', 'background-color', 'z-index', 'box-shadow', 'overflow'])
    v.cls = el.className
    v.title = (el.querySelector('h3') || {}).textContent || ''
    const head = el.querySelector('.sc-expandh')
    if (head) {
      const h = pick(head, ['cursor', 'user-select', '-webkit-user-select', 'touch-action'])
      h.titleText = (head.querySelector('h3') || {}).textContent || ''
      h.buttons = Array.prototype.map.call(head.querySelectorAll('button'), function (b) { return b.textContent || '[图钉]' })
      v.head = h
    }
    const tabs = el.querySelectorAll('.sc-tab')
    v.tabs = Array.prototype.map.call(tabs, function (b) { return (b.className.indexOf('on') !== -1 ? '*' : '') + b.textContent })
    const grip = el.querySelector('.sc-expandgrip')
    if (grip) v.grip = pick(grip, ['cursor', 'width', 'height', 'position'])
    const area = el.querySelector('.sc-docarea')
    if (area) {
      const d = pick(area, ['font-family', 'font-size', 'line-height', 'resize', 'border-top-width', 'white-space', 'padding-left', 'padding-right', 'color', 'caret-color', 'overflow-y'])
      d.clientHeight = area.clientHeight
      d.scrollHeight = area.scrollHeight
      d.clientWidth = area.clientWidth
      d.text = area.value.slice(0, 24)
      d.fullText = area.value
      v.area = d
    }
    // 两层排版是否真的逐项一致：同一条规则出来的值必须一字不差，
    // 再用「可用正文宽度」和 scrollHeight 做一次交叉验证（折行位置一致＝行数一致）。
    const hl = el.querySelector('.sc-dochl')
    if (area && hl) {
      const h = pick(hl, ['font-family', 'font-size', 'line-height', 'white-space', 'word-break', 'padding-left', 'padding-right', 'overflow'])
      h.clientWidth = hl.clientWidth
      h.scrollHeight = hl.scrollHeight
      v.hl = h
      const pad = (el2, side) => parseFloat(el2['padding-' + side]) || 0
      v.typeMatch = {
        fontFamily: h['font-family'] === v.area['font-family'],
        fontSize: h['font-size'] === v.area['font-size'],
        lineHeight: h['line-height'] === v.area['line-height'],
        paddingLeft: pad(h, 'left') === pad(v.area, 'left'),
        whiteSpace: h['white-space'] === v.area['white-space'],
        textWidth: Math.abs((v.area.clientWidth - pad(v.area, 'left') - pad(v.area, 'right')) -
          (h.clientWidth - pad(h, 'left') - pad(h, 'right'))) <= 1,
        lines: Math.abs((v.area.scrollHeight || 0) - (h.scrollHeight || 0)) <= 1,
      }
      v.names = Array.prototype.map.call(el.querySelectorAll('.sc-docname'), function (sp) {
        // 续行那个只有冒号的一段也算 .sc-docname，但它不是「名字」，这里排掉
        if (sp.textContent === '：') return null
        return { text: sp.textContent, color: getComputedStyle(sp).color, inline: sp.getAttribute('style') || '' }
      }).filter(Boolean)
      // 续行那个「对齐的冒号」：文本、颜色、以及它前面那串全角空格的宽度
      v.colons = Array.prototype.map.call(el.querySelectorAll('.sc-docname'), function (sp) {
        if (sp.textContent !== '：') return null
        const prev = sp.previousElementSibling
        return {
          color: getComputedStyle(sp).color,
          pad: prev ? prev.textContent : '',
          left: Math.round(sp.getBoundingClientRect().left),
        }
      }).filter(Boolean)
      v.quiet = Array.prototype.map.call(el.querySelectorAll('.sc-docquiet'), function (sp) {
        return { text: sp.textContent, color: getComputedStyle(sp).color }
      })
    }
    const st = el.querySelector('.sc-docstate')
    if (st) { const s = pick(st, ['color', 'font-family']); s.text = st.textContent; v.state = s }
    const roleEl = el.querySelector('.sc-docrole')
    if (roleEl) { const r = pick(roleEl, ['color', 'border-radius', 'font-size']); r.text = roleEl.textContent; v.role = r }
    const path = el.querySelector('.sc-docpath')
    if (path) v.pathText = path.textContent
    const pin = el.querySelector('.sc-expandb.on')
    if (pin) v.pin = pick(pin, ['color'])
    const dots = el.parentNode ? el.parentNode.querySelectorAll('.sc-docdot') : []
    v.docDots = dots.length
    out.windows.push(v)
  })
  document.querySelectorAll('.sc-scrim').forEach(function (el) {
    out.scrim = pick(el, ['position', 'opacity', 'background-color', 'pointer-events', 'z-index', 'inset'])
  })
  const stage = document.querySelector('.sc-stage')
  if (stage) out.stage = pick(stage, ['filter', 'pointer-events'])
  // 文档里右键弹出来的人物菜单：它挂在浮窗**里面**，而 .sc-expandbody 是 overflow:hidden ——
  // position:fixed 不受它裁（祖先没有 transform），但这一点必须在真 CSS 下量一次：
  // 用 elementFromPoint 看菜单项中心点到的到底是不是菜单项。
  const menuEl = document.querySelector('.sc-menu')
  if (menuEl) {
    const m = pick(menuEl, ['position', 'z-index', 'background-color', 'min-width'])
    const item = menuEl.querySelector('.sc-menuitem') || menuEl.querySelector('.sc-swatch') || menuEl.querySelector('input')
    if (item) {
      const ir = item.getBoundingClientRect()
      const hit = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2)
      m.firstItem = item.textContent
      m.hitIsItem = !!hit && (hit === item || item.contains(hit) === true)
    }
    m.inputInside = !!menuEl.querySelector('.sc-menuinput')
    m.swatches = menuEl.querySelectorAll('.sc-swatch').length
    m.items = menuEl.querySelectorAll('.sc-menuitem').length
    out.menu = m
  }
  // 透明文字下的选区：实心底色会把底下的彩字整个盖住，所以那条 ::selection 必须存在
  // 且是半透明的（computed 里量不到，就查样式表里有没有这条规则）。
  out.selection = (function () {
    let found = ''
    for (const sheet of Array.prototype.slice.call(document.styleSheets)) {
      let rules = []
      try { rules = Array.prototype.slice.call(sheet.cssRules) } catch (e) { continue }
      for (const r of rules) {
        if (String(r.selectorText || '').indexOf('.sc-docarea::selection') !== -1) found = String(r.style.background || r.style.backgroundColor || '')
      }
    }
    return found
  })()
  // 方片页那一幕：人物卡的标题有没有真的染上角色色（.sc-tile.dye + --sc-accent）
  out.tiles = Array.prototype.map.call(document.querySelectorAll('.sc-tile'), function (el) {
    const title = el.querySelector('.sc-tiletitle')
    const cs = getComputedStyle(el)
    const tcs = title ? getComputedStyle(title) : null
    return {
      title: title ? title.textContent : '',
      dyed: el.className.indexOf('dye') !== -1,
      accent: cs.getPropertyValue('--sc-accent').trim(),
      titleColor: tcs ? tcs.color : '',
      bodyColor: cs.color,
    }
  })
  // 引用卡那一幕：角标在不在、有没有连线圆点、强调色是不是角色色
  out.refs = Array.prototype.map.call(document.querySelectorAll('.sc-refcard'), function (el) {
    const cs = getComputedStyle(el)
    const name = el.querySelector('.sc-cardname')
    const badge = el.querySelector('.sc-refbadge')
    return {
      key: el.getAttribute('data-key') || '',
      title: name ? name.textContent : '',
      badge: !!badge,
      badgeText: badge ? badge.textContent : '',
      ports: el.querySelectorAll('.sc-port').length,
      accent: cs.getPropertyValue('--sc-accent').trim(),
      borderColor: cs.borderTopColor,
      borderStyle: cs.borderTopStyle,
      nameColor: name ? getComputedStyle(name).color : '',
      bg: cs.backgroundColor,
    }
  })
  const dr = document.querySelector('.sc-drawer')
  out.drawer = dr
    ? {
      open: true,
      width: Math.round(dr.getBoundingClientRect().width),
      heads: Array.prototype.map.call(dr.querySelectorAll('.sc-drawerhead2'), function (h) { return h.textContent }),
      items: dr.querySelectorAll('.sc-draweritem').length,
      right: Math.round(dr.getBoundingClientRect().right),
      viewportRight: window.innerWidth,
      // 抽屉**整体**就是滚动容器（滚轮悬停在任何位置都滚它）；头部 + 筛选框 sticky
      wheel: dr.getAttribute('data-wheel') || '',
      overflowY: getComputedStyle(dr).overflowY,
      sticky: (function () {
        const st = dr.querySelector('.sc-drawersticky')
        return st ? getComputedStyle(st).position : ''
      })(),
    }
    : { open: false }
  // 独立对象（文本框 / 矩形方框）与分组悬停时那层淡背景
  out.objects = Array.prototype.map.call(document.querySelectorAll('.sc-obj'), function (el) {
    const cs = getComputedStyle(el)
    const body = el.querySelector('.sc-objbody')
    const grip = el.querySelector('.sc-objgrip')
    return {
      key: el.getAttribute('data-key') || '',
      kind: el.getAttribute('data-obj') || '',
      accent: cs.getPropertyValue('--sc-accent').trim(),
      bg: cs.backgroundColor,
      borderStyle: cs.borderTopStyle,
      text: body ? body.textContent : '',
      textColor: body ? getComputedStyle(body).color : '',
      grip: grip
        ? {
          w: Math.round(grip.getBoundingClientRect().width),
          h: Math.round(grip.getBoundingClientRect().height),
          cursor: getComputedStyle(grip).cursor,
        }
        : null,
    }
  })
  out.groupBg = (function () {
    const g = document.querySelector('.sc-groupbg')
    if (!g) return null
    const cs = getComputedStyle(g)
    return {
      bg: cs.backgroundColor,
      borderStyle: cs.borderTopStyle,
      pointerEvents: cs.pointerEvents,
      z: cs.zIndex,
    }
  })()
  // 谁压在谁上面：层序（从下往上）＝ 有颜色的方框 → 文字 → 其他所有卡片。
  // 文本框中心在方框里（摸到文本框＝文字比方框高）；方框露在外面的那一条摸到方框本身；
  // 三层叠在一起的那一点必须摸到卡片（卡片在最上面）。
  out.overlap = (function () {
    const t = document.querySelector('.sc-objtext')
    const r = document.querySelector('.sc-objrect')
    if (!t || !r) return null
    const tb = t.getBoundingClientRect()
    const rb = r.getBoundingClientRect()
    const clsOf = function (el) { return el ? String(el.className || '') : '' }
    const at = function (x, y) { return clsOf(document.elementFromPoint(x, y)) }
    return {
      onText: at(tb.left + tb.width / 2, tb.top + tb.height / 2),
      onRect: at(rb.left + 6, rb.top + rb.height - 6),
      // 这个点在方框 ∩ 文字 ∩ 卡片 里（卡片只盖住方框右边一截）
      onCardOver: at(rb.left + rb.width - 40, tb.top + 12),
    }
  })()
  // 卡片那条：时间是不是单独一行、右下角有没有缩放手柄、对齐辅助线是不是细线
  out.cardBits = (function () {
    const c = document.querySelector('.sc-card')
    if (!c) return null
    const when = c.querySelector('.sc-cardwhenline')
    const row = c.querySelector('.sc-cardrow')
    const grip = c.querySelector('.sc-cardgrip')
    const gd = document.querySelector('.sc-guide')
    const gcs = gd ? getComputedStyle(gd) : null
    return {
      whenText: when ? when.textContent : '',
      rowText: row ? row.textContent : '',
      whenBelowRow: !!(when && row && when.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1),
      grip: grip
        ? { w: Math.round(grip.getBoundingClientRect().width), cursor: getComputedStyle(grip).cursor }
        : null,
      guide: gd ? { w: Math.round(gd.getBoundingClientRect().width), h: Math.round(gd.getBoundingClientRect().height), pointer: gcs.pointerEvents } : null,
    }
  })()
  // 底部状态栏：提示整块最多两行、超出的**从最上面往下藏**；右边的按钮永远完整可见。
  out.status = (function () {
    const bar = document.querySelector('.sc-status')
    if (!bar) return null
    const help = bar.querySelector('.sc-statushelp')
    const br = bar.getBoundingClientRect()
    const hr = help ? help.getBoundingClientRect() : null
    const box = function (el) {
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }
    }
    return {
      bar: box(bar),
      help: help
        ? Object.assign(box(help), {
          clientH: help.clientHeight,
          scrollH: help.scrollHeight,
          overflow: getComputedStyle(help).overflow,
        })
        : null,
      hints: help
        ? Array.prototype.map.call(help.querySelectorAll('span'), function (s) {
          return Object.assign({ text: s.textContent.slice(0, 6) }, box(s))
        })
        : [],
      ctrl: Array.prototype.map.call(bar.querySelectorAll('.sc-btn, .sc-navbtn'), function (b) {
        return Object.assign({ text: b.textContent }, box(b))
      }),
    }
  })()
  out.bodyScroll = [document.documentElement.scrollWidth, window.innerWidth]
  // 缩略图那一幕：牌子在不在画布里面、标题是不是真的封在两行、宽度有没有跟着卡片的长宽比走、
  // 这一层是不是不透明（不透明才谈得上「只显示标题」—— 否则底下的画布会透上来）。
  out.mini = (function () {
    const ov = document.querySelector('.sc-mini')
    if (!ov) return null
    const orb = ov.getBoundingClientRect()
    const cv = ov.parentNode.getBoundingClientRect()
    const status = document.querySelector('.sc-status')
    return {
      overlay: {
        bg: getComputedStyle(ov).backgroundColor,
        z: getComputedStyle(ov).zIndex,
        w: Math.round(orb.width),
        h: Math.round(orb.height),
      },
      canvas: { w: Math.round(cv.width), h: Math.round(cv.height) },
      statusTop: status ? Math.round(status.getBoundingClientRect().top - cv.top) : null,
      edges: ov.querySelectorAll('.sc-miniedge').length,
      objs: Array.prototype.map.call(ov.querySelectorAll('.sc-miniobj'), function (el) {
        const r = el.getBoundingClientRect()
        return {
          kind: el.getAttribute('data-key') === 'obj/r1' ? 'rect' : 'text',
          bg: getComputedStyle(el).backgroundColor,
          borderStyle: getComputedStyle(el).borderTopStyle,
          rect: [Math.round(r.left - cv.left), Math.round(r.top - cv.top), Math.round(r.width), Math.round(r.height)],
        }
      }),
      tiles: Array.prototype.map.call(ov.querySelectorAll('.sc-minitile'), function (el) {
        const t = el.querySelector('.sc-minititle')
        const r = el.getBoundingClientRect()
        const tr = t ? t.getBoundingClientRect() : null
        const cs = t ? getComputedStyle(t) : null
        const lh = cs ? (parseFloat(cs.lineHeight) || 0) : 0
        return {
          key: el.getAttribute('data-key') || '',
          text: t ? t.textContent : '',
          ratio: r.height ? r.width / r.height : 0,
          rect: [Math.round(r.left - cv.left), Math.round(r.top - cv.top), Math.round(r.width), Math.round(r.height)],
          padY: cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0,
          clamp: cs ? (cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp')) : '',
          overflow: cs ? cs.overflow : '',
          lineHeight: lh,
          lines: lh && tr ? tr.height / lh : 0,
          titleH: tr ? Math.round(tr.height) : 0,
          // 标题整块（含两行）有没有落在牌子里面 —— 越出去就是被裁了一半
          titleInside: !!tr && tr.top >= r.top - 1 && tr.bottom <= r.bottom + 1,
        }
      }),
    }
  })()
  return out
}
`

// ── 无头浏览器：CDP over ws（Node 22+ 自带 WebSocket，零依赖） ────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 同步睡一小会儿（cleanup 是同步函数，收尾时要用）。 */
function nap(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch (e) { /* 忽略 */ }
}

/**
 * 开工前扫一遍临时目录：以前杀不干净留下的 profile 目录（一小时前的）一并清掉，
 * 别让 C 盘上的临时目录一直长。
 */
function sweepOldProfiles() {
  let n = 0
  try {
    const dir = os.tmpdir()
    for (const name of fs.readdirSync(dir)) {
      if (name.indexOf('dsh-cards-visual-') !== 0) continue
      const p = path.join(dir, name)
      try {
        if (Date.now() - fs.statSync(p).mtimeMs < 3600 * 1000) continue
        fs.rmSync(p, { recursive: true, force: true })
        n++
      } catch (e) { /* 还占着就算了 */ }
    }
  } catch (e) { /* 忽略 */ }
  return n
}

/**
 * 一幕到底：起一个无头浏览器、渲染、探测、截图。
 * 连开十几幕时偶发「devtools 端口没响应」（实测十一幕里第 10 幕栽过一次），
 * 所以外面套一层重试 —— 这是开发工具，别让它假红。
 */
async function shoot(browser, htmlFile, outPng, size, scene) {
  let last = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await shootOnce(browser, htmlFile, outPng, size, scene)
    } catch (e) {
      last = e
      console.error('   (第 ' + (attempt + 1) + ' 次起浏览器失败，重试一次：' + (e && e.message) + ')')
      await sleep(1000)
    }
  }
  throw last
}

async function shootOnce(browser, htmlFile, outPng, size, scene) {
  const port = 9200 + Math.floor(Math.random() * 400)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cards-visual-'))
  const dims = size || [900, 700]
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--window-size=' + dims[0] + ',' + dims[1], '--force-device-scale-factor=' + DPR, '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore', detached: true })

  // 收尾：Windows 上 process.kill(-pid)（进程组）不好使，直接子进程一死，渲染 / GPU 那几个
  // 子进程会变成孤儿继续占着 profile 目录，rmSync 就删不掉 —— 实测临时目录里攒下过 238 个
  // Edge profile（C 盘本来就紧），而且攒多了新开的那幕会起不来（「devtools 端口没响应」）。
  // 所以 Windows 上先用 taskkill /T 整棵树，再删；删不掉就等一会儿重试。
  const cleanup = () => {
    if (child.pid) {
      if (process.platform === 'win32') {
        try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch (e) { /* 忽略 */ }
      }
      try { process.kill(-child.pid) } catch (e) { try { child.kill() } catch (e2) { /* 忽略 */ } }
    }
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) { /* 文件还被占着 */ }
      if (!fs.existsSync(profile)) return
      nap(250)
    }
  }

  let version = null
  for (let i = 0; i < 120 && !version; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version')
      if (r.ok) version = await r.json()
    } catch (e) { /* 还没起来 */ }
    if (!version) await sleep(150)
  }
  if (!version) { cleanup(); throw new Error('无头浏览器没起来（devtools 端口没响应）') }

  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) { cleanup(); throw new Error('没有可用的页面 target') }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  const events = new Map()
  let seq = 0
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
      else p.resolve(msg.result)
      return
    }
    const l = events.get(msg.method)
    if (l) for (const fn of l.slice()) fn(msg.params)
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws error'))) })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const once = (method) => new Promise((resolve) => {
    const l = events.get(method) || []
    l.push(function fn(p) { events.set(method, (events.get(method) || []).filter((x) => x !== fn)); resolve(p) })
    events.set(method, l)
  })

  await send('Page.enable')
  await send('Runtime.enable')
  const loaded = once('Page.loadEventFired')
  await send('Page.navigate', { url: 'file:///' + htmlFile.replace(/\\/g, '/').replace(/^\//, '') })
  // 等 load，但**不能无限等**：浏览器半死的时候这个事件可能永远不来，
  // 挂在这儿比报错难受得多（实测卡过一次，整轮跑不完）。
  await Promise.race([loaded, sleep(15000).then(() => { throw new Error('页面 load 事件没等到（15s）') })])
  await sleep(250)

  let probe = null
  if (PROBE) {
    // 先补上真机里那个滚动条宽度补偿（见 __scenePrep），再量
    if (scene) await send('Runtime.evaluate', { expression: '(window.__scenePrep && window.__scenePrep()) || 0', returnByValue: true })
    const expr = scene ? 'JSON.stringify(window.__probeAll())' : 'JSON.stringify(window.__probe())'
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    probe = r.result && r.result.value ? JSON.parse(r.result.value) : null
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(outPng), { recursive: true })
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'))
  ws.close()
  cleanup()
  return probe
}

// ── main ────────────────────────────────────────────────────────────────────
const asar = findAsar()
const tokenCss = asar ? tokensFromAsar(asar) : fallbackCss(THEME)
if (!asar) console.log('! 没找到 DSH 的 app.asar，用内置兜底色（--asar <路径> 可以指定）')

const browser = findBrowser()
if (!browser) {
  console.error('找不到 Edge/Chrome。用 --edge <路径> 指定；这一步是可选的开发工具，不影响 npm run check。')
  process.exit(2)
}
console.log('browser: ' + browser)
console.log('tokens : ' + (asar || '内置兜底'))
const swept = sweepOldProfiles()
if (swept) console.log('清理   : ' + swept + ' 个上一轮没删掉的浏览器 profile')

const scenes = has('scene') ? [SCENE] : SCENES
let bad = 0

for (const scene of scenes) {
  const htmlFile = path.join(os.tmpdir(), 'dsh-cards-visual-' + scene + '-' + THEME + '-' + ZOOM + '.html')
  fs.writeFileSync(htmlFile, buildHtml(tokenCss, scene))
  const outPng = OUT || path.join(PKG, '.visual', scene + '-' + THEME + '.png')
  const probe = await shoot(browser, htmlFile, outPng, WIN_SIZE[scene], scene === 'canvas' ? null : scene)
  console.log('截图   : ' + outPng + '  (' + fs.statSync(outPng).size + ' bytes, scene=' + scene + ', theme=' + THEME + ', zoom=' + ZOOM + ', dpr=' + DPR + ')')
  if (!probe) continue
  if (scene === 'canvas') {
    // 报告同时落一份 JSON，方便再拿它去放大某个元素的像素（排查圆点/描边这类栅格化问题）
    fs.writeFileSync(path.join(path.dirname(outPng), 'probe.json'), JSON.stringify(probe, null, 1))
    console.log(JSON.stringify(probe, null, 1))
    // 这两条是「画布能不能看」的底线，顺手当断言用
    const flat = probe.items.filter((x) => x.what.indexOf('edge#') === 0)
    const transparent = flat.filter((x) => !x.v.stroke || x.v.stroke === 'none')
    if (transparent.length) console.error('!! 有 ' + transparent.length + ' 条连线的 stroke 是 none —— 线根本画不出来')
    const odd = probe.items.filter((x) => x.what.indexOf('port#') === 0 && x.v['border-top-width'] === '0px')
    if (odd.length) console.error('!! 有 ' + odd.length + ' 个圆点没有描边 —— 大概率是颜色变量没解析出来')
    // 连线标签：画得出来（有尺寸）、在 svg 外面、点得到。三条缺一条，用户就改不了连线的名字。
    const lbl = probe.items.filter((x) => x.what === 'elabel')[0]
    const lblBad = !lbl || lbl.v.missing || lbl.v.insideSvg || !lbl.v.rect[2] || !lbl.v.rect[3] || !lbl.v.hitIsLabel
    if (lblBad) console.error('!! 连线标签不可用 ' + JSON.stringify(lbl && lbl.v) + ' —— 标签要是 svg 的后代就画不出来（0×0、点不到）')
    // 选项列的真实高度 = n*30 + (n-1)*5 + 5 + 30（自动排列按它让位）
    const wantCol = probe.colRows * 30 + Math.max(0, probe.colRows - 1) * 5 + 5 + 30
    const colBad = probe.colHeight !== wantCol
    if (colBad) console.error('!! 选项列实测高度 ' + probe.colHeight + 'px，按公式应当是 ' + wantCol + 'px —— 自动排列的占位是照公式算的')
    // 对话框：宽度和展开的卡片一致（460），里面的输入框不许撑出横向滚动条
    const m = probe.modal || {}
    const modalBad = m.boxWidth !== 460 || m.inputBoxSizing !== 'border-box' || m.inputOverflows || (m.bodyScroll || 0) > (m.bodyClient || 0) + 1
    if (modalBad) console.error('!! 对话框有问题 ' + JSON.stringify(m) + ' —— 宽度要和展开的卡片一样（460），输入框要 border-box，别撑出横向滚动条')
    // 标签条：原生滚动条必须藏干净（scrollbar-width:none），但它自己还得能滑
    const t = probe.tags || {}
    const tagsBad = t.overflowX !== 'auto' || t.scrollbarWidth !== 'none' || !t.scrollable ||
      t.userSelect !== 'none' || t.cursor !== 'grab'
    if (tagsBad) console.error('!! 标签条有问题 ' + JSON.stringify(t) + ' —— 原生滚动条要藏掉（scrollbar-width:none）、还得能横向滑、拖的时候不能选中文字（user-select:none + cursor:grab）')
    // 层级：线的中点压着一张卡片（真机上常见），标签和它的输入框都必须还在卡片上面，
    // 否则点线浮出来的输入框只露半个 —— 用户报的「输入框图层在最底下，看不全」。
    const ed = probe.items.filter((x) => x.what === 'elabeledit')[0]
    const layerBad = !lbl || lbl.v.missing || !lbl.v.cardOverlap || !lbl.v.hitIsLabel ||
      !ed || ed.v.missing || !ed.v.hitIsEdit
    if (layerBad) console.error('!! 连线上那个输入框被卡片压住了 ' + JSON.stringify({ lbl: lbl && lbl.v, ed: ed && ed.v }) +
      ' —— .sc-elabel 要带 z-index（比卡片高、比展开的大卡片低）')
    if (transparent.length || odd.length || lblBad || colBad || modalBad || tagsBad || layerBad) bad++
    continue
  }
  // 新界面（浮窗 / 钉住多开 / 全屏遮罩 / 文档编辑器）的计算样式断言
  const errs = checkScene(scene, probe)
  for (const e of errs) console.error('!! [' + scene + '] ' + e)
  if (errs.length) bad++
  console.log('探测   : ' + JSON.stringify(probe))
}
if (bad) process.exit(1)

/**
 * 新几幕的断言。它们盯的是「截图上看不出来但一错就白干」的那些点：
 * 标题栏是不是抓手（而且不许选中文字）、手柄是不是缩放手柄、遮罩有没有盖住、
 * 文档输入框是不是等宽又够高（不然写文档等于受刑）。
 */
function checkScene(scene, p) {
  const errs = []
  if (scene === 'mini') {
    // 缩略图：牌子上只留标题（两行封顶）、宽度跟着卡片自己的长宽比、这一层不透明。
    // ⚠ 这一幕证明的是「这样的 DOM + CSS 在浏览器里真的长这样」，不是「App 按这个顺序渲染」
    //（后者由 smoke 的 BA 段走真组件来钉）。
    const m = p.mini
    if (!m) { errs.push('没有找到 .sc-mini（缩略图那一层）'); return errs }
    if (m.tiles.length !== 3) errs.push('牌子 ' + m.tiles.length + ' 块，应当是 3 块')
    if (!(m.edges >= 2)) errs.push('缩略图里的连线只有 ' + m.edges + ' 条')
    if (m.objs.length !== 2) errs.push('独立对象 ' + m.objs.length + ' 块，应当是 2 块（方框 + 文本框）')
    // 不透明才谈得上「只显示标题」：底下的正常画布不许透上来
    const bg = String(m.overlay.bg || '')
    const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(bg)
    if (alpha && Number(alpha[1]) < 0.9) errs.push('缩略图那一层是半透明的（' + bg + '），底下的画布会透上来')
    for (const t of m.tiles) {
      if (!t.text) errs.push('有块牌子没有标题')
      if (t.clamp !== '2') errs.push('牌子「' + t.text.slice(0, 8) + '」的 -webkit-line-clamp 是 ' + t.clamp + '，应当封在两行')
      if (t.overflow !== 'hidden') errs.push('牌子「' + t.text.slice(0, 8) + '」的 overflow 是 ' + t.overflow + '，多出来的字没裁掉')
      if (!t.titleInside) errs.push('牌子「' + t.text.slice(0, 8) + '」的标题越出了牌子（被裁了一半）')
      if (t.lines > 2.2) errs.push('牌子「' + t.text.slice(0, 8) + '」的标题占了 ' + t.lines.toFixed(1) + ' 行，应当最多两行')
      const [tx, ty, tw, th] = t.rect
      if (tx < 0 || ty < 0 || tx + tw > m.canvas.w + 1 || ty + th > m.canvas.h + 1) {
        errs.push('牌子「' + t.text.slice(0, 8) + '」跑出画布了：' + JSON.stringify(t.rect))
      }
      if (m.statusTop !== null && ty + th > m.statusTop + 1) {
        errs.push('牌子「' + t.text.slice(0, 8) + '」压到底部状态栏上了')
      }
    }
    // 长标题那张真的用了两行（不是被压成一行看不见），普通那张至少有一行字
    const long = m.tiles.filter(function (t) { return t.text.length > 12 })[0]
    if (!long) errs.push('没有一块牌子是长标题，量不到「两行」')
    else if (!(long.lines > 1.6)) errs.push('长标题只占了 ' + long.lines.toFixed(1) + ' 行，没用到两行')
    const normal = m.tiles.filter(function (t) { return t.text.length <= 12 })[0]
    if (normal && !(normal.lines >= 0.9)) errs.push('普通牌子的标题一行都没露出来')
    // 宽度跟着卡片自己的长宽比走：加宽过的那张（360×96 → 3.75:1）明显比普通卡（1.39:1）宽
    const wide = m.tiles.filter(function (t) { return t.key === 'card/node-n2.md' })[0]
    const plain = m.tiles.filter(function (t) { return t.key === 'card/node-n1.md' })[0]
    if (!wide || !plain) errs.push('少了用来比长宽比的两块牌子')
    else {
      if (!(wide.ratio > plain.ratio * 2)) {
        errs.push('加宽过的卡片在缩略图里是 ' + wide.ratio.toFixed(2) + ':1，普通卡是 ' + plain.ratio.toFixed(2) + ':1 —— 宽高比没跟着卡片走')
      }
      if (Math.abs(wide.rect[3] - plain.rect[3]) > 1) {
        errs.push('两张牌子的高度不一样（' + wide.rect[3] + ' / ' + plain.rect[3] + '）—— 高度应当由缩小后的卡片高度决定，宽度才按比例走')
      }
    }
    if (p.bodyScroll && p.bodyScroll[0] > p.bodyScroll[1]) errs.push('这一幕把页面撑出横向滚动条了')
    return errs
  }
  if (scene === 'statusbar' || scene === 'statuswide') {
    // 面板一窄，底部这几句提示就换行，整条状态栏要是跟着长高，画布就被往上挤
    // （用户原话：「他在界面缩短的时候会抬高」）。现在提示整块的高度钉在两行以内
    // （.sc-statushelp 的 max-height:33px，加内边距 8 与上边框 1 → 整条 ≤ 42），
    // 超出来的**从最上面往下藏**；右边那几颗按钮在它外面，永远完整。
    const st = p.status
    const BAR_MAX = 33 + 8 + 1
    if (!st) errs.push('没有找到底部状态栏')
    else if (!st.help) errs.push('状态栏里没有 .sc-statushelp（提示整块没套起来，裁不了）')
    else {
      if (st.bar.h > BAR_MAX) errs.push('状态栏长到 ' + st.bar.h + 'px 了（两行以内应当是 ≤ ' + BAR_MAX + '）')
      if (st.help.overflow !== 'hidden') errs.push('提示整块的 overflow 是 ' + st.help.overflow + '，溢出没裁掉')
      const first = st.hints[0]
      const last = st.hints[st.hints.length - 1]
      // ⚠ 不能用 scrollHeight 判断「有没有藏」：溢出在**顶部**，Chromium 把它算不进
      // scrollHeight（实测 scrollH === clientH）。用每个 span 的 rect 去数。
      const hidden = st.hints.filter(function (h) { return h.bottom <= st.help.top + 1 }).length
      if (!(st.help.h >= 15)) errs.push('提示整块高度只有 ' + st.help.h + 'px，一行都没露出来')
      if (scene === 'statusbar') {
        // 窄面板：装不下 → 顶上那几行被藏掉，最下面那行完整留着
        if (!(hidden >= 2)) errs.push('这一幕没测到「藏」：只有 ' + hidden + ' 行提示被藏掉')
        if (!first || !(first.top < st.help.top - 1)) errs.push('最上面那行提示没被藏掉（应当从最上面开始藏）：' + JSON.stringify(first))
        if (!last || last.bottom > st.help.bottom + 1) errs.push('最下面那行提示被裁掉了（应当留住最底下那几行）：' + JSON.stringify(last))
        if (!last || last.top < st.help.top - 1) errs.push('最下面那行提示整行都在可视区外：' + JSON.stringify(last))
      } else {
        // 宽面板：装得下 → 一行都不许藏（别为了「藏」把提示永远裁掉）
        if (hidden !== 0) errs.push('面板够宽却藏了 ' + hidden + ' 行提示')
        for (const h of st.hints) {
          if (h.top < st.help.top - 1 || h.bottom > st.help.bottom + 1) errs.push('提示「' + h.text + '」被裁了：' + JSON.stringify(h))
        }
      }
    }
    if (st) {
      if (!st.ctrl.length) errs.push('状态栏里没有按钮')
      for (const c of st.ctrl) {
        if (c.top < st.bar.top - 1 || c.bottom > st.bar.bottom + 1) {
          errs.push('状态栏里的「' + c.text + '」被裁掉了一部分：' + JSON.stringify(c) + ' / bar ' + JSON.stringify(st.bar))
        }
        // 横向也要在栏里：右下角这几颗（含 2026-10-02 加的「缩略图」）挤出去就等于点不到
        if (c.left < st.bar.left - 1 || c.right > st.bar.right + 1) {
          errs.push('状态栏里的「' + c.text + '」横着挤出栏了：' + JSON.stringify(c) + ' / bar ' + JSON.stringify(st.bar))
        }
      }
    }
    if (p.bodyScroll && p.bodyScroll[0] > p.bodyScroll[1]) errs.push('这一幕把页面撑出横向滚动条了')
    return errs
  }
  if (scene === 'float') {
    if (p.windows.length !== 1) errs.push('浮窗数量 ' + p.windows.length + '，应当是 1')
    const w = p.windows[0] || {}
    if (Math.round((w.rect || [0, 0, 0, 0])[2]) !== 460) errs.push('浮窗宽度 ' + (w.rect || [])[2] + '，应当是 460（PANEL_W）')
    if (!w.head) errs.push('没有标题栏')
    else {
      if (w.head.cursor !== 'move') errs.push('标题栏 cursor=' + w.head.cursor + '，应当是 move（它是抓手）')
      if (w.head['user-select'] !== 'none') errs.push('标题栏 user-select=' + w.head['user-select'] + '，拖动时不许选中文字')
      if (w.head.buttons.length !== 3) errs.push('标题栏按钮 ' + w.head.buttons.length + ' 个，应当有 图钉 / 全屏 / ×')
    }
    if (!w.grip) errs.push('没有缩放手柄')
    else {
      if (w.grip.cursor !== 'nwse-resize') errs.push('手柄 cursor=' + w.grip.cursor + '，应当是 nwse-resize')
      if (w.grip.width !== '16px' || w.grip.height !== '16px') errs.push('手柄尺寸 ' + w.grip.width + '×' + w.grip.height + '，应当是 16×16')
    }
    if (w.tabs.join(',') !== '*卡片,文档') errs.push('页签 ' + JSON.stringify(w.tabs) + '，应当默认选中「卡片」')
    if (p.scrim) errs.push('浮动态不该有全屏遮罩')
    if (w.docDots < 1) errs.push('背景卡片上的「有文档」角标没画出来')
  }
  if (scene === 'pinned') {
    if (p.windows.length !== 2) errs.push('钉住多开应当同时有 2 个窗口，实际 ' + p.windows.length)
    for (const w of p.windows) {
      if (!(w.rect[2] > 100 && w.rect[3] > 100)) errs.push('窗口 ' + w.title + ' 没画出来 ' + JSON.stringify(w.rect))
      if (!w.grip) errs.push('窗口 ' + w.title + ' 没有缩放手柄')
    }
    if (!p.windows.some((w) => w.pin)) errs.push('有一个窗口是钉住的，图钉应当点亮')
  }
  if (scene === 'full') {
    if (!p.scrim) errs.push('全屏遮罩模式没有遮罩')
    else {
      if (p.scrim.opacity !== '1') errs.push('遮罩 opacity=' + p.scrim.opacity + '，应当是 1（.on）')
      if (p.scrim.position !== 'absolute') errs.push('遮罩 position=' + p.scrim.position)
    }
    const w = p.windows[0] || {}
    if (!/sc-full/.test(w.cls || '')) errs.push('窗口不是全屏模式：' + w.cls)
    if (w.grip) errs.push('全屏模式不该有缩放手柄')
    if (!/blur/.test(String((p.stage || {}).filter))) errs.push('全屏模式下画布应当虚化，实际 filter=' + (p.stage || {}).filter)
  }
  if (scene === 'doc') {
    if (p.windows.length !== 2) errs.push('文档那一幕应当有两个窗口（一个未保存、一个已保存），实际 ' + p.windows.length)
    const dirty = p.windows.filter((w) => w.state && /未保存/.test(w.state.text))[0]
    const saved = p.windows.filter((w) => w.state && /已保存/.test(w.state.text))[0]
    if (!dirty) errs.push('没有看到「● 未保存」的脏标记')
    if (!saved) errs.push('没有看到「已保存 HH:MM」的状态行')
    for (const w of p.windows) {
      if (w.tabs.join(',') !== '卡片,*文档') errs.push('文档页签没选中：' + JSON.stringify(w.tabs))
      if (!w.area) { errs.push('窗口 ' + w.title + ' 里没有文档输入框'); continue }
      if (!/mono|Consolas|Menlo/i.test(w.area['font-family'])) errs.push('文档输入框不是等宽字体：' + w.area['font-family'])
      if (w.area.clientHeight < 120) errs.push('文档输入框只有 ' + w.area.clientHeight + 'px 高 —— 它应当跟着容器长')
      if (w.area.resize !== 'none') errs.push('文档输入框 resize=' + w.area.resize)
      if (!w.pathText || !/剧本档案\/文档\//.test(w.pathText)) errs.push('状态行没有显示相对路径：' + w.pathText)
      errs.push(...layerErrs(w))
    }
    if (dirty && dirty.area && dirty.area.scrollHeight <= dirty.area.clientHeight) {
      errs.push('文档输入框自己没滚动：scrollHeight ' + dirty.area.scrollHeight + ' <= clientHeight ' + dirty.area.clientHeight)
    }
  }
  if (scene === 'talk') {
    const w = p.windows[0] || {}
    if (!w.role) errs.push('状态栏里没有「正在写：…」那枚角色标签')
    else if (w.role.text !== '正在写：勿忘我') errs.push('角色标签内容是 ' + JSON.stringify(w.role.text))
    if (!w.area) errs.push('没有文档输入框')
    else {
      const t = String(w.area.fullText || w.area.text || '')
      if (t.indexOf('「勿忘我」：') !== 0) errs.push('台词行不以 「名字」：（全角冒号）开头：' + JSON.stringify(t.slice(0, 40)))
      if (t.indexOf('　　雨停') === -1) errs.push('旁白行没有两个全角空格：' + JSON.stringify(t.slice(0, 80)))
      // 续行＝(前缀宽度 − 1) 个全角空格 + 一个全角冒号（`「勿忘我」：` 宽 6 → 5 空格 + 冒号）
      const contMarker = '　'.repeat(5) + '：'
      if (t.indexOf('\n' + contMarker) === -1) errs.push('续行没有用「(宽度−1) 个空格 + 冒号」补到对齐位：' + JSON.stringify(t.slice(0, 90)))
      const repeats = (t.match(/「勿忘我」/g) || []).length
      if (repeats !== 1) errs.push('「勿忘我」 前缀出现了 ' + repeats + ' 次，续行不该再重复：' + JSON.stringify(t.slice(0, 90)))
    }
    errs.push(...layerErrs(w))
    // 名字着色：两个角色各自一种颜色，而且和正文色不同
    const names = w.names || []
    if (names.length !== 2) errs.push('着色层里的名字有 ' + names.length + ' 个，应当是 2（两个角色各一行）')
    const colors = names.map((n) => n.color)
    if (colors.length === 2 && colors[0] === colors[1]) errs.push('两个角色的名字颜色一样，区分不出来：' + colors[0])
    if (names[0] && !/rgb\(142, 178, 252\)/.test(names[0].color)) errs.push('第一个角色没有用它的角色色（期望 #8EB2FC）：' + JSON.stringify(names[0]))
    // 续行那个冒号：跟它所属角色同色（「还是同一个人在说」一眼看得出来）
    const colons = w.colons || []
    if (colons.length !== 1) errs.push('续行冒号有 ' + colons.length + ' 个，应当是 1 个')
    else {
      if (!/rgb\(142, 178, 252\)/.test(colons[0].color)) errs.push('续行的冒号没有用当前角色的颜色（期望 #8EB2FC）：' + JSON.stringify(colons[0]))
      if (colons[0].pad !== '　'.repeat(5)) errs.push('续行冒号前面是 ' + JSON.stringify(colons[0].pad) + '，应当是 5 个全角空格')
    }
    if (!(w.quiet || []).length) errs.push('旁白行首的两个全角空格没有单独渲染成暗色')
    if (!p.selection || p.selection === '') errs.push('样式表里没有 .sc-docarea::selection（透明文字选中后会看不见）')
    else if (!/rgba|color-mix/.test(p.selection)) errs.push('选区底色不是半透明的：' + p.selection)
    if (!p.menu) errs.push('没有人物菜单（右键菜单）')
    else {
      if (p.menu.position !== 'fixed') errs.push('菜单 position=' + p.menu.position + '，应当是 fixed')
      if (p.menu.items !== 5) errs.push('菜单项 ' + p.menu.items + ' 个，应当是 5（3 个人物 + 旁白 + 结束）')
      if (!p.menu.inputInside) errs.push('菜单里没有筛选输入框')
      // 菜单挂在 overflow:hidden 的文档体里面，靠 position:fixed 逃出来 —— 点得到才算数
      if (!p.menu.hitIsItem) errs.push('菜单项中心点到的不是菜单项（被裁掉或被压在下面了）：' + JSON.stringify(p.menu.firstItem))
      if (plan(p.menu['z-index']) < plan((w || {})['z-index'])) errs.push('菜单的 z-index 比窗口还低')
    }
  }
  if (scene === 'grid') {
    // 方片页：人物卡标题染角色色（只用标题、不加装饰）+ 右键的色卡菜单
    const dyed = (p.tiles || []).filter((t) => t.dyed)
    if (dyed.length !== 3) errs.push('染了角色色的人物卡有 ' + dyed.length + ' 张，应当是 3 张（那张设定卡不该染）')
    const forget = (p.tiles || []).filter((t) => t.title.indexOf('勿忘我') === 0)[0]
    if (!forget) errs.push('没有找到「勿忘我」那张人物卡')
    else {
      if (!forget.dyed) errs.push('人物卡没有 .dye（标题不会染色）')
      if (forget.accent !== '#8EB2FC') errs.push('--sc-accent=' + forget.accent + '，应当是人物卡上的 #8EB2FC')
      if (forget.titleColor === forget.bodyColor) errs.push('标题颜色和正文色一样，角色色没生效：' + forget.titleColor)
      if (!/rgb\(142, 178, 252\)/.test(forget.titleColor)) errs.push('标题不是角色色（期望 rgb(142,178,252)）：' + forget.titleColor)
    }
    const plain = (p.tiles || []).filter((t) => t.title === '设定甲')[0]
    if (plain && plain.dyed) errs.push('非人物卡也被染色了')
    if (!p.menu) errs.push('没有色卡菜单')
    else {
      if (p.menu.position !== 'fixed') errs.push('菜单 position=' + p.menu.position + '，应当是 fixed')
      if (!p.menu.hitIsItem) errs.push('菜单项中心点到的不是菜单项（被裁掉或被压在下面了）')
      if (!(p.menu.swatches >= 8)) errs.push('色卡菜单里的色卡只有 ' + p.menu.swatches + ' 个（应当是那套 8 个通用色）')
    }
  }
  if (scene === 'refs') {
    // 引用卡：抽屉开着、两张引用 + 一张原生卡；角标在、没有连线圆点、强调色＝角色色
    const refs = p.refs || []
    if (refs.length !== 3) errs.push('引用卡有 ' + refs.length + ' 张，应当是 3 张')
    for (const r of refs) {
      if (!r.badge) errs.push('引用卡 ' + r.key + ' 没有「引用」角标')
      if (r.badgeText !== '引用') errs.push('角标文字是 ' + JSON.stringify(r.badgeText))
      if (r.ports !== 0) errs.push('引用卡 ' + r.key + ' 上居然有 ' + r.ports + ' 个连线圆点')
      if (r.borderStyle !== 'dashed') errs.push('引用卡 ' + r.key + ' 的边框不是虚线（看着和原生卡一样）：' + r.borderStyle)
    }
    const charRef = refs.filter((r) => r.key === 'card/character-x.md')[0]
    if (!charRef) errs.push('没有找到那张人物引用卡')
    else {
      if (charRef.accent !== '#8EB2FC') errs.push('人物引用卡的强调色是 ' + JSON.stringify(charRef.accent) + '，应当是角色色 #8EB2FC')
      if (!/rgb\(142, 178, 252\)/.test(charRef.borderColor)) errs.push('引用卡的边框没用角色色：' + charRef.borderColor)
      if (/rgba?\(0, 0, 0, 0\)|transparent/.test(charRef.bg)) errs.push('引用卡的底色没有被强调色染到：' + charRef.bg)
    }
    const plainRef = refs.filter((r) => r.key === 'card/node-n5.md')[0]
    if (plainRef && plainRef.accent) errs.push('那张没有角色色的引用卡不该有 --sc-accent：' + plainRef.accent)
    if (!p.drawer || !p.drawer.open) errs.push('抽屉没开着')
    else {
      if (!(p.drawer.width >= 240 && p.drawer.width <= 300)) errs.push('抽屉宽 ' + p.drawer.width + 'px，应当 ~260px')
      if (p.drawer.right > p.drawer.viewportRight) errs.push('抽屉伸出画布右边了（' + p.drawer.right + ' > ' + p.drawer.viewportRight + '）')
      // 抽屉**自己**就是滚动容器，而且带 data-wheel="own"（滚轮归它，画布不许抢）
      if (p.drawer.overflowY !== 'auto') errs.push('抽屉自己不是滚动容器：overflow-y=' + p.drawer.overflowY)
      if (p.drawer.wheel !== 'own') errs.push('抽屉没打 data-wheel="own" 标记：' + JSON.stringify(p.drawer.wheel))
      if (p.drawer.sticky !== 'sticky') errs.push('抽屉头部没 sticky（滚动时会被滚走）：' + p.drawer.sticky)
      if (!p.drawer.heads.some((t) => /人物/.test(t))) errs.push('抽屉里没有存档卡那一组：' + JSON.stringify(p.drawer.heads))
      if (!p.drawer.heads.some((t) => /章节/.test(t))) errs.push('抽屉里没有「别的级别」那一组：' + JSON.stringify(p.drawer.heads))
      if (p.drawer.items < 5) errs.push('抽屉条目只有 ' + p.drawer.items + ' 个')
    }
    if (p.bodyScroll && p.bodyScroll[0] > p.bodyScroll[1]) errs.push('这一幕把页面撑出横向滚动条了')
  }
  if (scene === 'objects') {
    // 独立对象：方框有半透明底色、文本框有内容且用角色色、两个都有缩放手柄；
    // 分组背景不吃点击；文本框压在方框上面。
    const objs = p.objects || []
    if (objs.length !== 2) errs.push('独立对象有 ' + objs.length + ' 个，应当是 2 个（一个方框一个文本框）')
    const boxRect = objs.filter((o) => o.kind === 'rect')[0]
    const boxText = objs.filter((o) => o.kind === 'text')[0]
    if (!boxRect) errs.push('没有找到矩形方框')
    else {
      if (/rgba?\(0, 0, 0, 0\)|transparent/.test(boxRect.bg)) errs.push('矩形方框没有底色（color-mix 没生效）：' + boxRect.bg)
      if (boxRect.borderStyle !== 'solid') errs.push('矩形方框的边框不是实线：' + boxRect.borderStyle)
      if (boxRect.text) errs.push('矩形方框里不该有内容：' + JSON.stringify(boxRect.text))
    }
    if (!boxText) errs.push('没有找到文本框')
    else {
      if (boxText.text !== '第二幕 转折') errs.push('文本框内容不对：' + JSON.stringify(boxText.text))
      if (!/rgb\(142, 178, 252\)/.test(boxText.textColor)) errs.push('文本框没用角色色：' + boxText.textColor)
      // 用户原话「文本框不要底」：文本框不许有底色，下面的矩形方框要透得上来。
      if (!/rgba?\(0, 0, 0, 0\)|transparent/.test(boxText.bg)) errs.push('文本框有底色（用户要「不要底」，底下的色块该透出来）：' + boxText.bg)
      if (!boxText.grip || boxText.grip.w !== 16 || boxText.grip.h !== 16) errs.push('文本框的缩放手柄不是 16×16')
      else if (boxText.grip.cursor !== 'nwse-resize') errs.push('缩放手柄的光标不是 nwse-resize：' + boxText.grip.cursor)
    }
    if (!p.groupBg) errs.push('没有找到分组那层淡背景')
    else {
      if (p.groupBg.pointerEvents !== 'none') errs.push('分组背景吃点击了（应当是 pointer-events:none）：' + p.groupBg.pointerEvents)
      if (p.groupBg.borderStyle !== 'dashed') errs.push('分组背景不是虚线：' + p.groupBg.borderStyle)
      if (/rgba?\(0, 0, 0, 0\)|transparent/.test(p.groupBg.bg)) errs.push('分组背景是透明的（看不见）：' + p.groupBg.bg)
    }
    if (!p.overlap) errs.push('没量到两个对象的层级')
    else {
      if (String(p.overlap.onText).indexOf('sc-obj') === -1) errs.push('文本框中心摸到的不是文本框：' + p.overlap.onText)
      if (String(p.overlap.onRect).indexOf('sc-objrect') === -1) errs.push('方框露出来的那条边摸到的不是方框：' + p.overlap.onRect)
      // 层序最上面那一层是「其他所有卡片」：三层叠在一起的那一点，摸到的必须是卡片
      if (String(p.overlap.onCardOver).indexOf('sc-card') === -1) {
        errs.push('压在方框和文字上的那张卡不在最上面（摸到的是 ' + p.overlap.onCardOver + '，应当是 sc-card）')
      }
    }
    // 卡片那条：时间单独一行、右下角有缩放手柄、对齐辅助线是 1px 细线
    const cb = p.cardBits
    if (!cb) errs.push('这一幕里没有卡片')
    else {
      if (cb.whenText !== '第4天') errs.push('时间那一行没渲染出来：' + JSON.stringify(cb.whenText))
      if (String(cb.rowText).indexOf('第4天') !== -1) errs.push('时间还挤在标题那一行里：' + JSON.stringify(cb.rowText))
      if (!cb.whenBelowRow) errs.push('时间没有排在标题下面')
      if (!cb.grip) errs.push('卡片右下角没有缩放手柄')
      else if (cb.grip.w !== 16 || cb.grip.cursor !== 'nwse-resize') errs.push('卡片缩放手柄不对：' + JSON.stringify(cb.grip))
      if (!cb.guide) errs.push('没找到对齐辅助线')
      else {
        if (cb.guide.w > 2) errs.push('对齐辅助线不是 1px 细线：' + cb.guide.w)
        if (!(cb.guide.h >= 200 && cb.guide.h <= 240)) errs.push('对齐辅助线不是「只到下一张卡」那么长：' + cb.guide.h)
        if (cb.guide.pointer !== 'none') errs.push('对齐辅助线吃点击了：' + cb.guide.pointer)
      }
    }
    if (p.bodyScroll && p.bodyScroll[0] > p.bodyScroll[1]) errs.push('这一幕把页面撑出横向滚动条了')
  }
  return errs
}

/**
 * 文档输入区那两层（彩字高亮 + 文字透明的 textarea）的实测检查。
 * 折行位置一错，用户看到的光标和彩字就错开 —— 所以这里既比属性，也比可用宽度与行数。
 */
function layerErrs(w) {
  const errs = []
  if (!w.hl) { errs.push('窗口 ' + w.title + ' 里没有高亮层 .sc-dochl'); return errs }
  const t = w.typeMatch || {}
  if (!t.fontFamily) errs.push('两层字体不一致：' + w.area['font-family'] + ' vs ' + w.hl['font-family'])
  if (!t.fontSize) errs.push('两层字号不一致：' + w.area['font-size'] + ' vs ' + w.hl['font-size'])
  if (!t.lineHeight) errs.push('两层行高不一致：' + w.area['line-height'] + ' vs ' + w.hl['line-height'])
  if (!t.whiteSpace) errs.push('两层折行规则不一致：' + w.area['white-space'] + ' vs ' + w.hl['white-space'])
  if (!t.paddingLeft) errs.push('两层左内边距不一致：' + w.area['padding-left'] + ' vs ' + w.hl['padding-left'])
  if (!t.textWidth) errs.push('两层可用正文宽度差超过 1px（滚动条补偿没生效？）：area ' + w.area.clientWidth + '/' + w.area['padding-right'] + '，hl ' + w.hl.clientWidth + '/' + w.hl['padding-right'])
  if (!t.lines) errs.push('两层行数不一致（折行位置错开了）：scrollHeight ' + w.area.scrollHeight + ' vs ' + w.hl.scrollHeight)
  if (String(w.area.color) !== 'rgba(0, 0, 0, 0)') errs.push('textarea 的文字不是透明的，两层会重影：color=' + w.area.color)
  if (!w.area['caret-color'] || w.area['caret-color'] === 'rgba(0, 0, 0, 0)') errs.push('光标颜色没单独给（透明文字下看不见光标）：' + w.area['caret-color'])
  if (w.hl.overflow !== 'hidden') errs.push('高亮层不该自己滚：overflow=' + w.hl.overflow)
  if (!/scroll/.test(String(w.area['overflow-y']))) errs.push('textarea 没有常驻滚动条（补偿就无从谈起了）：' + w.area['overflow-y'])
  return errs
}

/** z-index 是字符串，比较前先转成数（auto 当 0）。 */
function plan(v) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
