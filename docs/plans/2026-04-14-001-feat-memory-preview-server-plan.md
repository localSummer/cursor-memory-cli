---
title: "feat: Add serve command for online memory file preview"
type: feat
status: active
date: 2026-04-14
deepened: 2026-04-14
---

# feat: Add serve command for online memory file preview

## Overview

为 cursor-memory-cli 新增 `serve` 命令，启动一个仅绑定 `127.0.0.1` 的本地 HTTP 服务，提供记忆文件的在线预览界面。用户指定一个根目录后，系统递归扫描其下所有 `memories/` 目录，在浏览器中呈现：左侧目录树（按项目 > 日期分组 > 文件排列），右侧记忆内容的富格式展示，以及全局搜索能力。

## Problem Frame

记忆文件以 JSON 格式分散存储在各项目的 `memories/` 目录中，直接阅读 JSON 不直观，也无法跨项目浏览和检索。需要一个轻量级的本地预览工具，将原始 JSON 转化为结构化、可交互的可视化展示。

## Requirements Trace

- R1. 左侧展示目录结构树：按项目分组 > memories/archive 分区 > 日期分组 > 日期排序展示记忆文件
- R2. 点击文件在右侧预览，将 JSON 转为用户友好的展示格式（卡片式布局、类型标签、置信度可视化等）
- R3. 包含良好的交互动画（展开收起、内容切换、加载过渡等）
- R4. 支持全局记忆查找（跨项目、跨文件搜索标题和内容）
- R5. 通过 CLI `serve` 命令快速启动，指定根目录作为扫描范围
- R6. 安全性：仅监听 loopback 地址，防路径穿越，防 XSS

## Scope Boundaries

- 只读预览，不支持编辑或删除记忆文件
- 不支持实时文件监听（刷新页面重新加载即可）
- 不包含用户认证（纯本地 loopback 服务）
- 不引入前端构建流程（前端为单 HTML 文件，内联 CSS/JS）
- 不引入外部 npm 依赖（保持项目零依赖约束）

## Context & Research

### Relevant Code and Patterns

- `index.mjs` — CLI 入口，`parseArgs()` 识别命令，`main()` 路由。当前所有命令共享 `--global`/`--local` 模式选择，`serve` 需要绕过此逻辑
- `lib/constants.mjs` — 路径常量和解析函数
- `lib/setup.mjs` — 安装流程编排，展示了步骤化执行模式
- `lib/logger.mjs` — 彩色日志输出
- `templates/hooks/cursor-memory-archive.mjs` — 归档逻辑，包含目录扫描、JSON 读取、文件遍历的成熟模式
- `templates/skills/cursor-memory/references/STORAGE.md` — JSON Schema 定义
- `templates/skills/cursor-memory/references/TYPES.md` — 10 种记忆类型和 12 种实体类型定义

### JSON Data Structure

**会话文件** (`kind: "session"`)：`session_id`, `timestamp`, `last_updated`, `extraction_count`, `memories[]`, `suggestions[]`

每条 memory：`type`, `category`, `title`, `content`, `source_chunk`, `reasoning`, `alternatives[]`, `selected_option`, `confidence_score`, `related_entities[]`, `tools_mentioned[]`, `urls_mentioned[]`, `target_agents[]`

**归档聚合文件** (`kind: "aggregate"`)：`month`, `generated_at`, `retention_days`, `sessions[]`, `deduped_memories[]`, `stats{}`

### Directory Organization

```
memories/
  YYYY-MM-DD/                    # 日期目录
    HH-MM-SS-session-name.json   # 会话文件
  archive/                       # 归档目录
    YYYY-MM/                     # 月度归档
      YYYY-MM-DD-name.json       # 归档的会话文件（同 session schema）
    aggregate/
      YYYY-MM.json               # 月度聚合（aggregate schema）
```

### CLI 参数模型约束

当前 `parseArgs()` 将所有未识别的位置参数直接报错退出。`main()` 对所有命令统一触发 `--global`/`--local` 模式选择。`serve` 命令需要：
1. 接收位置参数作为根目录路径
2. 跳过 mode prompt（不需要 `--global`/`--local`）
3. `serve` 与 `--global`/`--local` 互斥，同时传入时报错

