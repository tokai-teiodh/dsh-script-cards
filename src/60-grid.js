// ══════════════════════════════════════════════════════════════════════════════
// 方片页（存档族卡片）
//
// 自适应圆角方片网格、按类型分组、置顶组在最前、标签单行横滑（滚动条不悬停不
// 显示）、星标收藏 + 置顶、简介固定在卡片最下沿。
// 分支族（chapter/node/condition/result）**不在这里出现**（要求 4）。
// ══════════════════════════════════════════════════════════════════════════════

// 标签条：横向能滑，但**平时一点滚动条都看不到**（用户的要求：不动的时候隐藏，
// 只有动起来才显现）。Windows 的原生滚动条自带两侧三角箭头，很丑；而且「悬停才显示」
// 的写法会让指针和元素互相追着跑（滑块一出现就把内容顶走 → 取消悬停 → 缩回去 → 又悬停），
// 整块布局高频抖。
// 做法：原生滚动条整个藏掉（连箭头一起，也不占位），自己画一根细指示条 ——
// 绝对定位、不参与布局，所以它的出现/消失不会挪动任何东西；滚动时点亮，停下 700ms 淡出。
const TAGBAR_MS = 700

function tagThumb(el) {
  const total = Number(el && el.scrollWidth) || 0
  const view = Number(el && el.clientWidth) || 0
  if (!total || total <= view) return null
  const width = Math.max(10, (view / total) * 100)
  const max = total - view
  const left = (max > 0 ? Number(el.scrollLeft) / max : 0) * (100 - width)
  return { left: left, width: width }
}

function TagRow(props) {
  const tags = props.tags || []
  const [bar, setBar] = React.useState(null)
  const timer = React.useRef(null)
  const stripRef = React.useRef(null)
  const dragState = React.useRef(null)
  // 拖完紧跟的那一次 click 是拖动的尾巴，不是点击 —— 吃掉它，不然顺手就打开了卡片详情。
  const swallow = React.useRef(false)
  // deps 写 [] 是有意的：这个 effect 不读任何 state，只挂监听器。
  // 不写 deps（每轮渲染重挂）会被"淡出"这件事坑到：setBar 触发的重渲染会先跑清理，
  // 把刚排上的 700ms 定时器清掉，于是滑块一旦出现就再也不消失。
  React.useEffect(function () {
    const el = stripRef.current
    if (!el || typeof el.addEventListener !== 'function') return undefined
    function paint(ev) {
      // 用事件里的 target 量尺寸（真浏览器里就是这根标签条本身）
      setBar(tagThumb(ev && ev.target ? ev.target : el))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(function () { setBar(null) }, TAGBAR_MS)
    }
    // 原生滚动条整个藏掉之后，鼠标就再也抓不到那根滑块了 —— 所以「按住标签条横着拖」
    // 必须自己实现，否则整条只能靠 Shift+滚轮挪（用户报的「滑动功能整个没用了」）。
    // 拖动过程中标签文字不可选中（CSS 上的 user-select:none），不然一拖就变成选文字。
    function onMove(ev) {
      const st = dragState.current
      if (!st) return
      const dx = (Number(ev.clientX) || 0) - st.x
      if (Math.abs(dx) > 3) { st.moved = true; swallow.current = true }
      if (!st.moved) return
      el.scrollLeft = st.left - dx
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      paint({ target: el })
    }
    function stopDrag() {
      dragState.current = null
      if (el.classList && el.classList.remove) el.classList.remove('sc-tagsdrag')
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', stopDrag)
        window.removeEventListener('pointercancel', stopDrag)
      }
    }
    function onDown(ev) {
      if (ev.button !== undefined && ev.button !== null && ev.button !== 0) return
      if (typeof window === 'undefined') return
      dragState.current = { x: Number(ev.clientX) || 0, left: Number(el.scrollLeft) || 0, moved: false }
      if (el.classList && el.classList.add) el.classList.add('sc-tagsdrag')
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', stopDrag)
      window.addEventListener('pointercancel', stopDrag)
    }
    el.addEventListener('scroll', paint)
    el.addEventListener('pointerdown', onDown)
    return function () {
      el.removeEventListener('scroll', paint)
      el.removeEventListener('pointerdown', onDown)
      stopDrag()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  if (!tags.length) return null
  return React.createElement('div', { className: 'sc-tagwrap' },
    React.createElement('div', {
      className: 'sc-tags', ref: stripRef,
      onClick: function (ev) { if (swallow.current) { swallow.current = false; ev.stopPropagation() } },
    },
      tags.map(function (t, i) { return React.createElement('span', { key: i, className: 'sc-tag' }, t) })),
    bar ? React.createElement('div', { className: 'sc-tagbar' },
      React.createElement('div', { className: 'sc-tagthumb', style: { left: bar.left + '%', width: bar.width + '%' } })) : null
  )
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
        }, React.createElement(StarIcon, { on: starred })),
        React.createElement('button', {
          key: 'p', className: 'sc-icon' + (pinned ? ' on' : ''), title: pinned ? '取消置顶' : '置顶',
          onClick: function (e) { e.stopPropagation(); props.onPin(c, !pinned) },
        }, React.createElement(PinIcon, { on: pinned }))
      )
    ),
    React.createElement(TagRow, { tags: c.tags }),
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
    React.createElement(TagRow, { tags: c.tags }),
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
                return React.createElement(Tile, {
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
      ? React.createElement(ArchiveDetail, { card: props.detailCard, body: props.detailBody, loading: props.detailLoading })
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
