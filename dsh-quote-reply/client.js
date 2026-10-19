/**
 * Client half of the quote-and-reply bundle.
 *
 * Two seats cooperate, because the floating affordance lives in the frame-wide
 * overlay while the composer write face only exists inside a Session:
 *
 *  - `conversation.input.dock` (session scope) publishes the live composer face
 *    — draft, phase, `setDraft` / `insertText` / `captureInsertion` / `submit`,
 *    plus the host's own "return the keyboard to the composer" path — into this
 *    module, and renders the staged-quote chip while the draft quotes anything;
 *  - `shell.overlay` (root scope) renders the pill beside a transcript
 *    selection, and the comment card it opens.
 *
 * Nothing is invented in the session log: a quote leaves as ordinary user-message
 * text (a markdown blockquote with the comment below it), either submitted
 * straight from the card or staged in the draft for further editing.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-quote-reply',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'quoteReply'
    /** Reference-source name this plugin's composer chips carry. */
    const SOURCE = '@local/dsh-quote-reply'
    /** Longest quoted excerpt kept, in characters. */
    const MAX_QUOTE_CHARS = 4000
    /** Longest quoted excerpt kept, in lines. */
    const MAX_QUOTE_LINES = 80
    /** Distance between the anchor and the pill / card. */
    const FLOAT_GAP = 8
    /** Pill box, used until its measured width is known. */
    const FLOAT_W = 72
    const FLOAT_H = 27
    /** Comment card geometry. */
    const CARD_W = 400
    const CARD_H = 234

    const zh = {
      'float.label': '引用',
      'float.title': '引用选中的文字，加一条评论或回复',
      'card.title': '选中的文本',
      'card.lines': '{lines} 行',
      'card.close': '关闭',
      'card.comment': '添加评论或回复…（Enter 发送，Shift+Enter 换行）',
      'card.send': '发送',
      'card.sendTitle': '把这段引用和评论作为一条消息发出',
      'card.blocked': '输入框里已有内容：先发送或清空，或改用「附到输入框」',
      'card.attach': '附到输入框',
      'card.attachTitle': '折成一枚引用芯片放进输入框：不占地方，你可以继续写，回车时引文一起发出去',
      'card.save': '保存',
      'card.saveTitle': '把这枚引用芯片的内容改成上面的引文与评论',
      'card.cancel': '取消',
      'card.editTitle': '编辑引文与评论',
      'card.stale': '草稿已经变了，请关掉重开',
      'card.busy': '输入框正在提交，稍后再试',
      'chip.quote': '引用 {lines} 行',
      'chip.quoteComment': '引用 {lines} 行 · 评论',
      'chip.attachedTitle': '输入框里有一枚引用芯片：发送时引文和评论会一起发出去，芯片本身不占输入空间',
      'chip.edit': '编辑这条引用的评论',
      'chip.editAction': '编辑',
      'chip.removeAction': '删除',
      'chip.staged': '已引用 {lines} 行',
      'chip.stagedTitle': '输入框草稿里有引用块，它会随这条消息一起发送',
      'chip.remove': '移除引用',
      'chip.removeBlocked': '草稿里还有别的引用芯片，请在输入框里手动删掉这段引文',
    }

    const en = {
      'float.label': 'Quote',
      'float.title': 'Quote the selected text and add a comment or reply',
      'card.title': 'Selected text',
      'card.lines': '{lines} lines',
      'card.close': 'Close',
      'card.comment': 'Add a comment or reply… (Enter sends, Shift+Enter adds a line)',
      'card.send': 'Send',
      'card.sendTitle': 'Send the quote and the comment as one message',
      'card.blocked': 'The composer already has content: send or clear it first, or use "Attach to composer"',
      'card.attach': 'Attach',
      'card.attachTitle': 'Fold the quote into one chip in the composer: it takes no room, you keep typing, and Enter sends the quote too',
      'card.save': 'Save',
      'card.saveTitle': 'Rewrite the chip with the quote and comment above',
      'card.cancel': 'Cancel',
      'card.editTitle': 'Edit the quote and comment',
      'card.stale': 'The draft changed; close and reopen',
      'card.busy': 'The composer is submitting; try again in a moment',
      'chip.quote': 'Quote {lines} lines',
      'chip.quoteComment': 'Quote {lines} lines · comment',
      'chip.attachedTitle': 'The composer holds one quote chip; it is sent with your message without taking any input space',
      'chip.edit': 'Edit this quote’s comment',
      'chip.editAction': 'Edit',
      'chip.removeAction': 'Delete',
      'chip.staged': 'Quoted {lines} lines',
      'chip.stagedTitle': 'This quote block is part of the draft and is sent with the message',
      'chip.remove': 'Remove quote',
      'chip.removeBlocked': 'The composer still holds other reference chips; delete the quote block there instead',
    }

    const CSS = [
      '.dqr-float{position:fixed;z-index:40;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;height:27px;padding:0 9px;font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-shadow-lv2);cursor:pointer;pointer-events:auto;user-select:none;white-space:nowrap}',
      '.dqr-float:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dqr-mark{display:block;flex:none}',
      '.dqr-card{position:fixed;z-index:40;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px;max-height:calc(100vh - 24px);overflow:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-shadow-lv3);pointer-events:auto;font:inherit;font-size:12px;line-height:18px}',
      '.dqr-cardHead{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}',
      '.dqr-cardTitle{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dqr-cardMeta{color:var(--dsw-alias-label-tertiary)}',
      '.dqr-spacer{flex:1 1 auto}',
      '.dqr-iconBtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer}',
      '.dqr-iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dqr-iconBtn:disabled{opacity:.45;cursor:default}',
      '.dqr-iconBtn:disabled:hover{background:transparent;color:var(--dsw-alias-label-tertiary)}',
      '.dqr-quote{max-height:88px;overflow:auto;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}',
      '.dqr-input{box-sizing:border-box;width:100%;min-height:52px;max-height:130px;resize:vertical;padding:6px 8px;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);outline:none}',
      '.dqr-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dqr-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dqr-foot{display:flex;align-items:center;gap:8px}',
      '.dqr-hint{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dqr-btn{flex:none;height:26px;padding:0 10px;font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);cursor:pointer}',
      '.dqr-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dqr-btnPrimary{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dqr-btnPrimary:hover{background:var(--dsw-alias-brand-primary)}',
      '.dqr-btn:disabled{opacity:.5;cursor:default}',
      // Mirrors the host's own dock panels (TodoPanel): same clearance maths, so
      // the tray lines up with the composer card instead of the column edge.
      '.dqr-seat{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));max-width:calc(var(--dsh-composer-card-max-width, 100%) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));margin:0 auto;flex:none;display:flex;flex-direction:column;gap:2px;max-height:32vh;overflow:auto;padding:6px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1));backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel, var(--dsw-shadow-lv2))}',
      '.dqr-row{display:flex;align-items:center;gap:6px;min-width:0;padding:0 4px;border-radius:var(--dsw-radius-sm)}',
      '.dqr-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dqr-rowLabel{flex:none;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dqr-rowComment{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}',
      '.dqr-rowActions{flex:none;display:inline-flex;align-items:center;gap:2px;margin-left:4px}',
      '.dqr-textBtn{height:22px;padding:0 8px;font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);cursor:pointer}',
      '.dqr-textBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dqr-textBtn:disabled{opacity:.45;cursor:default}',
      '.dqr-textBtn:disabled:hover{background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dqr-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:24px;padding:0 8px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);overflow:hidden}',
      '.dqr-chipLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    ].join('')

    /**
     * Resolve text from this plugin's own dictionaries.
     *
     * Seats normally receive the host translator; this is the fallback for a
     * seat that gets none, so a missing translator never shows a raw key.
     * @param key - dictionary key.
     * @param params - interpolation values.
     * @returns the resolved text.
     */
    function fallbackText(key, params) {
      const template = zh[key] ?? en[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, name) =>
        params[name] === undefined ? match : String(params[name]),
      )
    }

    /**
     * Draw this plugin's quote mark.
     * @param className - class applied to the svg root.
     * @returns the decorative glyph.
     */
    function quoteMark(className) {
      return h(
        'svg',
        { className, width: 13, height: 9, viewBox: '0 0 16 10', 'aria-hidden': true },
        h(
          'g',
          { fill: 'currentColor' },
          h('path', {
            d: 'M5.6 1.4C3.3 1.9 1.6 3.5 1.6 5.5c0 1.5 1.1 2.6 2.5 2.6 1.2 0 2.1-.9 2.1-2 0-1.1-.8-1.9-1.9-1.9-.1 0-.3 0-.4.1.3-1 1.2-1.9 2.4-2.3z',
          }),
          h('path', {
            d: 'M13.6 1.4C11.3 1.9 9.6 3.5 9.6 5.5c0 1.5 1.1 2.6 2.5 2.6 1.2 0 2.1-.9 2.1-2 0-1.1-.8-1.9-1.9-1.9-.1 0-.3 0-.4.1.3-1 1.2-1.9 2.4-2.3z',
          }),
        ),
      )
    }

    /**
     * Clamp a coordinate into a closed range.
     * @param value - the wanted value.
     * @param min - lower bound.
     * @param max - upper bound.
     * @returns the clamped value.
     */
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max))
    }

    /* ------------------------------------------------------------------ *
     * The published composer face
     * ------------------------------------------------------------------ */

    /** The mounted composer's write face; a resident composer is unique. */
    let composer = null
    const composerListeners = new Set()

    /**
     * Publish the composer face and wake every subscriber.
     * @param next - the new face, or null while no composer is mounted.
     */
    function publishComposer(next) {
      composer = next
      for (const listener of [...composerListeners]) listener()
    }

    /**
     * Observe composer availability.
     * @param listener - called after every publication.
     * @returns the unsubscribe function.
     */
    function subscribeComposer(listener) {
      composerListeners.add(listener)
      return () => {
        composerListeners.delete(listener)
      }
    }

    /** Pending edit request from the composer row to the overlay card. */
    let editRequest = null
    const editListeners = new Set()

    /**
     * Ask the overlay to open its card on an attached chip.
     * @param request - card payload: mode, quote, comment, anchor, and the chip.
     */
    function requestEdit(request) {
      editRequest = request
      for (const listener of [...editListeners]) listener()
    }

    /**
     * Observe edit requests.
     * @param listener - called after every request.
     * @returns the unsubscribe function.
     */
    function subscribeEdit(listener) {
      editListeners.add(listener)
      return () => {
        editListeners.delete(listener)
      }
    }

    /* ------------------------------------------------------------------ *
     * Quote shaping
     * ------------------------------------------------------------------ */

    /**
     * Trim a raw selection into the excerpt that is worth quoting.
     * @param raw - the selected text.
     * @returns the excerpt, already bounded in lines and characters.
     */
    function shapeQuote(raw) {
      const lines = String(raw)
        .replace(/\r\n?/gu, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/u, ''))
      while (lines.length > 0 && lines[0].trim() === '') lines.shift()
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
      let truncated = false
      if (lines.length > MAX_QUOTE_LINES) {
        lines.length = MAX_QUOTE_LINES
        truncated = true
      }
      let body = lines.join('\n')
      if (body.length > MAX_QUOTE_CHARS) {
        // Code points, not UTF-16 units: never split a surrogate pair.
        body = Array.from(body).slice(0, MAX_QUOTE_CHARS).join('')
        truncated = true
      }
      return truncated ? `${body}\n…` : body
    }

    /**
     * Prefix an excerpt with the markdown quote marker.
     * @param body - the shaped excerpt.
     * @returns one blockquote block.
     */
    function toBlockquote(body) {
      return body
        .split('\n')
        .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
        .join('\n')
    }

    /**
     * Read the blockquote block a draft already carries, wherever it sits.
     * @param draft - the current draft text.
     * @returns the block's line count and the draft without it, or null.
     */
    function stagedQuote(draft) {
      if (typeof draft !== 'string' || !draft.includes('>')) return null
      const lines = draft.split('\n')
      const start = lines.findIndex((line) => line.startsWith('>'))
      if (start === -1) return null
      let end = start
      while (end + 1 < lines.length && lines[end + 1].startsWith('>')) end += 1
      const before = lines.slice(0, start)
      const after = lines.slice(end + 1)
      while (before.length > 0 && before[before.length - 1].trim() === '') before.pop()
      while (after.length > 0 && after[0].trim() === '') after.shift()
      const rest = [...before, ...(before.length > 0 && after.length > 0 ? [''] : []), ...after]
      return { lines: end - start + 1, rest: rest.join('\n') }
    }

    /**
     * Compose the message a card stands for.
     * @param card - the open card.
     * @returns the blockquote, the trimmed comment below it, or '' when empty.
     */
    function composedText(card) {
      const body = toBlockquote(shapeQuote(card.text))
      if (body === '') return ''
      const comment = card.comment.trim()
      return comment === '' ? body : `${body}\n\n${comment}`
    }

    /**
     * Remove this plugin's chips from a draft by subtracting their texts.
     *
     * The draft is the clipboard projection, so a chip contributes exactly its
     * `clipboardText`; subtracting it leaves every other node alone.
     * @param draft - the current draft text.
     * @param chips - this plugin's reference chips.
     * @returns the draft without them, or null when a chip text is not found.
     */
    function stripChips(draft, chips) {
      let next = draft
      for (const chip of chips) {
        const text = typeof chip.clipboardText === 'string' ? chip.clipboardText : ''
        if (text === '') continue
        const at = next.indexOf(text)
        if (at === -1) return null
        next = `${next.slice(0, at)}${next.slice(at + text.length)}`
      }
      return next.replace(/\n{3,}/gu, '\n\n').trim()
    }

    /**
     * Split one of this plugin's chip texts back into quote and comment.
     * @param text - the chip's clipboard text.
     * @returns the quoted excerpt (without markers) and the comment.
     */
    function parseChipText(text) {
      const lines = String(text).replace(/\n+$/u, '').split('\n')
      let end = 0
      while (end < lines.length && lines[end].startsWith('>')) end += 1
      const quote = lines
        .slice(0, end)
        .map((line) => (line === '>' ? '' : line.replace(/^> ?/u, '')))
        .join('\n')
      return { quote, comment: lines.slice(end).join('\n').trim() }
    }

    /**
     * Locate one chip in the composer's detect coordinates.
     *
     * A chip spans one detect character while contributing its whole text to the
     * clipboard projection, so earlier chips shift the detect offset left by
     * their extra length.
     * @param occurrence - this plugin's chip, as the projection reported it.
     * @param occurrences - every chip in the draft, in draft order.
     * @param insertion - a fresh caret snapshot, for its revision.
     * @returns the detect span, or null when the chip is gone.
     */
    function chipSpan(occurrence, occurrences, insertion) {
      if (insertion === null || typeof insertion?.draftRev !== 'number') return null
      const index = occurrences.findIndex((candidate) => candidate?.ref === occurrence?.ref)
      if (index === -1) return null
      const target = occurrences[index]
      if (typeof target.offset !== 'number') return null
      let start = target.offset
      for (let earlier = 0; earlier < index; earlier += 1) {
        const length = occurrences[earlier]?.length
        if (typeof length === 'number' && length > 1) start -= length - 1
      }
      if (start < 0) return null
      return { start, end: start + 1, draftRev: insertion.draftRev }
    }

    /* ------------------------------------------------------------------ *
     * Transcript selection
     * ------------------------------------------------------------------ */

    /**
     * The current document selection, when it is a quotable transcript passage.
     *
     * Only a selection inside the Chat flow counts: the composer has its own
     * editing semantics, and anything else on screen is not Agent output.
     * @returns the selected text and its viewport rectangle, or null.
     */
    function readQuoteCandidate() {
      const selection = window.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
      const text = selection.toString()
      if (text.trim() === '') return null
      const range = selection.getRangeAt(0)
      const container = range.commonAncestorContainer
      const element = container.nodeType === 1 ? container : container.parentElement
      if (element === null) return null
      if (element.closest('[data-composer-input]') !== null) return null
      if (element.closest('[data-chat-flow]') === null) return null
      const rects = range.getClientRects()
      const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      if (rect.bottom < 0 || rect.top > window.innerHeight) return null
      return {
        text,
        anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      }
    }

    /* ------------------------------------------------------------------ *
     * Seats
     * ------------------------------------------------------------------ */

    /**
     * Publish the resident composer face and show what the draft quotes.
     * @param props - slot props: input state hooks, actions, and the translator.
     * @returns the quote row, or null while the draft quotes nothing.
     */
    function QuoteComposerSeat(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackText
      const inputActions = props.inputActions
      // Freeze the hook choice: the standard props are cached per binding, and a
      // hook must not appear or disappear between renders.
      const [useDraft] = React.useState(() => (typeof props.useInput === 'function' ? props.useInput : null))
      const selected = useDraft === null ? undefined : useDraft((state) => state.draft)
      const draft =
        typeof selected === 'string' ? selected : typeof props.input?.draft === 'string' ? props.input.draft : ''
      const phase = typeof props.input?.phase === 'string' ? props.input.phase : 'plain'
      const occurrences = Array.isArray(props.input?.occurrences) ? props.input.occurrences : []
      const draftRef = React.useRef(draft)
      const phaseRef = React.useRef(phase)
      const occurrencesRef = React.useRef(occurrences)
      // The injected host hooks may be fresh closures per render; keep their
      // identity out of the publish effect so the bridge never churns.
      const hostRef = React.useRef({ focus: null, insertReference: null })
      React.useEffect(() => {
        draftRef.current = draft
        phaseRef.current = phase
        occurrencesRef.current = occurrences
      }, [draft, phase, occurrences])
      React.useEffect(() => {
        hostRef.current = {
          focus: typeof props.focusComposer === 'function' ? props.focusComposer : null,
          insertReference: typeof props.insertReference === 'function' ? props.insertReference : null,
        }
      }, [props.focusComposer, props.insertReference])

      React.useEffect(() => {
        if (inputActions === null || typeof inputActions !== 'object') return undefined
        if (typeof inputActions.setDraft !== 'function') return undefined
        const published = {
          getDraft: () => draftRef.current,
          getPhase: () => phaseRef.current,
          getOccurrences: () => occurrencesRef.current,
          captureInsertion: typeof inputActions.captureInsertion === 'function' ? () => inputActions.captureInsertion() : () => null,
          insertText:
            typeof inputActions.insertText === 'function'
              ? (text, span) => inputActions.insertText(text, span) === true
              : () => false,
          insertReference: (reference, span) => {
            const insert = hostRef.current.insertReference
            return insert === null ? false : insert(reference, span) === true
          },
          setDraft: (text) => inputActions.setDraft(text),
          submit: typeof inputActions.submit === 'function' ? () => inputActions.submit() : null,
          focusComposer: () => {
            const focus = hostRef.current.focus
            if (focus !== null) focus()
          },
        }
        publishComposer(published)
        return () => {
          if (composer === published) publishComposer(null)
        }
      }, [inputActions])

      const ours = occurrences.filter((occurrence) => occurrence?.source === SOURCE)
      const foreign = occurrences.length - ours.length
      /** The editor accepts positional writes while no submit is in flight. */
      const free = phase === 'plain' || phase === 'claimed'
      const staged = ours.length > 0 ? null : stagedQuote(draft)

      if (ours.length === 0 && staged === null) return null

      /**
       * Drop one attached chip, leaving every other node (and chip) alone.
       *
       * The chip spans exactly one detect character, so an empty positional
       * write over that span removes it. Without the positional path the draft
       * may only be rebuilt while nothing else carries a chip.
       * @param occurrence - the chip to drop.
       * @returns nothing.
       */
      const removeChip = (occurrence) => {
        if (!free) return
        const span = chipSpan(occurrence, occurrences, inputActions.captureInsertion())
        if (span !== null && inputActions.insertText('', span) === true) return
        if (foreign !== 0 || phase !== 'plain' || typeof inputActions.setDraft !== 'function') return
        const next = stripChips(draft, [occurrence])
        if (next !== null) inputActions.setDraft(next)
      }

      if (ours.length === 0) {
        // A hand-typed quote block: the only removable path is rebuilding the draft.
        const removable = phase === 'plain' && foreign === 0
        return h(
          'div',
          { className: 'dqr-seat' },
          h(
            'div',
            { className: 'dqr-row' },
            h(
              'span',
              { className: 'dqr-chip', title: t('chip.stagedTitle') },
              quoteMark('dqr-mark'),
              h('span', { className: 'dqr-chipLabel' }, t('chip.staged', { lines: String(staged.lines) })),
            ),
            h(
              'span',
              { className: 'dqr-rowActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-textBtn',
                  disabled: !removable,
                  title: removable ? t('chip.remove') : t('chip.removeBlocked'),
                  onClick: () => {
                    if (!removable) return
                    if (typeof inputActions?.setDraft === 'function') inputActions.setDraft(staged.rest)
                  },
                },
                t('chip.removeAction'),
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'dqr-seat' },
        ...ours.map((occurrence) => {
          const parsed = parseChipText(occurrence.clipboardText)
          const lines = parsed.quote === '' ? 1 : parsed.quote.split('\n').length
          return h(
            'div',
            { className: 'dqr-row', key: occurrence.ref ?? `${occurrence.offset}` },
            h(
              'span',
              { className: 'dqr-chip', title: t('chip.attachedTitle') },
              quoteMark('dqr-mark'),
              h('span', { className: 'dqr-chipLabel' }, t('chip.quote', { lines: String(lines) })),
            ),
            parsed.comment === ''
              ? null
              : h('span', { className: 'dqr-rowComment', title: parsed.comment }, parsed.comment),
            h(
              'span',
              { className: 'dqr-rowActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-textBtn',
                  disabled: !free,
                  title: t('chip.edit'),
                  onClick: (event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    requestEdit({
                      mode: 'edit',
                      occurrence,
                      text: parsed.quote,
                      comment: parsed.comment,
                      anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                    })
                  },
                },
                t('chip.editAction'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-textBtn',
                  disabled: !free,
                  title: t('chip.remove'),
                  onClick: () => removeChip(occurrence),
                },
                t('chip.removeAction'),
              ),
            ),
          )
        }),
      )
    }

    /**
     * Render the selection pill and the comment card it opens.
     * @param props - slot props: the host-provided "return to the composer" hook.
     * @returns the pill or card, or null while nothing is selected.
     */
    function QuoteOverlay(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackText
      const [face, setFace] = React.useState(null)
      const [target, setTarget] = React.useState(null)
      const [card, setCard] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [pillWidth, setPillWidth] = React.useState(FLOAT_W)
      const pillRef = React.useRef(null)
      const openRef = React.useRef(false)

      React.useEffect(() => {
        setFace(composer)
        return subscribeComposer(() => setFace(composer))
      }, [])

      React.useEffect(() => {
        openRef.current = card !== null
        if (card !== null) setTarget(null)
      }, [card])

      React.useEffect(() => {
        const open = () => {
          if (editRequest === null) return
          setNotice(null)
          setCard(editRequest)
        }
        open()
        return subscribeEdit(open)
      }, [])

      React.useEffect(() => {
        let dragging = false
        let frame = 0
        const refresh = () => setTarget(dragging || openRef.current ? null : readQuoteCandidate())
        const schedule = () => {
          if (frame !== 0) return
          frame = requestAnimationFrame(() => {
            frame = 0
            refresh()
          })
        }
        const held = (event) =>
          event.target instanceof Element &&
          (event.target.closest('.dqr-float') !== null || event.target.closest('.dqr-card') !== null)
        const onPointerDown = (event) => {
          // A press on our own surface must not hide it before its own handler runs.
          if (held(event)) return
          dragging = true
          schedule()
        }
        const onPointerUp = () => {
          dragging = false
          schedule()
        }
        const onPointerCancel = () => {
          dragging = false
          schedule()
        }
        document.addEventListener('selectionchange', schedule)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('pointerup', onPointerUp, true)
        document.addEventListener('pointercancel', onPointerCancel, true)
        document.addEventListener('scroll', schedule, true)
        window.addEventListener('resize', schedule)
        window.addEventListener('blur', onPointerCancel)
        return () => {
          if (frame !== 0) cancelAnimationFrame(frame)
          document.removeEventListener('selectionchange', schedule)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('pointerup', onPointerUp, true)
          document.removeEventListener('pointercancel', onPointerCancel, true)
          document.removeEventListener('scroll', schedule, true)
          window.removeEventListener('resize', schedule)
          window.removeEventListener('blur', onPointerCancel)
        }
      }, [])

      // The pill is content-sized; measure it once so it can hug the selection.
      React.useLayoutEffect(() => {
        const element = pillRef.current
        if (element === null) return
        const width = element.offsetWidth
        if (width > 0 && width !== pillWidth) setPillWidth(width)
      })

      const phase = face === null || typeof face.getPhase !== 'function' ? 'plain' : face.getPhase()
      const draft = face === null || typeof face.getDraft !== 'function' ? '' : face.getDraft()
      const ours = (face === null || typeof face.getOccurrences !== 'function' ? [] : face.getOccurrences()).filter(
        (occurrence) => occurrence?.source === SOURCE,
      )
      // Rebuilding the draft from plain text cannot carry composer chips or a
      // claimed command, and the editor refuses positional writes while a submit
      // is in flight.
      const free = phase === 'plain' || phase === 'claimed'
      const mine = stripChips(draft, ours)
      // Sending is safe while the composer holds nothing but our own chips.
      const canSend = phase === 'plain' && mine !== null && mine.trim() === ''

      /**
       * The reference chip standing for one card.
       *
       * A chip is atomic: the composer shows one small pill, while the submitted
       * message carries `clipboardText` — the whole quote and comment, however
       * long. That is what keeps a large quote out of the input area.
       * @param current - the open card.
       * @param text - the composed message text.
       * @returns the reference insertion.
       */
      const chipOf = (current, text) => {
        // The same shaping the quote box shows, so the chip and the tray agree.
        const body = shapeQuote(current.text)
        const lines = String(body === '' ? 0 : body.split('\n').length)
        return {
          source: SOURCE,
          ref: `q${Date.now().toString(36)}`,
          appearance: 'session',
          label:
            current.comment.trim() === ''
              ? t('chip.quote', { lines })
              : t('chip.quoteComment', { lines }),
          clipboardText: text,
        }
      }

      /**
       * Send the card as its own message.
       * @returns nothing.
       */
      const send = () => {
        if (card === null || face === null || !canSend) return
        const text = composedText(card)
        if (text === '') return setCard(null)
        const span = face.captureInsertion()
        const chipped = span !== null && face.insertReference(chipOf(card, text), span)
        if (!chipped) face.setDraft(text)
        if (typeof face.submit === 'function') face.submit()
        setCard(null)
      }

      /**
       * Fold the card into the composer as one chip, leaving the input free.
       * @returns nothing.
       */
      const attach = () => {
        if (card === null || face === null) return
        const text = composedText(card)
        if (text === '') return setCard(null)
        if (!free) {
          setNotice(t('card.busy'))
          return
        }
        const span = face.captureInsertion()
        // The blank line keeps whatever the user types next in its own paragraph.
        const chipped = span !== null && face.insertReference(chipOf(card, `${text}\n\n`), span)
        if (!chipped) {
          // Without the chip path, fall back to plain draft text.
          if (draft.trim() === '' && phase === 'plain') {
            face.setDraft(`${text}\n`)
          } else {
            const lead = span !== null && span.start === 0 ? '' : '\n\n'
            const applied = span !== null && face.insertText(`${lead}${text}\n`, span)
            if (!applied) {
              setNotice(t('card.busy'))
              return
            }
          }
        }
        if (typeof face.focusComposer === 'function') face.focusComposer()
        setCard(null)
      }

      /**
       * Rewrite the chip the open card was opened from, in place.
       * @returns nothing.
       */
      const save = () => {
        if (card === null || card.mode !== 'edit' || face === null) return
        const text = composedText(card)
        if (text === '') return setCard(null)
        const occurrences = typeof face.getOccurrences === 'function' ? face.getOccurrences() : []
        const span = chipSpan(card.occurrence, occurrences, face.captureInsertion())
        if (span === null || !face.insertReference(chipOf(card, `${text}\n\n`), span)) {
          setNotice(t('card.stale'))
          return
        }
        if (typeof face.focusComposer === 'function') face.focusComposer()
        setCard(null)
      }

      const anchor = card !== null ? card.anchor : target !== null ? target.anchor : null

      if (face === null || anchor === null) return null

      if (card === null) {
        const left = clamp(anchor.right - pillWidth, 8, window.innerWidth - pillWidth - 8)
        const below = anchor.bottom + FLOAT_GAP
        const top = below + FLOAT_H > window.innerHeight - 8 ? anchor.top - FLOAT_GAP - FLOAT_H : below
        return h(
          'button',
          {
            type: 'button',
            ref: pillRef,
            className: 'dqr-float',
            style: { left: `${left}px`, top: `${Math.max(8, top)}px` },
            title: t('float.title'),
            'aria-label': t('float.title'),
            onMouseDown: (event) => {
              event.preventDefault()
              event.stopPropagation()
              setNotice(null)
              setCard({ mode: 'compose', text: target.text, anchor: target.anchor, comment: '' })
            },
          },
          quoteMark('dqr-mark'),
          t('float.label'),
        )
      }

      const width = Math.min(CARD_W, Math.max(240, window.innerWidth - 16))
      const left = clamp(anchor.left, 8, window.innerWidth - width - 8)
      const below = anchor.bottom + FLOAT_GAP
      const top = below + CARD_H > window.innerHeight - 8 ? anchor.top - FLOAT_GAP - CARD_H : below
      const onKeyDown = (event) => {
        // Never let card typing reach the composer, the chat shortcuts, or IME
        // candidate confirmation.
        event.stopPropagation()
        const composing = event.nativeEvent?.isComposing === true || event.keyCode === 229
        if (composing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          setCard(null)
          return
        }
        if (event.key === 'Enter' && event.shiftKey !== true) {
          event.preventDefault()
          if (card.mode === 'edit') save()
          else if (canSend) send()
          else attach()
        }
      }

      return h(
        'div',
        {
          className: 'dqr-card',
          style: { left: `${left}px`, top: `${Math.max(8, top)}px`, width: `${width}px` },
          onMouseDown: (event) => event.stopPropagation(),
          onKeyDown,
        },
        h(
          'div',
          { className: 'dqr-cardHead' },
          h('span', { className: 'dqr-cardTitle' }, quoteMark('dqr-mark'), t(card.mode === 'edit' ? 'card.editTitle' : 'card.title')),
          h('span', { className: 'dqr-cardMeta' }, t('card.lines', { lines: String(card.text.split('\n').length) })),
          h('span', { className: 'dqr-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-iconBtn',
              title: t('card.close'),
              'aria-label': t('card.close'),
              onClick: () => setCard(null),
            },
            '✕',
          ),
        ),
        h('div', { className: 'dqr-quote' }, card.text),
        h('textarea', {
          className: 'dqr-input',
          autoFocus: true,
          rows: 2,
          value: card.comment,
          placeholder: t('card.comment'),
          'aria-label': t('card.comment'),
          onChange: (event) => {
            const comment = event.target.value
            setNotice(null)
            setCard((current) => (current === null ? current : { ...current, comment }))
          },
        }),
        h(
          'div',
          { className: 'dqr-foot' },
          h(
            'span',
            { className: 'dqr-hint', title: card.mode === 'edit' ? t('card.saveTitle') : canSend ? t('card.sendTitle') : t('card.blocked') },
            notice ?? (card.mode === 'edit' || canSend ? '' : t('card.blocked')),
          ),
          card.mode === 'edit'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-btn',
                  onClick: () => setCard(null),
                },
                t('card.cancel'),
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-btn',
                  title: t('card.attachTitle'),
                  onClick: attach,
                },
                t('card.attach'),
              ),
          card.mode === 'edit'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-btn dqr-btnPrimary',
                  title: t('card.saveTitle'),
                  onClick: save,
                },
                t('card.save'),
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-btn dqr-btnPrimary',
                  disabled: !canSend,
                  title: canSend ? t('card.sendTitle') : t('card.blocked'),
                  onClick: send,
                },
                t('card.send'),
              ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'quote-reply: dictionaries')

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/dsh-quote-reply'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'quote-reply: styles')

        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'quote-reply',
              order: 30,
              locale: NS,
              // The composer's own faces: `focus()` restores Lexical's stored
              // selection (a bare DOM focus would move the caret to the start),
              // and `insertReference()` is the only way to place an atomic chip.
              inject: (sessionId) => {
                const actx = ctx.sessions.scope(sessionId)
                const shell = () => {
                  try {
                    return actx?.get('conversation')?.input?.for(actx)
                  } catch {
                    return undefined
                  }
                }
                return {
                  focusComposer: () => {
                    shell()?.focus()
                  },
                  insertReference: (reference, span) => shell()?.insertReference(reference, span) === true,
                }
              },
            },
            QuoteComposerSeat,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'quote-reply.float', order: 40, locale: NS },
            QuoteOverlay,
          ),
        )
      },
    }
  },
})