## Key Technical Decisions

- **依赖策略：保持零依赖**：与项目现有约束一致，server 使用 `node:http`，前端为纯 HTML/CSS/JS，不引入任何 npm 包
- **安全绑定：仅监听 loopback**：`server.listen(port, "127.0.0.1")` 确保服务不暴露到局域网。记忆数据可能包含敏感信息（决策、人名、项目细节），必须从计划层面写死此约束
- **路径安全：opaque file ID 方案**：前端不直接传递文件系统路径。扫描时为每个文件分配 opaque ID（如递增整数或 hash），API 通过 ID 查找文件。消除路径穿越攻击面。fallback 校验：即使 ID 反查到路径，仍用 `path.relative(rootPath, resolved)` 确认结果不以 `..` 开头
- **XSS 防护：textContent + 切片拼接**：前端渲染所有用户数据（content、source_chunk、title 等）必须使用 `textContent` 或 DOM API 创建文本节点。搜索高亮通过切片拼接 + `<mark>` 标签实现，不使用 `innerHTML` 注入原始字符串
- **前端架构：单 HTML 文件内联方案**：将 CSS 和 JS 内联在单个 `index.html` 中，由 server 直接读取并返回。避免引入前端构建流程
- **搜索策略：服务端搜索**：搜索在服务端执行（遍历 JSON 文件匹配关键词），返回匹配结果列表。归档目录下的会话文件纳入搜索，`aggregate/` 目录排除（避免与其 `sessions[]` 内容重复命中）
- **目录树加载与缓存**：首次 `/api/tree` 请求时递归扫描并缓存。缓存粒度为完整树结构 + file ID 索引映射。`/api/refresh` 清除整个缓存并重新扫描。`/api/search` 和 `/api/memory` 不受缓存影响（search 直接遍历文件系统，memory 按 ID 查找后直接读取文件）。不存在 refresh 与 search 的并发一致性问题，因为 search 不依赖缓存
- **端口策略**：默认 3000，支持 `--port` 参数覆盖，端口被占用时自动递增尝试（最多 10 次）
- **项目标识**：`projectId` 使用 `memories/` 相对于根目录的路径（如 `fe/fe-h2-pc/v6`），保证唯一性。`displayName` 使用最后一级非 `memories` 的目录名（如 `v6`），仅用于侧边栏展示。树节点 hover 时 tooltip 显示完整 `projectId`

## Data Models (DTO)

> *以下为数据传输结构的逻辑定义，非实现代码。实现时可用普通对象，无需类或 TypeScript。*

**TreeNode（目录树节点）：**
```
Project: { projectId, displayName, memories: DateGroup[], archive: MonthGroup[] }
DateGroup: { date: "YYYY-MM-DD", files: FileRef[] }
MonthGroup: { month: "YYYY-MM", files: FileRef[] }
FileRef: { id: opaqueId, name: string, timestamp: string, kind: "session" | "archived-session" }
```

**MemoryDocument（规范化后的文件内容）：**
```
kind: "session" | "aggregate"
// session: { sessionId, timestamp, lastUpdated, extractionCount, memories: Memory[], suggestions }
// aggregate: { month, generatedAt, stats, dedupedMemories: Memory[] }
```

**SearchHit（搜索结果条目）：**
```
{ fileId, projectId, displayName, fileName, memoryIndex, title, snippet, matchField: "title"|"content", kind }
```

## Open Questions

### Resolved During Planning

- **Q: 如何处理大量记忆文件的性能？** — 树结构只传输 FileRef（不含完整 JSON），单个文件按需加载。搜索结果限制最大 50 条，按时间降序排列
- **Q: 归档文件如何展示？** — 树结构中每个项目下分为"记忆"和"归档"两个区域。归档区按月分组，`aggregate/` 目录的聚合文件排除出搜索但可在树中直接点击查看
- **Q: 搜索是否覆盖 aggregate 文件？** — 不覆盖。aggregate 文件的 `deduped_memories` 与原始会话文件内容重复，纳入搜索会导致重复命中。用户可在树中直接点击 aggregate 文件查看统计摘要
- **Q: serve 与现有 CLI 参数模型的兼容性？** — `serve` 命令绕过 mode prompt，位置参数作为根目录。`parseArgs()` 需按命令分流解析：识别到 `serve` 后，后续参数按 serve 规则解析（`--port` 和位置参数），不走 `--global`/`--local` 逻辑
- **Q: 根目录不存在或不可读？** — 在启动 server 前校验根目录存在且可读（`fs.accessSync(rootPath, fs.constants.R_OK)`），失败时 `log.error()` 并退出

