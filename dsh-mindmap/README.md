# dsh-mindmap — DSH 对话思维导图插件

在 DSH Web GUI 的**右侧栏**里，用一张随对话推进自动更新的思维导图呈现当前会话的主题、结论、待办、风险与未决问题。

- 插件包：`@local/dsh-mindmap`（本地目录安装，profile = `desktop`）
- 安装方式：`plugin_manager install_bundle`（已装，`application: applied`）
- 会话级、可拖动 / 拆分 / 浮动 / 全屏；无会话时不显示

## 在别的会话里用

装的是 profile 级 bundle，所以这个桌面端里**每个会话都自动有**，不需要逐会话开启：

- 会话表头的导图按钮从会话打开那一刻就在（还没有内容时角标为 0）；
- 模型开始干活并调用 `mindmap` 工具后，右侧栏会在该会话第一次有图时**自动打开一次**；
- **老会话不会回填**：图的数据源是该会话日志里的 `tool/call` 事件，早于插件安装的会话里没有这些事件。想让老会话也有图，就在那个会话里说一句「整理一下这张会话的思维导图」，模型调一次工具即可，之后照常自动更新；
- 子 agent 会话同样拿到这个工具（全局注册），图各自存在各自会话的日志里；
- 不走 Web 的 CLI 会话也会带上这个工具，只是没有右侧栏可看，无副作用。

换 profile 或换机器要各自装一次：把 `projects/dsh-mindmap` 目录带过去，再 `plugin_manager install_bundle` 指向该目录（装的是 Junction 链接，源码始终在自己手里）。

## 数据流

```
模型调用 mindmap 工具
      ↓  参数就是完整快照
tool/call 事件落进会话日志（durable）
      ↓  纯函数 fold
SessionProjections 单元 key = "mindmap"
      ↓  wire.view
客户端 useProjection('mindmap')
      ↓
右侧栏 tab 渲染
```

关键取舍：**图的真源是会话日志本身**。因此不新增事件类型、不需要插件私有存储，fork / resume / replay 都会重建出同一张图。

排除的方案：Host 侧调模型做语义蒸馏后推给前端。原因是客户端能访问的 Remote 命名空间由 `@deepseek-ai/dsh-api-remotes` 在构建期固定（"Additional capabilities require an explicit `/remote` value import and mount in this assembly"），第三方插件在运行时长不出新的 RPC 通道；而会话投影是唯一「运行时长出来、Host 算好、Client 直接读」的通路，且它要求纯同步 fold。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半边：注册 `mindmap` 工具、`mindmap` 投影单元、维护导图的提示词段落 |
| `client.js` | Client 半边：右侧栏 tab 类型与渲染、会话表头按钮、首次自动打开 |
| `cordis.patch.yml` | 插入插件行与配置 |
| `locale/{zh,en}.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |

## 配置

`cordis.patch.yml` 里可调：

```yaml
config:
  prompt: true    # 是否注入「维护导图」的提示词段落；false = 只保留工具，模型不主动维护
  maxNodes: 40    # 单张图的节点上限（超出截断）
