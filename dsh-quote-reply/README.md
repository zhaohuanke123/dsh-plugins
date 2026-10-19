# dsh-quote-reply — DSH「引用回复」插件

在 DSH Web GUI 的对话里**选中一段 Agent 输出的文字 → 点「引用」→ 就地写评论 → 变成这条消息的引用附件**；
可以叠加**多段引用**，每条都能单独改评论、单独删；输入框始终干净（每条引用只是一枚 ~80px 的芯片，不是原文）。

- 插件包：`@local/dsh-quote-reply`（本地目录安装，profile = `desktop`）
- 安装：`plugin_manager install_bundle`（已装，`application: applied`，无 warning）
- profile 级 bundle：这个桌面端里每个会话都有，不需要逐会话开启
- 改完代码**刷新页面**即可（装的是 Junction 链接，源码就在本目录）

---

## 一、需求（用户视角的验收标准）

| # | 验收 |
|---|---|
| R1 | 在对话流里选中任意一段文字，选区旁出现「引用」入口 |
| R2 | 点入口就能**就地写评论**（不跳到别处、不弹全屏对话框） |
| R3 | 引用可以**直接发出**，也可以**附加**到输入框，之后再发 |
| R4 | **引文不占输入区**：无论多长，输入框里只多一枚小芯片 |
| R5 | **可以有多条引用**，每条独立：独立改评论、独立删、独立成段 |
| R6 | 删除/编辑一条引用**不影响**其他引用、也不影响我正在打的字 |
| R7 | 发送时：自己打的字 + 所有引用（引文 + 评论）合成**一条**用户消息 |

## 二、交互全貌

```
对话流里拖选一段
      │
      ▼
  ❝ 引用（选区右下角的药丸）           ← shell.overlay
      │ 点它
      ▼
  评论窗（就在选区旁）                 ← shell.overlay
  ┌ 选中的文本 · N 行 ─────────────┐
  │ > 引文原文（可滚动）            │
  │ [添加评论或回复…]               │
  │            [附到输入框] [发送]  │
  └────────────────────────────────┘
      │ 附到输入框                    │ 发送
      ▼                              ▼
  输入框里多一枚芯片               引文+评论作为一条消息发出
  输入框上方多一行管理入口         （不写输入框）
```

输入框上方的**引用列表**（每条引用一行；整块是一张面板，宽度和输入框卡片对齐，行多了自己滚动）：

```
┌──────────────────────────────────────────────────┐
│ ❝ 引用 12 行   这段是我的评论…      [编辑] [删除] │
│ ❝ 引用 3 行                         [编辑] [删除] │
└──────────────────────────────────────────────────┘
```

按钮是**文字按钮**（不是图标），紧跟在每条引用内容后面；不悬停也看得见。面板几何、圆角、阴影、毛玻璃都跟宿主自己的 dock 面板（TodoPanel）用同一套变量与算法，所以它和输入框卡片**左右对齐**（`--dsh-composer-side-clearance` / `--dsh-composer-dock-inset` / `--dsh-composer-card-max-width`）。

## 三、多条引用的行为

| 动作 | 结果 | 实现 |
|---|---|---|
| 附到输入框 | 追加一枚芯片（文本 = `> 引文` + 空行 + 评论 + 空行），焦点回到输入框 | `insertReference(chip, captureInsertion())` |
| 编辑（列表里的「编辑」） | 打开评论窗，引文只读、评论预填；「保存」**原位换掉那一枚芯片** | `insertReference(新chip, chipSpan(那一枚))` |
| 删除（列表里的「删除」） | 只摘掉那一枚芯片，别的芯片、你打的字都不动 | `insertText('', chipSpan(那一枚))` |
| 发送（评论窗） | 只要输入框里**只剩本插件的芯片**（没有你正要写的话）就允许，直接成一条消息 | 追加芯片 + `submit()` |
| 回车发送 | 所有芯片展开成文本，和你打的字合成一条消息 | 宿主 composer 行为 |
| 顺序 | 芯片在输入框里的先后 = 消息里的先后（列表按同样顺序显示） | `occurrences` 顺序 = 草稿顺序 |

