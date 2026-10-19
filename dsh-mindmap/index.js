/**
 * Host half of the conversation mind-map bundle.
 *
 * The model authors the map through the `mindmap` tool; every call is a durable
 * `tool/call` event, so the map stays reconstructable from the session log. The
 * projection unit folds those events into the latest complete graph and exposes
 * it through a `wire.view`, which is the supported way to reach the Web client.
 * No new session event type is appended, and no plugin-owned storage is needed:
 * fork, resume, and replay all reproduce the same map.
 */

/** Model-facing tool name. */
const TOOL_NAME = 'mindmap'

/** Projection unit key read by the Client half through `useProjection`. */
const PROJECTION_KEY = 'mindmap'

/** Bump when the folded state shape or fold semantics change. */
const PROJECTION_STATE_VERSION = 1

/** Section order of the maintenance instruction (late, after repository sections). */
const PROMPT_SECTION_ORDER = 500

const NODE_KINDS = ['root', 'topic', 'decision', 'todo', 'open', 'risk', 'note']
const NODE_STATUS = ['todo', 'doing', 'done', 'open']
const LINK_KINDS = ['depends', 'causes', 'conflicts', 'supports', 'related']

const MAX_NODES_FALLBACK = 40
const MAX_LINKS = 60
const MAX_LABEL = 120
const MAX_NOTE = 240

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['nodes'],
  properties: {
    title: {
      type: 'string',
      description: 'Short title of the whole map (the conversation subject). Optional but recommended.',
    },
    nodes: {
      type: 'array',
      description:
        'The COMPLETE node list for the current map: one root (the subject), 3–7 top-level topics under it, then detail outward. Every call replaces the previous map, so keep the nodes that still hold and drop the ones that stopped mattering.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label'],
        properties: {
          id: {
            type: 'string',
            description: 'Stable short id, reused across calls for the same item (for example "auth", "n2").',
          },
          label: {
            type: 'string',
            description:
              'A keyword, not a sentence: about 4–12 characters. Put the explanation, the numbers, and the provenance in `note`.',
          },
          kind: {
            type: 'string',
            enum: NODE_KINDS,
            description:
              'root (the subject), topic (a theme), decision (a settled conclusion), todo (planned work), open (an unanswered question), risk (a risk or conflict), note (background).',
          },
          parent: {
            type: 'string',
            description: 'Id of the containing node. Omit for a top-level node.',
          },
          status: { type: 'string', enum: NODE_STATUS, description: 'Progress of this item.' },
          note: { type: 'string', description: 'Optional one-line detail.' },
        },
      },
    },
    links: {
      type: 'array',
      description: 'Cross relations that the tree cannot express. Optional.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', description: 'Node id.' },
          to: { type: 'string', description: 'Node id.' },
          kind: { type: 'string', enum: LINK_KINDS },
          label: { type: 'string', description: 'Short relation label.' },
        },
      },
    },
  },
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'nodes', 'edges'],
  properties: {
    ok: { type: 'boolean' },
    nodes: { type: 'integer' },
    edges: { type: 'integer' },
    title: { type: 'string' },
  },
}

const PROMPT_TEXT = [
  '你有一张随着对话推进而更新的思维导图，显示在 Web 界面的右侧栏。用 `mindmap` 工具维护它。',
  '',
  '- 每次调用提交**完整快照**（原来的内容会被整体替换），不是增量补丁。',
  '- 理解任务后先立骨架：一个 root（本次对话的中心主题）+ 3–7 个 topic（一级分支），细节再往下挂；整张图不超过 4 层。',
  '- label 用**关键词**而不是句子：中文 4–12 个字，扫一眼就能看懂；解释、出处、数字放 note。',
  '- 同一件事始终用同一个 id；节点总数控制在 30 个以内，只保留仍然相关的内容。',
  '- 用 kind 表达性质（root / topic / decision 已定结论 / todo / open 未决问题 / risk / note），用 status 表达进度（todo / doing / done / open）。',
  '- 跨分支的因果、依赖、冲突用 links 记录（from/to 用节点 id）；树内关系只用 parent 表达，不要用 links 重复一遍。',
  '- 不要在每次工具调用后都更新，也不要把这张图当成待办清单的替代品。',
].join('\n')

/**
 * The projection registry validates state and wire values with their schemas.
 * A plain-JS bundle has no zod in its resolution path, so this stand-in keeps
 * the registry's `.parse` contract while accepting any JSON value it is given.
 */
const PASSTHROUGH_SCHEMA = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
}

/**
 * Trim one optional string field.
 * @param value - candidate value.
 * @param limit - maximum character count.
 * @returns the trimmed string, or undefined when nothing usable remains.
 */
function optionalText(value, limit) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

/**
 * Fold one tool call's arguments into the exact graph the client renders.
 *
 * Pure and deterministic: replaying the same log reproduces the same object, so
 * the fold never reads a clock, randomness, or plugin-owned state.
 * @param raw - the call arguments, already parsed from JSON.
 * @param maxNodes - node ceiling from the plugin configuration.
 * @returns the normalized graph, or undefined when nothing usable was supplied.
 */
