# dsh-script-cards

> A script-archive panel plugin for **DeepSeek Harness (DSH)** — it turns a project's
> card files into a two-level branch canvas you can edit in the browser, and writes
> every change straight back to disk.

给 **DeepSeek Harness（DSH）** 用的剧本档案面板：把项目里的卡片文件排成两级分支画布，
在浏览器里直接改，改动**真的写回磁盘**（随项目进 git，不是存在浏览器里）。

它来自一个实际的 galgame 写作流程：剧本跨很多次会话，人物、设定、待定问题、章节与
情节分支都需要一个能一眼看完的地方。这个面板就是那个地方。

---

## 它做什么

**两个视图，两族卡片，互不串门。**

| 视图 | 收哪些卡片 |
| --- | --- |
| 方片 | 存档族：`project` `character` `setting` `scene` `beat` `dialogue` `open` `decision` `reference` |
| 分支 | 分支族：`chapter` `node` `condition` `result` |

- **方片**：自适应圆角方片网格、按类型分组、标签单行横滑（滚动条不悬停不出现）、
  星标收藏 + 置顶、点开看正文。
- **分支（两级菜单）**：上级排**章节**、下级排该章节里的**情节**，配一条**浏览器式导航栏**
  （后退 / 前进 / 回到上级 / 刷新 + 面包屑地址栏）。双击章节卡片进下级。
- **画布**：`Ctrl+滚轮` 缩放、滚轮平移；从卡片右侧圆点拖出贝塞尔连线；
  底部是 iOS 后台式的堆叠条，把没上画的卡片拖进去或点一下落位。
- **四种卡片形态**
  - 章节卡片：`章节序号` + `章节名` 分两段显示，下面标签，最下简介；展开后是节点列表。
  - 节点卡片：左上节点名、右上时间、下方简介；展开后简介让位，依次排
    `角色 / 场景 / 内容`（读正文里的 `## 角色` `## 场景` `## 内容` 小节）。
  - 分歧节点：在节点基础上，右侧一列**选项**，每个选项各带一个可拖的出口；
    展开后选项在下面单列一块，带一键增删。
  - 条件 / 结果卡片：只有两行（类型 + 内容）；条件卡只有右出口，结果卡只有左入口，
    右键可以互切。
- **右键菜单**：复制 / 剪切 / 粘贴 / 原地复制 / 染色 / 展开 / 移出画布 / 删除，
  空白处右键是新建（含**常用类型**）/ 粘贴 / 自动排列；快捷键
  `Ctrl+C X V D`、`空格`、`Delete`、`Ctrl+0/1`、`Esc`。
- **展开动画**：先把视角平移到卡片居中（整块画布一个 transform，别的卡片相对位置不变）
  → 放大 → 背景（含其他卡片）虚化。

---

## 安装

这个包**没有被 npm 发布**，直接以源码形式放进 DSH 的 profile：

```powershell
# 1) 克隆进 profile 的 node_modules
git clone https://github.com/tokai-teiodh/dsh-script-cards "$env:DSH_HOME\profiles\desktop\node_modules\dsh-script-cards"

# 2) 把包名加进该 profile 的 dsh.profile.bundles（见 profiles/<profile>/package.json）
#    "dsh": { "profile": { "bundles": [ ..., "dsh-script-cards" ] } }

# 3) 重启 DSH
```

**为什么必须重启**：DSH 的浏览器客户端名单在 **boot 时**由 profile 的
`dsh.profile.bundles` 组装，Typert 清单也是启动时扫描的。改完不重启不生效。

装好之后：会话头会出现「剧本档案」按钮，右侧栏多一个可停靠的页（与对话并排），
左侧栏也有一页全屏的。

---

## 目录约定（可改）

```
<项目根>/
  剧本档案/
    卡片/*.md        ← 一张卡片一个文件
    归档/*.md        ← 会话总结
    分支.json        ← 结构：章节归属 / 画布坐标 / 分歧选项与连线 / 染色
```

**内容在卡片文件里，结构在 `分支.json` 里**，两个都落盘、都能进 git。

三个目录名不是写死的：面板右上角「设置」里可以改（按项目存在浏览器本地），
所以英文项目可以用 `script-archive/cards/archive`。

---

## 卡片格式

