// ══════════════════════════════════════════════════════════════════════════════
// 数据访问
//
// 读：优先走宿主半边的落盘桥（一次调用拿回文本），桥不可用时退回客户端自带的
//     只读 remote `remote.workspaceFiles`。
// 写：只有桥能做。桥不可用时面板进入只读模式，图谱退到浏览器 localStorage，
//     并在顶部把原因写清楚。
//
// 档案目录名不是写死的：api.setDirs() 由面板传入（默认 剧本档案 / 卡片 / 归档），
// 所有路径都从它拼出来。
// ══════════════════════════════════════════════════════════════════════════════

// ── 宿主半边的落盘桥（Typert 网关） ──────────────────────────────────────────
//
// 宿主半边 lib/index.js 用 ctx.provide('scriptCardsFs', ...) 注册服务，lib/typert.js
// 提供清单；这边要把**同一份清单的客户端版本**用 ctx.remote.$mount(...) 挂上去，
// 之后 ctx.get('remote.scriptCardsFs') 就是可调用的代理。
//
// 客户端清单里的 codec 不需要真的 zod：网关只在参数入口调 codec.schema.parse，
// 所以给一个恒等 parse 就够了（宿主编译期清单用的是真 zod，见 lib/typert.js）。
//
// ⚠ 方法名不能撞 RemoteNamespaceService 的保留名。网关挂载前会跑
//   `assertMethodAvailable`：REMOTE_NAMESPACE_FIELDS（ctx / empty / invokeRemote /
//   methods / name / namespace）以及原型上的任何名字都拒。**`remove` 就在原型上**，
//   v-alpha-1.0 第一版因此 $mount 直接抛错、命名空间没装成，面板整体只读。
//   所以这里六个方法统一 `fs` 前缀，并在 tests/host.mjs 里断言它们不撞保留名。
//
// 每个方法第一个参数都是 `root`（档案目录的绝对路径），宿主半边据此划定边界：
// 所有读写必须落在 root 之内。这样宿主不需要知道目录叫什么名字。

const REMOTE_RESERVED = ['ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace',
  'install', 'installDirect', 'installScoped', 'remove', 'has', 'assertMethodAvailable', 'dispose', 'start', 'stop']

function clientCodec(typeSymbol) {
  return {
    mode: 'strict',
    typeSymbol: 'dsh-script-cards#' + typeSymbol,
    schema: { parse: function (v) { return v } },
    create: function () { return { parse: function (v) { return v } } },
  }
}

function clientDescriptor(method, params) {
  return {
    id: 'dsh-script-cards#' + HOST_SERVICE + '/' + method,
    service: HOST_SERVICE,
    namespace: HOST_SERVICE,
    method: method,
    invocation: { kind: 'direct' },
    parameters: params.map(function (name) {
      return { name: name, wire: name, source: 'json', codec: clientCodec('Arg') }
    }),
    result: clientCodec('Result'),
  }
}

const CLIENT_TYPERT = {
  package: 'dsh-script-cards',
  descriptors: [
    clientDescriptor('fsList', ['root', 'dir']),
    clientDescriptor('fsRead', ['root', 'path']),
    clientDescriptor('fsWrite', ['root', 'path', 'text']),
    clientDescriptor('fsMkdir', ['root', 'path']),
    clientDescriptor('fsRemove', ['root', 'path']),
    clientDescriptor('fsStat', ['root', 'path']),
  ],
}

// ── 桥的状态：面板要能看到「为什么只读」，而且要能在挂好之后自己变回来 ────────
const bridgeState = { status: 'idle', detail: '' }
const bridgeListeners = []

function bumpBridge(status, detail) {
  bridgeState.status = status
  bridgeState.detail = detail || ''
  for (const fn of bridgeListeners.slice()) {
    try { fn(bridgeState) } catch (e) { /* 监听者自己出错不影响桥 */ }
  }
}

function onBridgeChange(fn) {
  bridgeListeners.push(fn)
  return function () {
    const i = bridgeListeners.indexOf(fn)
    if (i !== -1) bridgeListeners.splice(i, 1)
  }
}

