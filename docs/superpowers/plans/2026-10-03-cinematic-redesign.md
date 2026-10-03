# 有归深色电影感前端重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task when available. Steps use checkbox syntax for tracking. 指定实施工具：Claude Code + GLM；缺少该技能时按本文件逐项执行并保留验收证据。

**Goal:** 重构有归全部前端，交付真实可用、手机优先的深色电影感界面。

**Architecture:** 保留 Next 路由与后端接口，改造公共壳、基础组件及各页面构图。统一样式来源，使用现有 React、CSS 与 Lucide 实现动效，保留真实鉴权、照片管线、实时刷新与冲突处理。

**Tech Stack:** Node >=24、Next 16.3.6、React 19.3.0、TypeScript、CSS、Lucide、Vitest、Playwright、PostgreSQL。

**Spec:** `docs/superpowers/specs/2026-10-03-cinematic-redesign-design.md`

**Approval:** 用户已于 2026-10-03 确认实施计划；实施方式为 Claude Code + GLM，Codex 负责方案及验收。Claude Code 2.1.276 已安装，现有配置使用智谱 Anthropic 兼容端点及 `glm-5.3-flash[1m]`；此处仅记录非敏感路由信息，不表示实际调用已验证。

## Global Constraints

- 只修改 couple-home；不修改根配置、学术工作台、其进程和数据。
- 保留现有未提交改动；先记录基线，再逐文件整合。禁止 reset、clean 或把整批现有改动作为自己的提交。
- 保留 API、鉴权、数据 DTO、SSE 与版本冲突接口；不改变数据库模式，不引入服务器依赖。
- 背景 #0B0D12，内容 #131720，浮层 #1B202B，正文 #F2F3F5，次文字 #A5ACB9，细线 #2A303D，强调 #B8CFFF；普通正文对比度至少 4.5:1。
- 手机 <768px，紧凑布局 768–1099px，桌面 >=1100px；320px 无横向滚动，触控区域至少 44px。
- 不依赖外部图片或字体；不把示例照片作为用户真实回忆；支持 reduced-motion。
- 本轮只交付本地预览与证据，不发布 ECS，不获取或输出凭据。

## Review Focus

1. 没有照片或图片请求失败：首页与相册仍完整、可读、有真实上传入口（Task 3）。
2. 320px 屏幕、长中文标题：所有路由可操作，日期与底栏不挤出屏幕（Tasks 1、4、6）。
3. 手机键盘和键盘导航：弹窗可滚动，焦点不逃逸，关闭后返回触发按钮（Task 5）。
4. 姓名清空后遇到实时刷新：输入不被默认值覆盖，提交失败保留内容（Task 5）。
5. 另一人更新或网络错误：不会重复整页入场动画，草稿、冲突和错误反馈保留（Tasks 1、5、6）。

## 文件与接口安排

- `src/app/globals.css`：唯一基础 token、字体、重置与全局可访问性规则。
- `src/components/home.css`：应用壳、基础控件和业务布局；可拆为明确模块，禁止增加另一层同名覆盖。
- `src/components/public-experience.css`：公共账号页面布局；移除与新设计冲突的装饰。
- `src/components/experience.css`、`scene-stage.tsx`：核对引用，迁移仍需行为后移除被替代内容；不得留下空壳引用。
- `src/components/app-shell.tsx`：保持 AppShell、PublicShell、useSession 现有导出与数据行为；统一导航与壳。
- `src/components/ui.tsx`：保持 PageHeader、AddLink、LoadingState、ErrorState、EmptyState、FieldError、AuditLine、StatusMessage 调用接口。
- `src/components/modal.tsx`：保留 Modal({title, description?, children, onClose, returnFocusTo?, busy?}) 接口。
- `src/components/resource-forms.tsx`、`calendar-editor.tsx`、`conflict-form.tsx`：共用表单、日历编辑、冲突界面。
- `src/app/(home)/` 所有 page：包含 home、calendar、anniversaries、todos、moments、settings，以及其 new、[id]、[id]/edit。
- 公共路由：`src/app/login/page.tsx`、`setup/page.tsx`、`invite/[token]/page.tsx`、`src/app/layout.tsx`。
- 新增必要行为验证到 `tests/e2e/cinematic-ui.spec.ts`；优先复用现有业务测试和真实数据库 fixture。

