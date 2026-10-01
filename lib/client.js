// dsh-script-cards — client half (browser)   v0.2.0-alpha.3
//
// ⚠ 本文件由 scripts/build.mjs 从 src/*.js 生成，不要直接编辑；
//   改源码后跑 `npm run build`（或 `npm run check`）。
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

    // ═══ src/00-head.js ═════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 常量与图标
  // ══════════════════════════════════════════════════════════════════════════════

  const React = require('react')

  const TAB_ID = 'dsh-script-cards/panel'
  const TAB_KIND = 'script-cards'
  const VERSION = 'v0.2.0-alpha.3'

  // 面板里所有「浮在中间的那块」统一一个宽度：展开的卡片、各个对话框。
  // 之前对话框有 380 / 420 / 520 三档，展开的卡片又是 460，点来点去界面宽度一直在变
  // （用户提的「输入框和展开的卡片宽度不一样」）。
  const PANEL_W = 460

  const LS_KEY = 'dsh-script-cards:state'
  const FAV_KEY = 'dsh-script-cards:fav'

  // 宿主半边（lib/index.js）提供的落盘桥。客户端拿到它就能读写卡片文件与图谱文件；
  // 拿不到就退化成「只读 workspaceFiles + 浏览器 localStorage」。
  const HOST_SERVICE = 'scriptCardsFs'

  const inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

  // 档案目录的默认名。面板「设置」里可以改（按项目存在浏览器本地），所以这套约定
  // 不是写死的 —— 换语言、换习惯都能用。
  // docs 是「每张卡片一份的独立文档」放的地方：<档案目录>/文档/<卡片文件名>。
  // 文档是**独立文件**，不是卡片正文 —— 卡片正文照旧在 卡片/ 里。
  const DEFAULT_DIRS = { archive: '剧本档案', cards: '卡片', sub: '归档', docs: '文档' }
  const DIR_KEYS = ['archive', 'cards', 'sub', 'docs']

  /** 结构图谱的文件名，放在档案目录下。 */
  const GRAPH_FILE = '分支.json'

  function normDirs(raw) {
    const out = {
      archive: DEFAULT_DIRS.archive, cards: DEFAULT_DIRS.cards,
      sub: DEFAULT_DIRS.sub, docs: DEFAULT_DIRS.docs,
    }
    if (!raw || typeof raw !== 'object') return out
    for (const k of DIR_KEYS) {
      const v = String(raw[k] == null ? '' : raw[k]).trim()
      // 目录名只能是单层名字：不许带斜杠，也不许是 . 或 ..
      if (!v || v === '.' || v === '..' || /[\\/]/.test(v)) continue
      out[k] = v
    }
    return out
  }

  function sameDirs(a, b) {
    return !!a && !!b && DIR_KEYS.every(function (k) { return a[k] === b[k] })
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

    // ═══ src/10-css.js ══════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 样式
  // ══════════════════════════════════════════════════════════════════════════════

  const CSS = `
  .sc-wrap{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
  .sc-head{display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-head h2{font-size:14px;font-weight:600;margin:0;flex:none}
  .sc-count{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
  .sc-spacer{flex:1;min-width:0}
  .sc-ver{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8;flex:none;font-family:ui-monospace,Menlo,Consolas,monospace}
  .sc-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;flex:none}
  .sc-btn:hover{border-color:var(--dsw-alias-border-l2)}
  .sc-btn-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
  .sc-btn-warn{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
  .sc-btn[disabled]{opacity:.4;cursor:default}
  .sc-seg{display:flex;flex:none;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}
  .sc-segb{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;padding:4px 9px;cursor:pointer;white-space:nowrap}
  .sc-segb:hover{background:var(--dsw-alias-bg-layer-2)}
  .sc-segb.on{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
  .sc-noticebar{display:flex;align-items:flex-start;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
  .sc-noticetext{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary);word-break:break-word}
  .sc-noticetext.info{color:var(--dsw-alias-label-secondary)}
  .sc-noticex{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:15px;line-height:1;padding:0 2px;font-family:inherit;flex:none}
  .sc-body{display:flex;flex:1;min-height:0}
  .sc-list{width:330px;min-width:250px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0}
  .sc-search{margin:10px 12px 4px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font-size:13px;outline:none;font-family:inherit}
  .sc-items{overflow:auto;flex:1;padding:0 10px 18px}
  .sc-group{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary);padding:12px 2px 7px;font-weight:600;display:flex;align-items:center;gap:8px}
  .sc-group::after{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l1)}
  .sc-group.pin{color:var(--dsw-alias-brand-primary)}
  .sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:8px}
  .sc-tile{position:relative;display:flex;flex-direction:column;gap:5px;min-height:98px;padding:9px 10px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer}
  .sc-tile:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
  .sc-tile.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
  .sc-tiletop{display:flex;align-items:flex-start;gap:4px}
  .sc-tiletitle{flex:1;min-width:0;font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  /* 人物卡的「角色色」：**只把标题染成角色色** —— 不加新元素、不动右上角那两个小图标、
     详情区也不加按钮（用户对多余的入口/装饰很敏感，这条是反复确认过的）。
     跟文档里「台词名字有颜色」是同一套说法、同一个数据来源，一眼能对上是谁。
     颜色来自人物卡 frontmatter 的 color，没有就读 tags 里的 印象色#rrggbb；
     两样都没有就不加 .dye，标题照旧用正文色。 */
  .sc-tile.dye .sc-tiletitle{color:var(--sc-accent,var(--dsw-alias-label-primary))}
  .sc-tileacts{flex:none;display:flex;gap:1px;opacity:0}
  .sc-tile:hover .sc-tileacts{opacity:1}
  .sc-tileacts.force{opacity:1}
  .sc-icon{border:none;background:transparent;padding:2px;margin:0;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;line-height:0}
  .sc-icon:hover{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
  .sc-icon.on{color:var(--dsw-alias-brand-primary)}
  .sc-tilesum{margin-top:auto;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-hint{margin:10px 0 4px;padding:9px 11px;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
  .sc-detail{flex:1;min-width:0;overflow:auto;padding:22px 30px 80px}
  .sc-empty{color:var(--dsw-alias-label-secondary);font-size:13px;padding:48px 24px;text-align:center;line-height:1.9}
  .sc-empty code{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 6px;font-size:12px}
  .sc-path{word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
  .sc-h1{font-size:20px;font-weight:700;margin:0 0 8px;line-height:1.4}
  .sc-h2{font-size:14px;font-weight:700;margin:20px 0 6px}
  .sc-p{font-size:13.5px;line-height:1.8;margin:6px 0}
  .sc-li{font-size:13.5px;line-height:1.8;margin:3px 0 3px 16px}
  .sc-gap{height:8px}
  .sc-meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:18px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .sc-narrow .sc-list{width:auto;min-width:0;flex:1 1 auto;border-right:none}
  .sc-narrow .sc-detail{padding:16px 16px 64px}
  .sc-narrow .sc-grid{grid-template-columns:repeat(auto-fill,minmax(134px,1fr));gap:7px}
  .sc-narrow .sc-head{padding:10px 12px;gap:6px}
  .sc-narrow .sc-ver{display:none}
  .sc-narrowhead{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-narrowhead h2{font-size:13px;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sc-back{border:none;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:13px;font-family:inherit;padding:0 6px 0 0;flex:none}
  .sc-narrow .sc-h1{font-size:17px}
  .sc-dockbtn{white-space:nowrap;display:inline-flex;align-items:center;gap:6px}

  /* 标签条：**平时一点滚动条都看不到**，滑的时候才浮出一根细条（用户的要求）。
     Windows 的原生滚动条带两侧三角箭头，很丑，所以整个藏掉、也不占位；
     「悬停才显示」那种写法又会「悬停改尺寸」——滑块一出现就把标签顶走，指针落回原处又取消
     悬停，来回抖，网格跟着跳（侧栏一抖，对话列跟着换行，看起来就是「主界面的对话框莫名
     上下跳动」）。现在自己画的那根是绝对定位的，出现或消失都不挪动任何东西。
     滚动条藏掉之后就抓不到滑块了，所以标签条自己支持按住横拖（见 60-grid.js），
     拖动时文字不许被选中 —— 否则一拖就变成拖选文字，插件会跟着报错（用户报的
     「主页面的滑条没了，滑动功能整个没用了」「拖动选中文本就崩溃」）。 */
  .sc-tagwrap{position:relative}
  .sc-tags{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;cursor:grab;-webkit-user-select:none;user-select:none}
  .sc-tags.sc-tagsdrag{cursor:grabbing}
  .sc-tags::-webkit-scrollbar{width:0;height:0;display:none}
  .sc-tags::-webkit-scrollbar-button{display:none;width:0;height:0}
  .sc-tagbar{position:absolute;left:0;right:0;bottom:0;height:3px;pointer-events:none}
  .sc-tagthumb{position:absolute;top:0;height:3px;border-radius:999px;background:var(--dsw-alias-label-secondary);opacity:.75}
  .sc-tag{flex:0 0 auto;font-size:10.5px;line-height:16px;padding:0 7px;border-radius:999px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
  /* 方片页整个不可拖选：卡片上没有需要复制的正文（正文在右边的详情里，那里照样能选），
     而在上面拖选文字既会误触发卡片的 click，也是那次崩溃的入口。只限主页，画布与
     各输入框不受影响。 */
  .sc-group,.sc-grid,.sc-tile,.sc-tiletitle,.sc-tilesum{-webkit-user-select:none;user-select:none}

  /* ── 分支画布 ─────────────────────────────────────────────────────────────── */
  .sc-board{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
  .sc-nav{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
  .sc-navbtn{width:26px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:7px;cursor:pointer;font-size:12px;font-family:inherit;padding:0;flex:none}
  .sc-navbtn:hover:not([disabled]){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
  .sc-navbtn[disabled]{opacity:.35;cursor:default}
  .sc-addr{flex:1;min-width:80px;display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:8px;padding:3px 8px;font-size:12px;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
  .sc-addr::-webkit-scrollbar{height:0}
  .sc-crumb{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;cursor:pointer;padding:1px 2px;white-space:nowrap;flex:none}
  .sc-crumb:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
  .sc-crumb.cur{color:var(--dsw-alias-label-primary);font-weight:600;cursor:default;text-decoration:none}
  .sc-crumbsep{flex:none;color:var(--dsw-alias-label-secondary);opacity:.5;font-size:11px}
  .sc-boardtip{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none;font-family:ui-monospace,Menlo,Consolas,monospace;opacity:.85}
  .sc-canvas{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--dsw-alias-bg-layer-1);user-select:none;touch-action:none;cursor:grab}
  .sc-canvas.panning{cursor:grabbing}
  /* 不要给画布加 will-change:transform：那会把这层（里面有 8000×8000 的点阵与 SVG）
     钉成一个合成层，缩放/平移时浏览器会拿旧位图拉伸，整块画布就糊了。加了它以后
     文字要清晰只能靠运气。 */
  .sc-stage{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .28s cubic-bezier(.22,.61,.36,1)}
  .sc-stage.notrans{transition:none}
  .sc-stage.blur{filter:blur(3px) saturate(.7);pointer-events:none}
  /* 框选的框：画布坐标、跟着画布一起缩放，只画一条虚线 + 一层极淡的底，不挡任何点击。
     它在 DOM 上排在卡片**后面**，所以得自己抬层级（5），否则被卡片盖住就看不见了。 */
  .sc-marquee{position:absolute;z-index:5;box-sizing:border-box;border:1px dashed var(--dsw-alias-brand-primary);background:rgba(127,127,127,.16);border-radius:2px;pointer-events:none}
  .sc-dots{position:absolute;left:-4000px;top:-4000px;width:8000px;height:8000px;pointer-events:none;background-image:radial-gradient(var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:22px 22px;opacity:.7}
  .sc-edges{position:absolute;left:-4000px;top:-4000px;overflow:visible;pointer-events:none}
  /* 连线。颜色绝对不能用 --dsw-alias-border-l2：那是「描边级」的颜色，深色主题下算出来
     是 rgba(255,255,255,.12)，1.5px 的线画在画布上等于没有 —— 用户报的「连线是全透明的」
     就是这个（浏览器里量出来的 stroke 值就是 12% 白）。改用次要文字色。
     线宽也统一到 1.5px：普通 / 高亮 / 橡皮筋只差颜色与透明度，不再差粗细；箭头另外用
     userSpaceOnUse 固定尺寸，不再跟着线宽一起放大。 */
  .sc-edge{fill:none;stroke:var(--dsw-alias-label-secondary);stroke-width:1.5;opacity:.75}
  .sc-edge.on{stroke:var(--dsw-alias-brand-primary);opacity:1}
  .sc-edge.temp{stroke:var(--dsw-alias-brand-primary);stroke-dasharray:5 4;opacity:1}
  .sc-edgehit{fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}
  .sc-arrowhead{fill:var(--dsw-alias-label-secondary)}
  .sc-arrowhead-on{fill:var(--dsw-alias-brand-primary)}
  .sc-scrim{position:absolute;inset:0;background:rgba(0,0,0,.32);opacity:0;transition:opacity .24s ease;pointer-events:none}
  .sc-scrim.on{opacity:1}

  /* 卡片（章节 / 节点 / 条件 / 结果共用外壳）。
     这里必须是 overflow:visible：分歧节点的选项列是「贴在卡片右侧」的（left:100%），
     卡片一旦自己裁溢出，整列选项连同它们的出口圆点会被裁得干干净净 —— 画布上看起来
     就是「分歧节点右边什么都没有」；接口圆点也会一起被裁成半个。 */
  .sc-card{position:absolute;box-sizing:border-box;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 2px 8px rgba(0,0,0,.14);padding:8px 10px;cursor:grab;user-select:none;touch-action:none;overflow:visible;transition:box-shadow .15s,border-color .15s}
  .sc-card:hover{border-color:var(--dsw-alias-label-secondary)}
  .sc-card.on{border-color:var(--sc-accent,var(--dsw-alias-brand-primary));box-shadow:0 0 0 2px var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-card.dye{border-color:var(--sc-accent);background:color-mix(in srgb,var(--sc-accent) 9%,var(--dsw-alias-bg-base))}
  .sc-card.dim{opacity:.35}
  .sc-cardtitle{font-size:12.5px;font-weight:600;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-cardrow{display:flex;align-items:baseline;gap:6px;min-width:0}
  .sc-cardcode{flex:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;font-weight:700;color:var(--sc-accent,var(--dsw-alias-brand-primary));letter-spacing:.02em}
  .sc-cardname{flex:1;min-width:0;font-size:12.5px;font-weight:600;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .sc-cardwhen{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
  /* 简介钉在卡片下沿：卡片改成竖版（宽 176/156/144、高 120/112/86）之后，标题和标签
     只占上半张，简介留在标题下面会有一大块空 —— auto 上边距把它压到下沿，
     跟方片页的方片是同一个观感。 */
  .sc-cardsum{margin-top:auto;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  /* 条件 / 结果卡片只有两行字，竖版卡片里竖直居中 */
  .sc-cardcenter{display:flex;flex-direction:column;justify-content:center;height:100%;gap:2px}
  .sc-cardmono{margin-top:5px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-cardkind{font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
  .sc-cardbody{margin-top:6px;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-primary);overflow:auto;flex:1;min-height:0}
  .sc-cardsec{margin-top:6px}
  .sc-cardsecname{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-label-secondary);margin-bottom:2px}
  .sc-cardlist{margin:0;padding-left:14px}
  .sc-cardlist li{font-size:11.5px;line-height:1.6}
  /* 接口圆点：整个圆 + 空心（底是卡片自己的底色，只有一圈本色描边）。
     三件事缺一不可，少一件就「不是正圆」：
     ① 16px 偶数、偏移 ±8px 整数 —— 圆心落在整数像素上（半像素的圆栅格化后是发虚的椭圆；
        选项行以前是 padding 撑出的 28.67px，正是这里出的问题）；
     ② 描边 **1px** —— 2px 的圈套在 16px 的点上，1 倍缩放下栅格化成一个厚重的八边形
        （放大 10 倍看就是一个多边形的甜甜圈），细圈才读得出「是个圆」；
     ③ 尺寸恒定、不用 transform 缩放（scale(1.3) 那种同样会发虚）。
     悬停 / 选中时整亮；被当目标时整颗填实。 */
  .sc-port{position:absolute;top:50%;margin-top:-8px;width:16px;height:16px;box-sizing:border-box;padding:0;border-radius:50%;background:var(--dsw-alias-bg-base);border:1px solid var(--sc-accent,var(--dsw-alias-brand-primary));cursor:crosshair;opacity:.9}
  .sc-port.in{left:-8px}
  .sc-port.out{right:-8px}
  .sc-card:hover .sc-port,.sc-card.on .sc-port{opacity:1}
  .sc-port.hot{opacity:1;background:var(--sc-accent,var(--dsw-alias-brand-primary))}
  /* 连线标签：HTML 层，跟着画布一起平移缩放。平时线上什么都没有，**点一下那条线**，
     它才浮出一个输入框（用户的要求：不选中的时候直接隐藏）；已经起过名字的线，名字
     一直挂着，点名字改。
     ⚠ 它必须是 .sc-stage 的直接子元素：塞进连线的 <svg> 里浏览器根本不画（0×0、点不到）。
     z-index：DOM 上它在卡片前面，但线的中点常落在卡片底下，不给它抬起来就会被卡片压住 ——
     输入框只露半个（用户报的「输入框图层在最底下，看不全」）。6 高过卡片（auto）和
     选项列（2），但低于展开的大卡片（30）。 */
  .sc-elabel{position:absolute;z-index:6;transform:translate(-50%,-50%);font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
  .sc-elabel:hover{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}
  .sc-elabel.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
  /* 起名字用的输入框：宽度跟标签一致，选中时才出现，别把画布撑出任何东西 */
  .sc-elabeledit{z-index:7;width:118px;padding:2px 8px;font-family:inherit;outline:none;color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);cursor:text}
  .sc-elabeledit::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}

  /* 分歧节点的选项：贴在卡片右侧。整列按「选项本身」的高度上下居中，下面的 ＋ 按钮
     挂在最后一个选项下面、不参与居中（用户的要求：居中的选项不包括 ＋，但 ＋ 照样在）。
     没有布局引擎可测量，所以列顶由 JS 算出来写成行内 top —— 连线起点用的是同一套几何，
     两边不会各说各话。
     ⚠ 这一列（以及里面的选项）都不能写 overflow:hidden：出口圆点有一半在盒子外面，
     谁裁溢出，圆点就被裁成半个（卡片上刚踩过一模一样的坑）。 */
  .sc-choices{position:absolute;left:100%;margin-left:14px;width:170px;display:flex;flex-direction:column;gap:5px;z-index:2}
  /* 选项行高固定 30px、单行不换行（超长省略号，悬停看 title，展开卡片里读全文）。
     行高一浮动，后面的行、出口圆点、连线起点就全对不上。 */
  .sc-choice{position:relative;box-sizing:border-box;height:30px;display:flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);padding:0 8px;font-size:11.5px;line-height:1.45;cursor:pointer}
  .sc-choice:hover{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choice.on{border-color:var(--sc-accent,var(--dsw-alias-brand-primary));color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choicetext{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .sc-choice .sc-port{top:50%;margin-top:-8px;opacity:1}
  .sc-choice .sc-choicego{flex:none;opacity:.75}
  .sc-choice.linked{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choiceadd{box-sizing:border-box;height:30px;border:1px dashed var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:inherit;padding:0 8px;cursor:pointer;text-align:left}
  .sc-choiceadd:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}

  /* 章节卡片的节点列表（展开态）：一次最多显示 5 行，剩下的用滑条 */
  .sc-nodelist{margin-top:6px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1;min-height:0;max-height:106px}
  .sc-nodelist::-webkit-scrollbar{width:5px}
  .sc-nodelist::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
  .sc-nodelistrow{display:flex;align-items:baseline;gap:6px;font-size:11px;line-height:1.4;padding:2px 5px;border-radius:6px;cursor:pointer}
  .sc-nodelistrow:hover{background:var(--dsw-alias-bg-layer-2)}
  .sc-nodelistrow .n{flex:none;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
  .sc-nodelistrow .t{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

  /* 展开态：从「全屏遮罩里的大卡片」改成**浮动窗口**（用户拍板）。
     默认 .sc-float：拖标题栏移动、右下角手柄缩放，画布照样能拖能滚，可以同时开好几个
     （钉住的不会被自动收起）。.sc-full 是老的全屏遮罩模式：背景变暗、画布锁定，
     由 .sc-scrim 那一层盖住，位置固定不做拖动 —— 大段写文档时更专注。 */
  .sc-expand{position:absolute;box-sizing:border-box;border-radius:14px;border:1px solid var(--sc-accent,var(--dsw-alias-brand-primary));background:var(--dsw-alias-bg-base);box-shadow:0 18px 50px rgba(0,0,0,.4);padding:16px 18px;display:flex;flex-direction:column;z-index:30;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1)}
  .sc-expand.open{box-shadow:0 26px 70px rgba(0,0,0,.5)}
  /* 浮动态：更像一块「贴在上面」的窗口，四角方一点、投影实一点 */
  .sc-expand.sc-float{border-radius:12px;box-shadow:0 20px 44px rgba(0,0,0,.38)}
  .sc-expand.sc-float.open{box-shadow:0 30px 80px rgba(0,0,0,.55)}
  .sc-expandh{display:flex;align-items:center;gap:8px;flex:none;padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:8px;
    /* 标题栏是抓手：拖动时不许选中文字，把它自己吃掉（拖完那一下 click 由 85-boardview 吃） */
    cursor:move;-webkit-user-select:none;user-select:none;touch-action:none}
  .sc-expand.sc-full .sc-expandh{cursor:default}
  .sc-expand h3{margin:0;font-size:16px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sc-expandx{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:17px;line-height:1;cursor:pointer;font-family:inherit;padding:0 2px;flex:none}
  .sc-expandx:hover{color:var(--dsw-alias-label-primary)}
  /* 标题栏上的小按钮（图钉 / 全屏-浮动） */
  .sc-expandb{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1;font-family:inherit;cursor:pointer;padding:3px 5px;border-radius:6px;flex:none;display:inline-flex;align-items:center}
  .sc-expandb:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
  .sc-expandb.on{color:var(--dsw-alias-brand-primary)}
  /* 右下角的缩放手柄：只是几道斜线，够认出「这里能拖大」就行 */
  .sc-expandgrip{position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;touch-action:none;-webkit-user-select:none;user-select:none;border-bottom-right-radius:11px;
    background:
      linear-gradient(135deg,transparent 0 52%,var(--dsw-alias-border-l2) 52% 64%,transparent 64%),
      linear-gradient(135deg,transparent 0 74%,var(--dsw-alias-border-l2) 74% 86%,transparent 86%)}
  .sc-expandbody{flex:1;min-height:0;overflow:auto;font-size:12.5px;line-height:1.75}

  /* 页签（浮层的「卡片 | 文档」、编辑弹窗的「字段 | 文档」） */
  .sc-tabs{display:flex;gap:2px;flex:none;margin-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
  .sc-modalbox > .sc-tabs{padding:0 16px;margin-bottom:0;border-bottom:1px solid var(--dsw-alias-border-l1)}
  .sc-tab{border:none;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;padding:4px 10px;cursor:pointer;border-radius:6px 6px 0 0;white-space:nowrap}
  .sc-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
  .sc-tab.on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}

  /* 卡片文档编辑器（src/92-doc.js）：等宽、跟着容器高、自己滚。
     两处复用：展开浮层的「文档」页签、编辑弹窗的「文档」页签。 */
  .sc-doc{display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;height:100%}
  .sc-docbar{display:flex;align-items:center;gap:6px;flex:none}
  .sc-docstate{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
  .sc-docstate.dirty{color:var(--dsw-alias-brand-primary)}
  .sc-docstate.bad{color:var(--dsw-alias-state-error-primary)}
  .sc-docpath{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* 「正在写：勿忘我」—— 台词 / 旁白状态下状态栏里那枚小标签。
     Enter 结束这个角色、Shift+Enter 继续同一个角色，鼠标悬停有说明。 */
  .sc-docrole{flex:none;font-size:10.5px;line-height:16px;padding:0 8px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2)}
  /* 菜单里的筛选框（文档的人物菜单）：菜单宽 172 起，别让它撑破 */
  .sc-menuinput{margin:2px 0 4px;width:100%;font-size:12px;padding:4px 8px}
  /* 文档里的输入区：**两层** —— 底下 .sc-dochl 是彩色的高亮层，上面 .sc-docarea 的
     文字是透明的（caret-color 单独给），用户看到的就是「名字有颜色」。
     两层必须有**同一套排版**：字体 / 字号 / 行高 / 内边距 / letter-spacing / 折行规则
     一条不差，差一点光标和文字就错位。所以下面这两条规则成对写，改一条就得改另一条。
     滚动条那几像素由 JS 按实测宽度补给高亮层（见 92-doc.js 的 paddingRight effect）。 */
  .sc-dochlwrap{position:relative;flex:1;min-height:160px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:8px;overflow:hidden}
  .sc-dochlwrap:focus-within{border-color:var(--dsw-alias-brand-primary)}
  .sc-dochl,.sc-docarea{box-sizing:border-box;position:absolute;left:0;top:0;width:100%;height:100%;margin:0;border:none;padding:8px 10px;font-size:12px;line-height:1.75;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:normal;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word}
  .sc-dochl{overflow:hidden;color:var(--dsw-alias-label-primary);pointer-events:none}
  .sc-docarea{display:block;overflow-y:scroll;overflow-x:hidden;background:transparent;color:transparent;caret-color:var(--dsw-alias-label-primary);resize:none;outline:none}
  .sc-docarea::-webkit-scrollbar{width:10px}
  .sc-docarea::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:5px}
  .sc-docarea::-webkit-scrollbar-track{background:transparent}
  .sc-docarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}
  /* 选区：文字是透明的，所以底色必须**半透明** —— 实心色块会把底下高亮层的字整个盖住，
     看起来就是「一坨色块」。半透明的牌子色既看得见选区，又透得出字。 */
  .sc-docarea::selection{background:rgba(127,160,255,.35);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);color:transparent}
  /* 名字只染颜色、**不换字重**：粗体在两层的字宽可能不一致，一不一致折行位置就错开。
     旁白行首那两个全角空格暗一点，看着像缩进。 */
  .sc-docquiet{color:var(--dsw-alias-label-secondary);opacity:.55}
  .sc-docro{flex:none;font-size:10.5px;line-height:1.55;color:var(--dsw-alias-state-error-primary)}
  /* 文档页要占满：让里面的 textarea 自己滚（字段页 / 卡片页照旧整块滚） */
  .sc-expandbody.sc-docbody{display:flex;flex-direction:column;overflow:hidden}
  .sc-modalb.sc-modalfill{display:flex;flex-direction:column;overflow:hidden}
  /* 「这张卡有文档」的小角标（画布卡片与方片页卡片的右上角）。
     往外挪 4px：节点卡右上角是时间文字，摆在卡片里面会把它挤走；
     卡片的 overflow 是 visible，露在角上正好。 */
  .sc-docdot{position:absolute;right:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--sc-accent,var(--dsw-alias-brand-primary));box-shadow:0 0 0 2px var(--dsw-alias-bg-base);pointer-events:none;z-index:3}

  /* ── 引用卡（「存档卡抽屉」拖进来的那些） ─────────────────────────────────────
     它不是这块画布上的卡：不连线、不参与自动排列、双击只有只读详情。
     「引用」角标挂在**左下角** —— 右上角是「有文档」.sc-docdot 的地盘，两个不许撞。 */
  .sc-refcard{border-style:dashed}
  .sc-refkind{flex:none;font-size:10.5px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}
  .sc-refbadge{position:absolute;left:-4px;bottom:-4px;padding:0 5px;border-radius:999px;font-size:9.5px;line-height:15px;
    color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border:1px dashed var(--dsw-alias-border-l2);pointer-events:none}
  .sc-reftag{border-style:dashed;color:var(--dsw-alias-label-secondary)}

  /* 存档卡抽屉：浮在画布右侧、不挤布局；它上面的按下/拖动不是画布手势 */
  .sc-drawer{position:absolute;right:10px;top:10px;bottom:10px;z-index:40;box-sizing:border-box;padding:0 10px 10px;
    border-radius:12px;border:1px solid var(--dsw-alias-border-l2);
    background:var(--dsw-alias-bg-base);box-shadow:0 18px 44px rgba(0,0,0,.4);
    overflow-y:auto;overscroll-behavior:contain;-webkit-user-select:none;user-select:none}
  .sc-drawersticky{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);padding:10px 0 6px}
  .sc-drawerhead{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding-bottom:6px}
  .sc-drawerhead2{font-size:10.5px;letter-spacing:.08em;font-weight:600;color:var(--dsw-alias-label-secondary);padding:8px 2px 4px}
  .sc-draweritem{display:flex;align-items:baseline;gap:6px;padding:5px 8px;border-radius:8px;border:1px solid transparent;cursor:grab;touch-action:none}
  .sc-draweritem:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}
  .sc-draweritemtitle{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sc-draweritemkind{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary)}
  .sc-drawerhint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);padding-top:8px}
  /* 从抽屉拖出来的幽灵：跟目标卡一样大、半透明 */
  .sc-ghost.reffrom{opacity:.7;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);display:flex;align-items:center;justify-content:center}

  /* 右键菜单 */
  .sc-menuback{position:fixed;inset:0;z-index:99996}
  .sc-menu{position:fixed;z-index:99998;min-width:172px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 12px 34px rgba(0,0,0,.34);padding:5px;font-size:12.5px}
  .sc-menuitem{display:flex;align-items:center;gap:8px;padding:5px 9px;border-radius:7px;cursor:pointer;white-space:nowrap;color:inherit;background:transparent;border:none;font-family:inherit;font-size:12.5px;width:100%;text-align:left}
  .sc-menuitem:hover{background:var(--dsw-alias-bg-layer-2)}
  .sc-menuitem[disabled]{opacity:.4;cursor:default}
  .sc-menuitem[disabled]:hover{background:transparent}
  .sc-menuitem .k{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
  .sc-menusep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px}
  .sc-menuhead{padding:4px 9px 6px;font-size:10.5px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}
  .sc-submenu{position:fixed;z-index:99999;min-width:150px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 12px 34px rgba(0,0,0,.34);padding:5px;font-size:12.5px}
  .sc-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px 9px 8px}
  .sc-swatch{width:24px;height:24px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);cursor:pointer;padding:0}
  .sc-swatch:hover{transform:scale(1.1)}
  .sc-swatchsel{box-shadow:0 0 0 2px var(--dsw-alias-bg-base),0 0 0 4px var(--dsw-alias-brand-primary)}
  .sc-colorrow{display:flex;align-items:center;gap:8px;padding:4px 9px 7px}
  .sc-colorinput{width:38px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;cursor:pointer}

  /* 状态栏 */
  .sc-status{display:flex;align-items:center;gap:10px;padding:4px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none}
  .sc-status .sp{flex:1}
  .sc-zoombar{display:flex;align-items:center;gap:4px;flex:none}

  /* 底部堆叠条（iOS 后台那股味道） */
  .sc-dock{flex:none;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);padding:6px 10px 8px}
  .sc-dockhead{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-bottom:5px}
  .sc-dockstrip{position:relative;height:80px;overflow-x:auto;overflow-y:hidden}
  .sc-dockstrip::-webkit-scrollbar{height:5px}
  .sc-dockstrip::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
  .sc-dockinner{position:relative;height:100%}
  .sc-dockcard{position:absolute;top:4px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 7px rgba(0,0,0,.16);padding:7px 8px;box-sizing:border-box;cursor:pointer;overflow:hidden;transition:transform .12s;touch-action:none;user-select:none}
  .sc-dockcard:hover{transform:translateY(-7px) scale(1.05);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
  .sc-dockcardtitle{font-size:11px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-dockcardwhen{margin-top:3px;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .sc-ghost{border-radius:12px;border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);box-shadow:0 10px 26px rgba(0,0,0,.36);opacity:.94;pointer-events:none;z-index:99999;padding:7px 8px;box-sizing:border-box}

  /* 面板主体容器 */
  .sc-bodycol{display:flex;flex-direction:column;flex:1;min-height:0}

  /* 对话框：宽度和展开的卡片一样（PANEL_W = 460，见 src/00-head.js），
     而且用 border-box —— 那句 width 是「整块多宽」，跟 .sc-expand 一个口径，
     不然外面再加上 1px 描边就变成 462，和展开的卡片差 2px。
     以前对话框是 380 / 420 / 520 各一档，点来点去界面宽度一直在变。 */
  .sc-modal{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px}
  .sc-modalbox{box-sizing:border-box;width:460px;max-width:100%;max-height:100%;display:flex;flex-direction:column;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
  .sc-modalh{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-modalh h3{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sc-modalb{padding:14px 16px;overflow:auto;flex:1;min-height:0}
  .sc-modalf{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-frow{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap}
  .sc-frow:last-child{margin-bottom:0}
  .sc-field{display:flex;flex-direction:column;gap:4px;min-width:0}
  .sc-lbl{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.4}
  /* box-sizing:border-box 不能少：width:100% 的输入框再加上左右内边距和描边，
     会比容器宽出 18px —— 对话框里就多出一条横向滚动条（用户报的「下面还有一个滑条，
     很明显没有必要」）。 */
  .sc-inp{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:5px 8px;font-size:12.5px;font-family:inherit;outline:none;min-width:0}
  .sc-inp:focus{border-color:var(--dsw-alias-brand-primary)}
  .sc-inp.num{width:72px}
  .sc-inp.wide{width:230px}
  .sc-inp.full{width:100%}
  .sc-area{box-sizing:border-box;width:100%;min-height:200px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.7;font-family:ui-monospace,Menlo,Consolas,monospace;outline:none}
  .sc-area:focus{border-color:var(--dsw-alias-brand-primary)}
  .sc-hintbox{margin-top:8px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
  .sc-code{background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.94em}
  `

    // ═══ src/20-util.js ═════════════════════════════════════════════════
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

  // 显示宽度（只用来算「续行要补几个全角空格」）：CJK 记 1、ASCII 记 0.5。
  // 半角片假名（U+FF61–U+FF9F）按 1 算 —— 名字里出现它的概率极低，不值得为它多一条分支。
  function textWidth(s) {
    let w = 0
    for (const ch of String(s == null ? '' : s)) w += ch.codePointAt(0) < 0x80 ? 0.5 : 1
    return w
  }

  /** n 个全角空格（旁白的行首、台词的续行缩进都用它）。 */
  function wideSpaces(n) {
    let out = ''
    for (let i = 0; i < Math.max(0, Math.round(n)); i++) out += '　'
    return out
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

    // ═══ src/30-model.js ════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 卡片模型
  //
  // 卡片分两族，互不串门（要求 4）：
  //   存档族 project/character/setting/scene/beat/dialogue/open/decision/reference
  //          —— 只出现在「方片」页，是「关于故事的描述」
  //   分支族 chapter/node/condition/result
  //          —— 只出现在「分支」页，是「故事的结构」
  //
  // 内容（标题/序号/时间/简介/标签/正文）在卡片文件里；
  // 结构（所属章节、画布坐标、选项与连线、染色）在 <工作区>/剧本档案/分支.json 里。
  // 两者都落盘、都能进 git。
  // ══════════════════════════════════════════════════════════════════════════════

  const ARCHIVE_ORDER = ['project', 'character', 'setting', 'scene', 'beat', 'dialogue', 'open', 'decision', 'reference']
  const ARCHIVE_LABEL = {
    project: '项目', character: '人物', setting: '设定', scene: '场次', beat: '结构节拍',
    dialogue: '台词素材', open: '待定问题', decision: '创作决定', reference: '参考资料', archive: '会话归档',
  }

  const BRANCH_TYPES = ['chapter', 'node', 'condition', 'result']
  const BRANCH_LABEL = { chapter: '章节', node: '节点', condition: '条件', result: '结果' }
  const BRANCH_ORDER = ['chapter', 'node', 'condition', 'result']

  function isBranchType(type) { return BRANCH_TYPES.indexOf(String(type || '')) !== -1 }

  function typeLabel(type) { return ARCHIVE_LABEL[type] || BRANCH_LABEL[type] || String(type || '') }

  // 只有 chapter 是「容器」，node/condition/result 是章节里的内容。
  function isContainer(type) { return String(type) === 'chapter' }

  // 哪种卡片有「一份独立文档」：只有章节与节点两类。
  // 条件 / 结果卡片只有两行字，展开浮层也就是一屏之内的事，不给文档入口 ——
  // 入口一多，画布上那几张小卡片反而要找半天。其它类型更不给。
  function docCapable(type) { return String(type) === 'chapter' || String(type) === 'node' }

  // 连线端点：条件卡只有右端口（出口），结果卡只有左端口（入口）。
  function canOut(type) { return String(type) !== 'result' }
  function canIn(type) { return String(type) !== 'condition' }

  function cardKey(c) { return (c.kind === 'archive' ? 'archive/' : 'card/') + c.file }

  function keyOf(file, kind) { return (kind === 'archive' ? 'archive/' : 'card/') + file }

  function cardCode(c) { return String((c && c.code) || '') }
  function cardName(c) { return String((c && c.title) || '') }
  function cardDisplay(c) {
    const code = cardCode(c)
    return code ? code + ' ' + cardName(c) : cardName(c)
  }

  // ── 说话人（文档里的台词结构） ────────────────────────────────────────────────
  //
  // 名字取人物卡 title 里**第一个 （ 或 ( 之前**的那一段：`勿忘我（ワスレナグサ）` → `勿忘我`，
  // `幻驹山茶（ゲンク サザンカ）` → `幻驹山茶`；标题里没有括号就用整个标题。
  // 取本名是因为前缀要写成 `「勿忘我」：`，把括号里的注音一起塞进去就不像台词了。
  function speakerName(card) {
    const raw = String((card && (card.title || card.file)) || '').trim()
    const i = raw.search(/[（(]/)
    const name = (i === -1 ? raw : raw.slice(0, i)).trim()
    return name || String((card && card.file) || '').replace(/\.md$/, '')
  }

  /**
   * 说话人的颜色：**同一个来源**给两处用 —— 文档里台词名字的着色、方片页那个设色入口。
   *   ① 人物卡 frontmatter 的 `color`（面板给人物卡设的「角色色」，随卡片文件进 git）
   *   ② 没有就解析 tags 里的 `印象色#RRGGBB`（这套写法用户早就在用了，代码以前从没读过）
   *   ③ 两样都没有 → 空串（不染色，用正文色）
   * 解析不出来不报错：颜色是锦上添花，不该让它挡住台词。
   */
  function speakerColor(card) {
    const raw = String((card && card.color) || '').trim()
    if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw
    for (const t of (card && card.tags) || []) {
      const m = /印象色\s*#([0-9a-fA-F]{3,8})/.exec(String(t))
      if (m) return '#' + m[1]
    }
    return ''
  }

  /**
   * 人物在**台词菜单**里属于哪一组（用户拍板的判据）：
   *   主角组 = tags 里有 主角 / 真女主 / 攻略对象；配角组 = tags 里有 配角；其余进「其他」。
   * 两类都沾的算主角（先判主角）。tags 的分隔不管逗号还是空格都要认 —— `.tags` 已经是数组
   * （tagsOf 按逗号分过一次），数组项里还可能用空格再分，所以拼成一串再找关键词。
   * ⚠ 只用于台词右键菜单的分组；方片页的分组与顺序**一个都不许动**。
   */
  const LEAD_TAGS = ['主角', '真女主', '攻略对象']
  const SUPPORT_TAG = '配角'

  function speakerGroup(card) {
    const all = ' ' + ((card && card.tags) || []).join(' ') + ' '
    for (const k of LEAD_TAGS) if (all.indexOf(k) !== -1) return 'lead'
    if (all.indexOf(SUPPORT_TAG) !== -1) return 'support'
    return 'other'
  }

  /**
   * 文档右键菜单里的「全部人物」：只认存档族的 `type: character`，
   * **不认**台词素材（`dialogue`）—— 那是台词库，不是说话的人。
   * 返回 [{ name, color, group }]（组内按名字排），名字去重（同名以先出现的为准）。
   */
  function speakerList(cards) {
    const out = []
    const seen = {}
    for (const c of cards || []) {
      if (!c || c.type !== 'character') continue
      const n = speakerName(c)
      if (!n || seen[n]) continue
      seen[n] = true
      out.push({ name: n, color: speakerColor(c), group: speakerGroup(c) })
    }
    return out.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh') })
  }

  // ── 结构图谱 ──────────────────────────────────────────────────────────────────

  function emptyGraph() {
    return { version: 1, chapters: [], nodes: {}, edges: [], refs: {} }
  }

  function normGraph(raw) {
    const out = emptyGraph()
    if (!raw || typeof raw !== 'object') return out
    const nodes = raw.nodes && typeof raw.nodes === 'object' ? raw.nodes : {}
    for (const k of Object.keys(nodes)) {
      const v = nodes[k]
      if (!v || typeof v !== 'object') continue
      const rec = { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '' }
      if (isFinite(Number(v.x))) rec.x = Number(v.x)
      if (isFinite(Number(v.y))) rec.y = Number(v.y)
      if (isFinite(Number(v.cx))) rec.cx = Number(v.cx)
      if (isFinite(Number(v.cy))) rec.cy = Number(v.cy)
      if (typeof v.chapter === 'string') rec.chapter = v.chapter
      if (v.mode === 'branch') rec.mode = 'branch'
      if (typeof v.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.color.trim())) rec.color = v.color.trim()
      if (v.collapsed === true) rec.collapsed = true
      const choices = []
      if (Array.isArray(v.choices)) {
        for (const ch of v.choices) {
          if (!ch || typeof ch !== 'object') continue
          choices.push({ id: String(ch.id || uid('o')), text: String(ch.text == null ? '' : ch.text), to: String(ch.to || '') })
        }
      }
      rec.choices = choices
      out.nodes[k] = rec
    }
    const chapters = []
    if (Array.isArray(raw.chapters)) {
      for (const k of raw.chapters) if (typeof k === 'string' && chapters.indexOf(k) === -1) chapters.push(k)
    }
    const edges = []
    if (Array.isArray(raw.edges)) {
      for (const e of raw.edges) {
        if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue
        if (e.from === e.to) continue
        const choice = e.choice == null ? '' : String(e.choice)
        // 去重必须带上 choice：两个不同的选项指向同一张卡是合法的（选项A、选项B 都通向
        // 「结果」），早先只按 from+to 去重，第二次读盘时那条线就被自己吃掉了 —— 卡片上
        // 看着「选项B 已经连了」，线上却没有那条线（用户报的连接 bug）。
        if (edges.some(function (x) { return x.from === e.from && x.to === e.to && x.choice === choice })) continue
        edges.push({ from: e.from, to: e.to, label: e.label == null ? '' : String(e.label), choice: choice })
      }
    }
    out.nodes = out.nodes
    out.chapters = chapters
    out.edges = edges
    out.refs = normRefs(raw.refs)
    return out
  }

  /**
   * 引用卡的位置表（`分支.json` 顶层 `refs`）：
   *   refs[ctxKey][cardKey] = { x, y, color? }
   *   ctxKey：'top'＝顶层章节画布；节点画布＝该章节卡的 cardKey（`card/chapter-*.md`）。
   *           同一张卡在「顶层」与「某章节的节点画布」上各存一份位置，互不相撞。
   *   color ：可选的手染强调色；没写就用角色色（frontmatter color → tags 印象色#）。
   * 老文件没有 refs 也照旧能读（归一成空表）。
   */
  function normRefs(raw) {
    const out = {}
    if (!raw || typeof raw !== 'object') return out
    for (const ctx of Object.keys(raw)) {
      const one = raw[ctx]
      if (!ctx || !one || typeof one !== 'object') continue
      const cards = {}
      for (const k of Object.keys(one)) {
        const v = one[k]
        if (!k || !v || typeof v !== 'object') continue
        const x = Number(v.x)
        const y = Number(v.y)
        if (!isFinite(x) || !isFinite(y)) continue
        const rec = { x: x, y: y }
        const col = String(v.color == null ? '' : v.color).trim()
        if (/^#[0-9a-fA-F]{3,8}$/.test(col)) rec.color = col
        cards[k] = rec
      }
      // 空 ctx 不写进去：别在文件里留半截结构
      if (Object.keys(cards).length) out[ctx] = cards
    }
    return out
  }

  /** 某个画布上的引用表（没有就是空对象）。 */
  function refsOf(graph, ctx) {
    return (graph && graph.refs && graph.refs[ctx]) || {}
  }

  /** 取一份引用记录（没有就返回 null）。 */
  function refRec(graph, ctx, key) {
    const one = refsOf(graph, ctx)[key]
    return one || null
  }

  /**
   * 生成一份**新的** refs 表：把 key 设成 rec（rec 传 null 表示删掉），空 ctx 自动去掉。
   * 引用位置只写这里 —— **绝不碰 `nodes` 里被引用卡自己的 x/y/cx/cy**。
   */
  function patchRefs(graph, ctx, key, rec) {
    const out = {}
    const old = (graph && graph.refs) || {}
    for (const c of Object.keys(old)) out[c] = Object.assign({}, old[c])
    if (!out[ctx]) out[ctx] = {}
    if (rec) out[ctx][key] = rec
    else {
      delete out[ctx][key]
      if (!Object.keys(out[ctx]).length) delete out[ctx]
    }
    return out
  }

  /** 复制一份图谱（只改要改的那部分，refs 一起带上，别把引用冲掉）。 */
  function graphWith(graph, patch) {
    const out = {
      version: 1,
      chapters: (graph.chapters || []).slice(),
      nodes: Object.assign({}, graph.nodes || {}),
      edges: (graph.edges || []).slice(),
      refs: Object.assign({}, graph.refs || {}),
    }
    return patch ? Object.assign(out, patch) : out
  }

  function nodeRec(graph, key) {
    const rec = graph && graph.nodes ? graph.nodes[key] : null
    return rec || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
  }

  // 卡片文件被删掉之后，图谱里对应的记录与连线要一起清掉，免得留下断头线；
  // 引用也一样（卡片没了引用就自动消失，空 ctx 一起删）。
  function pruneGraph(g, validKeys) {
    let changed = false
    const nodes = {}
    for (const k of Object.keys(g.nodes)) {
      if (validKeys[k] === true) nodes[k] = g.nodes[k]
      else changed = true
    }
    const chapters = g.chapters.filter(function (k) { return nodes[k] && nodes[k] !== undefined && validKeys[k] === true })
    if (chapters.length !== g.chapters.length) changed = true
    const edges = g.edges.filter(function (e) { return nodes[e.from] && nodes[e.to] })
    if (edges.length !== g.edges.length) changed = true
    for (const k of Object.keys(nodes)) {
      const rec = nodes[k]
      if (!rec.choices || !rec.choices.length) continue
      const kept = rec.choices.filter(function (c) { return !c.to || !!nodes[c.to] })
      if (kept.length !== rec.choices.length) { nodes[k] = Object.assign({}, rec, { choices: kept }); changed = true }
    }
    const oldRefs = g.refs || {}
    const refs = {}
    for (const ctx of Object.keys(oldRefs)) {
      const one = oldRefs[ctx] || {}
      const cards = {}
      for (const k of Object.keys(one)) {
        if (validKeys[k] === true) cards[k] = one[k]
        else changed = true
      }
      if (Object.keys(cards).length) refs[ctx] = cards
      else if (Object.keys(one).length) changed = true
    }
    if (Object.keys(oldRefs).length !== Object.keys(refs).length) changed = true
    // 「没变化就返回原对象」这条不能破：95-panel 靠 pruned !== fallback 决定要不要回写
    if (!changed) return g
    return { version: 1, chapters: chapters, nodes: nodes, edges: edges, refs: refs }
  }

  // 章节的顺序：先按图谱里的 chapters 显式顺序，其余按序号（G1.1 < G1.2）再按标题。
  function chapterSort(a, b, graph) {
    const ca = String(cardCode(a) || '')
    const cb = String(cardCode(b) || '')
    const ka = codeSortKey(ca)
    const kb = codeSortKey(cb)
    if (ka !== null && kb !== null && ka !== kb) return ka - kb
    if (ka !== null && kb === null) return -1
    if (ka === null && kb !== null) return 1
    const oa = orderOf({ order: a.order })
    const ob = orderOf({ order: b.order })
    if (oa !== null && ob !== null && oa !== ob) return oa - ob
    if (oa !== null && ob === null) return -1
    if (oa === null && ob !== null) return 1
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh')
  }

  function chaptersInOrder(cards, graph) {
    const list = cards.filter(function (c) { return c.type === 'chapter' })
    const rank = {}
    ;(graph && graph.chapters ? graph.chapters : []).forEach(function (k, i) { rank[k] = i })
    return list.sort(function (a, b) {
      const ra = rank[cardKey(a)]
      const rb = rank[cardKey(b)]
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb
      if (ra !== undefined && rb === undefined) return -1
      if (ra === undefined && rb !== undefined) return 1
      return chapterSort(a, b, graph)
    })
  }

  // 一个章节内部的情节顺序：先看图谱给的手工序（order），再按卡片 order，再按时间。
  function nodesOfChapter(cards, graph, chapterKey) {
    const list = cards.filter(function (c) {
      if (c.type !== 'node' && c.type !== 'condition' && c.type !== 'result') return false
      return nodeRec(graph, cardKey(c)).chapter === chapterKey
    })
    return list.sort(function (a, b) {
      const oa = orderOf({ order: a.order })
      const ob = orderOf({ order: b.order })
      if (oa !== null && ob !== null && oa !== ob) return oa - ob
      if (oa !== null && ob === null) return -1
      if (oa === null && ob !== null) return 1
      return String(a.when || '').localeCompare(String(b.when || ''), 'zh')
    })
  }

    // ═══ src/40-store.js ════════════════════════════════════════════════
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

    // ═══ src/50-api.js ══════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 数据访问
  //
  // 读：优先走宿主半边的落盘桥（一次调用拿回文本），桥不可用时退回客户端自带的
  //     只读 remote `remote.workspaceFiles`。
  // 写：只有桥能做。桥不可用时面板进入只读模式，图谱退到浏览器 localStorage，
  //     并在顶部把原因写清楚。
  //
  // 档案目录名不是写死的：api.setDirs() 由面板传入（默认 剧本档案 / 卡片 / 归档），
  // 所有路径都从它拼出来。
  // ══════════════════════════════════════════════════════════════════════════════

  // ── 宿主半边的落盘桥（Typert 网关） ──────────────────────────────────────────
  //
  // 宿主半边 lib/index.js 用 ctx.provide('scriptCardsFs', ...) 注册服务，lib/typert.js
  // 提供清单；这边要把**同一份清单的客户端版本**用 ctx.remote.$mount(...) 挂上去，
  // 之后 ctx.get('remote.scriptCardsFs') 就是可调用的代理。
  //
  // 客户端清单里的 codec 不需要真的 zod：网关只在参数入口调 codec.schema.parse，
  // 所以给一个恒等 parse 就够了（宿主编译期清单用的是真 zod，见 lib/typert.js）。
  //
  // ⚠ 方法名不能撞 RemoteNamespaceService 的保留名。网关挂载前会跑
  //   `assertMethodAvailable`：REMOTE_NAMESPACE_FIELDS（ctx / empty / invokeRemote /
  //   methods / name / namespace）以及原型上的任何名字都拒。**`remove` 就在原型上**，
  //   v0.1.0-alpha.1 第一版因此 $mount 直接抛错、命名空间没装成，面板整体只读。
  //   所以这里六个方法统一 `fs` 前缀，并在 tests/host.mjs 里断言它们不撞保留名。
  //
  // 每个方法第一个参数都是 `root`（档案目录的绝对路径），宿主半边据此划定边界：
  // 所有读写必须落在 root 之内。这样宿主不需要知道目录叫什么名字。

  const REMOTE_RESERVED = ['ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace',
    'install', 'installDirect', 'installScoped', 'remove', 'has', 'assertMethodAvailable', 'dispose', 'start', 'stop']

  function clientCodec(typeSymbol) {
    return {
      mode: 'strict',
      typeSymbol: 'dsh-script-cards#' + typeSymbol,
      schema: { parse: function (v) { return v } },
      create: function () { return { parse: function (v) { return v } } },
    }
  }

  function clientDescriptor(method, params) {
    return {
      id: 'dsh-script-cards#' + HOST_SERVICE + '/' + method,
      service: HOST_SERVICE,
      namespace: HOST_SERVICE,
      method: method,
      invocation: { kind: 'direct' },
      parameters: params.map(function (name) {
        return { name: name, wire: name, source: 'json', codec: clientCodec('Arg') }
      }),
      result: clientCodec('Result'),
    }
  }

  const CLIENT_TYPERT = {
    package: 'dsh-script-cards',
    descriptors: [
      clientDescriptor('fsList', ['root', 'dir']),
      clientDescriptor('fsRead', ['root', 'path']),
      clientDescriptor('fsWrite', ['root', 'path', 'text']),
      clientDescriptor('fsMkdir', ['root', 'path']),
      clientDescriptor('fsRemove', ['root', 'path']),
      clientDescriptor('fsStat', ['root', 'path']),
    ],
  }

  // ── 桥的状态：面板要能看到「为什么只读」，而且要能在挂好之后自己变回来 ────────
  const bridgeState = { status: 'idle', detail: '' }
  const bridgeListeners = []

  function bumpBridge(status, detail) {
    bridgeState.status = status
    bridgeState.detail = detail || ''
    for (const fn of bridgeListeners.slice()) {
      try { fn(bridgeState) } catch (e) { /* 监听者自己出错不影响桥 */ }
    }
  }

  function onBridgeChange(fn) {
    bridgeListeners.push(fn)
    return function () {
      const i = bridgeListeners.indexOf(fn)
      if (i !== -1) bridgeListeners.splice(i, 1)
    }
  }

  /** 把客户端清单挂到网关上；失败会重试几次（网关可能比插件晚就绪）。 */
  function mountBridge(remote, contribution, triesLeft) {
    bumpBridge('mounting', '正在挂载落盘桥…')
    return remote.$mount(contribution).then(function (dispose) {
      bumpBridge('ready', '')
      return dispose
    }).catch(function (e) {
      const msg = String(e && e.message ? e.message : e)
      const left = (triesLeft === undefined ? 3 : triesLeft) - 1
      if (left > 0) {
        bumpBridge('retrying', '第 ' + (3 - left) + ' 次挂载失败：' + msg)
        return new Promise(function (r) { setTimeout(r, 700 * (4 - left)) })
          .then(function () { return mountBridge(remote, contribution, left) })
      }
      bumpBridge('failed', msg)
      return null
    })
  }

  // $mount 是异步的，而且插件可能在网关就绪之前 apply，所以桥**每次用的时候现查**，
  // 不做缓存 —— 缓存下来的代理可能在网关重挂之后失效。
  function bridgeFrom(ctx) {
    if (!ctx || typeof ctx.get !== 'function') return null
    const names = ['remote.' + HOST_SERVICE, HOST_SERVICE]
    for (const n of names) {
      let svc
      try { svc = ctx.get(n) } catch (e) { svc = undefined }
      if (svc && typeof svc.fsWrite === 'function' && typeof svc.fsList === 'function') return svc
    }
    return null
  }

  function entryOfText(kind, file, text) {
    const p = parseFront(text)
    const stem = file.slice(-3) === '.md' ? file.slice(0, -3) : file
    const type = kind === 'archive' ? 'archive' : (p.meta.type || 'reference')
    return {
      file: file,
      kind: kind,
      id: p.meta.id || stem,
      type: type,
      title: p.meta.title || stem,
      code: p.meta.code || '',
      chapter: p.meta.chapter || '',
      mode: p.meta.mode || '',
      when: p.meta.when || '',
      order: orderOf(p.meta),
      summary: p.meta.summary || '',
      tags: tagsOf(p.meta),
      color: p.meta.color || '',
      updated: p.meta.updated || p.meta.created || '',
      body: p.body,
      preview: p.body.slice(0, 150),
    }
  }

  function makeApi(ctx, wf) {
    function bridge() { return bridgeFrom(ctx) }

    // 会话 id 与档案目录名都由面板在挂载/改设置时注入，避免每个调用都带着它们穿层。
    const state = { session: undefined, dirs: normDirs(null) }

    function archiveRoot(root) { return joinPath(root, state.dirs.archive) }
    function cardsPath(root) { return joinPath(archiveRoot(root), state.dirs.cards) }
    function archPath(root) { return joinPath(archiveRoot(root), state.dirs.sub) }
    function docsPath(root) { return joinPath(archiveRoot(root), state.dirs.docs) }
    function graphFile(root) { return joinPath(archiveRoot(root), GRAPH_FILE) }

    function fail(res) {
      const code = res && res.error ? res.error.code : undefined
      const message = res && res.error && res.error.message ? res.error.message : ''
      return new Error(errText(message || code || '空响应'))
    }

    /** 「这个文件不在」不是错误：文档文件本来就可以不存在（＝还没写过）。 */
    function isMissing(res) {
      const code = res && res.error ? String(res.error.code || '') : ''
      const message = res && res.error && res.error.message ? String(res.error.message) : ''
      return code === 'error.notFound' || /notFound|no such file|ENOENT/i.test(message)
    }

    function isMissingErr(e) {
      return /notFound|no such file|ENOENT|这个目录不在了/.test(String(e && e.message ? e.message : e))
    }

    function pickNames(entries) {
      const out = []
      for (const e of entries) {
        if (!e || typeof e.name !== 'string') continue
        if (e.name.slice(-3) !== '.md') continue
        if (e.type !== undefined && e.type !== 'file') continue
        out.push(e.name)
      }
      out.sort()
      return out
    }

    async function listNames(root, dir) {
      const b = bridge()
      if (b) {
        const res = await b.fsList(archiveRoot(root), dir)
        if (!res || res.ok !== true) throw fail(res)
        if (res.value && res.value.missing === true) return null
        return pickNames((res.value && res.value.entries) || [])
      }
      return listNamesWf(dir)
    }

    async function listNamesWf(dir) {
      const res = await wf.list(state.session, dir, undefined)
      if (!res || res.ok !== true) {
        const code = res && res.error ? res.error.code : undefined
        if (code === 'error.notFound') return null
        throw fail(res)
      }
      return pickNames((res.value && res.value.entries) || [])
    }

    async function readText(root, path) {
      const b = bridge()
      if (b) {
        const res = await b.fsRead(archiveRoot(root), path)
        if (!res || res.ok !== true) throw fail(res)
        return String((res.value && res.value.text) || '')
      }
      const res = await wf.readAll(state.session, path, undefined)
      if (!res || res.ok !== true) throw fail(res)
      return decodeBase64Text(res.value && res.value.data)
    }

    async function writeText(root, path, text) {
      const b = bridge()
      if (!b) throw new Error('只读模式：宿主半边没有提供落盘桥，改动写不回磁盘。')
      const res = await b.fsWrite(archiveRoot(root), path, text)
      if (!res || res.ok !== true) throw fail(res)
      return true
    }

    async function removePath(root, path) {
      const b = bridge()
      if (!b) throw new Error('只读模式：不能删除文件。')
      if (typeof b.fsRemove !== 'function') throw new Error('宿主半边的落盘桥没有提供 fsRemove。')
      const res = await b.fsRemove(archiveRoot(root), path)
      if (!res || res.ok !== true) throw fail(res)
      return true
    }

    /** 一张卡片有没有文档：文件名相同、而且不是空文件。 */
    async function docIndex(root) {
      const names = await listNames(root, docsPath(root))
      if (names === null || !names.length) return {}
      const b = bridge()
      const out = {}
      for (const n of names) {
        out[n] = true
        // 空文件不算「有文档」：能问到大小就问一声（宿主桥提供 fsStat）。
        // 只读模式（没有桥）问不到，就按「存在即算」——反正那个模式下也写不进去。
        if (b && typeof b.fsStat === 'function') {
          try {
            const res = await b.fsStat(archiveRoot(root), joinPath(docsPath(root), n))
            const v = res && res.ok === true ? res.value : null
            if (v && v.exists === true && Number(v.size) === 0) out[n] = false
          } catch (e) { /* 量不到就按有算 */ }
        }
      }
      return out
    }

    /**
     * 读一张卡片的文档。文件不在＝「还没有文档」，**不是错误**（用户的要求）。
     * 读不到别的（权限、桥挂了）照样抛，别把真错误咽掉。
     */
    async function readDoc(root, file) {
      const p = joinPath(docsPath(root), file)
      const b = bridge()
      if (b) {
        // 先用 fsStat 问在不在：宿主桥对不存在的文件是抛错（readFileSync ENOENT），
        // 靠错误码猜太脆；fsStat 是专门为「在不在」设计的（宿主半边对不存在的路径
        // 返回 exists:false 而不是报错）。
        if (typeof b.fsStat === 'function') {
          const st = await b.fsStat(archiveRoot(root), p)
          const v = st && st.ok === true ? st.value : null
          if (!v || v.exists !== true) return { exists: false, text: '' }
        }
        const res = await b.fsRead(archiveRoot(root), p)
        if (!res || res.ok !== true) {
          if (isMissing(res)) return { exists: false, text: '' }
          throw fail(res)
        }
        return { exists: true, text: String((res.value && res.value.text) || '') }
      }
      try {
        return { exists: true, text: await readText(root, p) }
      } catch (e) {
        if (isMissingErr(e)) return { exists: false, text: '' }
        throw e
      }
    }

    /**
     * 写一张卡片的文档。语义（用户拍板）：**空文档不落盘** ——
     * 内容 trim 后为空且文件已存在 → 删掉它；文件不存在 → 什么都不做（不创建）。
     * 非空才写，写之前先确保子目录在。
     * 返回 { ok, mode: 'saved' | 'removed' | 'empty' }。
     */
    async function writeDoc(root, file, text) {
      const body = String(text == null ? '' : text)
      const p = joinPath(docsPath(root), file)
      if (!body.trim()) {
        const cur = await readDoc(root, file)
        if (!cur.exists) return { ok: true, mode: 'empty' }
        await removePath(root, p)
        return { ok: true, mode: 'removed' }
      }
      await ensureDir(root, state.dirs.docs)
      await writeText(root, p, body)
      return { ok: true, mode: 'saved' }
    }

    /** 删掉一张卡片的文档（「一起删除文档」）。文件本来就不在也不报错。 */
    async function deleteDoc(root, file) {
      const cur = await readDoc(root, file)
      if (!cur.exists) return false
      await removePath(root, joinPath(docsPath(root), file))
      return true
    }

    async function ensureDir(root, name) {
      const b = bridge()
      if (!b || typeof b.fsMkdir !== 'function') return false
      const res = await b.fsMkdir(archiveRoot(root), joinPath(archiveRoot(root), name))
      return !!(res && res.ok === true)
    }

    return {
      bridge: bridge,
      canWrite: function () { return !!bridge() },
      diagnostic: function () {
        if (bridge()) return ''
        if (bridgeState.status === 'failed') return '挂载失败：' + bridgeState.detail
        if (bridgeState.status === 'retrying') return bridgeState.detail
        if (bridgeState.status === 'none') return bridgeState.detail
        if (bridgeState.status === 'mounting') return '正在挂载…'
        return '还没有尝试挂载'
      },
      onBridgeChange: onBridgeChange,
      mountContribution: CLIENT_TYPERT,
      setSession: function (id) { state.session = id },
      setDirs: function (dirs) { state.dirs = normDirs(dirs) },
      dirs: function () { return state.dirs },
      archiveRoot: archiveRoot,

      async scan(root, signal) {
        const cardsDir = cardsPath(root)
        const archDir = archPath(root)
        const cardNames = await listNames(root, cardsDir)
        if (cardNames === null) return { cards: [], archives: [], missing: true }
        const archNames = (await listNames(root, archDir)) || []
        const load = function (dir, kind, names) {
          return Promise.all(names.map(function (n) {
            return readText(root, joinPath(dir, n)).then(function (text) {
              return entryOfText(kind, n, text)
            }).catch(function () { return null })
          }))
        }
        const cards = (await load(cardsDir, 'card', cardNames)).filter(Boolean)
        const archives = (await load(archDir, 'archive', archNames)).filter(Boolean)
        // 「这张卡片有没有文档」随扫描一起收上来：画布与方片页右上角那个小角标靠它，
        // 不用每张卡片各查一次。空文件不算有文档（文档为空时本来就不落盘，见 writeDoc）。
        const docs = await docIndex(root)
        const mark = function (c) { c.hasDoc = docs[c.file] === true; return c }
        cards.forEach(mark)
        archives.forEach(mark)
        archives.reverse()
        if (signal && signal.aborted) return { cards: [], archives: [] }
        return { cards: cards, archives: archives, missing: false }
      },

      readCard(root, kind, file) {
        const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
        return readText(root, joinPath(dir, file))
      },

      writeCard(root, kind, file, text) {
        const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
        return writeText(root, joinPath(dir, file), text)
      },

      async createCard(root, fields) {
        const type = String(fields.type || 'node')
        const title = String(fields.title || '').trim() || typeLabel(type)
        const id = slug(fields.id || title, 60)
        const file = slug(type, 20) + '-' + id + '.md'
        const path = joinPath(cardsPath(root), file)
        const meta = {
          id: id,
          type: type,
          title: title,
          code: fields.code || '',
          chapter: fields.chapter || '',
          mode: fields.mode || '',
          when: fields.when || '',
          order: fields.order === undefined || fields.order === null ? '' : String(fields.order),
          summary: fields.summary || '',
          tags: fields.tags || [],
          color: fields.color || '',
          created: today(),
          updated: nowStamp(),
          source: fields.source || '',
        }
        const body = String(fields.body || '')
        const text = renderFront(meta) + '\n' + body + (body.slice(-1) === '\n' || body === '' ? '' : '\n')
        await writeText(root, path, text)
        return entryOfText('card', file, text)
      },

      async deleteCard(root, kind, file) {
        const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
        return removePath(root, joinPath(dir, file))
      },

      // ── 每张卡片一份的独立文档（<档案目录>/<文档子目录>/<卡片文件名>） ──────────
      // 文档**不是**卡片正文：正文照旧在 卡片/ 里，卡片文件一个字都不动。
      docsPath: docsPath,
      /** 相对路径（给状态行显示用）：<档案目录>/<文档子目录>/<卡片文件名> */
      docPathOf: function (file) { return joinPath(state.dirs.archive, state.dirs.docs, file) },
      docIndex: docIndex,
      readDoc: readDoc,
      writeDoc: writeDoc,
      deleteDoc: deleteDoc,

      graphPath: graphFile,

      async readGraph(root) {
        try {
          return normGraph(JSON.parse(await readText(root, graphFile(root))))
        } catch (e) {
          return emptyGraph()
        }
      },

      async writeGraph(root, graph) {
        const text = JSON.stringify({
          version: 1,
          chapters: graph.chapters,
          nodes: graph.nodes,
          edges: graph.edges,
          // 引用卡位置（顶层 refs）：空就写空表，别写出半截结构
          refs: graph.refs || {},
        }, null, 2)
        await writeText(root, graphFile(root), text)
        return true
      },

      ensureDir: ensureDir,
    }
  }

  function today() {
    const d = new Date()
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  }

  function nowStamp() {
    const d = new Date()
    return today() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n }

    // ═══ src/60-grid.js ═════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 方片页（存档族卡片）
  //
  // 自适应圆角方片网格、按类型分组、置顶组在最前、标签单行横滑（滚动条不悬停不
  // 显示）、星标收藏 + 置顶、简介固定在卡片最下沿。
  // 分支族（chapter/node/condition/result）**不在这里出现**（要求 4）。
  // ══════════════════════════════════════════════════════════════════════════════

  // 标签条：横向能滑，但**平时一点滚动条都看不到**（用户的要求：不动的时候隐藏，
  // 只有动起来才显现）。Windows 的原生滚动条自带两侧三角箭头，很丑；而且「悬停才显示」
  // 的写法会让指针和元素互相追着跑（滑块一出现就把内容顶走 → 取消悬停 → 缩回去 → 又悬停），
  // 整块布局高频抖。
  // 做法：原生滚动条整个藏掉（连箭头一起，也不占位），自己画一根细指示条 ——
  // 绝对定位、不参与布局，所以它的出现/消失不会挪动任何东西；滚动时点亮，停下 700ms 淡出。
  const TAGBAR_MS = 700

  function tagThumb(el) {
    const total = Number(el && el.scrollWidth) || 0
    const view = Number(el && el.clientWidth) || 0
    if (!total || total <= view) return null
    const width = Math.max(10, (view / total) * 100)
    const max = total - view
    const left = (max > 0 ? Number(el.scrollLeft) / max : 0) * (100 - width)
    return { left: left, width: width }
  }

  function TagRow(props) {
    const tags = props.tags || []
    const [bar, setBar] = React.useState(null)
    const timer = React.useRef(null)
    const stripRef = React.useRef(null)
    const dragState = React.useRef(null)
    // 拖完紧跟的那一次 click 是拖动的尾巴，不是点击 —— 吃掉它，不然顺手就打开了卡片详情。
    const swallow = React.useRef(false)
    // deps 写 [] 是有意的：这个 effect 不读任何 state，只挂监听器。
    // 不写 deps（每轮渲染重挂）会被"淡出"这件事坑到：setBar 触发的重渲染会先跑清理，
    // 把刚排上的 700ms 定时器清掉，于是滑块一旦出现就再也不消失。
    React.useEffect(function () {
      const el = stripRef.current
      if (!el || typeof el.addEventListener !== 'function') return undefined
      function paint(ev) {
        // 用事件里的 target 量尺寸（真浏览器里就是这根标签条本身）
        setBar(tagThumb(ev && ev.target ? ev.target : el))
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(function () { setBar(null) }, TAGBAR_MS)
      }
      // 原生滚动条整个藏掉之后，鼠标就再也抓不到那根滑块了 —— 所以「按住标签条横着拖」
      // 必须自己实现，否则整条只能靠 Shift+滚轮挪（用户报的「滑动功能整个没用了」）。
      // 拖动过程中标签文字不可选中（CSS 上的 user-select:none），不然一拖就变成选文字。
      function onMove(ev) {
        const st = dragState.current
        if (!st) return
        const dx = (Number(ev.clientX) || 0) - st.x
        if (Math.abs(dx) > 3) { st.moved = true; swallow.current = true }
        if (!st.moved) return
        el.scrollLeft = st.left - dx
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        paint({ target: el })
      }
      function stopDrag() {
        dragState.current = null
        if (el.classList && el.classList.remove) el.classList.remove('sc-tagsdrag')
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', stopDrag)
          window.removeEventListener('pointercancel', stopDrag)
        }
      }
      function onDown(ev) {
        if (ev.button !== undefined && ev.button !== null && ev.button !== 0) return
        if (typeof window === 'undefined') return
        dragState.current = { x: Number(ev.clientX) || 0, left: Number(el.scrollLeft) || 0, moved: false }
        if (el.classList && el.classList.add) el.classList.add('sc-tagsdrag')
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', stopDrag)
        window.addEventListener('pointercancel', stopDrag)
      }
      el.addEventListener('scroll', paint)
      el.addEventListener('pointerdown', onDown)
      return function () {
        el.removeEventListener('scroll', paint)
        el.removeEventListener('pointerdown', onDown)
        stopDrag()
        if (timer.current) clearTimeout(timer.current)
      }
    }, [])
    if (!tags.length) return null
    return React.createElement('div', { className: 'sc-tagwrap' },
      React.createElement('div', {
        className: 'sc-tags', ref: stripRef,
        onClick: function (ev) { if (swallow.current) { swallow.current = false; ev.stopPropagation() } },
      },
        tags.map(function (t, i) { return React.createElement('span', { key: i, className: 'sc-tag' }, t) })),
      bar ? React.createElement('div', { className: 'sc-tagbar' },
        React.createElement('div', { className: 'sc-tagthumb', style: { left: bar.left + '%', width: bar.width + '%' } })) : null
    )
  }

  function Tile(props) {
    const c = props.card
    const starred = props.starred
    const pinned = props.pinned
    const on = props.on
    // 角色色（只有人物卡有）：来自 frontmatter 的 color，其次是 tags 里的「印象色#」。
    // 显示方式选的是**标题用角色色**这一种（不是另加装饰）：跟文档里「台词名字有颜色」
    // 是同一套说法、同一个来源，也不占地方；用户明确讨厌多出来的入口与装饰。
    const accent = props.accent || ''
    const style = accent ? { '--sc-accent': accent } : undefined
    return React.createElement('div', {
      className: 'sc-tile' + (on ? ' on' : '') + (accent ? ' dye' : ''),
      style: style,
      onClick: function () { props.onOpen(c) },
      // 右键：人物卡弹「角色色」菜单，其它卡不弹（入口克制，用户明确讨厌多余的入口）。
      // 一律 preventDefault：面板里不混两种右键菜单（画布那边也是全吃掉）。
      onContextMenu: function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault()
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
        if (props.onMenu) props.onMenu(e, c)
      },
    },
      React.createElement('div', { className: 'sc-tiletop' },
        React.createElement('div', { className: 'sc-tiletitle' }, c.title || c.file),
        React.createElement('div', { className: 'sc-tileacts' + (starred || pinned ? ' force' : '') },
          React.createElement('button', {
            key: 's', className: 'sc-icon' + (starred ? ' on' : ''), title: starred ? '取消收藏' : '收藏',
            onClick: function (e) { e.stopPropagation(); props.onStar(c, !starred) },
          }, React.createElement(StarIcon, { on: starred })),
          React.createElement('button', {
            key: 'p', className: 'sc-icon' + (pinned ? ' on' : ''), title: pinned ? '取消置顶' : '置顶',
            onClick: function (e) { e.stopPropagation(); props.onPin(c, !pinned) },
          }, React.createElement(PinIcon, { on: pinned }))
        )
      ),
      React.createElement(TagRow, { tags: c.tags }),
      React.createElement('div', { className: 'sc-tilesum' }, c.summary || c.preview || ''),
      // 有文档的小角标（和画布上的卡片同一个标记）。文档页签只给章节 / 节点，
      // 所以方片页这几张卡平时不会亮；亮着就说明文档目录里确实有一份同名文件。
      c.hasDoc ? React.createElement('div', {
        className: 'sc-docdot', title: '这张卡片有文档（在卡片文件同名的文档文件里）',
      }) : null
    )
  }

  function ArchiveDetail(props) {
    const c = props.card
    if (!c) return React.createElement('div', { className: 'sc-empty' }, '左边选一张卡片。')
    return React.createElement('div', null,
      React.createElement('h1', { className: 'sc-h1' }, c.title || c.file),
      React.createElement('div', { className: 'sc-meta' },
        React.createElement('span', { className: 'sc-tag' }, typeLabel(c.type)),
        c.when ? React.createElement('span', null, '时间：' + c.when) : null,
        c.updated ? React.createElement('span', null, '更新：' + c.updated) : null
      ),
      React.createElement(TagRow, { tags: c.tags }),
      React.createElement('div', { className: 'sc-gap' }),
      props.loading ? React.createElement('div', { className: 'sc-empty' }, '读取中…')
        : markdown(props.body, 'detail')
    )
  }

  function GridView(props) {
    const all = props.cards.concat(props.archives)
    const star = props.ui.star
    const pin = props.ui.pin
    const q = String(props.query || '').trim().toLowerCase()
    // 人物卡的「角色色」菜单（右键 tile 弹出来）。只给 type=character 的卡，
    // 菜单本身就是画布那套色卡（swatches / 自定义色卡 / 清除）。
    const [menu, setMenu] = React.useState(null)
    useDismiss(function () { setMenu(null) }, !!menu)

    function openCardMenu(e, c) {
      if (!c || c.type !== 'character') return
      setMenu({ x: Number(e && e.clientX) || 0, y: Number(e && e.clientY) || 0, card: c })
    }

    /** 菜单挂在这个视图自己的根上（不能塞进 .sc-items：那是滚动容器）。 */
    function menuNodes() {
      if (!menu) return []
      return [
        MenuBackdrop({ onClose: function () { setMenu(null) } }),
        MenuList({
          x: menu.x, y: menu.y, color: menu.card.color || '',
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          items: [
            { head: '角色色（写进卡片文件的 color，跟项目进 git）' },
            { key: 'color', colors: true },
          ],
          // 色卡块里的「清除」＝空串 → 回到自动读 tags 的「印象色#rrggbb」
          onColor: function (v) { props.onSetColor(menu.card, v); setMenu(null) },
          // 色盘：实时换色、**菜单留着**（Chromium 一点开就派发 change 的那个坑）
          onColorPick: function (v) { props.onSetColor(menu.card, v) },
          onClose: function () { setMenu(null) },
        }),
      ]
    }

    let visible = props.starOnly ? all.filter(function (c) { return star.indexOf(cardKey(c)) !== -1 }) : all
    if (q) {
      visible = visible.filter(function (c) {
        return (String(c.title) + ' ' + String(c.summary) + ' ' + String(c.preview) + ' ' + c.tags.join(' ')).toLowerCase().indexOf(q) !== -1
      })
    }
    const pinned = visible.filter(function (c) { return pin.indexOf(cardKey(c)) !== -1 })
    const rest = visible.filter(function (c) { return pin.indexOf(cardKey(c)) === -1 })

    const groups = []
    if (pinned.length) groups.push({ type: '__pin', items: pinned })
    for (const t of ARCHIVE_ORDER) {
      const items = rest.filter(function (c) { return c.type === t })
      if (items.length) groups.push({ type: t, items: items })
    }
    const known = ARCHIVE_ORDER.concat(['archive'])
    const others = rest.filter(function (c) { return known.indexOf(c.type) === -1 })
    if (others.length) groups.push({ type: '__other', items: others })

    const selected = props.selected
    const head = React.createElement('div', { className: 'sc-head' },
      React.createElement('h2', null, '方片'),
      React.createElement('span', { className: 'sc-count' }, all.length + ' 张卡片'),
      React.createElement('span', { className: 'sc-spacer' }),
      React.createElement('button', {
        className: 'sc-btn' + (props.starOnly ? ' sc-btn-on' : ''),
        onClick: function () { props.setStarOnly(!props.starOnly) },
      }, '只看收藏'),
      React.createElement('button', { className: 'sc-btn', onClick: props.onRefresh }, '刷新')
    )

    const list = React.createElement('div', { className: 'sc-list' },
      React.createElement('input', {
        className: 'sc-search', placeholder: '搜标题 / 简介 / 标签', value: props.query,
        onChange: function (e) { props.setQuery(e.target.value) },
      }),
      React.createElement('div', { className: 'sc-items' },
        groups.length === 0
          ? React.createElement('div', { className: 'sc-empty' }, all.length ? '没有匹配的卡片。' : '档案还是空的。')
          : groups.map(function (g) {
            const label = g.type === '__pin' ? '置顶' : (g.type === '__other' ? '其他' : typeLabel(g.type))
            return React.createElement('div', { key: g.type },
              React.createElement('div', { className: 'sc-group' + (g.type === '__pin' ? ' pin' : '') }, label + ' (' + g.items.length + ')'),
              React.createElement('div', { className: 'sc-grid' },
                g.items.map(function (c) {
                  const k = cardKey(c)
                  return React.createElement(Tile, {
                    key: k, card: c, on: selected === k,
                    starred: star.indexOf(k) !== -1, pinned: pin.indexOf(k) !== -1,
                    // 只有人物卡上色；颜色来源与文档里名字着色同一个函数
                    accent: c.type === 'character' ? speakerColor(c) : '',
                    onOpen: props.onOpen, onStar: props.onStar, onPin: props.onPin,
                    onMenu: openCardMenu,
                  })
                })
              )
            )
          })
      )
    )

    const narrow = props.narrow
    if (narrow && !selected) return React.createElement('div', { className: 'sc-body' }, list, ...menuNodes())

    const detail = React.createElement('div', { className: 'sc-detail' },
      selected && props.detailOpen
        ? React.createElement(ArchiveDetail, { card: props.detailCard, body: props.detailBody, loading: props.detailLoading })
        : React.createElement('div', { className: 'sc-empty' }, '选一张卡片看正文。')
    )

    if (narrow && selected) {
      return React.createElement('div', { className: 'sc-body' },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 } },
          React.createElement('div', { className: 'sc-narrowhead' },
            React.createElement('button', { className: 'sc-back', onClick: props.onCloseDetail }, '← 返回'),
            React.createElement('h2', null, props.detailCard ? props.detailCard.title : '')
          ),
          detail
        ),
        ...menuNodes()
      )
    }

    return React.createElement('div', { className: 'sc-body' }, list, detail, ...menuNodes())
  }

    // ═══ src/70-menu.js ═════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 右键菜单 / 快捷键
  //
  // 菜单渲染在面板根层（不能放进 .sc-stage —— 那一层有 transform，会让
  // position:fixed 的定位基准变成画布而不是视口）。
  // ══════════════════════════════════════════════════════════════════════════════

  function MenuList(props) {
    const items = props.items || []
    const style = { left: Math.max(4, props.x), top: Math.max(4, props.y) }
    if (props.width) style.minWidth = props.width
    return React.createElement('div', {
      className: props.className || 'sc-menu',
      style: style,
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
      onMouseDown: function (e) { e.stopPropagation() },
    }, items.map(function (it, i) {
      if (!it) return null
      if (it.sep) return React.createElement('div', { key: 'sep' + i, className: 'sc-menusep' })
      if (it.head) return React.createElement('div', { key: 'h' + i, className: 'sc-menuhead' }, it.head)
      // 菜单里的输入框（文档里那套「人物」菜单：人一多就得能筛）。
      // 鼠标与键盘事件都要 stopPropagation：打字不许冒泡到画布（Delete / 空格 / Ctrl+V
      // 是画布快捷键），mousedown 也不许冒到 MenuBackdrop 上被当成「点了别处」。
      if (it.input) {
        return React.createElement('input', {
          key: 'inp' + i,
          className: it.input.className || 'sc-inp full sc-menuinput',
          value: it.input.value, autoFocus: true,
          placeholder: it.input.placeholder || '',
          onMouseDown: function (e) { e.stopPropagation() },
          onKeyDown: function (e) { e.stopPropagation(); if (it.input.onKeyDown) it.input.onKeyDown(e) },
          onChange: function (e) { it.input.onChange(e.target.value) },
        })
      }
      if (it.colors) {
        const list = props.swatches && props.swatches.length ? props.swatches : DEFAULT_SWATCHES
        return React.createElement('div', { key: 'c' + i },
          React.createElement('div', { className: 'sc-swatches' }, list.map(function (hex) {
            const sel = props.color && String(props.color).toLowerCase() === String(hex).toLowerCase()
            return React.createElement('button', {
              key: hex, className: 'sc-swatch' + (sel ? ' sc-swatchsel' : ''),
              style: { background: hex }, title: hex,
              onClick: function (e) { e.stopPropagation(); props.onColor(hex) },
            })
          })),
          React.createElement('div', { className: 'sc-colorrow' },
            React.createElement('input', {
              className: 'sc-colorinput', type: 'color',
              value: props.color || list[0] || '#7A8BA6',
              // 色盘是**实时**换色、但**不关菜单**：Chromium 一点开取色器就会派发一次
              // change（值往往就是原值），以前这里直接走 onColor → 调用点顺手 setMenu(null)，
              // 于是「一点色盘整块菜单就没了」（用户报的）。所以：
              //   ① 先和当前色比一下，一样就什么都不做；
              //   ② 换色走 onColorPick（不关菜单），关菜单交给点别处 / Esc；
              //   ③ 自己的鼠标事件全 stopPropagation，别冒出去碰到遮罩。
              onChange: function (e) {
                const v = String(e.target.value || '')
                if (!v) return
                if (props.color && v.toLowerCase() === String(props.color).toLowerCase()) return
                if (props.onColorPick) props.onColorPick(v)
                else props.onColor(v)
              },
              onMouseDown: function (e) { e.stopPropagation() },
              onClick: function (e) { e.stopPropagation() },
              onInput: function (e) { e.stopPropagation() },
              onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
            }),
            React.createElement('span', null, '色盘'),
            React.createElement('span', { style: { flex: 1 } }),
            React.createElement('button', {
              className: 'sc-btn', style: { padding: '2px 8px' },
              title: '增删这套预置色卡（只存这台浏览器）',
              onClick: function (e) { e.stopPropagation(); props.onClose(); if (props.onEditSwatches) props.onEditSwatches() },
            }, '编辑色卡…'),
            React.createElement('button', {
              className: 'sc-btn', style: { padding: '2px 8px' },
              onClick: function (e) { e.stopPropagation(); props.onColor('') },
            }, '清除')
          )
        )
      }
      return React.createElement('button', {
        key: it.key || ('i' + i),
        className: 'sc-menuitem', disabled: !!it.disabled,
        onClick: function (e) { e.stopPropagation(); props.onClose(); if (it.onPick) it.onPick() },
      },
        React.createElement('span', null, (it.checked ? '✓ ' : '') + it.label),
        it.hint ? React.createElement('span', { className: 'k' }, it.hint) : null
      )
    }))
  }

  // 菜单背后那层透明遮罩：点它就关菜单。
  //
  // ⚠ 关菜单**必须**靠这层真实的遮罩，不能在 window 上听 mousedown：捕获阶段的
  // mousedown 会在菜单项的 click 之前就把菜单卸载掉，click 于是永远落不到按钮上。
  // 真实浏览器里的表现就是「右键菜单点任何一项都没反应」，而无头测试只直接触发
  // onClick，所以一直没暴露这个顺序问题。
  function MenuBackdrop(props) {
    // 兜底：事件 target 落在菜单**里面**就绝不关（原生取色器/别的原生控件有时会把事件
    // 路径变得和想象中不一样，一旦没被 stopPropagation 拦住，这层遮罩就会把菜单收掉）。
    // 写法带兜底 —— mini-react 的假元素没有 closest，不能写死它存在。
    function insideMenu(e) {
      const t = e && e.target
      if (!t) return false
      if (typeof t.closest === 'function') {
        try { return !!t.closest('.sc-menu') } catch (err) { return false }
      }
      return false
    }
    return React.createElement('div', {
      className: 'sc-menuback',
      onMouseDown: function (e) {
        e.stopPropagation()
        if (insideMenu(e)) return
        if (props.onClose) props.onClose()
      },
      onContextMenu: function (e) {
        e.preventDefault()
        e.stopPropagation()
        if (insideMenu(e)) return
        if (props.onClose) props.onClose()
      },
    })
  }

  // Esc 关闭（鼠标的关闭交给 MenuBackdrop）。
  function useDismiss(onClose, active) {
    React.useEffect(function () {
      if (!active) return undefined
      function key(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
      window.addEventListener('keydown', key, true)
      return function () {
        window.removeEventListener('keydown', key, true)
      }
    }, [active, onClose])
  }

  // 快捷键匹配：'mod+c' / 'delete' / 'space' / 'ctrl+shift+g' 之类。
  function matchKey(e, spec) {
    const parts = String(spec).toLowerCase().split('+')
    const key = parts[parts.length - 1]
    const needMod = parts.indexOf('mod') !== -1
    const needShift = parts.indexOf('shift') !== -1
    const needAlt = parts.indexOf('alt') !== -1
    if (needMod !== !!(e.ctrlKey || e.metaKey)) return false
    if (needShift !== !!e.shiftKey) return false
    if (needAlt !== !!e.altKey) return false
    const k = String(e.key || '').toLowerCase()
    if (key === 'space') return k === ' ' || k === 'spacebar'
    if (key === 'delete') return k === 'delete' || k === 'backspace'
    if (key === 'esc') return k === 'escape'
    return k === key
  }

  const SHORTCUTS = [
    { spec: 'mod+c', label: '复制', hint: 'Ctrl+C' },
    { spec: 'mod+x', label: '剪切', hint: 'Ctrl+X' },
    { spec: 'mod+v', label: '粘贴', hint: 'Ctrl+V' },
    { spec: 'mod+d', label: '原地复制一张', hint: 'Ctrl+D' },
    { spec: 'space', label: '展开 / 收起', hint: '空格' },
    { spec: 'delete', label: '删除（移出画布）', hint: 'Delete' },
    { spec: 'mod+0', label: '缩放归位', hint: 'Ctrl+0' },
    { spec: 'mod+1', label: '缩放至 100%', hint: 'Ctrl+1' },
  ]

  function shortcutHint(label) {
    for (const s of SHORTCUTS) if (s.label.indexOf(label) === 0) return s.hint
    return ''
  }

    // ═══ src/80-board.js ════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 分支画布：几何、卡片、连线、底部堆叠条
  // ══════════════════════════════════════════════════════════════════════════════

  // 卡片尺寸（宽 × 高）。用户的要求：「长宽比改一下，流程横着放会很显得很长，与目前接近
  // 竖屏的比例不相契合」—— 侧栏是竖的，卡片以前是 2.3:1 的横条，一层层往右排出去就是一条
  // 又长又扁的带子。现在四种卡片都是竖着的（高 ≈ 宽的 0.65～0.78），流程整体跟着变窄变高，
  // 贴住竖屏；卡片窄了以后内容排布也跟着调（简介钉在卡片下沿，见 10-css.js）。
  const CARD_W = { chapter: 176, node: 156, condition: 144, result: 144 }
  const CARD_H = { chapter: 120, node: 112, condition: 86, result: 86 }
  // 选项列跟着卡片一起收窄：它挂在这张卡右边，比卡片还宽就会显得是另一张卡。
  const CHOICE_W = 156
  const CHOICE_H = 30
  const CHOICE_GAP = 5
  const CHOICE_DX = 14
  // 「＋ 选项」按钮的高度，和 CSS 里 .sc-choiceadd 的 height 是同一个值。
  // 它挂在选项列最下面，算「这张卡占多宽多高」时要一起算进去。
  const CHOICE_ADD_H = 30
  // 出口圆点外缘离卡片边缘的距离：.sc-port 是 16px、偏移 -8px，圆心正落在卡片边上，
  // 所以线从卡片外 8px 处起笔、在卡片外 8px 处收笔，正好贴住圆点外缘。
  const PORT_DX = 8
  /**
   * 连线层（.sc-edges）在 CSS 里被挪到 -EDGE_PAD,-EDGE_PAD，好让坐标为负的卡片也能画
   * （卡片坐标可以是负的：往左上拖就会）。代价是 SVG 自己的用户坐标系也跟着挪了，
   * 所以画路径的那个 <g> 必须原样补回 +EDGE_PAD —— 否则整层线画在屏幕外 4000px 处，
   * 卡片和连线标签都在、只有线不见（用户报的「连线没有渲染出来，是全透明的」）。
   * 改 CSS 里的 left/top 时这里必须一起改，测试会盯着两者是否一致。
   */
  const EDGE_PAD = 4000
  const EXPAND_W = PANEL_W
  const EXPAND_H = 430
  // 浮动窗口的最小尺寸（用户定的大约 320×220）。下限在 UI 层（85-boardview 的 clampWin）
  // 强制：画布比这还窄时以画布为准，否则「最小 320」会把窗口顶出画布。
  const WIN_MIN_W = 320
  const WIN_MIN_H = 220

  function sizeOf(type) {
    return { w: CARD_W[type] || 184, h: CARD_H[type] || 80 }
  }

  function cardRect(type, x, y) {
    const s = sizeOf(type)
    return { x: x, y: y, w: s.w, h: s.h }
  }

  /** 选项列的列高（不含下面的 ＋ 按钮）。 */
  function choiceListHeight(count) {
    const n = Math.max(0, count || 0)
    return n * CHOICE_H + Math.max(0, n - 1) * CHOICE_GAP
  }

  /**
   * 选项列相对卡片顶部的偏移：整列按选项高度上下居中（＋ 按钮不算在内，它挂在下面）。
   * 取整，好让每一行、每一颗出口圆点都落在整数像素上 —— 半像素的圆点看着就不圆。
   * 与 CSS 里 .sc-choices 的行内 top、.sc-choice 的 30px 行高一一对应。
   */
  function choiceTop(rect, count) {
    return Math.round(rect.h / 2 - choiceListHeight(count) / 2)
  }

  /** 第 i 个选项的位置（与 CSS .sc-choices / .sc-choice 的几何对齐）。 */
  function choiceRect(rect, i, count) {
    return {
      x: rect.x + rect.w + CHOICE_DX,
      y: rect.y + choiceTop(rect, count) + i * (CHOICE_H + CHOICE_GAP),
      w: CHOICE_W,
      h: CHOICE_H,
    }
  }

  function outPoint(rect, choiceIndex, count) {
    if (choiceIndex === undefined || choiceIndex === null || choiceIndex < 0) {
      return { x: rect.x + rect.w + PORT_DX, y: rect.y + rect.h / 2 }
    }
    const c = choiceRect(rect, choiceIndex, count)
    return { x: c.x + c.w + PORT_DX, y: c.y + c.h / 2 }
  }

  function inPoint(rect) {
    return { x: rect.x - PORT_DX, y: rect.y + rect.h / 2 }
  }

  /** 分歧节点 = 卡片右侧挂着一列选项的节点。 */
  function isBranchCard(card, rec) {
    return !!card && card.type === 'node' && ((rec && rec.mode === 'branch') || card.mode === 'branch')
  }

  function choiceCountOf(card, rec) {
    return isBranchCard(card, rec) ? ((rec && rec.choices) || []).length : 0
  }

  /**
   * 一张卡片在自动排列里「占多宽、往上下各溢多少」：
   *   w    卡片宽度；分歧节点要再加上右侧那列选项（14 的间距 + 170 的列宽）
   *   h    卡片自己的高度（卡片就摆在 out.y 上，不做任何居中偏移）
   *   over 选项列比卡片高出来的那一半（整列相对卡片上下居中，所以上下各溢这么多）
   *
   * 摆放只用 h，**绝不用 over 去挪卡片** —— 一挪，同层的分歧卡片就比别的卡片低一截
   * （用户报的「默认不居中，因为计算高度的时候把后面的选项也计算上了」）。
   * over 只在算「两张卡片之间要空多少」时用：这一张往下溢、下一张往上溢，两者都得让开。
   */
  function slotOf(card, rec) {
    const s = sizeOf(card.type)
    const n = choiceCountOf(card, rec)
    if (!n) return { w: s.w, h: s.h, over: 0 }
    const colH = choiceListHeight(n) + CHOICE_GAP + CHOICE_ADD_H
    return {
      w: s.w + CHOICE_DX + CHOICE_W,
      h: s.h,
      over: Math.max(0, Math.ceil((colH - s.h) / 2)),
    }
  }

  /** 卡片连同它溢出的选项列，整块占的地方（碰撞检测、落位要用）。 */
  function slotBox(rect, slot) {
    return { x: rect.x, y: rect.y - slot.over, w: slot.w, h: slot.h + slot.over * 2 }
  }

  function edgePath(a, b) {
    const dx = Math.max(26, Math.abs(b.x - a.x) * 0.45)
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y
  }

  function edgeMid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  // 自动排列：分层（最长路径）后逐层纵向铺开；L1 按章节序号，L2 按章节内顺序。
  // slotOf(k) 给出「卡片多高、往上下各溢多少（选项列）、占多宽」。
  // 卡片一律摆在 out[k] = { x, y } 上，不做居中偏移 —— 卡片的位置只由卡片自己决定。
  // 选项列是溢出的，所以只影响**间距**：两张卡片之间要塞得下「上一张往下溢的那半」+
  // 「下一张往上溢的那半」+ 24px 的正常空隙。层与层之间按该层最宽的那块让开。
  function autoLayout(keys, slotOf_, edges) {
    const index = {}
    keys.forEach(function (k, i) { index[k] = i })
    const indeg = {}
    keys.forEach(function (k) { indeg[k] = 0 })
    for (const e of edges) if (index[e.from] !== undefined && index[e.to] !== undefined) indeg[e.to] += 1
    const depth = {}
    keys.forEach(function (k) { depth[k] = 0 })
    for (let pass = 0; pass < keys.length + 1; pass++) {
      let moved = false
      for (const e of edges) {
        if (index[e.from] === undefined || index[e.to] === undefined) continue
        if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; moved = true }
      }
      if (!moved) break
    }
    const byDepth = {}
    keys.forEach(function (k) {
      const d = depth[k]
      if (!byDepth[d]) byDepth[d] = []
      byDepth[d].push(k)
    })
    const out = {}
    // 层与层之间的水平空隙（原来是写死的 260，等于「章节卡 208 + 52」）
    const colGap = 52
    const gapY = 24
    let x = 24
    const levels = Object.keys(byDepth).map(Number).sort(function (a, b) { return a - b })
    for (const d of levels) {
      const row = byDepth[d]
      let y = 24
      let widest = 0
      for (let i = 0; i < row.length; i++) {
        const s = slotOf_(row[i])
        out[row[i]] = { x: x, y: y }
        const next = i + 1 < row.length ? slotOf_(row[i + 1]) : null
        y += s.h + s.over + (next ? next.over : 0) + gapY
        if (s.w > widest) widest = s.w
      }
      x += widest + colGap
    }
    return out
  }

  function autoSpot(rects, w, h) {
    let x = 24
    let y = 24
    let guard = 0
    while (guard++ < 400) {
      let hit = false
      for (const r of rects) {
        if (x < r.x + r.w + 18 && x + w + 18 > r.x && y < r.y + r.h + 18 && y + h + 18 > r.y) { hit = true; break }
      }
      if (!hit) return { x: x, y: y }
      y += h + 22
      if (y > 900) { y = 24; x += w + 40 }
    }
    return { x: x, y: y }
  }

  function plainText(body, max) {
    const t = String(body || '')
      .replace(/^---[\s\S]*?\n---\n?/, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/[*`>#\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return t.slice(0, max || 90)
  }

  // ── 卡片：章节 / 节点 / 条件 / 结果 ───────────────────────────────────────────

  function CardBody(props) {
    const c = props.card
    const expanded = props.expanded
    const rec = props.rec
    const type = c.type

    if (type === 'chapter') {
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        React.createElement('div', { className: 'sc-cardrow' },
          React.createElement('span', { className: 'sc-cardcode' }, cardCode(c) || '§'),
          React.createElement('span', { className: 'sc-cardname' }, cardName(c) || c.file)
        ),
        React.createElement('div', { style: { marginTop: 5 } }, React.createElement(TagRow, { tags: c.tags })),
        React.createElement('div', { className: 'sc-cardsum' }, c.summary || plainText(c.body) || '（还没有简介）'),
        expanded ? React.createElement('div', { className: 'sc-nodelist' },
          props.nodes.length === 0
            ? React.createElement('div', { className: 'sc-cardsum' }, '这个章节里还没有节点。')
            : props.nodes.map(function (n) {
              return React.createElement('div', {
                key: cardKey(n), className: 'sc-nodelistrow',
                onClick: function (e) { e.stopPropagation(); props.onOpenNode(n) },
              },
                React.createElement('span', { className: 'n' }, typeLabel(n.type)),
                React.createElement('span', { className: 't' }, n.title || n.file)
              )
            })
        ) : null
      )
    }

    if (type === 'condition' || type === 'result') {
      // 竖版卡片比两行字高，内容竖直居中才不显得头重脚轻
      return React.createElement('div', { className: 'sc-cardcenter' },
        React.createElement('div', { className: 'sc-cardkind' }, typeLabel(type)),
        React.createElement('div', { className: 'sc-cardmono' }, c.title || plainText(c.body, 40) || '—')
      )
    }

    const sec = splitSections(c.body)
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
      React.createElement('div', { className: 'sc-cardrow' },
        React.createElement('span', { className: 'sc-cardname' }, c.title || c.file),
        c.when ? React.createElement('span', { className: 'sc-cardwhen' }, c.when) : null
      ),
      expanded
        ? React.createElement('div', { className: 'sc-cardbody' },
          BODY_SECTIONS.map(function (name) {
            const items = sec[name]
            if (!items.length) return null
            return React.createElement('div', { key: name, className: 'sc-cardsec' },
              React.createElement('div', { className: 'sc-cardsecname' }, name),
              React.createElement('ul', { className: 'sc-cardlist' },
                items.map(function (t, i) { return React.createElement('li', { key: i }, inline(t, name + i)) }))
            )
          }),
          (sec['角色'].length + sec['场景'].length + sec['内容'].length) === 0
            ? React.createElement('div', { className: 'sc-cardsum' }, c.summary || plainText(c.body) || '（正文为空）')
            : null
        )
        : React.createElement('div', { className: 'sc-cardsum' }, c.summary || plainText(c.body) || '（还没有简介）')
    )
  }

  function CardView(props) {
    const c = props.card
    const rec = props.rec
    const type = c.type
    const r = props.rect
    const accent = rec.color || c.color || ''
    // 展开的章节卡片要留出「最多 5 行节点 + 滑条」的高度。
    const shownH = props.expanded ? (type === 'chapter' ? 224 : Math.max(r.h, 168)) : r.h
    const style = { left: r.x, top: r.y, width: r.w, height: shownH }
    if (accent) style['--sc-accent'] = accent
    const cls = [
      'sc-card',
      props.selected ? 'on' : '',
      accent ? 'dye' : '',
      props.dimmed ? 'dim' : '',
    ].filter(Boolean).join(' ')

    const hasOut = canOut(type)
    const hasIn = canIn(type)
    // 分歧与否也认卡片文件里的 mode：图谱是结构，但 mode 是卡片自己的属性，
    // cards.py 手写的卡片可能还没被图谱记住。判定与 slotOf / choiceCountOf 共用一套 ——
    // 两边要是各判各的，自动排列就会给「看着没有选项列」的卡片留空。
    const isBranchNode = isBranchCard(c, rec)
    // 正在拉线时：手里这一头是「源」，其它卡片的入口点亮成可落的靶子。
    const isSource = props.linkFrom != null && props.linkFrom === props.cardKey
    const isTarget = !!props.linkLive && !isSource

    const children = [
      React.createElement('div', { key: 'b', style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        React.createElement(CardBody, {
          card: c, rec: rec, expanded: props.expanded, nodes: props.childNodes || [],
          onOpenNode: props.onOpenNode,
        })
      ),
    ]

    if (isBranchNode) {
      // 分歧节点：右侧一列选项，每项自己有出口；最下面永远留一个「＋」，
      // 免得加选项还得先展开卡片或者翻右键菜单。
      // 列顶按选项本身的高度算（上下居中），＋ 按钮挂在下面、不参与居中。
      const list = rec.choices || []
      children.push(React.createElement('div', {
        key: 'ch', className: 'sc-choices', style: { top: choiceTop({ h: shownH }, list.length) },
      },
        list.map(function (ch, i) {
          const on = props.hotChoice === ch.id
          const text = ch.text || '（空选项）'
          return React.createElement('div', {
            key: ch.id, className: 'sc-choice' + (on ? ' on' : '') + (ch.to ? ' linked' : ''),
            'data-choice': ch.id, title: text,
            onPointerDown: function (e) { e.stopPropagation() },
            onDoubleClick: function (e) { e.stopPropagation(); props.onEditChoice(c, ch) },
          },
            React.createElement('span', { key: 'tx', className: 'sc-choicetext' }, text),
            ch.to ? React.createElement('span', { key: 'go', className: 'sc-choicego' }, '→') : null,
            hasOut ? React.createElement('div', {
              className: 'sc-port out' + (on ? ' hot' : ''),
              'data-port': 'out', 'data-choice': ch.id,
              onPointerDown: function (e) { e.stopPropagation(); props.onStartLink(e, c, ch.id) },
              title: '从这里拖到目标卡片',
            }) : null
          )
        }),
        React.createElement('button', {
          key: 'add', className: 'sc-choiceadd',
          onPointerDown: function (e) { e.stopPropagation() },
          onClick: function (e) { e.stopPropagation(); props.onAddChoice(c) },
          title: '加一个选项',
        }, '＋ 选项')
      ))
    }

    if (hasIn) children.push(React.createElement('div', {
      key: 'in', className: 'sc-port in' + (isTarget ? ' hot' : ''), 'data-port': 'in',
      title: isTarget ? '松手连到这张卡' : '入口', onPointerUp: function (e) { props.onDropLink(e, c) },
    }))
    if (hasOut && !isBranchNode) children.push(React.createElement('div', {
      key: 'out', className: 'sc-port out' + (isSource ? ' hot' : ''), 'data-port': 'out',
      title: '从这里拖到目标卡片',
      onPointerDown: function (e) { e.stopPropagation(); props.onStartLink(e, c, '') },
      onPointerUp: function (e) { props.onDropLink(e, c) },
    }))

    // 「这张卡有文档」的小角标（右上角）。它挂在卡片角上、往外挪 4px：卡片里的右上角
    // 是节点卡的时间文字，占位会把它挤走；卡片的 overflow 是 visible，角标露在外面正好。
    if (props.hasDoc) {
      children.push(React.createElement('div', {
        key: 'doc', className: 'sc-docdot', title: '这张卡片有文档（展开后在「文档」页里读）',
      }))
    }

    return React.createElement('div', {
      className: cls, style: style,
      'data-key': props.cardKey, 'data-type': type,
      onPointerDown: function (e) { props.onCardDown(e, c) },
      onDoubleClick: function (e) { e.stopPropagation(); props.onDouble(c) },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); props.onMenu(e, c) },
    }, children)
  }

  // ── 引用卡（「存档卡抽屉」拖进来的那些） ──────────────────────────────────────
  // 引用＝把一张**别处**的卡片摆到这块画布上：不新建文件、不改卡片文件，位置只写
  // 分支.json 的 refs[ctx][cardKey]。画布上「能摆、能看、能染」，不能改内容、不连线、
  // 不参与自动排列（用户拍板）。
  //
  // 尺寸：分支卡借用它们自己那一档；**存档卡统一按「节点卡」那一档**（内容形态就是
  // 标题 + 简介）。
  function refSizeOf(type) {
    return isBranchType(type) ? sizeOf(type) : sizeOf('node')
  }

  /**
   * 引用卡的强调色：手染色（图谱 refs[ctx][key].color）优先，没染就用**角色色**
   * （frontmatter 的 color → tags 里的 印象色#rrggbb）。跟文档里「台词名字有颜色」
   * 是同一条思路：画布上一眼认得出这是谁。
   */
  function refAccent(card, rec) {
    const manual = rec && rec.color ? String(rec.color) : ''
    if (manual) return manual
    return speakerColor(card)
  }

  /** 引用卡：标题 + 简介、右上角一个「引用」角标、没有连线圆点、没有选项列。 */
  function RefCard(props) {
    const c = props.card
    const r = props.rect
    const style = { left: r.x, top: r.y, width: r.w, height: r.h }
    if (props.accent) style['--sc-accent'] = props.accent
    const cls = ['sc-card', 'sc-refcard', props.selected ? 'on' : '', props.accent ? 'dye' : '', props.dimmed ? 'dim' : ''].filter(Boolean).join(' ')
    return React.createElement('div', {
      className: cls, style: style,
      'data-key': props.cardKey, 'data-type': c.type, 'data-ref': '1',
      onPointerDown: function (e) { props.onCardDown(e, c) },
      onDoubleClick: function (e) { e.stopPropagation(); props.onDouble(c) },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); props.onMenu(e, c) },
    },
      React.createElement('div', { key: 'k', className: 'sc-refkind' }, typeLabel(c.type)),
      React.createElement('div', { key: 't', className: 'sc-cardname' }, cardDisplay(c) || c.file),
      React.createElement('div', { key: 's', className: 'sc-cardsum' }, c.summary || plainText(c.body) || '（还没有简介）'),
      // 「引用」角标：虚线小圈，挂在**左下角** —— 右上角是「有文档」的 .sc-docdot 的地盘，
      // 两个角标不许撞在一起。
      React.createElement('div', { key: 'b', className: 'sc-refbadge', title: '这是引用：卡片文件在别处，内容要回方片页改' }, '引用')
    )
  }

  function Dock(props) {
    const items = props.items
    return React.createElement('div', { className: 'sc-dock' },
      React.createElement('div', { className: 'sc-dockhead' },
        React.createElement('span', null, props.title),
        React.createElement('span', null, items.length + ' 张未上画'),
        React.createElement('span', { className: 'sc-spacer' }),
        React.createElement('span', null, '拖到画布上，或点一下自动落位')
      ),
      React.createElement('div', { className: 'sc-dockstrip' },
        React.createElement('div', { className: 'sc-dockinner', style: { width: Math.max(1, items.length) * 156 + 20 } },
          items.map(function (c, i) {
            const accent = props.accentOf(c)
            const style = { left: 10 + i * 156, width: 146, height: 70 }
            if (accent) style.borderColor = accent
            return React.createElement('div', {
              key: cardKey(c), className: 'sc-dockcard', style: style,
              onPointerDown: function (e) { props.onDockDown(e, c) },
              onClick: function () { props.onDockTap(c) },
            },
              React.createElement('div', { className: 'sc-dockcardtitle' }, cardDisplay(c) || c.file),
              React.createElement('div', { className: 'sc-dockcardwhen' },
                c.type === 'chapter' ? typeLabel(c.type) : (c.when || typeLabel(c.type)))
            )
          })
        )
      )
    )
  }

    // ═══ src/85-boardview.js ════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 分支画布（两级 + 浏览器式导航栏）
  //
  //   上级（root）  排章节：章节卡片摆在自由画布上
  //   下级（chapter）排章节内部情节：该章节的节点 / 条件 / 结果
  //
  // 导航栏照浏览器的样子做：后退 / 前进 / 回到上级 / 地址（面包屑）。
  // 画布：空白处左键拖动平移（中键、Alt+左键也行），滚轮缩放（以指针为中心），
  //       Shift+滚轮左右移、Alt+滚轮上下移。
  // 展开动画：先把视角平移到卡片居中（相对位置不变）→ 卡片放大 → 背景虚化。
  // 快捷键（复制/粘贴/展开/删除）只在「最近一次点击落在画布上」时生效 —— 对话输入框是
  //      contenteditable，无条件吃全局 Ctrl+V 会把聊天框的粘贴整个吃掉。
  // ══════════════════════════════════════════════════════════════════════════════

  // FAV_KEY 在 src/00-head.js 里声明（跨片段共享作用域，只能声明一次）。
  function readFav() {
    try { return window.localStorage.getItem(FAV_KEY) || 'node' } catch (e) { return 'node' }
  }
  function writeFav(v) {
    try { window.localStorage.setItem(FAV_KEY, String(v)) } catch (e) { /* 忽略 */ }
  }

  function BoardView(props) {
    const cards = props.cards
    const graph = props.graph
    const narrow = !!props.narrow

    const [hist, setHist] = React.useState([{ level: 'root' }])
    const [hi, setHi] = React.useState(0)
    const here = hist[hi] || { level: 'root' }

    const [view, setView] = React.useState({ x: 24, y: 20, s: snapZoom(props.ui && props.ui.zoom ? props.ui.zoom : 1) })
    const [sel, setSel] = React.useState(null)
    const [link, setLink] = React.useState(null)
    const [menu, setMenu] = React.useState(null)
    // 连线上右键弹出的菜单（重命名 / 删除）。和卡片菜单分开存，免得互相顶掉。
    const [edgeMenu, setEdgeMenu] = React.useState(null)
    // 正在改名字的那条线：{ from, to, choice, value }。空 = 线上什么都不显示。
    const [rename, setRename] = React.useState(null)
    // 展开态：从「一个全屏遮罩里的大卡片」改成**一组浮动窗口**（用户拍板）。
    // 每个窗口：{ key, card, x, y, w, h, mode:'float'|'full', pin, tab:'card'|'doc', open, target }
    //   x/y/w/h 是**浮动态**的几何（画布坐标，左上角为原点）：切到全屏再切回来，还是要
    //   回到原来拖到的那个位置，所以 mode 变了也不动它们。
    //   pin 是「钉住」：没钉住的窗口在切卡片 / 切页 / 关闭时照旧自动收起；钉住的不自动关，
    //   可以同时开好几个（这是用户明确要的）。
    const [wins, setWins] = React.useState([])
    // 正在拖动 / 缩放哪个窗口（只用来关掉过渡动画），真几何一律走 winDragRef。
    const [winDrag, setWinDrag] = React.useState(null)
    const [drag, setDrag] = React.useState(null)
    const [ghost, setGhost] = React.useState(null)
    const [panOn, setPanOn] = React.useState(false)
    const [fav, setFav] = React.useState(readFav)
    // 框选（只在画布上生效）：右键拖出一个框，框里的卡片一起选中，方便批量操作。
    // multi = 被框中的卡片键；marquee = 拖动中那个框（画布坐标）。
    const [multi, setMulti] = React.useState([])
    const [marquee, setMarquee] = React.useState(null)
    // 存档卡抽屉：开合 + 筛选词
    const [drawer, setDrawer] = React.useState(false)
    const [drawerQ, setDrawerQ] = React.useState('')
    const drawerRef = React.useRef(null)

    const canvasRef = React.useRef(null)
    const clipRef = React.useRef(null)
    const dragRef = React.useRef(null)
    const linkRef = React.useRef(null)
    const marqueeRef = React.useRef(null)
    // 窗口拖动 / 缩放：和卡片拖动同一个教训 —— 几何只认 ref，不认 state。
    // 真浏览器里 pointermove 之后 React 还没重渲染，紧跟着的 pointerup 读到的闭包里
    // `wins` 还是上一帧的值，于是窗口会「弹回」原处，写进 localStorage 的也是旧几何。
    const winDragRef = React.useRef(null)
    // 拖完紧跟的那一次 click 是拖动的尾巴：吃掉它，不然松手正好落在「×」/「图钉」上就误触了。
    const winSwallow = React.useRef(false)
    // 刚框选完的那一下右键不能弹菜单（Windows 上 contextmenu 有时在 mouseup 之后才派发）
    const justMarqueed = React.useRef(false)
    const clip = React.useRef(null)
    clip.current = props.clipboard || null

    function canvasBox() {
      const el = canvasRef.current
      if (!el || typeof el.getBoundingClientRect !== 'function') return { left: 0, top: 0, width: 900, height: 520 }
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width || 900, height: r.height || 520 }
    }

    function toCanvas(clientX, clientY) {
      const box = canvasBox()
      return { x: (clientX - box.left - view.x) / view.s, y: (clientY - box.top - view.y) / view.s }
    }

    // 拖动中的卡片用「手在哪」而不是图谱里的坐标：卡片本身是这么画的，连线也得这么画，
    // 否则拖卡片时线钉在原地、松手才跳过去（用户报的「连线不能实时渲染」）。
    // 放在组件最上面：渲染、连线起点、右键菜单都要用，函数声明会提升。
    function liveRect(k) {
      const r = rects[k]
      if (!r) return r
      if (drag && drag.pos && drag.pos[k]) return { x: drag.pos[k].x, y: drag.pos[k].y, w: r.w, h: r.h, placed: r.placed }
      if (drag && drag.key === k && !drag.pos) return { x: drag.x, y: drag.y, w: r.w, h: r.h, placed: r.placed }
      return r
    }

    function go(entry) {
      const next = hist.slice(0, hi + 1)
      next.push(entry)
      setHist(next)
      setHi(next.length - 1)
      setSel(null)
      setMulti([])
      closeLoose()
    }
    function back() { if (hi > 0) { setHi(hi - 1); setSel(null); setMulti([]); closeLoose() } }
    function fwd() { if (hi < hist.length - 1) { setHi(hi + 1); setSel(null); setMulti([]); closeLoose() } }
    function home() { if (here.level !== 'root') go({ level: 'root' }) }

    // ── 当前层级的卡片 ─────────────────────────────────────────────────────────
    const level = here.level === 'chapter' ? 'chapter' : 'root'
    const chapterCard = level === 'chapter' ? cards.filter(function (c) { return cardKey(c) === here.key })[0] : null

    const scope = level === 'root'
      ? chaptersInOrder(cards, graph)
      : nodesOfChapter(cards, graph, here.key)

    const inScope = {}
    scope.forEach(function (c) { inScope[cardKey(c)] = true })

    // ── 引用卡（「存档卡抽屉」里拖进来的那些） ──────────────────────────────────
    // 位置存在 分支.json 的 refs[ctx][cardKey]：'top'＝顶层章节画布，否则是那个章节卡的 key。
    // 引用**不改卡片文件、也不进 nodes**（被引用卡自己的 x/y/cx/cy 一格都不动）。
    const ctx = level === 'root' ? 'top' : here.key
    const allCards = props.allCards || cards
    const cardAny = {}
    allCards.forEach(function (c) { cardAny[cardKey(c)] = c })
    const refRecs = refsOf(graph, ctx)
    const refCards = Object.keys(refRecs).map(function (k) { return cardAny[k] }).filter(Boolean)

    const rects = {}
    scope.forEach(function (c) {
      const k = cardKey(c)
      const rec = nodeRec(graph, k)
      const p = level === 'root' ? { x: rec.x, y: rec.y } : { x: rec.cx, y: rec.cy }
      const s = sizeOf(c.type)
      rects[k] = { x: p.x === null ? 0 : p.x, y: p.y === null ? 0 : p.y, w: s.w, h: s.h, placed: p.x !== null && p.y !== null }
    })
    // 引用卡也进 rects：拖动 / 框选 / 整组拖动那几套都按「键 → 矩形」干活，引用跟着一起用。
    // 它们**不进 scope**，所以自动排列看不见它们（用户拍板：不参与自动排列）。
    refCards.forEach(function (c) {
      const k = cardKey(c)
      const rec = refRecs[k]
      const s = refSizeOf(c.type)
      rects[k] = { x: rec.x, y: rec.y, w: s.w, h: s.h, placed: true }
    })

    const placed = scope.filter(function (c) { return rects[cardKey(c)].placed })
    const unplaced = scope.filter(function (c) { return !rects[cardKey(c)].placed })

    const edges = graph.edges.filter(function (e) { return inScope[e.from] && inScope[e.to] })

    // ── 写回图谱 ───────────────────────────────────────────────────────────────
    function patchRec(key, fields) {
      patchMany([key], fields)
    }

    /** 一次给多张卡片写同一个字段（批量染色走它）。同 placeMany：只写一次图谱。 */
    function patchMany(keys, fields) {
      if (!keys || !keys.length) return
      const next = graphWith(graph)
      let refs = null
      for (const key of keys) {
        // 引用卡：染色写进 refs[ctx][key].color，**不碰 nodes**
        if (refRecs[key]) {
          refs = patchRefs(refs ? { refs: refs } : graph, ctx, key, Object.assign({ x: refRecs[key].x, y: refRecs[key].y }, fields))
          continue
        }
        const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        next.nodes[key] = Object.assign({}, old, fields)
      }
      if (refs) next.refs = refs
      props.onGraph(next)
    }

    function placeAt(key, x, y) {
      placeMany([{ key: key, x: x, y: y }])
    }

    /**
     * 一次写回多张卡片的位置。**不能**逐张调 placeAt：每次都从这份还没更新的 graph 起算，
     * 后一次会把前一次的位置覆盖掉 —— 整组拖动时看起来只有最后一张动了。
     * 引用卡的坐标写 refs（保留它自己的手染色），原生卡照旧写 nodes。
     */
    function placeMany(list) {
      if (!list || !list.length) return
      const next = graphWith(graph)
      let refs = null
      for (const it of list) {
        if (refRecs[it.key]) {
          const rec = { x: it.x, y: it.y }
          if (refRecs[it.key].color) rec.color = refRecs[it.key].color
          refs = patchRefs(refs ? { refs: refs } : graph, ctx, it.key, rec)
          continue
        }
        const old = next.nodes[it.key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        next.nodes[it.key] = level === 'root'
          ? Object.assign({}, old, { x: it.x, y: it.y })
          : Object.assign({}, old, { cx: it.x, cy: it.y, chapter: here.key })
      }
      if (refs) next.refs = refs
      props.onGraph(next)
    }

    /** 把一张卡（或另一层的分支卡）作为**引用**摆到这个画布上：只写 refs，落盘一次。 */
    function dropRef(card, x, y) {
      const k = cardKey(card)
      const old = refRecs[k]
      const rec = { x: Math.round(x), y: Math.round(y) }
      if (old && old.color) rec.color = old.color
      props.onGraph(graphWith(graph, { refs: patchRefs(graph, ctx, k, rec) }))
    }

    /** 从当前画布移开一张引用卡：只删 refs 里那一条，绝不删卡片文件、绝不删文档。 */
    function dropRefs(keys) {
      if (!keys || !keys.length) return
      let refs = graph.refs
      for (const k of keys) refs = patchRefs({ refs: refs }, ctx, k, null)
      props.onGraph(graphWith(graph, { refs: refs }))
    }

    function addEdge(from, to, choice) {
      if (!from || !to || from === to) return
      const cid = String(choice || '')
      const mine = function (e) { return e.from === from && String(e.choice || '') === cid }
      // 一个选项只能有一条出线：改连到别的卡片时先把旧的那条摘掉。不摘的话同一个选项
      // 会拖着两条线、指向两个节点（用户报的连接 bug 之一）。
      const kept = graph.edges.filter(function (e) { return !mine(e) })
      const already = graph.edges.some(function (e) { return mine(e) && e.to === to })
      if (already && kept.length === graph.edges.length) return
      const next = graphWith(graph, {
        edges: kept.concat([{ from: from, to: to, label: '', choice: cid }]),
      })
      // 从某个选项的出口拉出去的连线，同时把「这一项通向哪」记进选项本身。
      // 不记的话，展开面板里永远显示「还没连到节点」，选项与节点就断成两截。
      if (cid) next.nodes[from] = bindChoice(next.nodes[from], cid, to)
      props.onGraph(next)
    }

    function removeEdge(from, to, choice) {
      const next = graphWith(graph, {
        edges: graph.edges.filter(function (e) {
          return !(e.from === from && e.to === to && String(e.choice || '') === String(choice || ''))
        }),
      })
      if (choice) next.nodes[from] = bindChoice(next.nodes[from], choice, '')
      props.onGraph(next)
    }

    /** 把某条连线的去向写进它对应的那个选项（to 为空 = 断开）。 */
    function bindChoice(rec, choiceId, to) {
      const old = rec || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      const choices = (old.choices || []).map(function (ch) {
        return ch.id === choiceId ? Object.assign({}, ch, { to: to || '' }) : ch
      })
      return Object.assign({}, old, { choices: choices })
    }

    function addChoice(card) {
      const k = cardKey(card)
      const rec = nodeRec(graph, k)
      const list = (rec.choices || []).slice()
      const letter = String.fromCharCode(65 + list.length)
      list.push({ id: uid('o'), text: '选项' + letter, to: '' })
      patchRec(k, { mode: 'branch', choices: list })
    }

    // ── 展开 / 收起：浮动窗口 ──────────────────────────────────────────────────
    //
    // 用户拍板的三件事：
    //   ① 默认是**浮动窗口**：拖标题栏移动、右下角手柄缩放，最小 320×220，不许拖出画布；
    //   ② 标题栏两个开关：图钉（钉住）、全屏 / 浮动；
    //   ③ 老的全屏遮罩模式不删，作为每个窗口自己的一种模式留着（大段写文档时更专注）。
    // 位置与模式记在 localStorage（40-store 的 windows），下次展开同一张卡回到原处。

    /** 窗口的最小尺寸。画布比这还窄（侧栏）时以画布为准 —— 否则「最小 320」会把窗口顶出画布。 */
    function winMin() {
      const box = canvasBox()
      return {
        w: Math.min(WIN_MIN_W, Math.max(140, Math.round(box.width))),
        h: Math.min(WIN_MIN_H, Math.max(120, Math.round(box.height))),
      }
    }

    /** 收进画布可视区：尺寸不小于最小值、也不大于画布；位置不许把窗口拖出可视区。 */
    function clampWin(x, y, w, h) {
      const box = canvasBox()
      const mn = winMin()
      const W = Math.round(clamp(w, mn.w, Math.max(mn.w, Math.round(box.width))))
      const H = Math.round(clamp(h, mn.h, Math.max(mn.h, Math.round(box.height))))
      const X = Math.round(clamp(x, 0, Math.max(0, Math.round(box.width) - W)))
      const Y = Math.round(clamp(y, 0, Math.max(0, Math.round(box.height) - H)))
      return { x: X, y: Y, w: W, h: H }
    }

    /** 全屏遮罩模式的几何：居中一块 460×430（和旧版一模一样），画布窄时就地收进去。 */
    function fullRect() {
      const box = canvasBox()
      return clampWin(box.width / 2 - EXPAND_W / 2, box.height / 2 - EXPAND_H / 2, EXPAND_W, EXPAND_H)
    }

    /** 第一次展开某张卡时的默认落点：正中一块 460×430。 */
    function defaultRect() {
      return fullRect()
    }

    /** 这张卡上次拖到哪、用的哪种模式（localStorage，整份读改写见 40-store）。 */
    function storedWin(key) {
      const all = (props.ui && props.ui.windows) || null
      const one = all ? all[key] : null
      return one && typeof one === 'object' ? one : null
    }

    function storedRect(key) {
      const one = storedWin(key)
      if (!one) return null
      return clampWin(one.x, one.y, one.w, one.h)
    }

    function isOpen(key) { return wins.some(function (w) { return w.key === key }) }

    function saveWin(key, geo) {
      if (props.onWindowSave) props.onWindowSave(key, geo)
    }

    function openExpand(card) {
      const k = cardKey(card)
      if (isOpen(k)) { bringWinFront(k); return }
      const r = rects[k]
      if (!r) return
      const box = canvasBox()
      const s = view.s
      // 取整：画的时候 .sc-stage 的 translate 本来就要 round 到整像素，state 里留着小数的话，
      // 「按 state 算出来的坐标」和「屏幕上真正画的位置」会差最多半个像素 —— 命中测试、
      // 连线起笔点、几何断言全都会被这半个像素咬到。
      const tx = Math.round(box.width / 2 - (r.x + r.w / 2) * s)
      const ty = Math.round(box.height / 2 - (r.y + r.h / 2) * s)
      // 起飞点＝卡片被平移到正中之后在屏幕上的那个矩形，落点＝窗口的目标矩形。
      const from = {
        x: Math.round(box.width / 2 - (r.w * s) / 2),
        y: Math.round(box.height / 2 - (r.h * s) / 2),
        w: Math.round(r.w * s), h: Math.round(r.h * s),
      }
      const one = storedWin(k)
      const mode = one && one.mode === 'full' ? 'full' : 'float'
      const to = mode === 'full' ? fullRect() : (storedRect(k) || defaultRect())
      setSel(k)
      setView({ x: tx, y: ty, s: s })
      // 钉住的留着，没钉住的收起（「切换卡片就自动收起」这条老行为不丢）
      // ro＝引用卡：只给只读详情，不挂 CardEditor / DocEditor（用户拍板）。
      setWins(wins.filter(function (w) { return w.pin }).concat([{
        key: k, card: card, x: from.x, y: from.y, w: from.w, h: from.h,
        mode: mode, pin: false, tab: 'card', open: false, target: to,
        ro: !!refRecs[k],
      }]))
      setTimeout(function () {
        setWins(function (cur) {
          return cur.map(function (it) {
            if (it.key !== k || !it.target) return it
            const t = it.target
            return Object.assign({}, it, { x: t.x, y: t.y, w: t.w, h: t.h, target: null, open: true })
          })
        })
      }, 30)
    }

    /** 收起没钉住的窗口（切页 / 切卡片 / Esc 都走它）。钉住的照旧开着。 */
    function closeLoose() {
      setWins(wins.filter(function (w) { return w.pin }))
    }

    function closeWin(key) {
      setWins(wins.filter(function (w) { return w.key !== key }))
    }

    function togglePin(key) {
      setWins(wins.map(function (w) {
        return w.key === key ? Object.assign({}, w, { pin: !w.pin }) : w
      }))
    }

    function toggleMode(key) {
      const one = wins.filter(function (w) { return w.key === key })[0]
      if (!one) return
      const mode = one.mode === 'full' ? 'float' : 'full'
      setWins(wins.map(function (w) {
        return w.key === key ? Object.assign({}, w, { mode: mode }) : w
      }))
      // 模式记进 localStorage；x/y/w/h 是浮动态的几何，原样留着
      saveWin(key, { x: one.x, y: one.y, w: one.w, h: one.h, mode: mode })
    }

    function setWinTab(key, tab) {
      setWins(wins.map(function (w) {
        return w.key === key ? Object.assign({}, w, { tab: tab }) : w
      }))
    }

    /** 点到哪个窗口，哪个就浮到最上面（多个钉住的窗口叠在一起时才有意义）。 */
    function bringWinFront(key) {
      setWins(function (list) {
        const i = list.findIndex(function (w) { return w.key === key })
        if (i === -1 || i === list.length - 1) return list
        const out = list.slice()
        out.push(out.splice(i, 1)[0])
        return out
      })
    }

    /** 指针是不是落在一个展开的窗口里（画布自己的按下 / 右键都得让开）。 */
    function insideWindow(target) {
      let n = target
      let depth = 0
      while (n && depth++ < 12) {
        if (typeof n.closest === 'function') {
          try { if (n.closest('.sc-expand')) return true } catch (e) { /* 忽略 */ }
        }
        const cls = (n.classList && n.classList.contains && n.classList.contains('sc-expand'))
          ? 'sc-expand'
          : (n.getAttribute ? String(n.getAttribute('class') || '') : '')
        if (String(cls).split(/\s+/).indexOf('sc-expand') !== -1) return true
        n = n.parentNode
      }
      return false
    }

    // ── 存档卡抽屉 ─────────────────────────────────────────────────────────────
    // 用户拍板：分支页边上挂一个可开合的抽屉，按类型列出**存档族**全部卡片，外加
    // 「别的级别」那一组（当前画布上本来不显示的分支卡：顶层画布＝全部节点/条件/结果，
    // 节点画布＝全部章节卡）。从这里按住拖到画布上就是**摆一张引用**。
    const DRAWER_W = 260

    /** 指针是不是落在抽屉里（抽屉浮在画布上，但它上面的手势不是画布手势）。 */
    function insideDrawer(target) {
      let n = target
      let depth = 0
      while (n && depth++ < 12) {
        if (typeof n.closest === 'function') {
          try { if (n.closest('.sc-drawer')) return true } catch (e) { /* 忽略 */ }
        }
        const cls = (n.classList && n.classList.contains && n.classList.contains('sc-drawer'))
          ? 'sc-drawer'
          : (n.getAttribute ? String(n.getAttribute('class') || '') : '')
        if (String(cls).split(/\s+/).indexOf('sc-drawer') !== -1) return true
        n = n.parentNode
      }
      return false
    }

    /** 抽屉条目按下：左右键都能拖（抽屉里没有别的手势），右键先把浏览器菜单吃掉。 */
    function onDrawerDown(e, card) {
      if (e && e.button !== undefined && e.button !== null && e.button !== 0 && e.button !== 2) return
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      if (e && e.button === 2 && typeof e.preventDefault === 'function') e.preventDefault()
      // 只读（桥不可用）时抽屉能看不能拖：按既有口径把原因说出来
      if (props.api && typeof props.api.canWrite === 'function' && !props.api.canWrite()) {
        if (props.onNotice) {
          props.onNotice({
            text: '只读模式：宿主半边的落盘桥不可用，引用摆不回磁盘。原因：' +
              (props.api.diagnostic ? props.api.diagnostic() : '未知'),
            kind: 'error',
          })
        }
        return
      }
      drawerRef.current = { card: card, moved: false }
      setGhost({ x: e.clientX, y: e.clientY, card: card, fromDrawer: true })
    }

    /** 抽屉的分组（存档卡按类型、别的级别按章节），带筛选。 */
    function drawerGroups() {
      const q = String(drawerQ || '').trim().toLowerCase()
      const hit = function (c) {
        if (!q) return true
        return (String(c.title) + ' ' + String(c.summary) + ' ' + String(c.preview) + ' ' + (c.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1
      }
      const groups = []
      const arch = allCards.filter(function (c) { return !isBranchType(c.type) && hit(c) })
      for (const t of ARCHIVE_ORDER) {
        const items = arch.filter(function (c) { return c.type === t })
          .sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'zh') })
        if (items.length) groups.push({ key: 'a-' + t, label: typeLabel(t), items: items })
      }
      if (level === 'root') {
        // 顶层画布上缺的是「章节里的内容」：按所属章节分组，跟画布上的分组口径一致
        const need = allCards.filter(function (c) {
          return (c.type === 'node' || c.type === 'condition' || c.type === 'result') && hit(c)
        })
        const byChapter = []
        for (const ch of chaptersInOrder(cards, graph)) {
          const items = need.filter(function (c) { return nodeRec(graph, cardKey(c)).chapter === cardKey(ch) })
            .sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'zh') })
          if (items.length) byChapter.push({ key: 'c-' + cardKey(ch), label: cardDisplay(ch), items: items })
        }
        const orphan = need.filter(function (c) { return !nodeRec(graph, cardKey(c)).chapter })
        if (orphan.length) byChapter.push({ key: 'c-none', label: '未归属章节', items: orphan })
        for (const g of byChapter) { g.key = 'l-' + g.key; groups.push(g) }
      } else {
        // 节点画布上缺的是「别的章节」：全部章节卡
        const items = allCards.filter(function (c) { return c.type === 'chapter' && hit(c) })
          .sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'zh') })
        if (items.length) groups.push({ key: 'l-chapter', label: '章节', items: items })
      }
      return groups
    }

    /** 抽屉里的一条：按住就能往画布上拖。 */
    function drawerItem(card, key) {
      const k = cardKey(card)
      const accent = refAccent(card, refRecs[k])
      return React.createElement('div', {
        key: key, className: 'sc-draweritem', 'data-key': k, title: '按住拖到画布上（引用；不改卡片文件）',
        onPointerDown: function (e) { onDrawerDown(e, card) },
        onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
      },
        React.createElement('span', { className: 'sc-draweritemtitle', style: accent ? { color: accent } : undefined }, cardDisplay(card) || card.file),
        React.createElement('span', { className: 'sc-draweritemkind' }, typeLabel(card.type))
      )
    }

    function onWinDown(e, w) {
      if (e && e.button !== undefined && e.button !== null && e.button !== 0) return
      // 自己吃掉，别冒泡到画布：画布会把它当成「空白处按下」→ 取消选中 + 开始平移
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      bringWinFront(w.key)
      // 全屏遮罩模式是固定的一块，不做拖动（它就该钉在正中）
      if (w.mode === 'full') return
      const t = e && e.target
      if (t && typeof t.closest === 'function' && t.closest('button')) return
      winDragRef.current = {
        key: w.key, mode: 'move', ox: e.clientX, oy: e.clientY,
        rx: w.x, ry: w.y, rw: w.w, rh: w.h, cur: null, moved: false,
      }
      winSwallow.current = false
      setWinDrag({ key: w.key, mode: 'move' })
    }

    function onWinGripDown(e, w) {
      if (e && e.button !== undefined && e.button !== null && e.button !== 0) return
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      bringWinFront(w.key)
      if (w.mode === 'full') return
      winDragRef.current = {
        key: w.key, mode: 'resize', ox: e.clientX, oy: e.clientY,
        rx: w.x, ry: w.y, rw: w.w, rh: w.h, cur: null, moved: false,
      }
      winSwallow.current = false
      setWinDrag({ key: w.key, mode: 'resize' })
    }

    /** 拖完那一下 click：吃掉（不然松手正好落在「×」/「图钉」上就会误触）。 */
    function winClick(e) {
      if (!winSwallow.current) return
      winSwallow.current = false
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      if (e && typeof e.preventDefault === 'function') e.preventDefault()
    }

    // ── 交互：拖动卡片 ─────────────────────────────────────────────────────────
    function onCardDown(e, card) {
      if (e.button !== 0) return
      const k = cardKey(card)
      const r = rects[k]
      if (!r) return
      // 点到框选之外的一张：那一组就散掉（跟大多数桌面软件一致）
      if (multi.length && multi.indexOf(k) === -1) setMulti([])
      setSel(k)
      if (!r.placed) return
      const start = toCanvas(e.clientX, e.clientY)
      // 按在选中集合里的任何一张上，整组一起走 —— 框选之后最想要的批量操作就是这个。
      const group = (multi.length > 1 && multi.indexOf(k) !== -1) ? multi.slice() : [k]
      dragRef.current = { key: k, dx: start.x - r.x, dy: start.y - r.y, x: r.x, y: r.y, moved: false, group: group, pos: null }
      setDrag({ key: k, x: r.x, y: r.y, pos: null })
      if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId !== undefined) {
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
      }
    }

    // 拖动的位置只认 ref，不认 state。
    // 真实浏览器里 pointermove 之后 React 还没重渲染（setState 要等一个宏任务），
    // 而 pointerup 是紧接着派发的 —— 此时闭包里的 `drag` 还是松手前那一帧的值，
    // 于是卡片被写回原位，看起来就是「拖了没写」。ref 永远是刚算出来的那个坐标。
    function movePointers(e) {
      // 浮动窗口的拖动 / 缩放排在最前：它和画布手势互斥，谁先拿到谁接管。
      // 几何一律从 ref 里算（那里存的 rx/ry/rw/rh 是按下时的原始值，不会被自己改写），
      // 再整份写回 state；松手时读 ref、不读 state。
      const wd = winDragRef.current
      if (wd) {
        const dx = (Number(e.clientX) || 0) - wd.ox
        const dy = (Number(e.clientY) || 0) - wd.oy
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wd.moved = true
        const r = wd.mode === 'resize'
          ? clampWin(wd.rx, wd.ry, wd.rw + dx, wd.rh + dy)
          : clampWin(wd.rx + dx, wd.ry + dy, wd.rw, wd.rh)
        wd.cur = r
        setWins(function (list) {
          return list.map(function (w) {
            return w.key === wd.key ? Object.assign({}, w, { x: r.x, y: r.y, w: r.w, h: r.h }) : w
          })
        })
        return
      }
      if (marqueeRef.current) {
        const m = marqueeRef.current
        // 右键已经松开了还在动鼠标（比如中途 pointerup 丢了）就别再画框
        if (e.buttons !== undefined && (e.buttons & 2) === 0) { marqueeRef.current = null; setMarquee(null); return }
        const p = toCanvas(e.clientX, e.clientY)
        if (Math.abs(p.x - m.ox) > 3 || Math.abs(p.y - m.oy) > 3) m.moved = true
        m.x = p.x
        m.y = p.y
        if (m.moved) {
          // 拖出框来就不是「右键点一下」了：把可能已经弹出的菜单收掉
          setMenu(null)
          setEdgeMenu(null)
          setMarquee({ x: Math.min(m.ox, m.x), y: Math.min(m.oy, m.y), w: Math.abs(m.x - m.ox), h: Math.abs(m.y - m.oy) })
        }
        return
      }
      if (dragRef.current) {
        const d = dragRef.current
        const p = toCanvas(e.clientX, e.clientY)
        const x = Math.round(p.x - d.dx)
        const y = Math.round(p.y - d.dy)
        d.moved = true
        d.x = x
        d.y = y
        if (d.group && d.group.length > 1) {
          // 整组跟着走：每张相对被拖那张的偏移固定不变
          const base = rects[d.key]
          const pos = {}
          d.group.forEach(function (gk) {
            const gr = rects[gk]
            if (!gr || !base) return
            pos[gk] = { x: Math.round(x + (gr.x - base.x)), y: Math.round(y + (gr.y - base.y)) }
          })
          d.pos = pos
          setDrag({ key: d.key, x: x, y: y, pos: pos })
        } else {
          d.pos = null
          setDrag({ key: d.key, x: x, y: y, pos: null })
        }
        return
      }
      if (linkRef.current) {
        const p = toCanvas(e.clientX, e.clientY)
        setLink(Object.assign({}, linkRef.current, { x: p.x, y: p.y }))
        return
      }
      if (panRef.current) {
        const s = panRef.current
        setView({ x: s.vx + (e.clientX - s.px), y: s.vy + (e.clientY - s.py), s: s.s })
        return
      }
      if (dockRef.current) {
        setGhost({ x: e.clientX, y: e.clientY, card: dockRef.current.card })
      }
      if (drawerRef.current) {
        drawerRef.current.moved = true
        setGhost({ x: e.clientX, y: e.clientY, card: drawerRef.current.card, fromDrawer: true })
      }
    }

    function upPointers(e) {
      if (winDragRef.current) {
        const wd = winDragRef.current
        winDragRef.current = null
        setWinDrag(null)
        if (wd.moved) {
          // 这一下松手之后的 click 是拖动的尾巴，吃掉它
          winSwallow.current = true
          const r = wd.cur || { x: wd.rx, y: wd.ry, w: wd.rw, h: wd.rh }
          saveWin(wd.key, { x: r.x, y: r.y, w: r.w, h: r.h })
        }
        return
      }
      if (marqueeRef.current) {
        const m = marqueeRef.current
        marqueeRef.current = null
        setMarquee(null)
        if (!m.moved) return
        justMarqueed.current = true
        const box = { x: Math.min(m.ox, m.x), y: Math.min(m.oy, m.y), w: Math.abs(m.x - m.ox), h: Math.abs(m.y - m.oy) }
        const hit = []
        // 引用卡也要能被框进来（用户拍板：批量框选能带上它）
        scope.concat(refCards).forEach(function (c) {
          const k = cardKey(c)
          const r = rects[k]
          if (!r || !r.placed) return
          if (r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y) hit.push(k)
        })
        setMulti(hit)
        if (hit.length) setSel(hit[0])
        return
      }
      if (dragRef.current) {
        const d = dragRef.current
        dragRef.current = null
        if (d.moved) {
          if (d.pos) {
            const list = Object.keys(d.pos).map(function (gk) { return { key: gk, x: d.pos[gk].x, y: d.pos[gk].y } })
            placeMany(list)
          } else {
            placeAt(d.key, d.x, d.y)
          }
        }
        setDrag(null)
        return
      }
      if (panRef.current) { panRef.current = null; setPanOn(false); return }
      if (drawerRef.current) {
        // 从抽屉里拖出来的：落在画布上就摆一张**引用**（只写 refs），落在画布外就取消
        const d = drawerRef.current
        drawerRef.current = null
        setGhost(null)
        const box = canvasBox()
        const inside = e.clientX >= box.left && e.clientX <= box.left + box.width && e.clientY >= box.top && e.clientY <= box.top + box.height
        if (inside) {
          const p = toCanvas(e.clientX, e.clientY)
          const s = refSizeOf(d.card.type)
          dropRef(d.card, p.x - s.w / 2, p.y - s.h / 2)
          setSel(cardKey(d.card))
          if (props.onNotice) props.onNotice({ text: '已把「' + (cardDisplay(d.card) || d.card.file) + '」摆到画布上（引用，不改卡片文件）', kind: 'info' })
        }
        return
      }
      if (dockRef.current) {
        const d = dockRef.current
        dockRef.current = null
        setGhost(null)
        const box = canvasBox()
        const inside = e.clientX >= box.left && e.clientX <= box.left + box.width && e.clientY >= box.top && e.clientY <= box.top + box.height
        if (inside) {
          const p = toCanvas(e.clientX, e.clientY)
          const s = sizeOf(d.card.type)
          placeAt(cardKey(d.card), Math.round(p.x - s.w / 2), Math.round(p.y - s.h / 2))
        }
        return
      }
      if (linkRef.current) {
        const from = linkRef.current
        linkRef.current = null
        setLink(null)
        const target = hitCard(e.clientX, e.clientY)
        if (target && target !== from.from) addEdge(from.from, target, from.choice)
      }
    }

    const panRef = React.useRef(null)
    const dockRef = React.useRef(null)
    // 「最近一次按下是不是落在画布上」。快捷键只在它为真时才生效 —— 否则打开面板以后
    // 连对话输入框里的 Ctrl+V 都会被吃掉（对话输入框是 contenteditable，不是 input）。
    const boardHot = React.useRef(false)

    React.useEffect(function () {
      function move(e) { movePointers(e) }
      function up(e) { upPointers(e) }
      function wheel(e) { onWheel(e) }
      function down(e) { markHot(e) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      // 捕获阶段记「按在哪」：卡片和选项自己都 stopPropagation，冒泡阶段收不到。
      window.addEventListener('pointerdown', down, true)
      // 滚轮得自己挂，而且不能被当成 passive：React 是把 onWheel 注册成 passive 监听器的，
      // 里面调 preventDefault() 根本无效 —— 于是滚轮一边缩放，页面一边跟着滚/跟着缩放。
      const el = canvasRef.current
      if (el && typeof el.addEventListener === 'function') el.addEventListener('wheel', wheel, { passive: false })
      return function () {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointerdown', down, true)
        if (el && typeof el.removeEventListener === 'function') el.removeEventListener('wheel', wheel)
      }
    })

    function markHot(e) {
      const box = canvasBox()
      const x = Number(e && e.clientX) || 0
      const y = Number(e && e.clientY) || 0
      boardHot.current = x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
    }

    /** 焦点在输入框 / 可编辑区（对话输入框就是 contenteditable）时，快捷键一律让路。 */
    function isEditable(el) {
      let node = el
      let depth = 0
      while (node && depth++ < 8) {
        const tag = node.tagName ? String(node.tagName).toLowerCase() : ''
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
        if (node.isContentEditable === true) return true
        const attr = node.getAttribute ? node.getAttribute('contenteditable') : null
        if (attr === '' || attr === 'true' || attr === 'plaintext-only') return true
        node = node.parentNode
      }
      return false
    }

    /** 从这个元素往上找卡片 key（真实 DOM 里靠 data-key 认卡片）。 */
    function keyUnder(el) {
      let node = el
      while (node && node.getAttribute) {
        const k = node.getAttribute('data-key')
        if (k) return k
        node = node.parentNode
      }
      return null
    }

    function hitCard(clientX, clientY) {
      const el = typeof document !== 'undefined' && document.elementFromPoint ? document.elementFromPoint(clientX, clientY) : null
      return keyUnder(el)
    }

    function onCanvasDown(e) {
      // 浮动窗口 / 抽屉里的按下不是画布手势：不确定这一条的话，点一下文档输入框、
      // 或者按住抽屉里的一张卡，都会变成「取消选中 + 开始平移整块画布」。
      if (insideWindow(e.target) || insideDrawer(e.target)) return
      // 全屏遮罩模式的窗口是「锁住画布」的（老的展开行为）；浮动窗口不锁 ——
      // 这正是浮动窗口的意义：它开着，画布照样能拖能滚。
      const blocked = wins.some(function (w) { return w.mode === 'full' })
      // 空白处：左键（默认）/ 中键 / Alt+左键都拖画布。卡片上的按下不算 —— 那是拖卡片，
      // 事件会冒泡到这里来，得让开，不然一次拖动会被两条路同时接管。
      // 连线标签和连线本身也算「不是空白」：点标签是改名字，不是取消选中 + 拖画布。
      const onEdge = !!(e.target && typeof e.target.getAttribute === 'function' && e.target.getAttribute('data-edge'))
      const blank = !keyUnder(e.target) && !onEdge && !blocked
      // 右键拖 = 框选多张（画布上才有；全屏遮罩时不介入）。
      // 右键**没有**拖动的那一下仍然照旧弹菜单。
      if (e.button === 2 && !blocked) {
        const p = toCanvas(e.clientX, e.clientY)
        marqueeRef.current = { ox: p.x, oy: p.y, x: p.x, y: p.y, moved: false }
        justMarqueed.current = false
        setMenu(null)
        setEdgeMenu(null)
        return
      }
      if (e.button === 0 && blank) { setSel(null); setMulti([]) }
      if (e.button === 1 || (e.button === 0 && blank)) {
        panRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, s: view.s }
        setPanOn(true)
        e.preventDefault()
      }
    }

    function onWheel(e) {
      // 浮层自己吃滚轮：展开的卡片是一页可以上下滚的内容，抽屉也是一块可滚的列表 ——
      // 指针落在它们里面时，滚轮归它们：既不缩放画布，也**不能 preventDefault /
      // stopPropagation**（拦下默认行为它就滚不动了，用户报的「存档卡没法用滚轮上下滑动」
      // 就是被这里吃掉的）。用户原话：「当鼠标悬浮在存档卡界面上时，让存档卡来接管
      // 鼠标滚动的输出」。
      // 标记用属性 data-wheel="own"，别按类名硬编码：以后新加浮层只要打这个属性。
      const t = e && e.target
      const own = t && typeof t.closest === 'function' ? t.closest('[data-wheel="own"]') : null
      if (own) return
      // 兜底：万一某个浮层还没打上属性，老的类名判断留着
      if (t && typeof t.closest === 'function' && t.closest('.sc-expand')) return
      e.preventDefault()
      // deltaX/deltaY 偶尔缺失（合成事件、老浏览器），缺了就当 0 —— 否则 view 里
      // 会混进 NaN，整块画布跟着一起废掉。
      const dx = Number(e.deltaX) || 0
      const dy = Number(e.deltaY) || 0
      if (e.shiftKey || e.altKey) {
        // 滚轮让给缩放之后，得留一条纯平移的路：Shift 左右、Alt 上下。
        setView(e.shiftKey
          ? { x: view.x - (dy + dx), y: view.y, s: view.s }
          : { x: view.x, y: view.y - dy, s: view.s })
        return
      }
      // 默认滚轮就是缩放，以指针为中心。Ctrl/⌘+滚轮照样缩放 —— 触控板捏合走的就是它。
      const s2 = zoomStep(view.s, dy < 0 ? 1 : -1)
      if (s2 === view.s) return
      const box = canvasBox()
      const px = e.clientX - box.left
      const py = e.clientY - box.top
      // 同上：state 与屏幕上的整像素保持一份，别留小数
      setView({
        x: Math.round(px - ((px - view.x) / view.s) * s2),
        y: Math.round(py - ((py - view.y) / view.s) * s2),
        s: s2,
      })
    }

    // ── 连线的名字 ─────────────────────────────────────────────────────────────
    // 平时线上什么都不显示；点一下某条线，那条线上才浮出输入框（用户的要求：
    // 不选中的时候直接隐藏）。已经起过名字的线，名字一直挂着。
    function sameEdge(a, b) {
      return !!a && !!b && a.from === b.from && a.to === b.to && String(a.choice || '') === String(b.choice || '')
    }

    function startRename(e) {
      setMenu(null)
      setEdgeMenu(null)
      setRename({ from: e.from, to: e.to, choice: e.choice || '', value: e.label || '' })
    }

    function commitRename() {
      if (!rename) return
      const v = String(rename.value || '').trim()
      const edge = { from: rename.from, to: rename.to, choice: rename.choice }
      setRename(null)
      props.onSetEdgeLabel(edge, v)
    }

    /** 这根橡皮筋是从哪个选项拉出来的（-1 = 从卡片本身的出口）。 */
    function choiceIndexOf(l) {
      if (!l || !l.choice) return -1
      const rec = nodeRec(graph, l.from)
      return (rec.choices || []).findIndex(function (ch) { return ch.id === l.choice })
    }

    /**
     * 这根线从哪个像素点起笔。真实 DOM 里直接量那颗圆点的中心 —— 选项行高、卡片展开
     * 之后的高度怎么变都对得上；量不到（无头渲染器没有布局）才退回按几何算。
     */
    function portPoint(e, card, choice) {
      const el = e && e.currentTarget
      if (el && typeof el.getBoundingClientRect === 'function') {
        const r = el.getBoundingClientRect()
        if (r && (r.width || r.height)) {
          const box = canvasBox()
          return {
            x: (r.left + r.width / 2 - box.left - view.x) / view.s,
            y: (r.top + r.height / 2 - box.top - view.y) / view.s,
          }
        }
      }
      const k = cardKey(card)
      const rec = nodeRec(graph, k)
      const rect = rects[k]
      if (!rect) return { x: 0, y: 0 }
      const i = !choice ? -1 : (rec.choices || []).findIndex(function (ch) { return ch.id === choice })
      return outPoint(rect, i, (rec.choices || []).length)
    }

    function linkStartPoint(l) {
      if (l && isFinite(l.ox) && isFinite(l.oy)) return { x: l.ox, y: l.oy }
      const rec = nodeRec(graph, l.from || '')
      const rect = liveRect(l.from) || { x: 0, y: 0, w: 0, h: 0 }
      return outPoint(rect, choiceIndexOf(l), (rec.choices || []).length)
    }

    function startLink(e, card, choice) {
      // 只认左键：右键在端口上应该还是弹菜单，不能顺手拉出一根线来。
      if (e && e.button !== undefined && e.button !== null && e.button !== 0) return
      const k = cardKey(card)
      const p = portPoint(e, card, choice)
      linkRef.current = { from: k, choice: choice || '', x: p.x, y: p.y, ox: p.x, oy: p.y }
      setLink(linkRef.current)
    }

    function dropLink(e, card) {
      if (!linkRef.current) return
      const from = linkRef.current
      linkRef.current = null
      setLink(null)
      const to = cardKey(card)
      if (to !== from.from) addEdge(from.from, to, from.choice)
    }

    // ── 自动排列 ───────────────────────────────────────────────────────────────
    // 只处理本层的**原生**卡：scope 里没有引用卡，所以引用卡既不被挪动、也不参与占位
    // （用户拍板：引用不参与自动排列）。
    function autoArrange() {
      const keys = scope.map(cardKey)
      const slots = {}
      scope.forEach(function (c) { slots[cardKey(c)] = slotOf(c, nodeRec(graph, cardKey(c))) })
      const out = autoLayout(keys, function (k) { return slots[k] }, edges)
      const next = graphWith(graph)
      for (const k of Object.keys(out)) {
        const old = next.nodes[k] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        // 卡片就摆在 out 给的位置上：选项列是溢出的，不参与卡片自己的坐标
        next.nodes[k] = level === 'root'
          ? Object.assign({}, old, { x: out[k].x, y: out[k].y })
          : Object.assign({}, old, { cx: out[k].x, cy: out[k].y, chapter: here.key })
      }
      props.onGraph(next)
      setView({ x: 24, y: 20, s: view.s })
    }

    function clearCanvas() {
      const next = graphWith(graph)
      for (const c of scope) {
        const k = cardKey(c)
        const old = next.nodes[k]
        if (!old) continue
        next.nodes[k] = level === 'root'
          ? Object.assign({}, old, { x: null, y: null })
          : Object.assign({}, old, { cx: null, cy: null })
      }
      props.onGraph(next)
    }

    function dockTap(card) {
      const key = cardKey(card)
      // 落位也按「卡片 + 溢出的选项列」整块算：分歧节点那列选项不能压到已经摆好的卡片上。
      const slotOfCard = function (c) { return slotOf(c, nodeRec(graph, cardKey(c))) }
      const rectList = scope.filter(function (c) { return rects[cardKey(c)].placed }).map(function (c) {
        return slotBox(rects[cardKey(c)], slotOfCard(c))
      })
      const slot = slotOfCard(card)
      const spot = autoSpot(rectList, slot.w, slot.h + slot.over * 2)
      placeAt(key, spot.x, spot.y + slot.over)
    }

    function onDockDown(e, card) {
      if (e.button !== 0) return
      dockRef.current = { card: card }
      setGhost({ x: e.clientX, y: e.clientY, card: card })
    }

    // ── 快捷键 ─────────────────────────────────────────────────────────────────
    function copyCard(card, cut) {
      props.onClipboard({ card: card, cut: !!cut, key: cardKey(card) })
      props.onNotice({ text: (cut ? '已剪切 ' : '已复制 ') + cardDisplay(card), kind: 'info' })
    }

    React.useEffect(function () {
      function onKey(e) {
        // 焦点在输入框 / 可编辑区里一律不动手：对话输入框是 contenteditable（不是
        // input/textarea），早先这里只看 tagName，于是打开面板以后在对话里按 Ctrl+V
        // 会被这里 preventDefault 掉 —— 用户报的「打开侧边栏后对话框粘不进字」。
        if (isEditable(e.target)) return
        // 最近一次点击不在画布上（比如刚点过对话输入框）也不动手，把快捷键还给宿主。
        if (!boardHot.current) return
        const cur = sel ? scope.filter(function (c) { return cardKey(c) === sel })[0] : null
        if (matchKey(e, 'mod+c') && cur) { e.preventDefault(); copyCard(cur, false); return }
        if (matchKey(e, 'mod+x') && cur) { e.preventDefault(); copyCard(cur, true); removeFromCanvas(cur); return }
        if (matchKey(e, 'mod+v')) { e.preventDefault(); pasteAt(null); return }
        if (matchKey(e, 'mod+d') && cur) { e.preventDefault(); props.onDuplicate(cur); return }
        if (matchKey(e, 'space') && cur) {
          e.preventDefault()
          if (isOpen(sel)) closeWin(sel)
          else openExpand(cur)
          return
        }
        if (matchKey(e, 'delete') && cur) {
          e.preventDefault()
          // 框选了一组就整组移出画布（文件不动），否则只动当前这张
          if (multi.length > 1) removeManyFromCanvas(multi)
          else removeFromCanvas(cur)
          return
        }
        if (matchKey(e, 'mod+0')) { e.preventDefault(); setView({ x: 24, y: 20, s: 1 }); return }
        if (matchKey(e, 'mod+1')) { e.preventDefault(); setView({ x: view.x, y: view.y, s: 1 }); return }
        if (matchKey(e, 'esc')) {
          // 先收窗口（没钉住的），再退一步收菜单 / 取消选择
          if (wins.some(function (w) { return !w.pin })) closeLoose()
          else { setMenu(null); setMulti([]) }
          return
        }
        if (matchKey(e, 'mod+a')) { e.preventDefault(); setMulti(placed.map(cardKey).concat(refCards.map(cardKey))); return }
      }
      window.addEventListener('keydown', onKey)
      return function () { window.removeEventListener('keydown', onKey) }
    })

    function removeFromCanvas(card) {
      removeManyFromCanvas([cardKey(card)])
    }

    /** 一次把多张卡片移出画布（文件不动）。同 placeMany：只写一次图谱。
     *  引用卡只从 refs 里删掉那一条 —— **绝不删卡片文件、绝不删文档**。 */
    function removeManyFromCanvas(keys) {
      if (!keys || !keys.length) return
      const set = {}
      const refKeys = []
      keys.forEach(function (k) { set[k] = true; if (refRecs[k]) refKeys.push(k) })
      const next = graphWith(graph, {
        chapters: graph.chapters.filter(function (x) { return !set[x] }),
      })
      for (const k of keys) {
        if (refRecs[k]) continue
        if (level === 'root') next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { x: null, y: null })
        else next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { cx: null, cy: null })
      }
      next.edges = next.edges.filter(function (e) { return !set[e.from] && !set[e.to] })
      if (refKeys.length) {
        let refs = graph.refs
        for (const k of refKeys) refs = patchRefs({ refs: refs }, ctx, k, null)
        next.refs = refs
      }
      props.onGraph(next)
      setMulti([])
    }

    function pasteAt(point) {
      const clipv = clip.current
      if (!clipv || !clipv.card) return
      const card = clipv.card
      if (clipv.cut) {
        const p = point || { x: 40, y: 40 }
        placeAt(cardKey(card), Math.round(p.x), Math.round(p.y))
        props.onClipboard(null)
        return
      }
      props.onPasteCopy(card, point)
    }

    function newCard(type, point, mode) {
      props.onNewCard(type, point, level === 'chapter' ? here.key : '', mode || '')
    }

    /**
     * 引用卡的右键菜单：只有 染色 + 从画布移开。
     * 用户拍板：**不许**出现「删除卡片文件」或任何连线项 —— 引用不是这张画布上的卡，
     * 改内容要回方片页去改。
     */
    function refMenuItems(card) {
      const k = cardKey(card)
      return [
        { head: '引用卡（内容回方片页改）' },
        { head: '染色' },
        { key: 'color', colors: true },
        { sep: true },
        { key: 'out', label: '从画布移开', hint: 'Delete', onPick: function () { dropRefs([k]) } },
      ]
    }

    function menuItems(card) {
      const k = cardKey(card)
      const rec = nodeRec(graph, k)
      const items = []
      items.push({ key: 'exp', label: isOpen(k) ? '收起' : '展开', hint: shortcutHint('展开'), onPick: function () { if (isOpen(k)) closeWin(k); else openExpand(card) } })
      items.push({ sep: true })
      items.push({ key: 'cp', label: '复制', hint: shortcutHint('复制'), onPick: function () { copyCard(card, false) } })
      items.push({ key: 'ct', label: '剪切', hint: shortcutHint('剪切'), onPick: function () { copyCard(card, true); removeFromCanvas(card) } })
      items.push({ key: 'ps', label: '粘贴到此处', hint: shortcutHint('粘贴'), disabled: !clip.current, onPick: function () { pasteAt({ x: rects[k].x, y: rects[k].y }) } })
      items.push({ key: 'du', label: '原地复制一张', hint: shortcutHint('原地复制'), onPick: function () { props.onDuplicate(card) } })
      items.push({ sep: true })
      items.push({ head: '染色' })
      items.push({ key: 'color', colors: true })
      items.push({ sep: true })
      if (card.type === 'condition' || card.type === 'result') {
        const other = card.type === 'condition' ? 'result' : 'condition'
        items.push({ key: 'sw', label: '改为' + typeLabel(other) + '卡片', onPick: function () { props.onRetype(card, other) } })
      }
      if (card.type === 'node') {
        const isBranch = rec.mode === 'branch' || card.mode === 'branch'
        items.push({ key: 'br', label: isBranch ? '改回普通节点' : '改为分歧节点', onPick: function () { patchRec(k, { mode: isBranch ? '' : 'branch', choices: rec.choices && rec.choices.length ? rec.choices : [{ id: uid('o'), text: '选项A', to: '' }] }) } })
        if (isBranch) {
          items.push({ key: 'chs', label: '编辑选项列表…', onPick: function () { props.onEditChoices(card) } })
        }
      }
      items.push({ key: 'out', label: '移出画布', hint: 'Delete', onPick: function () { removeFromCanvas(card) } })
      items.push({ key: 'del', label: '删除卡片文件…', danger: true, onPick: function () { props.onDeleteCard(card) } })
      return items
    }

    function emptyMenuItems() {
      const types = level === 'root' ? ['chapter'] : ['node', 'condition', 'result']
      const ordered = types.slice().sort(function (a, b) { return (a === fav ? -1 : 0) - (b === fav ? -1 : 0) })
      const items = [{ head: '新建（空白处右键）' }]
      for (const t of ordered) {
        items.push({
          key: 'new-' + t, label: '新建' + typeLabel(t) + (fav === t ? '　★常用' : ''),
          onPick: function () { newCard(t, menuPoint.current) },
        })
      }
      if (level !== 'root') {
        items.push({
          key: 'new-node-branch', label: '新建分歧节点',
          onPick: function () { newCard('node', menuPoint.current, 'branch') },
        })
      }
      items.push({ sep: true })
      items.push({ head: '常用类型（新建时排最前）' })
      for (const t of types) {
        items.push({
          key: 'fav-' + t, label: typeLabel(t), checked: fav === t,
          onPick: function () { setFav(t); writeFav(t) },
        })
      }
      items.push({ sep: true })
      items.push({ key: 'ps', label: '粘贴', hint: shortcutHint('粘贴'), disabled: !clip.current, onPick: function () { pasteAt(menuPoint.current) } })
      items.push({ sep: true })
      items.push({ key: 'auto', label: '自动排列', onPick: autoArrange })
      items.push({ key: 'clear', label: '清空画布位置', onPick: clearCanvas })
      items.push({ key: 'fit', label: '缩放归位', hint: shortcutHint('缩放归位'), onPick: function () { setView({ x: 24, y: 20, s: 1 }) } })
      return items
    }

    // 框选出一组之后的批量菜单：只做「一次操作多张」的事，单张编辑留给卡片自己的菜单。
    // 混着引用卡时：**原生卡照旧走「删除卡片文件」的三步确认，引用卡只移开**
    //（用户拍板：引用卡从不删文件）。
    function batchMenuItems(keys) {
      const n = keys.length
      const refSel = keys.filter(function (k) { return !!refRecs[k] })
      const nativeSel = keys.filter(function (k) { return !refRecs[k] })
      const items = [
        { head: '已选 ' + n + ' 张（右键拖框选）' },
        { key: 'out', label: '移出画布', hint: 'Delete', onPick: function () { removeManyFromCanvas(keys) } },
        { sep: true },
        { head: '染色' },
        { key: 'color', colors: true },
        { sep: true },
        { key: 'selectall', label: '选中这一层全部', onPick: function () { setMulti(placed.map(cardKey).concat(refCards.map(cardKey))) } },
      ]
      if (nativeSel.length) {
        items.push({
          key: 'del', label: '删除这 ' + nativeSel.length + ' 张卡片文件…', danger: true,
          // 引用卡只移开（先写 refs），原生卡才走三步确认那条删文件的路
          onPick: function () { if (refSel.length) dropRefs(refSel); props.onDeleteCards(nativeSel) },
        })
      } else {
        items.push({ head: '选中 ' + refSel.length + ' 张引用卡：移开即可，不会删文件' })
      }
      items.push({ key: 'clr', label: '取消选择', onPick: function () { setMulti([]); setSel(null) } })
      return items
    }

    const menuPoint = React.useRef({ x: 40, y: 40 })

    function onCanvasMenu(e) {
      // 窗口/抽屉里的右键还给组件自己（文档里选中一段要复制，靠的就是原生菜单）
      if (insideWindow(e.target) || insideDrawer(e.target)) return
      e.preventDefault()
      // 框选的收尾不是「打开菜单」：拖出过框（或刚拖完）就把这一下右键吃掉。
      if ((marqueeRef.current && marqueeRef.current.moved) || justMarqueed.current) {
        justMarqueed.current = false
        return
      }
      if (e.target !== e.currentTarget && !(e.target.classList && e.target.classList.contains('sc-stage'))) {
        // 点在卡片上时由卡片的 onContextMenu 处理
      }
      const p = toCanvas(e.clientX, e.clientY)
      menuPoint.current = { x: Math.round(p.x), y: Math.round(p.y) }
      setEdgeMenu(null)
      setMenu({ x: e.clientX, y: e.clientY, card: null })
    }

    function onCardMenu(e, card) {
      setEdgeMenu(null)
      if (justMarqueed.current) { justMarqueed.current = false; return }
      const k = cardKey(card)
      // 右键落在框选出来的那一组里 → 给批量菜单，别再只操作一张
      if (multi.length > 1 && multi.indexOf(k) !== -1) {
        setSel(k)
        setMenu({ x: e.clientX, y: e.clientY, card: null, batch: multi.slice() })
        return
      }
      setSel(k)
      setMulti([])
      setMenu({ x: e.clientX, y: e.clientY, card: card })
    }

    useDismiss(function () { setMenu(null) }, !!menu)
    useDismiss(function () { setEdgeMenu(null) }, !!edgeMenu)

    // ── 渲染 ───────────────────────────────────────────────────────────────────
    const scrimOn = wins.some(function (w) { return w.mode === 'full' })
    const stageAnim = wins.some(function (w) { return !w.open })
    const stageStyle = {
      // 取整：层原点落在整数像素上，文字才是像素对齐的（小数偏移会让整块画布发虚）。
      transform: 'translate(' + Math.round(view.x) + 'px,' + Math.round(view.y) + 'px) scale(' + view.s + ')',
    }
    // 只有「展开时把卡片飞到窗口里」需要过渡。平移/缩放要是也套 .28s 过渡，既跟不上手，
    // 又让浏览器一直拿旧位图做动画 —— 那是画布糊掉的另一半原因。
    // 浮动窗口开着的时候画布照样能拖能滚，所以过渡只在窗口**正在飞**的那 30ms 里打开。
    if (!stageAnim || drag) stageStyle.transition = 'none'

    const edgeEls = []
    // 连线标签**不能**放进 <svg> 里 —— 浏览器不渲染 SVG 里的 HTML 元素，它会是 0×0、
    // 点不到（用户报的「连线不能编辑名字」就是这个：标签一直画不出来，也就没有可点的
    // 地方）。这里单独攒一层 HTML，渲染在 svg 之后、卡片之前。
    // DOM 顺序在卡片前面，可它**不能**因此就被卡片压住：线的中点常常落在某张卡片底下，
    // 那样点线浮出来的输入框就只露半个（用户报的「输入框图层在最底下，看不全」）。
    // 所以 .sc-elabel 自己带 z-index，比卡片（auto）和选项列（2）都高。
    // 静态 HTML 里看不出「塞进 <g>」这个坑（HTML 解析器会把 div 弹出 svg），
    // 只有 React 那样走 createElementNS 才会中招 —— 所以 tests/visual.mjs 盯着这条。
    const edgeLabels = []
    for (const e of edges) {
      // liveRect：拖动中的卡片要按它当前被画在哪算，线才会实时跟着走。
      const a = liveRect(e.from)
      const b = liveRect(e.to)
      if (!a || !b || !a.placed || !b.placed) continue
      let ci = -1
      let ccount = 0
      if (e.choice) {
        const rec = nodeRec(graph, e.from)
        ccount = (rec.choices || []).length
        ci = (rec.choices || []).findIndex(function (ch) { return ch.id === e.choice })
      }
      const pa = outPoint(a, ci, ccount)
      const pb = inPoint(b)
      const on = sel === e.from || sel === e.to || sameEdge(rename, e)
      const d = edgePath(pa, pb)
      // React 的 key 要连选项一起带上：同一个分歧节点的两个选项可以通向同一张卡，
      // 只按「起点->终点」编号会撞车。data-edge 保持「起点->终点」（一条线一对端点）。
      const ekey = e.from + '->' + e.to + ':' + (e.choice || '')
      const epair = e.from + '->' + e.to
      const editing = sameEdge(rename, e)
      edgeEls.push(React.createElement('g', { key: ekey },
        React.createElement('path', {
          className: 'sc-edgehit', d: d, 'data-edge': epair, 'data-echoice': e.choice || '',
          onContextMenu: function (ev) {
            ev.preventDefault(); ev.stopPropagation()
            setMenu(null)
            setEdgeMenu({ x: ev.clientX, y: ev.clientY, edge: e })
          },
          // 点线就改名字：平时线上什么都没有，点哪条线，哪条线上才浮出输入框
          // （用户的要求：不选中的时候直接隐藏）。回车 / 点别处保存，Esc 放弃。
          onClick: function (ev) { ev.stopPropagation(); startRename(e) },
          title: '点一下给这条连线起名字，右键重命名 / 删除',
        }),
        React.createElement('path', { className: 'sc-edge' + (on ? ' on' : ''), d: d, markerEnd: 'url(#sc-arrow' + (on ? '-on' : '') + ')' })
      ))
      const mid = edgeMid(pa, pb)
      // 已经起过名字的线，名字一直挂在线上（不然起名字就没意义了）；没名字的什么都不显示。
      if (e.label && !editing) {
        edgeLabels.push(React.createElement('div', {
          key: 'lbl' + ekey,
          className: 'sc-elabel' + (on ? ' on' : ''),
          style: { left: mid.x, top: mid.y },
          'data-edge': epair, 'data-echoice': e.choice || '',
          title: '点一下改名字：' + e.label,
          onClick: function (ev) { ev.stopPropagation(); startRename(e) },
        }, e.label))
      }
      if (editing) {
        edgeLabels.push(React.createElement('input', {
          key: 'edt' + ekey,
          className: 'sc-elabel sc-elabeledit',
          style: { left: mid.x, top: mid.y },
          'data-edge': epair, 'data-echoice': e.choice || '',
          value: rename.value,
          autoFocus: true,
          placeholder: '连线名字',
          onPointerDown: function (ev) { ev.stopPropagation() },
          onClick: function (ev) { ev.stopPropagation() },
          onChange: function (ev) { setRename(Object.assign({}, rename, { value: ev.target.value })) },
          onBlur: function () { commitRename() },
          onKeyDown: function (ev) {
            // 画布上的快捷键（Delete / 空格 / Ctrl+V）不能在打字时抢走按键
            ev.stopPropagation()
            if (ev.key === 'Enter') commitRename()
            else if (ev.key === 'Escape') setRename(null)
          },
        }))
      }
    }

    const cardEls = scope.map(function (c) {
      const k = cardKey(c)
      const r = rects[k]
      if (!r.placed) return null
      const shown = liveRect(k)
      const rec = nodeRec(graph, k)
      const isExpanding = isOpen(k)
      return React.createElement(CardView, {
        key: k, card: c, rec: rec, rect: shown, cardKey: k,
        selected: sel === k || multi.indexOf(k) !== -1,
        // 虚化只在全屏遮罩模式下发生：浮动窗口开着时画布还是可以读、可以操作的
        dimmed: scrimOn && !isExpanding,
        expanded: !!isExpanding,
        hasDoc: c.hasDoc === true,
        childNodes: c.type === 'chapter' ? nodesOfChapter(cards, graph, k) : [],
        onOpenNode: function (n) { props.onOpenCard(n) },
        linkLive: !!link,
        linkFrom: link ? link.from : null,
        hotChoice: link && link.from === k ? link.choice : '',
        onCardDown: onCardDown,
        onDouble: function (card) {
          if (card.type === 'chapter') go({ level: 'chapter', key: cardKey(card) })
          else openExpand(card)
        },
        onMenu: onCardMenu,
        onStartLink: startLink,
        onDropLink: dropLink,
        onAddChoice: addChoice,
        onEditChoice: function (card, ch) { props.onEditChoice(card, ch) },
      })
    })

    // 引用卡：借用分支卡那套形状（存档卡按「节点」那一档，内容是标题 + 简介）。
    // 只画一张卡，没有连线圆点、没有选项列、不参与自动排列。
    const refEls = refCards.map(function (c) {
      const k = cardKey(c)
      const shown = liveRect(k)
      return React.createElement(RefCard, {
        key: k, card: c, rect: shown, cardKey: k,
        accent: refAccent(c, refRecs[k]),
        selected: sel === k || multi.indexOf(k) !== -1,
        dimmed: scrimOn && !isOpen(k),
        onCardDown: onCardDown,
        onDouble: function (card) { openExpand(card) },
        onMenu: onCardMenu,
      })
    })

    const crumb = level === 'root'
      ? [React.createElement('span', { key: 'r', className: 'sc-crumb cur' }, '剧本档案')]
      : [
        React.createElement('button', { key: 'r', className: 'sc-crumb', onClick: home }, '剧本档案'),
        React.createElement('span', { key: 's', className: 'sc-crumbsep' }, '/'),
        React.createElement('span', { key: 'c', className: 'sc-crumb cur' }, chapterCard ? cardDisplay(chapterCard) : '未命名章节'),
      ]

    const nav = React.createElement('div', { className: 'sc-nav' },
      React.createElement('button', { className: 'sc-navbtn', disabled: hi === 0, title: '后退', onClick: back }, '‹'),
      React.createElement('button', { className: 'sc-navbtn', disabled: hi >= hist.length - 1, title: '前进', onClick: fwd }, '›'),
      React.createElement('button', { className: 'sc-navbtn', title: '回到上级', onClick: home }, '⌂'),
      React.createElement('button', { className: 'sc-navbtn', title: '刷新画布', onClick: props.onRefresh }, '⟳'),
      // 存档卡抽屉：按住里面的卡拖到画布上就是摆一张引用
      React.createElement('button', {
        className: 'sc-btn' + (drawer ? ' sc-btn-on' : ''), title: '存档卡抽屉：按住拖到画布上摆成引用',
        onClick: function () { setDrawer(!drawer) },
      }, '存档卡'),
      React.createElement('div', { className: 'sc-addr' }, crumb),
      React.createElement('span', { className: 'sc-boardtip' }, Math.round(view.s * 100) + '%')
    )

    // 全屏遮罩：只有「全屏」模式的窗口才铺这一层（老的展开行为：背景变暗、画布锁定）
    const scrim = scrimOn
      ? React.createElement('div', {
        className: 'sc-scrim' + (wins.some(function (w) { return w.mode === 'full' && w.open }) ? ' on' : ''),
      })
      : null

    /** 窗口里「卡片」页的那一大块内容（原先的 expand 内容，原样搬过来）。 */
    function expandBodyEl(c, rec, k) {
      return React.createElement('div', { className: 'sc-expandbody' },
        React.createElement('div', { className: 'sc-meta' },
          c.when && c.type !== 'chapter' ? React.createElement('span', null, '时间：' + c.when) : null,
          React.createElement('span', null, '文件：' + c.file)
        ),
        React.createElement(TagRow, { tags: c.tags }),
        c.type === 'chapter'
          ? React.createElement('div', null,
            React.createElement('div', { className: 'sc-h2' }, '下属节点'),
            (function () {
              const kids = nodesOfChapter(cards, graph, k)
              if (!kids.length) return React.createElement('div', { className: 'sc-p' }, '这个章节里还没有节点。')
              return React.createElement('div', { className: 'sc-nodelist' }, kids.map(function (n) {
                return React.createElement('div', {
                  key: cardKey(n), className: 'sc-nodelistrow',
                  onClick: function () { props.onOpenCard(n) },
                },
                  React.createElement('span', { className: 'n' }, typeLabel(n.type)),
                  React.createElement('span', { className: 't' }, n.title || n.file)
                )
              }))
            })()
          )
          : (function () {
            const sec = splitSections(c.body)
            const blocks = []
            for (const name of BODY_SECTIONS) {
              const items = sec[name]
              if (!items.length) continue
              blocks.push(React.createElement('div', { key: name, className: 'sc-cardsec' },
                React.createElement('div', { className: 'sc-cardsecname' }, name),
                React.createElement('ul', { className: 'sc-cardlist' }, items.map(function (t, i) {
                  return React.createElement('li', { key: i }, inline(t, name + i))
                }))
              ))
            }
            if (!blocks.length) blocks.push(React.createElement('div', { key: 'raw' }, markdown(c.body || c.summary || '（正文为空）', 'exp')))
            return React.createElement('div', null, blocks)
          })(),
        React.createElement('div', { className: 'sc-h2' }, '原文'),
        React.createElement('div', null, markdown(c.body || '', 'raw')),
        React.createElement('div', { className: 'sc-gap' }),
        c.type === 'node' && (rec.mode === 'branch' || c.mode === 'branch') ? (function () {
          // 分歧节点展开后，选项在下面单列一块，带一个加选项的快捷入口。
          const choices = rec.choices || []
          return React.createElement('div', null,
            React.createElement('div', { className: 'sc-h2' }, '选项 (' + choices.length + ')'),
            choices.length === 0
              ? React.createElement('div', { className: 'sc-p' }, '还没有选项。')
              : React.createElement('ul', { className: 'sc-cardlist' }, choices.map(function (ch) {
                const target = cards.filter(function (x) { return cardKey(x) === ch.to })[0]
                return React.createElement('li', { key: ch.id },
                  (ch.text || '（空选项）') + ' → ' + (target ? cardDisplay(target) : '（还没连到节点）'))
              })),
            React.createElement('div', { className: 'sc-gap' }),
            React.createElement('button', {
              className: 'sc-btn',
              onClick: function () { props.onEditChoices(c) },
            }, '＋ 添加 / 编辑选项')
          )
        })() : null,
        React.createElement('div', { className: 'sc-gap' }),
        React.createElement('button', { className: 'sc-btn', onClick: function () { props.onEditCard(c) } }, '在详情里编辑…')
      )
    }

    /** 引用卡的只读详情：只有标题 / 类型 / 正文，**不挂 CardEditor / DocEditor**。 */
    function refBodyEl(c) {
      return React.createElement('div', { className: 'sc-expandbody' },
        React.createElement('div', { className: 'sc-meta' },
          React.createElement('span', { className: 'sc-reftag' }, '引用'),
          c.when ? React.createElement('span', null, '时间：' + c.when) : null,
          React.createElement('span', null, '文件：' + c.file)
        ),
        React.createElement(TagRow, { tags: c.tags }),
        React.createElement('div', { className: 'sc-p' }, '这是引用，要改内容回方片页。'),
        React.createElement('div', { className: 'sc-gap' }),
        React.createElement('div', { className: 'sc-h2' }, '正文'),
        React.createElement('div', null, markdown(c.body || c.summary || '（正文为空）', 'ref'))
      )
    }

    // 每个窗口：标题栏（拖动 + 图钉 + 全屏/浮动 + 收起）、页签（卡片 | 文档）、内容区、缩放手柄。
    const winEls = wins.map(function (w, i) {
      const c = w.card
      const k = w.key
      const rec = nodeRec(graph, k)
      // 引用卡：强调色用「手染色 → 角色色」，跟画布上那张引用卡一致
      const accent = w.ro ? refAccent(c, refRecs[k]) : (rec.color || c.color || '')
      const full = w.mode === 'full'
      // 全屏模式下几何来自 fullRect（x/y/w/h 留给「切回浮动」用，原样不动）
      const geo = full ? fullRect() : { x: w.x, y: w.y, w: w.w, h: w.h }
      const style = { left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: 30 + i * 2 }
      if (accent) style['--sc-accent'] = accent
      // 拖 / 缩放中把过渡关掉：不然窗口追着手跑，像橡皮筋
      if (winDrag && winDrag.key === k) style.transition = 'none'
      const onDoc = !w.ro && w.tab === 'doc' && docCapable(c.type)
      const kids = [
        React.createElement('div', {
          key: 'h', className: 'sc-expandh',
          title: full ? '全屏遮罩模式（点标题栏上的「浮动」切回可拖动的窗口）' : '按住标题栏拖动窗口；右下角手柄缩放',
          onPointerDown: function (e) { onWinDown(e, w) },
          onClick: winClick,
        },
          React.createElement('h3', null, cardDisplay(c) || c.file),
          React.createElement('span', { className: 'sc-tag' }, typeLabel(c.type)),
          React.createElement('span', { className: 'sc-spacer' }),
          React.createElement('button', {
            className: 'sc-expandb' + (w.pin ? ' on' : ''),
            title: w.pin
              ? '取消钉住（钉住的窗口：切卡片、切页都不自动收起）'
              : '钉住：切卡片、切页也不自动收起，可以同时开好几个',
            onClick: function (e) { e.stopPropagation(); togglePin(k) },
          }, React.createElement(PinIcon, { on: w.pin })),
          React.createElement('button', {
            className: 'sc-expandb',
            title: full ? '切回浮动窗口（可拖动、可缩放）' : '切到全屏遮罩模式（背景变暗、画布锁定，专注写东西）',
            onClick: function (e) { e.stopPropagation(); toggleMode(k) },
          }, full ? '浮动' : '全屏'),
          React.createElement('button', { className: 'sc-expandx', title: '收起', onClick: function () { closeWin(k) } }, '×')
        ),
        w.ro
          ? React.createElement('div', { key: 'rt', className: 'sc-tag sc-reftag' }, '引用·只读')
          : null,
        docCapable(c.type) && !w.ro
          ? TabRow({
            key: 'tabs',
            value: onDoc ? 'doc' : 'card',
            onChange: function (t) { setWinTab(k, t) },
            items: [{ key: 'card', label: '卡片' }, { key: 'doc', label: '文档' }],
          })
          : null,
        onDoc
          ? React.createElement('div', { key: 'b', className: 'sc-expandbody sc-docbody' },
            React.createElement(DocEditor, {
              api: props.api, root: props.root, card: c,
              // 文档里录台词要能选人物（清单由 95-panel 从人物卡算好传下来）
              speakers: props.speakers,
              onNotice: props.onNotice,
              onDocChange: function (has) { if (props.onDocChange) props.onDocChange(c, has) },
            }))
          : (w.ro ? refBodyEl(c) : expandBodyEl(c, rec, k)),
        full ? null : React.createElement('div', {
          key: 'g', className: 'sc-expandgrip', title: '拖动缩放（最小 320×220，不会拖出画布）',
          onPointerDown: function (e) { onWinGripDown(e, w) },
        })
      ]
      return React.createElement('div', {
        key: k,
        className: 'sc-expand sc-' + (full ? 'full' : 'float') + (w.open ? ' open' : ''),
        // 只有 data-win：**故意不带 data-key** —— keyUnder() 是「指针底下是哪张卡片」的
        // 命中测试（拉线落点也用它），窗口要是带着卡片的 key，往窗口上一松手就会被当成
        // 「落在这张卡上」。
        style: style, 'data-win': k,
        // 浮窗自己吃滚轮（见 onWheel）：里面那一页内容滚它，画布别跟着缩放
        'data-wheel': 'own',
        // 窗口里点一下就把这一块抬到最上面；事件不许漏给画布（漏了就是取消选中 + 平移）
        onPointerDown: function (e) {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
          bringWinFront(k)
        },
        onClick: winClick,
      }, ...kids)
    })

    const dockTitle = level === 'root' ? '章节堆叠' : '本章节待放置'

    return React.createElement('div', { className: 'sc-board' },
      nav,
      React.createElement('div', {
        className: 'sc-canvas' + (panOn ? ' panning' : ''), ref: canvasRef,
        onPointerDown: onCanvasDown, onContextMenu: onCanvasMenu,
      },
        React.createElement('div', { className: 'sc-stage' + (scrimOn ? ' blur' : ''), style: stageStyle },
          React.createElement('div', { className: 'sc-dots' }),
          React.createElement('svg', { className: 'sc-edges', width: 8000, height: 8000 },
            React.createElement('defs', null,
              // markerUnits 用 userSpaceOnUse：箭头是固定大小，不再跟着 stroke-width 一起
              // 放大（原来普通线是 9×1.6、高亮线是 9×2.2，同一个箭头两个尺寸，看着就杂）。
              React.createElement('marker', { id: 'sc-arrow', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' },
                React.createElement('path', { d: 'M0,0 L0,6 L6,3 z', className: 'sc-arrowhead' })),
              React.createElement('marker', { id: 'sc-arrow-on', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' },
                React.createElement('path', { d: 'M0,0 L0,6 L6,3 z', className: 'sc-arrowhead-on' }))
            ),
            // 这一刀不能少：.sc-edges 自己被挪到 -EDGE_PAD，路径坐标是画布坐标。
            React.createElement('g', { transform: 'translate(' + EDGE_PAD + ',' + EDGE_PAD + ')' }, edgeEls)
          ),
          link ? React.createElement('svg', { className: 'sc-edges', width: 8000, height: 8000 },
            React.createElement('g', { transform: 'translate(' + EDGE_PAD + ',' + EDGE_PAD + ')' },
              React.createElement('path', {
                className: 'sc-edge temp',
                // 从「你拉的那一项」自己的出口起笔（真实 DOM 里那颗圆点的中心），而不是卡片
                // 右侧正中：分歧节点上选项有好几个，起点错了整条橡皮筋就是歪的。
                d: edgePath(linkStartPoint(link), { x: link.x, y: link.y }),
              })
            )
          ) : null,
          // 连线标签是 HTML（见上面的注释）：挂在 .sc-stage 里，画布坐标直接当 left/top 用，
          // 跟着整块画布一起平移缩放。
          edgeLabels,
          cardEls,
          refEls,
          // 框选的框：画布坐标，跟着画布一起缩放；只画个虚线框，不挡任何点击
          marquee ? React.createElement('div', {
            className: 'sc-marquee',
            style: { left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h },
          }) : null
        ),
        scrim,
        ...winEls,
        drawer ? React.createElement('div', { className: 'sc-drawer', 'data-wheel': 'own', style: { width: DRAWER_W } },
          // 抽屉整体就是滚动容器（overflow-y:auto）：悬停在**任何位置**（含头部、筛选框
          // 那一行）滚轮都滚它。所以头部与筛选框自己 position:sticky 挂在顶上。
          React.createElement('div', { className: 'sc-drawersticky' },
            React.createElement('div', { className: 'sc-drawerhead' },
              React.createElement('span', null, '存档卡'),
              React.createElement('span', { className: 'sc-spacer' }),
              React.createElement('button', { className: 'sc-btn', title: '关掉抽屉', onClick: function () { setDrawer(false) } }, '×')
            ),
            React.createElement('input', {
              className: 'sc-inp full sc-menuinput', value: drawerQ, placeholder: '筛选卡片…',
              onPointerDown: function (e) { e.stopPropagation() },
              onChange: function (e) { setDrawerQ(e.target.value) },
            })
          ),
          (function () {
            const groups = drawerGroups()
            if (!groups.length) return React.createElement('div', { className: 'sc-empty', style: { padding: '8px 2px' } }, '没有匹配的卡片。')
            return groups.map(function (g) {
              return React.createElement('div', { key: g.key },
                React.createElement('div', { className: 'sc-drawerhead2' }, g.label + '（' + g.items.length + '）'),
                g.items.map(function (c) { return drawerItem(c, cardKey(c)) })
              )
            })
          })(),
          React.createElement('div', { className: 'sc-drawerhint' }, '按住拖到画布上＝摆一张引用（不改卡片文件、不连线）')
        ) : null,
        ghost ? (function () {
          const gs = refSizeOf(ghost.card.type)
          const w = ghost.fromDrawer ? gs.w : 140
          const h = ghost.fromDrawer ? gs.h : 60
          return React.createElement('div', {
            className: 'sc-ghost' + (ghost.fromDrawer ? ' reffrom' : ''),
            style: { left: ghost.x - w / 2, top: ghost.y - h / 2, width: w, height: h, position: 'fixed' },
          }, React.createElement('div', { className: 'sc-dockcardtitle' }, cardDisplay(ghost.card)))
        })() : null
      ),
      Dock({
        items: unplaced, title: dockTitle,
        accentOf: function (c) { return nodeRec(graph, cardKey(c)).color || c.color || '' },
        onDockDown: onDockDown, onDockTap: dockTap,
      }),
      React.createElement('div', { className: 'sc-status' },
        React.createElement('span', null, level === 'root'
          ? '上级：排列章节（双击章节卡片进入下级）'
          : '下级：排本章节的情节顺序（双击卡片展开）'),
        React.createElement('span', null, '· 空白处左键拖动平移 · 滚轮缩放（Shift/Alt+滚轮左右上下）'),
        React.createElement('span', null, '· 右键空白处新建 / 粘贴'),
        React.createElement('span', null, '· 点连线给它起名字（右键改名 / 删线）'),
        React.createElement('span', null, '· 右键拖框选多张（右键点一下仍是菜单 · Ctrl+A 全选）'),
        React.createElement('span', { className: 'sp' }),
        React.createElement('button', {
          className: 'sc-btn', title: '按连线分层，同层再按时间排',
          onClick: autoArrange,
        }, '自动排列'),
        React.createElement('div', { className: 'sc-zoombar' },
          React.createElement('button', { className: 'sc-navbtn', title: '缩小', onClick: function () { setView({ x: view.x, y: view.y, s: zoomStep(view.s, -1) }) } }, '－'),
          React.createElement('button', { className: 'sc-navbtn', title: '放大', onClick: function () { setView({ x: view.x, y: view.y, s: zoomStep(view.s, 1) }) } }, '＋'),
          React.createElement('button', { className: 'sc-btn', onClick: function () { setView({ x: 24, y: 20, s: 1 }) } }, '归位')
        )
      ),
      menu ? MenuBackdrop({ onClose: function () { setMenu(null) } }) : null,
      edgeMenu ? MenuBackdrop({ onClose: function () { setEdgeMenu(null) } }) : null,
      edgeMenu ? MenuList({
        x: edgeMenu.x, y: edgeMenu.y, color: '',
        items: [
          { key: 'ren', label: '重命名连线…', onPick: function () { startRename(edgeMenu.edge) } },
          { sep: true },
          { key: 'del', label: '删除这条连线', danger: true, onPick: function () { removeEdge(edgeMenu.edge.from, edgeMenu.edge.to, edgeMenu.edge.choice) } },
        ],
        swatches: props.swatches, onEditSwatches: props.onEditSwatches,
        onColor: function () {},
        onClose: function () { setEdgeMenu(null) },
      }) : null,
      menu ? (menu.batch
        ? MenuList({
          x: menu.x, y: menu.y, items: batchMenuItems(menu.batch),
          color: '',
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          // 色卡：选一个就应用并关菜单（老behavior）；色盘：实时换色、菜单留着
          onColor: function (v) { patchMany(menu.batch, { color: v }); setMenu(null) },
          onColorPick: function (v) { patchMany(menu.batch, { color: v }) },
          onClose: function () { setMenu(null) },
        })
        : (menu.card
          ? (function () {
            // 引用卡有**自己那一套**菜单：只有 染色 + 从画布移开（不许出现删除卡片 / 连线项）
            const isRef = !!refRecs[cardKey(menu.card)]
            const k = cardKey(menu.card)
            return MenuList({
              x: menu.x, y: menu.y,
              items: isRef ? refMenuItems(menu.card) : menuItems(menu.card),
              color: isRef
                ? String((refRecs[k] || {}).color || '')
                : (nodeRec(graph, k).color || menu.card.color || ''),
              swatches: props.swatches, onEditSwatches: props.onEditSwatches,
              onColor: function (v) { patchRec(k, { color: v }); setMenu(null) },
              onColorPick: function (v) { patchRec(k, { color: v }) },
              onClose: function () { setMenu(null) },
            })
          })()
          : MenuList({
            x: menu.x, y: menu.y, items: emptyMenuItems(),
            color: '',
            swatches: props.swatches, onEditSwatches: props.onEditSwatches,
            onColor: function () {},
            onClose: function () { setMenu(null) },
          }))) : null
    )
  }

    // ═══ src/90-inspector.js ════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 对话框：卡片编辑器 / 单行输入 / 确认
  //
  // 有了宿主半边的落盘桥之后，「在画布上改时间」不再只是改本机图谱 —— 直接写回
  // 卡片文件的 frontmatter，跟项目一起进 git。
  // ══════════════════════════════════════════════════════════════════════════════

  function Modal(props) {
    return React.createElement('div', { className: 'sc-modal', onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose() } },
      React.createElement('div', { className: 'sc-modalbox', style: props.width ? { width: props.width } : undefined },
        React.createElement('div', { className: 'sc-modalh' },
          React.createElement('h3', null, props.title),
          React.createElement('button', { className: 'sc-expandx', onClick: props.onClose }, '×')
        ),
        // 页签排在标题下面（「字段 | 文档」），内容区在它下面
        props.tabs || null,
        React.createElement('div', { className: 'sc-modalb' + (props.bodyClass ? ' ' + props.bodyClass : '') }, props.children),
        props.footer ? React.createElement('div', { className: 'sc-modalf' }, props.footer) : null
      )
    )
  }

  /**
   * 一行小页签（「卡片 | 文档」/「字段 | 文档」）。
   * 故意写成「返回元素的普通函数」而不是组件：它没有任何 hook，跟既有的 Modal / Field
   * 一个用法，也就没有「组件被当函数调用、hook 算到调用者头上」那个坑。
   */
  function TabRow(props) {
    return React.createElement('div', { className: 'sc-tabs' },
      (props.items || []).map(function (it) {
        return React.createElement('button', {
          key: it.key,
          className: 'sc-tab' + (props.value === it.key ? ' on' : ''),
          onClick: function () { props.onChange(it.key) },
        }, it.label)
      })
    )
  }

  function Field(props) {
    return React.createElement('label', { className: 'sc-field' },
      React.createElement('span', { className: 'sc-lbl' }, props.label),
      props.children
    )
  }

  function CardEditor(props) {
    const card = props.card
    const [title, setTitle] = React.useState(card.title || '')
    const [code, setCode] = React.useState(card.code || '')
    const [when, setWhen] = React.useState(card.when || '')
    const [order, setOrder] = React.useState(card.order === null || card.order === undefined ? '' : String(card.order))
    const [summary, setSummary] = React.useState(card.summary || '')
    const [tags, setTags] = React.useState((card.tags || []).join(', '))
    const [chapter, setChapter] = React.useState(props.chapterOf(card) || '')
    const [mode, setMode] = React.useState(props.modeOf(card) || '')
    const [body, setBody] = React.useState(card.body || '')
    const [busy, setBusy] = React.useState(false)
    // 「字段 | 文档」页签，默认字段（用户拍板）。只有章节 / 节点有文档页，
    // 而且新卡片还没有文件（文件是保存时才生成的），也就没有文档可放。
    const [tab, setTab] = React.useState('fields')

    function save() {
      setBusy(true)
      props.onSave(card, {
        title: title.trim(),
        code: code.trim(),
        // 章节卡片不谈「故事内时间」——章节是容器，时间是章节里那些节点的事。
        when: card.type === 'chapter' ? '' : when.trim(),
        order: order.trim() === '' ? '' : String(Number(order.trim())),
        summary: summary.trim(),
        tags: tags.split(/[,，;；]/).map(function (t) { return t.trim() }).filter(Boolean),
        body: body,
        chapter: chapter.trim(),
        mode: mode,
      }, function () { setBusy(false) })
    }

    const isBranch = card.type === 'chapter' || card.type === 'node' || card.type === 'condition' || card.type === 'result'
    const chapters = props.chapters || []
    const canDoc = docCapable(card.type) && !props.isNew
    const onDocTab = canDoc && tab === 'doc'
    // 文档页那颗保存按钮要打到 DocEditor 里的 save 上（见 92-doc.js 里的注释）。
    const docRef = React.useRef(null)

    const delBtn = React.createElement('button', { key: 'd', className: 'sc-btn sc-btn-warn', onClick: function () { props.onDelete(card) } }, '删除卡片文件')
    const cancelBtn = React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消')
    // 主按钮＝当前这一页在编的东西：文档页保存文档，字段页保存卡片。
    const footer = onDocTab
      ? [
        delBtn,
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        cancelBtn,
        React.createElement('button', {
          key: 'kd', className: 'sc-btn sc-btn-on',
          onClick: function () { if (docRef.current) docRef.current() },
        }, '保存（写回文档）'),
      ]
      : [
        delBtn,
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        cancelBtn,
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', disabled: busy, onClick: save }, busy ? '保存中…' : '保存（写回卡片文件）'),
      ]

    const fields = [
      React.createElement('div', { key: 'r1', className: 'sc-frow' },
        card.type === 'chapter'
          ? Field({ key: 'code', label: '章节序号', children: React.createElement('input', { className: 'sc-inp', value: code, placeholder: 'G1.1', onChange: function (e) { setCode(e.target.value) } }) })
          : null,
        Field({ key: 't', label: card.type === 'chapter' ? '章节名' : '标题', children: React.createElement('input', { className: 'sc-inp wide', value: title, onChange: function (e) { setTitle(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r2', className: 'sc-frow' },
        card.type === 'chapter'
          ? null
          : Field({ key: 'w', label: '时间', children: React.createElement('input', { className: 'sc-inp', value: when, placeholder: '例如 2025/4/24 傍晚', onChange: function (e) { setWhen(e.target.value) } }) }),
        Field({ key: 'o', label: '序号', children: React.createElement('input', { className: 'sc-inp num', value: order, onChange: function (e) { setOrder(e.target.value) } }) }),
        isBranch && card.type !== 'chapter'
          ? Field({ key: 'c', label: '所属章节', children: React.createElement('select', { className: 'sc-inp wide', value: chapter, onChange: function (e) { setChapter(e.target.value) } },
            React.createElement('option', { value: '' }, '（未归属）'),
            chapters.map(function (ch) { return React.createElement('option', { key: cardKey(ch), value: cardKey(ch) }, cardDisplay(ch)) })
          ) })
          : null,
        card.type === 'node'
          ? Field({ key: 'm', label: '节点形态', children: React.createElement('select', { className: 'sc-inp', value: mode, onChange: function (e) { setMode(e.target.value) } },
            React.createElement('option', { value: '' }, '普通'),
            React.createElement('option', { value: 'branch' }, '分歧')
          ) })
          : null
      ),
      React.createElement('div', { key: 'r3', className: 'sc-frow' },
        Field({ key: 'g', label: '标签', children: React.createElement('input', { className: 'sc-inp wide', value: tags, placeholder: '共通, 主线', onChange: function (e) { setTags(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r4', className: 'sc-frow' },
        Field({ key: 'su', label: '简介', children: React.createElement('input', { className: 'sc-inp full', value: summary, placeholder: '卡片最下面显示的一行；留空则取正文首段', onChange: function (e) { setSummary(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r5', className: 'sc-frow' },
        Field({ key: 'b', label: '正文（Markdown；节点可用 ## 角色 / ## 场景 / ## 内容 三段）', children: React.createElement('textarea', { className: 'sc-area', value: body, onChange: function (e) { setBody(e.target.value) } }) })
      )
    ]

    return Modal({
      title: '编辑 ' + typeLabel(card.type) + ' · ' + card.file,
      width: PANEL_W, onClose: props.onClose,
      tabs: canDoc
        ? TabRow({
          value: tab, onChange: setTab,
          items: [{ key: 'fields', label: '字段' }, { key: 'doc', label: '文档' }],
        })
        : null,
      // 文档页要占满、由里面的 textarea 自己滚；字段页照旧整块滚。
      bodyClass: onDocTab ? 'sc-modalfill' : '',
      footer: footer,
      children: onDocTab
        ? [React.createElement(DocEditor, {
          key: 'doc', api: props.api, root: props.root, card: card, saveRef: docRef,
          // 文档里录台词要能选人物（弹窗这条线和浮窗共用同一个 DocEditor）
          speakers: props.speakers,
          onNotice: props.onNotice,
          // DocEditor 只回「有没有文档」，卡片是谁由这一层补上 —— 少了这一层，弹窗里
          // 存完文档，卡片右上角那个角标不会亮（onDocChange 收到的是 true，不是卡片）。
          onDocChange: function (has) { if (props.onDocChange) props.onDocChange(card, has) },
        })]
        : fields,
    })
  }

  function PromptDialog(props) {
    const [value, setValue] = React.useState(props.value || '')
    return Modal({
      title: props.title,
      width: PANEL_W, onClose: props.onClose,
      footer: [
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onOk(value) } }, props.okLabel || '确定'),
      ],
      children: [
        React.createElement('input', {
          key: 'i', className: 'sc-inp full', value: value, autoFocus: true,
          onChange: function (e) { setValue(e.target.value) },
          onKeyDown: function (e) { if (e.key === 'Enter') props.onOk(value) },
        }),
        props.hint ? React.createElement('div', { key: 'h', className: 'sc-hintbox' }, props.hint) : null,
      ],
    })
  }

  function ConfirmDialog(props) {
    return Modal({
      title: props.title,
      width: PANEL_W, onClose: props.onClose,
      footer: [
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        // 第三个出路（「只删卡片、留着文档」）：不点它就没有别的办法留住文档了，
        // 所以它不是装饰，是这次确认必须给出的选择之一。
        props.extraLabel
          ? React.createElement('button', { key: 'x', className: 'sc-btn', onClick: props.onExtra }, props.extraLabel)
          : null,
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-warn', onClick: props.onOk }, props.okLabel || '确定'),
      ],
      children: [React.createElement('div', { key: 't', className: 'sc-p' }, props.text)],
    })
  }

  function ChoiceEditor(props) {
    const [list, setList] = React.useState((props.choices || []).map(function (c) { return { id: c.id, text: c.text, to: c.to } }))
    function upd(i, text) {
      const next = list.slice()
      next[i] = Object.assign({}, next[i], { text: text })
      setList(next)
    }
    return Modal({
      title: '分歧选项 · ' + cardDisplay(props.card),
      width: PANEL_W, onClose: props.onClose,
      footer: [
        React.createElement('button', { key: 'a', className: 'sc-btn', onClick: function () { setList(list.concat([{ id: uid('o'), text: '选项' + String.fromCharCode(65 + list.length), to: '' }])) } }, '＋ 添加选项（Ctrl+Enter 同效）'),
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(list) } }, '保存'),
      ],
      children: list.length === 0
        ? [React.createElement('div', { key: 'e', className: 'sc-p' }, '还没有选项。点下面的「添加选项」。')]
        : list.map(function (c, i) {
          return React.createElement('div', { key: c.id, className: 'sc-frow' },
            React.createElement('input', { className: 'sc-inp full', value: c.text, onChange: function (e) { upd(i, e.target.value) } }),
            React.createElement('button', { className: 'sc-btn', onClick: function () { setList(list.filter(function (_, j) { return j !== i })) } }, '移除')
          )
        }),
    })
  }

  // ── 色卡编辑：自定义色卡只存这台浏览器（按项目），不进代码仓库 ───────────────

  function SwatchEditor(props) {
    const [list, setList] = React.useState(normSwatches(props.swatches))
    const [draft, setDraft] = React.useState('#7A8BA6')
    function add(hex) {
      const v = String(hex || '').trim()
      if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) return
      if (list.indexOf(v) !== -1) return
      if (list.length >= MAX_SWATCHES) return
      setList(list.concat([v]))
    }
    return Modal({
      title: '编辑色卡（只存这台浏览器，不会进代码仓库）',
      width: PANEL_W, onClose: props.onClose,
      footer: [
        React.createElement('button', {
          key: 'r', className: 'sc-btn',
          onClick: function () { setList([]) },
        }, '恢复默认 8 色'),
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(list) } }, '保存'),
      ],
      children: [
        React.createElement('div', { key: 'row', className: 'sc-frow' },
          React.createElement('input', {
            className: 'sc-colorinput', type: 'color', value: draft,
            // 点开取色器不许把这个弹窗收掉：Chromium 一打开就会派发 change（值往往是原值），
            // 所以①值没变就什么都不做；②自己的鼠标事件全拦住，别冒到遮罩上
            //（弹窗外那层遮罩的 mousedown 也会关窗，见 70-menu 的 MenuBackdrop 兜底）。
            onChange: function (e) {
              const v = String(e.target.value || '')
              if (!v || v.toLowerCase() === String(draft).toLowerCase()) return
              setDraft(v)
            },
            onMouseDown: function (e) { e.stopPropagation() },
            onClick: function (e) { e.stopPropagation() },
            onInput: function (e) { e.stopPropagation() },
            onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
          }),
          React.createElement('button', { className: 'sc-btn', onClick: function () { add(draft) } }, '＋ 加一个'),
          React.createElement('span', { className: 'sc-hintbox', style: { margin: 0 } },
            '清空后即用内置的 8 个通用色。最多 ' + MAX_SWATCHES + ' 个。')
        ),
        list.length === 0
          ? React.createElement('div', { key: 'e', className: 'sc-p' }, '当前用内置色卡。')
          : React.createElement('div', { key: 'list', className: 'sc-swatches', style: { gridTemplateColumns: 'repeat(8, 1fr)' } },
            list.map(function (hex) {
              return React.createElement('button', {
                key: hex, className: 'sc-swatch', style: { background: hex }, title: hex + '（点击移除）',
                onClick: function () { setList(list.filter(function (x) { return x !== hex })) },
              })
            }))
      ],
    })
  }

  // ── 设置：档案目录名 ─────────────────────────────────────────────────────────

  function SettingsDialog(props) {
    const [dirs, setDirs] = React.useState(normDirs(props.dirs))
    function upd(k, v) { setDirs(Object.assign({}, dirs, { [k]: v })) }
    return Modal({
      title: '档案目录名（按项目保存，只存这台浏览器）',
      width: PANEL_W, onClose: props.onClose,
      footer: [
        React.createElement('button', { key: 'r', className: 'sc-btn', onClick: function () { setDirs(normDirs(null)) } }, '恢复默认'),
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(normDirs(dirs)) } }, '保存'),
      ],
      children: [
        React.createElement('div', { key: 'a', className: 'sc-frow' },
          Field({ key: 'ar', label: '档案总目录（放在项目根下）', children: React.createElement('input', { className: 'sc-inp wide', value: dirs.archive, onChange: function (e) { upd('archive', e.target.value) } }) }),
          Field({ key: 'ca', label: '卡片子目录', children: React.createElement('input', { className: 'sc-inp', value: dirs.cards, onChange: function (e) { upd('cards', e.target.value) } }) }),
          Field({ key: 'su', label: '归档子目录', children: React.createElement('input', { className: 'sc-inp', value: dirs.sub, onChange: function (e) { upd('sub', e.target.value) } }) }),
          Field({ key: 'do', label: '文档子目录（每张卡一份文档）', children: React.createElement('input', { className: 'sc-inp', value: dirs.docs, onChange: function (e) { upd('docs', e.target.value) } }) })
        ),
        React.createElement('div', { key: 'h', className: 'sc-hintbox' },
          '只能是单层目录名（不能带斜杠）。默认是 剧本档案 / 卡片 / 归档 / 文档' +
          '（前三个与 cards.py 一致；文档是面板自己的一项，cards.py 不管它）。' +
          '落盘桥的边界由「档案总目录」决定：所有读写都必须落在它里面。' +
          '文档是独立文件（<档案目录>/<文档子目录>/<卡片文件名>），不是卡片正文；' +
          '只有章节与节点卡片有文档页签。')
      ],
    })
  }

    // ═══ src/92-doc.js ══════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 卡片文档编辑器（DocEditor）
  //
  // 每张章节 / 节点卡片可以有一份**独立**文档：<档案目录>/<文档子目录>/<卡片文件名>。
  // 它不是卡片正文的编辑器 —— 正文（frontmatter + ## 角色 / ## 场景 / ## 内容）照旧在
  // 「字段」页里改，这里读写的是另一个文件。用户的原话背景：「章节卡片和节点卡片要各有
  // 一份对应的文档，能直接在 dsh 应用里改，卡片要能做成悬浮窗方便查阅」。
  //
  // 两处复用同一个组件（用户要求）：
  //   ① 展开浮层的「卡片 | 文档」页签
  //   ② 卡片编辑弹窗的「字段 | 文档」页签
  //
  // 文档里还能直接录台词与旁白（用户拍板的结构，**只作用于这个 textarea**，卡片正文不动）：
  //   台词   「角色名」：台词   （中文直角引号 + 全角冒号，字面写进 .md）
  //   旁白   行首两个全角空格（U+3000）+ 文字，左侧不写人名
  //   textarea 里右键 → 人物菜单（全部人物卡 + 旁白 + 结束当前角色，人多了能筛）。
  //   选完人进入「该角色说话」状态，这一行的开头自动带上前缀；
  //   **Shift+Enter** 换行、并且补上和前缀等宽的一串全角空格（续行对着台词那一列）；
  //   **直接 Enter** 结束这个角色的话（只换行、不补缩进）。
  //
  // 名字着色（用户拍板「高亮覆盖层」而不是真富文本）：textarea 自己的文字是透明的，
  // 底下一层同内容的 .sc-dochl 渲染彩色文本，两层字体/内边距/换行规则逐项一致，
  // 滚动时把 textarea 的 scrollTop/scrollLeft 同步过去。这样底层仍是纯 textarea ——
  // 中文输入法、Ctrl+S、脏标记、写进 .md 的还是纯文本，一样都不受影响。
  //
  // 语义（用户拍板）：**空文档不落盘**。内容 trim 后为空时，文件已存在就删掉、不存在就
  // 什么都不做；文件不存在＝「还没有文档」，不是错误。
  //
  // 面板既有的红条 notice 机制负责把**原始失败原因**摆到用户面前，本组件再把同一句话
  // 挂在状态行上（浮层窄，红条不一定在视线里）。
  // ══════════════════════════════════════════════════════════════════════════════

  /** HH:MM，状态行上的「已保存 14:07」。 */
  function clockNow() {
    return clockOf(Date.now())
  }

  /** 把时间戳（草稿的 at）也格式化成 HH:MM。 */
  function clockOf(ts) {
    const d = new Date(isFinite(Number(ts)) ? Number(ts) : Date.now())
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }

  // 旁白行的行首：两个**全角**空格（U+3000）。用户点名要这个 —— 「要加旁白，但是左侧不显示人名」。
  const NARRATION_PREFIX = '　　'

  /** 当前角色对应的行首前缀；没有角色（普通行）就是空串。 */
  function rolePrefix(role) {
    if (!role) return ''
    if (role.kind === 'narration') return NARRATION_PREFIX
    // 首行＝`「名字」：台词`（直角引号 + **全角冒号**）
    return '「' + role.name + '」：'
  }

  /**
   * 续行的缩进（用户拍板的「冒号加回对齐位」）：
   *   `「勿忘我」：` 宽 6 → 续行＝ **5 个全角空格 + 一个全角冒号**，冒号正落在首行冒号那一列，
   *   台词文字也和首行文字同列。用户原话：「没有冒号还是有点奇怪，感觉不太能很好的指代，
   *   把冒号加回去吧」。
   * 旁白**不加冒号**：旁白没有名字，冒号没有指代对象，保持两个全角空格。
   * （想让旁白也带冒号，把这一支改成 wideSpaces(1) + '：' 就行 —— 一句话的事。）
   */
  function roleIndent(role) {
    if (!role) return ''
    if (role.kind === 'narration') return NARRATION_PREFIX
    return wideSpaces(Math.max(0, Math.ceil(textWidth(rolePrefix(role))) - 1)) + '：'
  }

  /** 行首匹配 `「名字」：`（台词首行）。 */
  const DIALOG_RE = /^「(.+?)」：/

  /** 行首匹配「一串全角空格 + 全角冒号」（台词续行：冒号对齐在首行那一列）。 */
  const CONT_RE = /^([　]+)(：)/

  /** 人物菜单的分组（只在台词右键菜单里用；**方片页的分组与顺序一个都不许动**）。 */
  const GROUP_ORDER = ['lead', 'support', 'other']
  const GROUP_LABEL = { lead: '主角', support: '配角', other: '其他' }

  function DocEditor(props) {
    const api = props.api
    const root = props.root
    const card = props.card
    const file = card ? String(card.file || '') : ''
    const path = api && api.docPathOf ? api.docPathOf(file) : file
    // 人物：{ name, color, group }。兼容只给了名字的旧形状（名字数组）—— 那就当没颜色、「其他」组。
    const speakers = (props.speakers || []).map(function (s) {
      if (typeof s === 'string') return { name: s, color: '', group: 'other' }
      return {
        name: String(s && s.name ? s.name : ''),
        color: String((s && s.color) || ''),
        group: String((s && s.group) || 'other'),
      }
    }).filter(function (s) { return !!s.name })

    const [text, setText] = React.useState('')
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [dirty, setDirty] = React.useState(false)
    // 磁盘上有一份**非空**文档（＝状态行说「已保存」、卡片上那个角标亮着）
    const [has, setHas] = React.useState(false)
    const [savedAt, setSavedAt] = React.useState('')
    const [failed, setFailed] = React.useState('')
    // 台词结构：正在写谁说的话（{kind:'char',name} / {kind:'narration'} / null＝普通行）
    const [role, setRole] = React.useState(null)
    // 右键菜单（MenuList 是 position:fixed，所以位置直接用鼠标坐标）
    const [menu, setMenu] = React.useState(null)
    const [filter, setFilter] = React.useState('')
    // 手工插入之后光标要落到哪。受控 textarea 里必须等重渲染之后再设，
    // 所以先存下来，让下面的 effect 去设（见那里的注释）。
    const [caret, setCaret] = React.useState(null)
    const boxRef = React.useRef(null)
    // 高亮层的壳：滚动时把 textarea 的 scrollTop/scrollLeft 同步过去（不重渲染，
    // 直接改 DOM —— 每滚一像素都重渲染一次太浪费）
    const hlRef = React.useRef(null)
    // 这张卡的草稿（localStorage，见 40-store 的 putDraft）。有草稿时状态行会说
    // 「草稿 HH:MM 未保存」，并多出一个「放弃草稿」。
    const [draft, setDraft] = React.useState(null)
    const draftTimer = React.useRef(null)
    // 盘上那一份的内容（保存/载入时更新）：用来判断草稿是不是真的和盘上不同、
    // 以及「放弃草稿」时不用再读一次盘。
    const diskText = React.useRef('')

    const readOnly = !(api && typeof api.canWrite === 'function' && api.canWrite())
    const draftKey = card ? cardKey(card) : ''

    function notice(n) { if (props.onNotice) props.onNotice(n) }

    // 换卡片就重新读。alive 标志：读盘是异步的，中途换了卡片（浮层里连点两张）时，
    // 后回来的那一份不能把新卡片的内容顶掉。
    React.useEffect(function () {
      let alive = true
      setLoading(true)
      setDirty(false)
      setFailed('')
      setSavedAt('')
      setRole(null)
      // 同一实例上换了卡片（编辑弹窗从这张卡换到那张卡）时，先把上一张挂着的草稿写掉
      flushPendingDraft(false)
      if (!api || !root || !file || typeof api.readDoc !== 'function') {
        setText('')
        setHas(false)
        setLoading(false)
        return undefined
      }
      Promise.resolve(api.readDoc(root, file)).then(function (res) {
        if (!alive) return
        const t = String((res && res.text) || '')
        diskText.current = t
        // 有草稿就填草稿：用户写一半切走再切回来，不该看到盘上那份旧内容。
        // 草稿和盘上一模一样（上次存过、或被别的途径同步了）就直接丢掉，不留脏状态。
        let one = null
        try { one = draftKey ? readDraft(draftKey) : null } catch (e) { one = null }
        if (one && String(one.text) === t) {
          try { dropDraft(draftKey) } catch (e) { /* 忽略 */ }
          one = null
        }
        setDraft(one)
        setText(one ? String(one.text) : t)
        setHas(!!(res && res.exists) && !!t.trim())
        setDirty(!!one)
        setLoading(false)
        if (props.onDocChange) props.onDocChange(!!(res && res.exists) && !!t.trim())
      }).catch(function (e) {
        if (!alive) return
        setLoading(false)
        setFailed(msgOf(e))
        notice({ text: '文档读取失败：' + msgOf(e), kind: 'error' })
      })
      return function () { alive = false }
    }, [root, file])

    // 草稿是**节流**写的（400ms）：每敲一个键就把整份 JSON 序列化再写回太浪费。
    // 待写的那一条记在 ref 里（key + text），所以：
    //   ① 定时器到点就写；
    //   ② 卸载 / 换卡片时**立刻 flush**（组件要没了，不能等定时器 —— 用户就是怕
    //      「打完最后一个字、400ms 内切卡片」这一段丢字）；
    //   ③ flush 时认卡：写入永远写进待写那一条自己的 key（旧卡，这是对的），
    //      但只有当前还停在同一张卡上才更新状态行，否则会把**新卡**写成「草稿 … 未保存」。
    const pendingDraft = React.useRef(null)
    const keyNow = React.useRef(draftKey)
    keyNow.current = draftKey

    function flushPendingDraft(updateState) {
      if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
      const p = pendingDraft.current
      pendingDraft.current = null
      if (!p) return
      const at = Date.now()
      try { putDraft(p.key, p.text, at) } catch (e) { /* 草稿写不进去就算了，别打断打字 */ }
      if (updateState && keyNow.current === p.key) setDraft({ text: p.text, at: at })
    }

    function scheduleDraft(textNow) {
      if (readOnly || !draftKey) return
      pendingDraft.current = { key: draftKey, text: String(textNow) }
      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = setTimeout(function () { flushPendingDraft(true) }, 400)
    }

    function clearDraft() {
      if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
      pendingDraft.current = null
      try { if (draftKey) dropDraft(draftKey) } catch (e) { /* 忽略 */ }
      setDraft(null)
    }

    // 卸载（切卡片 / 关窗口 / 切页签）时把挂着的那条草稿**同步写掉**，别留给定时器。
    // 这里**不 setState**：组件已经没了。
    React.useEffect(function () {
      return function () { flushPendingDraft(false) }
    }, [])

    // 手工插进去的文本要等**重渲染之后**才能设光标：先设 selectionStart 的话，React 随后
    // 写回 value 会把它冲到末尾（受控 textarea 的老问题）。所以插入只负责算出目标位置，
    // 这里在渲染提交之后一次性设好，再把自己清掉。
    React.useEffect(function () {
      if (caret === null) return undefined
      const el = boxRef.current
      if (el) {
        if (typeof el.focus === 'function') { try { el.focus() } catch (e) { /* 忽略 */ } }
        if (typeof el.setSelectionRange === 'function') el.setSelectionRange(caret, caret)
        else {
          try { el.selectionStart = caret; el.selectionEnd = caret } catch (e) { /* 忽略 */ }
        }
      }
      setCaret(null)
      return undefined
    }, [caret, text])

    // 两层对齐的最后一块：textarea 常驻一根滚动条（overflow-y:scroll），那几像素会占掉
    // 正文的可用宽度，而高亮层没有滚动条 —— 所以按**实测**的滚动条宽度给高亮层补上右内边距。
    // 不写死 10px：真机上滚动条宽度随缩放 / 主题 / 系统设置变，写死了就会差那么几像素，
    // 折行位置一错，光标和彩字就对不上了。
    React.useEffect(function () {
      const area = boxRef.current
      const hl = hlRef.current
      if (!area || !hl || typeof area.offsetWidth !== 'number' || typeof hl.style !== 'object') return undefined
      const sb = Math.max(0, (area.offsetWidth || 0) - (area.clientWidth || 0))
      // 10 = CSS 里 .sc-docarea 的 padding-right（两边共用同一套内边距）
      if (hl.style) hl.style.paddingRight = (10 + sb) + 'px'
      return undefined
    }, [text, loading, readOnly])

    function save() {
      if (readOnly) {
        notice({ text: '只读模式：宿主半边的落盘桥不可用，文档写不回磁盘。原因：' + (api && api.diagnostic ? api.diagnostic() : '未知'), kind: 'error' })
        return
      }
      setBusy(true)
      setFailed('')
      const body = String(text)
      Promise.resolve(api.writeDoc(root, file, body)).then(function (res) {
        setBusy(false)
        const empty = !body.trim()
        setDirty(false)
        setHas(!empty)
        setSavedAt(empty ? '' : clockNow())
        diskText.current = body
        // 存进去了，草稿就没用了（不清的话下次进来会拿旧草稿盖住刚存的内容）
        clearDraft()
        if (props.onDocChange) props.onDocChange(!empty)
        notice({
          text: empty
            ? ((res && res.mode === 'removed') ? '文档已清空，文件已删除：' + path : '内容为空，没有创建文档文件。')
            : '已保存文档 ' + path,
          kind: 'info',
        })
      }).catch(function (e) {
        // 失败时**不清脏标记**：改动还在输入框里，用户可以修完桥再按一次 Ctrl+S
        setBusy(false)
        setFailed(msgOf(e))
        notice({ text: '文档保存失败：' + msgOf(e), kind: 'error' })
      })
    }

    /** 重新从盘上读（「重载」按钮，以及「放弃草稿」）。草稿一律清掉。 */
    function reload(why) {
      if (!api || !root || !file || typeof api.readDoc !== 'function') return
      setLoading(true)
      setFailed('')
      Promise.resolve(api.readDoc(root, file)).then(function (res) {
        const t = String((res && res.text) || '')
        diskText.current = t
        setText(t)
        setHas(!!(res && res.exists) && !!t.trim())
        setDirty(false)
        setSavedAt('')
        setLoading(false)
        clearDraft()
        if (props.onDocChange) props.onDocChange(!!(res && res.exists) && !!t.trim())
        notice({ text: (why === 'discard' ? '已放弃草稿，回到盘上的内容：' : '已重新载入 ') + path, kind: 'info' })
      }).catch(function (e) {
        setLoading(false)
        setFailed(msgOf(e))
        notice({ text: '文档读取失败：' + msgOf(e), kind: 'error' })
      })
    }

    // ── 台词 / 旁白的插入 ──────────────────────────────────────────────────────
    /**
     * 在光标处插入一段文本，并把光标移到插入内容之后。
     * `newlineFirst`：当前行已有内容、光标又不在行首时先补一个换行 ——
     * 不然 `「名字」：` 会被塞进句子中间（用户拍板的规则）。
     */
    function insertAtCaret(chunk, opts) {
      const value = String(text)
      const el = boxRef.current
      let from = value.length
      let to = value.length
      if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        from = clamp(el.selectionStart, 0, value.length)
        to = clamp(el.selectionEnd, from, value.length)
      }
      let ins = String(chunk)
      if (opts && opts.newlineFirst) {
        const lineStart = value.lastIndexOf('\n', Math.max(0, from - 1)) + 1
        if (from > lineStart) ins = '\n' + ins
      }
      setText(value.slice(0, from) + ins + value.slice(to))
      setDirty(true)
      setCaret(from + ins.length)
      // 插进来的这一段也算改动，草稿跟着记一份（不然「插完台词就切卡片」会丢）
      scheduleDraft(value.slice(0, from) + ins + value.slice(to))
    }

    function startRole(r, message) {
      setRole(r)
      setMenu(null)
      insertAtCaret(rolePrefix(r), { newlineFirst: true })
      notice({ text: message, kind: 'info' })
    }

    function openMenu(e) {
      // 只读模式不弹这个菜单：那时候右键该给浏览器（选中一段复制走）
      if (readOnly) return
      if (e && typeof e.preventDefault === 'function') e.preventDefault()
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      setFilter('')
      setMenu({ x: Number(e && e.clientX) || 0, y: Number(e && e.clientY) || 0 })
    }

    /**
     * 菜单内容：筛选框 + 人物（按主角 / 配角 / 其他分组）+ 旁白 + 结束当前角色。
     * 分组只影响**这个菜单**：方片页的分组与顺序一个都没动（用户点名只改台词菜单）。
     * 空组不显示；用筛选框筛过之后，只显示有命中的组，标题计数跟着变。
     */
    function speakerItems() {
      const q = String(filter).trim().toLowerCase()
      const list = q
        ? speakers.filter(function (s) { return s.name.toLowerCase().indexOf(q) !== -1 })
        : speakers
      const items = [{
        input: {
          value: filter, placeholder: '筛选人物…',
          onChange: setFilter,
          onKeyDown: function (e) { if (e.key === 'Escape') setMenu(null) },
        },
      }]
      if (!speakers.length) {
        items.push({ head: '还没有人物卡（存档族 type: character）' })
      } else if (!list.length) {
        items.push({ head: '没有匹配的人物' })
      }
      for (const g of GROUP_ORDER) {
        const one = list.filter(function (s) { return (s.group || 'other') === g })
        if (!one.length) continue
        items.push({ head: GROUP_LABEL[g] + '（' + one.length + '）' })
        for (const sp of one) {
          items.push({
            key: 'sp-' + sp.name, label: sp.name,
            checked: !!role && role.kind === 'char' && role.name === sp.name,
            onPick: function () {
              startRole({ kind: 'char', name: sp.name }, '正在写「' + sp.name + '」的台词：Enter 结束，Shift+Enter 换行并对齐')
            },
          })
        }
      }
      items.push({ sep: true })
      items.push({
        key: 'nar', label: '旁白', hint: '不写人名',
        checked: !!role && role.kind === 'narration',
        onPick: function () { startRole({ kind: 'narration' }, '正在写旁白（不写人名）：Enter 结束，Shift+Enter 换行') },
      })
      items.push({
        key: 'end', label: '结束当前角色', disabled: !role,
        onPick: function () { setRole(null); setMenu(null) },
      })
      return items
    }

    /**
     * 行首标记（三种）：「当作一个整体」。用户原话：「应该把角色名当做一个整体，删除的时候
     * 整体删除，有的时候会出现删除一半的情况，非常抽象」—— 光标跟在 `「勿忘我」：` 后面按
     * 一下 Backspace 只掉一个冒号，留下 `「勿忘我」你终于来了。` 这种半截。
     */
    function prefixAt(line) {
      const s = String(line)
      const m = DIALOG_RE.exec(s)
      if (m) return { kind: 'char', name: m[1], len: m[0].length }
      const c = CONT_RE.exec(s)
      if (c) return { kind: 'cont', name: '', len: c[0].length }
      if (s.slice(0, 2) === NARRATION_PREFIX) return { kind: 'narration', name: '', len: 2 }
      return null
    }

    /** 整块删掉 [a,b)（前缀），光标落到 caret；顺带把「正在写：XX」收掉。 */
    function killPrefix(a, b, caret) {
      const v = String(text)
      const next = v.slice(0, a) + v.slice(b)
      setText(next)
      setDirty(true)
      scheduleDraft(next)
      setCaret(caret)
      // 前缀都没了，状态行还写着「正在写：XX」就是在瞎说
      if (role) setRole(null)
      return true
    }

    /**
     * Backspace / Delete 落在行首标记上时，整块删掉它（返回 true＝已经处理，别走默认）。
     *   Backspace：光标在标记内部或正好在标记末尾（但不含行首本身 —— 那里该走「合并上一行」）
     *   Delete   ：光标在标记起点或内部
     *   有选区时：只有选区完全落在同一行的标记区间内才整块删（选中名字三个字删掉，
     *             不会留下 `「」：`）；其余一律不抢，交给浏览器。
     */
    function killPrefixKey(kind) {
      const el = boxRef.current
      if (!el || typeof el.selectionStart !== 'number') return false
      const v = String(text)
      const from = clamp(el.selectionStart, 0, v.length)
      const to = clamp(typeof el.selectionEnd === 'number' ? el.selectionEnd : from, from, v.length)
      const ls = v.lastIndexOf('\n', Math.max(0, from - 1)) + 1
      const nlAt = v.indexOf('\n', ls)
      const le = nlAt === -1 ? v.length : nlAt
      const pre = prefixAt(v.slice(ls, le))
      if (!pre) return false
      if (from !== to) {
        return from >= ls && to <= ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
      }
      if (kind === 'Backspace') {
        return from > ls && from <= ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
      }
      return from >= ls && from < ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
    }

    function onKeyDown(e) {
      // 画布上的快捷键（Delete / 空格 / Ctrl+V）不能在打字时抢走按键
      e.stopPropagation()
      // 行首标记（`「名字」：` / `　　　　：` / 旁白的 `　　`）按一个整体删
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (killPrefixKey(e.key)) {
          if (typeof e.preventDefault === 'function') e.preventDefault()
          return
        }
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 's') {
        e.preventDefault()
        save()
        return
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Enter 由这里自己管：不 preventDefault 的话，浏览器往 DOM 里插的换行会被
        // 受控 value 冲掉（看起来就是「回车没用」），所以一律手动插、手动落光标。
        if (typeof e.preventDefault === 'function') e.preventDefault()
        // Shift+Enter：换行 + 补上和前缀等宽的一串全角空格（续行对着台词那一列），
        // **不**再重复一遍名字 —— 用户原话：「干脆同一个角色换行的时候，就不要再加前缀了，
        // 直接跟在后面」。角色状态留着，直到直接 Enter 收尾。
        // 缩进是**正文的一部分**：这几个全角空格会字面写进 .md。
        if (e.shiftKey) { insertAtCaret('\n' + roleIndent(role)); return }
        // 直接 Enter：只换行（不补缩进），并且这一句说完了 —— 回到普通行
        setRole(null)
        insertAtCaret('\n')
      }
    }

    /** 顶层：把 textarea 的滚动同步给高亮层（两层内容一样，滚差一格就对不上）。 */
    function onScroll(e) {
      const hl = hlRef.current
      const src = (e && e.target) ? e.target : boxRef.current
      if (!hl || !src) return
      hl.scrollTop = src.scrollTop || 0
      hl.scrollLeft = src.scrollLeft || 0
    }

    /** 名字 → 颜色（同一份数据也给方片页那个设色入口用）。 */
    function colorOf(name) {
      for (const s of speakers) if (s.name === name && s.color) return s.color
      return ''
    }

    /**
     * 高亮层：逐行渲染。行首 `「名字」：` 那一段用该角色的颜色，其余用正文色；
     * 旁白行开头的两个全角空格渲染成暗色（看着像缩进）。
     * 换行跟着每一行的最后一段走 —— 外层是 white-space:pre-wrap，会照原样断行，
     * 这样高亮层和 textarea 的行数、折行位置完全一致。
     */
    function highlightNodes() {
      const lines = String(text).split('\n')
      const out = []
      // 续行那个冒号要点上**当前角色**的颜色，让「还是同一个人在说」一眼看得出来。
      // 当前角色只在「台词首行」之后有效；普通行 / 旁白行 / 空行一来就清掉 ——
      // 不清的话后面随便哪一行的冒号都会被误染成上一个角色的色。
      let cur = ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nl = i === lines.length - 1 ? '' : '\n'
        const m = DIALOG_RE.exec(line)
        if (m) {
          cur = m[1]
          const col = colorOf(cur)
          const rest = line.slice(m[0].length) + nl
          if (col) out.push(React.createElement('span', { key: 'n' + i, className: 'sc-docname', style: { color: col } }, m[0]))
          else out.push(React.createElement('span', { key: 'n' + i, className: 'sc-docname' }, m[0]))
          out.push(React.createElement('span', { key: 'r' + i }, rest))
          continue
        }
        const cont = cur ? CONT_RE.exec(line) : null
        if (cont) {
          // 续行＝一串全角空格（暗色，看着像缩进）+ 一个上色的全角冒号 + 台词
          const col = colorOf(cur)
          out.push(React.createElement('span', { key: 'q' + i, className: 'sc-docquiet' }, cont[1]))
          if (col) out.push(React.createElement('span', { key: 'c' + i, className: 'sc-docname', style: { color: col } }, cont[2]))
          else out.push(React.createElement('span', { key: 'c' + i, className: 'sc-docname' }, cont[2]))
          out.push(React.createElement('span', { key: 'r' + i }, line.slice(cont[0].length) + nl))
          continue
        }
        cur = ''
        if (line.slice(0, 2) === NARRATION_PREFIX) {
          out.push(React.createElement('span', { key: 'q' + i, className: 'sc-docquiet' }, NARRATION_PREFIX))
          out.push(React.createElement('span', { key: 'r' + i }, line.slice(2) + nl))
          continue
        }
        out.push(React.createElement('span', { key: 'p' + i }, line + nl))
      }
      return out
    }

    // 状态行：脏标记与失败原因**都要在**（保存失败时改动还在输入框里，两件事都是真的）。
    // 从草稿恢复出来的，说清楚这是**草稿**（而且几点几分写下/改过），别让人以为是盘上那份。
    const state = loading
      ? '读取中…'
      : (dirty
        ? (draft ? '草稿 ' + clockOf(draft.at) + ' 未保存' : '● 未保存') + (failed ? ' · 保存失败：' + failed : '')
        : (failed
          ? '出错了：' + failed
          : (has ? (savedAt ? '已保存 ' + savedAt : '已有文档（未改动）') : '还没有文档')))

    // 把「保存」交给外面那颗主按钮用：编辑弹窗的「字段 | 文档」页签里，底下那颗显眼的
    // 按钮必须保存**当前这一页**在编的东西 —— 用户在文档页敲完字去点它，结果只把卡片
    // 文件写回去，会得出一句「文档功能没保存上」。所以文档页时那颗按钮换成
    // 「保存（写回文档）」，点的就是这个 save。
    // （用 saveRef 而不是 useImperativeHandle：客户端半边手写、只有 react 一个 require，
    //   一个普通 { current } 壳在真 React 与测试替身里都一样管用。）
    if (props.saveRef) props.saveRef.current = save

    useDismiss(function () { setMenu(null) }, !!menu)

    return React.createElement('div', { className: 'sc-doc' },
      React.createElement('div', { className: 'sc-docbar' },
        React.createElement('button', {
          className: 'sc-btn sc-btn-on', disabled: busy || readOnly,
          title: readOnly ? '只读模式：写不回磁盘' : '写回文档文件（Ctrl+S）',
          onClick: save,
        }, busy ? '保存中…' : '保存'),
        React.createElement('button', {
          className: 'sc-btn', disabled: busy || loading, title: '丢掉未保存的改动，重新从磁盘读',
          onClick: function () { reload('') },
        }, '重载'),
        draft
          ? React.createElement('button', {
            className: 'sc-btn', disabled: busy, title: '丢掉这份草稿，回到盘上的内容',
            onClick: function () { reload('discard') },
          }, '放弃草稿')
          : null,
        role
          ? React.createElement('span', {
            className: 'sc-docrole',
            title: 'Enter 结束这个角色；Shift+Enter 换行并对齐到台词那一列（不再重复名字）',
          }, '正在写：' + (role.kind === 'narration' ? '旁白' : role.name))
          : null,
        React.createElement('span', { className: 'sc-spacer' }),
        React.createElement('span', { className: 'sc-docstate' + (dirty ? ' dirty' : '') + (failed ? ' bad' : '') }, state)
      ),
      React.createElement('div', { className: 'sc-docpath', title: path }, path || '（还没有卡片文件）'),
      // textarea 的文字是透明的，真正显示的是底下这层高亮；两层必须像素级对齐，
      // 所以字体/内边距/行高/折行规则全在 CSS 里成对写（见 10-css.js 的 .sc-dochlwrap）。
      React.createElement('div', { className: 'sc-dochlwrap' },
        React.createElement('div', { className: 'sc-dochl', ref: hlRef, 'aria-hidden': 'true' }, highlightNodes()),
        React.createElement('textarea', {
          className: 'sc-docarea', ref: boxRef, value: text, readOnly: readOnly,
          spellCheck: false,
          title: '右键：插入台词（选人物）/ 旁白；Enter 结束这个角色，Shift+Enter 换行并对齐',
          placeholder: readOnly
            ? '只读模式'
            : '右键插入台词（选人物）或旁白；空 → 不落盘（保存时会把已存在的文档删掉）',
          onChange: function (e) {
            const v = e.target.value
            setText(v)
            setDirty(true)
            // 每次改动都记草稿（节流）：写一半去切卡片/关窗口，回来还能接着写
            scheduleDraft(v)
          },
          onKeyDown: onKeyDown,
          onContextMenu: openMenu,
          onScroll: onScroll,
          onPointerDown: function (e) { e.stopPropagation() },
        })
      ),
      readOnly
        ? React.createElement('div', { className: 'sc-docro' },
          '只读模式：宿主半边的落盘桥不可用，这里只能看、写不回磁盘。原因：' +
          (api && api.diagnostic ? api.diagnostic() : '未知'))
        : null,
      // 菜单用面板既有的那一对（MenuList + MenuBackdrop）：**必须**靠背后那层真实遮罩关
      // 菜单，不能在 window 上听 mousedown —— 捕获阶段的 mousedown 会在菜单项的 click
      // 之前就把菜单卸载掉，于是点任何一项都没反应（这个坑写在 70-menu.js 顶上）。
      menu ? MenuBackdrop({ onClose: function () { setMenu(null) } }) : null,
      menu ? MenuList({
        x: menu.x, y: menu.y, items: speakerItems(), color: '',
        swatches: props.swatches, onEditSwatches: null,
        onColor: function () {},
        onClose: function () { setMenu(null) },
      }) : null
    )
  }

    // ═══ src/95-panel.js ════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 面板：装载数据、串起两个视图、兜住所有写操作
  // ══════════════════════════════════════════════════════════════════════════════

  const GRAPH_LS_KEY = 'dsh-script-cards:graph'
  const NOOP_HOOK = function () { return undefined }

  function readGraphFallback(root) {
    try {
      const all = JSON.parse(window.localStorage.getItem(GRAPH_LS_KEY) || '{}')
      return normGraph(all[root])
    } catch (e) { return emptyGraph() }
  }

  function writeGraphFallback(root, graph) {
    try {
      const all = JSON.parse(window.localStorage.getItem(GRAPH_LS_KEY) || '{}')
      all[root] = { version: 1, chapters: graph.chapters, nodes: graph.nodes, edges: graph.edges }
      window.localStorage.setItem(GRAPH_LS_KEY, JSON.stringify(all))
    } catch (e) { /* 忽略 */ }
  }

  function msgOf(e) { return String(e && e.message ? e.message : e) }

  function CardsPanel(props) {
    const narrow = !!props.narrow
    const api = props.api
    const sessionId = props.sessionId
    const useSessions = props.useSessions || NOOP_HOOK

    const cwd = useSessions(function (sessions) {
      if (!sessions || !sessions.byId) return undefined
      const row = sessions.byId[sessionId]
      return row ? row.cwd : undefined
    })

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState(null)
    const [notice, setNotice] = React.useState(null)
    const [cards, setCards] = React.useState([])
    const [archives, setArchives] = React.useState([])
    const [graph, setGraph] = React.useState(function () { return emptyGraph() })
    const [ui, setUi] = React.useState(function () { return emptyUi() })
    const [view, setView] = React.useState('grid')
    const [query, setQuery] = React.useState('')
    const [starOnly, setStarOnly] = React.useState(false)
    const [sel, setSel] = React.useState(null)
    const [clipboard, setClipboard] = React.useState(null)
    const [dialog, setDialog] = React.useState(null)
    const [dirs, setDirs] = React.useState(function () { return normDirs(null) })

    React.useEffect(function () {
      if (api && api.setSession) api.setSession(sessionId)
    }, [api, sessionId])

    // 落盘桥是异步挂上的：挂好（或挂失败）时强制重渲染一次，面板才会自己从只读变回来，
    // 而不是要用户手动点刷新。
    const bridgeTick = React.useState(0)
    React.useEffect(function () {
      if (!api || typeof api.onBridgeChange !== 'function') return undefined
      const bump = bridgeTick[1]
      return api.onBridgeChange(function () { bump(function (n) { return n + 1 }) })
    }, [api])

    function pushNotice(n) {
      if (!n) { setNotice(null); return }
      setNotice(typeof n === 'string' ? { text: n, kind: 'error' } : n)
    }

    function saveUi(next) {
      setUi(next)
      try { writeUi(cwd, next) } catch (e) { pushNotice('浏览器存储不可用：' + msgOf(e)) }
    }

    // keep：刚写进磁盘、但这一帧的 cards 里还没有的卡片键（新建 / 复制 / 粘贴都是这样）。
    // 不把它们算进来的话，pruneGraph 会把刚加上的节点当孤儿立刻删掉——卡片文件落盘了，
    // 画布上却什么都没有（用户报的「新建没用」就是这个）。
    function saveGraph(next, keep) {
      const valid = {}
      for (const c of cards.concat(archives)) valid[cardKey(c)] = true
      for (const k of keep || []) valid[k] = true
      const pruned = pruneGraph(next, valid)
      setGraph(pruned)
      if (!cwd) return
      if (api.canWrite()) {
        api.writeGraph(cwd, pruned).catch(function (e) { pushNotice('图谱写入失败：' + msgOf(e)) })
      } else {
        writeGraphFallback(cwd, pruned)
      }
    }

    function load(root, keepView) {
      setLoading(true)
      const ctl = { aborted: false }
      api.scan(root, ctl).then(function (out) {
        if (ctl.aborted) return
        setCards(out.cards)
        setArchives(out.archives)
        const u = readUi(root)
        setUi(u)
        if (!keepView && (u.view === 'board' || u.view === 'grid')) setView(u.view)
        return api.readGraph(root).then(function (g) {
          if (ctl.aborted) return
          const writable = api.canWrite()
          const fallback = writable ? g : (function () {
            const local = readGraphFallback(root)
            return Object.keys(local.nodes).length ? local : g
          })()
          const valid = {}
          for (const c of out.cards.concat(out.archives)) valid[cardKey(c)] = true
          const pruned = pruneGraph(fallback, valid)
          setGraph(pruned)
          // 卡片文件被删掉后，图谱里残留的记录顺手清掉并落盘（只写回，不反向影响本次展示）。
          if (pruned !== fallback) {
            if (api.canWrite()) api.writeGraph(root, pruned).catch(function () { /* 清理失败不阻塞展示 */ })
            else writeGraphFallback(root, pruned)
          }
          setError(null)
          setLoading(false)
          pushNotice(out.missing
            ? { text: '没有找到「' + dirs.archive + '」目录。先在工作区里建档案（cards.py init）再回来。', kind: 'error' }
            : (writable ? null : { text: '宿主半边的落盘桥不可用：面板处于只读模式，画布结构只存在这台浏览器里，不会写回卡片文件。原因：' + (api.diagnostic ? api.diagnostic() : '未知'), kind: 'error' }))
        })
      }).catch(function (e) {
        if (ctl.aborted) return
        setError(msgOf(e))
        setLoading(false)
      })
      return function () { ctl.aborted = true }
    }

    // 目录名存在 localStorage 里，所以「先同步目录名 → 再扫档案」。第一次跑发现存的
    // 与当前状态不同就只更新状态，让下一次 effect 用对的目录名去扫（最多多跑一轮）。
    React.useEffect(function () {
      if (!cwd) { setLoading(false); return undefined }
      const stored = normDirs(readUi(cwd).dirs)
      if (!sameDirs(stored, dirs)) { setDirs(stored); return undefined }
      api.setDirs(dirs)
      return load(cwd, false)
    }, [cwd, dirs.archive, dirs.cards, dirs.sub, dirs.docs])

    function refresh() { if (cwd) load(cwd, true) }

    function setViewAndSave(v) {
      setView(v)
      saveUi(Object.assign({}, ui, { view: v }))
    }

    /**
     * 展开浮层的几何 / 模式改了就写回 localStorage（用户要求「拖动、缩放、切模式后记住」）。
     * 铁律照旧：**读出整份记录 → 改字段 → 整份写回** —— 只写 windows 一个字段会把图谱、
     * 星标、目录名全冲掉。
     */
    function saveWindow(key, geo) {
      const all = Object.assign({}, (ui && ui.windows) || {})
      const old = all[key] || {}
      all[key] = Object.assign({}, old, geo)
      saveUi(Object.assign({}, ui, { windows: all }))
    }

    /** 文档保存/清空之后，卡片上那个「有文档」角标要跟着变。 */
    function setCardDoc(card, has) {
      const k = cardKey(card)
      setCards(cards.map(function (c) { return cardKey(c) === k ? Object.assign({}, c, { hasDoc: !!has }) : c }))
    }

    function findCard(k) { return cards.concat(archives).filter(function (c) { return cardKey(c) === k })[0] || null }

    function chapterOf(card) { return nodeRec(graph, cardKey(card)).chapter || card.chapter || '' }
    function modeOf(card) { return nodeRec(graph, cardKey(card)).mode || card.mode || '' }

    // ── 写操作 ─────────────────────────────────────────────────────────────────
    function saveCard(card, fields, done) {
      const meta = {
        id: card.id,
        type: card.type,
        title: fields.title,
        code: fields.code,
        chapter: fields.chapter,
        mode: fields.mode,
        when: fields.when,
        order: fields.order,
        summary: fields.summary,
        tags: fields.tags,
        color: card.color,
        created: (parseFront('').meta && '') || '',
        updated: nowStamp(),
      }
      const text = renderFront(meta) + '\n' + String(fields.body || '').replace(/\s+$/, '') + '\n'
      api.writeCard(cwd, card.kind, card.file, text).then(function () {
        const entry = entryOfText(card.kind, card.file, text)
        setCards(cards.map(function (c) { return cardKey(c) === cardKey(card) ? entry : c }))
        if (fields.chapter !== undefined && (card.type === 'node' || card.type === 'condition' || card.type === 'result')) {
          const rec = nodeRec(graph, cardKey(card))
          if (rec.chapter !== fields.chapter) patchGraphRec(cardKey(card), { chapter: fields.chapter })
        }
        if (fields.mode !== undefined && card.type === 'node') {
          const rec = nodeRec(graph, cardKey(card))
          if ((rec.mode || '') !== (fields.mode || '')) patchGraphRec(cardKey(card), { mode: fields.mode })
        }
        setDialog(null)
        pushNotice({ text: '已写回 ' + card.file, kind: 'info' })
        if (done) done()
      }).catch(function (e) { pushNotice('保存失败：' + msgOf(e)); if (done) done() })
    }

    function patchGraphRec(key, fields) {
      const next = {
        version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
      }
      const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      next.nodes[key] = Object.assign({}, old, fields)
      saveGraph(next)
    }

    function deleteCard(card) {
      const dirName = card.kind === 'archive' ? dirs.sub : dirs.cards
      const cardPath = dirs.archive + '/' + dirName + '/' + card.file
      const docPath = dirs.archive + '/' + dirs.docs + '/' + card.file
      function doDelete(withDoc) {
        setDialog(null)
        api.deleteCard(cwd, card.kind, card.file).then(function () {
          setCards(cards.filter(function (c) { return cardKey(c) !== cardKey(card) }))
          const next = {
            version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
          }
          delete next.nodes[cardKey(card)]
          next.chapters = next.chapters.filter(function (k) { return k !== cardKey(card) })
          next.edges = next.edges.filter(function (e) { return e.from !== cardKey(card) && e.to !== cardKey(card) })
          saveGraph(next)
          pushNotice({
            text: '已删除 ' + card.file + (withDoc ? '（连同它的文档）' : '（文档留着）'),
            kind: 'info',
          })
          // 卡片删掉之后再删文档：卡片那一步失败的话，文档不该先没
          if (withDoc) return dropDocs([card])
          return true
        }).catch(function (e) { pushNotice('删除失败：' + msgOf(e)) })
      }
      docsOf([card]).then(function (withDocs) {
        if (!withDocs.length) {
          // 没有文档（或文档是空的）→ 保持原来的流程，不打扰
          setDialog({
            kind: 'confirm', title: '删除卡片文件？',
            text: '会真的删掉 ' + cardPath + '。删掉之后画布上对应的记录也会一起清掉。',
            okLabel: '删除',
            onOk: function () { doDelete(false) },
          })
          return
        }
        setDialog({
          kind: 'confirm', title: '删除卡片文件？',
          text: '会真的删掉 ' + cardPath + '。这张卡片还有文档 ' + docPath + '：要连文档一起删掉吗？',
          okLabel: '一起删除文档',
          extraLabel: '只删卡片、留着文档',
          onExtra: function () { doDelete(false) },
          onOk: function () { doDelete(true) },
        })
      }).catch(function (e) { pushNotice('读取文档失败：' + msgOf(e)) })
    }

    // 画布上框选出一组之后的批量删除：确认一次，删完只写一次图谱。
    function deleteCards(keys) {
      const want = {}
      keys.forEach(function (k) { want[k] = true })
      const list = cards.filter(function (c) { return want[cardKey(c)] })
      if (!list.length) return
      const names = list.map(function (c) { return c.file }).join('、')
      function doDelete(withDoc) {
        setDialog(null)
        Promise.all(list.map(function (c) { return api.deleteCard(cwd, c.kind, c.file) })).then(function () {
          setCards(cards.filter(function (c) { return !want[cardKey(c)] }))
          const next = {
            version: 1, chapters: graph.chapters.filter(function (k) { return !want[k] }),
            nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
          }
          for (const k of Object.keys(want)) delete next.nodes[k]
          next.edges = next.edges.filter(function (e) { return !want[e.from] && !want[e.to] })
          saveGraph(next)
          pushNotice({ text: '已删除 ' + list.length + ' 张卡片' + (withDoc ? '（连同它们的文档）' : '（文档留着）'), kind: 'info' })
          if (withDoc) return dropDocs(list)
          return true
        }).catch(function (e) { pushNotice('删除失败：' + msgOf(e)) })
      }
      docsOf(list).then(function (withDocs) {
        if (!withDocs.length) {
          setDialog({
            kind: 'confirm', title: '删除这 ' + list.length + ' 张卡片文件？',
            text: '会真的删掉 ' + names + '。删掉之后画布上对应的记录也会一起清掉。',
            okLabel: '删除',
            onOk: function () { doDelete(false) },
          })
          return
        }
        setDialog({
          kind: 'confirm', title: '删除这 ' + list.length + ' 张卡片文件？',
          text: '会真的删掉 ' + names + '。其中 ' + withDocs.length + ' 张有文档（' +
            withDocs.map(function (c) { return c.file }).join('、') + '）：要连文档一起删掉吗？',
          okLabel: '一起删除文档',
          extraLabel: '只删卡片、留着文档',
          onExtra: function () { doDelete(false) },
          onOk: function () { doDelete(true) },
        })
      }).catch(function (e) { pushNotice('读取文档失败：' + msgOf(e)) })
    }

    /** 这一批卡片里，哪几张**真的有非空文档**（空文件不算，读不到的按没有算）。 */
    function docsOf(list) {
      return Promise.all(list.map(function (c) {
        return api.readDoc(cwd, c.file).then(function (res) {
          return (res && res.exists && String(res.text || '').trim()) ? c : null
        }).catch(function () { return null })
      })).then(function (states) { return states.filter(Boolean) })
    }

    /** 用户选了「一起删除文档」时，把这几张卡片的文档删掉。删不掉也不挡卡片那一步的提示。 */
    function dropDocs(list) {
      return Promise.all(list.map(function (c) {
        return api.deleteDoc(cwd, c.file).catch(function () { return false })
      }))
    }

    function retype(card, type) {
      const text = renderFront({
        id: card.id, type: type, title: card.title, code: card.code, chapter: card.chapter,
        mode: card.mode, when: card.when, order: card.order === null ? '' : card.order,
        summary: card.summary, tags: card.tags, color: card.color, updated: nowStamp(),
      }) + '\n' + card.body
      api.writeCard(cwd, card.kind, card.file, text).then(function () {
        setCards(cards.map(function (c) { return cardKey(c) === cardKey(card) ? entryOfText(card.kind, card.file, text) : c }))
        pushNotice({ text: '已改为' + typeLabel(type) + '卡片', kind: 'info' })
      }).catch(function (e) { pushNotice('改写失败：' + msgOf(e)) })
    }

    /**
     * 给人物卡设「角色色」：写进卡片 frontmatter 的 `color`（跟项目进 git），
     * 空串＝清除（回到 tags 里的印象色）。
     * 写完顺手把这张卡片换掉，`speakers` 是从 cards 算出来的 —— 所以文档里那个角色
     * 名字的颜色**立刻**跟着变，不用另存一份颜色表。
     */
    function setCardColor(card, color) {
      const next = /^#[0-9a-fA-F]{3,8}$/.test(String(color || '').trim()) ? String(color).trim() : ''
      const text = renderFront({
        id: card.id, type: card.type, title: card.title, code: card.code, chapter: card.chapter,
        mode: card.mode, when: card.when, order: card.order === null ? '' : card.order,
        summary: card.summary, tags: card.tags, color: next, updated: nowStamp(),
      }) + '\n' + card.body
      api.writeCard(cwd, card.kind, card.file, text).then(function () {
        const entry = entryOfText(card.kind, card.file, text)
        setCards(cards.map(function (c) { return cardKey(c) === cardKey(card) ? entry : c }))
        pushNotice({ text: (next ? '角色色 ' + next : '已清除角色色') + ' · ' + card.file, kind: 'info' })
      }).catch(function (e) { pushNotice('写入失败：' + msgOf(e)) })
    }

    function newCardAt(type, point, chapterKey, mode) {
      const draft = { id: '', file: '(新卡片)', kind: 'card', type: type, title: '', code: '', when: '', order: null, summary: '', tags: [], body: '', chapter: chapterKey || '', mode: mode || '' }
      setDialog({ kind: 'edit', card: draft, isNew: true, point: point })
    }

    function duplicateCard(card) {
      const rec = nodeRec(graph, cardKey(card))
      api.createCard(cwd, {
        type: card.type, title: (card.title || '') + ' 副本', code: card.code, chapter: rec.chapter || card.chapter,
        mode: rec.mode || card.mode, when: card.when, order: card.order, summary: card.summary,
        tags: card.tags, color: card.color, body: card.body, source: '复制自 ' + card.file,
      }).then(function (entry) {
        setCards(cards.concat([entry]))
        const at = { x: (rec.x === null ? 40 : rec.x + 40), y: (rec.y === null ? 40 : rec.y + 40) }
        const key = cardKey(entry)
        const next = {
          version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
        }
        next.nodes[key] = { x: at.x, y: at.y, cx: at.x + 40, cy: at.y + 40, chapter: rec.chapter, mode: entry.mode, color: '', choices: [] }
        saveGraph(next, [key])
        pushNotice({ text: '已复制为 ' + entry.file, kind: 'info' })
      }).catch(function (e) { pushNotice('复制失败：' + msgOf(e)) })
    }

    // ── 渲染 ───────────────────────────────────────────────────────────────────
    const archiveCards = cards.filter(function (c) { return !isBranchType(c.type) })
    const branchCards = cards.filter(function (c) { return isBranchType(c.type) })
    const selected = sel ? findCard(sel) : null
    // 文档里那套台词结构的「人物」清单：存档族里 type=character 的卡片，名字取标题里
    // 第一个括号之前的那一段（见 30-model.js 的 speakerName），颜色取 frontmatter 的
    // color、没有就读 tags 里的 `印象色#RRGGBB`。台词素材卡不算说话的人。
    // 这一份数据同时喂「文档里名字着色」和「方片页给人物卡设角色色」—— 只有一个来源，
    // 所以在方片页改完颜色，文档里那个角色的名字**立刻**跟着变。
    const speakers = speakerList(archiveCards)
    // 「简介自动生成」走模型：面板只负责把缺简介的卡片点出来，真正的生成由助手
    // 在扫描后批量写回 frontmatter，所以这里给一条可操作的提示。
    const noSummary = archiveCards.filter(function (c) { return !String(c.summary || '').trim() }).length

    const head = React.createElement('div', { className: 'sc-head' },
      React.createElement('h2', null, '剧本档案'),
      React.createElement('div', { className: 'sc-seg' },
        React.createElement('button', { className: 'sc-segb' + (view === 'grid' ? ' on' : ''), onClick: function () { setViewAndSave('grid') } }, '方片'),
        React.createElement('button', { className: 'sc-segb' + (view === 'board' ? ' on' : ''), onClick: function () { setViewAndSave('board') } }, '分支')
      ),
      React.createElement('span', { className: 'sc-count' }, archiveCards.length + ' 张存档卡 · ' + branchCards.length + ' 张结构卡'),
      React.createElement('span', { className: 'sc-spacer' }),
      React.createElement('button', {
        className: 'sc-btn', title: '档案目录名 / 色卡', disabled: !cwd,
        onClick: function () { setDialog({ kind: 'settings' }) },
      }, '设置'),
      React.createElement('button', { className: 'sc-btn', onClick: refresh, disabled: loading }, loading ? '读取中…' : '刷新'),
      React.createElement('span', { className: 'sc-ver' }, VERSION + (api.canWrite() ? '' : ' · 只读'))
    )

    const infoNotice = !notice && !error && noSummary > 0
      ? { text: '有 ' + noSummary + ' 张卡片还没有简介。简介由助手批量生成后写回卡片，跟它说一声「补简介」即可。', kind: 'info' }
      : null
    const shownNotice = notice || infoNotice
    const noticeBar = (shownNotice || error) ? React.createElement('div', { className: 'sc-noticebar' },
      React.createElement('div', { className: 'sc-noticetext' + (shownNotice && shownNotice.kind === 'info' ? ' info' : '') },
        error ? '读取失败：' + error : shownNotice.text),
      React.createElement('button', { className: 'sc-noticex', onClick: function () { pushNotice(null); setError(null) } }, '×')
    ) : null

    let screen = null
    if (!cwd) {
      screen = React.createElement('div', { className: 'sc-empty' }, '这个会话还没有工作区目录。')
    } else if (view === 'grid') {
      screen = React.createElement(GridView, {
        cards: archiveCards, archives: archives, ui: ui, narrow: narrow,
        query: query, setQuery: setQuery, starOnly: starOnly, setStarOnly: setStarOnly,
        selected: sel, onOpen: function (c) { setSel(cardKey(c)); loadDetail(c) },
        onCloseDetail: function () { setSel(null) },
        onStar: function (c, on) { saveUi(Object.assign({}, ui, { star: toggleIn(ui.star, cardKey(c), on) })) },
        onPin: function (c, on) { saveUi(Object.assign({}, ui, { pin: toggleIn(ui.pin, cardKey(c), on) })) },
        onRefresh: refresh,
        // 方片页给「人物」卡设角色色（右键卡片）：色卡复用画布那一套
        swatches: swatchesOf(ui), onEditSwatches: function () { setDialog({ kind: 'swatches' }) },
        onSetColor: setCardColor,
        detailOpen: !!selected, detailCard: selected, detailBody: selected && selected.body, detailLoading: false,
      })
    } else {
      screen = React.createElement(BoardView, {
        cards: branchCards, graph: graph, ui: ui, narrow: narrow,
        // api / root：展开浮层里的「文档」页签要自己读写文档文件
        api: api, root: cwd,
        // 引用卡要把「别的级别」的卡片也解析出来（存档卡、其它章节的节点卡），所以整份 cards 都给
        allCards: cards,
        // 文档里录台词要能选人物（浮窗那条线）
        speakers: speakers,
        swatches: swatchesOf(ui), onEditSwatches: function () { setDialog({ kind: 'swatches' }) },
        clipboard: clipboard, onClipboard: setClipboard,
        onGraph: saveGraph,
        onRefresh: refresh,
        onNotice: pushNotice,
        onWindowSave: saveWindow,
        onDocChange: setCardDoc,
        onOpenCard: function (c) { setSel(cardKey(c)); setDialog({ kind: 'edit', card: c }) },
        onEditCard: function (c) { setDialog({ kind: 'edit', card: c }) },
        onDeleteCard: deleteCard,
        onDeleteCards: deleteCards,
        onDuplicate: duplicateCard,
        onRetype: retype,
        onNewCard: newCardAt,
        onPasteCopy: function (card, point) {
          const rec = nodeRec(graph, cardKey(card))
          const at = point || { x: (rec.x === null ? 40 : rec.x + 40), y: (rec.y === null ? 40 : rec.y + 40) }
          api.createCard(cwd, {
            type: card.type, title: (card.title || '') + ' 副本', code: card.code, chapter: rec.chapter || card.chapter,
            mode: rec.mode || card.mode, when: card.when, order: card.order, summary: card.summary,
            tags: card.tags, color: card.color, body: card.body, source: '粘贴自 ' + card.file,
          }).then(function (entry) {
            setCards(cards.concat([entry]))
            const key = cardKey(entry)
            const next = {
              version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
            }
            next.nodes[key] = { x: Math.round(at.x), y: Math.round(at.y), cx: Math.round(at.x), cy: Math.round(at.y), chapter: rec.chapter, mode: entry.mode, color: '', choices: [] }
            saveGraph(next, [key])
          }).catch(function (e) { pushNotice('粘贴失败：' + msgOf(e)) })
        },
        // 连线的名字直接在线上改（画布上浮出一个输入框），不走对话框：
        // 弹个框挡在中间，既和展开的卡片宽度对不上，又平白多一层。
        onSetEdgeLabel: function (e, label) {
          const next = {
            version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes),
            edges: graph.edges.map(function (x) {
              return (x.from === e.from && x.to === e.to && String(x.choice || '') === String(e.choice || ''))
                ? Object.assign({}, x, { label: label }) : x
            }),
          }
          saveGraph(next)
        },
        onEditChoices: function (card) {
          const rec = nodeRec(graph, cardKey(card))
          setDialog({
            kind: 'choices', card: card, choices: rec.choices || [],
            onSave: function (list) { patchGraphRec(cardKey(card), { choices: list }); setDialog(null) },
          })
        },
        onEditChoice: function (card, ch) {
          setDialog({
            kind: 'prompt', title: '选项内容', value: ch.text, okLabel: '保存',
            onOk: function (v) {
              const rec = nodeRec(graph, cardKey(card))
              const choices = (rec.choices || []).map(function (c) { return c.id === ch.id ? Object.assign({}, c, { text: v }) : c })
              patchGraphRec(cardKey(card), { choices: choices })
              setDialog(null)
            },
          })
        },
      })
    }

    const dialogs = []
    if (dialog && dialog.kind === 'edit') {
      dialogs.push(React.createElement(CardEditor, {
        key: 'edit', card: dialog.card,
        chapters: branchCards.filter(function (c) { return c.type === 'chapter' }),
        chapterOf: chapterOf, modeOf: modeOf,
        // 新卡片还没有文件（文件是保存时才生成的），所以不给「文档」页签
        isNew: !!dialog.isNew,
        // 编辑弹窗那条线也要能选人物（同一个 DocEditor）
        speakers: speakers,
        api: api, root: cwd, onNotice: pushNotice, onDocChange: setCardDoc,
        onClose: function () { setDialog(null) },
        onDelete: function (c) { setDialog(null); deleteCard(c) },
        onSave: function (card, fields, done) {
          if (dialog.isNew) {
            api.createCard(cwd, {
              type: card.type, title: fields.title || typeLabel(card.type), code: fields.code,
              chapter: fields.chapter, mode: fields.mode, when: fields.when, order: fields.order,
              summary: fields.summary, tags: fields.tags, body: fields.body,
            }).then(function (entry) {
              setCards(cards.concat([entry]))
              if (dialog.point) {
                const key = cardKey(entry)
                const next = {
                  version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
                }
                const rec = nodeRec(graph, key)
                next.nodes[key] = Object.assign({}, rec, {
                  x: Math.round(dialog.point.x), y: Math.round(dialog.point.y),
                  cx: Math.round(dialog.point.x), cy: Math.round(dialog.point.y),
                  chapter: card.type === 'chapter' ? rec.chapter : (fields.chapter || ''),
                  // 节点形态也要落进图谱：画布靠 rec.mode 决定要不要画选项列，
                  // 漏掉这一行的话，新建出来的分歧节点在画布上只是个普通节点。
                  mode: card.type === 'node' ? (fields.mode || '') : rec.mode,
                })
                saveGraph(next, [key])
              }
              setDialog(null)
              pushNotice({ text: '已新建 ' + entry.file, kind: 'info' })
              if (done) done()
            }).catch(function (e) { pushNotice('新建失败：' + msgOf(e)); if (done) done() })
            return
          }
          saveCard(card, fields, done)
        },
      }))
    }
    if (dialog && dialog.kind === 'prompt') {
      dialogs.push(React.createElement(PromptDialog, {
        key: 'prompt', title: dialog.title, value: dialog.value, okLabel: dialog.okLabel,
        onClose: function () { setDialog(null) }, onOk: dialog.onOk,
      }))
    }
    if (dialog && dialog.kind === 'confirm') {
      dialogs.push(React.createElement(ConfirmDialog, {
        key: 'confirm', title: dialog.title, text: dialog.text, okLabel: dialog.okLabel,
        // 第三条出路（删卡片时「只删卡片、留着文档」）。ConfirmDialog 只在给了 extraLabel
        // 时才画它，所以普通确认框的形状一个字都没变。
        extraLabel: dialog.extraLabel, onExtra: dialog.onExtra,
        onClose: function () { setDialog(null) }, onOk: dialog.onOk,
      }))
    }
    if (dialog && dialog.kind === 'choices') {
      dialogs.push(React.createElement(ChoiceEditor, {
        key: 'choices', card: dialog.card, choices: dialog.choices,
        onClose: function () { setDialog(null) }, onSave: dialog.onSave,
      }))
    }
    if (dialog && dialog.kind === 'swatches') {
      dialogs.push(React.createElement(SwatchEditor, {
        key: 'swatches', swatches: swatchesOf(ui),
        onClose: function () { setDialog(null) },
        onSave: function (list) {
          saveUi(Object.assign({}, ui, { swatches: normSwatches(list) }))
          setDialog(null)
        },
      }))
    }
    if (dialog && dialog.kind === 'settings') {
      dialogs.push(React.createElement(SettingsDialog, {
        key: 'settings', dirs: dirs,
        onClose: function () { setDialog(null) },
        onSave: function (d) {
          saveUi(Object.assign({}, ui, { dirs: d }))
          setDirs(d)
          setDialog(null)
        },
      }))
    }

    return React.createElement('div', { className: 'sc-wrap' + (narrow ? ' sc-narrow' : '') },
      head, noticeBar,
      React.createElement('div', { className: 'sc-bodycol' }, screen),
      dialogs
    )
  }

  function loadDetail() { /* 正文已随 scan 一起读回，这里只是占位 */ }

    // ═══ src/99-apply.js ════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════
  // 插件体
  // ══════════════════════════════════════════════════════════════════════════════

  function apply(ctx) {
    ctx.effect(function () {
      const el = document.createElement('style')
      el.setAttribute('data-dsh-script-cards', '')
      el.textContent = CSS
      document.head.appendChild(el)
      return function () { el.remove() }
    }, 'script-cards: styles')

    const slots = ctx.get('slots')
    if (slots === undefined) return

    const wf = ctx.remote && ctx.remote.workspaceFiles
    if (wf === undefined) {
      console.warn('[script-cards] remote.workspaceFiles 不可用，面板未注册')
      return
    }

    const api = makeApi(ctx, wf)

    // 便宜的自我检查：方法名一旦撞上 RemoteNamespaceService 的保留名，$mount 会被网关
    // 拒绝（v0.1.0-alpha.1 第一版就是这样整体只读的），所以这里先喊一声。
    const clash = CLIENT_TYPERT.descriptors.filter(function (d) { return REMOTE_RESERVED.indexOf(d.method) !== -1 })
    if (clash.length) {
      console.error('[script-cards] 落盘桥的方法名与网关保留名冲突，$mount 一定会失败：' +
        clash.map(function (d) { return d.method }).join(', '))
    }

    // 把自己那份客户端 Typert 清单挂到网关上，宿主半边的 scriptCardsFs 才会以
    // remote.scriptCardsFs 的形式出现在这里。挂载是异步的，失败会重试；最终失败也
    // 不致命 —— 面板退化成只读模式，并在顶部把原因写出来。
    const remote = ctx.get('remote') !== undefined ? ctx.get('remote') : ctx.remote
    if (remote !== undefined && typeof remote.$mount === 'function') {
      ctx.effect(function () {
        let cancelled = false
        let dispose = null
        Promise.resolve(mountBridge(remote, api.mountContribution, 3)).then(function (d) {
          if (typeof d !== 'function') return
          if (cancelled) { try { d() } catch (e) { /* 忽略 */ } } else dispose = d
        })
        return function () {
          cancelled = true
          if (typeof dispose === 'function') { try { dispose() } catch (e) { /* 忽略 */ } }
        }
      }, 'script-cards: remote contribution')
    } else {
      bumpBridge('none', 'ctx.remote 上没有 $mount')
      console.warn('[script-cards] remote.$mount 不可用，面板将以只读模式运行')
    }

    const tabs = ctx.get('sidebarRightTabs')
    const nav = ctx.get('sidebarRight')

    function tryInject(name, make) {
      try {
        slots.inject(name, function () {
          try { return make() } catch (e) {
            console.warn('[script-cards] register failed: ' + name, e)
            return function () {}
          }
        })
      } catch (e) {
        console.warn('[script-cards] slot unavailable: ' + name, e)
      }
    }

    function panel(extra) {
      return function (props) {
        return React.createElement(CardsPanel, Object.assign({
          api: api,
          sessionId: props && props.sessionId,
          useSessions: props && props.useSessions,
        }, extra || {}))
      }
    }

    if (tabs !== undefined) {
      ctx.effect(function () {
        return tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'builtin',
          title: function () { return '剧本档案' },
          guide: [{
            id: 'archive',
            order: 10,
            title: function () { return '剧本档案' },
            description: function () { return '浏览剧本卡片、梳理章节与情节分支' },
          }],
        })
      }, 'script-cards: tab type')

      tryInject('sidebar.right.pane.tab', function () {
        return slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, panel({ narrow: true }))
      })
    } else {
      console.warn('[script-cards] sidebarRightTabs 不可用，右侧栏停靠页未注册')
    }

    if (nav !== undefined) {
      tryInject('conversation.session.header.utilities', function () {
        return slots.register(
          { name: 'conversation.session.header.utilities', id: 'script-cards', order: 30, label: '剧本档案' },
          function () {
            return React.createElement('button', {
              className: 'sc-btn sc-dockbtn',
              title: '在右侧栏打开剧本档案，与对话并排',
              onClick: function () {
                try { nav.openTab(TAB_KIND) } catch (e) { console.warn('[script-cards] openTab failed', e) }
              },
            }, PanelIcon({ size: 15 }), '剧本档案')
          })
      })
    }

    tryInject('sidebar.panellist', function () {
      return slots.register(
        { name: 'sidebar.panellist', id: 'script-cards', order: 12, label: '剧本档案' },
        function (props) { return React.createElement(PanelIcon, props) })
    })

    tryInject('main', function () {
      return slots.register({ name: 'main', key: 'script-cards' }, panel({}))
    })
  }

  return { apply: apply, inject: inject }

  },
})
