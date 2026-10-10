# 居中 16:9 牌桌发布验收

日期：2026-10-10。状态：已发布到 ECS，运行代码 `2904c46`。发布后的说明文档提交不改变运行代码。完整雀魂体验对齐目标继续进行。

## 参考与改动

观察当前官方入口 `https://game.maj-soul.com/1/` 的 Unity WebGL 4.0.47 启动页：自然横屏使用居中、整数像素的 16:9 画幅，竖屏交换可用轴后旋转。仅证明入口适配行为，不代表已核对当前对局、计分、世界尺度和全部音画。未提交厂商源码或素材。

本项目用独立的基础比例计算实现外层画幅适配，保持共享牌桌透视相机和牌体几何。逻辑 viewport 单位来自拟合后的尺寸；旋转仍使用真实 DOM 旋转。自然横屏与竖屏的操作按钮都在牌桌内计算，拖牌冻结实际牌桌原点和方向。黑色留边拦截底层页面导航，细指针竖屏桌面也可使用拟合后的牌桌。顶层弹窗限制在对应画幅尺寸。

| 物理 viewport | 显示方式 | 逻辑画幅 |
| --- | --- | --- |
| 375 × 667 | 触屏竖屏旋转 | 666 × 375 |
| 390 × 844 | 触屏竖屏旋转 | 693 × 390 |
| 412 × 915 | 触屏竖屏旋转 | 732 × 412 |
| 768 × 1024 | 触屏竖屏旋转 | 1024 × 576 |
| 844 × 390 | 自然横屏 | 693 × 390 |
| 1440 × 810 | 桌面 | 1440 × 810 |
| 1920 × 1200 | 桌面 | 1920 × 1080 |
| 768 × 1024 | 细指针竖屏桌面 | 768 × 432 |

## 问题发现与修复

原产品画幅探针实际失败：375 × 844 仍占满屏幕，缺少居中留边，见忽略日志 `.local/audit/fitted-frame-red-r01.log`。调整后检查真实边界、点牌、旋转、顶层桌布弹窗及离桌时全屏所有权，不只检查 CSS 文本。

首次竖屏联机双击探针把靠近手牌的空白点选作桌布，浏览器原生触摸吸附实际命中了牌。记录的 pointerdown、pointerup、click 目标证明它执行了两次点牌，未进入桌布快捷操作。探针现在与可点击元素保持 32px 间距，并断言两次原生事件都落在桌布；仍核对真实 RoomStore 的 Choice 和最终弃牌，不改变期望为错误的摸入牌。失败与诊断记录 r01–r04 保留。

WebKit 开局音频还发现真实回归：首次拟合的尺寸观察被当成后续缩放，取消尚未完成的音频解锁。用首次 ResizeObserver 通知建立基线，后续实际尺寸变化仍撤销旧音效和摸牌动效。定向组件用例同时证明初次、重复通知不取消和后续尺寸变化仅取消一次。临时微任务替代方案未修复问题，且导致两项音频组件用例失败，已撤销；失败 r06 和完整 r02 保留。

完整 r03 的 1259 项断言通过，但测试数据库连接清理产生一个未处理的 PostgreSQL `57P01` 错误，因此该次退出非零，不计为完整通过。r04 在并行浏览器负载下又发生管理员 CLI 超时和连接清理错误，未计作通过。保持相同断言与超时，r05 以 `npm test -- --maxWorkers=2` 降低测试并发后，107 文件／1259 项无错误退出 0。

## 最终本地检查

| 范围 | 结果与忽略证据 |
| --- | --- |
| 全部单元／组件／集成 | 1259 项／107 文件，`fitted-frame-full-r05.log`，最多 2 个 worker |
| 画幅、触屏旋转和桌布弹窗 | 16 场景，`fitted-frame-native-r03.log` |
| 桌面／平板留边、手牌边界与弹窗 | 8 场景，`fitted-frame-desktop-r02.log` |
| Chromium 原生触摸拖牌 | 竖屏 42、自然横屏 36，`fitted-frame-portrait-drag-r02.log`／`fitted-frame-natural-drag-r02.log` |
| 按钮点按与布局 | 竖屏 12、自然横屏 24，`fitted-frame-portrait-actions-r02.log`／`fitted-frame-natural-actions-r02.log` |
| 实际规则引擎结算与逐席视角 | 24 场景，`fitted-frame-settlement-r02.log` |
| RoomStore HTTP／Socket 开局 | 竖屏双击 64、自然横屏自动摸切 64，`fitted-frame-portrait-opening-blank-r08.log`／`fitted-frame-natural-opening-auto-r03.log` |
| 类型检查／生产构建／秘密扫描 | `fitted-frame-type-r03.log`／`fitted-frame-build-r02.log`／`fitted-frame-secrets-r02.log`，374 个构建文件扫描通过 |

九个原生脚本共 290 场景，汇总为 `.local/audit/fitted-frame-native-index.json`。这些文件是本机忽略证据，不是新设备启动依赖。所有相关进程均已实际终态退出，失败日志保留。按钮压力夹具不冒充真实组合规则；真实拔北、结算和联机开局使用真实引擎。

## 验证边界

使用合成牌局、真实规则引擎、独立 RoomStore HTTP／Socket、Chromium／WebKit。原生拖牌通过 Chromium CDP touch；WebKit 点按、弹窗、联机和音频不等于 WebKit 原生拖牌验收。原生脚本分别保存源摘要、测量和截图，不由 `npm test` 自动执行。

不把本机软件渲染等同真实 Android／GPU，也不把本机 Socket 测试当成生产认证 WSS 故障验收。本轮已执行 ECS 同镜像受限 Linux 检查与公网切换，不生成或下载生产备份，不下载私人照片与业务数据。

剩余工作包括完整世界尺度及音画对照、开局摸切协议语义、真实设备与生产认证网络故障。详见[完整进度](mahjong-fidelity-progress.md)。

## ECS 发布结果

已上线 <https://8.133.186.15/mahjong>。实际退出状态和文件摘要确认后才记录发布完成。

| 项目 | 结果 |
| --- | --- |
| 运行源码 | `2904c46bd482d875ce6b9b4f04cbbcdc3ca3dbdb` |
| Next Build | `RqnAIDwiv2x4ZidrGOC7i` |
| 镜像 | `sha256:d5eeb401cf699efd51d9a0665e1d21c54163ffca98c967601b164ea775e87d3b` |
| 清单 SHA-256 | `2b61b2c8125ff4ffe3f2f91be423997e2bf65d58b6245d8c2e21c4b1d56e717a` |
| 源码／构建／公网静态资源 | 758／449／145，逐文件摘要匹配 |
| ECS 同镜像受限 Linux | 844 项／51 文件通过，0.5 CPU／384 MiB，只读且无网络 |
| 13 个发布阶段 | 实际终态退出 0，构建、测试、发布均已结束 |
| 公网 | 默认 TLS 校验通过，健康接口 200 |
| 业务数据与清理器 | 12 表发布前后摘要一致；原清理器容器与镜像保持 |
| 资源及禁备份 | 应用资源限制、无 OOM、禁备份标记及屏蔽定时器保持 |

忽略证据：`.local/ecs-deploy/fitted-published-closeout-r01.json`、`late-response-2904c46-r01-frozen.json`、本轮 remote-captures 和 public-proof。构建 PID、Linux PID、发布 PID 都由各自状态命令确认完成；未因观察等待而重启任务。
