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
