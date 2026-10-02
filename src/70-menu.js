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
    onContextMenu: function (e) {
      e.preventDefault()
      e.stopPropagation()
      // 菜单自己也可以认「右键再来一下」这个手势（连线上那个菜单：右键双击＝直接删线，
      // 见 85-boardview 的 edgeRightAgain）—— 第二下多半正好落在菜单上，所以这条不能少。
      if (props.onContextRight && props.onContextRight(e) === true) return
    },
    onMouseDown: function (e) { e.stopPropagation() },
  }, items.map(function (it, i) {
    if (!it) return null
    if (it.sep) return React.createElement('div', { key: 'sep' + i, className: 'sc-menusep' })
    if (it.head) return React.createElement('div', { key: 'h' + i, className: 'sc-menuhead' }, it.head)
    // 菜单里的输入框（文档里那套「人物」菜单：人一多就得能筛）。
    // 鼠标与键盘事件都要 stopPropagation：打字不许冒泡到画布（Delete / 空格 / Ctrl+V
    // 是画布快捷键），mousedown 也不许冒到 MenuBackdrop 上被当成「点了别处」。
    if (it.input) {
      return React.createElement('input', {
        key: 'inp' + i,
        className: it.input.className || 'sc-inp full sc-menuinput',
        value: it.input.value, autoFocus: true,
        placeholder: it.input.placeholder || '',
        onMouseDown: function (e) { e.stopPropagation() },
        onKeyDown: function (e) { e.stopPropagation(); if (it.input.onKeyDown) it.input.onKeyDown(e) },
        onChange: function (e) { it.input.onChange(e.target.value) },
      })
    }
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
            // 色盘是**实时**换色、但**不关菜单**：Chromium 一点开取色器就会派发一次
            // change（值往往就是原值），以前这里直接走 onColor → 调用点顺手 setMenu(null)，
            // 于是「一点色盘整块菜单就没了」（用户报的）。所以：
            //   ① 先和当前色比一下，一样就什么都不做；
            //   ② 换色走 onColorPick（不关菜单），关菜单交给点别处 / Esc；
            //   ③ 自己的鼠标事件全 stopPropagation，别冒出去碰到遮罩。
            onChange: function (e) {
              const v = String(e.target.value || '')
              if (!v) return
              if (props.color && v.toLowerCase() === String(props.color).toLowerCase()) return
              if (props.onColorPick) props.onColorPick(v)
              else props.onColor(v)
            },
            onMouseDown: function (e) { e.stopPropagation() },
            onClick: function (e) { e.stopPropagation() },
            onInput: function (e) { e.stopPropagation() },
            onContextMenu: function (e) { e.preventDefault(); e.stopPropagation() },
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
  // 兜底：事件 target 落在菜单**里面**就绝不关（原生取色器/别的原生控件有时会把事件
  // 路径变得和想象中不一样，一旦没被 stopPropagation 拦住，这层遮罩就会把菜单收掉）。
  // 写法带兜底 —— mini-react 的假元素没有 closest，不能写死它存在。
  function insideMenu(e) {
    const t = e && e.target
    if (!t) return false
    if (typeof t.closest === 'function') {
      try { return !!t.closest('.sc-menu') } catch (err) { return false }
    }
    return false
  }
  return React.createElement('div', {
    className: 'sc-menuback',
    onMouseDown: function (e) {
      e.stopPropagation()
      if (insideMenu(e)) return
      if (props.onClose) props.onClose()
    },
    onContextMenu: function (e) {
      e.preventDefault()
      e.stopPropagation()
      if (insideMenu(e)) return
      // 遮罩也能认「右键再来一下」：双击那条线时，第二下要是落在菜单外面（线的另一段），
      // 由这里交给调用方判定（它会自己看时间窗和距离），认下来就不关菜单。
      if (props.onContextRight && props.onContextRight(e) === true) return
      if (props.onClose) props.onClose()
    },
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
