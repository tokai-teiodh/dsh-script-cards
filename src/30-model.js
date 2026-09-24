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