frontmatter 白名单（与 `cards.py` 保持一致）：

```
id / type / title / code / chapter / mode / when / order /
summary / tags / color / created / updated / source
```

```markdown
---
id: node-n1
type: node
title: 神社训练
when: 第4天
order: 10
summary: 一行简介（面板卡片最下面那行）
tags: 日常, 支线
---

## 角色
- 甲

## 场景
- 某地

## 内容
- 发生了什么
```

- `code`：章节序号，例如 `G1.1`（用于排序与地址栏）。
- `chapter`：节点所属章节的**卡片键**，形如 `card/<文件名去掉 .md>`。
- `mode: branch`：把这个节点画成分歧节点。
- `color`：卡片染色（面板右键改的是图谱里的值，优先于这里）。

---

## 配套工具（可选）

`cards.py` 是一个零依赖的 Python 小工具，负责建档案、加卡片、归档会话、刷新索引，
以及**给模型生成简介**留的两个子命令：

```powershell
python cards.py init    --root .
python cards.py add     --spec card.json --root .      # 新增卡片（--force 覆盖）
python cards.py archive --spec summary.json --root .   # 归档一次会话
python cards.py index   --root .                       # 重建索引
python cards.py list    --root . [--type open]
python cards.py summaries   --root . --missing-only --out summaries.json
python cards.py set-summary --spec summaries.json --root .   # 只改 summary/updated
```

它不属于这个仓库的依赖，面板也不依赖它 —— 手工写卡片文件一样能用。

---

## 它是怎么把改动写回磁盘的

浏览器端本来只有一条**只读**文件通道（`remote.workspaceFiles`），改不动磁盘。
所以这个包有**两半**：

- **客户端半边** `lib/client.js`：全部界面。手写、不走打包，
  用 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 约定。
- **宿主半边** `lib/index.js` + `lib/typert.js`：注册一个 Cordis 服务 `scriptCardsFs`
  （`fsList / fsRead / fsWrite / fsMkdir / fsRemove / fsStat`），
  经 **Typert** 清单 `exports["./typert"]` 暴露给浏览器，客户端用
  `ctx.remote.$mount(...)` 挂上自己的 descriptors，之后
  `ctx.get('remote.scriptCardsFs')` 就是可调用的代理。

**边界**：每个方法第一个参数 `root` 就是边界，所有读写都必须落在它之内
（`..` 逃逸、相对路径、磁盘根目录都会被拒）。宿主不需要知道目录叫什么名字。

桥挂不上时（网关没起来、版本不匹配……）面板会退化成**只读模式**，
并在顶部把**原始失败原因**写出来，而不是静默地把你的改动丢掉。

> 踩过的坑，写在 `lib/typert.js` 顶部：网关会拒绝任何与它自己那个
> `RemoteNamespaceService` 原型同名的办法（`remove` 就在原型上），撞上就
> `$mount` 抛错、整个命名空间装不上、面板静默只读。所以六个方法统一带 `fs` 前缀，
> 并且测试里断言它们不撞保留名。

---

## 开发

```powershell
npm run build   # src/*.js → lib/client.js（产物，别手改）
npm run check   # 构建一致性 + 三个 node --check + 两套无头测试
```

客户端源码拆成 `src/` 下 14 个片段，由 `scripts/build.mjs` 拼成**一个**
`__ModuleLoader__.load(...)` 调用（客户端半边必须是一个文件）。改代码请改 `src/`。

测试都是零依赖、纯 Node：

- `tests/host.mjs` —— 宿主半边：六个文件原语在真临时目录上跑通、UTF-8 往返、
  `root` 边界越界全被拒、清单形状、保留名不冲突，以及**浏览器半边挂上去的
  descriptors 与宿主清单逐端点对齐**。
- `tests/smoke.mjs` —— 客户端半边：自带一个极小的 React 替身 + 假 DOM，
  真的驱动 `lib/client.js`，覆盖两族卡片、两级画布、四种卡片形态、右键菜单、
  缩放平移、展开动画、目录名可配置、色卡可自定义，以及**编辑真的写回了
  卡片文件与图谱文件**。

测不到的部分（真 DOM 布局、CSS、SVG 箭头、真实 Typert 网关）要靠真机重启验证。

---

## License

MIT © tokai-teiodh