## Task 1：统一视觉基础与导航

**Files:** globals.css、app-shell.tsx、ui.tsx、home.css、experience.css、public-experience.css、scene-stage.tsx、app/layout.tsx；Test: tests/e2e/cinematic-ui.spec.ts。

**Interfaces:** 输入为现有 session 与 children；AppShell/PublicShell 导出保持一致。输出为同一 token 和导航系统，后续页面不自定义第二套颜色、断点或控件状态。

- [ ] 保存 `git status --short`、改动文件清单与当前页面截图到 `.local/cinematic-baseline/`；不复制环境变量、数据库或凭据。
- [ ] 新增行为测试：手机五个导航项均有可读名字；纪念日可从首页与“我们”到达；在 320px 验证 checkNoOverflow；激活项具备 aria-current。
- [ ] 运行 `npm run test:e2e -- cinematic-ui.spec.ts`，记录新增断言的真实失败；纯视觉变化不强行写失败测试。
- [ ] 合并样式为设计稿指定 token，保持现有基础组件接口；实现五项手机导航与六项桌面导航；清理被替代的覆盖、场景装饰和无用引用。
- [ ] 执行 `npm run typecheck` 与目标 E2E，检查焦点、长标题、连接状态、reduced-motion、页面刷新后动画；通过后仅提交本任务改动。

## Task 2：账号与配对页面

**Files:** login/page.tsx、setup/page.tsx、invite/[token]/page.tsx、公共壳样式；Test: tests/e2e/onboarding.spec.ts。

**Interfaces:** 消费现有 session/setup/invites API；请求字段与错误语义不变。公共页面不获取受保护的小屋记录与照片。

- [ ] 阅读 onboarding.spec.ts 和当前初始化业务，区分系统无账号、首位账号未建屋、已配对、邀请过期/已消费/满员。
- [ ] 按设计稿重构登录、初始化和邀请页面；保留字段错误、提交状态、退出/返回与真实系统状态对应的入口。
- [ ] 对缺少覆盖的过期邀请和满员界面补测试：显示原因、没有有效加入按钮、不能泄露内容；先运行再实现缺口。
- [ ] 执行 `npm run test:e2e -- onboarding.spec.ts`；320px 与桌面检查所有状态，确认不新增开放注册；仅提交本任务改动。

## Task 3：首页与摄影回忆

**Files:** home/page.tsx、moments/page.tsx、moments/[id]/page.tsx、moments/new/page.tsx、moments/[id]/edit/page.tsx、resource-forms.tsx；Test: moments.spec.ts、cinematic-ui.spec.ts。

**Interfaces:** 消费现有 dashboard、Moment DTO、鉴权照片 URL 和上传接口。每条点滴只出现一次，按日期分组；照片源沿用现有服务端接口。

- [ ] 增加测试：无照片首页显示上传入口；带多张照片的点滴列表只出现一项；图片失败有可用反馈；文字点滴仍可打开。运行目标用例确认新增缺口。
- [ ] 首页用最近有照片点滴作封面，无照片时使用文字与低对比光影；保留真实相处天数、近期约定、待办与纪念日入口。
- [ ] 相册实现日期分组摄影网格，详情实现照片序列与完整正文；首图优先加载，其余懒加载并预留尺寸，避免布局跳动。
- [ ] 新增与编辑提供显著选择照片入口、预览、上传进度与错误；保留现有上传事务和失败保留草稿的行为。
- [ ] 执行 `npm run test:e2e -- moments.spec.ts cinematic-ui.spec.ts`；检查无图、长文、多图、失效照片与窄屏；仅提交本任务改动。

## Task 4：日历、纪念日、待办与共用编辑

**Files:** calendar、anniversaries、todos 下全部页面；calendar-editor.tsx、resource-forms.tsx、conflict-form.tsx；Test: calendar.spec.ts、core-life.spec.ts。