### Deferred to Implementation

- 大文件（聚合 JSON 可能较大）的渲染性能优化策略，视实际文件大小决定
- source_chunk 中的对话标记（`**User:**` / `**Assistant:**`）的精确渲染规则
- 搜索结果是否需要 cursor 分页（初版固定 50 条上限，后续视需求扩展）

## Output Structure

```
lib/
  scanner.mjs          # 目录扫描、文件索引、搜索、DTO 构建
  server.mjs           # HTTP 服务器与 API 路由
templates/
  serve/
    index.html         # 前端 SPA（内联 CSS + JS）
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                  CLI (index.mjs)
                       |
                  serve command
                   (validate rootPath, resolve port)
                       |
              lib/server.mjs
              (node:http, bindAddress=127.0.0.1)
                  /    |    \
          GET /   GET /api/*  GET /api/search
            |        |            |
      index.html  scanner.mjs  scanner.mjs
      (SPA)      (tree/file)   (full-text)
                       |
               File ID Index
              (opaqueId -> absPath)
```

**API Contract:**

| Endpoint | Method | Params | Response | Description |
|---|---|---|---|---|
| `/` | GET | — | `text/html` | 返回前端 SPA |
| `/api/tree` | GET | — | `{ projects: Project[] }` | 目录树结构（首次调用触发扫描并缓存） |
| `/api/memory/:id` | GET | `id`: opaque file ID | `{ kind, ...MemoryDocument }` | 读取并返回规范化的记忆文件内容 |
| `/api/search` | GET | `q`: keyword, `limit?`: number(default 50) | `{ results: SearchHit[], total: number }` | 全局搜索，按时间降序，最多 limit 条 |
| `/api/refresh` | POST | — | `{ ok: true }` | 清除缓存，下次 `/api/tree` 将重新扫描 |

`/api/memory/:id` 使用 URL path 参数而非 query string，ID 为扫描时分配的 opaque 整数。无效 ID 返回 404。

**前端 SPA 布局:**

```
+------------------------------------------+
|  cursor-memory       [Search...] [Refresh]|
+----------+-------------------------------+
| Project A|                               |
|  > 记忆  |   Session: 2026-03-26 14:13   |
|    2026- |   Extraction #2               |
|      file|                               |
|      file|   [decision] Title            |
|  > 归档  |   Content (textContent)...    |
| Project B|   Confidence: ████░░ 80       |
|  > ...   |   Entities: [tag] [tag]       |
|          |   > Source (collapsed)         |
+----------+-------------------------------+
```

**安全边界:**

```
Client (browser)          Server (127.0.0.1 only)
     |                          |
     |--- GET /api/memory/42 -->|
     |                          |-- idIndex[42] -> absPath
     |                          |-- validate: path.relative(root, absPath)
     |                          |   does NOT start with ".."
     |                          |-- read file, normalize DTO
     |<-- JSON (MemoryDocument)-|
     |                          |
     |-- render with textContent (never innerHTML for user data)
```

## Test Infrastructure

使用 Node.js 18+ 内置 `node:test` 模块 + `node:assert`，保持零依赖。

**Fixture 策略：**
- 测试前在 `os.tmpdir()` 下创建临时目录，模拟多项目、多 schema 的 memories 结构
- 包含：正常会话文件、归档文件、聚合文件、损坏 JSON、空目录、无权限目录
- 测试后清理临时目录

**测试文件位置：**
- `test/scanner.test.mjs` — scanner 模块单元测试
- `test/server.test.mjs` — HTTP API 集成测试（启动真实 server，用 `http.request` 调用）

