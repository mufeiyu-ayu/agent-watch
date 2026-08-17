# Agent Watch

通过钉钉自定义机器人接收 **Claude Code** 和 **Codex** 的生命周期通知，并在会话中随时开启、关闭或临时静音。

```text
Claude Code / Codex
        ↓ SessionStart / UserPromptSubmit / Stop Hook
    Agent Watch
        ↓ DingTalk custom-robot Webhook
      钉钉群
        ↓ iPhone 通知镜像
    Apple Watch
```

> `Stop` 表示 Agent 已结束当前一轮响应，不等同于业务任务一定成功。通知默认使用“本轮已完成”，不会虚构成功状态。

## 能力

- DingTalk custom-robot Webhook
- 必填自定义安全关键词
- 可选“加签” Secret，使用 timestamp + HMAC-SHA256
- `compact`、`standard`、`detailed` 三种模板
- 可自定义标题、时区和通知字段
- 记录本轮开始时间并计算耗时
- Claude Code Plugin：manifest、hooks、commands、skills、bin
- Codex Plugin：manifest、hooks、skills、个人 marketplace
- 会话快捷控制：on、off、mute、unmute、status、test、template
- 配置和状态文件权限 `0600`
- 网络失败不改变 Claude Code / Codex 的执行结果
- 默认不读取 Prompt、源码、Transcript 或工具结果

## 要求

- macOS 或 Linux
- Node.js 20+
- Claude Code 和/或 Codex
- 一个允许添加“自定义机器人”的钉钉群

## 安装

当前从 GitHub 安装：

```bash
npm install -g github:mufeiyu-ayu/agent-watch#master
```

确认：

```bash
agent-watch --version
```

预期：

```text
0.2.0
```

## 创建钉钉机器人

1. 新建一个专用群，例如 `Agent Watch 通知`。
2. 在群设置中添加“自定义机器人”。
3. 在安全设置中配置一个自定义关键词，例如 `AgentWatch`。
4. 可选：开启“加签”，保存 `SEC...` Secret。
5. 复制机器人的完整 Webhook。

关键词必须出现在机器人收到的每一条消息里。Agent Watch 会同时把关键词写入 Markdown 标题和正文。配置时只接受钉钉官方自定义机器人的 HTTPS Webhook：主机必须是 `oapi.dingtalk.com`，路径必须是 `/robot/send`，并且包含 `access_token`。

## 配置

推荐使用交互式向导，避免凭据进入 Shell history：

```bash
agent-watch setup
```

向导会询问：

- Webhook
- 必填安全关键词
- 可选加签 Secret
- 模板 preset
- 时区
- 标题模板
- 是否允许发送有限长度的模型回答摘要
- 安装 Claude Code、Codex 或二者
- 是否立即发送测试通知

配置保存到：

```text
~/.config/agent-watch/config.json
```

运行状态保存到：

```text
~/.local/state/agent-watch/state.json
```

配置文件和状态文件都会以 `0600` 权限写入，只允许当前用户读写。

### 非交互配置

适合自动化，但注意命令参数可能进入 Shell history：

```bash
agent-watch setup \
  --non-interactive \
  --webhook 'https://oapi.dingtalk.com/robot/send?access_token=...' \
  --keyword 'AgentWatch' \
  --secret 'SEC...' \
  --preset standard \
  --timezone Asia/Shanghai \
  --hosts all
```

不使用加签时省略 `--secret`。删除已有 Secret：

```bash
agent-watch setup --non-interactive --no-secret --hosts all
```

## 测试

```bash
agent-watch test
```

成功后钉钉群应收到类似：

```text
AgentWatch · Codex 测试通知
Agent：Codex
项目：agent-watch
状态：测试通知
时间：2026/08/17 02:30:00
耗时：42 秒
```

Apple Watch 是否震动还取决于 iPhone/Apple Watch 的钉钉通知、群免打扰、专注模式和通知镜像设置。

## 模板

### Compact

```bash
agent-watch template compact
```

字段：标题、项目、时间。

### Standard

```bash
agent-watch template standard
```

字段：标题、Agent、项目、状态、时间、耗时。

### Detailed

```bash
agent-watch template detailed
```

字段：Standard + 模型 + 可选摘要。

摘要默认关闭。显式开启：

```bash
agent-watch setup --non-interactive --include-summary true --summary-max 180 --hosts all
```

### 自定义字段

```bash
agent-watch fields title,agent,project,status,time,duration,model
```

可用字段：

```text
title, agent, project, status, time, duration, model, summary
```

自定义标题：

```bash
agent-watch title '[{agent}] {project} {status}'
```

占位符：

```text
{keyword} {agent} {project} {status} {time} {duration} {model}
```

即使标题模板没有 `{keyword}`，Agent Watch 也会自动补上安全关键词。

## 会话快捷命令

### Claude Code

通过 `agent-watch setup` 或 `agent-watch install claude` 安装后，Agent Watch 会：

