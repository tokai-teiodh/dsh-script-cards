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
