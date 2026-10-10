# 开局发牌的材质与落位

日期：2026-10-10。本地候选，线上仍为 `3871589`；完整雀魂体验目标继续进行。

## 对齐范围

普通实时开局的每批牌在 200 ms 内线性淡入并落位，替代原先的 160 ms ease-out。参考局部高度从 0.5 降到 0，材质 alpha 从 0 增至 1，按正常牌位间距 2.55 换算本地相对高度。自己的手牌使用牌宽加现有 2px 间距；对手使用实体牌宽加现有 1px 间距。只改变呈现，不改变牌桌投影、发牌时点、理牌时点、操作开放时点或服务端牌局。

对手六面实体的两个祖先不执行透明度动画，保持 `opacity:1` 和 `preserve-3d`；六个表面各自线性淡入，实体整体沿本地 Z 轴落下。自己的手牌沿屏幕 Y 落位。使用独立 `translate`，保留已有表面 transform，不替换相机或挤动手牌布局。减少动效、基线、断线及环境取消后没有残留发牌动画。没有增加 JavaScript 帧循环、服务端线程或 AI 计算。

参考固定公开版本 `https://game.maj-soul.com/1/v0.11.252.w/code.js`，已实际读取只读缓存 SHA-256 `5308fe6d3ab8bb8b0c8ab283e75176f839de9723d67179d00abeb15e6a39ff4f` 的 HandPaiPlane `AnimNewTile` 与 `Update`。仓库只保留数值样本 `tests/fixtures/mahjong-deal-arrival-reference.json`，未纳入厂商程序或素材。

这里验证的是归一化相对高度与材质曲线，不能证明本地二维手牌、完整世界单位、相机、厂商网路协议、全部规则与音画已经逐像素一致。真实 Android 与生产认证 WSS 故障验收仍未完成。

## 已执行检查

- 实现前原生浏览器 RED 明确得到 `160 !== 200`。
- 实现后 Chromium／WebKit、三麻／四麻、667×375／1440×810，实时／基线／减少动效共 24 场景通过；372 张入场牌、1860 个采样点。每个表面验证五个独立参考 alpha、高度点，200 ms、linear、祖先不透明、六面 transform 保持、完整波次牌数以及断线后取消。
- 第一次 WebKit 视觉测试在初始布局期间出现开局被取消，未更改产品取消策略。隔离视觉测试先完成基线字体／视口布局，再引入实时开局，之后通过；真实 HTTP／Socket 开局由独立联机矩阵验证。
- 1215 项 / 105 文件完整检查、类型检查、生产构建和 374 构建文件秘密扫描通过；Linux 目标选择本机 800 项 / 49 文件通过。
- 224 个真实 RoomStore HTTP／Socket 开局场景实际退出 0，覆盖两种浏览器、三／四麻、窄横屏／桌面、WebSocket／轮询、消息先后与静音状态；理牌、自摸／摸切／视觉末张手切／拔北和1500 ms操作闸门保持。本轮共 248 原生场景，不使用前版 542 场景冒充当前候选证据。

证明入口位于忽略的 `.local/audit`：`deal-arrival-red-r01.log`、`deal-arrival-native-r04.log`、`deal-arrival-1791609978777/proof.json`、`deal-arrival-full-r01.log`、`deal-arrival-type-r02.log`、`deal-arrival-build-r01.log`、`deal-arrival-secrets-r01.log`。检查了桌面 Chromium 和窄横屏 WebKit 半程截图，软件渲染的既有透视偏差不用于调整已验证共享相机；没有把这些截图当作实际 GPU／Android 验收。

根任务自行审查，不称为独立审查。候选同镜像 ECS 和发布尚待执行。父版本只读核对实际退出 0，现有运行代码、构建、照片清理器、禁备份策略与资源限制保持。

联机证明：`.local/audit/round-opening-network-1791609866436/proof.json`；日志 `deal-arrival-network-r01.log` 实际退出 0，两份当前源码绑定已复核。