## Implementation Units

- [ ] **Unit 1: CLI Command Integration**

**Goal:** 在 CLI 入口注册 `serve` 命令，按命令分流参数解析，绕过 mode prompt

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `index.mjs`
- Modify: `lib/constants.mjs`

**Approach:**
- 在 `parseArgs()` 中添加 `serve` 命令识别
- 识别到 `serve` 后，后续参数按 serve 规则解析：
  - `--port <number>` — 端口号
  - 未被 `--` 前缀识别的位置参数 — 根目录路径
  - `--global`/`--local` 与 `serve` 同时出现时报错退出
- 返回值增加 `rootPath` 和 `port` 字段
- `main()` 中 `serve` 分支不触发 `promptMode()`，直接校验 rootPath 并调用 server 启动函数
- rootPath 默认值为 `process.cwd()`
- 启动前校验：`fs.accessSync(rootPath, fs.constants.R_OK)`，失败时报错 "Root directory not found or not readable: <path>"
- 更新 USAGE 字符串添加 serve 命令说明
- 在 `constants.mjs` 中添加 `DEFAULT_SERVE_PORT = 3000`

**Patterns to follow:**
- 参照现有 `setup`/`archive` 命令注册模式
- 参照 `--threshold` 的值参数解析模式

**Test scenarios:**
- Happy path: `parseArgs(["serve", "/tmp/test"])` 返回 `{ command: "serve", rootPath: "/tmp/test", port: 3000 }`
- Happy path: `parseArgs(["serve", "--port", "8080", "/tmp/test"])` 返回 port=8080
- Happy path: `parseArgs(["serve"])` rootPath 默认为 cwd
- Error path: `parseArgs(["serve", "--port", "abc"])` 报错非法端口
- Error path: `parseArgs(["serve", "--global"])` 报错互斥参数
- Error path: `parseArgs(["serve", "--local"])` 报错互斥参数
- Error path: 根目录不存在时 main() 报错并退出
- Error path: 根目录无读权限时 main() 报错并退出
- Happy path: `--help` 输出包含 serve 命令说明

**Verification:**
- 命令行参数正确解析，serve 绕过 mode prompt
- 非法输入全部有明确错误提示

**Files (test):**
- Create: `test/cli.test.mjs`

---

- [ ] **Unit 2: Directory Scanner and Data Models**

**Goal:** 实现递归目录扫描，构建规范化的 DTO 树结构，提供 opaque file ID 索引和搜索能力

**Requirements:** R1, R4, R5

**Dependencies:** None（可与 Unit 1 并行）

**Files:**
- Create: `lib/scanner.mjs`
- Create: `test/scanner.test.mjs`

**Approach:**
- **扫描逻辑：**
  - 从指定根目录出发，递归查找所有 `memories/` 目录
  - `projectId` = memories 目录相对于根目录的父路径（如 `fe/fe-h2-pc/v6`）
  - `displayName` = projectId 中最后一个有意义的目录段
  - 对每个 `memories/` 目录，分别扫描活跃记忆（YYYY-MM-DD 日期目录）和归档（`archive/YYYY-MM/` 月度目录 + `archive/aggregate/` 聚合目录）
  - 跳过 `.quarantine/`、`.archive.lock`、`archive.log` 等非数据文件
  - 日期组内按日期时间降序排列

- **File ID 索引：**
  - 扫描时为每个 JSON 文件分配递增整数 ID
  - 维护 `Map<id, { absPath, projectId, kind }>` 索引
  - 导出 `getFileById(id)` 查找文件路径，若 ID 不存在返回 null

- **MemoryDocument 规范化：**
  - `readMemoryFile(id)` 根据 ID 查找路径，读取并解析 JSON
  - 通过检测 `month` 字段区分 kind："session" vs "aggregate"
  - 归档目录下的会话文件 kind 标记为 "archived-session"
  - 返回规范化的 `{ kind, ...data }` 结构
  - 即使使用 opaque ID，仍做 fallback 校验：`path.relative(rootPath, absPath)` 不以 `..` 开头

