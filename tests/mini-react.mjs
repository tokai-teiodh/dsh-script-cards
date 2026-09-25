// Minimal React substitute + headless renderer, just enough to drive the panel
// under plain Node. It is deliberately tiny: createElement, useState/useRef/
// useEffect, a tree walker that can invoke handlers, and fake host elements whose
// getBoundingClientRect is derived from the inline style, so the branch canvas
// geometry (node hit-testing, drag & drop, link drags) is actually testable.
//
// Not a React reimplementation: no reconciliation, no keys, no batching. Hook
// state is keyed by a path through the rendered tree, which is stable for this
// panel (its stateful components sit at fixed positions).

export const CANVAS = { left: 0, top: 0, width: 900, height: 500 }

function sameDeps(a, b) {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function sameList(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function childList(ch) {
  if (ch === undefined || ch === null) return []
  return Array.isArray(ch) ? ch : [ch]
}

export function createHarness() {
  let current = null
  let rendering = false
  let dirty = false
  // 真实 React 里 setState 不会当场重渲染：它排一个宏任务，等当前事件处理完再画。
  // 于是「同一个手势里的后续事件」读到的还是上一帧的 state。defer(true) 把这一点
  // 模拟出来，专门用来抓「在原生监听器里读 state」这类 bug。
  let defer = false
  let rootEl = null
  let tree = null
  let renderCount = 0
  const instances = new Map()
  const visited = new Set()
  const effectQueue = []
  const listeners = new Map()
  // 元素级监听器（插件里用 ref + addEventListener 挂的那些，比如非 passive 的 wheel），
  // 按渲染路径存 —— ref 每次渲染都会拿到一个新的壳，监听器不能挂在壳上。
  const elListeners = new Map()
  // 假元素的滚动尺寸：标签条那种横向滚动容器要读 scrollWidth / clientWidth / scrollLeft。
  // 按渲染路径存，测试可以 view.scrollBox(node) 拿到它、预置尺寸，再断言拖动之后的 scrollLeft。
  const scrollBoxes = new Map()
  const created = []
  let storage = {}

  function scrollBoxOf(p) {
    let b = scrollBoxes.get(p)
    if (!b) { b = { scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }; scrollBoxes.set(p, b) }
    return b
  }

  // ── React surface ────────────────────────────────────────────────────────
  function createElement(type, props) {
    const p = {}
    if (props) for (const k of Object.keys(props)) p[k] = props[k]
    const kids = []
    for (let i = 2; i < arguments.length; i++) kids.push(arguments[i])
    if (kids.length === 1) p.children = kids[0]
    else if (kids.length > 1) p.children = kids
    return { $$: true, type: type, props: p }
  }

  // 真 React 的一条硬规则：同一个组件每次渲染调用的 hook **顺序和数量都必须一样**。
  // 这里边调边记，渲染结束时跟上一轮对比（见 walk）。它把「把组件当普通函数调用」这种
  // 写法变成可见的 bug —— 被调用组件的 hook 会算到调用者头上，调用点一多一少就崩，
  // 而旧版替身完全不检查，于是真机上「点卡片整个面板就崩」在这套测试里一路全绿。
  function hook(kind) {
    const inst = current
    if (!inst) throw new Error('hook (' + kind + ') 不在组件渲染里被调用')
    inst.types.push(kind)
    return inst
  }

  function useState(init) {
    const inst = hook('useState')
    const i = inst.idx++
    if (inst.hooks.length <= i) inst.hooks[i] = { v: typeof init === 'function' ? init() : init }
    const slot = inst.hooks[i]
    return [slot.v, function (next) {
      slot.v = typeof next === 'function' ? next(slot.v) : next
      if (process.env.DBG_RENDER) console.log('   [set] ' + inst.path + ' hook#' + i)
      renderSoon()
    }]
  }

  function useRef(init) {
    const inst = hook('useRef')
    const i = inst.idx++
    if (inst.hooks.length <= i) inst.hooks[i] = { r: { current: init === undefined ? null : init } }
    return inst.hooks[i].r
  }

  function useEffect(fn, deps) {
    const inst = hook('useEffect')
    const i = inst.idx++
    if (inst.hooks.length <= i) inst.hooks[i] = { deps: undefined, cleanup: undefined, fn: fn, pending: false }
    const slot = inst.hooks[i]
    slot.fn = fn
    if (!sameDeps(slot.deps, deps)) {
      slot.deps = deps ? deps.slice() : deps
      slot.pending = true
      if (process.env.DBG_RENDER) console.log('   [eff] pending ' + inst.path + ' hook#' + i + ' deps=' + JSON.stringify(deps))
    }
    effectQueue.push({ inst: inst, i: i })
  }

  const React = {
    createElement: createElement,
    useState: useState,
    useRef: useRef,
    useEffect: useEffect,
  }

  // ── tree walking ─────────────────────────────────────────────────────────
  function fakeEl(node) {
    let map = elListeners.get(node.path)
    if (!map) { map = new Map(); elListeners.set(node.path, map) }
    const box = scrollBoxOf(node.path)
    return {
      __host: node,
      getBoundingClientRect: function () { return node.rect },
      style: node.props.style || {},
      get scrollLeft() { return box.scrollLeft },
      set scrollLeft(v) { box.scrollLeft = Number(v) || 0 },
      get scrollWidth() { return box.scrollWidth },
      get clientWidth() { return box.clientWidth },
      addEventListener: function (type, fn) {
        if (!map.has(type)) map.set(type, [])
        map.get(type).push(fn)
      },
      removeEventListener: function (type, fn) {
        const list = map.get(type)
        if (!list) return
        const i = list.indexOf(fn)
        if (i !== -1) list.splice(i, 1)
      },
    }
  }

  function getInstance(path, type) {
    visited.add(path)
    let inst = instances.get(path)
    if (!inst || inst.type !== type) {
      inst = { type: type, hooks: [], idx: 0, path: path, types: [], lastTypes: null }
      instances.set(path, inst)
    }
    return inst
  }

  // 上一次渲染里在、这一次不在的组件 = 被卸载了。React 会连它的 state 一起丢掉，
  // 这里也得丢：不然「关掉对话框再打开」会带着上一次敲进去的内容（曾经因此漏掉
  // 「新建分歧节点应当预置形态」这种断言）。顺带把它的 effect 清理掉，免得
  // 卸载的组件还在 window 上挂着监听器。
  function pruneUnmounted() {
    for (const key of Array.from(instances.keys())) {
      if (visited.has(key)) continue
      const inst = instances.get(key)
      instances.delete(key)
      for (const slot of inst.hooks) {
        if (slot && typeof slot.cleanup === 'function') {
          try { slot.cleanup() } catch (e) { /* ignore */ }
          slot.cleanup = undefined
        }
      }
    }
  }

  function walk(el, path, canvasRect) {
    if (el === null || el === undefined || el === false || el === true) return null
    const t = typeof el
    if (t === 'string' || t === 'number') return { kind: 'text', text: String(el), path: path }
    if (Array.isArray(el)) {
      const out = []
      for (let i = 0; i < el.length; i++) {
        const c = walk(el[i], path + '.' + i, canvasRect)
        if (c) out.push(c)
      }
      return { kind: 'frag', children: out, path: path }
    }
    if (!el.$$) return null
    const type = el.type
    const props = el.props || {}
    if (typeof type === 'string') {
      const node = { kind: 'host', tag: type, props: props, path: path, children: [] }
      const cls = String(props.className || '')
      let inner = canvasRect
      if (/(^|\s)sc-canvas(\s|$)/.test(cls)) {
        inner = {
          left: CANVAS.left, top: CANVAS.top, width: CANVAS.width, height: CANVAS.height,
          right: CANVAS.left + CANVAS.width, bottom: CANVAS.top + CANVAS.height,
        }
        node.rect = inner
      } else if (/(^|\s)sc-card(\s|$)/.test(cls) || /(^|\s)sc-dockcard(\s|$)/.test(cls)) {
        const st = props.style || {}
        const base = canvasRect || { left: 0, top: 0 }
        const l = Number(st.left) || 0
        const tp = Number(st.top) || 0
        const w = Number(st.width) || 0
        const h = Number(st.height) || 0
        node.rect = {
          left: base.left + l, top: base.top + tp, width: w, height: h,
          right: base.left + l + w, bottom: base.top + tp + h,
        }
      } else if (/(^|\s)sc-dockstrip(\s|$)/.test(cls) || /(^|\s)sc-dockinner(\s|$)/.test(cls)) {
        node.rect = { left: 0, top: 0, width: 800, height: 80, right: 800, bottom: 80 }
      } else {
        node.rect = canvasRect
          ? { left: canvasRect.left, top: canvasRect.top, width: 0, height: 0, right: canvasRect.left, bottom: canvasRect.top }
          : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
      }
      const ref = props.ref
      if (typeof ref === 'function') ref(fakeEl(node))
      else if (ref && typeof ref === 'object') ref.current = fakeEl(node)
      const kids = childList(props.children)
      for (let i = 0; i < kids.length; i++) {
        const c = walk(kids[i], path + '/' + i, inner)
        if (c) node.children.push(c)
      }
      return node
    }
    if (typeof type === 'function') {
      const inst = getInstance(path, type)
      const prev = current
      current = inst
      inst.idx = 0
      inst.types = []
      let rendered
      try {
        rendered = type(props)
      } finally {
        current = prev
      }
      // 顺序或数量跟上一轮不一样就抛 —— 与真 React 同一套判据。
      // （真 React 在「这次比上次多」时无条件抛 "Rendered more hooks than during the
      // previous render."，「少」是 dev 下的报错；本替身两种都当错。用真 React 18.3.1
      // 验证过：把组件当普通函数调用、调用次数随数据变化，第二次渲染就抛。）
      if (inst.lastTypes && !sameList(inst.lastTypes, inst.types)) {
        throw new Error('hook 顺序/数量变了：<' + (type.name || 'anonymous') + '> at ' + path +
          '\n  上一次 [' + inst.lastTypes.join(', ') + ']\n  这一次 [' + inst.types.join(', ') + ']')
      }
      inst.lastTypes = inst.types
      // 组件的输出必须换一条子路径。否则「包装组件 → 真组件」这种嵌套会让
      // 两者抢同一个 path，getInstance 看到 type 不匹配就每次都新建实例，
      // hook 状态（含 useEffect 的 deps）全部丢失 —— 表现为无限重渲染。
      return walk(rendered, path + '~', canvasRect)
    }
    return null
  }

  function runEffects() {
    const q = effectQueue.slice()
    effectQueue.length = 0
    for (const item of q) {
      const slot = item.inst.hooks[item.i]
      if (!slot || !slot.pending) continue
      slot.pending = false
      if (typeof slot.cleanup === 'function') {
        try { slot.cleanup() } catch (e) { /* ignore */ }
      }
      const r = slot.fn()
      slot.cleanup = typeof r === 'function' ? r : undefined
    }
  }

  function renderNow() {
    if (rendering) return
    rendering = true
    try {
      let guard = 0
      do {
        dirty = false
        effectQueue.length = 0
        visited.clear()
        tree = walk(rootEl, 'root', null)
        pruneUnmounted()
        renderCount++
        runEffects()
      } while (dirty && ++guard < 60)
    } finally {
      rendering = false
    }
  }

  function renderSoon() {
    dirty = true
    if (rendering) return
    if (defer) return
    renderNow()
  }

  // ── globals the client half expects ──────────────────────────────────────
  function installGlobals(initialStorage) {
    storage = initialStorage ? initialStorage : {}
    created.length = 0
    const doc = {
      createElement: function () {
        const el = {
          setAttribute: function () {},
          remove: function () {},
          textContent: '',
        }
        created.push(el)
        return el
      },
      head: { appendChild: function () {} },
    }
    const win = {
      localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null },
        setItem: function (k, v) { storage[k] = String(v) },
        removeItem: function (k) { delete storage[k] },
      },
      addEventListener: function (type, fn) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(fn)
      },
      removeEventListener: function (type, fn) {
        const list = listeners.get(type)
        if (!list) return
        const i = list.indexOf(fn)
        if (i !== -1) list.splice(i, 1)
      },
    }
    globalThis.window = win
    globalThis.document = doc
    globalThis.setTimeout = globalThis.setTimeout || setTimeout
    return win
  }

  function dispatchWindow(type, ev) {
    const list = (listeners.get(type) || []).slice()
    for (const fn of list) fn(ev)
  }

  // ── queries ──────────────────────────────────────────────────────────────
  function flatten(node, out) {
    if (!node) return out
    if (node.kind === 'host' || node.kind === 'text') out.push(node)
    if (node.children) for (const c of node.children) flatten(c, out)
    return out
  }

  function nodes() { return flatten(tree, []) }

  function classesOf(node) {
    return String((node.props && node.props.className) || '').split(/\s+/).filter(Boolean)
  }

  function findAll(cls) {
    return nodes().filter(function (n) { return n.kind === 'host' && classesOf(n).indexOf(cls) !== -1 })
  }

  function find(cls) {
    const list = findAll(cls)
    if (!list.length) throw new Error('no element with class ' + cls)
    return list[0]
  }

  function findMaybe(cls) {
    const list = findAll(cls)
    return list.length ? list[0] : null
  }

  function textOf(node) {
    let s = ''
    const list = flatten(node, [])
    for (const n of list) if (n.kind === 'text') s += n.text
    return s
  }

  function allText() { return textOf(tree) }

  function byText(cls, needle) {
    const list = findAll(cls)
    for (const n of list) if (textOf(n).indexOf(needle) !== -1) return n
    return null
  }

  function fire(node, name, ev) {
    const h = node && node.props ? node.props[name] : null
    if (typeof h !== 'function') {
      throw new Error('no ' + name + ' handler on .' + classesOf(node).join('.'))
    }
    const e = Object.assign({
      stopPropagation: function () {},
      preventDefault: function () {},
      button: 0,
    }, ev || {})
    return h(e)
  }

  function click(node, ev) { return fire(node, 'onClick', ev) }

  // 派发给「用 ref + addEventListener 挂上去」的监听器（React 的 onWheel 是 passive，
  // 插件因此自己挂 wheel，测试也得走这条路）。
  function elEvent(node, type, ev) {
    const map = elListeners.get(node.path)
    const list = map && map.get(type) ? map.get(type).slice() : []
    if (!list.length) throw new Error('no ' + type + ' listener on .' + classesOf(node).join('.'))
    const e = Object.assign({
      stopPropagation: function () {},
      preventDefault: function () {},
      button: 0,
    }, ev || {})
    let out
    for (const fn of list) out = fn(e)
    return out
  }

  function mount(el) {
    rootEl = el
    renderNow()
    return {
      tree: function () { return tree },
      render: renderNow,
      find: find,
      findMaybe: findMaybe,
      findAll: findAll,
      byText: byText,
      text: allText,
      textOf: textOf,
      click: click,
      fire: fire,
      el: elEvent,
      window: dispatchWindow,
      renderCount: function () { return renderCount },
      defer: function (on) { defer = !!on },
      flush: function () { if (dirty) renderNow() },
      // 预置/读取某个元素的滚动尺寸（标签条的拖动靠它断言）
      scrollBox: function (node) { return scrollBoxOf(node.path) },
    }
  }

  return {
    React: React,
    createElement: createElement,
    installGlobals: installGlobals,
    mount: mount,
    storage: function () { return storage },
    created: function () { return created },
  }
}
