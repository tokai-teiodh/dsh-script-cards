# dsh-script-cards

> DSH 的剧本卡片面板：卡片排成方片网格和两级分支画布，改完写回文件。
> A card grid and a two-level branch canvas for a project's Markdown cards in
> DeepSeek Harness; edits go straight back to the files.

剧本要跨很多次会话，人物、设定、待定问题、章节和情节分支散在一堆小文件里，总得有个
地方能一眼看完、顺手改。这个面板就是那个地方：方片网格看全貌，分支画布理章节和情节，
在浏览器里直接改，改完写回卡片文件（结构跟着项目走、能进 git，不是只存在浏览器里）。

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
- **画布**：`滚轮`缩放（以指针为中心，走 25/33/50/67/80/100/125/150/200% 这些档位）、
  空白处**左键拖动平移**（中键、`Alt+左键` 也行；`Shift+滚轮`左右移、`Alt+滚轮`上下移）；
  从卡片边缘的圆点（16px 空心整圆、1px 细圈）拖出贝塞尔连线 —— 拉的时候其它卡片的
  **入口会点亮**表示可以落，松手即连；**拖动卡片时连线实时跟着走**（不是松手才跳过去）；
  线宽统一 1.5px，箭头固定大小。底部是 iOS 后台式的堆叠条，
  把没上画的卡片拖进去或点一下落位。
- **四种卡片形态**
  - 章节卡片：`章节序号` + `章节名` 分两段显示，下面标签，最下简介；展开后是节点列表。
    章节是容器，所以没有「故事内时间」这一项。
  - 节点卡片：左上节点名、右上时间、下方简介；展开后简介让位，依次排
    `角色 / 场景 / 内容`（读正文里的 `## 角色` `## 场景` `## 内容` 小节）。
  - 分歧节点：在节点基础上，右侧一列**选项**（整列上下居中于卡片，`＋ 选项` 挂在最后一行
    下面、不参与居中），每个选项各带一个可拖的出口；接通后标出走向（`→`），
    展开后选项在下面单列一块，带一键增删。
  - 条件 / 结果卡片：只有两行（类型 + 内容）；条件卡只有右出口，结果卡只有左入口，
    右键可以互切。
- **右键菜单**：复制 / 剪切 / 粘贴 / 原地复制 / 染色 / 展开 / 移出画布 / 删除，
  空白处右键是新建（含**常用类型**与**分歧节点**）/ 粘贴 / 自动排列；快捷键
  `Ctrl+C X V D`、`空格`、`Delete`、`Ctrl+0/1`、`Esc` —— 这些快捷键**只在最近一次点击
  落在画布上时**生效，点过别处（比如对话输入框）就还给宿主，不会抢对话里的粘贴。
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
npm run visual  # 可选：真 CSS + 无头 Edge 渲染一张画布截图（.visual/*.png）
```

客户端源码拆成 `src/` 下 13 个片段，由 `scripts/build.mjs` 拼成**一个**
`__ModuleLoader__.load(...)` 调用（客户端半边必须是一个文件）。改代码请改 `src/`。

测试都是零依赖、纯 Node：

- `tests/host.mjs` —— 宿主半边：六个文件原语在真临时目录上跑通、UTF-8 往返、
  `root` 边界越界全被拒、清单形状、保留名不冲突，以及**浏览器半边挂上去的
  descriptors 与宿主清单逐端点对齐**。
- `tests/smoke.mjs` —— 客户端半边：自带一个极小的 React 替身 + 假 DOM，
  真的驱动 `lib/client.js`，覆盖两族卡片、两级画布、四种卡片形态、右键菜单、
  滚轮缩放与左键平移、展开动画、目录名可配置、色卡可自定义，以及**编辑真的写回了
  卡片文件与图谱文件**。这个替身会专门造两种时间差：`setState` 不是同步渲染
  （`defer / flush`）、以及组件卸载后 hook state 归零 —— 两类都对应真机上报过的
  问题（拖动不落盘、对话框带着上一次的输入）；它也能派发插件用
  `ref + addEventListener` 自己挂的监听器（滚轮就是自己挂的）。
- 这个替身**没有布局引擎**，也不跑 CSS，「元素被裁掉了 / 画到屏幕外了」这类问题它看不见。
  所以画布那几条关键样式是用**契约断言**钉住的：卡片不许 `overflow:hidden`（选项列挂在
  卡片盒子外面）、选项行高必须固定 30px、接口圆点必须是 16px 的空心圆且偏移 ±8px、
  连线颜色不许用 `--dsw-alias-border-l2`（那是 12% 白，画成线等于透明）、
  连线层那个 `<g>` 必须补回 `+4000`（`.sc-edges` 挂在 `-4000`）、画布层不许
  `will-change`、`translate` 必须整像素。真机上真出过的三个「看不见」的 bug 都是这一层
  （选项列整列被裁、画布糊、连线画到屏幕外）。
- `tests/visual.mjs` 补的正是这一层：把真 CSS 放进无头浏览器里渲染 + 截一张图，顺便
  读出计算样式（线是什么颜色、圆点有没有描边）。要人眼看效果时用它，别靠猜。
  主题色优先从装好的 DSH 的 `app.asar` 里取真值，找不到就用内置兜底色。

> `tests/host.mjs` 的 D / E 两段会加载 `lib/typert.js`，而它跟运行时一样从**安装它的
> 那个 DSH profile** 解析 `zod`。所以在裸克隆里跑，这两段会打印 `SKIP` 并跳过；
> 想让它们真正跑起来，请在 `profiles/<profile>/node_modules/dsh-script-cards` 里执行。

测不到的部分（鼠标手势的真实手感、真实 Typert 网关、宿主与浏览器的版本组合）要靠真机重启验证。

---

## License

MIT © tokai-teiodh
