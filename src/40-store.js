// ══════════════════════════════════════════════════════════════════════════════
// 浏览器本地状态（收藏 / 置顶 / 视图偏好 / 目录名 / 色卡）
//
// 结构图谱存在 <工作区>/<档案目录>/分支.json（落盘、随项目走、可进 git）。
// 留在 localStorage 的只有「这个人在这台机器上的偏好」：星标、置顶、上次看的
// 视图、缩放比例、展开过的卡片、档案目录名、自定义色卡。
//
// 铁律：每次写入必须「读出整份记录 → 改字段 → 整份写回」。v-alpha-0.1 就因为
// 只写了 {star,pin} 把图谱整块冲掉过。
// ══════════════════════════════════════════════════════════════════════════════

function emptyUi() {
  return {
    star: [],
    pin: [],
    view: 'grid',
    zoom: 1,
    expanded: [],
    dirs: { archive: DEFAULT_DIRS.archive, cards: DEFAULT_DIRS.cards, sub: DEFAULT_DIRS.sub },
    swatches: [],
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
      dirs: normDirs(one.dirs),
      swatches: normSwatches(one.swatches),
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
