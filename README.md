# cursor-memory-cli

![Cursor Memory Banner](./assets/banner.png)

一个用于安装和配置 Cursor Memory 系统的命令行工具。Cursor Memory 是一个持续学习系统，可以从 Cursor 会话中提取结构化记忆，并将其编码为可查询的 JSON 记录，供跨会话调用。

## 目录

- [概述](#概述)
- [安装](#安装)
- [快速开始](#快速开始)
- [安装组件说明](#安装组件说明)
- [使用方法](#使用方法)
- [记忆类型](#记忆类型)
- [存储结构](#存储结构)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

## 概述

Cursor Memory 系统通过以下机制工作：

1. **Hook 触发**：在每次提交 prompt 前，自动触发记忆评估提醒
2. **Skill 自主执行**：cursor-memory skill 独立完成记忆分析、提取和存储
3. **结构化提取**：提取决策、洞察、模式、纠正等多种类型的记忆
4. **持久化存储**：将记忆保存为结构化 JSON 文件，便于后续查询

### Skill 与 Command 的关系

- **cursor-memory skill**：核心组件，自主完成记忆的分析、提取和存储，无需调用外部命令
- **catch-memory command**：手动补充工具，供用户在需要时显式触发记忆提取

### 核心特性

- **自动触发**：通过 Cursor hooks 机制自动触发记忆评估
- **智能去重**：同一会话的多次提取会自动合并到同一文件
- **质量过滤**：仅保留置信度 >= 50 的高价值记忆
- **结构化存储**：按日期组织的 JSON 文件，便于检索

## 安装

### 前置要求

- Node.js 18+
- Cursor Editor

### 运行安装命令

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs setup
```

### 安装模式

CLI 支持两种安装模式：

#### 全局模式（推荐）

适用于所有项目，配置存储在 `~/.cursor/` 目录：

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs setup --global
```

#### 本地模式

仅适用于当前项目，配置存储在项目的 `.cursor/` 目录：

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs setup --local
```

#### 交互式选择

如果不指定模式，CLI 会提示你选择：

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs setup
```

```
? Where would you like to install cursor-memory?
❯ Global (~/.cursor/) - applies to all projects
  Local  (./.cursor/) - applies to current project only
```

## 快速开始

### 1. 安装 Cursor Memory

```bash
# 全局安装（推荐）
node ~/.cursor/cli/cursor-memory-cli/index.mjs setup --global
```

安装完成后会显示：

```
[ok]   cursor-memory setup complete!
       Components installed:
         - hooks.json (merged)
         - hooks/cursor-memory-reminder.sh (executable)
         - hooks/cursor-memory-archive.sh (executable)
         - hooks/cursor-memory-archive.mjs
         - memory-archive.json
         - skills/cursor-memory/ (SKILL.md, README.md)
         - commands/catch-memory.md
```

### 2. 重启 Cursor

安装完成后，重启 Cursor 以加载新的 hooks 配置。

### 3. 开始使用

现在每次与 Cursor Agent 交互时，系统会自动评估是否需要提取记忆。cursor-memory skill 会自主完成记忆的分析、提取和存储。

如果需要手动触发记忆提取，可以使用命令：

```
/catch-memory
```

## 安装组件说明

CLI 会安装以下组件：

### 1. hooks.json

配置 Cursor 在提交 prompt 前触发记忆提醒钩子。

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "~/.cursor/hooks/cursor-memory-reminder.sh"
      }
    ],
    "sessionEnd": [
      {
        "command": "~/.cursor/hooks/cursor-memory-archive.sh"
      }
    ]
  }
}
```

**注意**：如果已有 `hooks.json`，CLI 会智能合并配置，不会覆盖现有的 hooks。

### 2. cursor-memory-reminder.sh

位于 `hooks/` 目录的可执行脚本，负责：

- 在每次交互前注入记忆评估提醒规则
- 创建临时规则文件 `rules/cursor-memory-reminder.mdc`
- 提示 Agent 评估当前会话是否产生了值得保留的记忆

### 3. cursor-memory-archive.sh / cursor-memory-archive.mjs

位于 `hooks/` 目录的归档脚本与执行器，负责：

- 在 `sessionEnd` 时扫描 `./memories/` 中过期文件
- 将过期会话移动到 `./memories/archive/`
- 按月生成聚合文件 `./memories/archive/aggregate/YYYY-MM.json`
- 跨会话相似度去重（Jaccard > 0.85）

### 4. cursor-memory skill

位于 `skills/cursor-memory/` 目录，包含：

- `SKILL.md`：技能定义文件，描述何时激活及工作流程
- `references/TYPES.md`：10 种记忆类型和 12 种实体类型的定义
- `references/STORAGE.md`：存储格式和去重逻辑说明

### 5. memory-archive.json

归档配置文件，默认内容如下：

```json
{
  "retention_days": 60,
  "expiry_basis": "last_updated",
  "archive_dir": "./memories/archive",
  "aggregate": {
    "granularity": "month",
    "schema": "sessions+deduped_index",
    "dedupe": {
      "method": "jaccard",
      "threshold": 0.85,
      "fields": ["content"]
    }
  },
  "processing_limit": 200,
  "log_file": "./memories/archive.log",
  "quarantine_dir": "./memories/.quarantine",
  "lock_file": "./memories/.archive.lock",
  "remove_empty_dirs": true
}
```

### 6. catch-memory 命令（手动补充）

位于 `commands/catch-memory.md`，作为手动触发记忆提取的补充工具。

**注意**：cursor-memory skill 已具备独立完成记忆提取的能力，此命令主要用于用户需要显式控制时使用。

## 使用方法

### 自动模式（推荐）

安装完成后，cursor-memory skill 会在以下情况自动评估并提取记忆：

- 解决了复杂的调试问题
- 通过试错找到了可行的解决方案
- 用户纠正了 Agent 的假设或方法
- 做出了重要的架构或技术决策
- 发现了跨会话相关的洞察

Skill 会自主完成记忆的分析、提取和存储到 `./memories/` 目录，无需用户干预。

### 手动触发（补充方式）

当需要显式控制记忆提取时，可以在 Cursor 中使用命令：

```
/catch-memory
```

分析当前会话并提取记忆。

分析特定会话文件：

```
/catch-memory /path/to/session-file.json
```

**适用场景**：

- 希望立即提取记忆而不等待自动评估
- 需要分析历史会话文件
- 调试记忆提取功能

### 归档（手动触发）

如果需要手动执行归档（例如调试或预览），可以运行：

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs archive --global
```

预览模式（不移动文件）：

```bash
node ~/.cursor/cli/cursor-memory-cli/index.mjs archive --global --dry-run
```

### 显式请求

你也可以直接对 Agent 说：

- "Save memories"（保存记忆）
- "Remember this"（记住这个）
- "What did we learn?"（我们学到了什么？）

## 记忆类型

Cursor Memory 支持 10 种记忆类型：

| 类型            | 说明                             | 示例                                                        |
| --------------- | -------------------------------- | ----------------------------------------------------------- |
| `decision`      | 在备选方案之间做出的选择及其推理 | 选择 Vercel 而非 Netlify 部署，因为 Next.js 集成更好        |
| `insight`       | 跨会话相关的发现                 | 发现遗留认证服务需要特定的 header 格式                      |
| `confidence`    | 完整性或确定性评估               | 高置信度认为数据库迁移是安全的                              |
| `pattern_seed`  | 可能演变为模式的早期观察         | 用户经常要求在实现前先用 Jest 写测试                        |
| `commitment`    | 对未来工作的承诺或期望           | 承诺在 API 变更后更新文档                                   |
| `learning`      | 技术或系统学习                   | 发现 API 速率限制是 100 req/min，而非 1000                  |
| `correction`    | 用户对 Agent 行为的纠正          | 用户纠正了使用 Redux 的假设，实际使用 Zustand               |
| `cross_agent`   | 给其他 Agent 的信息              | 给未来 Agent 的注意事项：运行集成测试前必须 seed 测试数据库 |
| `workflow_note` | 偏离默认工作流的情况及原因       | 由于时间限制，跳过了此热修复的单元测试                      |
| `gap`           | 发现的缺失信息或能力             | 缺少 staging 环境的访问凭证                                 |

### 置信度评分

每条记忆必须包含置信度评分（50-100）：

- **90-100**：记录中的明确陈述
- **70-89**：从上下文强烈暗示
- **50-69**：带有不确定性的合理推断
- **< 50**：不提取（太不确定）

## 存储结构

### 文件位置

记忆存储在当前工作目录的 `./memories/` 目录下：

```
./memories/
├── 2026-01-30/
│   ├── 14-30-00-fix-auth-bug.json
│   └── 16-45-00-api-refactor.json
├── 2026-01-31/
│   └── 10-00-00-database-migration.json
```

### JSON 结构

```json
{
  "session_id": "2026-01-30-14-30-00-fix-auth-bug",
  "timestamp": "2026-01-30T14:30:00Z",
  "last_updated": "2026-01-30T15:45:00Z",
  "extraction_count": 2,
  "memories": [
    {
      "type": "decision",
      "category": "technical",
      "title": "选择 JWT 而非 Session 进行认证",
      "content": "决定使用 JWT 进行 API 认证，因为需要支持移动端和无状态的微服务架构",
      "source_chunk": "**User:** 我们应该用什么方式做认证？\n**Assistant:** 考虑到需要支持移动端...",
      "reasoning": "JWT 更适合分布式系统和移动端场景",
      "alternatives": [
        { "option": "Session", "why_not": "需要服务端状态，不适合微服务" }
      ],
      "selected_option": "JWT",
      "confidence_score": 95,
      "related_entities": [
        {
          "type": "project",
          "raw": "auth-service",
          "slug": "auth-service",
          "resolved": true
        }
      ],
      "tools_mentioned": [],
      "urls_mentioned": [],
      "target_agents": []
    }
  ],
  "suggestions": []
}
```

### 单会话单文件机制

同一会话的多次记忆提取会自动合并到同一个文件：

1. **会话标识**：基于会话开始时间生成稳定的 session_id
2. **智能去重**：基于 `(type, title)` 和内容相似度去重
3. **版本选择**：保留置信度更高的版本
4. **元数据更新**：更新 `last_updated` 和 `extraction_count`

## 配置说明

### hooks.json 配置

如果需要自定义 hooks 配置，可以编辑 `hooks.json`：

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "~/.cursor/hooks/cursor-memory-reminder.sh"
      },
      {
        "command": "其他 hook 命令"
      }
    ],
    "sessionEnd": [
      {
        "command": "~/.cursor/hooks/cursor-memory-archive.sh"
      }
    ]
  }
}
```

### 归档配置（memory-archive.json）

可在 `memory-archive.json` 中调整：

- `retention_days`：过期天数阈值
- `expiry_basis`：过期检测字段（`last_updated` / `timestamp`）
- `archive_dir`：归档目录
- `processing_limit`：每次 sessionEnd 处理的最大文件数
- `log_file`：归档日志路径
- `quarantine_dir`：损坏文件隔离目录
- `lock_file`：并发锁文件路径
- `remove_empty_dirs`：是否清理空日期目录

### 调整记忆提取行为

编辑 `skills/cursor-memory/SKILL.md` 可以调整：

- 激活触发条件
- 记忆质量标准
- 提取数量限制

## 常见问题

### Q: 安装后 hook 没有触发？

A: 请确保：

1. 重启了 Cursor
2. `hooks/cursor-memory-reminder.sh` 有执行权限（`chmod +x`）
3. `hooks.json` 语法正确

### Q: 记忆文件存储在哪里？

A: 记忆存储在当前工作目录的 `./memories/` 目录下，按日期组织。
### Q: 归档文件存储在哪里？

A: 归档文件存储在 `./memories/archive/` 目录下，聚合文件位于 `./memories/archive/aggregate/`。

### Q: JSON 解析失败的文件会怎样？

A: 会被移动到 `./memories/.quarantine/`，同时记录在 `./memories/archive.log` 中。

### Q: 如何查看提取的记忆？

A: 直接查看 `./memories/YYYY-MM-DD/` 目录下的 JSON 文件。

### Q: 可以禁用自动记忆提取吗？

A: 可以，删除或注释 `hooks.json` 中的 `cursor-memory-reminder.sh` 条目即可。

### Q: 全局安装和本地安装有什么区别？

A:

- **全局安装**（`~/.cursor/`）：对所有项目生效
- **本地安装**（`./.cursor/`）：仅对当前项目生效，优先级更高

### Q: 如何更新 cursor-memory-cli？

A: 重新运行安装命令即可，CLI 会智能合并配置而不会丢失现有设置。

## 命令参考

```
Usage: node cli/cursor-memory-cli/index.mjs <command> [options]