```

## 画法（为什么长这样）

第一版画出来的是「中心在左上角、全部向右展开、方框等距排列」的树——那是**逻辑图/组织图**，不是思维导图。XMind 自己就把结构分成三类：放射发散的「思维导图」、大括号式「逻辑图」、金字塔式「组织结构图」。现在的画法按思维导图惯例重做：

- **中心主题居中**，一级分支按子树重量分左右：每个分支加入当前较轻的一侧，两侧各自以自己的中心线上下堆叠。这与 jsMind 的 `full` 模式、Syncfusion `SfMindMapTreeLayout` 的 Level/Area 平衡、以及 leaf-balance 分割是同一套思路。
- **每层一列**，列宽取该层最宽节点；同一子树永远在同一侧，每条边只跨一层；节点按子树高度分行，互不重叠。
- **分支是有机曲线**：三次贝塞尔 + 圆角线帽，线宽随深度递减（5 / 3.4 / 2.4 / 1.8），一级分支最粗——Buzan 的「分支弯曲、一级更粗」。
- **一条分支一个颜色**，颜色沿子树继承；节点边框与底色由该色淡化而来（`color-mix`），类型改用字形表达（◉ 主题 / ◆ 分支 / ✓ 结论 / ☐ 待办 / ? 未决 / ! 风险 / · 备注），状态仍是圆点。
- **label 是关键词**（提示词要求中文 4–12 字），解释与出处进 `note`（悬停可见）。
- 节点宽度用 `canvas.measureText` + 面板真实字体**实测**（`createTextMeasurer`），不再靠字宽猜测；实测不可用时才回落到按字符估算。布局仍是图的纯函数，折叠不会引起重排抖动。
- **自动适配**：打开、换图、折叠、面板拖宽都会重新算「适应」比例（下限 0.45），把整张图放进可视区；手动缩放后停止自动适配，点「适应」恢复。缩放范围 0.45–2.5。

## 交互

- 会话表头的导图按钮（在「更多」左侧）打开/聚焦右侧栏 tab，带节点数角标。
- 某个会话第一次有导图内容时，自动打开一次；面板里「自动打开：开/关」可关闭这个行为。
- ＋ / － / 适应 三个按钮缩放；**按住拖动平移**（移动超过 4px 会抑制这次点击，避免误折叠）；默认自动适配并把画布居中。
- 悬停节点会高亮它相关的分支与跨分支虚线，其余淡出。
- 有子节点的节点点击折叠，折叠后显示 `+N`；虚线是跨分支的因果/依赖关系。
- 中心主题不参与折叠（点了会藏掉整张图），其余分支都可以折。
- 空态会显示一行诊断：`正在等待会话投影…` / `投影不可用` / `此席位未提供 useProjection`，用来区分「还没数据」和「通路坏了」。

## 已知取舍

- 提示词段落对所有会话生效，会改变主请求的系统提示前缀（KV 缓存前缀随之变化）；不需要时把 `prompt` 设为 `false`。
- 图的质量取决于模型是否按提示维护；不维护时右侧栏保持空态。
- 布局横向比纵向长得快：节点按文字估宽 96–260px、列间距 26px；图宽时用拖动平移或「适应」缩放，也可以拖宽右侧栏。
- 尚未实现：点击节点跳回对应聊天位置（需要会话的滚动定位 API）。

## 验证状态

- ✅ `install_bundle` → `application: applied`，无 warning
- ✅ 客户端席位已注册：`sidebar.right.pane.tab` 的 `@local/dsh-mindmap`、`conversation.session.header.utilities` 的 `mindmap-open`（`Slots.listSubTree`，均 `active: true`，即模块已在打开的页面里 materialize 并 apply）
- ✅ Host 链路：工具调用成功（15 节点 / 17 关系），`tool/call` 事件落在会话日志 seq 428
- ✅ 投影 fold 契约：`tools/test-projection.mjs` 回放 583 个真实事件，只有 seq 428 一次状态变更（其余 582 个事件返回同一状态引用），`wire.view` 返回稳定引用
- ✅ 客户端读自定义 key：`dsh-api-session-controller/lib/client.js` 的 projection-store 是**开放 key 空间**——"Erased walk: the framework crosses the open key space"，对 Host 下发的每个 key 全量 `apply`；`faceOf(key)` 对未知 key 返回 `undefined` 快照而非报错（"absence is an `undefined` snapshot, never a missing face"）。`ui-chat` 里就是 `useProjection("turnOutline")` / `useProjection("inbox")` 这种任意字符串 key 的用法。
- ✅ 模型侧驱动已生效：`tools/verify-request-surface.mjs` 从日志里核到 seq 306 的 `system/message` 已含「思维导图」段落；seq 308 的 `request/header`（reason `change`）工具数 35→36 且含 `mindmap`，此后每次请求都带着它。
- ✅ 席位 props 契约比对：shipped 的 `dsh-client-ui-schedule` 右侧栏 tab body 签名是 `function ScheduleTaskTab({ sessionId, useTabInfo, useCatalog, ..., t })`，与我的组件取用方式一致（另有 `ui-plan` 的 `useProjection("plan")` 作为同构先例）。
- ✅ 浏览器渲染（使用者截图确认，2026-10-17）：右侧栏画出完整图。首版节点宽度写死 150px 会把长标签截断，已改为按文字估宽；第二版整体换成双侧放射布局（见《画法》）。
- ✅ 布局不变式：`tools/test-layout.mjs` 从 shipped 源码里抽出 `// #region pure layout` 之间的纯函数、用真实图跑 15 项断言——几何有限、节点都在画布内、两两不重叠、双侧都用上、中心唯一、每条边只跨一层且不跨侧、边数 = 节点数−1、没有标签超出盒子，以及 4 项折叠回归（折叠只隐藏子树、不重复节点、角标数正确、折叠后仍不重叠、折中心只剩中心）。24 节点图：884×476，左 11 / 右 12，overlaps=0。
- 🐞 修过的真 bug（2026-10-18）：点中心节点折叠后图散架。原因是「孤儿节点抢救」把**被折叠隐藏的子孙**误判成「因父子成环而不可达的节点」，把它们提升成一级分支重挂回中心。改为先按「忽略折叠」算可达性，再做折叠布局；并让中心节点不可折叠。已补 4 项回归断言。

## 工具脚本

```bash
# 布局不变式：从 client.js 的纯布局区域抽出来跑几何断言（不碰 DOM、不模拟 React）
node tools/test-layout.mjs <session.v4.jsonl.zstd> [--dump]

# 离线复验投影单元：把真实日志按注册表的驱动方式喂进 apply
node tools/test-projection.mjs "$DSH_HOME/sessions/<cwd-key>/<session-id>/session.v4.jsonl.zstd"

# 模型请求面：核对工具 schema 与提示词段落是否真的进了请求
node tools/verify-request-surface.mjs <session.v4.jsonl.zstd>

# 解码会话日志（按 zstd 帧拼接，Node 自带解码器只解第一帧）
node tools/decode-session-log.mjs <session.v4.jsonl.zstd> [要搜索的字符串]

# 搜索打包进 app.asar 的客户端代码（普通 Node 读不了 asar，要用 Electron 身份运行）
$env:ELECTRON_RUN_AS_NODE='1'
& 'D:\Software\DSH\DeepSeek Harness.exe' tools/grep-asar.cjs `
  'D:/Software/DSH/resources/app.asar/dsh/node_modules/@deepseek-ai' 'useProjection' 12
```

