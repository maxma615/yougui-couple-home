# 麻将结算音效候选验收

2026-10-08。新增役种揭示、牌型点数强调和本局总收支滚动音效。全部声音为本地 Web Audio 合成的原创短音，未使用雀魂音频或角色语音。参考的是已读取的官方公开客户端 `v0.11.252.w` 的结算阶段调度，不声称声音波形或当前厂商版本完全相同。

## 行为与边界

- 仅连续、已连接的真实牌局阶段变化触发音效。首次快照、晚加入、漏版本、GET 刷新和重连不会补播。
- 首位和牌详情保留1200毫秒宣告引导；之后每180毫秒揭示一个役种，牌型点数跟随已有数值揭示时间。双荣各席详情拥有独立事件标识，不串页播放。
- 本局净收支非零时，1200毫秒开始一次分数滚动声，不按付款席重复。延迟的真实 DOM 提交只播放剩余音频片段；过期回调直接结束。减少动态效果时分数直接展示终值，也不播放滚动声。
- 音效必须等对应生产组件的揭示标记实际出现。静音、后台、离线、旋转、卸载继续复用已有取消机制；浏览器未允许音频时不累积待播声音。
- 不改变牌墙、役种判断、点数计算、分数支付或全席确认协议。

## 实际验证

- **824项 / 82文件完整单元、组件和集成回归通过**。新用例使用物理三麻/四麻引擎实际合法自摸、双荣和生产结算序列，包含役种与点数时序、一次总收支、阶段切换、静音/重连/后台/刷新/卸载、减少动态效果、延迟 DOM 与音频偏移、有限原始波形及失效声音消费。
- TypeScript、生产构建、构建凭据扫描和 `git diff --check` 通过。
- 根任务审查了阶段身份、有限窗口、DOM揭示门槛、分数滚动剩余片段和取消路径；这是根审查，不是独立审查。

组件时序用例使用假的单调时钟和音频播放器，波形与播放偏移另由播放器单元测试核对。此次尚未补做真实 Chromium/WebKit Web Audio、真实 Android 音频和 Linux/ECS发布验证，不把组件通过当作设备验收。

证据保留在应用 `.local/audit/`，不提交构建产物、运行数据或环境凭据：`settlement-sound-candidate-r02.log`（增加双荣用例之前68项通过）、`settlement-sound-full-r02.log`（最终824项通过）、`settlement-sound-types-r02.log`、`settlement-sound-build-r01.log`、`settlement-sound-secrets-r02.log`。完整首次 r01 有6个备份恢复用例因工作树缺少 `pg_dump` 路径失败；添加现有本机 PostgreSQL 工具路径后完整 r02通过，没有删例或改恢复实现。

本次代码为已验证的本地候选，将正常提交并推送自己的 GitHub 仓库。当前实际线上仍为 `8dd5182` / Build `pdkOlgPZWiQsgE294wFXe`；本轮没有重新发布服务器，完整雀魂体验目标仍在进行。

## 真实浏览器音频补验（同日）

已完成 **30/30 正式 GameRoom 音频场景**：Chromium/WebKit、三麻/四麻、真实物理引擎自摸/双荣，667和1440横屏，以及844横屏静音、断线、GET、旋转、卸载、晚加入和减少动态效果。使用自然设备时钟和真实 AudioContext；对应揭示 DOM 出现才启动真实音频源，双荣逐页实际合法 ACK、总收支只播放一次，刷新不重复，卸载后真实上下文关闭。没有把浏览器播放器或时间替换为桩。样本是测试牌局快照的正常推送和原生响应桥，不是已登录远端 WSS 或真实手机验收。

**20/20 真实 OfflineAudioContext 波形**通过，包括原有七种桌上音效及三种结算短音；每种在两引擎中有非零振幅、安全峰值、有限尾部静音。信任点击实际解锁、重复/静音拒绝和真实上下文关闭通过。波形试听不等于手机扬声器或厂商声音相等。

目标 Linux 的确切20文件选择先在本地运行，**307/307**通过。服务器只读核对仍是8dd5182：619源文件、449构建文件全摘要通过，运行镜像、清理器与禁备份状态正确，未切换线上。

证据：`.local/audit/settlement-audio-browser-1791469631684/{manifest,summary}.json`、`settlement-audio-runtime-r03.log`（实际退出0）、`table-audio-wave-1791469577784/summary.json`、`settlement-audio-wave-r01.log`（实际退出0）、`settlement-audio-final/linux-selection-local-r01.{log,json}`，以及 `.local/ecs-deploy/late-response-remote-captures/late-response-settlement-audio-parent-r01.json`。保留脚本r01的JSX括号错误、r02缺少浏览器process环境定义失败；修正脚本整理后相同完整30例r03通过，没有减少用例或改产品来适配测试。下一步冻结、隔离Linux和保护发布，整体目标仍未完成。

## 已实际发布到上海 ECS（同日）

运行源码 **8dfee3c39b13c614aa1191b079c414cbba48a19f** / Build **fjnFrHLjDgP9r79naIm5Q** 已在 <https://8.133.186.15/mahjong> 发布。镜像 `sha256:7b60bd74ead3c8e858a9c0ccafb817690bba5f42774e5c4dd33519561078b881`，完整清单 SHA-256 `68ebb30b61c63e2844d22433faae4cf1fb40a2b05cfc857c5c2ccb81ead824bd`。

隔离 Linux 容器以半个CPU、384MiB、只读文件系统和无网络运行确切20文件，**307/307**通过。构建与Linux观察均等待同一个实际进程结束，没有因一次观察仍在运行而重启。发布器固定摘要，确认无进行中的真人桌（检查成员0）、短暂屏障排空后切换并恢复入口，实际发布退出0。线上624源文件、449构建文件全部摘要一致，默认可信TLS检查公网**133/133资源**及健康接口200通过。

12张业务/迁移表前后逐行摘要相同（`9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`），7用户、3空间、5成员、29照片和7迁移保持。照片清理器容器与镜像不变。禁备份标记完整，timer masked/inactive、service inactive，未创建或下载备份。生产配额仍为1CPU/768MiB。发布结束后的实际健康状态与publisherFinished均通过。

冻结与发布证据在 `.local/ecs-deploy/late-response-8dfee3c-r01-frozen.json`、`late-response-remote-captures/late-response-8dfee3c-*`、`late-response-8dfee3c-r01-public-proof.json` 和 `settlement-audio-published-closeout-r01.json`。一次收尾汇总最初把实际健康字段 `appHealthy` 写成 `healthy` 而读取失败，改正后读取已有实际报告，未重启发布或覆盖证据。两条代码/浏览器提交及本发布记录都普通快进推送main与麻将分支；所属路径同步保护主目录HEAD/索引。真实Android扬声器、远端登录WSS播放和完整厂商声画仍未验收，整体目标保持进行。
