// ══════════════════════════════════════════════════════════════════════════════
// 卡片文档编辑器（DocEditor）
//
// 每张章节 / 节点卡片可以有一份**独立**文档：<档案目录>/<文档子目录>/<卡片文件名>。
// 它不是卡片正文的编辑器 —— 正文（frontmatter + ## 角色 / ## 场景 / ## 内容）照旧在
// 「字段」页里改，这里读写的是另一个文件。用户的原话背景：「章节卡片和节点卡片要各有
// 一份对应的文档，能直接在 dsh 应用里改，卡片要能做成悬浮窗方便查阅」。
//
// 两处复用同一个组件（用户要求）：
//   ① 展开浮层的「卡片 | 文档」页签
//   ② 卡片编辑弹窗的「字段 | 文档」页签
//
// 文档里还能直接录台词与旁白（用户拍板的结构，**只作用于这个 textarea**，卡片正文不动）：
//   台词   「角色名」：台词   （中文直角引号 + 全角冒号，字面写进 .md）
//   旁白   行首两个全角空格（U+3000）+ 文字，左侧不写人名
//   textarea 里右键 → 人物菜单（全部人物卡 + 旁白 + 结束当前角色，人多了能筛）。
//   选完人进入「该角色说话」状态，这一行的开头自动带上前缀；
//   **Shift+Enter** 换行、并且补上和前缀等宽的一串全角空格（续行对着台词那一列）；
//   **直接 Enter** 结束这个角色的话（只换行、不补缩进）。
//
// 名字着色（用户拍板「高亮覆盖层」而不是真富文本）：textarea 自己的文字是透明的，
// 底下一层同内容的 .sc-dochl 渲染彩色文本，两层字体/内边距/换行规则逐项一致，
// 滚动时把 textarea 的 scrollTop/scrollLeft 同步过去。这样底层仍是纯 textarea ——
// 中文输入法、Ctrl+S、脏标记、写进 .md 的还是纯文本，一样都不受影响。
//
// 语义（用户拍板）：**空文档不落盘**。内容 trim 后为空时，文件已存在就删掉、不存在就
// 什么都不做；文件不存在＝「还没有文档」，不是错误。
//
// 面板既有的红条 notice 机制负责把**原始失败原因**摆到用户面前，本组件再把同一句话
// 挂在状态行上（浮层窄，红条不一定在视线里）。
// ══════════════════════════════════════════════════════════════════════════════

/** HH:MM，状态行上的「已保存 14:07」。 */
function clockNow() {
  return clockOf(Date.now())
}