/** 把客户端清单挂到网关上；失败会重试几次（网关可能比插件晚就绪）。 */
function mountBridge(remote, contribution, triesLeft) {
  bumpBridge('mounting', '正在挂载落盘桥…')
  return remote.$mount(contribution).then(function (dispose) {
    bumpBridge('ready', '')
    return dispose
  }).catch(function (e) {
    const msg = String(e && e.message ? e.message : e)
    const left = (triesLeft === undefined ? 3 : triesLeft) - 1
    if (left > 0) {
      bumpBridge('retrying', '第 ' + (3 - left) + ' 次挂载失败：' + msg)
      return new Promise(function (r) { setTimeout(r, 700 * (4 - left)) })
        .then(function () { return mountBridge(remote, contribution, left) })
    }
    bumpBridge('failed', msg)
    return null
  })
}

// $mount 是异步的，而且插件可能在网关就绪之前 apply，所以桥**每次用的时候现查**，
// 不做缓存 —— 缓存下来的代理可能在网关重挂之后失效。
function bridgeFrom(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return null
  const names = ['remote.' + HOST_SERVICE, HOST_SERVICE]
  for (const n of names) {
    let svc
    try { svc = ctx.get(n) } catch (e) { svc = undefined }
    if (svc && typeof svc.fsWrite === 'function' && typeof svc.fsList === 'function') return svc
  }
  return null
}

function entryOfText(kind, file, text) {
  const p = parseFront(text)
  const stem = file.slice(-3) === '.md' ? file.slice(0, -3) : file
  const type = kind === 'archive' ? 'archive' : (p.meta.type || 'reference')
  return {
    file: file,
    kind: kind,
    id: p.meta.id || stem,
    type: type,
    title: p.meta.title || stem,
    code: p.meta.code || '',
    chapter: p.meta.chapter || '',
    mode: p.meta.mode || '',
    when: p.meta.when || '',
    order: orderOf(p.meta),
    summary: p.meta.summary || '',
    tags: tagsOf(p.meta),
    color: p.meta.color || '',
    updated: p.meta.updated || p.meta.created || '',
    body: p.body,
    preview: p.body.slice(0, 150),
  }
}

