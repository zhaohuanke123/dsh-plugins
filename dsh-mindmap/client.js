/**
 * Client half of the conversation mind-map bundle.
 *
 * Renders the map folded by the Host projection unit (`useProjection('mindmap')`)
 * as a right-Sidebar page type, and offers a Session-header button that opens it.
 * The first non-empty map of a Session opens the panel once on its own.
 *
 * Layout follows the mind-map conventions rather than a logic-chart one: the
 * subject sits in the centre, top-level branches split left and right by subtree
 * weight, deeper levels run outward on their own side, and branch strokes taper
 * with depth while carrying one colour per top-level branch.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-mindmap',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'mindmap'
    /** Tab-type id; also the key both body and registered type use. */
    const TYPE_ID = '@local/dsh-mindmap'
    /** Page kind opened through `ctx.sidebarRight.openTab`. */
    const KIND = 'mindmap'
    /** Projection unit key registered by the Host half. */
    const PROJECTION_KEY = 'mindmap'

    const AUTO_SETTING_KEY = 'dsh.mindmap.v1.auto'
    const AUTO_OPENED_PREFIX = 'dsh.mindmap.v1.opened.'

    // #region pure layout
    // Everything between these markers is deterministic geometry with no React,
    // DOM, or storage access: tools/test-layout.mjs evaluates exactly this text.

    const NODE_H = 26
    const VGAP = 10
    /** Vertical pitch of one leaf node: its own height plus the sibling gap. */
    const ROW = NODE_H + VGAP
    const HGAP = 26
    const PAD = 18
    const MIN_NODE_W = 88
    const MAX_NODE_W = 340
    /** Padding, gaps, glyph, status dot, and a little slack for letter-spacing. */
    const NODE_CHROME = 48

    /** One colour per top-level branch, inherited by its whole subtree. */
    const BRANCH_COLORS = ['#4c8dff', '#e0a13a', '#59b36b', '#c271e0', '#e2725b', '#31b6c4', '#8d94f0', '#c9a227']

    /** Branch stroke width by depth: first level is the thickest. */
    function branchWidth(depth) {
      if (depth <= 1) return 5
      if (depth === 2) return 3.4
      if (depth === 3) return 2.4
      return 1.8
    }

    const KIND_GLYPH = {
      root: '◉',
      topic: '◆',
      decision: '✓',
      todo: '☐',
      open: '?',
      risk: '!',
      note: '·',
    }

    const zh = {
      'tab.title': '思维导图',
      'open': '打开思维导图',
      'head.count': '{nodes} 个节点 · {links} 条关系',
      'view.zoomIn': '放大',
      'view.zoomOut': '缩小',
      'view.fit': '适应',
      'view.hint': '拖动平移 · 点节点折叠',
      'auto.on': '自动打开：开',
      'auto.off': '自动打开：关',
      'auto.hint': '导图首次生成时自动打开右侧栏（每个会话一次）',
      'empty.title': '这张导图还没有内容',
      'empty.hint': '对话推进时模型会通过 mindmap 工具写入中心主题、分支、结论、待办和未决问题。',
      'empty.unavailable': '投影不可用',
      'empty.connecting': '正在等待会话投影…',
      'empty.noHook': '此席位未提供 useProjection',
      'kind.root': '中心主题',
      'kind.topic': '分支',
      'kind.decision': '结论',
      'kind.todo': '待办',
      'kind.open': '未决',
      'kind.risk': '风险',
      'kind.note': '备注',
      'status.todo': '待办',
      'status.doing': '进行中',
      'status.done': '完成',
      'status.open': '待定',
    }

    const en = {
      'tab.title': 'Mind map',
      'open': 'Open mind map',
      'head.count': '{nodes} nodes · {links} relations',
      'view.zoomIn': 'Zoom in',
      'view.zoomOut': 'Zoom out',
      'view.fit': 'Fit',
      'view.hint': 'Drag to pan · click a node to collapse',
      'auto.on': 'Auto-open: on',
      'auto.off': 'Auto-open: off',
      'auto.hint': 'Open the right sidebar once, when this session first gets a map',
      'empty.title': 'No map yet',
      'empty.hint':
        'As the conversation progresses the model writes the central subject, branches, decisions, todos, and open questions through the mindmap tool.',
      'empty.unavailable': 'projection unavailable',
      'empty.connecting': 'waiting for the session projection…',
      'empty.noHook': 'this seat does not expose useProjection',
      'kind.root': 'subject',
      'kind.topic': 'branch',
      'kind.decision': 'decision',
      'kind.todo': 'todo',
      'kind.open': 'open question',
      'kind.risk': 'risk',
      'kind.note': 'note',
      'status.todo': 'todo',
      'status.doing': 'in progress',
      'status.done': 'done',
      'status.open': 'open',
    }

    const STATUS_COLOR = {
      done: 'var(--dsw-alias-state-success-primary)',
      doing: 'var(--dsw-alias-brand-primary)',
      todo: 'var(--dsw-alias-state-idle-primary)',
      open: 'var(--dsw-alias-state-warn-primary)',
    }

    const CSS = [
      '.mmx-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}',
      '.mmx-head{display:flex;align-items:center;gap:8px;padding:6px 10px 4px;color:var(--dsw-alias-label-secondary)}',
      '.mmx-headTitle{color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mmx-count{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.mmx-spacer{flex:1 1 auto}',
      '.mmx-toolbar{display:flex;align-items:center;gap:6px;padding:0 10px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.mmx-btn{font:inherit;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;min-width:24px;height:22px;padding:0 6px;cursor:pointer}',
      '.mmx-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.mmx-toggle{font:inherit;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;height:22px;padding:0 8px;cursor:pointer}',
      '.mmx-toggle:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.mmx-toggle[aria-pressed="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.mmx-hint{color:var(--dsw-alias-label-secondary);opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mmx-scroll{flex:1 1 auto;min-height:0;overflow:auto;cursor:grab}',
      '.mmx-scroll[data-dragging="true"]{cursor:grabbing}',
      '.mmx-frame{position:relative}',
      '.mmx-canvas{position:absolute;left:0;top:0;transform-origin:0 0}',
      '.mmx-edges{position:absolute;left:0;top:0;pointer-events:none}',
      '.mmx-edge{fill:none;stroke-linecap:round;opacity:.45}',
      '.mmx-edgeHot{opacity:1}',
      '.mmx-link{fill:none;stroke:var(--dsw-alias-label-secondary);stroke-width:1.4;stroke-dasharray:4 4;opacity:.25}',
      '.mmx-linkHot{opacity:.85}',
      '.mmx-node{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:5px;padding:0 8px;border:1px solid;border-radius:8px;overflow:hidden}',
      '.mmx-node[data-clickable="true"]{cursor:pointer}',
      '.mmx-node[data-clickable="true"]:hover{filter:brightness(1.06)}',
      '.mmx-nodeRoot{font-weight:600;font-size:13px}',
      '.mmx-glyph{flex:none;width:11px;text-align:center;font-size:11px;line-height:1;opacity:.9}',
      '.mmx-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mmx-dot{flex:none;width:6px;height:6px;border-radius:50%}',
      '.mmx-more{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.mmx-empty{padding:14px 12px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:6px}',
      '.mmx-emptyTitle{color:var(--dsw-alias-label-primary)}',
      '.mmx-diag{color:var(--dsw-alias-label-secondary);opacity:.75}',
      '.mmx-open{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 6px;font:inherit;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:6px;cursor:pointer}',
      '.mmx-open:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.mmx-openBadge{font-size:11px;color:var(--dsw-alias-label-secondary)}',
    ].join('')

    /**
     * Read one browser-local boolean flag.
     * @param key - storage key.
     * @param fallback - value used when nothing is stored.
     * @returns the stored flag.
     */
    function readFlag(key, fallback) {
      try {
        const stored = localStorage.getItem(key)
        return stored === null ? fallback : stored === '1'
      } catch {
        return fallback
      }
    }

    /**
     * Persist one browser-local boolean flag.
     * @param key - storage key.
     * @param value - value to store.
     */
    function writeFlag(key, value) {
      try {
        localStorage.setItem(key, value ? '1' : '0')
      } catch {
        /* storage is optional; the session keeps working without it */
      }
    }

    /**
     * Estimate rendered text width at the panel's 12px font.
     *
     * Sizing from the label keeps the layout a pure function of the graph: no
     * DOM measurement and no reflow pass, while labels stay readable.
     * @param text - the label.
     * @returns the estimated pixel width.
     */
    function estimateTextWidth(text) {
      let width = 0
      for (const ch of String(text)) {
        const code = ch.codePointAt(0)
        if (code >= 0x1f300 || (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef)) width += 12
        else if (code >= 0x3000 && code <= 0x303f) width += 12
        else if (ch === ' ') width += 3.4
        else width += 6.2
      }
      return width
    }

    /**
     * Size one node box to its own label, inside the readable band.
     *
     * The measure callback is exact (`canvas.measureText` with the panel's real
     * font); the character estimate only backs it up where measurement is not
     * available, such as the offline layout check.
     * @param label - the node label.
     * @param badge - extra room for a collapsed-children badge.
     * @param type - optional `{ font, measure }` text-metrics pair.
     * @returns the box width in pixels.
     */
    function nodeWidth(label, badge, type) {
      let text = null
      if (type !== undefined && type !== null && typeof type.measure === 'function') {
        const measured = type.measure(label, type.font)
        if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) text = measured
      }
      if (text === null) text = estimateTextWidth(label)
      const wanted = text + NODE_CHROME + badge
      return Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, Math.ceil(wanted)))
    }

    /**
     * Build one smooth branch between two anchors.
     * @param x1 - parent-side anchor x.
     * @param y1 - parent centre line.
     * @param x2 - child-side anchor x.
     * @param y2 - child centre line.
     * @returns the SVG path data.
     */
    function curve(x1, y1, x2, y2) {
      const direction = x2 >= x1 ? 1 : -1
      const reach = Math.max(14, Math.abs(x2 - x1) * 0.45)
      return `M${x1},${y1} C${x1 + direction * reach},${y1} ${x2 - direction * reach},${y2} ${x2},${y2}`
    }

    /** Colour of one node's branch, with a neutral fallback. */
    function branchColor(node) {
      return typeof node.color === 'string' && node.color !== '' ? node.color : 'var(--dsw-alias-border-l2)'
    }

    /** Colour one node's border and fill from its branch colour. */
    function nodePaint(node) {
      const color = branchColor(node)
      const share = node.side === 'centre' ? 14 : 7
      return {
        borderColor: `color-mix(in srgb, ${color} 62%, transparent)`,
        background: `color-mix(in srgb, ${color} ${share}%, var(--dsw-alias-bg-layer-1))`,
      }
    }

    /**
     * Lay the graph out as a two-sided mind map.
     *
     * The subject is centred; its children join the currently lighter side so the
     * two halves stay balanced, each side stacks its level-1 branches around the
     * subject's centre line, and every depth gets one column wide enough for its
     * widest node. Coordinates stay a pure function of the graph.
     * @param graph - the projected map.
     * @param collapsed - ids whose children are hidden.
     * @param type - optional `{ font, measure }` text metrics for exact widths.
     * @returns rows, edges, cross links, canvas size, and the subject's centre.
     */
    function buildLayout(graph, collapsed, type) {
      const empty = { rows: [], edges: [], links: [], width: 0, height: 0, rootX: 0, rootY: 0 }
      if (graph === null || graph === undefined || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
        return empty
      }

      const byId = new Map()
      for (const raw of graph.nodes) {
        if (raw === null || typeof raw !== 'object') continue
        if (typeof raw.id !== 'string' || raw.id === '' || byId.has(raw.id)) continue
        byId.set(raw.id, {
          id: raw.id,
          label: typeof raw.label === 'string' ? raw.label : '',
          kind: typeof raw.kind === 'string' ? raw.kind : 'topic',
          status: typeof raw.status === 'string' ? raw.status : undefined,
          note: typeof raw.note === 'string' ? raw.note : undefined,
          parent: typeof raw.parent === 'string' && raw.parent !== '' ? raw.parent : null,
          children: [],
          visited: false,
          kids: [],
        })
      }
      if (byId.size === 0) return empty

      const roots = []
      for (const node of byId.values()) {
        const parent = node.parent === null ? undefined : byId.get(node.parent)
        if (parent !== undefined && parent !== node) parent.children.push(node)
        else roots.push(node)
      }
      // A parent cycle can leave a node with no reachable root; promote one so
      // the map always has a centre.
      const root = roots.length > 0 ? roots[0] : byId.values().next().value
      for (let index = 1; index < roots.length; index += 1) root.children.push(roots[index])

      for (const node of byId.values()) node.w = nodeWidth(node.label, 0, type)

      // Reachability first, with collapse ignored: a collapsed subtree must not
      // look like nodes a parent cycle stranded, or its hidden descendants get
      // promoted to top-level branches and the map falls apart.
      const markReachable = (node) => {
        if (node.reachable === true) return
        node.reachable = true
        for (const child of node.children) markReachable(child)
      }
      markReachable(root)
      for (const node of byId.values()) {
        if (node.reachable === true) continue
        markReachable(node)
        root.children.push(node)
      }

      // Measure each subtree's vertical band so sibling stacks never overlap.
      const measure = (node) => {
        if (node.measured === true) return node.band === undefined ? ROW : node.band
        node.measured = true
        const kids = collapsed.has(node.id) ? [] : node.children
        node.kids = kids
        node.hiddenChildren = kids.length === 0 && node.children.length > 0 ? node.children.length : 0
        if (node.hiddenChildren > 0) node.w = nodeWidth(node.label, 18, type)
        if (kids.length === 0) {
          node.band = ROW
          return ROW
        }
        let total = 0
        for (const child of kids) total += measure(child)
        total += VGAP * (kids.length - 1)
        node.band = Math.max(ROW, total)
        return node.band
      }
      measure(root)

      // Split the subject's branches by weight: each joins the lighter side.
      const right = []
      const left = []
      let rightWeight = 0
      let leftWeight = 0
      for (const child of root.kids) {
        if (rightWeight <= leftWeight) {
          right.push(child)
          rightWeight += child.band
        } else {
          left.push(child)
          leftWeight += child.band
        }
      }

      // One column per depth and side, as wide as that column's widest node.
      const levelWidth = { right: [], left: [] }
      const collect = (node, depth, side) => {
        const widths = levelWidth[side]
        if (widths[depth] === undefined || node.w > widths[depth]) widths[depth] = node.w
        for (const child of node.kids) collect(child, depth + 1, side)
      }
      for (const child of right) collect(child, 1, 'right')
      for (const child of left) collect(child, 1, 'left')

      const halfRoot = root.w / 2
      const columnX = { right: [], left: [] }
      let cursor = halfRoot + HGAP
      for (let depth = 1; depth < levelWidth.right.length; depth += 1) {
        columnX.right[depth] = cursor
        cursor += levelWidth.right[depth] + HGAP
      }
      cursor = -halfRoot - HGAP
      for (let depth = 1; depth < levelWidth.left.length; depth += 1) {
        columnX.left[depth] = cursor
        cursor -= levelWidth.left[depth] + HGAP
      }

      const rows = []
      const edges = []
      const place = (node, depth, centerY, side) => {
        node.depth = depth
        node.side = side
        node.y = centerY - NODE_H / 2
        node.x = side === 'left' ? columnX.left[depth] - node.w : columnX.right[depth]
        rows.push(node)
        let total = 0
        for (const child of node.kids) total += child.band
        total += VGAP * Math.max(0, node.kids.length - 1)
        let next = centerY - total / 2
        for (const child of node.kids) {
          const childCenter = next + child.band / 2
          place(child, depth + 1, childCenter, side)
          edges.push({ from: node, to: child, side })
          next += child.band + VGAP
        }
      }

      root.depth = 0
      root.side = 'centre'
      root.x = -halfRoot
      root.y = -NODE_H / 2
      root.hiddenChildren = 0
      rows.push(root)

      const stack = (group, side) => {
        if (group.length === 0) return
        let total = 0
        for (const child of group) total += child.band
        total += VGAP * Math.max(0, group.length - 1)
        let next = -total / 2
        for (const child of group) {
          place(child, 1, next + child.band / 2, side)
          edges.push({ from: root, to: child, side })
          next += child.band + VGAP
        }
      }
      stack(right, 'right')
      stack(left, 'left')

      // One colour per top-level branch, inherited down its subtree.
      let palette = 0
      const paint = (node, color) => {
        node.color = color
        for (const child of node.kids) paint(child, color)
      }
      root.color = 'var(--dsw-alias-brand-primary)'
      for (const child of [...right, ...left]) {
        paint(child, BRANCH_COLORS[palette % BRANCH_COLORS.length])
        palette += 1
      }

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const node of rows) {
        if (node.x < minX) minX = node.x
        if (node.y < minY) minY = node.y
        if (node.x + node.w > maxX) maxX = node.x + node.w
        if (node.y + NODE_H > maxY) maxY = node.y + NODE_H
      }
      for (const node of rows) {
        node.x += PAD - minX
        node.y += PAD - minY
      }

      const links = []
      if (Array.isArray(graph.links)) {
        for (const link of graph.links) {
          const from = byId.get(link.from)
          const to = byId.get(link.to)
          if (from === undefined || to === undefined) continue
          if (from.depth === undefined || to.depth === undefined) continue
          links.push({ from, to, label: link.label, kind: link.kind })
        }
      }

      return {
        rows,
        edges,
        links,
        width: maxX - minX + PAD * 2,
        height: maxY - minY + PAD * 2,
        rootX: root.x + root.w / 2,
        rootY: root.y + NODE_H / 2,
      }
    }

    /** Resolve one branch's anchors: inner edge of the parent, inner edge of the child. */
    function edgePath(edge) {
      const fromY = edge.from.y + NODE_H / 2
      const toY = edge.to.y + NODE_H / 2
      if (edge.side === 'left') {
        return curve(edge.from.x, fromY, edge.to.x + edge.to.w, toY)
      }
      return curve(edge.from.x + edge.from.w, fromY, edge.to.x, toY)
    }
    // #endregion pure layout

    /** Smallest scale auto-fit applies before it gives up and leaves panning. */
    const FIT_FLOOR = 0.45

    /** requestAnimationFrame with a timer fallback. */
    function nextFrame() {
      return typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0)
    }

    /**
     * Exact text metrics from an offscreen canvas, using the panel's own font.
     * @returns a `(text, font) => width` function, or one that answers null when
     * the browser provides no 2D context; the caller then falls back to the
     * character estimate.
     */
    function createTextMeasurer() {
      let context = null
      let lastFont = ''
      return (text, font) => {
        if (context === null) {
          if (typeof document === 'undefined') return null
          context = document.createElement('canvas').getContext('2d')
          if (context === null) return null
        }
        if (typeof font === 'string' && font !== '' && font !== lastFont) {
          context.font = font
          lastFont = font
        }
        return context.measureText(String(text)).width
      }
    }

    /**
     * Render the whole map for one Session.
     * @param props - slot props: the projection hook, Session id, and translator.
     * @returns the panel contents.
     */
    function MindMapTab(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const useProjection = props.useProjection
      const graph = typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined
      const [collapsed, setCollapsed] = React.useState(() => new Set())
      const [auto, setAuto] = React.useState(() => readFlag(AUTO_SETTING_KEY, true))
      const [scale, setScale] = React.useState(1)
      const [autoFit, setAutoFit] = React.useState(true)
      const [font, setFont] = React.useState('12px sans-serif')
      const [hover, setHover] = React.useState(null)
      const [dragging, setDragging] = React.useState(false)
      const scrollRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const movedRef = React.useRef(false)

      const measure = React.useMemo(() => createTextMeasurer(), [])
      const layout = React.useMemo(
        () => buildLayout(graph, collapsed, { font, measure }),
        [graph, collapsed, font, measure],
      )
      const nodeCount = graph !== null && graph !== undefined && Array.isArray(graph.nodes) ? graph.nodes.length : 0
      const linkCount = graph !== null && graph !== undefined && Array.isArray(graph.links) ? graph.links.length : 0

      // Read the panel's real font once it is mounted, so boxes are measured with it.
      React.useEffect(() => {
        const el = scrollRef.current
        if (el === null || typeof getComputedStyle !== 'function') return
        const computed = getComputedStyle(el)
        if (typeof computed.fontSize === 'string' && typeof computed.fontFamily === 'string') {
          setFont(`${computed.fontSize} ${computed.fontFamily}`)
        }
      }, [])

      const centerCanvas = React.useCallback(
        (nextScale) => {
          const el = scrollRef.current
          if (el === null) return
          el.scrollLeft = Math.max(0, (layout.width * nextScale - el.clientWidth) / 2)
          el.scrollTop = Math.max(0, (layout.height * nextScale - el.clientHeight) / 2)
        },
        [layout],
      )

      const fitScale = React.useCallback(() => {
        const el = scrollRef.current
        if (el === null || layout.width === 0 || layout.height === 0) return 1
        return Math.max(FIT_FLOOR, Math.min(1, el.clientWidth / layout.width, el.clientHeight / layout.height))
      }, [layout])

      const fit = () => {
        setAutoFit(true)
        const next = fitScale()
        setScale(next)
        nextFrame()(() => centerCanvas(next))
      }

      // Fit the whole map into the pane whenever it, the pane, or the font
      // changes — until the user zooms by hand.
      React.useEffect(() => {
        if (!autoFit) return
        const next = fitScale()
        setScale(next)
        nextFrame()(() => centerCanvas(next))
      }, [autoFit, fitScale, centerCanvas])

      const autoFitRef = React.useRef(autoFit)
      const fitRef = React.useRef(fitScale)
      const centerRef = React.useRef(centerCanvas)
      React.useEffect(() => {
        autoFitRef.current = autoFit
      }, [autoFit])
      React.useEffect(() => {
        fitRef.current = fitScale
        centerRef.current = centerCanvas
      }, [fitScale, centerCanvas])

      // The pane is resizable (dock handles, window resize): refit with it.
      React.useEffect(() => {
        const el = scrollRef.current
        if (el === null || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => {
          if (!autoFitRef.current) return
          const next = fitRef.current()
          setScale(next)
          nextFrame()(() => centerRef.current(next))
        })
        observer.observe(el)
        return () => observer.disconnect()
      }, [])

      const zoomBy = (factor) => {
        const el = scrollRef.current
        const next = Math.max(FIT_FLOOR, Math.min(2.5, scale * factor))
        setAutoFit(false)
        if (el === null) {
          setScale(next)
          return
        }
        const cx = (el.scrollLeft + el.clientWidth / 2) / scale
        const cy = (el.scrollTop + el.clientHeight / 2) / scale
        setScale(next)
        nextFrame()(() => {
          el.scrollLeft = Math.max(0, cx * next - el.clientWidth / 2)
          el.scrollTop = Math.max(0, cy * next - el.clientHeight / 2)
        })
      }

      const toggleNode = (id) => {
        if (movedRef.current) return
        setCollapsed((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const onPointerDown = (event) => {
        if (event.button !== 0) return
        const el = scrollRef.current
        if (el === null) return
        dragRef.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop }
        movedRef.current = false
        setDragging(true)
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        const el = scrollRef.current
        if (drag === null || el === null) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
        if (!movedRef.current) return
        el.scrollLeft = drag.left - dx
        el.scrollTop = drag.top - dy
      }

      const endDrag = () => {
        dragRef.current = null
        setDragging(false)
      }

      const head = h(
        'div',
        { className: 'mmx-head' },
        h(
          'span',
          { className: 'mmx-headTitle', title: graph !== null && graph !== undefined ? graph.title : undefined },
          graph !== null && graph !== undefined && graph.title ? graph.title : t('tab.title'),
        ),
        h('span', { className: 'mmx-spacer' }),
        nodeCount > 0 ? h('span', { className: 'mmx-count' }, t('head.count', { nodes: nodeCount, links: linkCount })) : null,
      )

      const autoToggle = h(
        'button',
        {
          type: 'button',
          className: 'mmx-toggle',
          'aria-pressed': auto ? 'true' : 'false',
          title: t('auto.hint'),
          onClick: () => {
            const next = !auto
            setAuto(next)
            writeFlag(AUTO_SETTING_KEY, next)
          },
        },
        auto ? t('auto.on') : t('auto.off'),
      )

      if (nodeCount === 0) {
        const diagnostic =
          typeof useProjection !== 'function'
            ? t('empty.noHook')
            : graph === undefined
              ? t('empty.unavailable')
              : t('empty.connecting')
        return h(
          'div',
          { className: 'mmx-root' },
          head,
          h(
            'div',
            { className: 'mmx-empty' },
            h('span', { className: 'mmx-emptyTitle' }, t('empty.title')),
            h('span', null, t('empty.hint')),
            h('span', { className: 'mmx-diag' }, diagnostic),
          ),
        )
      }

      const edgeNodes = layout.edges.map((edge) => {
        const active = hover !== null && (edge.from.id === hover || edge.to.id === hover)
        return h('path', {
          key: `e:${edge.from.id}->${edge.to.id}`,
          className: active ? 'mmx-edge mmx-edgeHot' : 'mmx-edge',
          d: edgePath(edge),
          stroke: branchColor(edge.to),
          strokeWidth: branchWidth(edge.to.depth),
        })
      })
      for (let index = 0; index < layout.links.length; index += 1) {
        const link = layout.links[index]
        const active = hover !== null && (link.from.id === hover || link.to.id === hover)
        edgeNodes.push(
          h('path', {
            key: `l:${link.from.id}->${link.to.id}:${index}`,
            className: active ? 'mmx-link mmx-linkHot' : 'mmx-link',
            d: curve(
              link.from.x + link.from.w,
              link.from.y + NODE_H / 2,
              link.to.x,
              link.to.y + NODE_H / 2,
            ),
          }),
        )
      }

      const nodeNodes = layout.rows.map((node) => {
        // The centre stays fixed: collapsing it would hide the whole map.
        const clickable = node.kids.length > 0 && node.side !== 'centre'
        const glyph = KIND_GLYPH[node.kind] !== undefined ? KIND_GLYPH[node.kind] : KIND_GLYPH.topic
        const kindLabel = t(`kind.${node.kind}`)
        const tooltip = [
          `${node.label}  (${kindLabel}${node.status !== undefined ? ` · ${t(`status.${node.status}`)}` : ''})`,
          node.note,
        ]
          .filter((line) => typeof line === 'string' && line !== '')
          .join('\n')
        const dot = node.status !== undefined && STATUS_COLOR[node.status] !== undefined
        return h(
          'div',
          {
            key: node.id,
            className: node.side === 'centre' ? 'mmx-node mmx-nodeRoot' : 'mmx-node',
            'data-clickable': clickable ? 'true' : 'false',
            'data-kind': node.kind,
            style: Object.assign(
              {
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.w}px`,
                height: `${NODE_H}px`,
              },
              nodePaint(node),
            ),
            title: tooltip,
            onMouseEnter: () => setHover(node.id),
            onMouseLeave: () => setHover(null),
            onClick: clickable ? () => toggleNode(node.id) : undefined,
          },
          h('span', { className: 'mmx-glyph', style: { color: node.color } }, glyph),
          h('span', { className: 'mmx-label' }, node.label),
          node.hiddenChildren > 0 ? h('span', { className: 'mmx-more' }, `+${node.hiddenChildren}`) : null,
          dot ? h('span', { className: 'mmx-dot', style: { background: STATUS_COLOR[node.status] } }) : null,
        )
      })

      const toolbar = h(
        'div',
        { className: 'mmx-toolbar' },
        h('button', { type: 'button', className: 'mmx-btn', title: t('view.zoomIn'), onClick: () => zoomBy(1.2) }, '＋'),
        h('button', { type: 'button', className: 'mmx-btn', title: t('view.zoomOut'), onClick: () => zoomBy(1 / 1.2) }, '－'),
        h('button', { type: 'button', className: 'mmx-btn', title: t('view.fit'), onClick: fit }, t('view.fit')),
        h('span', { className: 'mmx-hint' }, t('view.hint')),
        h('span', { className: 'mmx-spacer' }),
        autoToggle,
      )

      return h(
        'div',
        { className: 'mmx-root' },
        head,
        toolbar,
        h(
          'div',
          {
            className: 'mmx-scroll',
            ref: scrollRef,
            'data-dragging': dragging ? 'true' : 'false',
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerLeave: endDrag,
            onPointerCancel: endDrag,
          },
          h(
            'div',
            { className: 'mmx-frame', style: { width: `${layout.width * scale}px`, height: `${layout.height * scale}px` } },
            h(
              'div',
              { className: 'mmx-canvas', style: { width: `${layout.width}px`, height: `${layout.height}px`, transform: `scale(${scale})` } },
              h('svg', { className: 'mmx-edges', width: layout.width, height: layout.height }, edgeNodes),
              nodeNodes,
            ),
          ),
        ),
      )
    }

    /**
     * Render the Session-header button, and open the panel on the first map.
     * @param props - slot props: inject face, projection hook, Session id, translator.
     * @returns the header control.
     */
    function MindMapHeaderButton(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const useProjection = props.useProjection
      const graph = typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined
      const count = graph !== null && graph !== undefined && Array.isArray(graph.nodes) ? graph.nodes.length : 0
      const opened = React.useRef(false)
      const open = props.open

      React.useEffect(() => {
        if (count === 0 || opened.current) return
        if (!readFlag(AUTO_SETTING_KEY, true)) {
          opened.current = true
          return
        }
        const key = `${AUTO_OPENED_PREFIX}${String(props.sessionId)}`
        try {
          if (localStorage.getItem(key) !== null) {
            opened.current = true
            return
          }
          localStorage.setItem(key, '1')
        } catch {
          /* without storage the panel still opens once per page load */
        }
        opened.current = true
        open()
      }, [count, open, props.sessionId])

      return h(
        'button',
        {
          type: 'button',
          className: 'mmx-open',
          title: t('open'),
          'aria-label': count > 0 ? `${t('open')} (${count})` : t('open'),
          onClick: () => open(),
        },
        h(
          'svg',
          { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
          h('path', { d: 'M8 8h3', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
          h('path', { d: 'M8 8c1.2 0 1.4-3.2 2.8-3.2', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
          h('path', { d: 'M8 8c1.2 0 1.4 3.2 2.8 3.2', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
          h('path', { d: 'M8 8h-3', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
          h('circle', { cx: 8, cy: 8, r: 2.4, fill: 'currentColor' }),
          h('circle', { cx: 11.6, cy: 4.6, r: 1.6, fill: 'currentColor' }),
          h('circle', { cx: 11.6, cy: 11.4, r: 1.6, fill: 'currentColor', opacity: 0.72 }),
          h('circle', { cx: 4.2, cy: 8, r: 1.6, fill: 'currentColor', opacity: 0.5 }),
        ),
        count > 0 ? h('span', { className: 'mmx-openBadge' }, String(count)) : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mindmap: dictionaries')

        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/dsh-mindmap'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'mindmap: styles')

        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TYPE_ID,
              kind: KIND,
              title: () => t('tab.title'),
              keepMounted: true,
            }),
          'mindmap: sidebar type',
        )

        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TYPE_ID, locale: NS }, MindMapTab),
        )

        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'mindmap-open',
              order: -4,
              locale: NS,
              inject: () => ({ open: () => ctx.sidebarRight.openTab(KIND) }),
            },
            MindMapHeaderButton,
          ),
        )
      },
    }
  },
})