消息长这样（两条引用 + 自己的一句话）：

```
> 第一段引文
> 第二行

第一段的评论

> 第二段引文
第二段的评论

我自己打的话
```

（宿主的 `insertReference` 会在每枚芯片后补一个空格，落在下一行行首，无害。）

## 四、为什么这样做

- **引用靠「芯片」承载，不靠明文**：宿主 composer 是 Lexical + 原子装饰节点（`@文件`、`/命令` 同理）。芯片在编辑器里只占 **1 个 detect 字符**（宿主的 `pushLeaf("chip", node, "\uFFFC", node.getTextContent())`），提交时 `clipboardText` 里是全文。所以「显示很小、内容很全」是宿主机制保证的。
- **每条引用都能独立操作**：芯片的 detect 坐标可以由投影算出来 —— `occurrences[].offset` 是 clipboard 坐标，减去前面每枚芯片的 `length - 1` 就是 detect 坐标，于是「改一条」「删一条」都是一次**定点写**，不重建草稿、不碰别的节点。
- **不用 `setDraft` 承载引用**：`setDraft(纯字符串)` 会用纯文本重建草稿，抹掉草稿里已有的芯片、把已认领的 `/命令` 降级成普通文本。只有「手打的 `>` 引用块」这一条兼容路径在无芯片时才用它。
- **不 shadow 宿主席位**：`conversation.input.dock` 是增量 list 席位；没有替换 `conversation.input.attachments`（single 席位，替换掉会砸掉文件/图片附件栏），也没有替换整个 composer。
- **不新增事件类型、不需要插件存储**：引用最终是普通用户消息文本；对草稿持久化 / fork / resume / 重放透明。

## 五、结构

| 席位 | 作用域 | 干什么 |
|---|---|---|
| `conversation.input.dock` | session | 把 composer 的写入口（`getDraft`/`getPhase`/`getOccurrences`/`captureInsertion`/`insertText`/`setDraft`/`submit`）和宿主自己的 `focus()` / `insertReference()` 发布到本模块；渲染**引用列表**（每行 ✎ / ✕） |
| `shell.overlay` | root | 用 `document.getSelection()` + `[data-chat-flow]` 判定可引用选区，画药丸与评论窗（新建 / 编辑两态），写回都走已发布的 composer 面 |

两个组件通过模块级 bridge 通信：dock 席位发布 composer 写入口，overlay 席位通过 `requestEdit()` 把「编辑某一枚芯片」的请求交给评论窗。

关键依据（全部来自运行时契约，不是猜的）：

- `insertReference(ref, span)` 是宿主 composer 唯一的原子插入入口（`SessionInputShell.insertReference` → `DraftEditorRuntime.insertReference` → `$createReferenceChipNode`），要求 `phase ∈ {plain, claimed}` 且 `span.draftRev === rev`；ref 形状 `{ source, ref, label, appearance?, clipboardText }`。
- chip 的投影规则：`pushLeaf("chip", node, "￼", node.getTextContent())` —— detect 一个字符、clipboard 全文；`resolvePoint` 对「芯片前」和「芯片后」解析出不同点，所以 1 字符宽的 span 是**非折叠选区**，`insertText('', span)` 会走 `selection.removeText()` 精确摘掉这枚芯片。
- `conversation.input.dock` 的 `standardProps` 含 `inputActions: InputActions`、`useInput`、`sessionId`，ownerProps 是 `InputZone { session, input }`；`InputState = { draft, phase, occurrences, attachmentIds, draftRev, claim?, queue }`。
- `shell.overlay` 是框架级浮层（`position:absolute;inset:0;pointer-events:none`，子元素自动 `pointer-events:auto`），祖先链无 `transform/filter/contain`，`position:fixed` 按视口坐标定位成立。
- 交还键盘焦点必须走 `ctx.get('conversation').input.for(actx).focus()`（先例：`dsh-client-ui-commands`）：裸 DOM `focus()` 会把 Lexical 光标丢到草稿开头。

