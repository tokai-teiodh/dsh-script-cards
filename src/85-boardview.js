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
  const [expand, setExpand] = React.useState(null)
  const [drag, setDrag] = React.useState(null)
  const [ghost, setGhost] = React.useState(null)
  const [panOn, setPanOn] = React.useState(false)
  const [fav, setFav] = React.useState(readFav)
  // 框选（只在画布上生效）：右键拖出一个框，框里的卡片一起选中，方便批量操作。
  // multi = 被框中的卡片键；marquee = 拖动中那个框（画布坐标）。
  const [multi, setMulti] = React.useState([])
  const [marquee, setMarquee] = React.useState(null)

  const canvasRef = React.useRef(null)
  const clipRef = React.useRef(null)
  const dragRef = React.useRef(null)
  const linkRef = React.useRef(null)
  const marqueeRef = React.useRef(null)
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
    closeExpand()
  }
  function back() { if (hi > 0) { setHi(hi - 1); setSel(null); setMulti([]); closeExpand() } }
  function fwd() { if (hi < hist.length - 1) { setHi(hi + 1); setSel(null); setMulti([]); closeExpand() } }
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
    patchMany([key], fields)
  }

  /** 一次给多张卡片写同一个字段（批量染色走它）。同 placeMany：只写一次图谱。 */
  function patchMany(keys, fields) {
    if (!keys || !keys.length) return
    const next = {
      version: 1,
      chapters: graph.chapters.slice(),
      nodes: Object.assign({}, graph.nodes),
      edges: graph.edges.slice(),
    }
    for (const key of keys) {
      const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      next.nodes[key] = Object.assign({}, old, fields)
    }
    props.onGraph(next)
  }

  function placeAt(key, x, y) {
    placeMany([{ key: key, x: x, y: y }])
  }

  /**
   * 一次写回多张卡片的位置。**不能**逐张调 placeAt：每次都从这份还没更新的 graph 起算，
   * 后一次会把前一次的位置覆盖掉 —— 整组拖动时看起来只有最后一张动了。
   */
  function placeMany(list) {
    if (!list || !list.length) return
    const next = {
      version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
    }
    for (const it of list) {
      const old = next.nodes[it.key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      next.nodes[it.key] = level === 'root'
        ? Object.assign({}, old, { x: it.x, y: it.y })
        : Object.assign({}, old, { cx: it.x, cy: it.y, chapter: here.key })
    }
    props.onGraph(next)
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
    const next = {
      version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes),
      edges: kept.concat([{ from: from, to: to, label: '', choice: cid }]),
    }
    // 从某个选项的出口拉出去的连线，同时把「这一项通向哪」记进选项本身。
    // 不记的话，展开面板里永远显示「还没连到节点」，选项与节点就断成两截。
    if (cid) next.nodes[from] = bindChoice(next.nodes[from], cid, to)
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
    // 取整：画的时候 .sc-stage 的 translate 本来就要 round 到整像素，state 里留着小数的话，
    // 「按 state 算出来的坐标」和「屏幕上真正画的位置」会差最多半个像素 —— 命中测试、
    // 连线起笔点、几何断言全都会被这半个像素咬到。
    const tx = Math.round(box.width / 2 - (r.x + r.w / 2) * s)
    const ty = Math.round(box.height / 2 - (r.y + r.h / 2) * s)
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
  }

  function upPointers(e) {
    if (marqueeRef.current) {
      const m = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (!m.moved) return
      justMarqueed.current = true
      const box = { x: Math.min(m.ox, m.x), y: Math.min(m.oy, m.y), w: Math.abs(m.x - m.ox), h: Math.abs(m.y - m.oy) }
      const hit = []
      scope.forEach(function (c) {
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
    // 空白处：左键（默认）/ 中键 / Alt+左键都拖画布。卡片上的按下不算 —— 那是拖卡片，
    // 事件会冒泡到这里来，得让开，不然一次拖动会被两条路同时接管。
    // 连线标签和连线本身也算「不是空白」：点标签是改名字，不是取消选中 + 拖画布。
    const onEdge = !!(e.target && typeof e.target.getAttribute === 'function' && e.target.getAttribute('data-edge'))
    const blank = !keyUnder(e.target) && !onEdge && !expand
    // 右键拖 = 框选多张（画布上才有；展开卡片时不介入）。
    // 右键**没有**拖动的那一下仍然照旧弹菜单。
    if (e.button === 2 && !expand) {
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
    // 展开的卡片是一页可以上下滚的内容：指针落在它里面时滚轮归它 —— 既不缩放画布，
    // 也不能 preventDefault（拦下默认行为它就滚不动了）。用户的要求：
    // 「点进去卡片之后，滚轮直接接管卡片页面的上滑下滑，不要去管桌布的缩放」。
    const t = e && e.target
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
  function autoArrange() {
    const keys = scope.map(cardKey)
    const slots = {}
    scope.forEach(function (c) { slots[cardKey(c)] = slotOf(c, nodeRec(graph, cardKey(c))) })
    const out = autoLayout(keys, function (k) { return slots[k] }, edges)
    const next = {
      version: 1, chapters: graph.chapters.slice(), nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
    }
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
      if (matchKey(e, 'space') && cur) { e.preventDefault(); if (expand && expand.key === sel) closeExpand(); else openExpand(cur); return }
      if (matchKey(e, 'delete') && cur) {
        e.preventDefault()
        // 框选了一组就整组移出画布（文件不动），否则只动当前这张
        if (multi.length > 1) removeManyFromCanvas(multi)
        else removeFromCanvas(cur)
        return
      }
      if (matchKey(e, 'mod+0')) { e.preventDefault(); setView({ x: 24, y: 20, s: 1 }); return }
      if (matchKey(e, 'mod+1')) { e.preventDefault(); setView({ x: view.x, y: view.y, s: 1 }); return }
      if (matchKey(e, 'esc')) { if (expand) closeExpand(); else { setMenu(null); setMulti([]) } return }
      if (matchKey(e, 'mod+a')) { e.preventDefault(); setMulti(placed.map(cardKey)); return }
    }
    window.addEventListener('keydown', onKey)
    return function () { window.removeEventListener('keydown', onKey) }
  })

  function removeFromCanvas(card) {
    removeManyFromCanvas([cardKey(card)])
  }

  /** 一次把多张卡片移出画布（文件不动）。同 placeMany：只写一次图谱。 */
  function removeManyFromCanvas(keys) {
    if (!keys || !keys.length) return
    const set = {}
    keys.forEach(function (k) { set[k] = true })
    const next = {
      version: 1, chapters: graph.chapters.filter(function (x) { return !set[x] }),
      nodes: Object.assign({}, graph.nodes), edges: graph.edges.slice(),
    }
    for (const k of keys) {
      if (level === 'root') next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { x: null, y: null })
      else next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { cx: null, cy: null })
    }
    next.edges = next.edges.filter(function (e) { return !set[e.from] && !set[e.to] })
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

  // 框选出一组之后的批量菜单：只做「一次操作多张」的事，单张编辑留给卡片自己的菜单。
  function batchMenuItems(keys) {
    const n = keys.length
    return [
      { head: '已选 ' + n + ' 张（右键拖框选）' },
      { key: 'out', label: '移出画布', hint: 'Delete', onPick: function () { removeManyFromCanvas(keys) } },
      { sep: true },
      { head: '染色' },
      { key: 'color', colors: true },
      { sep: true },
      { key: 'selectall', label: '选中这一层全部', onPick: function () { setMulti(placed.map(cardKey)) } },
      { key: 'del', label: '删除这 ' + n + ' 张卡片文件…', danger: true, onPick: function () { props.onDeleteCards(keys) } },
      { key: 'clr', label: '取消选择', onPick: function () { setMulti([]); setSel(null) } },
    ]
  }

  const menuPoint = React.useRef({ x: 40, y: 40 })

  function onCanvasMenu(e) {
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
  const stageStyle = {
    // 取整：层原点落在整数像素上，文字才是像素对齐的（小数偏移会让整块画布发虚）。
    transform: 'translate(' + Math.round(view.x) + 'px,' + Math.round(view.y) + 'px) scale(' + view.s + ')',
  }
  // 只有「展开时把卡片飞到中央」需要过渡。平移/缩放要是也套 .28s 过渡，既跟不上手，
  // 又让浏览器一直拿旧位图做动画 —— 那是画布糊掉的另一半原因。
  if (!expand || drag) stageStyle.transition = 'none'

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
    const isExpanding = expand && expand.key === k
    return React.createElement(CardView, {
      key: k, card: c, rec: rec, rect: shown, cardKey: k,
      selected: sel === k || multi.indexOf(k) !== -1,
      dimmed: !!expand && !isExpanding,
      expanded: !!isExpanding,
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
        // 框选的框：画布坐标，跟着画布一起缩放；只画个虚线框，不挡任何点击
        marquee ? React.createElement('div', {
          className: 'sc-marquee',
          style: { left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h },
        }) : null
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
        onColor: function (v) { patchMany(menu.batch, { color: v }); setMenu(null) },
        onClose: function () { setMenu(null) },
      })
      : (menu.card
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
        }))) : null
  )
}
