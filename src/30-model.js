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
