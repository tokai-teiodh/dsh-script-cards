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
