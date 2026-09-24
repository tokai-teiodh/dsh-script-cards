// dsh-script-cards — client half (browser)   v0.1.0-alpha.4
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
  const VERSION = 'v0.1.0-alpha.4'

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
  .sc-tile{display:flex;flex-direction:column;gap:5px;min-height:98px;padding:9px 10px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer}
  .sc-tile:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
  .sc-tile.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
  .sc-tiletop{display:flex;align-items:flex-start;gap:4px}
  .sc-tiletitle{flex:1;min-width:0;font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
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

  /* 标签条：不悬停时藏起滚动条，直接拖动即可横向滑（要求 3） */
  .sc-tags{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;overflow-y:hidden}
  .sc-tags::-webkit-scrollbar{height:0}
  .sc-tags:hover::-webkit-scrollbar{height:5px}
  .sc-tags::-webkit-scrollbar-track{background:transparent}
  .sc-tags::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
  .sc-tags::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}
  .sc-tag{flex:0 0 auto;font-size:10.5px;line-height:16px;padding:0 7px;border-radius:999px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}

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
  .sc-dots{position:absolute;left:-4000px;top:-4000px;width:8000px;height:8000px;pointer-events:none;background-image:radial-gradient(var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:22px 22px;opacity:.7}
  .sc-edges{position:absolute;left:-4000px;top:-4000px;overflow:visible;pointer-events:none}
  .sc-edge{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:1.6}
  .sc-edge.on{stroke:var(--dsw-alias-brand-primary);stroke-width:2.2}
  .sc-edge.temp{stroke:var(--dsw-alias-brand-primary);stroke-dasharray:5 4}
  .sc-edgehit{fill:none;stroke:transparent;stroke-width:16;pointer-events:stroke;cursor:pointer}
  .sc-arrowhead{fill:var(--dsw-alias-border-l2)}
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
  .sc-cardsum{margin-top:5px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-cardmono{margin-top:5px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .sc-cardkind{font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
  .sc-cardbody{margin-top:6px;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-primary);overflow:auto;flex:1;min-height:0}
  .sc-cardsec{margin-top:6px}
  .sc-cardsecname{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-label-secondary);margin-bottom:2px}
  .sc-cardlist{margin:0;padding-left:14px}
  .sc-cardlist li{font-size:11.5px;line-height:1.6}
  /* 接口圆点：整个圆 + 空心（底是卡片自己的底色，只有一圈本色描边），不再被卡片裁成
     半个。平时就有半透明，悬停 / 选中 / 拉到一半时整亮 —— 否则「哪里能拉线」只能靠猜。 */
  .sc-port{position:absolute;top:50%;margin-top:-7px;width:14px;height:14px;box-sizing:border-box;border-radius:50%;background:var(--dsw-alias-bg-base);border:2px solid var(--sc-accent,var(--dsw-alias-brand-primary));cursor:crosshair;opacity:.45;transition:opacity .12s,transform .12s}
  .sc-port.in{left:-7px}
  .sc-port.out{right:-7px}
  .sc-card:hover .sc-port,.sc-card.on .sc-port{opacity:1}
  .sc-port.hot{opacity:1;transform:scale(1.3)}
  .sc-elabel{position:absolute;transform:translate(-50%,-50%);font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
  .sc-elabel.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
  .sc-elabel.empty{opacity:.45;font-style:italic}

  /* 分歧节点的选项：贴在卡片右侧 */
  .sc-choices{position:absolute;left:100%;top:8px;margin-left:14px;width:170px;display:flex;flex-direction:column;gap:5px;z-index:2}
  .sc-choice{position:relative;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);padding:5px 8px;font-size:11.5px;line-height:1.45;cursor:pointer;white-space:normal;word-break:break-word}
  .sc-choice:hover{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choice.on{border-color:var(--sc-accent,var(--dsw-alias-brand-primary));color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choice .sc-port{top:50%;margin-top:-7px;opacity:1}
  .sc-choice .sc-choicego{float:right;margin-left:6px;opacity:.75}
  .sc-choice.linked{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
  .sc-choiceadd{border:1px dashed var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:inherit;padding:4px 8px;cursor:pointer;text-align:left}
  .sc-choiceadd:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}

  /* 章节卡片的节点列表（展开态）：一次最多显示 5 行，剩下的用滑条 */
  .sc-nodelist{margin-top:6px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1;min-height:0;max-height:106px}
  .sc-nodelist::-webkit-scrollbar{width:5px}
  .sc-nodelist::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
  .sc-nodelistrow{display:flex;align-items:baseline;gap:6px;font-size:11px;line-height:1.4;padding:2px 5px;border-radius:6px;cursor:pointer}
  .sc-nodelistrow:hover{background:var(--dsw-alias-bg-layer-2)}
  .sc-nodelistrow .n{flex:none;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
  .sc-nodelistrow .t{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

  /* 展开态：卡片移到中央后放大，背景（含其他卡片）虚化 */
  .sc-expand{position:absolute;box-sizing:border-box;border-radius:14px;border:1px solid var(--sc-accent,var(--dsw-alias-brand-primary));background:var(--dsw-alias-bg-base);box-shadow:0 18px 50px rgba(0,0,0,.4);padding:16px 18px;display:flex;flex-direction:column;z-index:30;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1)}
  .sc-expand.open{box-shadow:0 26px 70px rgba(0,0,0,.5)}
  .sc-expandh{display:flex;align-items:baseline;gap:8px;flex:none;padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:8px}
  .sc-expand h3{margin:0;font-size:16px;font-weight:700;flex:1;min-width:0}
  .sc-expandx{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:17px;line-height:1;cursor:pointer;font-family:inherit;padding:0 2px;flex:none}
  .sc-expandx:hover{color:var(--dsw-alias-label-primary)}
  .sc-expandbody{flex:1;min-height:0;overflow:auto;font-size:12.5px;line-height:1.75}

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

  /* 对话框 */
  .sc-modal{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px}
  .sc-modalbox{width:520px;max-width:100%;max-height:100%;display:flex;flex-direction:column;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
  .sc-modalh{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-modalh h3{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sc-modalb{padding:14px 16px;overflow:auto;flex:1;min-height:0}
  .sc-modalf{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
  .sc-frow{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap}
  .sc-frow:last-child{margin-bottom:0}
  .sc-field{display:flex;flex-direction:column;gap:4px;min-width:0}
  .sc-lbl{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.4}
  .sc-inp{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:5px 8px;font-size:12.5px;font-family:inherit;outline:none;min-width:0}
  .sc-inp:focus{border-color:var(--dsw-alias-brand-primary)}
  .sc-inp.num{width:72px}
  .sc-inp.wide{width:230px}
  .sc-inp.full{width:100%}
  .sc-area{width:100%;min-height:200px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.7;font-family:ui-monospace,Menlo,Consolas,monospace;outline:none}
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

  // ── 结构图谱 ──────────────────────────────────────────────────────────────────

  function emptyGraph() {
    return { version: 1, chapters: [], nodes: {}, edges: [] }
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
        if (edges.some(function (x) { return x.from === e.from && x.to === e.to })) continue
        edges.push({ from: e.from, to: e.to, label: e.label == null ? '' : String(e.label), choice: e.choice == null ? '' : String(e.choice) })
      }
    }
    out.nodes = out.nodes
    out.chapters = chapters
    out.edges = edges
    return out
  }

  function nodeRec(graph, key) {
    const rec = graph && graph.nodes ? graph.nodes[key] : null
    return rec || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
  }

  // 卡片文件被删掉之后，图谱里对应的记录与连线要一起清掉，免得留下断头线。
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
    if (!changed) return g
    return { version: 1, chapters: chapters, nodes: nodes, edges: edges }
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
    function graphFile(root) { return joinPath(archiveRoot(root), GRAPH_FILE) }

    function fail(res) {
      const code = res && res.error ? res.error.code : undefined
      const message = res && res.error && res.error.message ? res.error.message : ''
      return new Error(errText(message || code || '空响应'))
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
        const b = bridge()
        if (!b) throw new Error('只读模式：不能删除卡片文件。')
        if (typeof b.fsRemove !== 'function') throw new Error('宿主半边的落盘桥没有提供 fsRemove。')
        const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
        const res = await b.fsRemove(archiveRoot(root), joinPath(dir, file))
        if (!res || res.ok !== true) throw fail(res)
        return true
      },

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
        }, null, 2)
        await writeText(root, graphFile(root), text)
        return true
      },

      async ensureDir(root, name) {
        const b = bridge()
        if (!b || typeof b.fsMkdir !== 'function') return false
        const res = await b.fsMkdir(archiveRoot(root), joinPath(archiveRoot(root), name))
        return !!(res && res.ok === true)
      },
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

  function TagRow(props) {
    const tags = props.tags || []
    if (!tags.length) return null
    return React.createElement('div', { className: 'sc-tags' },
      tags.map(function (t, i) { return React.createElement('span', { key: i, className: 'sc-tag' }, t) }))
  }

  function Tile(props) {
    const c = props.card
    const starred = props.starred
    const pinned = props.pinned
    const on = props.on
    return React.createElement('div', {
      className: 'sc-tile' + (on ? ' on' : ''),
      onClick: function () { props.onOpen(c) },
    },
      React.createElement('div', { className: 'sc-tiletop' },
        React.createElement('div', { className: 'sc-tiletitle' }, c.title || c.file),
        React.createElement('div', { className: 'sc-tileacts' + (starred || pinned ? ' force' : '') },
          React.createElement('button', {
            key: 's', className: 'sc-icon' + (starred ? ' on' : ''), title: starred ? '取消收藏' : '收藏',
            onClick: function (e) { e.stopPropagation(); props.onStar(c, !starred) },
          }, StarIcon({ on: starred })),
          React.createElement('button', {
            key: 'p', className: 'sc-icon' + (pinned ? ' on' : ''), title: pinned ? '取消置顶' : '置顶',
            onClick: function (e) { e.stopPropagation(); props.onPin(c, !pinned) },
          }, PinIcon({ on: pinned }))
        )
      ),
      TagRow({ tags: c.tags }),
      React.createElement('div', { className: 'sc-tilesum' }, c.summary || c.preview || '')
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
      TagRow({ tags: c.tags }),
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
                  return Tile({
                    key: k, card: c, on: selected === k,
                    starred: star.indexOf(k) !== -1, pinned: pin.indexOf(k) !== -1,
                    onOpen: props.onOpen, onStar: props.onStar, onPin: props.onPin,
                  })
                })
              )
            )
          })
      )
    )

    const narrow = props.narrow
    if (narrow && !selected) return React.createElement('div', { className: 'sc-body' }, list)

    const detail = React.createElement('div', { className: 'sc-detail' },
      selected && props.detailOpen
        ? ArchiveDetail({ card: props.detailCard, body: props.detailBody, loading: props.detailLoading })
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
        )
      )
    }

    return React.createElement('div', { className: 'sc-body' }, list, detail)
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
              onChange: function (e) { props.onColor(e.target.value) },
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
    return React.createElement('div', {
      className: 'sc-menuback',
      onMouseDown: function (e) { e.stopPropagation(); if (props.onClose) props.onClose() },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); if (props.onClose) props.onClose() },
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

  const CARD_W = { chapter: 208, node: 184, condition: 172, result: 172 }
  const CARD_H = { chapter: 96, node: 80, condition: 58, result: 58 }
  const CHOICE_W = 170
  const CHOICE_H = 30
  const CHOICE_GAP = 5
  const CHOICE_DX = 14
  const PORT_DX = 10
  const EXPAND_W = 460
  const EXPAND_H = 430

  function sizeOf(type) {
    return { w: CARD_W[type] || 184, h: CARD_H[type] || 80 }
  }

  function cardRect(type, x, y) {
    const s = sizeOf(type)
    return { x: x, y: y, w: s.w, h: s.h }
  }

  // 分歧节点的选项块位置（与 CSS .sc-choices 的 top:8px / gap:5px 对齐）。
  function choiceRect(rect, i) {
    return { x: rect.x + rect.w + CHOICE_DX, y: rect.y + 8 + i * (CHOICE_H + CHOICE_GAP), w: CHOICE_W, h: CHOICE_H }
  }

  function outPoint(rect, choiceIndex) {
    if (choiceIndex === undefined || choiceIndex === null || choiceIndex < 0) {
      return { x: rect.x + rect.w + PORT_DX, y: rect.y + rect.h / 2 }
    }
    const c = choiceRect(rect, choiceIndex)
    return { x: c.x + c.w + PORT_DX, y: c.y + c.h / 2 }
  }

  function inPoint(rect) {
    return { x: rect.x - PORT_DX, y: rect.y + rect.h / 2 }
  }

  function edgePath(a, b) {
    const dx = Math.max(26, Math.abs(b.x - a.x) * 0.45)
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y
  }

  function edgeMid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  // 自动排列：分层（最长路径）后逐层纵向铺开；L1 按章节序号，L2 按章节内顺序。
  function autoLayout(keys, rectOf, edges) {
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
    const gapX = 260
    const gapY = 24
    let x = 24
    const levels = Object.keys(byDepth).map(Number).sort(function (a, b) { return a - b })
    for (const d of levels) {
      let y = 24
      for (const k of byDepth[d]) {
        const r = rectOf(k)
        out[k] = { x: x, y: y }
        y += r.h + gapY
      }
      x += gapX
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
        React.createElement('div', { style: { marginTop: 5 } }, TagRow({ tags: c.tags })),
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
      return React.createElement('div', null,
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
    const style = {
      left: r.x, top: r.y, width: r.w,
      // 展开的章节卡片要留出「最多 5 行节点 + 滑条」的高度。
      height: props.expanded ? (type === 'chapter' ? 224 : Math.max(r.h, 168)) : r.h,
    }
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
    // cards.py 手写的卡片可能还没被图谱记住。
    const isBranchNode = type === 'node' && (rec.mode === 'branch' || c.mode === 'branch')

    const children = [
      React.createElement('div', { key: 'b', style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        CardBody({
          card: c, rec: rec, expanded: props.expanded, nodes: props.childNodes || [],
          onOpenNode: props.onOpenNode,
        })
      ),
    ]

    if (isBranchNode) {
      // 分歧节点：右侧一列选项，每项自己有出口；最下面永远留一个「＋」，
      // 免得加选项还得先展开卡片或者翻右键菜单。
      const list = rec.choices || []
      children.push(React.createElement('div', { key: 'ch', className: 'sc-choices' },
        list.map(function (ch, i) {
          const on = props.hotChoice === ch.id
          return React.createElement('div', {
            key: ch.id, className: 'sc-choice' + (on ? ' on' : '') + (ch.to ? ' linked' : ''),
            'data-choice': ch.id,
            onPointerDown: function (e) { e.stopPropagation() },
            onDoubleClick: function (e) { e.stopPropagation(); props.onEditChoice(c, ch) },
          },
            ch.to ? React.createElement('span', { key: 'go', className: 'sc-choicego' }, '→') : null,
            React.createElement('span', null, ch.text || '（空选项）'),
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
      key: 'in', className: 'sc-port in', 'data-port': 'in',
      title: '入口', onPointerUp: function (e) { props.onDropLink(e, c) },
    }))
    if (hasOut && !isBranchNode) children.push(React.createElement('div', {
      key: 'out', className: 'sc-port out' + (props.hotPort ? ' hot' : ''), 'data-port': 'out',
      title: '从这里拖到目标卡片',
      onPointerDown: function (e) { e.stopPropagation(); props.onStartLink(e, c, '') },
      onPointerUp: function (e) { props.onDropLink(e, c) },
    }))

    return React.createElement('div', {
      className: cls, style: style,
      'data-key': props.cardKey, 'data-type': type,
      onPointerDown: function (e) { props.onCardDown(e, c) },
      onDoubleClick: function (e) { e.stopPropagation(); props.onDouble(c) },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); props.onMenu(e, c) },
    }, children)
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
    const [expand, setExpand] = React.useState(null)
    const [drag, setDrag] = React.useState(null)
    const [ghost, setGhost] = React.useState(null)
    const [panOn, setPanOn] = React.useState(false)
    const [fav, setFav] = React.useState(readFav)

    const canvasRef = React.useRef(null)
    const clipRef = React.useRef(null)
    const dragRef = React.useRef(null)
    const linkRef = React.useRef(null)
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

    function go(entry) {
      const next = hist.slice(0, hi + 1)
      next.push(entry)
      setHist(next)
      setHi(next.length - 1)
      setSel(null)
      closeExpand()
    }
    function back() { if (hi > 0) { setHi(hi - 1); setSel(null); closeExpand() } }
    function fwd() { if (hi < hist.length - 1) { setHi(hi + 1); setSel(null); closeExpand() } }
    function home() { if (here.level !== 'root') go({ level: 'root' }) }

    // ── 当前层级的卡片 ─────────────────────────────────────────────────────────
    const level = here.level === 'chapter' ? 'chapter' : 'root'
    const chapterCard = level === 'chapter' ? cards.filter(function (c) { return cardKey(c) === here.key })[0] : null

    const scope = level === 'root'
      ? chaptersInOrder(cards, graph)
      : nodesOfChapter(cards, graph, here.key)

    const inScope = {}
    scope.forEach(function (c) { inScope[cardKey(c)] = true })

    const rects = {}
    scope.forEach(function (c) {
      const k = cardKey(c)
      const rec = nodeRec(graph, k)
      const p = level === 'root' ? { x: rec.x, y: rec.y } : { x: rec.cx, y: rec.cy }
      const s = sizeOf(c.type)
      rects[k] = { x: p.x === null ? 0 : p.x, y: p.y === null ? 0 : p.y, w: s.w, h: s.h, placed: p.x !== null && p.y !== null }
    })

    const placed = scope.filter(function (c) { return rects[cardKey(c)].placed })
    const unplaced = scope.filter(function (c) { return !rects[cardKey(c)].placed })

    const edges = graph.edges.filter(function (e) { return inScope[e.from] && inScope[e.to] })

    // ── 写回图谱 ───────────────────────────────────────────────────────────────
    function patchRec(key, fields) {
      const next = {
        version: 1,
        chapters: graph.chapters.slice(),
        nodes: Object.assign({}, graph.nodes),
        edges: graph.edges.slice(),
      }
      const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      next.nodes[key] = Object.assign({}, old, fields)
      props.onGraph(next)
    }

    function placeAt(key, x, y) {
      if (level === 'root') patchRec(key, { x: x, y: y })
      else {
        const next = {
          version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
        }
        const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        next.nodes[key] = Object.assign({}, old, { cx: x, cy: y, chapter: here.key })
        props.onGraph(next)
      }
    }

    function addEdge(from, to, choice) {
      if (!from || !to || from === to) return
      if (graph.edges.some(function (e) { return e.from === from && e.to === to && String(e.choice || '') === String(choice || '') })) return
      const next = {
        version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes),
        edges: graph.edges.concat([{ from: from, to: to, label: '', choice: choice || '' }]),
      }
      // 从某个选项的出口拉出去的连线，同时把「这一项通向哪」记进选项本身。
      // 不记的话，展开面板里永远显示「还没连到节点」，选项与节点就断成两截。
      if (choice) next.nodes[from] = bindChoice(next.nodes[from], choice, to)
      props.onGraph(next)
    }

    function removeEdge(from, to, choice) {
      const next = {
        version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes),
        edges: graph.edges.filter(function (e) {
          return !(e.from === from && e.to === to && String(e.choice || '') === String(choice || ''))
        }),
      }
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

    // ── 展开 / 收起 ────────────────────────────────────────────────────────────
    function openExpand(card) {
      const k = cardKey(card)
      const r = rects[k]
      if (!r) return
      const box = canvasBox()
      const s = view.s
      const tx = box.width / 2 - (r.x + r.w / 2) * s
      const ty = box.height / 2 - (r.y + r.h / 2) * s
      const from = { left: box.width / 2 - (r.w * s) / 2, top: box.height / 2 - (r.h * s) / 2, width: r.w * s, height: r.h * s }
      const to = { left: box.width / 2 - EXPAND_W / 2, top: box.height / 2 - EXPAND_H / 2, width: EXPAND_W, height: EXPAND_H }
      setSel(k)
      setView({ x: tx, y: ty, s: s })
      setExpand({ key: k, card: card, from: from, to: from, open: false })
      setTimeout(function () {
        setExpand(function (cur) {
          if (!cur || cur.key !== k) return cur
          return Object.assign({}, cur, { to: to, open: true })
        })
      }, 30)
    }

    function closeExpand() {
      setExpand(null)
    }

    // ── 交互：拖动卡片 ─────────────────────────────────────────────────────────
    function onCardDown(e, card) {
      if (e.button !== 0) return
      const k = cardKey(card)
      const r = rects[k]
      if (!r) return
      setSel(k)
      if (!r.placed) return
      const start = toCanvas(e.clientX, e.clientY)
      dragRef.current = { key: k, dx: start.x - r.x, dy: start.y - r.y, x: r.x, y: r.y, moved: false }
      setDrag({ key: k, x: r.x, y: r.y })
      if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId !== undefined) {
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
      }
    }

    // 拖动的位置只认 ref，不认 state。
    // 真实浏览器里 pointermove 之后 React 还没重渲染（setState 要等一个宏任务），
    // 而 pointerup 是紧接着派发的 —— 此时闭包里的 `drag` 还是松手前那一帧的值，
    // 于是卡片被写回原位，看起来就是「拖了没写」。ref 永远是刚算出来的那个坐标。
    function movePointers(e) {
      if (dragRef.current) {
        const d = dragRef.current
        const p = toCanvas(e.clientX, e.clientY)
        const x = Math.round(p.x - d.dx)
        const y = Math.round(p.y - d.dy)
        d.moved = true
        d.x = x
        d.y = y
        setDrag({ key: d.key, x: x, y: y })
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
    }

    function upPointers(e) {
      if (dragRef.current) {
        const d = dragRef.current
        dragRef.current = null
        if (d.moved) placeAt(d.key, d.x, d.y)
        setDrag(null)
        return
      }
      if (panRef.current) { panRef.current = null; setPanOn(false); return }
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

    React.useEffect(function () {
      function move(e) { movePointers(e) }
      function up(e) { upPointers(e) }
      function wheel(e) { onWheel(e) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      // 滚轮得自己挂，而且不能被当成 passive：React 是把 onWheel 注册成 passive 监听器的，
      // 里面调 preventDefault() 根本无效 —— 于是滚轮一边缩放，页面一边跟着滚/跟着缩放。
      const el = canvasRef.current
      if (el && typeof el.addEventListener === 'function') el.addEventListener('wheel', wheel, { passive: false })
      return function () {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (el && typeof el.removeEventListener === 'function') el.removeEventListener('wheel', wheel)
      }
    })

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
      // 空白处：左键（默认）/ 中键 / Alt+左键都拖画布。卡片上的按下不算 —— 那是拖卡片，
      // 事件会冒泡到这里来，得让开，不然一次拖动会被两条路同时接管。
      const blank = !keyUnder(e.target) && !expand
      if (e.button === 0 && blank) setSel(null)
      if (e.button === 1 || (e.button === 0 && blank)) {
        panRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, s: view.s }
        setPanOn(true)
        e.preventDefault()
      }
    }

    function onWheel(e) {
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
      setView({ x: px - ((px - view.x) / view.s) * s2, y: py - ((py - view.y) / view.s) * s2, s: s2 })
    }

    function startLink(e, card, choice) {
      const k = cardKey(card)
      const p = toCanvas(e.clientX, e.clientY)
      linkRef.current = { from: k, choice: choice || '', x: p.x, y: p.y }
      setLink(linkRef.current)
    }

    /** 这条橡皮筋是从哪个选项拉出来的（-1 = 从卡片本身的出口）。 */
    function choiceIndexOf(l) {
      if (!l || !l.choice) return -1
      const rec = nodeRec(graph, l.from)
      return (rec.choices || []).findIndex(function (ch) { return ch.id === l.choice })
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
    function autoArrange() {
      const keys = scope.map(cardKey)
      const sizes = {}
      scope.forEach(function (c) { sizes[cardKey(c)] = sizeOf(c.type) })
      const out = autoLayout(keys, function (k) { return sizes[k] }, edges)
      const next = {
        version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
      }
      for (const k of Object.keys(out)) {
        const old = next.nodes[k] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        next.nodes[k] = level === 'root'
          ? Object.assign({}, old, { x: out[k].x, y: out[k].y })
          : Object.assign({}, old, { cx: out[k].x, cy: out[k].y, chapter: here.key })
      }
      props.onGraph(next)
      setView({ x: 24, y: 20, s: view.s })
    }

    function clearCanvas() {
      const next = {
        version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
      }
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
      const s = sizeOf(card.type)
      const rectList = Object.keys(rects).filter(function (k) { return rects[k].placed }).map(function (k) { return rects[k] })
      const spot = autoSpot(rectList, s.w, s.h)
      placeAt(key, spot.x, spot.y)
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
        const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : ''
        if (tag === 'input' || tag === 'textarea') return
        const cur = sel ? scope.filter(function (c) { return cardKey(c) === sel })[0] : null
        if (matchKey(e, 'mod+c') && cur) { e.preventDefault(); copyCard(cur, false); return }
        if (matchKey(e, 'mod+x') && cur) { e.preventDefault(); copyCard(cur, true); removeFromCanvas(cur); return }
        if (matchKey(e, 'mod+v')) { e.preventDefault(); pasteAt(null); return }
        if (matchKey(e, 'mod+d') && cur) { e.preventDefault(); props.onDuplicate(cur); return }
        if (matchKey(e, 'space') && cur) { e.preventDefault(); if (expand && expand.key === sel) closeExpand(); else openExpand(cur); return }
        if (matchKey(e, 'delete') && cur) { e.preventDefault(); removeFromCanvas(cur); return }
        if (matchKey(e, 'mod+0')) { e.preventDefault(); setView({ x: 24, y: 20, s: 1 }); return }
        if (matchKey(e, 'mod+1')) { e.preventDefault(); setView({ x: view.x, y: view.y, s: 1 }); return }
        if (matchKey(e, 'esc')) { if (expand) closeExpand(); else setMenu(null); return }
        if (matchKey(e, 'mod+a')) { e.preventDefault(); return }
      }
      window.addEventListener('keydown', onKey)
      return function () { window.removeEventListener('keydown', onKey) }
    })

    function removeFromCanvas(card) {
      const k = cardKey(card)
      const next = {
        version: 1, chapters: graph.chapters.filter(function (x) { return x !== k }),
        nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
      }
      if (level === 'root') next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { x: null, y: null })
      else next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { cx: null, cy: null })
      next.edges = next.edges.filter(function (e) { return e.from !== k && e.to !== k })
      props.onGraph(next)
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

    function menuItems(card) {
      const k = cardKey(card)
      const rec = nodeRec(graph, k)
      const items = []
      items.push({ key: 'exp', label: (expand && expand.key === k) ? '收起' : '展开', hint: shortcutHint('展开'), onPick: function () { if (expand && expand.key === k) closeExpand(); else openExpand(card) } })
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

    const menuPoint = React.useRef({ x: 40, y: 40 })

    function onCanvasMenu(e) {
      e.preventDefault()
      if (e.target !== e.currentTarget && !(e.target.classList && e.target.classList.contains('sc-stage'))) {
        // 点在卡片上时由卡片的 onContextMenu 处理
      }
      const p = toCanvas(e.clientX, e.clientY)
      menuPoint.current = { x: Math.round(p.x), y: Math.round(p.y) }
      setMenu({ x: e.clientX, y: e.clientY, card: null })
    }

    function onCardMenu(e, card) {
      setSel(cardKey(card))
      setMenu({ x: e.clientX, y: e.clientY, card: card })
    }

    useDismiss(function () { setMenu(null) }, !!menu)

    // ── 渲染 ───────────────────────────────────────────────────────────────────
    const stageStyle = {
      // 取整：层原点落在整数像素上，文字才是像素对齐的（小数偏移会让整块画布发虚）。
      transform: 'translate(' + Math.round(view.x) + 'px,' + Math.round(view.y) + 'px) scale(' + view.s + ')',
    }
    // 只有「展开时把卡片飞到中央」需要过渡。平移/缩放要是也套 .28s 过渡，既跟不上手，
    // 又让浏览器一直拿旧位图做动画 —— 那是画布糊掉的另一半原因。
    if (!expand || drag) stageStyle.transition = 'none'

    const edgeEls = []
    for (const e of edges) {
      const a = rects[e.from]
      const b = rects[e.to]
      if (!a || !b || !a.placed || !b.placed) continue
      const fromCard = scope.filter(function (c) { return cardKey(c) === e.from })[0]
      let ci = -1
      if (e.choice) {
        const rec = nodeRec(graph, e.from)
        ci = (rec.choices || []).findIndex(function (ch) { return ch.id === e.choice })
      }
      const pa = outPoint(a, ci)
      const pb = inPoint(b)
      const on = sel === e.from || sel === e.to
      const d = edgePath(pa, pb)
      edgeEls.push(React.createElement('g', { key: e.from + '->' + e.to + ':' + (e.choice || '') },
        React.createElement('path', { className: 'sc-edgehit', d: d, 'data-edge': e.from + '->' + e.to, onContextMenu: function (ev) { ev.preventDefault(); ev.stopPropagation(); removeEdge(e.from, e.to, e.choice) }, title: '右键删除这条连线' }),
        React.createElement('path', { className: 'sc-edge' + (on ? ' on' : ''), d: d, markerEnd: 'url(#sc-arrow' + (on ? '-on' : '') + ')' })
      ))
      const mid = edgeMid(pa, pb)
      edgeEls.push(React.createElement('div', {
        key: 'lbl' + e.from + e.to + (e.choice || ''),
        className: 'sc-elabel' + (on ? ' on' : '') + (e.label ? '' : ' empty'),
        style: { left: mid.x, top: mid.y },
        onClick: function () { props.onRenameEdge(e) },
      }, e.label || '连线'))
    }

    const cardEls = scope.map(function (c) {
      const k = cardKey(c)
      const r = rects[k]
      if (!r.placed) return null
      const shown = drag && drag.key === k ? { x: drag.x, y: drag.y, w: r.w, h: r.h } : r
      const rec = nodeRec(graph, k)
      const isExpanding = expand && expand.key === k
      return React.createElement(CardView, {
        key: k, card: c, rec: rec, rect: shown, cardKey: k,
        selected: sel === k,
        dimmed: !!expand && !isExpanding,
        expanded: !!isExpanding,
        childNodes: c.type === 'chapter' ? nodesOfChapter(cards, graph, k) : [],
        onOpenNode: function (n) { props.onOpenCard(n) },
        hotPort: !!link && link.from !== k,
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
      React.createElement('div', { className: 'sc-addr' }, crumb),
      React.createElement('span', { className: 'sc-boardtip' }, Math.round(view.s * 100) + '%')
    )

    const scrim = expand ? React.createElement('div', { className: 'sc-scrim' + (expand.open ? ' on' : '') }) : null

    const overlay = expand ? (function () {
      const c = expand.card
      const r = expand.to
      const k = expand.key
      const rec = nodeRec(graph, k)
      const accent = rec.color || c.color || ''
      const style = { left: r.left, top: r.top, width: r.width, height: r.height }
      if (accent) style['--sc-accent'] = accent
      return React.createElement('div', { className: 'sc-expand' + (expand.open ? ' open' : ''), style: style },
        React.createElement('div', { className: 'sc-expandh' },
          React.createElement('h3', null, cardDisplay(c) || c.file),
          React.createElement('span', { className: 'sc-tag' }, typeLabel(c.type)),
          React.createElement('button', { className: 'sc-expandx', title: '收起', onClick: closeExpand }, '×')
        ),
        React.createElement('div', { className: 'sc-expandbody' },
          React.createElement('div', { className: 'sc-meta' },
            c.when && c.type !== 'chapter' ? React.createElement('span', null, '时间：' + c.when) : null,
            React.createElement('span', null, '文件：' + c.file)
          ),
          TagRow({ tags: c.tags }),
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
      )
    })() : null

    const dockTitle = level === 'root' ? '章节堆叠' : '本章节待放置'

    return React.createElement('div', { className: 'sc-board' },
      nav,
      React.createElement('div', {
        className: 'sc-canvas' + (panOn ? ' panning' : ''), ref: canvasRef,
        onPointerDown: onCanvasDown, onContextMenu: onCanvasMenu,
      },
        React.createElement('div', { className: 'sc-stage' + (expand && expand.open ? ' blur' : ''), style: stageStyle },
          React.createElement('div', { className: 'sc-dots' }),
          React.createElement('svg', { className: 'sc-edges', width: 8000, height: 8000 },
            React.createElement('defs', null,
              React.createElement('marker', { id: 'sc-arrow', markerWidth: 9, markerHeight: 9, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' },
                React.createElement('path', { d: 'M0,0 L0,6 L7,3 z', className: 'sc-arrowhead' })),
              React.createElement('marker', { id: 'sc-arrow-on', markerWidth: 9, markerHeight: 9, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' },
                React.createElement('path', { d: 'M0,0 L0,6 L7,3 z', className: 'sc-arrowhead-on' }))
            ),
            edgeEls
          ),
          link ? React.createElement('svg', { className: 'sc-edges', width: 8000, height: 8000 },
            React.createElement('path', {
              className: 'sc-edge temp',
              // 从「你拉的那一项」自己的出口起笔，而不是卡片右侧正中：分歧节点上选项有
              // 好几个，起点错了整条橡皮筋就是歪的。
              d: edgePath(outPoint(rects[link.from] || { x: 0, y: 0, w: 0, h: 0 }, choiceIndexOf(link)), { x: link.x, y: link.y }),
            })
          ) : null,
          cardEls
        ),
        scrim,
        overlay,
        ghost ? React.createElement('div', {
          className: 'sc-ghost',
          style: { left: ghost.x - 70, top: ghost.y - 30, width: 140, height: 60, position: 'fixed' },
        }, React.createElement('div', { className: 'sc-dockcardtitle' }, cardDisplay(ghost.card))) : null
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
      menu ? (menu.card
        ? MenuList({
          x: menu.x, y: menu.y, items: menuItems(menu.card),
          color: nodeRec(graph, cardKey(menu.card)).color || menu.card.color || '',
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          onColor: function (v) { patchRec(cardKey(menu.card), { color: v }); setMenu(null) },
          onClose: function () { setMenu(null) },
        })
        : MenuList({
          x: menu.x, y: menu.y, items: emptyMenuItems(),
          color: '',
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          onColor: function () {},
          onClose: function () { setMenu(null) },
        })) : null
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
        React.createElement('div', { className: 'sc-modalb' }, props.children),
        props.footer ? React.createElement('div', { className: 'sc-modalf' }, props.footer) : null
      )
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

    return Modal({
      title: '编辑 ' + typeLabel(card.type) + ' · ' + card.file,
      width: 620, onClose: props.onClose,
      footer: [
        React.createElement('button', { key: 'd', className: 'sc-btn sc-btn-warn', onClick: function () { props.onDelete(card) } }, '删除卡片文件'),
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
        React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', disabled: busy, onClick: save }, busy ? '保存中…' : '保存（写回卡片文件）'),
      ],
      children: [
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
      ],
    })
  }

  function PromptDialog(props) {
    const [value, setValue] = React.useState(props.value || '')
    return Modal({
      title: props.title,
      width: 380, onClose: props.onClose,
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
      width: 420, onClose: props.onClose,
      footer: [
        React.createElement('span', { key: 's', className: 'sc-spacer' }),
        React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
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
      width: 520, onClose: props.onClose,
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
      width: 460, onClose: props.onClose,
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
            onChange: function (e) { setDraft(e.target.value) },
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
      width: 480, onClose: props.onClose,
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
          Field({ key: 'su', label: '归档子目录', children: React.createElement('input', { className: 'sc-inp', value: dirs.sub, onChange: function (e) { upd('sub', e.target.value) } }) })
        ),
        React.createElement('div', { key: 'h', className: 'sc-hintbox' },
          '只能是单层目录名（不能带斜杠）。默认是 剧本档案 / 卡片 / 归档，与 cards.py 一致。' +
          '落盘桥的边界由「档案总目录」决定：所有读写都必须落在它里面。')
      ],
    })
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
    }, [cwd, dirs.archive, dirs.cards, dirs.sub])

    function refresh() { if (cwd) load(cwd, true) }

    function setViewAndSave(v) {
      setView(v)
      saveUi(Object.assign({}, ui, { view: v }))
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
      setDialog({
        kind: 'confirm', title: '删除卡片文件？',
        text: '会真的删掉 ' + dirs.archive + '/' + (card.kind === 'archive' ? dirs.sub : dirs.cards) + '/' + card.file + '。删掉之后画布上对应的记录也会一起清掉。',
        okLabel: '删除',
        onOk: function () {
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
            pushNotice({ text: '已删除 ' + card.file, kind: 'info' })
          }).catch(function (e) { pushNotice('删除失败：' + msgOf(e)) })
        },
      })
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
        detailOpen: !!selected, detailCard: selected, detailBody: selected && selected.body, detailLoading: false,
      })
    } else {
      screen = React.createElement(BoardView, {
        cards: branchCards, graph: graph, ui: ui, narrow: narrow,
        swatches: swatchesOf(ui), onEditSwatches: function () { setDialog({ kind: 'swatches' }) },
        clipboard: clipboard, onClipboard: setClipboard,
        onGraph: saveGraph,
        onRefresh: refresh,
        onNotice: pushNotice,
        onOpenCard: function (c) { setSel(cardKey(c)); setDialog({ kind: 'edit', card: c }) },
        onEditCard: function (c) { setDialog({ kind: 'edit', card: c }) },
        onDeleteCard: deleteCard,
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
        onRenameEdge: function (e) {
          setDialog({
            kind: 'prompt', title: '连线名称', value: e.label || '', okLabel: '保存',
            onOk: function (v) {
              const next = {
                version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes),
                edges: graph.edges.map(function (x) {
                  return (x.from === e.from && x.to === e.to && String(x.choice || '') === String(e.choice || ''))
                    ? Object.assign({}, x, { label: v }) : x
                }),
              }
              saveGraph(next)
              setDialog(null)
            },
          })
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
