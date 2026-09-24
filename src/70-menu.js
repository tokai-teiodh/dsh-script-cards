// ══════════════════════════════════════════════════════════════════════════════
// 右键菜单 / 快捷键
//
// 菜单渲染在面板根层（不能放进 .sc-stage —— 那一层有 transform，会让
// position:fixed 的定位基准变成画布而不是视口）。
// ══════════════════════════════════════════════════════════════════════════════

function MenuList(props) {
  const items = props.items || []
  const style = { left: Math.max(4, props.x), top: Math.max(4, props.y) }
  if (props.width) style.minWidth = props.width
  return React.createElement('div', {
    className: props.className || 'sc-menu',
    style: style,
    onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
    onMouseDown: function (e) { e.stopPropagation() },
  }, items.map(function (it, i) {
    if (!it) return null
    if (it.sep) return React.createElement('div', { key: 'sep' + i, className: 'sc-menusep' })
    if (it.head) return React.createElement('div', { key: 'h' + i, className: 'sc-menuhead' }, it.head)
    if (it.colors) {
      const list = props.swatches && props.swatches.length ? props.swatches : DEFAULT_SWATCHES
      return React.createElement('div', { key: 'c' + i },
        React.createElement('div', { className: 'sc-swatches' }, list.map(function (hex) {
          const sel = props.color && String(props.color).toLowerCase() === String(hex).toLowerCase()
          return React.createElement('button', {
            key: hex, className: 'sc-swatch' + (sel ? ' sc-swatchsel' : ''),
            style: { background: hex }, title: hex,
            onClick: function (e) { e.stopPropagation(); props.onColor(hex) },
          })
        })),
        React.createElement('div', { className: 'sc-colorrow' },
          React.createElement('input', {
            className: 'sc-colorinput', type: 'color',
            value: props.color || list[0] || '#7A8BA6',
            onChange: function (e) { props.onColor(e.target.value) },
          }),
          React.createElement('span', null, '色盘'),
          React.createElement('span', { style: { flex: 1 } }),
          React.createElement('button', {
            className: 'sc-btn', style: { padding: '2px 8px' },
            title: '增删这套预置色卡（只存这台浏览器）',
            onClick: function (e) { e.stopPropagation(); props.onClose(); if (props.onEditSwatches) props.onEditSwatches() },
          }, '编辑色卡…'),
          React.createElement('button', {
            className: 'sc-btn', style: { padding: '2px 8px' },
            onClick: function (e) { e.stopPropagation(); props.onColor('') },
          }, '清除')
        )
      )
    }
    return React.createElement('button', {
      key: it.key || ('i' + i),
      className: 'sc-menuitem', disabled: !!it.disabled,
      onClick: function (e) { e.stopPropagation(); props.onClose(); if (it.onPick) it.onPick() },
    },
      React.createElement('span', null, (it.checked ? '✓ ' : '') + it.label),
      it.hint ? React.createElement('span', { className: 'k' }, it.hint) : null
    )
  }))
}

// 菜单背后那层透明遮罩：点它就关菜单。
//
// ⚠ 关菜单**必须**靠这层真实的遮罩，不能在 window 上听 mousedown：捕获阶段的
// mousedown 会在菜单项的 click 之前就把菜单卸载掉，click 于是永远落不到按钮上。
// 真实浏览器里的表现就是「右键菜单点任何一项都没反应」，而无头测试只直接触发
// onClick，所以一直没暴露这个顺序问题。
function MenuBackdrop(props) {
  return React.createElement('div', {
    className: 'sc-menuback',
    onMouseDown: function (e) { e.stopPropagation(); if (props.onClose) props.onClose() },
    onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); if (props.onClose) props.onClose() },
  })
}

// Esc 关闭（鼠标的关闭交给 MenuBackdrop）。
function useDismiss(onClose, active) {
  React.useEffect(function () {
    if (!active) return undefined
    function key(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return function () {
      window.removeEventListener('keydown', key, true)
    }
  }, [active, onClose])
}

// 快捷键匹配：'mod+c' / 'delete' / 'space' / 'ctrl+shift+g' 之类。
function matchKey(e, spec) {
  const parts = String(spec).toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const needMod = parts.indexOf('mod') !== -1
  const needShift = parts.indexOf('shift') !== -1
  const needAlt = parts.indexOf('alt') !== -1
  if (needMod !== !!(e.ctrlKey || e.metaKey)) return false
  if (needShift !== !!e.shiftKey) return false
  if (needAlt !== !!e.altKey) return false
  const k = String(e.key || '').toLowerCase()
  if (key === 'space') return k === ' ' || k === 'spacebar'
  if (key === 'delete') return k === 'delete' || k === 'backspace'
  if (key === 'esc') return k === 'escape'
  return k === key
}

const SHORTCUTS = [
  { spec: 'mod+c', label: '复制', hint: 'Ctrl+C' },
  { spec: 'mod+x', label: '剪切', hint: 'Ctrl+X' },
  { spec: 'mod+v', label: '粘贴', hint: 'Ctrl+V' },
  { spec: 'mod+d', label: '原地复制一张', hint: 'Ctrl+D' },
  { spec: 'space', label: '展开 / 收起', hint: '空格' },
  { spec: 'delete', label: '删除（移出画布）', hint: 'Delete' },
  { spec: 'mod+0', label: '缩放归位', hint: 'Ctrl+0' },
  { spec: 'mod+1', label: '缩放至 100%', hint: 'Ctrl+1' },
]

function shortcutHint(label) {
  for (const s of SHORTCUTS) if (s.label.indexOf(label) === 0) return s.hint
  return ''
}
