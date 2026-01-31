---
description: 从 Claude Code 会话记录中提取结构化记忆
argument-hint: [会话文件路径] (可选，默认为当前会话)
allowed-tools: Read, Write, Bash, Glob
---

# Catch Memories（捕获记忆）

从 Claude Code 会话记录中提取结构化、可查询的记忆。捕获决策、洞察、模式、纠正和可学习信息，供跨会话调用。

## 用法

```bash
/catch-memories [会话文件路径]
```

**参数：**

- `会话文件路径`（可选）：指向特定会话记录文件的路径。如果省略，则分析当前会话记录。

## 核心功能

分析会话记录并提取结构化记忆，捕获以下内容：

- **决策原因**（不仅仅是发生了什么）
- **跨会话**相关的关于人员、项目、系统的洞察
- **模式**：如果重复出现可能值得形式化的模式
- **纠正**：用户教会你的内容
- **缺口**：发现的信息或能力缺失

## 处理流程

### 1. 获取会话记录

**如果未提供参数：**

- 从适当位置读取当前会话记录
- 提取会话元数据（ID、时间戳）

**如果提供了会话文件路径：**

- 验证文件路径是否存在
- 读取指定的会话记录
- 从文件中提取会话元数据

### 2. 记忆提取

使用 Sonnet 模型分析记录，提取 **3-10 条高价值记忆**。重点关注：

**10 种记忆类型：**

1. **decision（决策）** - 在备选方案之间做出的选择及其推理
2. **insight（洞察）** - 跨会话相关的发现
3. **confidence（置信度）** - 完整性评估
4. **pattern_seed（模式种子）** - 可能演变为模式的早期观察
5. **commitment（承诺）** - 设定的承诺或期望
6. **learning（学习）** - 技术或系统学习
7. **correction（纠正）** - 用户对 agent 行为的纠正
8. **cross_agent（跨 agent）** - 给其他 agent 的信息
9. **workflow_note（工作流备注）** - 偏离默认工作流的情况
10. **gap（缺口）** - 发现的缺失信息或能力

**12 种实体类型：**

- person（人员）、project（项目）、file（文件）、business（业务）、event（事件）、task（任务）、reminder（提醒）、workstream（工作流）、space（空间）、orbit（轨道）、command（命令）、agent（代理）

**意外触发器（高优先级）：**

1. 从失败中恢复（工具错误 → 不同方法 → 成功）
2. 用户纠正方向（"不"、"实际上"、"改用"）
3. 用户积极惊喜（"完美"、"正是如此"、"喜欢"）
4. 期望违背（预期 X，发现 Y）
5. 重复类似请求（工作流自动化机会）

### 3. 质量过滤

应用严格的质量标准：

- **质量优于数量** - 每个会话提取 3-10 条记忆
- **跳过常规操作** - 文件读取、简单编辑、格式更改
- **置信度阈值** - 最低分数 50（满分 100）
- **战略聚焦** - 优先考虑影响未来会话的决策

### 4. 审计跟踪合规性

每条提取的记忆必须包含：

- `source_chunk`：原始对话摘录（200-800 字符）
- `confidence_score`：确定性级别（50-100 范围）
- `related_entities`：结构化实体引用
- 适当的分类以便查询

**置信度评分指南：**

- **90-100**：记录中的明确陈述
- **70-89**：从上下文强烈暗示
- **50-69**：带有不确定性的合理推断
- **低于 50**：不提取（太不确定）

### 5. 输出生成

生成具有以下结构的 JSON 输出：

```json
{
  "session_id": "YYYY-MM-DD-HH-MM-SS-session-name",
  "timestamp": "2025-01-15T10:30:00Z",
  "last_updated": "2025-01-15T10:45:00Z",
  "extraction_count": 1,
  "memories": [
    {
      "type": "decision|insight|confidence|pattern_seed|commitment|learning|correction|cross_agent|workflow_note|gap",
      "category": "relationship|email|task|calendar|workflow|code|system|technical|data",
      "title": "简短摘要（最多 100 字符）",
      "content": "记忆的完整描述",
      "source_chunk": "带有 **User:** 和 **Assistant:** 标记的原始对话片段",
      "reasoning": "为什么这很重要或为什么做出这个选择（可选）",
      "alternatives": [{"option": "X", "why_not": "原因"}],
      "selected_option": "选择的内容（用于决策）",
      "confidence_score": 50-100,
      "related_entities": [
        {
          "type": "person|project|file|business|event|task|reminder|workstream|space|orbit|command|agent",
          "raw": "在记录中找到的文本",
          "slug": "已知的标识符或 null",
          "resolved": false
        }
      ],
      "tools_mentioned": ["工具名称"],
      "urls_mentioned": ["https://..."],
      "target_agents": ["相关的 agent 名称"]
    }
  ],
  "suggestions": []
}
```

### 6. 文件存储（单会话单文件机制）

#### 会话标识生成

1. **提取会话开始时间**
   - 从会话记录的第一条消息提取 timestamp
   - 格式化为：`YYYY-MM-DD-HH-MM-SS`
   - 这个时间作为稳定的会话标识，在整个会话中保持不变

2. **生成会话名称**
   - 从会话内容或用户提供的参数提取
   - 规范化为 slug 格式（小写、连字符分隔）

3. **构建稳定的 session_id**
   - 格式：`YYYY-MM-DD-HH-MM-SS-session-name`
   - 示例：`2026-01-30-14-30-00-fix-auth-bug`

#### 文件路径生成

将输出保存到**相对于当前执行路径**的结构化目录：

```
./memories/
├── YYYY-MM-DD/          # 日期目录
│   ├── HH-MM-SS-session-name.json  # 使用会话开始时间
│   └── ...
```

