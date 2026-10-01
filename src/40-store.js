// ══════════════════════════════════════════════════════════════════════════════
// 浏览器本地状态（收藏 / 置顶 / 视图偏好 / 目录名 / 色卡 / 浮窗几何）
//
// 结构图谱存在 <工作区>/<档案目录>/分支.json（落盘、随项目走、可进 git）。
// 留在 localStorage 的只有「这个人在这台机器上的偏好」：星标、置顶、上次看的
// 视图、缩放比例、展开过的卡片、档案目录名、自定义色卡、每张卡片展开后的浮窗
// 位置与模式。
//
// 铁律：每次写入必须「读出整份记录 → 改字段 → 整份写回」。v-alpha-0.1 就因为
// 只写了 {star,pin} 把图谱整块冲掉过。
//
// windows 的形状：{ [cardKey]: { x, y, w, h, mode } }
//   x/y/w/h  浮动窗口在画布可视区里的位置与大小（画布坐标，左上角为原点）
//   mode     'float'（默认，可拖可缩放）| 'full'（全屏遮罩，和旧版一样专注）
// 尺寸/位置是「浮动态」的几何：切到 full 再切回来，还是要回到原来拖到的那个位置，
// 所以 mode 变了也不清 x/y/w/h。
// ══════════════════════════════════════════════════════════════════════════════

function normWinRect(v) {
  if (!v || typeof v !== 'object') return null
  const num = function (x) {
    const n = Number(x)
    return isFinite(n) ? n : null
  }
  const x = num(v.x)
  const y = num(v.y)
  const w = num(v.w)
  const h = num(v.h)
  // 下限（320×220）由 UI 层（85-boardview 的 clampWin）强制：这里只负责把**坏值丢掉**
  // （不是数、或者宽高不是正数）。尺寸下限放在这里的话，画布比窗口还窄时（侧栏）就
  // 没法把窗口缩到画布里面去了。
  if (x === null || y === null || !(w > 0) || !(h > 0)) return null
  return {
    x: clamp(x, -20000, 20000),
    y: clamp(y, -20000, 20000),
    w: Math.min(w, 20000),
    h: Math.min(h, 20000),
    mode: v.mode === 'full' ? 'full' : 'float',
  }
}

/** 归一化 windows 表：坏键、坏值直接丢，绝不让一支坏记录把整份偏好带崩。 */
function normWindows(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of Object.keys(raw)) {
    if (typeof k !== 'string' || !k) continue
    const r = normWinRect(raw[k])
    if (r) out[k] = r
  }
  return out
}

function emptyUi() {
  return {
    star: [],
    pin: [],
    view: 'grid',
    zoom: 1,
    expanded: [],
    dirs: {
      archive: DEFAULT_DIRS.archive, cards: DEFAULT_DIRS.cards,
      sub: DEFAULT_DIRS.sub, docs: DEFAULT_DIRS.docs,
    },
    swatches: [],
    windows: {},
  }
}

function normStrList(v) {
  if (!Array.isArray(v)) return []
  return v.filter(function (x) { return typeof x === 'string' })
}

function readUi(root) {
  const empty = emptyUi()
  if (!root) return empty
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    const all = raw ? JSON.parse(raw) : null
    const one = all && typeof all === 'object' ? all[root] : null
    if (!one || typeof one !== 'object') return empty
    const view = one.view === 'board' ? 'board' : 'grid'
    const zoom = isFinite(Number(one.zoom)) ? clamp(Number(one.zoom), 0.25, 2.2) : 1
    return {
      star: normStrList(one.star),
      pin: normStrList(one.pin),
      view: view,
      zoom: zoom,
      expanded: normStrList(one.expanded),
      // 旧记录里没有 docs（甚至整个 dirs 都没有）→ 回落 DEFAULT_DIRS，不报错
      dirs: normDirs(one.dirs),
      swatches: normSwatches(one.swatches),
      windows: normWindows(one.windows),
    }
  } catch (e) {
    return empty
  }
}

function writeUi(root, value) {
  if (!root) return
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    const all = raw ? JSON.parse(raw) : null
    const next = all && typeof all === 'object' ? all : {}
    next[root] = {
      star: normStrList(value.star),
      pin: normStrList(value.pin),
      view: value.view === 'board' ? 'board' : 'grid',
      zoom: isFinite(Number(value.zoom)) ? Number(value.zoom) : 1,
      expanded: normStrList(value.expanded),
      dirs: normDirs(value.dirs),
      swatches: normSwatches(value.swatches),
      windows: normWindows(value.windows),
    }
    window.localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch (e) {
    throw new Error('浏览器存储不可用：' + String(e && e.message ? e.message : e))
  }
}

function toggleIn(list, key, on) {
  const out = list.slice()
  const i = out.indexOf(key)
  if (on && i === -1) out.push(key)
  if (!on && i !== -1) out.splice(i, 1)
  return out
}

// ── 文档草稿（防「写一半切卡片就没了」） ──────────────────────────────────────
//
// 用户原话：「加个缓存，防止文档写一半，想要切卡片的时候，直接没掉」。
// 草稿只存浏览器本地（localStorage），**不进档案目录、不产生任何文件** —— 落盘那份
// 只有用户真的按保存才会写。形状：{ [cardKey]: { text, at } }，一个 key 装全部草稿。
// 读写规矩跟上面一样：整份读出来 → 改 → 整份写回（曾经只写部分字段把图谱冲掉过）。
const DRAFT_KEY = 'dsh-script-cards:drafts'
// 上限：只留最新的这么多条，超出丢最旧的 —— localStorage 就几 MB，不能无限涨。
const MAX_DRAFTS = 50

function normDrafts(raw) {
  const list = []
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const v = raw[k]
      if (!k || !v || typeof v !== 'object') continue
      const at = Number(v.at)
      list.push({ key: k, text: String(v.text == null ? '' : v.text), at: isFinite(at) ? at : 0 })
    }
  }
  list.sort(function (a, b) { return b.at - a.at })
  const out = {}
  for (const it of list.slice(0, MAX_DRAFTS)) out[it.key] = { text: it.text, at: it.at }
  return out
}

function readDrafts() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    return normDrafts(raw ? JSON.parse(raw) : null)
  } catch (e) {
    return {}
  }
}

function writeDrafts(all) {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(normDrafts(all)))
}

/** 这一张卡有没有草稿；没有就是 null。 */
function readDraft(key) {
  if (!key) return null
  const one = readDrafts()[key]
  return one || null
}

/** 记下/覆盖某张卡的草稿（整份读改写）。 */
function putDraft(key, text, at) {
  if (!key) return
  const all = readDrafts()
  all[key] = { text: String(text == null ? '' : text), at: isFinite(Number(at)) ? Number(at) : Date.now() }
  writeDrafts(all)
}

/** 删掉某张卡的草稿（保存成功 / 重新载入 / 用户点了「放弃草稿」都走它）。 */
function dropDraft(key) {
  if (!key) return
  const all = readDrafts()
  if (!Object.prototype.hasOwnProperty.call(all, key)) return
  delete all[key]
  writeDrafts(all)
}
