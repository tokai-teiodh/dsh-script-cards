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
  // 分组（用户拍板：**逻辑**分组，不是视觉框）：在编为一组的卡片附近悬停时底下浮出一层
  // 淡背景，这时候右键那块空白处唤起整组菜单；点卡片本身仍然只走单卡逻辑。
  // hoverGroup 存组的 id（没悬停 = null）；hoverGroupRef 是它的镜像，避免每动一下鼠标
  // 都 setState 一次。
  const [hoverGroup, setHoverGroup] = React.useState(null)
  const hoverGroupRef = React.useRef(null)
  // 画布上的独立对象（文本框 / 矩形方框）：拖动 / 缩放中的那一份几何（渲染用它，松手才落盘）
  const [objDrag, setObjDrag] = React.useState(null)
  const objDragRef = React.useRef(null)
  // 正在就地编辑的文本框：{ id, value }
  const [objEdit, setObjEdit] = React.useState(null)
  // 正在拖手柄改大小的卡片：{ key, rect:{w,h} }（渲染用它，松手才落盘）
  const [cardResize, setCardResize] = React.useState(null)
  const cardResizeRef = React.useRef(null)
  // 拖动时的对齐辅助线：{ v: [x...], h: [y...] }（只在按住拖动那一瞬间出现）
  const [guides, setGuides] = React.useState(null)
  // 吸附范围（画布单位）：比这更远就不吸，免得手感变粘
  const SNAP = 6
  // 缩略图的几何常量（都是**屏幕像素**，不是画布单位）：
  //   MINI_PAD     四周留白
  //   MINI_TILE_H  牌子的目标高度 —— 两行 10px 标题（行高 1.25）刚好装下的那一档
  //   MINI_S_*     内容缩进一屏的比例上下限（太大就没有「缩略」的意思，太小就看不清相对位置）
  // 牌子宽度**不写死**：按卡片自己的长宽比算（改过宽高的卡片照它的比例来），
  // 只在两头夹住，免得细长卡拉成一条线、或者撑破一屏。
  const MINI_PAD = 16
  const MINI_TILE_H = 34
  const MINI_TILE_H_MIN = 24
  const MINI_TILE_H_MAX = 42
  const MINI_TILE_W_MIN = 34
  const MINI_TILE_W_MAX = 160
  const MINI_S_MAX = 0.55
  const MINI_S_MIN = 0.05
  // 存档卡抽屉：开合 + 筛选词
  const [drawer, setDrawer] = React.useState(false)
  const [drawerQ, setDrawerQ] = React.useState('')
  const drawerRef = React.useRef(null)
  // 缩略图（用户 2026-10-02 要的：「右下角加一个缩略图按钮，按下之后所有卡片相对位置不变，
  // 但是只显示标题（分为两行），同时相对距离随之缩小」）：整块画布换成一层小牌子。
  const [mini, setMini] = React.useState(false)

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
    // 正在拖手柄改大小那张卡：按它当前的尺寸画（松手才写回图谱）
    if (cardResize && cardResize.key === k) {
      return { x: r.x, y: r.y, w: cardResize.rect.w, h: cardResize.rect.h, placed: r.placed }
    }
    // 正在拖 / 缩放的那个独立对象：按它当前的几何画（松手才写回图谱）
    if (objDrag && isObjKey(k) && objDrag.id === objIdOf(k)) {
      return { x: objDrag.rect.x, y: objDrag.rect.y, w: objDrag.rect.w, h: objDrag.rect.h, placed: true }
    }
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
    // 换一层画布就别留在缩略图里：缩略图看的是**当前这一层**的摆法
    setMini(false)
    closeLoose()
  }
  function back() { if (hi > 0) { setHi(hi - 1); setSel(null); setMulti([]); setMini(false); closeLoose() } }
  function fwd() { if (hi < hist.length - 1) { setHi(hi + 1); setSel(null); setMulti([]); setMini(false); closeLoose() } }
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

  // 画布上的独立对象（文本框 / 矩形方框）：跟引用卡同一套 ctx（哪块画布），
  // 但**不是卡片** —— 没有文件、不连线、不参与自动排列。
  const objRecs = objectsOf(graph, ctx)
  const objIds = Object.keys(objRecs)
  // 分组：只记成员（用户拍板：逻辑分组，不画框）
  const groups = groupsOf(graph, ctx)
  const GROUP_PAD = 12

  const rects = {}
  scope.forEach(function (c) {
    const k = cardKey(c)
    const rec = nodeRec(graph, k)
    const p = level === 'root' ? { x: rec.x, y: rec.y } : { x: rec.cx, y: rec.cy }
    // 每张卡片可以有自己的宽高（图谱里的 rec.w / rec.h），没记就用这一档的默认尺寸
    const s = cardSizeOf(c, rec)
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
  // 独立对象也进 rects：拖动 / 框选 / 编组 / 整组拖动都按「键 → 矩形」干活。
  objIds.forEach(function (id) {
    const rec = objRecs[id]
    rects[objKey(id)] = { x: rec.x, y: rec.y, w: rec.w, h: rec.h, placed: true, obj: true }
  })

  const placed = scope.filter(function (c) { return rects[cardKey(c)].placed })
  const unplaced = scope.filter(function (c) { return !rects[cardKey(c)].placed })

  /** 这一层所有能被选中 / 框选 / 整组操作的东西：卡片 + 引用卡 + 独立对象。 */
  function selectableKeys() {
    return placed.map(cardKey).concat(refCards.map(cardKey)).concat(objIds.map(objKey))
  }

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
    let objects = null
    for (const key of keys) {
      // 独立对象：只改 objects[ctx] 里那一条（染色 / 改文字都走它）
      if (isObjKey(key)) {
        const id = objIdOf(key)
        const old = objRecs[id]
        if (!old) continue
        objects = patchObjects(objects ? { objects: objects } : graph, ctx, id, Object.assign({}, old, fields))
        continue
      }
      // 引用卡：染色写进 refs[ctx][key].color，**不碰 nodes**
      if (refRecs[key]) {
        refs = patchRefs(refs ? { refs: refs } : graph, ctx, key, Object.assign({ x: refRecs[key].x, y: refRecs[key].y }, fields))
        continue
      }
      const old = next.nodes[key] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
      next.nodes[key] = Object.assign({}, old, fields)
    }
    if (refs) next.refs = refs
    if (objects) next.objects = objects
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
    let objects = null
    for (const it of list) {
      // 独立对象：只把 x/y 写回 objects[ctx]
      if (isObjKey(it.key)) {
        const id = objIdOf(it.key)
        const old = objRecs[id]
        if (!old) continue
        objects = patchObjects(objects ? { objects: objects } : graph, ctx, id, Object.assign({}, old, { x: it.x, y: it.y }))
        continue
      }
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
    if (objects) next.objects = objects
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

  // ── 画布上的独立对象（文本框 / 矩形方框） ──────────────────────────────────
  //
  // 用户拍板：「两个都是独立对象，而且并不互相绑定」—— 都在右键空白处的菜单里建。
  // 它们不是卡片：没有文件、不改档案目录、不连线、也不参与自动排列；位置和属性只写
  // 分支.json 的 objects[ctx]。拖 / 缩放 / 染色 / 框选 / 编组跟卡片共用同一套手势。
  function addObject(kind) {
    const id = uid('ob')
    const def = OBJ_DEFAULT[kind] || OBJ_DEFAULT.text
    const at = menuPoint.current || { x: 40, y: 40 }
    const rec = { kind: kind, x: Math.round(at.x), y: Math.round(at.y), w: def.w, h: def.h }
    if (kind === OBJ_TEXT) rec.text = ''
    // 方框一出来就得有底色 —— 「只可以改颜色」的东西不能先是透明的
    if (kind === OBJ_RECT) rec.color = (props.swatches && props.swatches[0]) || DEFAULT_SWATCHES[0]
    props.onGraph(graphWith(graph, { objects: patchObjects(graph, ctx, id, rec) }))
    setSel(objKey(id))
    setMulti([])
    // 文本框建完直接进编辑态：不然还得再双击一下才知道这里能写字
    if (kind === OBJ_TEXT) setObjEdit({ id: id, value: '' })
    props.onNotice({
      text: '已新建' + objKindLabel(kind)
        + (kind === OBJ_RECT ? '（右键它改颜色、拉右下角改大小）' : '（双击改字，右键改颜色）'),
      kind: 'info',
    })
  }

  /** 独立对象的几何（拖动 / 缩放松手时写回图谱）。 */
  function patchObjRect(id, rect) {
    const old = objRecs[id]
    if (!old) return
    const rec = Object.assign({}, old, {
      x: Math.round(rect.x), y: Math.round(rect.y),
      w: Math.max(OBJ_MIN_W, Math.round(rect.w)), h: Math.max(OBJ_MIN_H, Math.round(rect.h)),
    })
    props.onGraph(graphWith(graph, { objects: patchObjects(graph, ctx, id, rec) }))
  }

  /** 删掉几个独立对象（没有文件，删了就没了），顺带把散架的组收干净。 */
  function dropObjs(ids) {
    if (!ids || !ids.length) return
    const gone = {}
    let objects = graph.objects
    for (const id of ids) {
      gone[objKey(id)] = true
      objects = patchObjects({ objects: objects }, ctx, id, null)
    }
    props.onGraph(graphWith(graph, { objects: objects, groups: patchGroups(graph, ctx, cleanGroups(groups, gone)) }))
    setMulti([])
    setSel(null)
  }

  /** 原地复制一个独立对象（往右下挪 24，别压在原件上）。 */
  function copyObj(id) {
    const old = objRecs[id]
    if (!old) return
    const nid = uid('ob')
    props.onGraph(graphWith(graph, {
      objects: patchObjects(graph, ctx, nid, Object.assign({}, old, { x: old.x + 24, y: old.y + 24 })),
    }))
    setSel(objKey(nid))
    props.onNotice({ text: '已复制一个' + objKindLabel(old.kind), kind: 'info' })
  }

  function objMenuItems(id) {
    const rec = objRecs[id] || {}
    const items = [{ head: objKindLabel(rec.kind) }]
    if (rec.kind === OBJ_TEXT) {
      items.push({ key: 'ed', label: '编辑文字', onPick: function () { setObjEdit({ id: id, value: String(rec.text || '') }) } })
    }
    items.push({ head: '颜色' })
    items.push({ key: 'color', colors: true })
    items.push({ sep: true })
    items.push({ key: 'dup', label: '复制一个', onPick: function () { copyObj(id) } })
    items.push({
      key: 'del', label: '删除这个' + objKindLabel(rec.kind), danger: true,
      onPick: function () { dropObjs([id]) },
    })
    return items
  }

  function onObjDown(e, id) {
    if (e.button !== 0) return
    const k = objKey(id)
    const rec = objRecs[id]
    if (!rec) return
    if (multi.length && multi.indexOf(k) === -1) setMulti([])
    setSel(k)
    const p = toCanvas(e.clientX, e.clientY)
    objDragRef.current = {
      id: id, mode: 'move', ox: p.x, oy: p.y, rx: rec.x, ry: rec.y, rw: rec.w, rh: rec.h,
      moved: false, cur: { x: rec.x, y: rec.y, w: rec.w, h: rec.h },
    }
    if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
    }
  }

  function onObjGripDown(e, id) {
    if (e.button !== 0) return
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    const rec = objRecs[id]
    if (!rec) return
    setSel(objKey(id))
    const p = toCanvas(e.clientX, e.clientY)
    objDragRef.current = {
      id: id, mode: 'resize', ox: p.x, oy: p.y, rx: rec.x, ry: rec.y, rw: rec.w, rh: rec.h,
      moved: false, cur: { x: rec.x, y: rec.y, w: rec.w, h: rec.h },
    }
  }

  function onObjMenu(e, id) {
    setEdgeMenu(null)
    if (justMarqueed.current) { justMarqueed.current = false; return }
    // 跟卡片同一条规矩：shift+右键＝切换选中，不弹菜单
    if (e && e.shiftKey) { toggleMulti(objKey(id)); return }
    setSel(objKey(id))
    setMulti([])
    setMenu({ x: e.clientX, y: e.clientY, obj: id })
  }

  /** 双击文本框＝就地编辑（矩形方框没有内容，双击什么都不做）。 */
  function onObjDouble(id) {
    const rec = objRecs[id]
    if (!rec || rec.kind !== OBJ_TEXT) return
    setObjEdit({ id: id, value: String(rec.text || '') })
  }

  function commitObjEdit() {    if (!objEdit) return
    const cur = objEdit
    setObjEdit(null)
    const rec = objRecs[cur.id]
    if (!rec) return
    if (String(rec.text || '') === String(cur.value)) return
    patchMany([objKey(cur.id)], { text: cur.value })
  }

  // ── 分组（逻辑组） ─────────────────────────────────────────────────────────
  //
  // 用户拍板：组是**逻辑**的 —— 「在编为一组的卡片附近悬停时，底下会出现一层淡淡的
  // 背景，这个时候右键空白画布就可唤起整组，如果点击的是卡片本身，那就只进行卡片的
  // 逻辑」。所以组只记成员，不画框。
  /** 摘掉 gone 里的成员；剩不到两个的组自动散掉（跟落盘时的归一化规则一致）。 */
  function cleanGroups(list, gone) {
    const out = []
    for (const g of list || []) {
      const keys = g.keys.filter(function (k) { return !(gone && gone[k]) })
      if (keys.length >= 2) out.push({ id: g.id, keys: keys })
    }
    return out
  }

  function writeGroups(list) {
    props.onGraph(graphWith(graph, { groups: patchGroups(graph, ctx, list) }))
  }

  function makeGroup(keys) {
    if (!keys || keys.length < 2) return
    const inNew = {}
    keys.forEach(function (k) { inNew[k] = true })
    // 一个键只在一个组里：已经被别的组收走的先摘出来
    writeGroups(cleanGroups(groups, inNew).concat([{ id: uid('g'), keys: keys.slice() }]))
    setMulti(keys.slice())
    props.onNotice({
      text: '已编成一组（' + keys.length + ' 个）：拖动组里任何一个＝整组走，右键组里的空白处出整组菜单',
      kind: 'info',
    })
  }

  function ungroup(gid) {
    writeGroups(groups.filter(function (g) { return g.id !== gid }))
    props.onNotice({ text: '已取消编组（成员都还在画布上）', kind: 'info' })
  }

  function groupBoxLive(keys) {
    const live = {}
    for (const k of keys || []) {
      const r = liveRect(k) || rects[k]
      if (r && r.placed) live[k] = r
    }
    return groupBox(live, keys)
  }

  /** 指针底下是哪个组：命中的组里取包围盒最小的那个（重叠时算最里层）。 */
  function groupAt(p) {
    let best = null
    for (const g of groups) {
      const box = groupBoxLive(g.keys)
      if (!box) continue
      if (p.x < box.x - GROUP_PAD || p.x > box.x + box.w + GROUP_PAD) continue
      if (p.y < box.y - GROUP_PAD || p.y > box.y + box.h + GROUP_PAD) continue
      const area = box.w * box.h
      if (!best || area < best.area) best = { g: g, area: area }
    }
    return best ? best.g : null
  }

  /** 整组染色：成员各写各的色（引用卡写 refs，对象写 objects，卡片写 nodes）。 */
  function groupColor(gid, v) {
    const g = groups.filter(function (x) { return x.id === gid })[0]
    if (g) patchMany(g.keys, { color: v })
  }

  function groupMenuItems(gid) {
    const g = groups.filter(function (x) { return x.id === gid })[0]
    if (!g) return emptyMenuItems()
    const keys = g.keys.slice()
    const objSel = keys.filter(function (k) { return isObjKey(k) })
    const nativeSel = keys.filter(function (k) { return !isObjKey(k) && !refRecs[k] })
    const items = [
      { head: '这一组 ' + keys.length + ' 个（拖动其中任何一个＝整组走）' },
      { key: 'sel', label: '选中这一组', onPick: function () { setMulti(keys) } },
      { sep: true },
      { head: '染色' },
      { key: 'color', colors: true },
      { sep: true },
      { key: 'cp', label: '整组复制一份', onPick: function () { copyGroup(gid) } },
      { key: 'out', label: '整组移出画布', hint: 'Delete', onPick: function () { removeManyFromCanvas(keys) } },
    ]
    if (nativeSel.length) {
      items.push({
        key: 'del', label: '删除这 ' + nativeSel.length + ' 张卡片文件…', danger: true,
        onPick: function () { props.onDeleteCards(nativeSel) },
      })
    }
    if (objSel.length) {
      items.push({
        key: 'delobj', label: '删除组里的 ' + objSel.length + ' 个对象', danger: true,
        onPick: function () { dropObjs(objSel.map(objIdOf)) },
      })
    }
    items.push({ sep: true })
    items.push({ key: 'ungroup', label: '取消编组', onPick: function () { ungroup(gid) } })
    return items
  }

  /**
   * 整组复制一份：独立对象原地复制一条记录、卡片走「原地复制一张」（新文件）。
   * 引用卡**没法复制** —— 同一张卡在这块画布上只有一条位置记录，复制没有意义，跳过。
   * 复制出来的成员自动编成新的一组，所以要等卡片复制完再写组（那条走面板，见 finishGroupCopy）。
   */
  function copyGroup(gid) {
    const g = groups.filter(function (x) { return x.id === gid })[0]
    if (!g) return
    const collected = []
    const pending = []
    let objects = null
    for (const k of g.keys) {
      if (isObjKey(k)) {
        const id = objIdOf(k)
        const old = objRecs[id]
        if (!old) continue
        const nid = uid('ob')
        objects = patchObjects(objects ? { objects: objects } : graph, ctx, nid, Object.assign({}, old, { x: old.x + 24, y: old.y + 24 }))
        collected.push(objKey(nid))
        continue
      }
      if (refRecs[k]) continue
      const card = cardAny[k]
      if (card) pending.push(card)
    }
    if (objects) props.onGraph(graphWith(graph, { objects: objects }))
    if (!pending.length) { finishGroupCopy(collected); return }
    let left = pending.length
    pending.forEach(function (card) {
      props.onDuplicate(card, function (entry) {
        if (entry) collected.push(cardKey(entry))
        left -= 1
        if (left === 0) finishGroupCopy(collected)
      })
    })
  }

  function finishGroupCopy(keys) {
    if (!keys || keys.length < 2) {
      props.onNotice({ text: '这一组里没有能复制的东西（引用卡不复制）', kind: 'error' })
      return
    }
    // 交给面板写：它手上的图谱是最新的（新复制出来的卡片就在里面），
    // 从这里拿旧闭包写会把刚复制出来的节点记录冲掉。
    props.onMakeGroup(keys, ctx)
    setMulti(keys.slice())
  }

  function membersOfGroup(k) {
    const g = groupOfKey(groups, k)
    return g ? g.keys.slice() : []
  }

  /** shift+右键：把这一张加进 / 移出当前选择（不弹菜单）。 */
  function toggleMulti(k) {
    const has = multi.indexOf(k) !== -1
    const next = has ? multi.filter(function (x) { return x !== k }) : multi.concat([k])
    setMulti(next)
    // 加进选择时它就是「当前这张」；移出时别留着高亮（sel 也算选中），
    // 不然看起来像是没去掉 —— 那就换到剩下最后一个成员上。
    if (!has) setSel(k)
    else if (sel === k) setSel(next.length ? next[next.length - 1] : null)
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

  // ── 对齐吸附（拖动时） ─────────────────────────────────────────────────────
  // 用户的原话：「我在想拖动的时候能不能加个对齐，这样子排起来更好看」。
  // 做法：拿被拖的矩形去和**别的**卡片 / 引用卡 / 独立对象的左中右、上中下比，
  // 差在 SNAP 以内就吸过去，并在对齐的那条线上画一根辅助线。
  function snapCandidates(skip) {
    const out = []
    const push = function (k) {
      if (skip[k]) return
      const r = rects[k]
      if (!r || !r.placed) return
      out.push({ x1: r.x, cx: r.x + r.w / 2, x2: r.x + r.w, y1: r.y, cy: r.y + r.h / 2, y2: r.y + r.h })
    }
    scope.forEach(function (c) { push(cardKey(c)) })
    refCards.forEach(function (c) { push(cardKey(c)) })
    objIds.forEach(function (id) { push(objKey(id)) })
    return out
  }

  /** 吸附一个矩形：返回吸完的 x / y 和该画的辅助线（没吸到就原样返回）。
   *  辅助线只画到「和它对齐的那张卡片」为止（用户：线不要太长，只要到下一个卡片就行）。 */
  function snapRect(rect, skip) {
    const cands = snapCandidates(skip || {})
    const xs = [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
    const ys = [rect.y, rect.y + rect.h / 2, rect.y + rect.h]
    let bx = null
    let by = null
    for (const c of cands) {
      for (const line of [c.x1, c.cx, c.x2]) {
        for (const mx of xs) {
          const d = line - mx
          if (Math.abs(d) <= SNAP && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d: d, line: line, other: c }
        }
      }
      for (const line of [c.y1, c.cy, c.y2]) {
        for (const my of ys) {
          const d = line - my
          if (Math.abs(d) <= SNAP && (!by || Math.abs(d) < Math.abs(by.d))) by = { d: d, line: line, other: c }
        }
      }
    }
    const out = { x: Math.round(rect.x + (bx ? bx.d : 0)), y: Math.round(rect.y + (by ? by.d : 0)), guides: null }
    const v = []
    const h = []
    if (bx) {
      v.push({
        x: Math.round(bx.line),
        y1: Math.round(Math.min(out.y, bx.other.y1)),
        y2: Math.round(Math.max(out.y + rect.h, bx.other.y2)),
      })
    }
    if (by) {
      h.push({
        y: Math.round(by.line),
        x1: Math.round(Math.min(out.x, by.other.x1)),
        x2: Math.round(Math.max(out.x + rect.w, by.other.x2)),
      })
    }
    if (v.length || h.length) out.guides = { v: v, h: h }
    return out
  }

  /** 改大小时的吸附（用户：「拖动改变大小的时候也加一个对齐」）：
   *  只动宽高 —— 把右下角那两条边吸到别人的边 / 中线上，位置不动。 */
  function snapSize(rect, skip, minW, minH) {
    const lo = { w: minW || CARD_SIZE_MIN.w, h: minH || CARD_SIZE_MIN.h }
    const cands = snapCandidates(skip || {})
    let bx = null
    let by = null
    for (const c of cands) {
      for (const line of [c.x1, c.cx, c.x2]) {
        const d = line - (rect.x + rect.w)
        if (Math.abs(d) <= SNAP && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d: d, line: line, other: c }
      }
      for (const line of [c.y1, c.cy, c.y2]) {
        const d = line - (rect.y + rect.h)
        if (Math.abs(d) <= SNAP && (!by || Math.abs(d) < Math.abs(by.d))) by = { d: d, line: line, other: c }
      }
    }
    const w = clampSize(rect.w + (bx ? bx.d : 0), lo.w, CARD_SIZE_MAX.w)
    const h = clampSize(rect.h + (by ? by.d : 0), lo.h, CARD_SIZE_MAX.h)
    const v = []
    const hh = []
    if (bx) {
      v.push({
        x: Math.round(bx.line),
        y1: Math.round(Math.min(rect.y, bx.other.y1)),
        y2: Math.round(Math.max(rect.y + h, bx.other.y2)),
      })
    }
    if (by) {
      hh.push({
        y: Math.round(by.line),
        x1: Math.round(Math.min(rect.x, by.other.x1)),
        x2: Math.round(Math.max(rect.x + w, by.other.x2)),
      })
    }
    return { w: w, h: h, guides: (v.length || hh.length) ? { v: v, h: hh } : null }
  }

  /** 几个键的包围盒（用图谱里的原位算，拖动中不受 liveRect 影响）。 */
  function bboxOf(keys) {
    let x1 = null, y1 = null, x2 = null, y2 = null
    for (const k of keys) {
      const r = rects[k]
      if (!r) continue
      if (x1 === null || r.x < x1) x1 = r.x
      if (y1 === null || r.y < y1) y1 = r.y
      if (x2 === null || r.x + r.w > x2) x2 = r.x + r.w
      if (y2 === null || r.y + r.h > y2) y2 = r.y + r.h
    }
    return x1 === null ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
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
    // 编过组的卡片同理：拖组里任何一个＝整组走（**按住 Alt 只拖这一张**，方便把它拽出组）。
    const memberKeys = membersOfGroup(k)
    // 按 Alt ＝只拖这一张（把某一张从组里拽出来用）；否则：选中集合 > 编好的组 > 单张
    const group = e.altKey
      ? [k]
      : ((multi.length > 1 && multi.indexOf(k) !== -1)
        ? multi.slice()
        : ((memberKeys.length > 1) ? memberKeys : [k]))
    dragRef.current = { key: k, dx: start.x - r.x, dy: start.y - r.y, x: r.x, y: r.y, ox: r.x, oy: r.y, moved: false, group: group, pos: null }
    setDrag({ key: k, x: r.x, y: r.y, pos: null })
    if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
    }
  }

  /** 拖卡片右下角的手柄：改这张卡片的宽高（松手写进图谱）。 */
  function onCardGripDown(e, card) {
    if (e.button !== 0) return
    const k = cardKey(card)
    const r = rects[k]
    if (!r) return
    setSel(k)
    const p = toCanvas(e.clientX, e.clientY)
    cardResizeRef.current = {
      key: k, ox: p.x, oy: p.y, rw: r.w, rh: r.h, moved: false, cur: { w: r.w, h: r.h },
    }
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
    // 拖手柄改卡片大小：几何只认 ref，松手才写回图谱；拖动时也吸对齐
    if (cardResizeRef.current) {
      const d = cardResizeRef.current
      const p = toCanvas(e.clientX, e.clientY)
      if (Math.abs(p.x - d.ox) > 2 || Math.abs(p.y - d.oy) > 2) d.moved = true
      const r0 = rects[d.key] || { x: 0, y: 0 }
      const skip = {}
      skip[d.key] = true
      const s = snapSize({
        x: r0.x,
        y: r0.y,
        w: clampSize(d.rw + (p.x - d.ox), CARD_SIZE_MIN.w, CARD_SIZE_MAX.w),
        h: clampSize(d.rh + (p.y - d.oy), CARD_SIZE_MIN.h, CARD_SIZE_MAX.h),
      }, skip)
      d.cur = { w: s.w, h: s.h }
      setGuides(s.guides)
      setCardResize({ key: d.key, rect: d.cur })
      return
    }
    // 独立对象的拖动 / 缩放：几何只认 ref，松手才写回图谱
    if (objDragRef.current) {
      const d = objDragRef.current
      const p = toCanvas(e.clientX, e.clientY)
      if (Math.abs(p.x - d.ox) > 2 || Math.abs(p.y - d.oy) > 2) d.moved = true
      const skip = {}
      skip[objKey(d.id)] = true
      if (d.mode === 'resize') {
        const s = snapSize({
          x: d.rx, y: d.ry,
          w: Math.max(OBJ_MIN_W, p.x - d.rx),
          h: Math.max(OBJ_MIN_H, p.y - d.ry),
        }, skip, OBJ_MIN_W, OBJ_MIN_H)
        d.cur = { x: d.rx, y: d.ry, w: s.w, h: s.h }
        setGuides(s.guides)
      } else {
        const s = snapRect({ x: Math.round(d.rx + (p.x - d.ox)), y: Math.round(d.ry + (p.y - d.oy)), w: d.rw, h: d.rh }, skip)
        d.cur = { x: s.x, y: s.y, w: d.rw, h: d.rh }
        setGuides(s.guides)
      }
      setObjDrag({ id: d.id, rect: d.cur })
      return
    }
    if (dragRef.current) {
      const d = dragRef.current
      const p = toCanvas(e.clientX, e.clientY)
      let x = Math.round(p.x - d.dx)
      let y = Math.round(p.y - d.dy)
      d.moved = true
      // 对齐吸附：单张按自己的矩形吸，整组按整组的包围盒吸（用户要的「拖动时对齐」）
      const gkeys = (d.group && d.group.length > 1) ? d.group : [d.key]
      const skip = {}
      gkeys.forEach(function (gk) { skip[gk] = true })
      if (gkeys.length > 1) {
        const bb = bboxOf(gkeys)
        if (bb) {
          const moved = { x: bb.x + (x - d.ox), y: bb.y + (y - d.oy), w: bb.w, h: bb.h }
          const s = snapRect(moved, skip)
          x += s.x - moved.x
          y += s.y - moved.y
          setGuides(s.guides)
        }
      } else {
        const r0 = rects[d.key]
        if (r0) {
          const s = snapRect({ x: x, y: y, w: r0.w, h: r0.h }, skip)
          x = s.x
          y = s.y
          setGuides(s.guides)
        }
      }
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
    // 什么都没在拖的时候：看指针底下是不是某个组的地盘，是就把那层淡背景浮出来。
    // 「组的地盘」＝成员包围盒（外扩 GROUP_PAD），所以卡片本身那一下仍然只走单卡逻辑。
    const box = canvasBox()
    const inside = e.clientX >= box.left && e.clientX <= box.left + box.width
      && e.clientY >= box.top && e.clientY <= box.top + box.height
    const gh = inside ? groupAt(toCanvas(e.clientX, e.clientY)) : null
    const gid = gh ? gh.id : null
    if (gid !== hoverGroupRef.current) { hoverGroupRef.current = gid; setHoverGroup(gid) }
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
      // 引用卡与独立对象也要能被框进来（卡片 + 引用 + 文本框/方框一起选）
      const candidates = scope.map(cardKey).concat(refCards.map(cardKey)).concat(objIds.map(objKey))
      for (const ck of candidates) {
        const r = rects[ck]
        if (!r || !r.placed) continue
        if (r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y) hit.push(ck)
      }
      setMulti(hit)
      if (hit.length) setSel(hit[0])
      return
    }
    if (cardResizeRef.current) {
      const d = cardResizeRef.current
      cardResizeRef.current = null
      setCardResize(null)
      setGuides(null)
      if (d.moved) patchRec(d.key, { w: d.cur.w, h: d.cur.h })
      return
    }
    if (objDragRef.current) {
      const d = objDragRef.current
      objDragRef.current = null
      setObjDrag(null)
      setGuides(null)
      if (d.moved) patchObjRect(d.id, d.cur)
      return
    }
    if (dragRef.current) {
      const d = dragRef.current
      dragRef.current = null
      setGuides(null)
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
  function autoArrange(dir) {
    // dir='h'＝横排（同一层的卡片左右并排、层与层往下走）；默认竖排（层往右、同层上下堆叠）。
    // 用户 2026-10-01 报的「它只能竖着排，没法横着排」。
    const horizontal = dir === 'h'
    const layer = scope.map(cardKey)
    // 只排选中的几张（用户的要求）：选中 2 张以上就只排它们，排完还落回原处附近；
    // 没有选中（或只选了一张）就照旧排整层。
    const selKeys = layer.filter(function (k) { return multi.indexOf(k) !== -1 })
    const only = selKeys.length >= 2 ? selKeys : null
    const keys = only || layer
    const slots = {}
    scope.forEach(function (c) { slots[cardKey(c)] = slotOf(c, nodeRec(graph, cardKey(c))) })

    // 编过组的卡片在自动排列里**当一块**（用户拍板）：一个组算一个单元，成员之间的
    // 相对位置原样保留；连线在单元这一层接起来，所以组内部的顺序不会被拆开。
    const units = []
    const unitOf = {}
    const claimed = {}
    for (const g of groups) {
      const mem = g.keys.filter(function (k) { return keys.indexOf(k) !== -1 && rects[k] && rects[k].placed })
      if (mem.length < 2) continue
      mem.forEach(function (k) { claimed[k] = true })
      units.push({ id: 'g:' + g.id, keys: mem })
    }
    keys.forEach(function (k) {
      if (claimed[k]) return
      units.push({ id: k, keys: [k] })
    })
    const boxes = {}
    for (const u of units) {
      if (u.keys.length === 1) {
        // 单张卡片照旧：单元就是这张卡（选项列的溢出照老规矩算间距，卡片本身不动）
        const k = u.keys[0]
        const off = {}
        off[k] = { x: 0, y: 0 }
        boxes[u.id] = { off: off }
        unitOf[k] = u.id
        continue
      }
      // 组：锚点＝成员自己位置的最小值（**不含溢出**），单元尺寸从锚点量到最远的溢出边。
      // 锚点用成员位置是为了「组里第一张卡摆在哪就是哪」—— 用溢出边当锚点会把整组推下去。
      let x1 = null, y1 = null, x2 = null, y2 = null
      const off = {}
      for (const k of u.keys) {
        const r = rects[k]
        const b = slotBox(r, slots[k] || { w: r.w, h: r.h, over: 0 })
        if (x1 === null || r.x < x1) x1 = r.x
        if (y1 === null || r.y < y1) y1 = r.y
        if (x2 === null || b.x + b.w > x2) x2 = b.x + b.w
        if (y2 === null || b.y + b.h > y2) y2 = b.y + b.h
        off[k] = { x: r.x - x1, y: r.y - y1 }
        unitOf[k] = u.id
      }
      boxes[u.id] = { w: x2 - x1, h: y2 - y1, off: off }
    }
    const slotOfUnit = function (id) {
      const u = units.filter(function (x) { return x.id === id })[0]
      if (!u) return { w: 0, h: 0, over: 0 }
      if (u.keys.length === 1) return slots[u.keys[0]] || { w: 0, h: 0, over: 0 }
      // 组当一块：over 已经摊进 w/h 里了，别再让 layout 额外让一次
      return { w: boxes[id].w, h: boxes[id].h, over: 0 }
    }
    const unitEdges = edges.map(function (e) {
      return { from: unitOf[e.from], to: unitOf[e.to], label: '', choice: '' }
    }).filter(function (e) { return e.from && e.to && e.from !== e.to })
    const out = autoLayout(units.map(function (u) { return u.id }), slotOfUnit, unitEdges, horizontal ? 'h' : 'v')

    // 只排一部分时，把排好的这一块挪回选区原来的位置 —— 否则它会跳到画布左上角，
    // 看着像「我一排，别的卡片全跑没了」。
    let shiftX = 0
    let shiftY = 0
    if (only) {
      let minX = null
      let minY = null
      for (const id of Object.keys(out)) {
        if (minX === null || out[id].x < minX) minX = out[id].x
        if (minY === null || out[id].y < minY) minY = out[id].y
      }
      const bb = bboxOf(only)
      if (bb && minX !== null) {
        shiftX = Math.round(bb.x - minX)
        shiftY = Math.round(bb.y - minY)
      }
    }

    const next = graphWith(graph)
    for (const u of units) {
      const o = out[u.id]
      if (!o) continue
      for (const k of u.keys) {
        const off = boxes[u.id].off[k] || { x: 0, y: 0 }
        const x = Math.round(o.x + off.x + shiftX)
        const y = Math.round(o.y + off.y + shiftY)
        const old = next.nodes[k] || { x: null, y: null, cx: null, cy: null, chapter: '', mode: '', color: '', choices: [] }
        // 卡片就摆在算出来的位置上：选项列是溢出的，不参与卡片自己的坐标
        next.nodes[k] = level === 'root'
          ? Object.assign({}, old, { x: x, y: y })
          : Object.assign({}, old, { cx: x, cy: y, chapter: here.key })
      }
    }
    props.onGraph(next)
    // 只排一部分时不动视角（不然别的卡片会被挪出视野）
    if (!only) setView({ x: 24, y: 20, s: view.s })
    props.onNotice({
      text: (only ? '已重新排列选中的 ' + only.length + ' 张' : '已重新排列这一层') + '（' + (horizontal ? '横排' : '竖排') + '）',
      kind: 'info',
    })
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
      if (matchKey(e, 'delete')) {
        // 框选了一组就整组移出画布（文件不动）；选中的是独立对象就删对象；否则只动当前这张
        if (multi.length > 1) { e.preventDefault(); removeManyFromCanvas(multi); return }
        if (sel && isObjKey(sel)) { e.preventDefault(); dropObjs([objIdOf(sel)]); return }
        if (!cur) return
        e.preventDefault()
        removeFromCanvas(cur)
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
      if (matchKey(e, 'mod+a')) { e.preventDefault(); setMulti(selectableKeys()); return }
    }
    window.addEventListener('keydown', onKey)
    return function () { window.removeEventListener('keydown', onKey) }
  })

  function removeFromCanvas(card) {
    removeManyFromCanvas([cardKey(card)])
  }

  /** 一次把多张卡片（以及独立对象）移出画布（卡片文件不动）。同 placeMany：只写一次图谱。
   *  引用卡只从 refs 里删掉那一条 —— **绝不删卡片文件、绝不删文档**；
   *  独立对象没有文件，移出画布就是把它删掉。 */
  function removeManyFromCanvas(keys) {
    if (!keys || !keys.length) return
    const set = {}
    const refKeys = []
    const objGone = []
    keys.forEach(function (k) {
      set[k] = true
      if (isObjKey(k)) objGone.push(objIdOf(k))
      else if (refRecs[k]) refKeys.push(k)
    })
    const next = graphWith(graph, {
      chapters: graph.chapters.filter(function (x) { return !set[x] }),
    })
    for (const k of keys) {
      if (isObjKey(k) || refRecs[k]) continue
      if (level === 'root') next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { x: null, y: null })
      else next.nodes[k] = Object.assign({}, next.nodes[k] || {}, { cx: null, cy: null })
    }
    next.edges = next.edges.filter(function (e) { return !set[e.from] && !set[e.to] })
    if (refKeys.length) {
      let refs = graph.refs
      for (const k of refKeys) refs = patchRefs({ refs: refs }, ctx, k, null)
      next.refs = refs
    }
    if (objGone.length) {
      let objects = graph.objects
      for (const id of objGone) objects = patchObjects({ objects: objects }, ctx, id, null)
      next.objects = objects
    }
    // 组里少了人就收干净（剩不到两个的组自动散掉）
    next.groups = patchGroups(graph, ctx, cleanGroups(groups, set))
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
    // 分组（用户报「并没有看到分组功能出现在哪里」）：在多选里右键某一张也能编组；
    // 没选够两张时就摆一条灰掉的提示，写清楚怎么选。
    const selGrp = (multi.indexOf(k) !== -1 && multi.length >= 2) ? multi.slice() : []
    items.push({
      key: 'grp',
      label: selGrp.length ? '把选中的 ' + selGrp.length + ' 个编成一组' : '编成一组（先框选、或 shift+右键加选）',
      disabled: selGrp.length < 2,
      onPick: function () { makeGroup(selGrp) },
    })
    items.push({ key: 'size', label: '重置为默认大小', onPick: function () { patchRec(k, { w: null, h: null }) } })
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
    // 画布上的独立对象（用户拍板：文本框与矩形方框**互不绑定**，各建各的）
    items.push({ head: '文本框 / 方框（独立对象）' })
    items.push({ key: 'new-text', label: '新建文本框', onPick: function () { addObject(OBJ_TEXT) } })
    items.push({ key: 'new-rect', label: '新建矩形方框', onPick: function () { addObject(OBJ_RECT) } })
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
    items.push({ key: 'auto', label: (multi.length >= 2 ? '自动排列（只排选中的 ' + multi.length + ' 张）' : '自动排列') + ' · 竖排', onPick: function () { autoArrange('v') } })
    items.push({ key: 'autoh', label: (multi.length >= 2 ? '横排（只排选中的 ' + multi.length + ' 张）' : '横排'), onPick: function () { autoArrange('h') } })
    items.push({ sep: true })
    // 分组（用户报「并没有看到分组功能出现在哪里」）：这里给一个入口，顺便写清怎么选
    items.push({
      key: 'grp',
      label: multi.length >= 2 ? '把选中的 ' + multi.length + ' 个编成一组' : '编成一组（先框选、或 shift+右键加选）',
      disabled: multi.length < 2,
      onPick: function () { makeGroup(multi.slice()) },
    })
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
    const nativeSel = keys.filter(function (k) { return !refRecs[k] && !isObjKey(k) })
    const objSel = keys.filter(function (k) { return isObjKey(k) })
    // 选中的正好是同一个组的全体成员 → 给「取消编组」
    let uniqGroup = null
    for (const k of keys) {
      const g = groupOfKey(groups, k)
      if (!g) { uniqGroup = null; break }
      if (uniqGroup && g.id !== uniqGroup) { uniqGroup = null; break }
      uniqGroup = g.id
    }
    const items = [
      { head: '已选 ' + n + ' 张（右键拖框选 · shift+右键加选）' },
    ]
    if (n >= 2 && !uniqGroup) {
      items.push({ key: 'grp', label: '编成一组（' + n + ' 个）', onPick: function () { makeGroup(keys) } })
    }
    if (uniqGroup) {
      items.push({ key: 'ung', label: '取消编组', onPick: function () { ungroup(uniqGroup) } })
    }
    items.push({ key: 'out', label: '移出画布', hint: 'Delete', onPick: function () { removeManyFromCanvas(keys) } })
    // 选中几张之后最想要的两件事：把这几个重排一下（竖排 / 横排）
    items.push({ key: 'auto', label: '自动排列这 ' + n + ' 个（竖排）', onPick: function () { autoArrange('v') } })
    items.push({ key: 'autoh', label: '横排这 ' + n + ' 个（左右并排）', onPick: function () { autoArrange('h') } })
    if (objSel.length) {
      items.push({
        key: 'delobj', label: '删除这 ' + objSel.length + ' 个对象', danger: true,
        onPick: function () { dropObjs(objSel.map(objIdOf)) },
      })
    }
    items.push({ sep: true })
    items.push({ head: '染色' })
    items.push({ key: 'color', colors: true })
    items.push({ sep: true })
    items.push({ key: 'selectall', label: '选中这一层全部', onPick: function () { setMulti(selectableKeys()) } })
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
    // 右键落在某个组的地盘上（是空白处，不是卡片上）→ 唤起**整组**菜单（用户拍板）
    const g = groupAt(p)
    if (g) { setMenu({ x: e.clientX, y: e.clientY, group: g.id }); return }
    setMenu({ x: e.clientX, y: e.clientY, card: null })
  }

  function onCardMenu(e, card) {
    setEdgeMenu(null)
    if (justMarqueed.current) { justMarqueed.current = false; return }
    const k = cardKey(card)
    // shift+右键＝把这一张加进 / 移出当前选择，**不弹菜单**（用户拍板）。
    // 右键拖框选照旧；不带 shift 的右键也照旧弹菜单。
    if (e && e.shiftKey) { toggleMulti(k); return }
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

  // ── 缩略图（右下角那颗按钮）────────────────────────────────────────────────
  /**
   * 缩略图里要画的东西：这一层画布上摆着的卡片、引用卡、独立对象。
   * 没落位（还在堆叠条里）的卡片不在画布上，也就不进缩略图。
   */
  function miniItems() {
    const list = []
    placed.forEach(function (c) {
      const k = cardKey(c)
      list.push({ key: k, card: c, rect: rects[k], kind: 'card', accent: nodeRec(graph, k).color || c.color || '' })
    })
    refCards.forEach(function (c) {
      const k = cardKey(c)
      list.push({ key: k, card: c, rect: rects[k], kind: 'card', ref: true, accent: refAccent(c, refRecs[k]) })
    })
    objIds.forEach(function (id) {
      const k = objKey(id)
      list.push({ key: k, obj: objRecs[id], rect: rects[k], kind: 'obj' })
    })
    return list
  }

  /**
   * 缩略图的几何。两条独立的量：
   *   ① k（位置比例）＝把整块内容的包围盒缩进一屏画布的那个比例 —— 所有**相对位置**
   *      一个不差地保留，距离整体乘 k 变小（用户原话「相对距离随之缩小」）。
   *   ② 牌子大小 ＝按卡片自己的长宽比算：先拿缩小后的高度（夹在 MINI_TILE_H_MIN~MAX，
   *      保证两行标题装得下），宽度 = 高度 × 这张卡自己的 w/h。所以改过宽高的卡片
   *      （宽卡、窄卡、竖卡）在缩略图里照样是那个形状，不会被一律画成同样的小方块。
   * 独立对象不做成牌子（它们没有标题）：照 k 缩成一小块色片 / 虚线片，只用来交代位置。
   */
  function miniLayout() {
    const items = miniItems()
    if (!items.length) return { items: [], edges: [], empty: true }
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const it of items) {
      x0 = Math.min(x0, it.rect.x)
      y0 = Math.min(y0, it.rect.y)
      x1 = Math.max(x1, it.rect.x + it.rect.w)
      y1 = Math.max(y1, it.rect.y + it.rect.h)
    }
    const box = canvasBox()
    const bw = Math.max(1, x1 - x0)
    const bh = Math.max(1, y1 - y0)
    const availW = Math.max(40, box.width - MINI_PAD * 2)
    const availH = Math.max(40, box.height - MINI_PAD * 2)
    const k = clamp(Math.min(availW / bw, availH / bh), MINI_S_MIN, MINI_S_MAX)
    // 内容整块摆在画布中间
    const off = {
      x: Math.round(MINI_PAD + (availW - bw * k) / 2 - x0 * k),
      y: Math.round(MINI_PAD + (availH - bh * k) / 2 - y0 * k),
    }
    const out = []
    for (const it of items) {
      const r = it.rect
      let w
      let h
      if (it.kind === 'obj') {
        // 方框 / 文本框：照 k 缩，太小的给个 3px 下限（不然一整个对象看不见了）
        w = Math.max(3, r.w * k)
        h = Math.max(3, r.h * k)
      } else {
        const ratio = r.h > 0 ? r.w / r.h : 1
        h = clamp(r.h * k, MINI_TILE_H_MIN, MINI_TILE_H_MAX)
        w = clamp(h * ratio, MINI_TILE_W_MIN, MINI_TILE_W_MAX)
        // 宽度被上限夹住时，高度跟着按比例收一点，牌子还是这张卡的形状
        if (h * ratio > MINI_TILE_W_MAX) h = MINI_TILE_W_MAX / ratio
      }
      const cx = off.x + (r.x + r.w / 2) * k
      const cy = off.y + (r.y + r.h / 2) * k
      out.push(Object.assign({}, it, {
        tile: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) },
      }))
    }
    // 连线照缩略图里的牌子画（不照 k 缩过的原始矩形 —— 牌子有下限，两者对不齐）。
    // 只看两端都在画布上的线；选项列在缩略图里不存在，起点就走牌子的右侧中点。
    const byKey = {}
    for (const it of out) byKey[it.key] = it
    const lines = []
    for (const e of edges) {
      const a = byKey[e.from]
      const b = byKey[e.to]
      if (!a || !b) continue
      lines.push(edgePath(
        { x: a.tile.x + a.tile.w, y: a.tile.y + a.tile.h / 2 },
        { x: b.tile.x, y: b.tile.y + b.tile.h / 2 }))
    }
    return { items: out, edges: lines, empty: false }
  }

  /** 缩略图按钮：开 / 关。开的时候把没钉住的浮窗收起来（它们会盖在缩略图上面）。 */
  function toggleMini() {
    if (mini) { setMini(false); return }
    closeLoose()
    setMenu(null)
    setEdgeMenu(null)
    setMulti([])
    setMarquee(null)
    setMini(true)
  }

  /** 从缩略图里点一张牌子：退出缩略图，把这张卡摆到画布中间并选中它。 */
  function jumpFromMini(k) {
    setMini(false)
    setMulti([])
    setSel(k)
    const r = rects[k]
    if (!r) return
    const box = canvasBox()
    setView({
      x: Math.round(box.width / 2 - (r.x + r.w / 2) * view.s),
      y: Math.round(box.height / 2 - (r.y + r.h / 2) * view.s),
      s: view.s,
    })
  }

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  // 缩略图那一层的几何（只在开着的时候算）
  const miniGeo = mini ? miniLayout() : null
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
      // 拖右下角改大小（用户要的「可以修改卡片高度和宽度」）
      resizable: true,
      onGripDown: onCardGripDown,
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

  // 画布上的独立对象：矩形方框先画、文本框后画 —— 文本框压在方框上面（用户要的那个
  // 上下关系），但两者**互不绑定**：谁都不跟着谁走。
  function objElsOf(kind) {
    return objIds.filter(function (id) { return objRecs[id].kind === kind }).map(function (id) {
      const k = objKey(id)
      const editing = !!(objEdit && objEdit.id === id)
      return React.createElement(ObjView, {
        key: k, objId: id, rec: objRecs[id], rect: liveRect(k) || rects[k], cardKey: k,
        selected: sel === k || multi.indexOf(k) !== -1,
        dimmed: scrimOn,
        editing: editing,
        editValue: editing ? String(objEdit.value == null ? '' : objEdit.value) : '',
        onEditChange: function (v) { setObjEdit({ id: id, value: v }) },
        onEditCommit: commitObjEdit,
        onObjDouble: onObjDouble,
        onObjDown: onObjDown,
        onGripDown: onObjGripDown,
        onMenu: onObjMenu,
      })
    })
  }
  const rectEls = objElsOf(OBJ_RECT)
  const textEls = objElsOf(OBJ_TEXT)

  // 分组：悬停在组的地盘上时，组底下浮出一层淡背景（用户拍板：不要把组画成框）。
  // 这层只负责「让人看见这一片是一个组」，不吃点击 —— 右键那块空白处才算唤起整组。
  const hoverG = hoverGroup ? groups.filter(function (g) { return g.id === hoverGroup })[0] : null
  const hoverBox = hoverG ? groupBoxLive(hoverG.keys) : null
  const groupBgEl = hoverBox
    ? React.createElement('div', {
      className: 'sc-groupbg',
      'data-group': hoverG.id,
      style: {
        left: hoverBox.x - GROUP_PAD, top: hoverBox.y - GROUP_PAD,
        width: hoverBox.w + GROUP_PAD * 2, height: hoverBox.h + GROUP_PAD * 2,
      },
    })
    : null

  // 拖动时的对齐辅助线（用户要的「拖动的时候加个对齐」）：竖线管左右对齐、横线管上下对齐。
  // 它铺满整块画布（CSS 里用 ±4000 撑开），不吃点击。
  const guideEls = []
  if (guides) {
    for (const g of guides.v || []) {
      guideEls.push(React.createElement('div', {
        key: 'gv' + g.x + ':' + g.y1, className: 'sc-guide sc-guidev', 'data-guide': 'v',
        style: { left: g.x, top: g.y1, height: Math.max(1, g.y2 - g.y1) },
      }))
    }
    for (const g of guides.h || []) {
      guideEls.push(React.createElement('div', {
        key: 'gh' + g.y + ':' + g.x1, className: 'sc-guide sc-guideh', 'data-guide': 'h',
        style: { top: g.y, left: g.x1, width: Math.max(1, g.x2 - g.x1) },
      }))
    }
  }

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

  // 缩略图那一层：整块画布换成一屏小牌子（只留标题），底下的正常画布**不渲染**。
  // 它自己吃滚轮与右键（data-wheel="own" + 停掉右键菜单）：在缩略图里缩放那层看不见的
  // 画布、弹出画布菜单都没有意义。点空白处 = 退出。
  const miniEl = mini
    ? React.createElement('div', {
      className: 'sc-mini', 'data-mini': '1', 'data-wheel': 'own',
      onPointerDown: function (e) { if (e && typeof e.stopPropagation === 'function') e.stopPropagation() },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
      onClick: function () { setMini(false) },
    },
      React.createElement('svg', { className: 'sc-miniedges', width: '100%', height: '100%' },
        miniGeo.edges.map(function (d, i) {
          return React.createElement('path', { key: 'me' + i, className: 'sc-miniedge', d: d })
        })),
      miniGeo.items.map(function (it) {
        const style = { left: it.tile.x, top: it.tile.y, width: it.tile.w, height: it.tile.h }
        if (it.kind === 'obj') {
          if (it.obj.color) style['--sc-accent'] = it.obj.color
          return React.createElement('div', {
            key: it.key, className: 'sc-miniobj ' + (it.obj.kind === OBJ_TEXT ? 'text' : 'rect'),
            'data-key': it.key, 'data-miniobj': it.obj.kind, style: style,
          })
        }
        if (it.accent) style['--sc-accent'] = it.accent
        return React.createElement('div', {
          key: it.key,
          className: 'sc-minitile' + (it.accent ? ' dye' : '') + (sel === it.key || multi.indexOf(it.key) !== -1 ? ' on' : ''),
          'data-key': it.key, 'data-mini': it.ref ? 'ref' : 'card',
          title: (cardDisplay(it.card) || it.card.file) + '（点一下退出缩略图，回到这张卡）',
          style: style,
          onClick: function (e) { e.stopPropagation(); jumpFromMini(it.key) },
        }, React.createElement('div', { className: 'sc-minititle' }, cardDisplay(it.card) || it.card.file))
      }),
      miniGeo.empty
        ? React.createElement('div', { className: 'sc-minihint' }, '这块画布上还没有卡片。')
        : null
    )
    : null

  return React.createElement('div', { className: 'sc-board' },
    nav,
    React.createElement('div', {
      className: 'sc-canvas' + (panOn ? ' panning' : ''), ref: canvasRef,
      onPointerDown: onCanvasDown, onContextMenu: onCanvasMenu,
    },
      miniEl ? miniEl : React.createElement('div', { className: 'sc-stage' + (scrimOn ? ' blur' : ''), style: stageStyle },
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
        groupBgEl,
        // 层序（用户 2026-10-01 拍板，从下往上）：有颜色的方框 → 文字 → 其他所有卡片。
        // 也就是说方框和文本框都垫在卡片**下面**，卡片永远压在最上面、点得到的也一定是卡片；
        // 三层之间互不穿插（没有哪张卡会被压到文字底下）。DOM 顺序就是叠放顺序。
        rectEls,
        textEls,
        cardEls,
        refEls,
        ...guideEls,
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
      // 提示整块套一层 .sc-statushelp：它自己最多两行、超出的**从最上面往下藏**（见 CSS），
      // 面板变窄时状态栏不会再长高把画布挤上去；右下的按钮留在这一层外面，永远不会被裁。
      React.createElement('div', { className: 'sc-statushelp' },
        mini
          ? [
            React.createElement('span', { key: 'm1' }, '缩略图：整块画布只留标题（位置按比例缩到一屏）'),
            React.createElement('span', { key: 'm2' }, '· 点一张卡片＝退出缩略图并回到那张卡 · 点空白处或再按一次「缩略图」退出'),
          ]
          : [
            React.createElement('span', { key: 'h1' }, level === 'root'
              ? '上级：排列章节（双击章节卡片进入下级）'
              : '下级：排本章节的情节顺序（双击卡片展开）'),
            React.createElement('span', { key: 'h2' }, '· 空白处左键拖动平移 · 滚轮缩放（Shift/Alt+滚轮左右上下）'),
            React.createElement('span', { key: 'h3' }, '· 右键空白处新建卡片 / 文本框 / 方框 · 粘贴'),
            React.createElement('span', { key: 'h4' }, '· 点连线给它起名字（右键改名 / 删线）'),
            React.createElement('span', { key: 'h5' }, '· 右键拖框选多张 · shift+右键点卡片加选 · Ctrl+A 全选'),
          ]
      ),
      React.createElement('span', { className: 'sp' }),
      React.createElement('button', {
        className: 'sc-btn',
        title: multi.length >= 2
          ? '按连线分层重排，**只排选中的这几张**（排完还落回原处附近）· 竖排＝层往右、同层上下堆叠'
          : '按连线分层，同层再按时间排 · 竖排＝层往右、同层上下堆叠（选中 2 张以上时只排选中的那几张）',
        onClick: function () { autoArrange('v') },
      }, multi.length >= 2 ? '自动排列（选中的 ' + multi.length + ' 张）' : '自动排列'),
      // 横排：同一层的卡片左右并排、层与层往下走（用户要的「横着排」）
      React.createElement('button', {
        className: 'sc-btn',
        title: multi.length >= 2
          ? '横排：把选中的这几张按连线分层后**左右并排**，层与层往下走'
          : '横排：按连线分层后，同一层的卡片左右并排、层与层往下走',
        onClick: function () { autoArrange('h') },
      }, multi.length >= 2 ? '横排（选中的 ' + multi.length + ' 张）' : '横排'),
      React.createElement('div', { className: 'sc-zoombar' },
        React.createElement('button', { className: 'sc-navbtn', title: '缩小', onClick: function () { setView({ x: view.x, y: view.y, s: zoomStep(view.s, -1) }) } }, '－'),
        React.createElement('button', { className: 'sc-navbtn', title: '放大', onClick: function () { setView({ x: view.x, y: view.y, s: zoomStep(view.s, 1) }) } }, '＋'),
        React.createElement('button', { className: 'sc-btn', onClick: function () { setView({ x: 24, y: 20, s: 1 }) } }, '归位')
      ),
      // 缩略图（用户 2026-10-02 要的「右下角加一个缩略图按钮」）：状态栏最右边这一颗，
      // 按下去整块画布换成只留标题的小牌子。画布上什么都没有时点它没意义，置灰。
      React.createElement('button', {
        className: 'sc-btn' + (mini ? ' sc-btn-on' : ''),
        disabled: !mini && !miniItems().length,
        title: mini
          ? '退出缩略图，回到正常画布（点一张卡片也可以：直接回到那张卡）'
          : '缩略图：所有卡片只留标题（两行），相对位置不变、距离缩到一屏里 —— 改过宽高的卡片照它自己的长宽比画',
        onClick: toggleMini,
      }, '缩略图')
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
      : (menu.group
        ? MenuList({
          x: menu.x, y: menu.y, items: groupMenuItems(menu.group),
          color: '',
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          onColor: function (v) { groupColor(menu.group, v); setMenu(null) },
          onColorPick: function (v) { groupColor(menu.group, v) },
          onClose: function () { setMenu(null) },
        })
        : (menu.obj
        ? MenuList({
          x: menu.x, y: menu.y, items: objMenuItems(menu.obj),
          color: String((objRecs[menu.obj] || {}).color || ''),
          swatches: props.swatches, onEditSwatches: props.onEditSwatches,
          onColor: function (v) { patchMany([objKey(menu.obj)], { color: v }); setMenu(null) },
          onColorPick: function (v) { patchMany([objKey(menu.obj)], { color: v }) },
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
        }))))) : null
  )
}
