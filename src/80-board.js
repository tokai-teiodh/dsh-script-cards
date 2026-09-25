// ══════════════════════════════════════════════════════════════════════════════
// 分支画布：几何、卡片、连线、底部堆叠条
// ══════════════════════════════════════════════════════════════════════════════

const CARD_W = { chapter: 208, node: 184, condition: 172, result: 172 }
const CARD_H = { chapter: 96, node: 80, condition: 58, result: 58 }
const CHOICE_W = 170
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
      CardBody({
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