- **搜索逻辑：**
  - `searchMemories(rootPath, keyword, limit=50)` 遍历所有已知的会话/归档会话文件（排除 aggregate）
  - 对每个文件的 memories 数组，匹配 title 和 content 字段（大小写不敏感）
  - 返回 `{ results: SearchHit[], total: number }`，total 为实际匹配总数，results 截取前 limit 条
  - SearchHit 包含 fileId、projectId、displayName、fileName、memoryIndex、title、snippet（匹配上下文前后 50 字符）、matchField
  - 按 timestamp 降序排列

- **导出：**
  - `scanRoot(rootPath)` — 返回 `{ projects: Project[], fileIndex: Map }`
  - `readMemoryFile(rootPath, id, fileIndex)` — 返回 MemoryDocument
  - `searchMemories(rootPath, keyword, fileIndex, limit)` — 返回搜索结果

**Patterns to follow:**
- `templates/hooks/cursor-memory-archive.mjs` 中的目录遍历和 JSON 解析模式
- `lib/constants.mjs` 的模块导出风格

**Test scenarios:**
- Happy path: 扫描包含多个项目的根路径，返回正确的 Project 树，日期降序排列
- Happy path: 每个 FileRef 包含 opaque id，通过 `getFileById` 可查找回路径
- Happy path: `readMemoryFile` 正确区分 session 和 aggregate kind
- Edge case: 根目录下无任何 memories 目录，返回空 projects 数组
- Edge case: memories 目录存在但为空，该项目仍出现在树中但无子文件
- Edge case: 遇到非 JSON 文件或损坏的 JSON，跳过并记录警告，不中断扫描
- Edge case: 目录部分不可读时跳过不可读部分，继续扫描其他目录
- Happy path (search): 搜索关键词匹配 title 和 content，返回 SearchHit 列表
- Happy path (search): 搜索结果按时间降序排列，总数正确
- Edge case (search): 搜索无结果时返回 `{ results: [], total: 0 }`
- Edge case (search): limit 参数生效，results 不超过 limit 条但 total 反映真实总数
- Edge case (search): aggregate 文件不被搜索命中
- Happy path: projectId 唯一性——同名末级目录但不同路径的项目各自独立

**Verification:**
- `scanRoot()` 对已知目录结构返回正确的树和索引
- `searchMemories()` 能跨多个项目文件匹配关键词
- file ID 索引的 fallback 路径校验拦截异常路径

---

- [ ] **Unit 3: HTTP Server and API Routes**

**Goal:** 基于 `node:http` 搭建本地服务器，提供 API 端点和静态文件服务。包含最小 HTML 占位页以独立验证

**Requirements:** R1, R2, R4, R5, R6

**Dependencies:** Unit 2

**Files:**
- Create: `lib/server.mjs`
- Create: `templates/serve/index.html`（此阶段为最小功能 HTML shell，包含基础布局骨架和 API 调用逻辑，后续 Unit 4-6 逐步丰富）
- Create: `test/server.test.mjs`

**Approach:**
- 使用 `node:http.createServer` 创建服务器
- **绑定地址硬编码为 `127.0.0.1`**，不接受参数覆盖
- 基于 `URL` 和 `pathname` 的简单路由分发
- 路由表：
  - `GET /` — 读取 `templates/serve/index.html` 返回（Content-Type: text/html; charset=utf-8）
  - `GET /api/tree` — 首次调用时执行 `scanRoot()` 并缓存结果，返回 `{ projects }` JSON
  - `GET /api/memory/:id` — 从 URL path 提取 id（整数），调用 `readMemoryFile()` 返回 JSON。无效/不存在的 id 返回 404
  - `GET /api/search?q=<keyword>&limit=<n>` — 调用 `searchMemories()`，q 为空时返回 400
  - `POST /api/refresh` — 清除缓存的树结构和索引，返回 `{ ok: true }`
  - 其他路径 — 404 `{ error: "Not found" }`
- 错误处理：统一 JSON 错误响应 `{ error: "message" }`，Content-Type: application/json
- 端口递增逻辑：监听失败时自动 port+1，最多 10 次
- 启动成功后打印 `log.success("Server running at http://127.0.0.1:<port>")`，并尝试自动打开浏览器（`open` on macOS）
- 导出 `startServer(rootPath, port)` 函数

