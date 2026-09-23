/**
 * dsh-script-cards 的 Host 面 Typert 清单（由 typert-loader 从 `exports["./typert"]` 自动扫描注册）。
 *
 * 手写清单，结构与 @deepseek-ai/dsh-typert-generator 的产物一致：
 * 每个 invocation 对应宿主服务 `scriptCardsFs` 上的一个方法，客户端经
 * `ctx.get('remote.scriptCardsFs')` 拿到同名代理后按位置传参调用。
 *
 * 服务把「剧本档案」目录开成一组最小文件原语，让浏览器端的面板能真正把卡片与
 * 图谱写回磁盘。路径白名单在 lib/index.js 里把关：只允许 <...>/剧本档案[/...]。
 *
 * ⚠ 方法名必须避开 RemoteNamespaceService 的保留名。网关挂载客户端清单时会跑
 *   `assertMethodAvailable`：`REMOTE_NAMESPACE_FIELDS`（ctx / empty / invokeRemote /
 *   methods / name / namespace）以及**任何在 RemoteNamespaceService.prototype 上的名字**
 *   都会被拒 —— `remove` 就在原型上（它自己有个 remove(kind, method, token)）。
 *   踩过一次：方法叫 `remove` 会让 $mount 抛
 *   「client api: method "scriptCardsFs/remove" conflicts with its namespace service」，
 *   命名空间装不上，面板整体退化成只读。所以这里统一带 `fs` 前缀。
 */

import { z } from 'zod'

const str = z.string()
const okSchema = z.object({ ok: z.boolean() })

/** strict codec：同时满足 typert-loader 的「必须是 zod v4 schema」校验。 */
const codec = (name, schema) => ({
  mode: 'strict',
  typeSymbol: 'dsh-script-cards#' + name,
  schema: schema,
  create: () => schema,
})

const _str = codec('Text', str)
const _ok = codec('Ok', okSchema)
const _list = codec('DirListing', z.object({
  entries: z.array(z.object({ name: z.string(), type: z.string() })),
  missing: z.boolean(),
}))
const _read = codec('FileText', z.object({ text: z.string() }))
const _stat = codec('FileStat', z.object({ exists: z.boolean(), type: z.string(), size: z.number() }))

const SERVICE = 'scriptCardsFs'

function inv(method, parameters, result) {
  return {
    id: 'dsh-script-cards#' + SERVICE + '/' + method,
    service: SERVICE,
    namespace: SERVICE,
    method: method,
    invocation: { kind: 'direct' },
    parameters: parameters,
    result: result,
  }
}

function json(name, codecValue) {
  return { name: name, wire: name, source: 'json', codec: codecValue }
}

function member(name, signature, summary, jsDoc) {
  return { kind: 'method', name: name, signature: signature, summary: summary, jsDoc: jsDoc }
}

export const TYPERT = {
  package: 'dsh-script-cards',
  face: 'host',
  schemas: [],
  invocations: [
    inv('fsList', [json('root', _str), json('dir', _str)], _list),
    inv('fsRead', [json('root', _str), json('path', _str)], _read),
    inv('fsWrite', [json('root', _str), json('path', _str), json('text', _str)], _ok),
    inv('fsMkdir', [json('root', _str), json('path', _str)], _ok),
    inv('fsRemove', [json('root', _str), json('path', _str)], _ok),
    inv('fsStat', [json('root', _str), json('path', _str)], _stat),
  ],
  model: {
    services: [
      {
        description: '剧本档案落盘桥（ctx.scriptCardsFs）：把工作区里的「剧本档案」目录开成一组最小文件原语，供 dsh-script-cards 面板读写卡片与分支图谱。Script archive file bridge (ctx.scriptCardsFs): minimal file primitives scoped to the script-archive directory.',
        summary: '剧本档案落盘桥 (script archive file bridge)。',
        tags: [],
        jsDoc: '/** 剧本档案落盘桥（ctx.scriptCardsFs）。Script archive file bridge (ctx.scriptCardsFs). */',
        key: SERVICE,
        exportName: 'ScriptCardsFsService',
        members: [
          member('fsList',
            'fsList(root: string, dir: string): { entries: { name: string; type: string }[]; missing: boolean }',
            '列出目录条目；目录不存在时返回 missing=true。List a directory; missing=true when absent.',
            '/** 列出目录条目。\n * @param root - 边界目录（绝对路径）。\n * @param dir - 目标目录（绝对路径，必须在 root 内）。\n * @returns 条目与「目录是否存在」。\n */'),
          member('fsRead',
            'fsRead(root: string, path: string): { text: string }',
            '按 UTF-8 读取一个文本文件。Read a text file as UTF-8.',
            '/** 按 UTF-8 读取一个文本文件。\n * @param root - 边界目录。\n * @param path - 目标文件（必须在 root 内）。\n * @returns 文本内容。\n */'),
          member('fsWrite',
            'fsWrite(root: string, path: string, text: string): { ok: boolean }',
            '按 UTF-8 写入一个文本文件（必要时建目录）。Write a text file as UTF-8, creating parent directories.',
            '/** 按 UTF-8 写入一个文本文件（必要时建目录）。\n * @param root - 边界目录。\n * @param path - 目标文件（必须在 root 内）。\n * @param text - 新内容。\n * @returns 是否成功。\n */'),
          member('fsMkdir',
            'fsMkdir(root: string, path: string): { ok: boolean }',
            '递归建目录。Create a directory recursively.',
            '/** 递归建目录。\n * @param root - 边界目录。\n * @param path - 目标目录（必须在 root 内）。\n * @returns 是否成功。\n */'),
          member('fsRemove',
            'fsRemove(root: string, path: string): { ok: boolean }',
            '删除一个文件。Delete one file.',
            '/** 删除一个文件。\n * @param root - 边界目录。\n * @param path - 目标文件（必须在 root 内）。\n * @returns 文件是否已不存在。\n */'),
          member('fsStat',
            'fsStat(root: string, path: string): { exists: boolean; type: string; size: number }',
            '查看一个路径是否存在及其类型。Stat a path.',
            '/** 查看一个路径是否存在及其类型。\n * @param root - 边界目录。\n * @param path - 目标路径（必须在 root 内）。\n * @returns 存在性、类型与字节数。\n */'),
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