- 把运行资源复制到 `~/.claude/plugins/agent-watch`
- 把生命周期 Hook 合并到 `~/.claude/settings.json`
- 把 Skills 安装到 `~/.claude/skills`
- 把用户级快捷命令安装到 `~/.claude/commands`

新开一个 Claude Code 会话后可用：

```text
/agent-watch-off
/agent-watch-on
/agent-watch-mute 1h
/agent-watch-unmute
/agent-watch-status
/agent-watch-test
/agent-watch-template compact
```

通过 Claude Plugin Marketplace 安装时，命令使用插件命名空间：

```text
/agent-watch:off
/agent-watch:on
/agent-watch:mute 1h
/agent-watch:status
```

### Codex

Codex Skills 会安装到 `~/.codex/skills`。新开一个 Codex 会话后可显式调用：

```text
$agent-watch-off
$agent-watch-on
$agent-watch-mute
$agent-watch-unmute
$agent-watch-status
$agent-watch-test
$agent-watch-template
```

快捷控制是当前操作系统用户的 **全局 Agent Watch 状态**，不是仅针对一个会话。

CLI 始终可用：

```bash
agent-watch off
agent-watch on
agent-watch mute 1h
agent-watch unmute
agent-watch status
```

## Host 集成

重新安装集成：

```bash
agent-watch install all
agent-watch install claude
agent-watch install codex
```

Codex 的非托管 command hooks 需要信任。安装后进入 Codex，执行：

```text
/hooks
```

检查并信任 Agent Watch Hook，然后重启会话。

卸载 Host 集成但保留本地配置：

```bash
agent-watch uninstall all
```

安装器会：

- 保留其他 Hook
- 替换旧的 Agent Watch 绝对路径，而不是重复追加
- 修改 JSON 前生成带时间戳的备份
- 原子写入配置文件
- 卸载时只删除带 `--agent-watch-managed` 标记的 Hook

## Plugin Marketplace 安装（可选）

仓库同时是 Claude Code 和 Codex 的 marketplace。

### Claude Code

```bash
claude plugin marketplace add mufeiyu-ayu/agent-watch
claude plugin install agent-watch@ayu-agent-tools --scope user
```

npm 安装路径与 Marketplace 安装路径可以二选一。npm 安装会直接部署用户级 Hook、Skills 和 Commands；Marketplace 安装则由 Claude Code 按插件命名空间加载资源。

### Codex

```bash
codex plugin marketplace add mufeiyu-ayu/agent-watch
```

然后在 Codex CLI 中打开：

```text
/plugins
```

从 `ayu Agent Tools` 安装或启用 `Agent Watch`。首次启用 Hook 后仍需通过 `/hooks` 完成信任。

> npm setup 已经写入用户级 Codex Hook 和 Skill，因此不安装 marketplace plugin 也能工作。若同时启用 plugin，Agent Watch 会通过本地原子状态锁与 Stop 去重避免重复通知。

## 生命周期语义

Agent Watch 监听：

- `SessionStart`：记录会话开始时间、目录和模型
- `UserPromptSubmit`：只记录本轮开始时间，不保存 Prompt
- `Stop`：计算耗时并发送通知

Claude Code 在仍有 `background_tasks` 或 `session_crons` 时触发 Stop，Agent Watch 会暂缓通知，避免把尚未完成的后台工作误报为结束。

Codex `Stop` Hook 成功退出时要求 stdout 为 JSON。Agent Watch 始终返回中性的：

```json
{}
```

## 隐私和安全

默认发送：

- Agent 名称
- 项目目录名
- “本轮已完成”状态
- 完成时间
- 耗时
- 可选模型名称

默认不读取或发送：

- 用户 Prompt
- 源代码
- Transcript
- 工具输入/输出
- 环境变量
- 完整模型回答

只有明确启用 `includeSummary` 后，才会读取 Hook payload 中的 `last_assistant_message`，做空白归一化和长度截断后发送。Agent Watch 不读取 Transcript 文件。

`agent-watch status` 会遮盖 Webhook access token，并且只显示是否配置了 Secret，不输出 Secret 原文。

## 开发与验证

```bash
npm ci
npm run check
npm run smoke:install
```

其中 smoke test 会：

1. `npm pack`
2. 安装到隔离的全局 prefix
3. 执行已安装的 `agent-watch --version`
4. 使用隔离的 HOME 完成非交互配置和 Host 安装
5. 验证 Claude Code / Codex 的 Hook、Skill、Command 和 Marketplace 资源

自动测试不会使用真实钉钉凭据，也不会向外部钉钉群发送消息。真实通知链路需要用户自己的 Webhook、关键词和可选 Secret。

## 参考资料

- [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [OpenAI Plugin Packaging](https://developers.openai.com/plugins/build/plugins)
- [Codex Hooks](https://developers.openai.com/codex/hooks)
- [钉钉自定义机器人接入](https://open.dingtalk.com/document/orgapp/custom-robot-access)

## License

MIT
