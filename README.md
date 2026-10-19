# dsh-plugins

两个 **DSH（DeepSeek Harness）桌面端 GUI 插件**，自用定制件（私有）。

| 插件 | 包名 | 做什么 |
|---|---|---|
| `dsh-mindmap` | `@local/dsh-mindmap` | Web GUI **右侧栏**一张随对话推进自动更新的**思维导图**（主题/结论/待办/未决/风险），支持拖动、缩放、折叠、跨分支虚线 |
| `dsh-quote-reply` | `@local/dsh-quote-reply` | 在对话里**拖选一段 Agent 输出 → 点「引用」→ 就地写评论**；可叠多条引用，各自独立改/删；输入框里只多一枚小芯片，不塞原文 |

两个都是 **profile 级 bundle**：装一次，该 profile 里每个会话都有，不需要逐会话开启。
每个插件目录下的 `README.md` 是该插件自己的完整记录（需求、交互、实现、验证状态、修过的 bug）。

---

## 安装

前置：目标机器**已装 DSH 桌面端**。插件管理器是 app 内置的（`app.asar` 里的 `dsh-plugin-manager`，提供 `plugin_manager` 工具）；npm 全局那个 `dsh` CLI 单独做不了这件事。

先看要装进哪个 profile：

```bash
ls ~/.dsh/profiles/          # Windows: C:\Users\<你>\.dsh\profiles\
```

### 方式一：从本仓库装（推荐，多台机器）

在 DSH 里对 Agent 说（`<profile>` 换成目标 profile，本机是 `desktop`）：

> 用 `plugin_manager` 的 `install_bundle` 装两个 bundle：
> - `git+https://github.com/zhaohuanke123/dsh-plugins.git#v1.0.0&path:/dsh-mindmap`
> - `git+https://github.com/zhaohuanke123/dsh-plugins.git#v1.0.0&path:/dsh-quote-reply`

**这两个 spec 已实测**（pnpm v10.33.3 真跑 `pnpm add`，两个包都成功解析并保留 `dsh.bundle` 字段）。
`install_bundle` 的 `target` 支持 **npm 包名 / git URL / tarball URL / 本地绝对目录**（DSH 文档原文：*"Retry with an npm package name, a git URL, a tarball URL, or an absolute local directory."*），git URL 会转给 pnpm，而 `#<ref>&path:/<子目录>` 是 pnpm 官方的 monorepo 子目录写法。

公开仓库，不需要凭证。**用 `#v1.0.0` 这种 tag 别用分支名**——分支会漂移，tag 不会。

### 方式二：从本地目录装

把 `dsh-mindmap/`、`dsh-quote-reply/` 放到一个**不会被清理的稳定位置**（例如 `C:\Users\<你>\dsh-plugins\`），然后：

> 用 `plugin_manager` 的 `install_bundle`，把 `C:\Users\<你>\dsh-plugins\dsh-mindmap` 装到 `<profile>`；`dsh-quote-reply` 同样。

看到 `application: applied` 且**无 warning** 即成功，然后重启 DSH（或刷新页面）。

### ⚠️ 不要手写 profile 的文件

DSH 文档明确要求：

> *Do not write the profile's `package.json` or `cordis.patch.yml`, create packages under `$DSH_HOME`, or run pnpm in the profile directory: `install_bundle` performs those steps.*

同理，**不要把插件自己的 `cordis.patch.yml` 抄进 profile 的 `cordis.patch.yml`** —— 插件的 `package.json` 里有 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，bundle 机制会自动应用它，手动再抄一遍 = 重复插入行。

---

## 更新

**不是自动的。** DSH 的错误码写得清楚：

> `already-installed`: *The package is already installed; to install another version, call `remove_bundle` first, then `install_bundle` again.*

流程：**本地改 → 提交 → 打新 tag（`v1.0.1`…）→ 目标机器 `remove_bundle` → `install_bundle` 新 spec**。

用方式二（本地目录）装的那台机器不用走这套：装的是链接，改完**刷新页面**即可（改 Host 半边 `index.js` 要重启 DSH）。

---

## 装完怎么验证

- [ ] `plugin_manager` `list_bundles` → 两个 bundle 都在，`application: applied`、无 warning
- [ ] DSH 的**插件管理页**能看到这两个插件
- [ ] **思维导图**：会话表头出现导图按钮（带节点数角标）；在该会话说「整理一下这张会话的思维导图」→ 右侧栏出图
- [ ] **引用回复**：在对话流里拖选一段文字 → 选区右下出现 `❝ 引用` 药丸

---

## 已知注意事项

- **思维导图可调参数**（`dsh-mindmap/cordis.patch.yml`）：`prompt: true`（是否注入「维护导图」的提示词段落，关掉 = 只留工具）／`maxNodes: 40`（节点上限）。
- **老会话不会回填**：导图的数据源是该会话日志里的 `tool/call` 事件，早于插件安装的会话里没有这些事件。想让老会话也有图，在那个会话里说一句「整理一下这张会话的思维导图」，模型调一次工具即可。
- **版本兼容会拦安装**：不满足 `engines.dsh` 或 DSH peer 依赖的版本会被阻止安装（错误码 `incompatible-version`）。强行装要走 `set_version_exemption` 并明确接受崩溃/数据风险 —— 不建议。
- **每个 profile / 每台机器各装一次**。

---

## 仓库结构

```
dsh-mindmap/
  package.json  index.js  client.js  cordis.patch.yml  icon.svg
  locale/{zh,en}.json
  README.md                    ← 插件自己的完整记录
  tools/                       ← 开发期验证脚本（布局几何断言、投影回放、请求面核对、asar 读取）
dsh-quote-reply/
  package.json  index.js  client.js  cordis.patch.yml  icon.svg
  locale/{zh,en}.json
  README.md
  tools/
```

`tools/` 里的脚本**装上用不到、删掉也不影响运行**，留着是为了以后改动时能自查。