/** 把时间戳（草稿的 at）也格式化成 HH:MM。 */
function clockOf(ts) {
  const d = new Date(isFinite(Number(ts)) ? Number(ts) : Date.now())
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

// 旁白行的行首：两个**全角**空格（U+3000）。用户点名要这个 —— 「要加旁白，但是左侧不显示人名」。
const NARRATION_PREFIX = '　　'

/** 当前角色对应的行首前缀；没有角色（普通行）就是空串。 */
function rolePrefix(role) {
  if (!role) return ''
  if (role.kind === 'narration') return NARRATION_PREFIX
  // 首行＝`「名字」：台词`（直角引号 + **全角冒号**）
  return '「' + role.name + '」：'
}

/**
 * 续行的缩进（用户拍板的「冒号加回对齐位」）：
 *   `「勿忘我」：` 宽 6 → 续行＝ **5 个全角空格 + 一个全角冒号**，冒号正落在首行冒号那一列，
 *   台词文字也和首行文字同列。用户原话：「没有冒号还是有点奇怪，感觉不太能很好的指代，
 *   把冒号加回去吧」。
 * 旁白**不加冒号**：旁白没有名字，冒号没有指代对象，保持两个全角空格。
 * （想让旁白也带冒号，把这一支改成 wideSpaces(1) + '：' 就行 —— 一句话的事。）
 */
function roleIndent(role) {
  if (!role) return ''
  if (role.kind === 'narration') return NARRATION_PREFIX
  return wideSpaces(Math.max(0, Math.ceil(textWidth(rolePrefix(role))) - 1)) + '：'
}

/** 行首匹配 `「名字」：`（台词首行）。 */
const DIALOG_RE = /^「(.+?)」：/

/** 行首匹配「一串全角空格 + 全角冒号」（台词续行：冒号对齐在首行那一列）。 */
const CONT_RE = /^([　]+)(：)/

/** 人物菜单的分组（只在台词右键菜单里用；**方片页的分组与顺序一个都不许动**）。 */
const GROUP_ORDER = ['lead', 'support', 'other']
const GROUP_LABEL = { lead: '主角', support: '配角', other: '其他' }

function DocEditor(props) {
  const api = props.api
  const root = props.root
  const card = props.card
  const file = card ? String(card.file || '') : ''
  const path = api && api.docPathOf ? api.docPathOf(file) : file
  // 人物：{ name, color, group }。兼容只给了名字的旧形状（名字数组）—— 那就当没颜色、「其他」组。
  const speakers = (props.speakers || []).map(function (s) {
    if (typeof s === 'string') return { name: s, color: '', group: 'other' }
    return {
      name: String(s && s.name ? s.name : ''),
      color: String((s && s.color) || ''),
      group: String((s && s.group) || 'other'),
    }
  }).filter(function (s) { return !!s.name })

  const [text, setText] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  // 磁盘上有一份**非空**文档（＝状态行说「已保存」、卡片上那个角标亮着）
  const [has, setHas] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState('')
  const [failed, setFailed] = React.useState('')
  // 台词结构：正在写谁说的话（{kind:'char',name} / {kind:'narration'} / null＝普通行）
  const [role, setRole] = React.useState(null)
  // 右键菜单（MenuList 是 position:fixed，所以位置直接用鼠标坐标）
  const [menu, setMenu] = React.useState(null)
  const [filter, setFilter] = React.useState('')
  // 手工插入之后光标要落到哪。受控 textarea 里必须等重渲染之后再设，
  // 所以先存下来，让下面的 effect 去设（见那里的注释）。
  const [caret, setCaret] = React.useState(null)
  const boxRef = React.useRef(null)
  // 高亮层的壳：滚动时把 textarea 的 scrollTop/scrollLeft 同步过去（不重渲染，
  // 直接改 DOM —— 每滚一像素都重渲染一次太浪费）
  const hlRef = React.useRef(null)
  // 这张卡的草稿（localStorage，见 40-store 的 putDraft）。有草稿时状态行会说
  // 「草稿 HH:MM 未保存」，并多出一个「放弃草稿」。
  const [draft, setDraft] = React.useState(null)
  const draftTimer = React.useRef(null)
  // 盘上那一份的内容（保存/载入时更新）：用来判断草稿是不是真的和盘上不同、
  // 以及「放弃草稿」时不用再读一次盘。
  const diskText = React.useRef('')

  const readOnly = !(api && typeof api.canWrite === 'function' && api.canWrite())
  const draftKey = card ? cardKey(card) : ''

  function notice(n) { if (props.onNotice) props.onNotice(n) }

  // 换卡片就重新读。alive 标志：读盘是异步的，中途换了卡片（浮层里连点两张）时，
  // 后回来的那一份不能把新卡片的内容顶掉。
  React.useEffect(function () {
    let alive = true
    setLoading(true)
    setDirty(false)
    setFailed('')
    setSavedAt('')
    setRole(null)
    // 同一实例上换了卡片（编辑弹窗从这张卡换到那张卡）时，先把上一张挂着的草稿写掉
    flushPendingDraft(false)
    if (!api || !root || !file || typeof api.readDoc !== 'function') {
      setText('')
      setHas(false)
      setLoading(false)
      return undefined
    }
    Promise.resolve(api.readDoc(root, file)).then(function (res) {
      if (!alive) return
      const t = String((res && res.text) || '')
      diskText.current = t
      // 有草稿就填草稿：用户写一半切走再切回来，不该看到盘上那份旧内容。
      // 草稿和盘上一模一样（上次存过、或被别的途径同步了）就直接丢掉，不留脏状态。
      let one = null
      try { one = draftKey ? readDraft(draftKey) : null } catch (e) { one = null }
      if (one && String(one.text) === t) {
        try { dropDraft(draftKey) } catch (e) { /* 忽略 */ }
        one = null
      }
      setDraft(one)
      setText(one ? String(one.text) : t)
      setHas(!!(res && res.exists) && !!t.trim())
      setDirty(!!one)
      setLoading(false)
      if (props.onDocChange) props.onDocChange(!!(res && res.exists) && !!t.trim())
    }).catch(function (e) {
      if (!alive) return
      setLoading(false)
      setFailed(msgOf(e))
      notice({ text: '文档读取失败：' + msgOf(e), kind: 'error' })
    })
    return function () { alive = false }
  }, [root, file])

  // 草稿是**节流**写的（400ms）：每敲一个键就把整份 JSON 序列化再写回太浪费。
  // 待写的那一条记在 ref 里（key + text），所以：
  //   ① 定时器到点就写；
  //   ② 卸载 / 换卡片时**立刻 flush**（组件要没了，不能等定时器 —— 用户就是怕
  //      「打完最后一个字、400ms 内切卡片」这一段丢字）；
  //   ③ flush 时认卡：写入永远写进待写那一条自己的 key（旧卡，这是对的），
  //      但只有当前还停在同一张卡上才更新状态行，否则会把**新卡**写成「草稿 … 未保存」。
  const pendingDraft = React.useRef(null)
  const keyNow = React.useRef(draftKey)
  keyNow.current = draftKey

  function flushPendingDraft(updateState) {
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
    const p = pendingDraft.current
    pendingDraft.current = null
    if (!p) return
    const at = Date.now()
    try { putDraft(p.key, p.text, at) } catch (e) { /* 草稿写不进去就算了，别打断打字 */ }
    if (updateState && keyNow.current === p.key) setDraft({ text: p.text, at: at })
  }

  function scheduleDraft(textNow) {
    if (readOnly || !draftKey) return
    pendingDraft.current = { key: draftKey, text: String(textNow) }
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(function () { flushPendingDraft(true) }, 400)
  }

  function clearDraft() {
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
    pendingDraft.current = null
    try { if (draftKey) dropDraft(draftKey) } catch (e) { /* 忽略 */ }
    setDraft(null)
  }

  // 卸载（切卡片 / 关窗口 / 切页签）时把挂着的那条草稿**同步写掉**，别留给定时器。
  // 这里**不 setState**：组件已经没了。
  React.useEffect(function () {
    return function () { flushPendingDraft(false) }
  }, [])

  // 手工插进去的文本要等**重渲染之后**才能设光标：先设 selectionStart 的话，React 随后
  // 写回 value 会把它冲到末尾（受控 textarea 的老问题）。所以插入只负责算出目标位置，
  // 这里在渲染提交之后一次性设好，再把自己清掉。
  React.useEffect(function () {
    if (caret === null) return undefined
    const el = boxRef.current
    if (el) {
      if (typeof el.focus === 'function') { try { el.focus() } catch (e) { /* 忽略 */ } }
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(caret, caret)
      else {
        try { el.selectionStart = caret; el.selectionEnd = caret } catch (e) { /* 忽略 */ }
      }
    }
    setCaret(null)
    return undefined
  }, [caret, text])

  // 两层对齐的最后一块：textarea 常驻一根滚动条（overflow-y:scroll），那几像素会占掉
  // 正文的可用宽度，而高亮层没有滚动条 —— 所以按**实测**的滚动条宽度给高亮层补上右内边距。
  // 不写死 10px：真机上滚动条宽度随缩放 / 主题 / 系统设置变，写死了就会差那么几像素，
  // 折行位置一错，光标和彩字就对不上了。
  React.useEffect(function () {
    const area = boxRef.current
    const hl = hlRef.current
    if (!area || !hl || typeof area.offsetWidth !== 'number' || typeof hl.style !== 'object') return undefined
    const sb = Math.max(0, (area.offsetWidth || 0) - (area.clientWidth || 0))
    // 10 = CSS 里 .sc-docarea 的 padding-right（两边共用同一套内边距）
    if (hl.style) hl.style.paddingRight = (10 + sb) + 'px'
    return undefined
  }, [text, loading, readOnly])

  function save() {
    if (readOnly) {
      notice({ text: '只读模式：宿主半边的落盘桥不可用，文档写不回磁盘。原因：' + (api && api.diagnostic ? api.diagnostic() : '未知'), kind: 'error' })
      return
    }
    setBusy(true)
    setFailed('')
    const body = String(text)
    Promise.resolve(api.writeDoc(root, file, body)).then(function (res) {
      setBusy(false)
      const empty = !body.trim()
      setDirty(false)
      setHas(!empty)
      setSavedAt(empty ? '' : clockNow())
      diskText.current = body
      // 存进去了，草稿就没用了（不清的话下次进来会拿旧草稿盖住刚存的内容）
      clearDraft()
      if (props.onDocChange) props.onDocChange(!empty)
      notice({
        text: empty
          ? ((res && res.mode === 'removed') ? '文档已清空，文件已删除：' + path : '内容为空，没有创建文档文件。')
          : '已保存文档 ' + path,
        kind: 'info',
      })
    }).catch(function (e) {
      // 失败时**不清脏标记**：改动还在输入框里，用户可以修完桥再按一次 Ctrl+S
      setBusy(false)
      setFailed(msgOf(e))
      notice({ text: '文档保存失败：' + msgOf(e), kind: 'error' })
    })
  }

  /** 重新从盘上读（「重载」按钮，以及「放弃草稿」）。草稿一律清掉。 */
  function reload(why) {
    if (!api || !root || !file || typeof api.readDoc !== 'function') return
    setLoading(true)
    setFailed('')
    Promise.resolve(api.readDoc(root, file)).then(function (res) {
      const t = String((res && res.text) || '')
      diskText.current = t
      setText(t)
      setHas(!!(res && res.exists) && !!t.trim())
      setDirty(false)
      setSavedAt('')
      setLoading(false)
      clearDraft()
      if (props.onDocChange) props.onDocChange(!!(res && res.exists) && !!t.trim())
      notice({ text: (why === 'discard' ? '已放弃草稿，回到盘上的内容：' : '已重新载入 ') + path, kind: 'info' })
    }).catch(function (e) {
      setLoading(false)
      setFailed(msgOf(e))
      notice({ text: '文档读取失败：' + msgOf(e), kind: 'error' })
    })
  }

  // ── 台词 / 旁白的插入 ──────────────────────────────────────────────────────
  /**
   * 在光标处插入一段文本，并把光标移到插入内容之后。
   * `newlineFirst`：当前行已有内容、光标又不在行首时先补一个换行 ——
   * 不然 `「名字」：` 会被塞进句子中间（用户拍板的规则）。
   */
  function insertAtCaret(chunk, opts) {
    const value = String(text)
    const el = boxRef.current
    let from = value.length
    let to = value.length
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      from = clamp(el.selectionStart, 0, value.length)
      to = clamp(el.selectionEnd, from, value.length)
    }
    let ins = String(chunk)
    if (opts && opts.newlineFirst) {
      const lineStart = value.lastIndexOf('\n', Math.max(0, from - 1)) + 1
      if (from > lineStart) ins = '\n' + ins
    }
    setText(value.slice(0, from) + ins + value.slice(to))
    setDirty(true)
    setCaret(from + ins.length)
    // 插进来的这一段也算改动，草稿跟着记一份（不然「插完台词就切卡片」会丢）
    scheduleDraft(value.slice(0, from) + ins + value.slice(to))
  }

  function startRole(r, message) {
    setRole(r)
    setMenu(null)
    insertAtCaret(rolePrefix(r), { newlineFirst: true })
    notice({ text: message, kind: 'info' })
  }

  function openMenu(e) {
    // 只读模式不弹这个菜单：那时候右键该给浏览器（选中一段复制走）
    if (readOnly) return
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    setFilter('')
    setMenu({ x: Number(e && e.clientX) || 0, y: Number(e && e.clientY) || 0 })
  }

  /**
   * 菜单内容：筛选框 + 人物（按主角 / 配角 / 其他分组）+ 旁白 + 结束当前角色。
   * 分组只影响**这个菜单**：方片页的分组与顺序一个都没动（用户点名只改台词菜单）。
   * 空组不显示；用筛选框筛过之后，只显示有命中的组，标题计数跟着变。
   */
  function speakerItems() {
    const q = String(filter).trim().toLowerCase()
    const list = q
      ? speakers.filter(function (s) { return s.name.toLowerCase().indexOf(q) !== -1 })
      : speakers
    const items = [{
      input: {
        value: filter, placeholder: '筛选人物…',
        onChange: setFilter,
        onKeyDown: function (e) { if (e.key === 'Escape') setMenu(null) },
      },
    }]
    if (!speakers.length) {
      items.push({ head: '还没有人物卡（存档族 type: character）' })
    } else if (!list.length) {
      items.push({ head: '没有匹配的人物' })
    }
    for (const g of GROUP_ORDER) {
      const one = list.filter(function (s) { return (s.group || 'other') === g })
      if (!one.length) continue
      items.push({ head: GROUP_LABEL[g] + '（' + one.length + '）' })
      for (const sp of one) {
        items.push({
          key: 'sp-' + sp.name, label: sp.name,
          checked: !!role && role.kind === 'char' && role.name === sp.name,
          onPick: function () {
            startRole({ kind: 'char', name: sp.name }, '正在写「' + sp.name + '」的台词：Enter 结束，Shift+Enter 换行并对齐')
          },
        })
      }
    }
    items.push({ sep: true })
    items.push({
      key: 'nar', label: '旁白', hint: '不写人名',
      checked: !!role && role.kind === 'narration',
      onPick: function () { startRole({ kind: 'narration' }, '正在写旁白（不写人名）：Enter 结束，Shift+Enter 换行') },
    })
    items.push({
      key: 'end', label: '结束当前角色', disabled: !role,
      onPick: function () { setRole(null); setMenu(null) },
    })
    return items
  }

  /**
   * 行首标记（三种）：「当作一个整体」。用户原话：「应该把角色名当做一个整体，删除的时候
   * 整体删除，有的时候会出现删除一半的情况，非常抽象」—— 光标跟在 `「勿忘我」：` 后面按
   * 一下 Backspace 只掉一个冒号，留下 `「勿忘我」你终于来了。` 这种半截。
   */
  function prefixAt(line) {
    const s = String(line)
    const m = DIALOG_RE.exec(s)
    if (m) return { kind: 'char', name: m[1], len: m[0].length }
    const c = CONT_RE.exec(s)
    if (c) return { kind: 'cont', name: '', len: c[0].length }
    if (s.slice(0, 2) === NARRATION_PREFIX) return { kind: 'narration', name: '', len: 2 }
    return null
  }

  /** 整块删掉 [a,b)（前缀），光标落到 caret；顺带把「正在写：XX」收掉。 */
  function killPrefix(a, b, caret) {
    const v = String(text)
    const next = v.slice(0, a) + v.slice(b)
    setText(next)
    setDirty(true)
    scheduleDraft(next)
    setCaret(caret)
    // 前缀都没了，状态行还写着「正在写：XX」就是在瞎说
    if (role) setRole(null)
    return true
  }

  /**
   * Backspace / Delete 落在行首标记上时，整块删掉它（返回 true＝已经处理，别走默认）。
   *   Backspace：光标在标记内部或正好在标记末尾（但不含行首本身 —— 那里该走「合并上一行」）
   *   Delete   ：光标在标记起点或内部
   *   有选区时：只有选区完全落在同一行的标记区间内才整块删（选中名字三个字删掉，
   *             不会留下 `「」：`）；其余一律不抢，交给浏览器。
   */
  function killPrefixKey(kind) {
    const el = boxRef.current
    if (!el || typeof el.selectionStart !== 'number') return false
    const v = String(text)
    const from = clamp(el.selectionStart, 0, v.length)
    const to = clamp(typeof el.selectionEnd === 'number' ? el.selectionEnd : from, from, v.length)
    const ls = v.lastIndexOf('\n', Math.max(0, from - 1)) + 1
    const nlAt = v.indexOf('\n', ls)
    const le = nlAt === -1 ? v.length : nlAt
    const pre = prefixAt(v.slice(ls, le))
    if (!pre) return false
    if (from !== to) {
      return from >= ls && to <= ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
    }
    if (kind === 'Backspace') {
      return from > ls && from <= ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
    }
    return from >= ls && from < ls + pre.len ? killPrefix(ls, ls + pre.len, ls) : false
  }

  function onKeyDown(e) {
    // 画布上的快捷键（Delete / 空格 / Ctrl+V）不能在打字时抢走按键
    e.stopPropagation()
    // 行首标记（`「名字」：` / `　　　　：` / 旁白的 `　　`）按一个整体删
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (killPrefixKey(e.key)) {
        if (typeof e.preventDefault === 'function') e.preventDefault()
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 's') {
      e.preventDefault()
      save()
      return
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Enter 由这里自己管：不 preventDefault 的话，浏览器往 DOM 里插的换行会被
      // 受控 value 冲掉（看起来就是「回车没用」），所以一律手动插、手动落光标。
      if (typeof e.preventDefault === 'function') e.preventDefault()
      // Shift+Enter：换行 + 补上和前缀等宽的一串全角空格（续行对着台词那一列），
      // **不**再重复一遍名字 —— 用户原话：「干脆同一个角色换行的时候，就不要再加前缀了，
      // 直接跟在后面」。角色状态留着，直到直接 Enter 收尾。
      // 缩进是**正文的一部分**：这几个全角空格会字面写进 .md。
      if (e.shiftKey) { insertAtCaret('\n' + roleIndent(role)); return }
      // 直接 Enter：只换行（不补缩进），并且这一句说完了 —— 回到普通行
      setRole(null)
      insertAtCaret('\n')
    }
  }

  /** 顶层：把 textarea 的滚动同步给高亮层（两层内容一样，滚差一格就对不上）。 */
  function onScroll(e) {
    const hl = hlRef.current
    const src = (e && e.target) ? e.target : boxRef.current
    if (!hl || !src) return
    hl.scrollTop = src.scrollTop || 0
    hl.scrollLeft = src.scrollLeft || 0
  }

  /** 名字 → 颜色（同一份数据也给方片页那个设色入口用）。 */
  function colorOf(name) {
    for (const s of speakers) if (s.name === name && s.color) return s.color
    return ''
  }

  /**
   * 高亮层：逐行渲染。行首 `「名字」：` 那一段用该角色的颜色，其余用正文色；
   * 旁白行开头的两个全角空格渲染成暗色（看着像缩进）。
   * 换行跟着每一行的最后一段走 —— 外层是 white-space:pre-wrap，会照原样断行，
   * 这样高亮层和 textarea 的行数、折行位置完全一致。
   */
  function highlightNodes() {
    const lines = String(text).split('\n')
    const out = []
    // 续行那个冒号要点上**当前角色**的颜色，让「还是同一个人在说」一眼看得出来。
    // 当前角色只在「台词首行」之后有效；普通行 / 旁白行 / 空行一来就清掉 ——
    // 不清的话后面随便哪一行的冒号都会被误染成上一个角色的色。
    let cur = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nl = i === lines.length - 1 ? '' : '\n'
      const m = DIALOG_RE.exec(line)
      if (m) {
        cur = m[1]
        const col = colorOf(cur)
        const rest = line.slice(m[0].length) + nl
        if (col) out.push(React.createElement('span', { key: 'n' + i, className: 'sc-docname', style: { color: col } }, m[0]))
        else out.push(React.createElement('span', { key: 'n' + i, className: 'sc-docname' }, m[0]))
        out.push(React.createElement('span', { key: 'r' + i }, rest))
        continue
      }
      const cont = cur ? CONT_RE.exec(line) : null
      if (cont) {
        // 续行＝一串全角空格（暗色，看着像缩进）+ 一个上色的全角冒号 + 台词
        const col = colorOf(cur)
        out.push(React.createElement('span', { key: 'q' + i, className: 'sc-docquiet' }, cont[1]))
        if (col) out.push(React.createElement('span', { key: 'c' + i, className: 'sc-docname', style: { color: col } }, cont[2]))
        else out.push(React.createElement('span', { key: 'c' + i, className: 'sc-docname' }, cont[2]))
        out.push(React.createElement('span', { key: 'r' + i }, line.slice(cont[0].length) + nl))
        continue
      }
      cur = ''
      if (line.slice(0, 2) === NARRATION_PREFIX) {
        out.push(React.createElement('span', { key: 'q' + i, className: 'sc-docquiet' }, NARRATION_PREFIX))
        out.push(React.createElement('span', { key: 'r' + i }, line.slice(2) + nl))
        continue
      }
      out.push(React.createElement('span', { key: 'p' + i }, line + nl))
    }
    return out
  }

  // 状态行：脏标记与失败原因**都要在**（保存失败时改动还在输入框里，两件事都是真的）。
  // 从草稿恢复出来的，说清楚这是**草稿**（而且几点几分写下/改过），别让人以为是盘上那份。
  const state = loading
    ? '读取中…'
    : (dirty
      ? (draft ? '草稿 ' + clockOf(draft.at) + ' 未保存' : '● 未保存') + (failed ? ' · 保存失败：' + failed : '')
      : (failed
        ? '出错了：' + failed
        : (has ? (savedAt ? '已保存 ' + savedAt : '已有文档（未改动）') : '还没有文档')))

  // 把「保存」交给外面那颗主按钮用：编辑弹窗的「字段 | 文档」页签里，底下那颗显眼的
  // 按钮必须保存**当前这一页**在编的东西 —— 用户在文档页敲完字去点它，结果只把卡片
  // 文件写回去，会得出一句「文档功能没保存上」。所以文档页时那颗按钮换成
  // 「保存（写回文档）」，点的就是这个 save。
  // （用 saveRef 而不是 useImperativeHandle：客户端半边手写、只有 react 一个 require，
  //   一个普通 { current } 壳在真 React 与测试替身里都一样管用。）
  if (props.saveRef) props.saveRef.current = save

  useDismiss(function () { setMenu(null) }, !!menu)

  return React.createElement('div', { className: 'sc-doc' },
    React.createElement('div', { className: 'sc-docbar' },
      React.createElement('button', {
        className: 'sc-btn sc-btn-on', disabled: busy || readOnly,
        title: readOnly ? '只读模式：写不回磁盘' : '写回文档文件（Ctrl+S）',
        onClick: save,
      }, busy ? '保存中…' : '保存'),
      React.createElement('button', {
        className: 'sc-btn', disabled: busy || loading, title: '丢掉未保存的改动，重新从磁盘读',
        onClick: function () { reload('') },
      }, '重载'),
      draft
        ? React.createElement('button', {
          className: 'sc-btn', disabled: busy, title: '丢掉这份草稿，回到盘上的内容',
          onClick: function () { reload('discard') },
        }, '放弃草稿')
        : null,
      role
        ? React.createElement('span', {
          className: 'sc-docrole',
          title: 'Enter 结束这个角色；Shift+Enter 换行并对齐到台词那一列（不再重复名字）',
        }, '正在写：' + (role.kind === 'narration' ? '旁白' : role.name))
        : null,
      React.createElement('span', { className: 'sc-spacer' }),
      React.createElement('span', { className: 'sc-docstate' + (dirty ? ' dirty' : '') + (failed ? ' bad' : '') }, state)
    ),
    React.createElement('div', { className: 'sc-docpath', title: path }, path || '（还没有卡片文件）'),
    // textarea 的文字是透明的，真正显示的是底下这层高亮；两层必须像素级对齐，
    // 所以字体/内边距/行高/折行规则全在 CSS 里成对写（见 10-css.js 的 .sc-dochlwrap）。
    React.createElement('div', { className: 'sc-dochlwrap' },
      React.createElement('div', { className: 'sc-dochl', ref: hlRef, 'aria-hidden': 'true' }, highlightNodes()),
      React.createElement('textarea', {
        className: 'sc-docarea', ref: boxRef, value: text, readOnly: readOnly,
        spellCheck: false,
        title: '右键：插入台词（选人物）/ 旁白；Enter 结束这个角色，Shift+Enter 换行并对齐',
        placeholder: readOnly
          ? '只读模式'
          : '右键插入台词（选人物）或旁白；空 → 不落盘（保存时会把已存在的文档删掉）',
        onChange: function (e) {
          const v = e.target.value
          setText(v)
          setDirty(true)
          // 每次改动都记草稿（节流）：写一半去切卡片/关窗口，回来还能接着写
          scheduleDraft(v)
        },
        onKeyDown: onKeyDown,
        onContextMenu: openMenu,
        onScroll: onScroll,
        onPointerDown: function (e) { e.stopPropagation() },
      })
    ),
    readOnly
      ? React.createElement('div', { className: 'sc-docro' },
        '只读模式：宿主半边的落盘桥不可用，这里只能看、写不回磁盘。原因：' +
        (api && api.diagnostic ? api.diagnostic() : '未知'))
      : null,
    // 菜单用面板既有的那一对（MenuList + MenuBackdrop）：**必须**靠背后那层真实遮罩关
    // 菜单，不能在 window 上听 mousedown —— 捕获阶段的 mousedown 会在菜单项的 click
    // 之前就把菜单卸载掉，于是点任何一项都没反应（这个坑写在 70-menu.js 顶上）。
    menu ? MenuBackdrop({ onClose: function () { setMenu(null) } }) : null,
    menu ? MenuList({
      x: menu.x, y: menu.y, items: speakerItems(), color: '',
      swatches: props.swatches, onEditSwatches: null,
      onColor: function () {},
      onClose: function () { setMenu(null) },
    }) : null
  )
}