**Interfaces:** 保持各资源 DTO、纯日期、Asia/Shanghai 时刻转换、version 与负责人 ID 规则不变。日期、时区和闰年规则仍完整可读。

- [ ] 日历使用清晰月格与选中日议程；纪念日突出最近项；待办使用细线列表和负责人/截止日期；详情、创建和编辑沿用共用排版。
- [ ] 为所有删除入口接入统一确认弹窗，显示对象名和后果；取消不发删除请求，确认只执行一次；不得保持 window.confirm 与自定义弹窗混用。
- [ ] 对新增删除弹窗行为先补 E2E：取消后对象仍存在、确认后删除、失败可重试。迁移旧测试时保留原业务断言。
- [ ] 运行 `npm run test:e2e -- calendar.spec.ts core-life.spec.ts`；检查 320px 月格、长标题、无事项、跨月与重复日期规则；仅提交本任务改动。

## Task 5：我们、改密与输入状态

**Files:** settings/page.tsx、modal.tsx、conflict-form.tsx、相关样式；Test: settings.spec.ts、cinematic-ui.spec.ts。

**Interfaces:** Modal 保持已有签名；本人账号、成员、小屋与改密 API 的权限不变；不创建虚假的第二成员。

- [ ] 增加必要回归：姓名全选删除后为空，收到刷新后仍为空；提交必填错误后内容不恢复；改密字段仅在弹窗打开后出现；关闭和 Escape 返回焦点；busy 状态阻止重复提交。
- [ ] 运行 `npm run test:e2e -- settings.spec.ts cinematic-ui.spec.ts`，先确认新断言的基线结果。
- [ ] 设置页突出两人身份/真实配对状态，再分组小屋资料、本人资料、安全操作；姓名默认值只在初始化编辑状态时设置一次。
- [ ] 改密弹窗使用当前密码、新密码、确认密码，字段错误与成功会话流程清晰；Modal 支持手机键盘、内容滚动、焦点限制、返回焦点和 reduced-motion。
- [ ] 保留冲突中的本人输入与服务器版本；运行 settings 与 realtime E2E；仅提交本任务改动。

## Task 6：整站验收与本地交付

**Files:** tests/e2e/cinematic-ui.spec.ts、docs/cinematic-redesign-acceptance.md、docs/screenshots/cinematic/；脚本使用已有 package.json。

**Interfaces:** 消费前五项成果，输出可重复的验证命令、截图、实际预览 URL 和未验收范围。

- [ ] 审核全部路由清单，逐一记录桌面/390px/320px 的加载、空、错误、详情和编辑状态；测试长中文标题、断网、照片失败、reduced-motion。未运行项不能标为通过。
- [ ] 执行 `npm run typecheck`、`npm run build`、`npm test`、`npm run test:e2e`、`npm run check:secrets`；失败要修正并重新运行相关检查。
- [ ] 执行 `npm run test:persistence`；复跑现有备份恢复、迁移、照片访问权限与邀请并发测试。先确认脚本的隔离数据目录，禁止清空现有用户资料。
- [ ] 将首页、相册、日历、待办、纪念日、我们、登录、邀请与改密弹窗截图存到 docs/screenshots/cinematic；证据使用受控测试账号和资料。
- [ ] 启动或复用本应用预览；3000 被占用时核对进程归属，不影响另一应用。报告实际 URL、HTTP 状态与页面可操作检查，不只报告进程 PID。
- [ ] 写验收记录，注明真实安卓实机、Linux/ECS 未验证；列出变更文件、测试数量、失败/限制、预览地址；最后提交本任务文件。

## 交付与审阅规则

每完成一项提交一份简短进度：具体改变、验证命令与结果、尚未解决的问题。先完成 Task 1–3 的代表性页面截图供方案负责人检查，再铺开其余页面；这是一项设计质量检查，不能省略其余任务。验收结论由方案负责人结合截图与实际操作给出，不能以模型声称“高级”作为通过标准。

本计划由 Codex 制定，用户已审阅确认，实施方式按用户指定的 Claude Code + GLM 保留。沿用当前 GLM 配置，不擅自切换供应商或重新配置密钥；实际调用与执行状态以运行日志为准。
