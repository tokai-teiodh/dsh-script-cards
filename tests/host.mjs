// Host-half test for dsh-script-cards.
//   node tests/host.mjs
//
// Covers the part the browser-side smoke test cannot reach:
//   * lib/index.js registers the `scriptCardsFs` Cordis service with a valid
//     `typertRemote` binding, and the six file primitives really work against a
//     real temporary directory (including UTF-8 round-trips);
//   * every call is confined to the `root` it is given — nothing outside is
//     touched, and the directory name itself is arbitrary;
//   * lib/typert.js has the shape typert-loader demands, none of its method
//     names collide with the gateway's reserved names, and its invocations agree
//     endpoint-by-endpoint with the descriptors the browser half mounts.
//
// The Typert *gateway* itself only exists at runtime, so that leg still needs a
// DSH restart; everything on either side of it is checked here.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHarness } from './mini-react.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')

let failures = 0
let checks = 0
function ok(cond, label, detail) {
  checks++
  if (cond) console.log('  ok    ' + label)
  else {
    failures++
    console.log('  FAIL  ' + label + (detail === undefined ? '' : '   -- got ' + JSON.stringify(detail)))
  }
}
function eq(got, want, label) { ok(got === want, label, got) }
function throws(fn, label) {
  let err = null
  try { fn() } catch (e) { err = e }
  ok(!!err, label, err ? undefined : 'did not throw')
}

// ── boot the host half ───────────────────────────────────────────────────────
// 网关的 assertMethodAvailable 会拒掉这些名字（保留字段 + RemoteNamespaceService 原型）。
const RESERVED_NAMES = ['ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace',
  'install', 'installDirect', 'installScoped', 'remove', 'has', 'assertMethodAvailable',
  'dispose', 'start', 'stop', 'config']

const host = await import(pathToFileURL(path.join(PKG, 'lib', 'index.js')).href)
eq(host.name, 'dsh-script-cards', 'host half exports the plugin name')
eq(typeof host.apply, 'function', 'host half exports apply()')

const provided = []
const ctx = { provide(key, service) { provided.push({ key, service }) } }
host.apply(ctx)

eq(provided.length, 1, 'apply() provides exactly one service')
eq(provided[0].key, 'scriptCardsFs', 'the service key is scriptCardsFs')

const svc = provided[0].service
for (const m of ['fsList', 'fsRead', 'fsWrite', 'fsMkdir', 'fsRemove', 'fsStat']) {
  eq(typeof svc[m], 'function', 'service has ' + m + '()')
}

console.log('\nA. typertRemote binding')
const binding = svc.typertRemote
ok(!!binding, 'the service carries typertRemote')
eq(binding.service, svc, 'binding.service is the service object itself')
eq(binding.serviceKey, 'scriptCardsFs', 'binding.serviceKey')
eq(binding.namespace, 'scriptCardsFs', 'binding.namespace')
eq(Object.keys(svc).indexOf('typertRemote'), -1, 'typertRemote is non-enumerable')

// ── the six primitives against a real directory ──────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sc-host-'))
// 故意用一个和默认「剧本档案」不同的名字，证明宿主半边不认目录名。
const ARCHIVE = path.join(tmp, 'script-archive')
const CARDS = path.join(ARCHIVE, 'cards')
const GRAPH = path.join(ARCHIVE, 'graph.json')
const OUTSIDE = path.join(tmp, 'outside.md')