function normalizeGraph(raw, maxNodes) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const list = Array.isArray(raw.nodes) ? raw.nodes : []
  const nodes = []
  const seen = new Set()

  for (const entry of list) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const id = optionalText(entry.id, 64)
    const label = optionalText(entry.label, MAX_LABEL)
    if (id === undefined || label === undefined || seen.has(id)) continue
    seen.add(id)
    nodes.push({
      id,
      label,
      kind: NODE_KINDS.includes(entry.kind) ? entry.kind : 'topic',
      parent: optionalText(entry.parent, 64) ?? null,
      status: NODE_STATUS.includes(entry.status) ? entry.status : undefined,
      note: optionalText(entry.note, MAX_NOTE),
    })
    if (nodes.length >= maxNodes) break
  }

  if (nodes.length === 0) return undefined

  const ids = new Set(nodes.map((node) => node.id))
  // A parent that is not part of this snapshot would orphan the node, so it
  // becomes a top-level node instead of an unreachable one.
  for (const node of nodes) if (node.parent !== null && !ids.has(node.parent)) node.parent = null

  // Break parent cycles too: a chain longer than the snapshot cannot be a tree,
  // and a cycle would strand every node in it.
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    let cursor = node
    let steps = 0
    while (cursor.parent !== null && steps <= nodes.length) {
      const parent = byId.get(cursor.parent)
      if (parent === undefined) break
      cursor = parent
      steps += 1
    }
    if (steps > nodes.length) node.parent = null
  }

  const links = []
  const linkKeys = new Set()
  const rawLinks = Array.isArray(raw.links) ? raw.links : []
  for (const entry of rawLinks) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const from = optionalText(entry.from, 64)
    const to = optionalText(entry.to, 64)
    if (from === undefined || to === undefined) continue
    if (from === to || !ids.has(from) || !ids.has(to)) continue
    const key = `${from}\u0000${to}`
    if (linkKeys.has(key)) continue
    linkKeys.add(key)
    links.push({
      from,
      to,
      kind: LINK_KINDS.includes(entry.kind) ? entry.kind : 'related',
      label: optionalText(entry.label, 60),
    })
    if (links.length >= MAX_LINKS) break
  }

  return { title: optionalText(raw.title, 120), nodes, links }
}

/**
 * Read the durable `tool/call` arguments of one mind-map call.
 * @param args - the stored argument payload.
 * @returns the parsed object, or undefined when the payload cannot be read.
 */
function parseArguments(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args)
    } catch {
      return undefined
    }
  }
  return args
}

/**
 * Register the mind-map tool, its projection unit, and the maintenance prompt.
 * @param ctx - the Host plugin context.
 * @param config - this bundle row's configuration.
 */
export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const maxNodes =
    Number.isInteger(settings.maxNodes) && settings.maxNodes > 0 ? settings.maxNodes : MAX_NODES_FALLBACK

  ctx.effect(
    () =>
      ctx.sessionProjections.register({
        key: PROJECTION_KEY,
        stateSchema: PASSTHROUGH_SCHEMA,
        stateVersion: PROJECTION_STATE_VERSION,
        init: () => ({ graph: null }),
        apply: (state, event) => {
          if (event.type !== 'tool/call') return state
          const data = event.data
          if (data === null || typeof data !== 'object' || data.name !== TOOL_NAME) return state
          const graph = normalizeGraph(parseArguments(data.arguments), maxNodes)
          // An unusable call leaves the previous map in place.
          if (graph === undefined) return state
          return { graph }
        },
        wire: {
          viewSchema: PASSTHROUGH_SCHEMA,
          // Returning the stored reference keeps an unchanged map from
          // republishing on every unrelated event.
          view: (state) => state.graph,
        },
      }),
    'mindmap: projection unit',
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: TOOL_NAME,
        description:
          'Maintain the conversation mind map shown in the right sidebar. Call it with the COMPLETE map (nodes replace the previous one) after understanding the task and then whenever new topics, decisions, todos, risks, or open questions appear.',
        parameters: PARAMETERS,
        output: {
          schema: OUTPUT_SCHEMA,
          render: (_args, value) => {
            const nodes = value !== null && typeof value === 'object' ? value.nodes : undefined
            const edges = value !== null && typeof value === 'object' ? value.edges : undefined
            return [
              {
                type: 'text',
                text: `Mind map updated: ${typeof nodes === 'number' ? nodes : 0} nodes, ${typeof edges === 'number' ? edges : 0} relations.`,
              },
            ]
          },
        },
        isConcurrencySafe: () => true,
        execute: async (args) => {
          const graph = normalizeGraph(args, maxNodes)
          if (graph === undefined) {
            throw new Error(
              'mindmap: `nodes` must be a non-empty array of objects with a unique `id` and a non-empty `label`.',
            )
          }
          const parents = graph.nodes.filter((node) => node.parent !== null).length
          return {
            ok: true,
            nodes: graph.nodes.length,
            edges: parents + graph.links.length,
            title: graph.title ?? '',
          }
        },
      }),
    'mindmap: tool',
  )

  if (settings.prompt !== false) {
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: 'mindmap',
          order: PROMPT_SECTION_ORDER,
          text: PROMPT_TEXT,
        }),
      'mindmap: prompt section',
    )
  }
}

export const inject = ['tools', 'sessionProjections', 'systemPrompt']