**Patterns to follow:**
- 参照 `lib/setup.mjs` 的模块导出模式
- 参照 `lib/logger.mjs` 的终端输出风格

**Test scenarios:**
- Happy path: 启动服务器后 GET / 返回 200 和 HTML 内容
- Happy path: GET /api/tree 返回包含 projects 数组的 JSON
- Happy path: GET /api/memory/1 返回文件内容（需先触发 tree 扫描建立索引）
- Happy path: GET /api/search?q=keyword 返回 `{ results, total }` 格式
- Happy path: POST /api/refresh 返回 `{ ok: true }` 并清除缓存
- Error path: GET /api/memory/99999 返回 404
- Error path: GET /api/memory/abc 返回 400（非整数 ID）
- Error path: GET /api/search（缺少 q 参数）返回 400
- Error path: GET /unknown-route 返回 404
- Edge case: 端口被占用时自动尝试下一个端口
- Security: 服务器只绑定 127.0.0.1（通过检查 server.address() 验证）
- Security: `/api/memory/:id` 对不存在的 ID 返回 404，不泄露路径信息

**Verification:**
- 服务器在 127.0.0.1 指定端口启动并响应所有 API 端点
- 所有错误响应为统一 JSON 格式
- 最小 HTML 页面可在浏览器中加载并显示基础内容

---

- [ ] **Unit 4: Frontend SPA - Layout, Tree and Navigation**

**Goal:** 构建前端单页应用的完整布局、目录树组件和导航交互

**Requirements:** R1, R3

**Dependencies:** Unit 3（替换最小 HTML shell）

**Files:**
- Modify: `templates/serve/index.html`

**Approach:**
- 单 HTML 文件，内联 `<style>` 和 `<script>`，按功能分区添加注释分隔标记
- CSS 使用 custom properties 定义主题色系（深色/浅色友好的中性色调），支持 `prefers-reduced-motion` 媒体查询禁用动画
- 布局：顶部导航栏（标题 + 搜索框 + 刷新按钮）+ 左侧固定宽度侧边栏 + 右侧主内容区
- 侧边栏树组件：
  - 第一级：项目 displayName（hover tooltip 显示完整 projectId），可折叠
  - 第二级：「记忆」和「归档」分区标签
  - 第三级：日期/月份分组标题
  - 第四级：具体文件节点（显示会话名称和时间，使用 `data-file-id` 属性存储 opaque ID）
- 交互动画（受 `prefers-reduced-motion` 控制）：
  - 树节点展开/收起：CSS `max-height` + `opacity` 过渡
  - 活跃节点高亮：CSS `transition` 背景色变化
  - 侧边栏滚动：`scroll-behavior: smooth`
- 页面加载时调用 `GET /api/tree` 获取数据渲染树
- 点击叶节点时调用 `GET /api/memory/<id>` 加载内容
- 刷新按钮调用 `POST /api/refresh` 然后重新加载树
- 键盘导航：上下方向键在树节点间移动，Enter 展开/选中，Tab 在侧边栏和内容区间切换
- 空状态：无项目时显示引导提示（"未找到 memories 目录，请确认根路径..."）
- 长文本截断：CSS `text-overflow: ellipsis`

**Patterns to follow:**
- TYPES.md 中的 10 种记忆类型定义颜色映射
- 树结构数据来自 `/api/tree` 的 JSON 响应，文件节点使用 opaque ID

**Test scenarios:**
- Happy path: 页面加载后侧边栏显示完整项目树，项目按名称排列，日期降序
- Happy path: 点击项目名展开/收起子目录，动画平滑
- Happy path: 点击文件节点右侧显示加载状态然后切换到内容
- Edge case: 无任何项目时显示空状态提示
- Edge case: 项目名或文件名过长时文本截断并显示 tooltip
- Happy path: 键盘方向键可在树节点间导航
- Happy path: prefers-reduced-motion 启用时动画被禁用

