// dsh-script-cards — host half
//
// 这个包的主体是客户端半边（lib/client.js）：剧本档案面板的界面。
//
// 宿主半边只做一件事：**开一条落盘通道**。浏览器端能读文件（remote.workspaceFiles
// ），但那条通道是只读的，面板没法把卡片、分支图谱写回磁盘。所以这里注册一个
// Cordis 服务 `scriptCardsFs`，配合 ./typert 清单走 Typert 网关暴露给客户端：
//
//   客户端  ctx.get('remote.scriptCardsFs').fsWrite(root, path, text)
//   宿主    ctx.scriptCardsFs.fsWrite(root, path, text)
//
// 安全边界：每个方法第一个参数 `root` 就是边界 —— 所有读写都必须落在 root 之内
// （见 guard）。宿主因此不需要知道档案目录叫什么名字，目录名完全由面板决定。
//
// 方法名统一带 `fs` 前缀，**不是为了好看**：网关挂载客户端清单时会拒绝任何与
// RemoteNamespaceService 原型同名的办法（`remove` 就在原型上），见 lib/typert.js
// 顶部的说明。

import fs from 'node:fs'
import path from 'node:path'

export const name = 'dsh-script-cards'

/**
 * 把一次调用的 (root, target) 收敛成允许操作的绝对路径。
 * @param root - 边界目录（绝对路径）。
 * @param target - 目标路径（绝对路径），必须落在 root 之内。
 * @returns 规范化后的目标绝对路径。
 */
function guard(root, target) {
  if (typeof root !== 'string' || root.trim() === '') throw new Error('root 为空')
  if (typeof target !== 'string' || target.trim() === '') throw new Error('路径为空')
  const rootRaw = root.trim()
  const targetRaw = target.trim()
  if (!path.isAbsolute(rootRaw) || !path.isAbsolute(targetRaw)) throw new Error('只接受绝对路径')
  const rootAbs = path.resolve(rootRaw)
  const targetAbs = path.resolve(targetRaw)
  if (path.parse(rootAbs).root === rootAbs) throw new Error('root 不能是磁盘根目录')
  const rel = path.relative(rootAbs, targetAbs)
  if (rel === '') return targetAbs
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error('落盘桥只允许操作 root 之内的文件：' + targetAbs)
  }
  return targetAbs
}

function dirEntries(dir) {
  const names = fs.readdirSync(dir, { withFileTypes: true })
  const entries = []
  for (const dirent of names) {
    let type = 'other'
    if (dirent.isFile()) type = 'file'
    else if (dirent.isDirectory()) type = 'directory'
    entries.push({ name: dirent.name, type: type })
  }
  entries.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0) })
  return entries
}

function createService() {
  const service = {
    /** 列出目录条目；目录不存在时返回 missing=true 而不是报错。 */
    fsList(root, dir) {
      const target = guard(root, dir)
      let stat
      try {
        stat = fs.statSync(target)
      } catch (e) {
        return { entries: [], missing: true }
      }
      if (!stat.isDirectory()) return { entries: [], missing: false }
      return { entries: dirEntries(target), missing: false }
    },

    fsRead(root, target) {
      return { text: fs.readFileSync(guard(root, target), 'utf8') }
    },

    fsWrite(root, target, text) {
      const file = guard(root, target)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, String(text == null ? '' : text), 'utf8')
      return { ok: true }
    },

    fsMkdir(root, target) {
      fs.mkdirSync(guard(root, target), { recursive: true })
      return { ok: true }
    },

    fsRemove(root, target) {
      fs.rmSync(guard(root, target), { force: true })
      return { ok: true }
    },

    fsStat(root, target) {
      let file
      try {
        file = guard(root, target)
      } catch (e) {
        return { exists: false, type: 'other', size: 0 }
      }
      try {
        const stat = fs.statSync(file)
        const type = stat.isFile() ? 'file' : (stat.isDirectory() ? 'directory' : 'other')
        return { exists: true, type: type, size: stat.size }
      } catch (e) {
        return { exists: false, type: 'other', size: 0 }
      }
    },
  }
  // Typert 网关的 validateBinding 认这三个字段；缺了服务注册会被拒。
  Object.defineProperty(service, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service: service, serviceKey: 'scriptCardsFs', namespace: 'scriptCardsFs' },
  })
  return service
}

export function apply(ctx) {
  ctx.provide('scriptCardsFs', createService())
}
