// ══════════════════════════════════════════════════════════════════════════════
// 插件体
// ══════════════════════════════════════════════════════════════════════════════

function apply(ctx) {
  ctx.effect(function () {
    const el = document.createElement('style')
    el.setAttribute('data-dsh-script-cards', '')
    el.textContent = CSS
    document.head.appendChild(el)
    return function () { el.remove() }
  }, 'script-cards: styles')

  const slots = ctx.get('slots')
  if (slots === undefined) return

  const wf = ctx.remote && ctx.remote.workspaceFiles
  if (wf === undefined) {
    console.warn('[script-cards] remote.workspaceFiles 不可用，面板未注册')
    return
  }

  const api = makeApi(ctx, wf)

  // 便宜的自我检查：方法名一旦撞上 RemoteNamespaceService 的保留名，$mount 会被网关
  // 拒绝（v-alpha-1.0 第一版就是这样整体只读的），所以这里先喊一声。
  const clash = CLIENT_TYPERT.descriptors.filter(function (d) { return REMOTE_RESERVED.indexOf(d.method) !== -1 })
  if (clash.length) {
    console.error('[script-cards] 落盘桥的方法名与网关保留名冲突，$mount 一定会失败：' +
      clash.map(function (d) { return d.method }).join(', '))
  }

  // 把自己那份客户端 Typert 清单挂到网关上，宿主半边的 scriptCardsFs 才会以
  // remote.scriptCardsFs 的形式出现在这里。挂载是异步的，失败会重试；最终失败也
  // 不致命 —— 面板退化成只读模式，并在顶部把原因写出来。
  const remote = ctx.get('remote') !== undefined ? ctx.get('remote') : ctx.remote
  if (remote !== undefined && typeof remote.$mount === 'function') {
    ctx.effect(function () {
      let cancelled = false
      let dispose = null
      Promise.resolve(mountBridge(remote, api.mountContribution, 3)).then(function (d) {
        if (typeof d !== 'function') return
        if (cancelled) { try { d() } catch (e) { /* 忽略 */ } } else dispose = d
      })
      return function () {
        cancelled = true
        if (typeof dispose === 'function') { try { dispose() } catch (e) { /* 忽略 */ } }
      }
    }, 'script-cards: remote contribution')
  } else {
    bumpBridge('none', 'ctx.remote 上没有 $mount')
    console.warn('[script-cards] remote.$mount 不可用，面板将以只读模式运行')
  }

  const tabs = ctx.get('sidebarRightTabs')
  const nav = ctx.get('sidebarRight')

  function tryInject(name, make) {
    try {
      slots.inject(name, function () {
        try { return make() } catch (e) {
          console.warn('[script-cards] register failed: ' + name, e)
          return function () {}
        }
      })
    } catch (e) {
      console.warn('[script-cards] slot unavailable: ' + name, e)
    }
  }

  function panel(extra) {
    return function (props) {
      return React.createElement(CardsPanel, Object.assign({
        api: api,
        sessionId: props && props.sessionId,
        useSessions: props && props.useSessions,
      }, extra || {}))
    }
  }

  if (tabs !== undefined) {
    ctx.effect(function () {
      return tabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'builtin',
        title: function () { return '剧本档案' },
        guide: [{
          id: 'archive',
          order: 10,
          title: function () { return '剧本档案' },
          description: function () { return '浏览剧本卡片、梳理章节与情节分支' },
        }],
      })
    }, 'script-cards: tab type')

    tryInject('sidebar.right.pane.tab', function () {
      return slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, panel({ narrow: true }))
    })
  } else {
    console.warn('[script-cards] sidebarRightTabs 不可用，右侧栏停靠页未注册')
  }

  if (nav !== undefined) {
    tryInject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'script-cards', order: 30, label: '剧本档案' },
        function () {
          return React.createElement('button', {
            className: 'sc-btn sc-dockbtn',
            title: '在右侧栏打开剧本档案，与对话并排',
            onClick: function () {
              try { nav.openTab(TAB_KIND) } catch (e) { console.warn('[script-cards] openTab failed', e) }
            },
          }, PanelIcon({ size: 15 }), '剧本档案')
        })
    })
  }

  tryInject('sidebar.panellist', function () {
    return slots.register(
      { name: 'sidebar.panellist', id: 'script-cards', order: 12, label: '剧本档案' },
      function (props) { return React.createElement(PanelIcon, props) })
  })

  tryInject('main', function () {
    return slots.register({ name: 'main', key: 'script-cards' }, panel({}))
  })
}

return { apply: apply, inject: inject }