**Verification:**
- 树组件正确渲染多层嵌套结构
- 展开/收起动画流畅无跳闪
- 点击文件节点能触发内容加载
- 所有用户数据渲染使用 textContent，无 innerHTML

---

- [ ] **Unit 5: Frontend SPA - Memory Viewer**

**Goal:** 将 JSON 记忆数据转化为用户友好的卡片式富展示，正确处理两种 schema

**Requirements:** R2, R3

**Dependencies:** Unit 4

**Files:**
- Modify: `templates/serve/index.html`

**Approach:**
- **Session 文件展示：**
  - 顶部显示会话元信息：session_id、timestamp、extraction_count
  - 每条 memory 渲染为独立卡片，包含：
    - **类型标签**：根据 10 种 type 显示不同颜色 badge（decision=蓝, insight=绿, correction=红 等），使用 `textContent` 设置文本
    - **标题**：加粗显示
    - **内容**：正文区域，换行使用 CSS `white-space: pre-wrap`，文本通过 `textContent` 渲染
    - **置信度**：进度条可视化（0-100），颜色随分值变化
    - **相关实体**：以标签组呈现，不同 entity type 不同颜色
    - **工具和 URL**：列表展示，URL 使用 `<a>` 标签但 href 值经过校验（仅 http/https 协议）
    - **来源片段**（source_chunk）：默认折叠，点击展开。User/Assistant 标记通过字符串切分渲染为对话气泡样式，所有文本通过 `textContent` 渲染
    - **备选方案**（alternatives）：仅 decision 类型显示
    - **推理**（reasoning）：斜体显示

- **Aggregate 文件展示：**
  - 显示 month、generated_at、retention_days 元信息
  - stats 区域：session_count、memory_count、deduped_count 以数字卡片展示
  - deduped_memories 列表复用 session 的 memory 卡片渲染逻辑

- **交互动画（受 `prefers-reduced-motion` 控制）：**
  - 内容区域切换：CSS `opacity` + `transform` 淡入效果
  - 卡片出现：staggered animation（依次出现）
  - source_chunk 展开/收起：`max-height` 过渡
  - 置信度进度条：CSS `width` 动画

- **优雅降级：** 可选字段（alternatives, reasoning, tools_mentioned, urls_mentioned）为空/缺失时，对应区域不渲染

**Patterns to follow:**
- TYPES.md 定义的 10 种记忆类型决定 badge 颜色
- STORAGE.md 定义的 JSON 字段结构
- DTO 中的 kind 字段决定渲染分支

**Test scenarios:**
- Happy path: 加载 session 文件，每条 memory 正确渲染为卡片，类型标签颜色正确
- Happy path: 加载 aggregate 文件，显示 stats 摘要和 deduped_memories 列表
- Happy path: 置信度进度条显示正确比例和颜色
- Happy path: 点击 source_chunk 展开区域显示对话内容，再点收起
- Edge case: memory 缺少可选字段时卡片优雅降级，不显示空区域
- Edge case: content 包含 HTML 特殊字符（`<script>`, `<img onerror>`）时不触发执行，仅显示文本
- Edge case: URL 字段包含 `javascript:` 协议时不渲染为可点击链接
- Integration: 在树中切换不同文件时，右侧内容平滑过渡到新内容

**Verification:**
- 所有 10 种记忆类型均有对应的视觉区分
- session 和 aggregate 两种 schema 均可正确渲染
- 可选字段缺失时不出现空白区域或报错
- 所有用户数据渲染使用 textContent/createTextNode，无 innerHTML 注入

---

- [ ] **Unit 6: Frontend SPA - Global Search**

**Goal:** 实现全局记忆搜索功能，支持跨项目关键词检索，搜索高亮使用安全的切片拼接方式

**Requirements:** R4, R3

**Dependencies:** Unit 4, Unit 5

**Files:**
- Modify: `templates/serve/index.html`

