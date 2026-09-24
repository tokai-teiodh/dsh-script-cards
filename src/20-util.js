// ══════════════════════════════════════════════════════════════════════════════
// 基础工具：路径、文本、frontmatter
// ══════════════════════════════════════════════════════════════════════════════

const ERR_TEXT = {
  'error.notFound': '这个目录不在了，可能已被移动或删除。',
  'error.outsideWorkspace': '这个目录在工作区之外，读不到。',
  'error.notDirectory': '这不是一个目录。',
  'error.unavailable': '读取失败。',
}

function joinPath() {
  let out = ''
  for (let i = 0; i < arguments.length; i++) {
    const part = String(arguments[i] == null ? '' : arguments[i]).replace(/[/\\]+$/, '')
    if (!part) continue
    out = out ? out + '/' + part : part
  }
  return out
}

function decodeBase64Text(b64) {
  if (typeof b64 !== 'string' || b64 === '') return ''
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function errText(error) {
  if (error == null) return '未知错误'
  if (typeof error === 'string') return error
  if (error.code && ERR_TEXT[error.code]) return ERR_TEXT[error.code] + (error.message ? '（' + error.message + '）' : '')
  return String(error.message || error.code || error)
}

function clamp(v, lo, hi) {
  const n = Number(v)
  if (!isFinite(n)) return lo
  return n < lo ? lo : (n > hi ? hi : n)
}

// 画面缩放只走这几档（跟浏览器缩放菜单一个思路）。自由缩放会把整块画布按一个
// 奇怪的比例重新栅格化，越缩越糊；整数/常见档位至少是清楚的。
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2]

function snapZoom(v) {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return 1
  let best = ZOOM_STEPS[0]
  for (const s of ZOOM_STEPS) if (Math.abs(s - n) < Math.abs(best - n)) best = s
  return best
}

/** 沿缩放档位走一格（dir > 0 放大）。 */
function zoomStep(v, dir) {
  let i = ZOOM_STEPS.indexOf(snapZoom(v))
  if (i === -1) i = ZOOM_STEPS.indexOf(1)
  return ZOOM_STEPS[clamp(i + (dir > 0 ? 1 : -1), 0, ZOOM_STEPS.length - 1)]
}

function slug(text, maxlen) {
  const t = String(text == null ? '' : text).trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return t.slice(0, maxlen || 40) || 'untitled'
}

let uidSeq = 0
function uid(prefix) {
  uidSeq += 1
  return (prefix || 'c') + '-' + Date.now().toString(36) + '-' + uidSeq.toString(36)
}

function parseFront(text) {
  const s = String(text)
  const meta = {}
  let body = s
  if (s.slice(0, 3) === '---') {
    const end = s.indexOf('\n---', 3)
    if (end !== -1) {
      const head = s.slice(3, end)
      body = s.slice(end + 4)
      for (const raw of head.split('\n')) {
        const line = raw.trim()
        if (!line || line.charAt(0) === '#') continue
        const i = line.indexOf(':')
        if (i <= 0) continue
        meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
      }
    }
  }
  return { meta: meta, body: body.replace(/^\n+/, '') }
}

// frontmatter 白名单与顺序。加字段时这里和 cards.py 的 render_front 要一起改。
const FRONT_KEYS = [
  'id', 'type', 'title', 'code', 'chapter', 'mode', 'when', 'order',
  'summary', 'tags', 'color', 'index_collapsed', 'created', 'updated', 'source',
]

function renderFront(meta) {
  const lines = ['---']
  for (const key of FRONT_KEYS) {
    const value = meta ? meta[key] : undefined
    if (value === undefined || value === null || value === '') continue
    const text = Array.isArray(value) ? value.join(', ') : String(value)
    if (text === '') continue
    lines.push(key + ': ' + text)
  }
  lines.push('---')
  return lines.join('\n') + '\n'
}

function tagsOf(meta) {
  if (!meta || !meta.tags) return []
  const out = []
  for (const p of String(meta.tags).split(/[,;，；、]/)) {
    const v = p.trim()
    if (v) out.push(v)
  }
  return out
}

function orderOf(meta) {
  const raw = meta ? meta.order : undefined
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const n = Number(raw)
  return isNaN(n) ? null : n
}

// 章节序号可以写成 G1.1 / 1-2 / 3 等各种样式；取其中的数字用来排序。
function codeSortKey(code) {
  const s = String(code || '')
  const nums = s.match(/\d+/g)
  if (!nums || !nums.length) return null
  const parts = nums.map(function (n) { return parseInt(n, 10) || 0 })
  let out = 0
  for (let i = 0; i < 4; i++) out = out * 1000 + (parts[i] || 0)
  return out
}

// 正文里的 `## 角色` / `## 场景` / `## 内容` 小节（节点卡片展开时按序展示）。
const BODY_SECTIONS = ['角色', '场景', '内容']

function splitSections(body) {
  const out = { 角色: [], 场景: [], 内容: [] }
  const rest = []
  let cur = null
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim()
    const m = /^#{1,6}\s*(角色|场景|内容)\s*$/.exec(line)
    if (m) { cur = m[1]; continue }
    const h = /^#{1,6}\s+/.exec(line)
    if (h) { cur = null; rest.push(raw); continue }
    if (cur) out[cur].push(raw.replace(/^[-*]\s*/, '').trim())
    else rest.push(raw)
  }
  const clean = function (list) { return list.filter(function (x) { return x !== '' }) }
  return { 角色: clean(out['角色']), 场景: clean(out['场景']), 内容: clean(out['内容']), rest: rest.join('\n').trim() }
}

function inline(text, key) {
  return String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map(function (part, i) {
    if (!part) return null
    if (part.slice(0, 2) === '**' && part.slice(-2) === '**') return React.createElement('strong', { key: key + '-' + i }, part.slice(2, -2))
    if (part.charAt(0) === '`' && part.slice(-1) === '`') return React.createElement('code', { key: key + '-' + i, className: 'sc-code' }, part.slice(1, -1))
    return part
  })
}

function markdown(text, prefix) {
  const out = []
  const lines = String(text || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const key = (prefix || 'md') + '-' + i
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { out.push(React.createElement('div', { key: key, className: h[1].length <= 2 ? 'sc-h2' : 'sc-p' }, inline(h[2], key))); continue }
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) { out.push(React.createElement('div', { key: key, className: 'sc-li' }, '· ', inline(li[1], key))); continue }
    if (line.trim() === '') { out.push(React.createElement('div', { key: key, className: 'sc-gap' })); continue }
    out.push(React.createElement('div', { key: key, className: 'sc-p' }, inline(line, key)))
  }
  return out
}
