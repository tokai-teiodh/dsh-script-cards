// ══════════════════════════════════════════════════════════════════════════════
// 样式
// ══════════════════════════════════════════════════════════════════════════════

const CSS = `
.sc-wrap{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.sc-head{display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-head h2{font-size:14px;font-weight:600;margin:0;flex:none}
.sc-count{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
.sc-spacer{flex:1;min-width:0}
.sc-ver{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8;flex:none;font-family:ui-monospace,Menlo,Consolas,monospace}
.sc-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;flex:none}
.sc-btn:hover{border-color:var(--dsw-alias-border-l2)}
.sc-btn-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sc-btn-warn{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.sc-btn[disabled]{opacity:.4;cursor:default}
.sc-seg{display:flex;flex:none;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}
.sc-segb{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;padding:4px 9px;cursor:pointer;white-space:nowrap}
.sc-segb:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-segb.on{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.sc-noticebar{display:flex;align-items:flex-start;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.sc-noticetext{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.sc-noticetext.info{color:var(--dsw-alias-label-secondary)}
.sc-noticex{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:15px;line-height:1;padding:0 2px;font-family:inherit;flex:none}
.sc-body{display:flex;flex:1;min-height:0}
.sc-list{width:330px;min-width:250px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0}
.sc-search{margin:10px 12px 4px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font-size:13px;outline:none;font-family:inherit}
.sc-items{overflow:auto;flex:1;padding:0 10px 18px}
.sc-group{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary);padding:12px 2px 7px;font-weight:600;display:flex;align-items:center;gap:8px}
.sc-group::after{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l1)}
.sc-group.pin{color:var(--dsw-alias-brand-primary)}
.sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:8px}
.sc-tile{display:flex;flex-direction:column;gap:5px;min-height:98px;padding:9px 10px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.sc-tile:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.sc-tile.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.sc-tiletop{display:flex;align-items:flex-start;gap:4px}
.sc-tiletitle{flex:1;min-width:0;font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-tileacts{flex:none;display:flex;gap:1px;opacity:0}
.sc-tile:hover .sc-tileacts{opacity:1}
.sc-tileacts.force{opacity:1}
.sc-icon{border:none;background:transparent;padding:2px;margin:0;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;line-height:0}
.sc-icon:hover{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.sc-icon.on{color:var(--dsw-alias-brand-primary)}
.sc-tilesum{margin-top:auto;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-hint{margin:10px 0 4px;padding:9px 11px;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.sc-detail{flex:1;min-width:0;overflow:auto;padding:22px 30px 80px}
.sc-empty{color:var(--dsw-alias-label-secondary);font-size:13px;padding:48px 24px;text-align:center;line-height:1.9}
.sc-empty code{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 6px;font-size:12px}
.sc-path{word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
.sc-h1{font-size:20px;font-weight:700;margin:0 0 8px;line-height:1.4}
.sc-h2{font-size:14px;font-weight:700;margin:20px 0 6px}
.sc-p{font-size:13.5px;line-height:1.8;margin:6px 0}
.sc-li{font-size:13.5px;line-height:1.8;margin:3px 0 3px 16px}
.sc-gap{height:8px}
.sc-meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:18px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sc-narrow .sc-list{width:auto;min-width:0;flex:1 1 auto;border-right:none}
.sc-narrow .sc-detail{padding:16px 16px 64px}
.sc-narrow .sc-grid{grid-template-columns:repeat(auto-fill,minmax(134px,1fr));gap:7px}
.sc-narrow .sc-head{padding:10px 12px;gap:6px}
.sc-narrow .sc-ver{display:none}
.sc-narrowhead{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-narrowhead h2{font-size:13px;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-back{border:none;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:13px;font-family:inherit;padding:0 6px 0 0;flex:none}
.sc-narrow .sc-h1{font-size:17px}
.sc-dockbtn{white-space:nowrap;display:inline-flex;align-items:center;gap:6px}

/* 标签条：**平时一点滚动条都看不到**，滑的时候才浮出一根细条（用户的要求）。
   Windows 的原生滚动条带两侧三角箭头，很丑，所以整个藏掉、也不占位；
   「悬停才显示」那种写法又会「悬停改尺寸」——滑块一出现就把标签顶走，指针落回原处又取消
   悬停，来回抖，网格跟着跳（侧栏一抖，对话列跟着换行，看起来就是「主界面的对话框莫名
   上下跳动」）。现在自己画的那根是绝对定位的，出现或消失都不挪动任何东西。
   滚动条藏掉之后就抓不到滑块了，所以标签条自己支持按住横拖（见 60-grid.js），
   拖动时文字不许被选中 —— 否则一拖就变成拖选文字，插件会跟着报错（用户报的
   「主页面的滑条没了，滑动功能整个没用了」「拖动选中文本就崩溃」）。 */
.sc-tagwrap{position:relative}
.sc-tags{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;cursor:grab;-webkit-user-select:none;user-select:none}
.sc-tags.sc-tagsdrag{cursor:grabbing}
.sc-tags::-webkit-scrollbar{width:0;height:0;display:none}
.sc-tags::-webkit-scrollbar-button{display:none;width:0;height:0}
.sc-tagbar{position:absolute;left:0;right:0;bottom:0;height:3px;pointer-events:none}
.sc-tagthumb{position:absolute;top:0;height:3px;border-radius:999px;background:var(--dsw-alias-label-secondary);opacity:.75}
.sc-tag{flex:0 0 auto;font-size:10.5px;line-height:16px;padding:0 7px;border-radius:999px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
/* 方片页整个不可拖选：卡片上没有需要复制的正文（正文在右边的详情里，那里照样能选），
   而在上面拖选文字既会误触发卡片的 click，也是那次崩溃的入口。只限主页，画布与
   各输入框不受影响。 */
.sc-group,.sc-grid,.sc-tile,.sc-tiletitle,.sc-tilesum{-webkit-user-select:none;user-select:none}

/* ── 分支画布 ─────────────────────────────────────────────────────────────── */
.sc-board{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
.sc-nav{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.sc-navbtn{width:26px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:7px;cursor:pointer;font-size:12px;font-family:inherit;padding:0;flex:none}
.sc-navbtn:hover:not([disabled]){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sc-navbtn[disabled]{opacity:.35;cursor:default}
.sc-addr{flex:1;min-width:80px;display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:8px;padding:3px 8px;font-size:12px;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
.sc-addr::-webkit-scrollbar{height:0}
.sc-crumb{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;cursor:pointer;padding:1px 2px;white-space:nowrap;flex:none}
.sc-crumb:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.sc-crumb.cur{color:var(--dsw-alias-label-primary);font-weight:600;cursor:default;text-decoration:none}
.sc-crumbsep{flex:none;color:var(--dsw-alias-label-secondary);opacity:.5;font-size:11px}
.sc-boardtip{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none;font-family:ui-monospace,Menlo,Consolas,monospace;opacity:.85}
.sc-canvas{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--dsw-alias-bg-layer-1);user-select:none;touch-action:none;cursor:grab}
.sc-canvas.panning{cursor:grabbing}
/* 不要给画布加 will-change:transform：那会把这层（里面有 8000×8000 的点阵与 SVG）
   钉成一个合成层，缩放/平移时浏览器会拿旧位图拉伸，整块画布就糊了。加了它以后
   文字要清晰只能靠运气。 */
.sc-stage{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .28s cubic-bezier(.22,.61,.36,1)}
.sc-stage.notrans{transition:none}
.sc-stage.blur{filter:blur(3px) saturate(.7);pointer-events:none}
/* 框选的框：画布坐标、跟着画布一起缩放，只画一条虚线 + 一层极淡的底，不挡任何点击。
   它在 DOM 上排在卡片**后面**，所以得自己抬层级（5），否则被卡片盖住就看不见了。 */
.sc-marquee{position:absolute;z-index:5;box-sizing:border-box;border:1px dashed var(--dsw-alias-brand-primary);background:rgba(127,127,127,.16);border-radius:2px;pointer-events:none}
.sc-dots{position:absolute;left:-4000px;top:-4000px;width:8000px;height:8000px;pointer-events:none;background-image:radial-gradient(var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:22px 22px;opacity:.7}
.sc-edges{position:absolute;left:-4000px;top:-4000px;overflow:visible;pointer-events:none}
/* 连线。颜色绝对不能用 --dsw-alias-border-l2：那是「描边级」的颜色，深色主题下算出来
   是 rgba(255,255,255,.12)，1.5px 的线画在画布上等于没有 —— 用户报的「连线是全透明的」
   就是这个（浏览器里量出来的 stroke 值就是 12% 白）。改用次要文字色。
   线宽也统一到 1.5px：普通 / 高亮 / 橡皮筋只差颜色与透明度，不再差粗细；箭头另外用
   userSpaceOnUse 固定尺寸，不再跟着线宽一起放大。 */
.sc-edge{fill:none;stroke:var(--dsw-alias-label-secondary);stroke-width:1.5;opacity:.75}
.sc-edge.on{stroke:var(--dsw-alias-brand-primary);opacity:1}
.sc-edge.temp{stroke:var(--dsw-alias-brand-primary);stroke-dasharray:5 4;opacity:1}
.sc-edgehit{fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}
.sc-arrowhead{fill:var(--dsw-alias-label-secondary)}
.sc-arrowhead-on{fill:var(--dsw-alias-brand-primary)}
.sc-scrim{position:absolute;inset:0;background:rgba(0,0,0,.32);opacity:0;transition:opacity .24s ease;pointer-events:none}
.sc-scrim.on{opacity:1}

/* 卡片（章节 / 节点 / 条件 / 结果共用外壳）。
   这里必须是 overflow:visible：分歧节点的选项列是「贴在卡片右侧」的（left:100%），
   卡片一旦自己裁溢出，整列选项连同它们的出口圆点会被裁得干干净净 —— 画布上看起来
   就是「分歧节点右边什么都没有」；接口圆点也会一起被裁成半个。 */
.sc-card{position:absolute;box-sizing:border-box;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 2px 8px rgba(0,0,0,.14);padding:8px 10px;cursor:grab;user-select:none;touch-action:none;overflow:visible;transition:box-shadow .15s,border-color .15s}
.sc-card:hover{border-color:var(--dsw-alias-label-secondary)}
.sc-card.on{border-color:var(--sc-accent,var(--dsw-alias-brand-primary));box-shadow:0 0 0 2px var(--sc-accent,var(--dsw-alias-brand-primary))}
.sc-card.dye{border-color:var(--sc-accent);background:color-mix(in srgb,var(--sc-accent) 9%,var(--dsw-alias-bg-base))}
.sc-card.dim{opacity:.35}
.sc-cardtitle{font-size:12.5px;font-weight:600;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-cardrow{display:flex;align-items:baseline;gap:6px;min-width:0}
.sc-cardcode{flex:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;font-weight:700;color:var(--sc-accent,var(--dsw-alias-brand-primary));letter-spacing:.02em}
.sc-cardname{flex:1;min-width:0;font-size:12.5px;font-weight:600;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.sc-cardwhen{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
/* 简介钉在卡片下沿：卡片改成竖版（宽 176/156/144、高 120/112/86）之后，标题和标签
   只占上半张，简介留在标题下面会有一大块空 —— auto 上边距把它压到下沿，
   跟方片页的方片是同一个观感。 */
.sc-cardsum{margin-top:auto;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
/* 条件 / 结果卡片只有两行字，竖版卡片里竖直居中 */
.sc-cardcenter{display:flex;flex-direction:column;justify-content:center;height:100%;gap:2px}
.sc-cardmono{margin-top:5px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-cardkind{font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
.sc-cardbody{margin-top:6px;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-primary);overflow:auto;flex:1;min-height:0}
.sc-cardsec{margin-top:6px}
.sc-cardsecname{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-label-secondary);margin-bottom:2px}
.sc-cardlist{margin:0;padding-left:14px}
.sc-cardlist li{font-size:11.5px;line-height:1.6}
/* 接口圆点：整个圆 + 空心（底是卡片自己的底色，只有一圈本色描边）。
   三件事缺一不可，少一件就「不是正圆」：
   ① 16px 偶数、偏移 ±8px 整数 —— 圆心落在整数像素上（半像素的圆栅格化后是发虚的椭圆；
      选项行以前是 padding 撑出的 28.67px，正是这里出的问题）；
   ② 描边 **1px** —— 2px 的圈套在 16px 的点上，1 倍缩放下栅格化成一个厚重的八边形
      （放大 10 倍看就是一个多边形的甜甜圈），细圈才读得出「是个圆」；
   ③ 尺寸恒定、不用 transform 缩放（scale(1.3) 那种同样会发虚）。
   悬停 / 选中时整亮；被当目标时整颗填实。 */
.sc-port{position:absolute;top:50%;margin-top:-8px;width:16px;height:16px;box-sizing:border-box;padding:0;border-radius:50%;background:var(--dsw-alias-bg-base);border:1px solid var(--sc-accent,var(--dsw-alias-brand-primary));cursor:crosshair;opacity:.9}
.sc-port.in{left:-8px}
.sc-port.out{right:-8px}
.sc-card:hover .sc-port,.sc-card.on .sc-port{opacity:1}
.sc-port.hot{opacity:1;background:var(--sc-accent,var(--dsw-alias-brand-primary))}
/* 连线标签：HTML 层，跟着画布一起平移缩放。平时线上什么都没有，**点一下那条线**，
   它才浮出一个输入框（用户的要求：不选中的时候直接隐藏）；已经起过名字的线，名字
   一直挂着，点名字改。
   ⚠ 它必须是 .sc-stage 的直接子元素：塞进连线的 <svg> 里浏览器根本不画（0×0、点不到）。
   z-index：DOM 上它在卡片前面，但线的中点常落在卡片底下，不给它抬起来就会被卡片压住 ——
   输入框只露半个（用户报的「输入框图层在最底下，看不全」）。6 高过卡片（auto）和
   选项列（2），但低于展开的大卡片（30）。 */
.sc-elabel{position:absolute;z-index:6;transform:translate(-50%,-50%);font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
.sc-elabel:hover{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}
.sc-elabel.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
/* 起名字用的输入框：宽度跟标签一致，选中时才出现，别把画布撑出任何东西 */
.sc-elabeledit{z-index:7;width:118px;padding:2px 8px;font-family:inherit;outline:none;color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);cursor:text}
.sc-elabeledit::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}

/* 分歧节点的选项：贴在卡片右侧。整列按「选项本身」的高度上下居中，下面的 ＋ 按钮
   挂在最后一个选项下面、不参与居中（用户的要求：居中的选项不包括 ＋，但 ＋ 照样在）。
   没有布局引擎可测量，所以列顶由 JS 算出来写成行内 top —— 连线起点用的是同一套几何，
   两边不会各说各话。
   ⚠ 这一列（以及里面的选项）都不能写 overflow:hidden：出口圆点有一半在盒子外面，
   谁裁溢出，圆点就被裁成半个（卡片上刚踩过一模一样的坑）。 */
.sc-choices{position:absolute;left:100%;margin-left:14px;width:170px;display:flex;flex-direction:column;gap:5px;z-index:2}
/* 选项行高固定 30px、单行不换行（超长省略号，悬停看 title，展开卡片里读全文）。
   行高一浮动，后面的行、出口圆点、连线起点就全对不上。 */
.sc-choice{position:relative;box-sizing:border-box;height:30px;display:flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);padding:0 8px;font-size:11.5px;line-height:1.45;cursor:pointer}
.sc-choice:hover{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
.sc-choice.on{border-color:var(--sc-accent,var(--dsw-alias-brand-primary));color:var(--sc-accent,var(--dsw-alias-brand-primary))}
.sc-choicetext{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.sc-choice .sc-port{top:50%;margin-top:-8px;opacity:1}
.sc-choice .sc-choicego{flex:none;opacity:.75}
.sc-choice.linked{border-color:var(--sc-accent,var(--dsw-alias-brand-primary))}
.sc-choiceadd{box-sizing:border-box;height:30px;border:1px dashed var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:inherit;padding:0 8px;cursor:pointer;text-align:left}
.sc-choiceadd:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}

/* 章节卡片的节点列表（展开态）：一次最多显示 5 行，剩下的用滑条 */
.sc-nodelist{margin-top:6px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1;min-height:0;max-height:106px}
.sc-nodelist::-webkit-scrollbar{width:5px}
.sc-nodelist::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
.sc-nodelistrow{display:flex;align-items:baseline;gap:6px;font-size:11px;line-height:1.4;padding:2px 5px;border-radius:6px;cursor:pointer}
.sc-nodelistrow:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-nodelistrow .n{flex:none;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
.sc-nodelistrow .t{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

/* 展开态：卡片移到中央后放大，背景（含其他卡片）虚化 */
.sc-expand{position:absolute;box-sizing:border-box;border-radius:14px;border:1px solid var(--sc-accent,var(--dsw-alias-brand-primary));background:var(--dsw-alias-bg-base);box-shadow:0 18px 50px rgba(0,0,0,.4);padding:16px 18px;display:flex;flex-direction:column;z-index:30;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1)}
.sc-expand.open{box-shadow:0 26px 70px rgba(0,0,0,.5)}
.sc-expandh{display:flex;align-items:baseline;gap:8px;flex:none;padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:8px}
.sc-expand h3{margin:0;font-size:16px;font-weight:700;flex:1;min-width:0}
.sc-expandx{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:17px;line-height:1;cursor:pointer;font-family:inherit;padding:0 2px;flex:none}
.sc-expandx:hover{color:var(--dsw-alias-label-primary)}
.sc-expandbody{flex:1;min-height:0;overflow:auto;font-size:12.5px;line-height:1.75}

/* 右键菜单 */
.sc-menuback{position:fixed;inset:0;z-index:99996}
.sc-menu{position:fixed;z-index:99998;min-width:172px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 12px 34px rgba(0,0,0,.34);padding:5px;font-size:12.5px}
.sc-menuitem{display:flex;align-items:center;gap:8px;padding:5px 9px;border-radius:7px;cursor:pointer;white-space:nowrap;color:inherit;background:transparent;border:none;font-family:inherit;font-size:12.5px;width:100%;text-align:left}
.sc-menuitem:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-menuitem[disabled]{opacity:.4;cursor:default}
.sc-menuitem[disabled]:hover{background:transparent}
.sc-menuitem .k{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
.sc-menusep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px}
.sc-menuhead{padding:4px 9px 6px;font-size:10.5px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}
.sc-submenu{position:fixed;z-index:99999;min-width:150px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 12px 34px rgba(0,0,0,.34);padding:5px;font-size:12.5px}
.sc-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px 9px 8px}
.sc-swatch{width:24px;height:24px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);cursor:pointer;padding:0}
.sc-swatch:hover{transform:scale(1.1)}
.sc-swatchsel{box-shadow:0 0 0 2px var(--dsw-alias-bg-base),0 0 0 4px var(--dsw-alias-brand-primary)}
.sc-colorrow{display:flex;align-items:center;gap:8px;padding:4px 9px 7px}
.sc-colorinput{width:38px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;cursor:pointer}

/* 状态栏 */
.sc-status{display:flex;align-items:center;gap:10px;padding:4px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none}
.sc-status .sp{flex:1}
.sc-zoombar{display:flex;align-items:center;gap:4px;flex:none}

/* 底部堆叠条（iOS 后台那股味道） */
.sc-dock{flex:none;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);padding:6px 10px 8px}
.sc-dockhead{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-bottom:5px}
.sc-dockstrip{position:relative;height:80px;overflow-x:auto;overflow-y:hidden}
.sc-dockstrip::-webkit-scrollbar{height:5px}
.sc-dockstrip::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}
.sc-dockinner{position:relative;height:100%}
.sc-dockcard{position:absolute;top:4px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 7px rgba(0,0,0,.16);padding:7px 8px;box-sizing:border-box;cursor:pointer;overflow:hidden;transition:transform .12s;touch-action:none;user-select:none}
.sc-dockcard:hover{transform:translateY(-7px) scale(1.05);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.sc-dockcardtitle{font-size:11px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-dockcardwhen{margin-top:3px;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.sc-ghost{border-radius:12px;border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);box-shadow:0 10px 26px rgba(0,0,0,.36);opacity:.94;pointer-events:none;z-index:99999;padding:7px 8px;box-sizing:border-box}

/* 面板主体容器 */
.sc-bodycol{display:flex;flex-direction:column;flex:1;min-height:0}

/* 对话框：宽度和展开的卡片一样（PANEL_W = 460，见 src/00-head.js），
   而且用 border-box —— 那句 width 是「整块多宽」，跟 .sc-expand 一个口径，
   不然外面再加上 1px 描边就变成 462，和展开的卡片差 2px。
   以前对话框是 380 / 420 / 520 各一档，点来点去界面宽度一直在变。 */
.sc-modal{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px}
.sc-modalbox{box-sizing:border-box;width:460px;max-width:100%;max-height:100%;display:flex;flex-direction:column;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
.sc-modalh{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-modalh h3{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-modalb{padding:14px 16px;overflow:auto;flex:1;min-height:0}
.sc-modalf{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-frow{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap}
.sc-frow:last-child{margin-bottom:0}
.sc-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.sc-lbl{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.4}
/* box-sizing:border-box 不能少：width:100% 的输入框再加上左右内边距和描边，
   会比容器宽出 18px —— 对话框里就多出一条横向滚动条（用户报的「下面还有一个滑条，
   很明显没有必要」）。 */
.sc-inp{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:5px 8px;font-size:12.5px;font-family:inherit;outline:none;min-width:0}
.sc-inp:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-inp.num{width:72px}
.sc-inp.wide{width:230px}
.sc-inp.full{width:100%}
.sc-area{box-sizing:border-box;width:100%;min-height:200px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.7;font-family:ui-monospace,Menlo,Consolas,monospace;outline:none}
.sc-area:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-hintbox{margin-top:8px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.sc-code{background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.94em}
`