**Approach:**
- 顶部导航栏中的搜索输入框
- 输入时 300ms debounce，调用 `GET /api/search?q=<keyword>&limit=50`
- 每次新请求发出前取消上一次未完成的请求（AbortController）
- 搜索结果替代右侧主内容区显示：
  - 每条结果显示：所属项目 displayName、文件名、匹配的 memory 标题、内容摘要
  - 高亮实现：将 snippet 按匹配关键词位置切片，非匹配部分用 `createTextNode`，匹配部分用 `<mark>` 元素包裹 `textContent`，拼接为 DocumentFragment
  - 结果按时间降序排列，显示总数
  - 点击结果项跳转到对应文件预览（通过 fileId 调用 `/api/memory/:id`），并通过 memoryIndex 滚动到匹配的卡片
- 搜索状态：加载中 spinner、无结果提示（"未找到匹配的记忆"）、结果计数
- 按 Escape 或清空搜索框回到正常浏览模式
- 交互动画（受 `prefers-reduced-motion` 控制）：
  - 搜索结果列表淡入
  - 模式切换（浏览 <-> 搜索）平滑过渡

**Patterns to follow:**
- 参照 Unit 5 的卡片样式保持视觉一致性
- 高亮始终通过 DOM API 拼接，不使用 `innerHTML` 或 `String.replace` 注入 HTML

**Test scenarios:**
- Happy path: 输入关键词后显示跨项目的搜索结果，匹配词高亮显示
- Happy path: 点击搜索结果跳转到对应文件的预览视图
- Happy path: 结果显示 total 数量
- Edge case: 搜索无结果时显示友好的空状态提示
- Edge case: 快速连续输入时只触发最后一次搜索请求（debounce + AbortController 生效）
- Edge case: 搜索关键词包含 HTML 特殊字符时正常显示为文本，不触发 XSS
- Happy path: 按 Escape 或清空搜索框恢复浏览模式

**Verification:**
- 搜索结果正确匹配标题和内容中的关键词
- debounce + AbortController 防止过多并发 API 请求
- 高亮渲染全部通过安全 DOM API，无 innerHTML
- 浏览/搜索模式切换自然

## System-Wide Impact

- **Interaction graph:** serve 命令独立于 setup 和 archive，不修改任何已安装的组件。仅新增 CLI 路由分支和两个新模块
- **Error propagation:** 服务器错误通过 HTTP 状态码 + JSON body 传递给前端，前端展示错误提示。致命错误（端口占用失败、根目录不可读等）通过 `log.error()` + `process.exit(1)` 处理
- **State lifecycle risks:** 目录树缓存可能与文件系统不同步，通过手动刷新按钮解决。search 不依赖缓存，直接读文件系统，无一致性问题
- **API surface parity:** 无其他界面需要同步变更
- **Unchanged invariants:** setup 和 archive 命令行为不受影响。`parseArgs()` 的修改仅在识别到 `serve` 命令后分流，不影响现有 `setup`/`archive` 的参数解析路径。模板目录新增 `serve/` 子目录不影响现有安装流程

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 前端单文件过大影响可维护性 | 按功能分区组织代码（layout/tree/viewer/search），添加注释分隔标记。每个区域独立的 CSS/JS 块 |
| 大量记忆文件搜索性能 | 搜索时流式读取文件，固定上限 50 条返回。排除 aggregate 避免重复命中。后续可加内存索引缓存 |
| XSS 攻击面（记忆内容含任意字符串） | 所有用户数据通过 `textContent`/`createTextNode` 渲染。URL 仅允许 http/https 协议。搜索高亮通过切片拼接，不使用 innerHTML |
| 服务暴露到局域网 | 硬编码 `server.listen(port, "127.0.0.1")`，不提供绑定地址参数。测试中验证 `server.address().address === "127.0.0.1"` |
| 端口冲突 | 自动递增尝试，最多 10 个端口，全部失败则报错退出 |
| parseArgs 修改影响现有命令 | serve 分支严格在识别 `serve` 命令后才生效，现有 setup/archive 路径不变。添加回归测试确认 |

## Sources & References

- Related code: `templates/hooks/cursor-memory-archive.mjs` (目录扫描和 JSON 处理模式)
- Related code: `templates/skills/cursor-memory/references/STORAGE.md` (JSON Schema)
- Related code: `templates/skills/cursor-memory/references/TYPES.md` (类型定义)
- Related code: `index.mjs` (CLI 命令注册模式)
