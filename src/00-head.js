// ══════════════════════════════════════════════════════════════════════════════
// 常量与图标
// ══════════════════════════════════════════════════════════════════════════════

const React = require('react')

const TAB_ID = 'dsh-script-cards/panel'
const TAB_KIND = 'script-cards'
const VERSION = 'v0.1.0-alpha.6'

const LS_KEY = 'dsh-script-cards:state'
const FAV_KEY = 'dsh-script-cards:fav'

// 宿主半边（lib/index.js）提供的落盘桥。客户端拿到它就能读写卡片文件与图谱文件；
// 拿不到就退化成「只读 workspaceFiles + 浏览器 localStorage」。
const HOST_SERVICE = 'scriptCardsFs'

const inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

// 档案目录的默认名。面板「设置」里可以改（按项目存在浏览器本地），所以这套约定
// 不是写死的 —— 换语言、换习惯都能用。
const DEFAULT_DIRS = { archive: '剧本档案', cards: '卡片', sub: '归档' }

/** 结构图谱的文件名，放在档案目录下。 */
const GRAPH_FILE = '分支.json'

function normDirs(raw) {
  const out = { archive: DEFAULT_DIRS.archive, cards: DEFAULT_DIRS.cards, sub: DEFAULT_DIRS.sub }
  if (!raw || typeof raw !== 'object') return out
  for (const k of ['archive', 'cards', 'sub']) {
    const v = String(raw[k] == null ? '' : raw[k]).trim()
    // 目录名只能是单层名字：不许带斜杠，也不许是 . 或 ..
    if (!v || v === '.' || v === '..' || /[\\/]/.test(v)) continue
    out[k] = v
  }
  return out
}

function sameDirs(a, b) {
  return !!a && !!b && a.archive === b.archive && a.cards === b.cards && a.sub === b.sub
}

// 预置色卡（8 个通用色）。想用自己作品/角色的印象色，就在面板里「编辑色卡」加；
// 自定义色卡只存这台浏览器，不会进代码仓库。
const DEFAULT_SWATCHES = [
  '#E5484D', '#E5A33D', '#3FA46A', '#3E7BC4',
  '#7A5AF8', '#C86AA8', '#5B6472', '#C9CED6',
]

const MAX_SWATCHES = 16

function normSwatches(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const v of raw) {
    const s = String(v == null ? '' : v).trim()
    if (!/^#[0-9a-fA-F]{3,8}$/.test(s)) continue
    if (out.indexOf(s) !== -1) continue
    out.push(s)
    if (out.length >= MAX_SWATCHES) break
  }
  return out
}

/** 面板实际显示的色卡：自定义优先，没有就用预置。 */
function swatchesOf(ui) {
  const custom = normSwatches(ui && ui.swatches)
  return custom.length ? custom : DEFAULT_SWATCHES.slice()
}

function PanelIcon(props) {
  const size = (props && props.size) || 15
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
    React.createElement('rect', { key: 'a', x: 1.6, y: 2.4, width: 5.4, height: 4.4, rx: 1.2 }),
    React.createElement('rect', { key: 'b', x: 9, y: 2.4, width: 5.4, height: 4.4, rx: 1.2 }),
    React.createElement('rect', { key: 'c', x: 1.6, y: 9.2, width: 5.4, height: 4.4, rx: 1.2 }),
    React.createElement('rect', { key: 'd', x: 9, y: 9.2, width: 5.4, height: 4.4, rx: 1.2 })
  )
}

function StarIcon(props) {
  const on = props && props.on
  return React.createElement('svg', {
    width: 13, height: 13, viewBox: '0 0 16 16',
    fill: on ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.3,
    strokeLinejoin: 'round', 'aria-hidden': 'true',
  }, React.createElement('path', { d: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z' }))
}

function PinIcon(props) {
  const on = props && props.on
  return React.createElement('svg', {
    width: 13, height: 13, viewBox: '0 0 16 16',
    fill: on ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.3,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  }, React.createElement('path', { d: 'M6 1.6h4l-.6 4 2.1 2.1H4.5L6.6 5.6z' }), React.createElement('path', { d: 'M8 7.7V14.4' }))
}