console.log('\nB. file primitives (real fs, arbitrary directory name)')
try {
  eq(svc.fsList(ARCHIVE, ARCHIVE).missing, true, 'fsList() on a missing directory reports missing=true')

  const cardPath = path.join(CARDS, 'beat-week-one.md')
  const body = '---\ntype: beat\ntitle: Week one beats\nsummary: Seven days of the common route\n---\n\n## Facts\n- Day 1 interview\n- 中文也要能往返 UTF-8\n'
  eq(svc.fsWrite(ARCHIVE, cardPath, body).ok, true, 'fsWrite() creates parent directories and writes')
  eq(fs.readFileSync(cardPath, 'utf8'), body, 'the bytes on disk match exactly')
  eq(svc.fsRead(ARCHIVE, cardPath).text, body, 'fsRead() round-trips UTF-8')

  const listed = svc.fsList(ARCHIVE, CARDS)
  eq(listed.missing, false, 'fsList() on an existing directory reports missing=false')
  eq(listed.entries.length, 1, 'fsList() sees the new file', listed.entries)
  eq(listed.entries[0].name, 'beat-week-one.md', 'entry name')
  eq(listed.entries[0].type, 'file', 'entry type')

  svc.fsWrite(ARCHIVE, path.join(CARDS, 'aaa.md'), 'x')
  svc.fsWrite(ARCHIVE, path.join(CARDS, 'zzz.md'), 'x')
  eq(svc.fsList(ARCHIVE, CARDS).entries.map((e) => e.name).join(','), 'aaa.md,beat-week-one.md,zzz.md', 'entries come back sorted')

  eq(svc.fsStat(ARCHIVE, cardPath).exists, true, 'fsStat() finds an existing file')
  eq(svc.fsStat(ARCHIVE, cardPath).type, 'file', 'fsStat() reports the type')
  ok(svc.fsStat(ARCHIVE, cardPath).size > 0, 'fsStat() reports a size')
  eq(svc.fsStat(ARCHIVE, path.join(CARDS, 'nope.md')).exists, false, 'fsStat() on a missing file says so')
  eq(svc.fsStat(ARCHIVE, ARCHIVE).type, 'directory', 'fsStat() recognises a directory')

  svc.fsMkdir(ARCHIVE, path.join(ARCHIVE, 'nested', 'deep'))
  eq(fs.existsSync(path.join(ARCHIVE, 'nested', 'deep')), true, 'fsMkdir() creates nested directories')

  svc.fsWrite(ARCHIVE, GRAPH, '{"version":1,"chapters":[],"nodes":{},"edges":[]}')
  eq(JSON.parse(svc.fsRead(ARCHIVE, GRAPH).text).version, 1, 'the graph file reads back as JSON')

  eq(svc.fsRemove(ARCHIVE, path.join(CARDS, 'zzz.md')).ok, true, 'fsRemove() deletes')
  eq(fs.existsSync(path.join(CARDS, 'zzz.md')), false, 'the file is gone')
  eq(svc.fsRemove(ARCHIVE, path.join(CARDS, 'zzz.md')).ok, true, 'fsRemove() on a missing file is idempotent')

  console.log('\nC. root confinement')
  throws(() => svc.fsWrite(ARCHIVE, OUTSIDE, 'x'), 'writing outside root is refused')
  throws(() => svc.fsWrite(ARCHIVE, path.join(ARCHIVE, '..', 'escape.md'), 'x'), 'a .. escape is refused')
  throws(() => svc.fsWrite(ARCHIVE, path.join(tmp, 'script-archive-2', 'x.md'), 'x'), 'a sibling directory with a similar name is refused')
  throws(() => svc.fsRead(ARCHIVE, 'relative/path.md'), 'a relative path is refused')
  throws(() => svc.fsRead(ARCHIVE, ''), 'an empty path is refused')
  throws(() => svc.fsRead('', ARCHIVE), 'an empty root is refused')
  throws(() => svc.fsRead(path.parse(tmp).root, path.join(path.parse(tmp).root, 'x')), 'a filesystem root as root is refused')
  eq(fs.existsSync(OUTSIDE), false, 'nothing was written outside root')

  // ── D. manifest shape + both ends agree ────────────────────────────────────
  console.log('\nD. TYPERT manifest')
  const manifest = (await import(pathToFileURL(path.join(PKG, 'lib', 'typert.js')).href)).TYPERT
  const typ = await import(pathToFileURL(path.join(PKG, 'lib', 'typert.js')).href)
  eq(typ.default, manifest, 'the module also has a default export of the same manifest')
  eq(manifest.package, 'dsh-script-cards', 'manifest.package matches the package name')
  eq(manifest.face, 'host', "manifest.face is 'host'")
  ok(Array.isArray(manifest.schemas), 'manifest.schemas is an array')
  eq(manifest.model.services.length, 1, 'one service is documented')
  eq(manifest.model.services[0].key, 'scriptCardsFs', 'the documented service key matches')
  eq(manifest.model.services[0].members.length, 6, 'the service documents 6 members')
  eq(manifest.model.events.length, 0, 'no events')
  eq(manifest.model.objects.length, 0, 'no objects')
  for (const inv of manifest.invocations) {
    eq(inv.service, 'scriptCardsFs', inv.method + ': invocation.service')
    eq(inv.namespace, 'scriptCardsFs', inv.method + ': invocation.namespace')
    eq(inv.invocation.kind, 'direct', inv.method + ': direct receiver')
    eq(inv.result.mode, 'strict', inv.method + ': result codec is strict')
    ok(!!inv.result.schema && !!inv.result.schema._zod, inv.method + ': result codec is a zod v4 schema')
    // ⚠ 这条是 v-alpha-1.0 翻过的车：网关挂载客户端清单时会拒绝任何与
    // RemoteNamespaceService 原型/保留字段同名的办法（`remove` 就在原型上），
    // 一旦撞上，$mount 抛错 → 命名空间装不上 → 面板整体只读。
    ok(RESERVED_NAMES.indexOf(inv.method) === -1, inv.method + ': does not collide with a reserved namespace name')
    eq(inv.parameters[0].wire, 'root', inv.method + ': first wire field is root')
    for (const p of inv.parameters) {
      eq(p.source, 'json', inv.method + '/' + p.wire + ': json parameter')
      eq(p.codec.mode, 'strict', inv.method + '/' + p.wire + ': strict codec')
      ok(!!p.codec.schema && !!p.codec.schema._zod, inv.method + '/' + p.wire + ': zod v4 schema')
    }
    // the declared arity must match the real method
    eq(svc[inv.method].length, inv.parameters.length, inv.method + ': declared arity matches the implementation')
  }

  // ── E. the browser half's descriptors line up with this manifest ───────────
  console.log('\nE. client contribution vs host manifest')
  const h = createHarness()
  h.installGlobals()
  globalThis.window.__ModuleLoader__ = { load(def) { globalThis.__clientDef = def } }
  await import(pathToFileURL(path.join(PKG, 'lib', 'client.js')).href)
  const mounted = []
  const remoteStub = {
    $mount(c) { mounted.push(c); return Promise.resolve(function () {}) },
    workspaceFiles: { async list() { return { ok: false, error: { code: 'error.notFound' } } } },
  }
  const clientCtx = {
    effect(fn) { const d = fn(); return typeof d === 'function' ? d : function () {} },
    get(n) {
      if (n === 'slots') return { inject(x, fn) { fn() }, register() {} }
      if (n === 'sidebarRightTabs') return { register() { return function () {} } }
      if (n === 'remote') return remoteStub
      return undefined
    },
  }
  clientCtx.remote = remoteStub
  globalThis.__clientDef.factory((n) => {
    if (n === 'react') return h.React
    throw new Error('unexpected require: ' + n)
  }).apply(clientCtx)

  eq(mounted.length, 1, 'the browser half mounts one contribution')
  const contribution = mounted[0]
  eq(contribution.package, manifest.package, 'both faces claim the same package')
  const hostByEndpoint = new Map(manifest.invocations.map((i) => [i.namespace + '/' + i.method, i]))
  eq(contribution.descriptors.length, manifest.invocations.length, 'the two faces declare the same number of methods')
  for (const d of contribution.descriptors) {
    const endpoint = d.namespace + '/' + d.method
    const match = hostByEndpoint.get(endpoint)
    ok(!!match, 'host manifest has ' + endpoint)
    if (!match) continue
    eq(d.parameters.map((p) => p.wire).join(','), match.parameters.map((p) => p.wire).join(','), endpoint + ': wire names agree')
    eq(d.invocation.kind, 'direct', endpoint + ': direct invocation')
    ok(d.parameters.every((p) => p.codec.mode === 'strict'), endpoint + ': strict client codecs')
    ok(RESERVED_NAMES.indexOf(d.method) === -1, endpoint + ': client method name is not reserved')
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('\n' + (failures === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures) + '  (' + checks + ' checks)')
if (failures !== 0) process.exit(1)
