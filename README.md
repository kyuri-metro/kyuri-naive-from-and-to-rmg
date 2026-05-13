# kyuri-naive-from-and-to-rmg

> 以下内容为 Cursor Composer 2 生成，但经过人工正确性检查，可以作为参考

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Vite](https://img.shields.io/badge/build-Vite-646cff)](https://vitejs.dev/)

## 简介

本仓库在 **Kyuri naive 3.0**（YAML，`version: 3`）与 **RMG 线路参数 JSON**（与 [RMG](https://github.com/railmapgen/rmg) 站点列表 `stn_list` 等字段兼容）之间做**双向转换**：从 RMG 导出可编辑的 naive 线路稿，或把 naive 稿套进 RMG 模板生成可导入 RMG 的 JSON。提供 **Node CLI**（`dist/cli.js` / `kyuri-rmg`）与 **Vite 静态网页**（可独立打开，也可 `iframe` 嵌入并由父页通过 `postMessage` 驱动）。内含一段自 RMG 复制的 `getBranches` 拓扑辅助逻辑，整体许可证为 **GPL-3.0**（见下文）。

## 用法概览

1. **安装依赖**：在项目根目录执行 `npm install`。
2. **网页**：`npm run dev` 本地预览；生产构建为 `npm run build`（产出 `dist/` 库与 CLI、`dist-web/` 站点）。嵌入父页时见下文「查询参数」与 `postMessage`。
3. **命令行**：先 `npm run build:lib`，再 `node dist/cli.js --help`；示例如 `node dist/cli.js rmg-to-kyuri 线路.json 线路.yaml`、`node dist/cli.js kyuri-to-rmg 线路.yaml 模板.json 输出.json`（子命令与参数说明以 `--help` 为准）。
4. **Kyuri 输入格式**：仅支持 **Kyuri naive 3.0**；不接受 v2 或以站点数组为根的旧格式。「Kyuri → RMG」需自备或与内置示例一致的 RMG 模板 JSON（见「默认 RMG 模板」）。

## 第三方 / RMG

本仓库**包含取自** [RMG（railmapgen/rmg）](https://github.com/railmapgen/rmg) 的源代码片段，来读取 RMG 站点 JSON 包含的主线拓扑与字段语义。RMG 以 **GNU GPL v3** 发布；本仓库整体亦以 **GPL-3.0** 分发，许可证全文见 **[LICENSE](./LICENSE)**。

**自 RMG 复制的本仓库路径（以源文件头部注释为准）**

| 本仓库路径 | 对应 RMG 上游路径（参考） |
|------------|---------------------------|
| [`src/getBranches.ts`](./src/getBranches.ts) | [`src/redux/helper/graph-theory-util.ts`](https://github.com/railmapgen/rmg/blob/main/src/redux/helper/graph-theory-util.ts) 中的 `getBranches` |

其余文件（如 `rmgToKyuri.ts`、`kyuriToRmg.ts` 等）为本仓库在 GPL 约束下**另行编写**的转换与封装逻辑，并非从 RMG 逐文件复制；`public/rmg-default-template.json` 为用于套模板的 **RMG 参数 JSON 示例**，供「Kyuri → RMG」流程使用。

在 **Kyuri naive**（YAML）与 **RMG**（JSON 参数）之间转换的 CLI 与静态 Web 工具。

## 许可

本项目以 **GNU GPL v3** 发布（因使用 [RMG](https://github.com/railmapgen/rmg) 的 GPL-3.0 逻辑）。根据 **GNU GPL v3** 许可证的规定，通过 `postMessage` 与父页面通信时，父页面应不会被要求采用 GPL。

## Web（Vite）

```bash
npm install
npm run dev
```

### 查询参数（嵌入 iframe 时）

| 参数 | 取值 | 说明 |
|------|------|------|
| `hideOutput` | `1` | 嵌入模式：界面按 `flow` 只展示当前流程所需区域（与独立打开时的双页签不同）；转换结果仍通过 `postMessage` 发往父窗口。 |
| `flow` | `rmg-to-kyuri` | 初始为「RMG → Kyuri」：仅展示 RMG JSON 输入与转换操作；生成的 Kyuri YAML 经子 → 父的 `result` 消息交给父页面。 |
| `flow` | `kyuri-to-rmg` | 初始为「Kyuri → RMG」：仅展示 RMG JSON 输出区；Kyuri YAML 由父页面通过 `setKyuriYaml` 下发；RMG 模板使用子页面内置加载的 JSON（见 `public/rmg-default-template.json`）。 |

独立打开（不设 `hideOutput=1`）时，仍可通过页签在两种流程间切换。

### 与父页面的 postMessage 约定

- 父页面 → 子 iframe：`source: "njmetro-railmap-parent"`，消息类型与字段见 `src/web/protocol.ts`（如 `setKyuriYaml`、`setRmgJson`、`convert`）。
- 子 iframe → 父页面：`source: "kyuri-rmg-tool"`，`type: "ready"` 表示可下发数据；`type: "result"` 表示一次转换结束（成功带 `yaml` 或 `json`，失败带 `message`）。

构建：

```bash
npm run build
```

产物：`dist/`（Node 库 + CLI）、`dist-web/`（静态站点）。

## CLI

子命令：`rmg-to-kyuri`、`kyuri-to-rmg`。后者输入的 YAML 须为 **Kyuri naive 3.0**（根节点 `version: 3`）；不接受 v2 或以站点数组为根的旧格式。

```bash
npm run build:lib
node dist/cli.js --help
```

## 默认 RMG 模板

内置 `public/rmg-default-template.json`，用于「Kyuri → RMG」的非 **Kyuri naive** 字段，根据本文写成时 RMG 上的显示，其原作者为 @Thomastzc、@thekingofcity、和 @816R。
