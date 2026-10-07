# Settlement Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正手机结算遮挡并明确各席本次收支与新余额。

**Architecture:** 保留引擎记分与全席 ACK 机制。结算面板在内容滚动区计算只读分数预览，确认栏独立占据布局高度。

**Tech Stack:** 已锁定 Next 16.3.6、React 19.3、Vitest 5、Playwright 1.63。

**Spec:** `docs/superpowers/specs/2026-10-08-settlement-clarity.md`

## Global Constraints

- 仅编辑独立 couple-home 检出；不触碰另一应用或主目录并行任务。
- 不修改计分规则、服务器数据、牌桌摄影机或原始素材授权。
- 不备份、不下载真实用户数据；发布到已授权 `8.133.186.15`。
- 本机浏览器证据不等于真实安卓验收。

## Review Focus

- 多家荣和不能把两笔收支重复叠加。
- 流局、负余额与零收支须保持正确显示。
- 姓名很长、四席、鸣牌及长役种列表不能破坏可达性。
- 忙碌、断线或已经确认时不能重复发送 ACK。
- 页面滚动、内容滚动与确认按钮命中区域必须清楚分开。

### Task 1: 分数语义与内容结构

**Files:** `src/components/mahjong/mahjong-settlement-panel.tsx`、`tests/component/mahjong-settlement-panel.test.tsx`；新增 `tests/unit/mahjong-settlement-panel.test.tsx`。

- [x] 用物理牌墙与实际 Choice 构造四麻自摸、三麻双家荣和，先验证新展示缺失导致失败。
- [x] 增加结算前、本次收支、结算后预览；更新简短说明，不修改引擎。
- [x] 所有正文包进 `.mahjong-settlement-panel__content`，确认栏仍为 section 的直接子元素。
- [x] 验证顺序结算及实际 ACK、断线/忙碌禁用，类型检查通过。
- [x] 真实终局 ACK 后的 RED 复现已入账结算重复展示；终局已有排名时隐藏本局结算，定向两文件 11/11 通过。

### Task 2: 手机横屏布局

**Files:** `src/app/mahjong/mahjong.css`；ignored 真实浏览器验收工具。

- [x] 保留已取得的旧构建四案遮挡证据。
- [x] 容器采用列方向布局，正文保留网格与独立滚动；确认栏取消 sticky，实际占据高度。
- [x] 同四案验证初始与滚动末端无遮挡、役种/手牌可达、按钮实际触发 ACK；额外桌面与长姓名/鸣牌检查。

### Task 3: 审查与发布

**Files:** `docs/mahjong-settlement-clarity-acceptance.md`、`docs/mahjong-fidelity-progress.md`；ignored 独占发布工具。

- [x] 独立审查产品和验证证据；干净源码 60 文件/524 项、类型检查、生产构建与凭据扫描通过。
- [x] 新鲜核验 f7baf30 父版本，冻结 aa9c16a；实际 R02 固定镜像 ID 校验源码 518/构建 449 文件，隔离 Linux 两文件 11/11 通过。R01 环境失败保留，没有修改产品绕过测试。
- [x] 权威空桌、请求排空和保护门通过，实际 no-backup 发布器退出 0；live/final 12 表摘要、清理器及资源保持一致；公网可信 TLS、health 200、137 静态资源一致。
- [ ] 主目录仅同步本次拥有路径，保留并行变更、HEAD、index 与其他文件；记录实际限制，持续目标保持 active。

实际部署源码 `aa9c16a4f93c0281e77d8dd42c274704fd3391cb`，Build `PNhWHaCbRo2r8IqaH3fQd`。本计划发布后更新仅为文档，不改变冻结产品构建。主目录同步的最终结果以 ignored `settlement-clarity-aa9c16a-r02-primary-sync-proof.json` 为准。
