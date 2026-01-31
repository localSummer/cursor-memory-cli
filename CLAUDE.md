# cursor-memory-cli

用于安装和配置 Cursor Memory 系统的命令行工具。

## 项目概述

cursor-memory-cli 是一个 Node.js CLI 工具，用于在全局或项目级别安装 Cursor Memory 组件，实现从 Cursor 会话中自动提取结构化记忆。

## 技术栈

- **运行时**: Node.js 18+
- **模块系统**: ES Modules (.mjs)
- **无外部依赖**: 仅使用 Node.js 内置模块

## 项目结构

```
cursor-memory-cli/
├── index.mjs           # CLI 入口，参数解析
├── lib/
│   ├── constants.mjs   # 路径常量和工具函数
│   ├── copy.mjs        # 文件/目录复制工具
│   ├── hooks.mjs       # hooks.json 读取、合并、写入
│   ├── logger.mjs      # 彩色日志输出
│   ├── setup.mjs       # 安装流程主逻辑
│   └── ui.mjs          # 交互式选择菜单
└── templates/          # 安装模板文件
    ├── hooks.json
    ├── hooks/cursor-memory-reminder.sh
    ├── skills/cursor-memory/
    └── commands/catch-memory.md
```

## 开发规范

### 代码风格

- 使用 ES Modules 语法 (`import`/`export`)
- 函数命名使用 camelCase
- 常量命名使用 UPPER_SNAKE_CASE
- 每个模块职责单一，保持简洁

### 模块职责

| 模块            | 职责                         |
| --------------- | ---------------------------- |
| `index.mjs`     | CLI 入口、参数解析、命令路由 |
| `setup.mjs`     | 安装流程编排                 |
| `hooks.mjs`     | hooks.json 配置合并逻辑      |
| `copy.mjs`      | 文件系统操作封装             |
| `constants.mjs` | 路径解析和常量定义           |
| `logger.mjs`    | 终端彩色日志                 |
| `ui.mjs`        | 交互式用户界面               |

### 错误处理

- 使用 `throw new Error()` 抛出错误
- 在 `index.mjs` 统一捕获并输出错误信息
- 错误信息应清晰指示问题和可能的解决方案

## 常用命令

```bash
# 运行 CLI（全局安装）
node index.mjs setup --global

# 运行 CLI（本地安装）
node index.mjs setup --local

# 查看帮助
node index.mjs --help
```

## 安装流程

`setup` 命令执行以下步骤：

1. **合并 hooks.json** - 读取现有配置，添加 cursor-memory hook
2. **安装 hook 脚本** - 复制 `cursor-memory-reminder.sh` 并设置执行权限
3. **安装 skill** - 复制 `skills/cursor-memory/` 目录
4. **安装命令** - 复制 `commands/catch-memory.md`

## 扩展指南

### 添加新命令

1. 在 `index.mjs` 的 `parseArgs()` 中添加命令识别
2. 创建对应的处理函数或模块
3. 在 `main()` 中添加命令路由

### 添加新模板

1. 将模板文件放入 `templates/` 对应目录
2. 在 `setup.mjs` 中添加复制逻辑
3. 更新 README.md 文档

## Git 工作流

- 提交信息格式: `type: description`（小写，不超过 70 字符）
- 类型: `feat`, `fix`, `docs`, `refactor`, `chore`
