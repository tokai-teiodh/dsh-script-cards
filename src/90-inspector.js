// ══════════════════════════════════════════════════════════════════════════════
// 对话框：卡片编辑器 / 单行输入 / 确认
//
// 有了宿主半边的落盘桥之后，「在画布上改时间」不再只是改本机图谱 —— 直接写回
// 卡片文件的 frontmatter，跟项目一起进 git。
// ══════════════════════════════════════════════════════════════════════════════

function Modal(props) {
  return React.createElement('div', { className: 'sc-modal', onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose() } },
    React.createElement('div', { className: 'sc-modalbox', style: props.width ? { width: props.width } : undefined },
      React.createElement('div', { className: 'sc-modalh' },
        React.createElement('h3', null, props.title),
        React.createElement('button', { className: 'sc-expandx', onClick: props.onClose }, '×')
      ),
      React.createElement('div', { className: 'sc-modalb' }, props.children),
      props.footer ? React.createElement('div', { className: 'sc-modalf' }, props.footer) : null
    )
  )
}

function Field(props) {
  return React.createElement('label', { className: 'sc-field' },
    React.createElement('span', { className: 'sc-lbl' }, props.label),
    props.children
  )
}

function CardEditor(props) {
  const card = props.card
  const [title, setTitle] = React.useState(card.title || '')
  const [code, setCode] = React.useState(card.code || '')
  const [when, setWhen] = React.useState(card.when || '')
  const [order, setOrder] = React.useState(card.order === null || card.order === undefined ? '' : String(card.order))
  const [summary, setSummary] = React.useState(card.summary || '')
  const [tags, setTags] = React.useState((card.tags || []).join(', '))
  const [chapter, setChapter] = React.useState(props.chapterOf(card) || '')
  const [mode, setMode] = React.useState(props.modeOf(card) || '')
  const [body, setBody] = React.useState(card.body || '')
  const [busy, setBusy] = React.useState(false)

  function save() {
    setBusy(true)
    props.onSave(card, {
      title: title.trim(),
      code: code.trim(),
      when: when.trim(),
      order: order.trim() === '' ? '' : String(Number(order.trim())),
      summary: summary.trim(),
      tags: tags.split(/[,，;；]/).map(function (t) { return t.trim() }).filter(Boolean),
      body: body,
      chapter: chapter.trim(),
      mode: mode,
    }, function () { setBusy(false) })
  }

  const isBranch = card.type === 'chapter' || card.type === 'node' || card.type === 'condition' || card.type === 'result'
  const chapters = props.chapters || []

  return Modal({
    title: '编辑 ' + typeLabel(card.type) + ' · ' + card.file,
    width: 620, onClose: props.onClose,
    footer: [
      React.createElement('button', { key: 'd', className: 'sc-btn sc-btn-warn', onClick: function () { props.onDelete(card) } }, '删除卡片文件'),
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', disabled: busy, onClick: save }, busy ? '保存中…' : '保存（写回卡片文件）'),
    ],
    children: [
      React.createElement('div', { key: 'r1', className: 'sc-frow' },
        card.type === 'chapter'
          ? Field({ key: 'code', label: '章节序号', children: React.createElement('input', { className: 'sc-inp', value: code, placeholder: 'G1.1', onChange: function (e) { setCode(e.target.value) } }) })
          : null,
        Field({ key: 't', label: card.type === 'chapter' ? '章节名' : '标题', children: React.createElement('input', { className: 'sc-inp wide', value: title, onChange: function (e) { setTitle(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r2', className: 'sc-frow' },
        Field({ key: 'w', label: '时间', children: React.createElement('input', { className: 'sc-inp', value: when, placeholder: '例如 2025/4/24 傍晚', onChange: function (e) { setWhen(e.target.value) } }) }),
        Field({ key: 'o', label: '序号', children: React.createElement('input', { className: 'sc-inp num', value: order, onChange: function (e) { setOrder(e.target.value) } }) }),
        isBranch && card.type !== 'chapter'
          ? Field({ key: 'c', label: '所属章节', children: React.createElement('select', { className: 'sc-inp wide', value: chapter, onChange: function (e) { setChapter(e.target.value) } },
            React.createElement('option', { value: '' }, '（未归属）'),
            chapters.map(function (ch) { return React.createElement('option', { key: cardKey(ch), value: cardKey(ch) }, cardDisplay(ch)) })
          ) })
          : null,
        card.type === 'node'
          ? Field({ key: 'm', label: '节点形态', children: React.createElement('select', { className: 'sc-inp', value: mode, onChange: function (e) { setMode(e.target.value) } },
            React.createElement('option', { value: '' }, '普通'),
            React.createElement('option', { value: 'branch' }, '分歧')
          ) })
          : null
      ),
      React.createElement('div', { key: 'r3', className: 'sc-frow' },
        Field({ key: 'g', label: '标签', children: React.createElement('input', { className: 'sc-inp wide', value: tags, placeholder: '共通, 主线', onChange: function (e) { setTags(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r4', className: 'sc-frow' },
        Field({ key: 'su', label: '简介', children: React.createElement('input', { className: 'sc-inp full', value: summary, placeholder: '卡片最下面显示的一行；留空则取正文首段', onChange: function (e) { setSummary(e.target.value) } }) })
      ),
      React.createElement('div', { key: 'r5', className: 'sc-frow' },
        Field({ key: 'b', label: '正文（Markdown；节点可用 ## 角色 / ## 场景 / ## 内容 三段）', children: React.createElement('textarea', { className: 'sc-area', value: body, onChange: function (e) { setBody(e.target.value) } }) })
      )
    ],
  })
}

function PromptDialog(props) {
  const [value, setValue] = React.useState(props.value || '')
  return Modal({
    title: props.title,
    width: 380, onClose: props.onClose,
    footer: [
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onOk(value) } }, props.okLabel || '确定'),
    ],
    children: [
      React.createElement('input', {
        key: 'i', className: 'sc-inp full', value: value, autoFocus: true,
        onChange: function (e) { setValue(e.target.value) },
        onKeyDown: function (e) { if (e.key === 'Enter') props.onOk(value) },
      }),
      props.hint ? React.createElement('div', { key: 'h', className: 'sc-hintbox' }, props.hint) : null,
    ],
  })
}

function ConfirmDialog(props) {
  return Modal({
    title: props.title,
    width: 420, onClose: props.onClose,
    footer: [
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-warn', onClick: props.onOk }, props.okLabel || '确定'),
    ],
    children: [React.createElement('div', { key: 't', className: 'sc-p' }, props.text)],
  })
}

function ChoiceEditor(props) {
  const [list, setList] = React.useState((props.choices || []).map(function (c) { return { id: c.id, text: c.text, to: c.to } }))
  function upd(i, text) {
    const next = list.slice()
    next[i] = Object.assign({}, next[i], { text: text })
    setList(next)
  }
  return Modal({
    title: '分歧选项 · ' + cardDisplay(props.card),
    width: 520, onClose: props.onClose,
    footer: [
      React.createElement('button', { key: 'a', className: 'sc-btn', onClick: function () { setList(list.concat([{ id: uid('o'), text: '选项' + String.fromCharCode(65 + list.length), to: '' }])) } }, '＋ 添加选项（Ctrl+Enter 同效）'),
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(list) } }, '保存'),
    ],
    children: list.length === 0
      ? [React.createElement('div', { key: 'e', className: 'sc-p' }, '还没有选项。点下面的「添加选项」。')]
      : list.map(function (c, i) {
        return React.createElement('div', { key: c.id, className: 'sc-frow' },
          React.createElement('input', { className: 'sc-inp full', value: c.text, onChange: function (e) { upd(i, e.target.value) } }),
          React.createElement('button', { className: 'sc-btn', onClick: function () { setList(list.filter(function (_, j) { return j !== i })) } }, '移除')
        )
      }),
  })
}

// ── 色卡编辑：自定义色卡只存这台浏览器（按项目），不进代码仓库 ───────────────

function SwatchEditor(props) {
  const [list, setList] = React.useState(normSwatches(props.swatches))
  const [draft, setDraft] = React.useState('#7A8BA6')
  function add(hex) {
    const v = String(hex || '').trim()
    if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) return
    if (list.indexOf(v) !== -1) return
    if (list.length >= MAX_SWATCHES) return
    setList(list.concat([v]))
  }
  return Modal({
    title: '编辑色卡（只存这台浏览器，不会进代码仓库）',
    width: 460, onClose: props.onClose,
    footer: [
      React.createElement('button', {
        key: 'r', className: 'sc-btn',
        onClick: function () { setList([]) },
      }, '恢复默认 8 色'),
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(list) } }, '保存'),
    ],
    children: [
      React.createElement('div', { key: 'row', className: 'sc-frow' },
        React.createElement('input', {
          className: 'sc-colorinput', type: 'color', value: draft,
          onChange: function (e) { setDraft(e.target.value) },
        }),
        React.createElement('button', { className: 'sc-btn', onClick: function () { add(draft) } }, '＋ 加一个'),
        React.createElement('span', { className: 'sc-hintbox', style: { margin: 0 } },
          '清空后即用内置的 8 个通用色。最多 ' + MAX_SWATCHES + ' 个。')
      ),
      list.length === 0
        ? React.createElement('div', { key: 'e', className: 'sc-p' }, '当前用内置色卡。')
        : React.createElement('div', { key: 'list', className: 'sc-swatches', style: { gridTemplateColumns: 'repeat(8, 1fr)' } },
          list.map(function (hex) {
            return React.createElement('button', {
              key: hex, className: 'sc-swatch', style: { background: hex }, title: hex + '（点击移除）',
              onClick: function () { setList(list.filter(function (x) { return x !== hex })) },
            })
          }))
    ],
  })
}

// ── 设置：档案目录名 ─────────────────────────────────────────────────────────

function SettingsDialog(props) {
  const [dirs, setDirs] = React.useState(normDirs(props.dirs))
  function upd(k, v) { setDirs(Object.assign({}, dirs, { [k]: v })) }
  return Modal({
    title: '档案目录名（按项目保存，只存这台浏览器）',
    width: 480, onClose: props.onClose,
    footer: [
      React.createElement('button', { key: 'r', className: 'sc-btn', onClick: function () { setDirs(normDirs(null)) } }, '恢复默认'),
      React.createElement('span', { key: 's', className: 'sc-spacer' }),
      React.createElement('button', { key: 'c', className: 'sc-btn', onClick: props.onClose }, '取消'),
      React.createElement('button', { key: 'k', className: 'sc-btn sc-btn-on', onClick: function () { props.onSave(normDirs(dirs)) } }, '保存'),
    ],
    children: [
      React.createElement('div', { key: 'a', className: 'sc-frow' },
        Field({ key: 'ar', label: '档案总目录（放在项目根下）', children: React.createElement('input', { className: 'sc-inp wide', value: dirs.archive, onChange: function (e) { upd('archive', e.target.value) } }) }),
        Field({ key: 'ca', label: '卡片子目录', children: React.createElement('input', { className: 'sc-inp', value: dirs.cards, onChange: function (e) { upd('cards', e.target.value) } }) }),
        Field({ key: 'su', label: '归档子目录', children: React.createElement('input', { className: 'sc-inp', value: dirs.sub, onChange: function (e) { upd('sub', e.target.value) } }) })
      ),
      React.createElement('div', { key: 'h', className: 'sc-hintbox' },
        '只能是单层目录名（不能带斜杠）。默认是 剧本档案 / 卡片 / 归档，与 cards.py 一致。' +
        '落盘桥的边界由「档案总目录」决定：所有读写都必须落在它里面。')
    ],
  })
}