Commands:
  setup     Install cursor-memory components
  archive   Run memory archive manually

Options:
  --global    Install to ~/.cursor/ (user-level)
  --local     Install to ./.cursor/ (project-level)
  --dry-run   Preview archive without moving files (archive command)
  --threshold <days>  Override retention days (archive command)
  --limit <n>  Override max files per run (archive command)
  --help      Show help message
```

## 技术架构

```
cursor-memory-cli/
├── index.mjs           # CLI 入口
├── lib/
│   ├── constants.mjs   # 常量定义
│   ├── copy.mjs        # 文件复制工具
│   ├── hooks.mjs       # hooks.json 合并逻辑
│   ├── logger.mjs      # 日志输出
│   ├── setup.mjs       # 安装流程
│   └── ui.mjs          # 交互式 UI
└── templates/
    ├── hooks.json              # hooks 配置模板
    ├── memory-archive.json     # 归档配置模板
    ├── hooks/
    │   ├── cursor-memory-reminder.sh  # hook 脚本
    │   ├── cursor-memory-archive.sh   # 归档 hook
    │   └── cursor-memory-archive.mjs  # 归档执行器
    ├── skills/
    │   └── cursor-memory/      # 技能定义
    │       ├── SKILL.md
    │       └── references/
    │           ├── TYPES.md
    │           └── STORAGE.md
    └── commands/
        └── catch-memory.md   # 命令定义
```

## License

MIT
