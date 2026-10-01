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
    all[root] = graphWith(graph)
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

  // 最新图谱的镜像。异步流程（画布上「整组复制一份」要等卡片复制完）不能拿点击那一刻
  // 的旧闭包去写图谱 —— 那样会把中间刚写进去的节点记录冲掉。
  const graphRef = React.useRef(graph)
  graphRef.current = graph

  /**
   * 当前最新的图谱。异步流程（删卡片、复制、粘贴…）**不能**用点击那一刻的旧闭包：
   * 比如「批量删除」里画布先移走了引用卡（写了一次），紧接着面板再按旧图谱写一次，
   * 引用卡就会复活。凡是发生在 await 之后的读写，一律走这里。
   */
  function latestGraph() { return graphRef.current || graph }

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

  function pushNotice(n) {    if (!n) { setNotice(null); return }
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

  function patchGraphRec(key, fields) {    // graphWith：手拼字面量会把 refs / objects / groups 一起冲掉（老写法就是这个毛病）
    const next = graphWith(latestGraph())
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
        const next = graphWith(latestGraph())
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
        const next = graphWith(latestGraph(), {
          chapters: graph.chapters.filter(function (k) { return !want[k] }),
        })
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

  /**
   * 画布上「整组复制一份」的最后一步：把复制出来的成员编成新的一组。
   * 这一步走面板而不是画布，是因为**只有面板手上的图谱是最新的** —— 复制出来的卡片
   * 的节点记录是刚才那次 saveGraph 写进去的，画布那边还拿着点击那一刻的旧闭包。
   */
  function makeGroupFromCanvas(keys, ctx) {
    if (!keys || keys.length < 2) return
    const base = latestGraph()
    const list = groupsOf(base, ctx).concat([{ id: uid('g'), keys: keys.slice() }])
    // keep=keys：刚复制出来的卡片可能还没进这一帧的 cards，别被 prune 当孤儿剪掉
    saveGraph(graphWith(base, { groups: patchGroups(base, ctx, list) }), keys)
  }

  function newCardAt(type, point, chapterKey, mode) {
    const draft = { id: '', file: '(新卡片)', kind: 'card', type: type, title: '', code: '', when: '', order: null, summary: '', tags: [], body: '', chapter: chapterKey || '', mode: mode || '' }
    setDialog({ kind: 'edit', card: draft, isNew: true, point: point })
  }

  // done(entry)：可选回调。画布上「整组复制一份」要拿到新卡片的键，才能把副本编成新的一组。
  function duplicateCard(card, done) {
    const rec = nodeRec(graph, cardKey(card))
    api.createCard(cwd, {
      type: card.type, title: (card.title || '') + ' 副本', code: card.code, chapter: rec.chapter || card.chapter,
      mode: rec.mode || card.mode, when: card.when, order: card.order, summary: card.summary,
      tags: card.tags, color: card.color, body: card.body, source: '复制自 ' + card.file,
    }).then(function (entry) {
      setCards(function (list) { return list.concat([entry]) })
      const at = { x: (rec.x === null ? 40 : rec.x + 40), y: (rec.y === null ? 40 : rec.y + 40) }
      const key = cardKey(entry)
      const next = graphWith(latestGraph())
      next.nodes[key] = { x: at.x, y: at.y, cx: at.x + 40, cy: at.y + 40, chapter: rec.chapter, mode: entry.mode, color: '', choices: [] }
      saveGraph(next, [key])
      pushNotice({ text: '已复制为 ' + entry.file, kind: 'info' })
      if (done) done(entry)
    }).catch(function (e) { pushNotice('复制失败：' + msgOf(e)); if (done) done(null) })
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
      // 画布上「整组复制一份」的最后一步（见 makeGroupFromCanvas）
      onMakeGroup: makeGroupFromCanvas,
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
          setCards(function (list) { return list.concat([entry]) })
          const key = cardKey(entry)
          const next = graphWith(latestGraph())
          next.nodes[key] = { x: Math.round(at.x), y: Math.round(at.y), cx: Math.round(at.x), cy: Math.round(at.y), chapter: rec.chapter, mode: entry.mode, color: '', choices: [] }
          saveGraph(next, [key])
        }).catch(function (e) { pushNotice('粘贴失败：' + msgOf(e)) })
      },
      // 连线的名字直接在线上改（画布上浮出一个输入框），不走对话框：
      // 弹个框挡在中间，既和展开的卡片宽度对不上，又平白多一层。
      onSetEdgeLabel: function (e, label) {
        const next = graphWith(latestGraph(), {
          edges: graph.edges.map(function (x) {
            return (x.from === e.from && x.to === e.to && String(x.choice || '') === String(e.choice || ''))
              ? Object.assign({}, x, { label: label }) : x
          }),
        })
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
            setCards(function (list) { return list.concat([entry]) })
            if (dialog.point) {
              const key = cardKey(entry)
              const next = graphWith(latestGraph())
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
