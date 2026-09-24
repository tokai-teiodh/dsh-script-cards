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
import { spawn } from 'node:child_process'
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
const OUT = arg('out', path.join(PKG, '.visual', 'canvas-' + THEME + '.png'))

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
const CHOICE_W = 170
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

const NODE = { w: 184, h: 80 }
const RESULT = { w: 172, h: 58 }
const CONDITION = { w: 172, h: 58 }
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

function buildHtml(tokenCss) {
  const css = fs.readFileSync(path.join(PKG, 'src', '10-css.js'), 'utf8')
  const a = css.indexOf('`') + 1
  const b = css.lastIndexOf('`')
  if (a <= 0 || b <= a) throw new Error('src/10-css.js: 找不到 CSS 模板串')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>dsh-script-cards visual</title>
<style>
${tokenCss}
html,body{margin:0;padding:0;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Segoe UI",system-ui,sans-serif}
.sc-wrap{height:100vh}
${css.slice(a, b)}
</style></head>
<body ${THEME === 'dark' ? 'data-ds-dark-theme' : ''}>
<div class="sc-wrap"><div class="sc-board"><div class="sc-canvas" style="position:relative;height:100vh">
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
    <div class="sc-elabel empty" style="left:${(outPoint(A, -1, 0).x + inPoint(B).x) / 2}px;top:${(outPoint(A, -1, 0).y + inPoint(B).y) / 2}px">连线</div>
    ${card(A, '<div class="sc-cardrow"><span class="sc-cardname">节点甲</span><span class="sc-cardwhen">第4天</span></div><div class="sc-cardsum">节点甲的简介。</div>', '<div class="sc-port in"></div><div class="sc-port out"></div>')}
    ${card(B, '<div class="sc-cardrow"><span class="sc-cardname">分歧节点甲</span></div><div class="sc-cardsum">这里要分岔。</div>',
      '<div class="sc-choices" style="top:' + choiceTop(B.h, N) + 'px">' + optionRows + '<button class="sc-choiceadd">＋ 选项</button></div><div class="sc-port in"></div>')}
    ${card(C, '<div class="sc-cardkind">结果</div><div class="sc-cardmono">结果甲</div>', '<div class="sc-port in"></div>')}
    ${card(D, '<div class="sc-cardkind">条件</div><div class="sc-cardmono">条件甲</div>', '<div class="sc-port in"></div><div class="sc-port out"></div>')}
  </div>
</div></div></div>
<script>
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
  return out
}
</script>
</body></html>`
}

// ── 无头浏览器：CDP over ws（Node 22+ 自带 WebSocket，零依赖） ────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(browser, htmlFile, outPng) {
  const port = 9200 + Math.floor(Math.random() * 400)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cards-visual-'))
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--window-size=900,700', '--force-device-scale-factor=' + DPR, '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore', detached: true })

  const cleanup = () => {
    try { process.kill(-child.pid) } catch (e) { try { child.kill() } catch (e2) { /* 忽略 */ } }
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
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
  await loaded
  await sleep(250)

  let probe = null
  if (PROBE) {
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__probe())', returnByValue: true })
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

const htmlFile = path.join(os.tmpdir(), 'dsh-cards-visual-' + THEME + '-' + ZOOM + '.html')
fs.writeFileSync(htmlFile, buildHtml(tokenCss))
const probe = await shoot(browser, htmlFile, OUT)
console.log('截图   : ' + OUT + '  (' + fs.statSync(OUT).size + ' bytes, theme=' + THEME + ', zoom=' + ZOOM + ', dpr=' + DPR + ')')
if (probe) {
  // 报告同时落一份 JSON，方便再拿它去放大某个元素的像素（排查圆点/描边这类栅格化问题）
  fs.writeFileSync(path.join(path.dirname(OUT), 'probe.json'), JSON.stringify(probe, null, 1))
  console.log(JSON.stringify(probe, null, 1))
  // 这两条是「画布能不能看」的底线，顺手当断言用
  const flat = probe.items.filter((x) => x.what.indexOf('edge#') === 0)
  const transparent = flat.filter((x) => !x.v.stroke || x.v.stroke === 'none')
  if (transparent.length) console.error('!! 有 ' + transparent.length + ' 条连线的 stroke 是 none —— 线根本画不出来')
  const odd = probe.items.filter((x) => x.what.indexOf('port#') === 0 && x.v['border-top-width'] === '0px')
  if (odd.length) console.error('!! 有 ' + odd.length + ' 个圆点没有描边 —— 大概率是颜色变量没解析出来')
  if (transparent.length || odd.length) process.exit(1)
}