## 六、文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半边：空实现，只占位（渲染全在客户端） |
| `client.js` | Client 半边：两个席位、选区判定、引文整形、评论窗、引用列表、芯片定点读写 |
| `cordis.patch.yml` | 插入插件行 |
| `locale/{zh,en}.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |
| `tools/smoke.mjs` | 纯函数自检：席位注册、词典键、引文整形/拼装/芯片反解/坐标换算（23 项） |
| `tools/render-smoke.mjs` | 渲染级自检：迷你 React hook 运行时 + 假 DOM，真渲染两个组件并驱动多引用全流程（42 项） |
| `tools/read-asar.cjs` | 按行号读 app.asar 里的文件（普通 Node 读不了 asar，要用 Electron 身份跑） |
| `tools/tokens.cjs` | 列出某个文件里引用的 `--dsw-*` 主题 token |

## 七、自检与复验

```powershell
node tools/smoke.mjs          # 纯函数与装配
node tools/render-smoke.mjs   # 渲染级全流程（多引用、编辑、删除、发送、失效拒绝）
node --check client.js        # 语法
& 'dsh' --profile desktop --dump-config | Select-String 'quote-reply'
```

> 为什么要有渲染级自检：客户端席位里一个渲染期 `ReferenceError` 会让整个席位崩掉（控制台 `slot entry crashed in '<slot>'`），纯函数断言看不见。v3.1 出过一次（`free` 变量只在另一个组件里定义），药丸直接消失——就是 `render-smoke.mjs` 复现并修掉的。

## 八、验证状态

- ✅ `install_bundle` → `application: applied`，`warnings: []`；`list_bundles` 显示 `enabled/installed`，`source: link:...\projects\dsh-quote-reply`
- ✅ Host 组合层含该行：`dsh --profile desktop --dump-config` 末尾 `# == @local/dsh-quote-reply` / `id: quote-reply`
- ✅ 纯函数自检全过；渲染级自检全过：药丸 → 评论窗 → 附加 → **两条引用两行** → 编辑第二条（预填的是第二条）→ 保存（写入的是第二枚的 detect span）→ 删第一条（只发一次定点写、不重建草稿）→ 已有芯片时仍可「发送」→ 芯片已消失时拒绝保存 → 选区收起药丸消失 → 手打引用块只给「删除」→ 列表行数 = 芯片标签行数（同一套引文整形）
- ✅ 独立只读复核（子 agent 逐条回宿主源码核对）修掉 v1 的 6 个缺陷（焦点、粘行、`setDraft` 摧毁芯片/命令、dragging 卡死、render 期写 ref、条件 hook）
- ⏳ **浏览器观感未由我验证**（本会话无浏览器控制权）：评论窗贴边、深浅主题、芯片观感与删除手感、列表多行时的滚动、IME 回车

## 九、已知边界

- 只覆盖 Chat 视图的对话流（`[data-chat-flow]`）；Trajectory 视图、右侧栏预览、折叠的工具卡片不在判定范围。
- 引用的是**渲染出来的文字**：选区跨过按钮/徽标时会带上它们的可见文字。
- 引用芯片是本插件私有的 `source`，点它不会打开预览；改内容一律走列表里的 ✎。
- 编辑只能改**评论**；要换引文本身，删掉这条重新引用。
- 不提供拖动排序：顺序 = 芯片在输入框里的位置（想换顺序就在输入框里剪切粘贴芯片）。
- 手打的 `>` 引用块（非芯片）只有「删除」、且只在草稿里没有芯片时可用（那种草稿只能用纯文本重建，会砸掉芯片）。
- 引文上限 80 行 / 4000 字，超出截断并补一行 `…`；发送后在消息里是展开的明文（宿主用户消息只有文本形态）。