function makeApi(ctx, wf) {
  function bridge() { return bridgeFrom(ctx) }

  // 会话 id 与档案目录名都由面板在挂载/改设置时注入，避免每个调用都带着它们穿层。
  const state = { session: undefined, dirs: normDirs(null) }

  function archiveRoot(root) { return joinPath(root, state.dirs.archive) }
  function cardsPath(root) { return joinPath(archiveRoot(root), state.dirs.cards) }
  function archPath(root) { return joinPath(archiveRoot(root), state.dirs.sub) }
  function graphFile(root) { return joinPath(archiveRoot(root), GRAPH_FILE) }

  function fail(res) {
    const code = res && res.error ? res.error.code : undefined
    const message = res && res.error && res.error.message ? res.error.message : ''
    return new Error(errText(message || code || '空响应'))
  }

  function pickNames(entries) {
    const out = []
    for (const e of entries) {
      if (!e || typeof e.name !== 'string') continue
      if (e.name.slice(-3) !== '.md') continue
      if (e.type !== undefined && e.type !== 'file') continue
      out.push(e.name)
    }
    out.sort()
    return out
  }

  async function listNames(root, dir) {
    const b = bridge()
    if (b) {
      const res = await b.fsList(archiveRoot(root), dir)
      if (!res || res.ok !== true) throw fail(res)
      if (res.value && res.value.missing === true) return null
      return pickNames((res.value && res.value.entries) || [])
    }
    return listNamesWf(dir)
  }

  async function listNamesWf(dir) {
    const res = await wf.list(state.session, dir, undefined)
    if (!res || res.ok !== true) {
      const code = res && res.error ? res.error.code : undefined
      if (code === 'error.notFound') return null
      throw fail(res)
    }
    return pickNames((res.value && res.value.entries) || [])
  }

  async function readText(root, path) {
    const b = bridge()
    if (b) {
      const res = await b.fsRead(archiveRoot(root), path)
      if (!res || res.ok !== true) throw fail(res)
      return String((res.value && res.value.text) || '')
    }
    const res = await wf.readAll(state.session, path, undefined)
    if (!res || res.ok !== true) throw fail(res)
    return decodeBase64Text(res.value && res.value.data)
  }

  async function writeText(root, path, text) {
    const b = bridge()
    if (!b) throw new Error('只读模式：宿主半边没有提供落盘桥，改动写不回磁盘。')
    const res = await b.fsWrite(archiveRoot(root), path, text)
    if (!res || res.ok !== true) throw fail(res)
    return true
  }

  return {
    bridge: bridge,
    canWrite: function () { return !!bridge() },
    diagnostic: function () {
      if (bridge()) return ''
      if (bridgeState.status === 'failed') return '挂载失败：' + bridgeState.detail
      if (bridgeState.status === 'retrying') return bridgeState.detail
      if (bridgeState.status === 'none') return bridgeState.detail
      if (bridgeState.status === 'mounting') return '正在挂载…'
      return '还没有尝试挂载'
    },
    onBridgeChange: onBridgeChange,
    mountContribution: CLIENT_TYPERT,
    setSession: function (id) { state.session = id },
    setDirs: function (dirs) { state.dirs = normDirs(dirs) },
    dirs: function () { return state.dirs },
    archiveRoot: archiveRoot,

    async scan(root, signal) {
      const cardsDir = cardsPath(root)
      const archDir = archPath(root)
      const cardNames = await listNames(root, cardsDir)
      if (cardNames === null) return { cards: [], archives: [], missing: true }
      const archNames = (await listNames(root, archDir)) || []
      const load = function (dir, kind, names) {
        return Promise.all(names.map(function (n) {
          return readText(root, joinPath(dir, n)).then(function (text) {
            return entryOfText(kind, n, text)
          }).catch(function () { return null })
        }))
      }
      const cards = (await load(cardsDir, 'card', cardNames)).filter(Boolean)
      const archives = (await load(archDir, 'archive', archNames)).filter(Boolean)
      archives.reverse()
      if (signal && signal.aborted) return { cards: [], archives: [] }
      return { cards: cards, archives: archives, missing: false }
    },

    readCard(root, kind, file) {
      const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
      return readText(root, joinPath(dir, file))
    },

    writeCard(root, kind, file, text) {
      const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
      return writeText(root, joinPath(dir, file), text)
    },

    async createCard(root, fields) {
      const type = String(fields.type || 'node')
      const title = String(fields.title || '').trim() || typeLabel(type)
      const id = slug(fields.id || title, 60)
      const file = slug(type, 20) + '-' + id + '.md'
      const path = joinPath(cardsPath(root), file)
      const meta = {
        id: id,
        type: type,
        title: title,
        code: fields.code || '',
        chapter: fields.chapter || '',
        mode: fields.mode || '',
        when: fields.when || '',
        order: fields.order === undefined || fields.order === null ? '' : String(fields.order),
        summary: fields.summary || '',
        tags: fields.tags || [],
        color: fields.color || '',
        created: today(),
        updated: nowStamp(),
        source: fields.source || '',
      }
      const body = String(fields.body || '')
      const text = renderFront(meta) + '\n' + body + (body.slice(-1) === '\n' || body === '' ? '' : '\n')
      await writeText(root, path, text)
      return entryOfText('card', file, text)
    },

    async deleteCard(root, kind, file) {
      const b = bridge()
      if (!b) throw new Error('只读模式：不能删除卡片文件。')
      if (typeof b.fsRemove !== 'function') throw new Error('宿主半边的落盘桥没有提供 fsRemove。')
      const dir = kind === 'archive' ? archPath(root) : cardsPath(root)
      const res = await b.fsRemove(archiveRoot(root), joinPath(dir, file))
      if (!res || res.ok !== true) throw fail(res)
      return true
    },

    graphPath: graphFile,

    async readGraph(root) {
      try {
        return normGraph(JSON.parse(await readText(root, graphFile(root))))
      } catch (e) {
        return emptyGraph()
      }
    },

    async writeGraph(root, graph) {
      const text = JSON.stringify({
        version: 1,
        chapters: graph.chapters,
        nodes: graph.nodes,
        edges: graph.edges,
      }, null, 2)
      await writeText(root, graphFile(root), text)
      return true
    },

    async ensureDir(root, name) {
      const b = bridge()
      if (!b || typeof b.fsMkdir !== 'function') return false
      const res = await b.fsMkdir(archiveRoot(root), joinPath(archiveRoot(root), name))
      return !!(res && res.ok === true)
    },
  }
}

function today() {
  const d = new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function nowStamp() {
  const d = new Date()
  return today() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

function pad2(n) { return (n < 10 ? '0' : '') + n }