完整路径示例：`./memories/2026-01-30/14-30-00-fix-auth-bug.json`

#### 存储流程（单会话单文件保证）

**关键原则：同一会话的多次提取使用同一个文件**

1. **生成稳定的文件路径**

   ```python
   date = session_start_time[:10]  # YYYY-MM-DD
   time = session_start_time[11:19]  # HH-MM-SS（会话开始时间）
   name = session_name  # session-name
   file_path = f"./memories/{date}/{time}-{name}.json"
   ```

2. **检查文件是否存在**
   - 如果文件已存在 → 执行合并流程（步骤 3-6）
   - 如果文件不存在 → 创建新文件（步骤 7）

3. **读取现有记忆**

   ```python
   existing_data = read_json(file_path)
   existing_memories = existing_data['memories']
   ```

4. **智能合并（去重）**

   ```python
   merged_memories = []
   existing_index = {}

   # 索引现有记忆
   for mem in existing_memories:
       key = (mem['type'], mem['title'])
       existing_index[key] = mem
       merged_memories.append(mem)

   # 处理新记忆
   for new_mem in new_memories:
       key = (new_mem['type'], new_mem['title'])

       if key in existing_index:
           existing_mem = existing_index[key]
           # 相似度检查
           if is_similar(existing_mem['content'], new_mem['content']):
               # 保留置信度更高的版本
               if new_mem['confidence_score'] > existing_mem['confidence_score']:
                   # 替换为新版本
                   merged_memories = [m for m in merged_memories
                                      if not (m['type'] == key[0] and m['title'] == key[1])]
                   merged_memories.append(new_mem)
                   print(f"  • 更新记忆（更高置信度）: {new_mem['title']}")
               else:
                   print(f"  • 跳过重复记忆: {new_mem['title']}")
           else:
               # 内容不同，可能是同主题的新观察
               merged_memories.append(new_mem)
               print(f"  • 添加新观察: {new_mem['title']}")
       else:
           # 新记忆
           merged_memories.append(new_mem)
   ```

   **相似度判断：**
   - 使用简单的词集相似度（Jaccard 相似度）
   - 阈值：0.85（可调整）
   - 公式：`|A ∩ B| / |A ∪ B| > 0.85`

5. **更新元数据**

   ```python
   existing_data['memories'] = merged_memories
   existing_data['last_updated'] = current_timestamp()
   existing_data['extraction_count'] += 1
   ```

6. **写回文件**

   ```python
   write_json(file_path, existing_data)
   print(f"已合并 {len(new_memories)} 条新记忆到现有文件")
   print(f"当前文件共包含 {len(merged_memories)} 条记忆")
   ```

7. **创建新文件（首次提取）**

   ```python
   new_data = {
       "session_id": session_id,
       "timestamp": session_start_time,
       "last_updated": current_timestamp(),
       "extraction_count": 1,
       "memories": new_memories,
       "suggestions": []
   }
   write_json(file_path, new_data)
   print(f"已创建新文件并保存 {len(new_memories)} 条记忆")
   ```

8. **报告结果**
   - 向用户报告已保存的文件路径（使用完整的绝对路径以便清晰）
   - 报告合并统计信息（新增、更新、跳过的数量）

### 7. 错误处理（优雅降级）

遵循以下错误处理原则：

- **部分成功是可接受的** - 某些提取失败不应阻止整个输出
- **记录所有错误** - 将问题添加到 `suggestions` 数组，包含：
  - `type`："extraction_issue"
  - `message`：清晰的错误描述
  - `context`：相关片段
  - `severity`："warning" | "error"
- **绝不静默失败** - 所有异常必须记录
- **保持只读模式** - 不执行 git 操作，无副作用

## 示例

### 示例 1：分析当前会话

```bash
/catch-memories
```

**输出：**

```
正在分析当前会话记录...
提取了 5 条记忆：
- 1 条决策
- 2 条洞察
- 1 条纠正
- 1 条模式种子

已保存至：./memories/2025-01-15/14-30-00-update-neal-brown.json
```

### 示例 2：分析特定会话

```bash
/catch-memories /Users/wangxingwen/.claude/sessions/2025-01-14/10-15-00-email-triage.json
```

**输出：**

```
正在分析会话：/Users/wangxingwen/.claude/sessions/2025-01-14/10-15-00-email-triage.json
提取了 7 条记忆：
- 2 条决策
- 3 条洞察
- 1 条纠正
- 1 条学习

已保存至：./memories/2025-01-14/10-15-00-email-triage.json
```

## 应该跳过的内容

不要为以下内容提取记忆：

- 没有推理的常规工具使用
- 没有洞察的简单文件读取
- 确认语句（"好的"、"明白了"）
- 格式或样式更改
- 没有学习内容的调试输出

## 应该捕获的内容

务必为以下内容提取记忆：

- 考虑了备选方案的决策点
- 用户偏好（明确表达或暗示）
- 关系或项目发现
- 技术学习（特别是从错误中学到的）
- 用户对行为的纠正
- 带有推理的工作流偏差
- 意外触发器（见处理流程部分）

## 注意事项

### 核心原则

- **质量优于数量**：每个会话 3-10 条战略记忆
- **审计跟踪优先**：每条记忆必须有 source_chunk
- **优雅降级**：部分失败不会阻止输出
- **只读模式**：不执行 git 操作，纯函数行为
- **置信度阈值**：提取的最低分数为 50/100

### 存储位置

记忆 JSON 文件存储在**相对于当前执行路径**的位置：`./memories/`

### 模型要求

此命令使用 **Sonnet** 模型进行深度分析，以确保高质量的记忆提取。
