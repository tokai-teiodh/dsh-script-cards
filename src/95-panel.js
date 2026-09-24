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

  function newCardAt(type, point, chapterKey) {
    const draft = { id: '', file: '(新卡片)', kind: 'card', type: type, title: '', code: '', when: '', order: null, summary: '', tags: [], body: '', chapter: chapterKey || '', mode: '' }
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
