# 大厅至首局音频授权验收

日期：2026-10-10。本轮修复首局声音授权，当前为本地实现；线上仍为 0abd219，不将提交等同于部署。

## 实际问题与修复

原播放器随 GameRoom 挂载，大厅的准备／开始手势发生时还没有播放器，首批发牌被当作未解锁提示消耗。真实 Chromium 的旧提交探针在第一批等待音频时失败，证据为 `.local/audit/lobby-audio-native-red-r02.log`；r01 的旧探针缺少审计父目录，不能作为产品 RED。

播放器现在由 MahjongRoot 管理，既有外层 DOM 加 ref，不增加包裹层或改变相机与牌桌布局。真实大厅手势可以提前创建并解锁播放器，GameRoom 复用同一组控制方法；独立 GameRoom 测试入口保留本地生命周期。两处 hook 不创建双播放器，离桌、静音设置与卸载清理继续有效。

WebKit 的 resume Promise 可能晚于第一批牌提交。新的真实浏览器探针确实观察到 context 已开始 resume、首批请求时仍 suspended，而随后才 running。只在同一次合法手势的解锁任务正在进行时，发牌提示最多等待 100 ms；超过边界、静音、隐藏、失效或卸载后不播放。没有等待音频下载、重放旧声明或排队补播。

大厅没有旧牌局声音，进入首局时不取消正在进行的解锁；已有牌局的身份变化仍取消旧提示。播放器不会增加服务器计算或依赖模型服务。此改动不宣称提示音与厂商音色完全相同，也不以 WebAudio 的启动证明人工听感或设备扬声器输出。

## 验证范围

- 最终完整检查：102 文件 / 1187 项通过，包含权限、并发、持久化和恢复；类型、生产构建、374 构建文件秘密扫描通过。证据 `.local/audit/lobby-audio-{full,type,build,secrets}-r04.log`。
- 单元／组件增加共享生命周期、记忆静音及解锁就绪、100 ms 超时、取消、静音、卸载五种边界。针对音效与开局的 36 项通过；原动作语音、宣告、终局和结算音效仍包含于完整检查。
- 真实开局脚本直接观察 AudioBufferSourceNode.start、context.state 和 buffer.duration；使用真实大厅按钮、RoomStore、HTTP 和 Socket，不用模拟的 play 方法证明声音。覆盖 Chromium/WebKit、三/四麻、667×375/1440×810、WebSocket/polling、两种 HTTP/Socket 到达顺序和记忆静音。开声每案四次 running 状态的发牌短音；静音每案零次。原九阶段牌数、宝牌、操作锁和真实合法自摸仍逐项验证。
- 初始 WebKit r01/r02 失败促成解锁时序修复；诊断 r03/r04 记录 native context 状态，r05 的 32 个开声场景通过。r06 扩展到静音后的全部场景经过，但末尾仍保留旧 32 数量断言；仅修正测试数量、证据文件名和干净目录创建，失败日志保留，不将其列为完整通过。
- 首次完整 r01 的本机数据库未运行，r02 缺少 pg_dump PATH；启动本应用数据库并设置对应工具路径后重新完整执行，未修改产品以绕过数据库／恢复检查。

最终 `.local/audit/lobby-audio-native-r07.log` 实际退出 0，64 场景全部通过，证据 `.local/audit/round-opening-network-1791603576484/proof.json`；提交前逐项验证源码摘要与音频启动记录。原音效生命周期 `.local/audit/lobby-audio-lifecycle-r01.log` 为 42 个真实 GameRoom 场景通过，证据 `.local/audit/table-audio-runtime-1791603570093/summary.json`。自动操作联机回归继续观察原任务，完成情况另记。真实 Android、扬声器人工听感、生产认证 WSS 故障和完整参考体验仍未全部验收，整体目标继续 active。
