# 实时开局呈现验收

日期：2026-10-09。本轮已上线 0abd219f55a3d6550fa4391aa1abff0736f64b84；Build LKzECc9E3TNcufzATJSpE。

## 参考和实现

固定公开参考为 `https://game.maj-soul.com/1/v0.11.252.w/code.js`，解码源码摘要 `5308fe6d3ab8bb8b0c8ab283e75176f839de9723d67179d00abeb15e6a39ff4f`。提取普通日本麻将 ActionNewRound.play 和本家 NewGame 的数值时序，存入 `tests/fixtures/mahjong-round-opening-reference.json`：0/300/600/900 ms，每批最多四张；1200 ms 宝牌揭示/理牌边界；1500 ms 开放操作。没有提交厂商源码、音频或图像。

本家与对手起手实体按四批显现，保持最终手牌占位和现有共享相机。对手实体保持六面刚体；没有用 opacity 淡化整个立体容器而压平六面。160 ms 本家淡入与对手刚体轻移为原创视觉效果，厂商 AnimNewTile 曲线和对手完整入场轨迹尚未取得独立证据，不声称逐帧一致。1200 ms 揭示指示牌、激活相应宝牌光泽并恢复摸牌间隔；当前引擎已提供排好的公开手牌，本轮没有虚构隐藏服务器发牌顺序或声称完成原始牌序至排序的重排。

只由已接受的实时大厅→对局、或同一成员在同一房间进入新 handId 产生开局意图。首次 GET/Socket 基线、刷新/重连、重复快照、不同房间/席位不会重播。期间隐藏动作栏、禁用手牌点按/拖牌/键盘、悬停预选和双击桌布捷径，并暂停自动操作；1500 ms 后恢复合法上下文操作。缩放、方向、离焦、页面隐藏、断线、决策推进及减少动效偏好变化取消剩余呈现，直接回到权威当前画面，不补播旧动画。

计时器只设在五个阶段边界，没有每牌 RAF 或持续轮询，已消费范围最多保存 128 个键。React 严格模式的清理与重新挂载保留原始截止时间重新设定剩余回调，真实卸载不留计时器。默认电脑开局等待至少完成该呈现；既有 `visualDelayMs` 显式模拟覆盖仍保留，单 worker、200 ms 计算预算与既有内存限制不变。

四批声音复用既有原创摸牌短音，并去重、遵循静音和页面可见性；停顿跨过的批次不补播。当前音频播放器仍要求浏览器允许的真实手势解锁，锁定时首局声音可能被消耗而静默。测试验证的是提示提交与既有锁定政策，首局提前建立音频授权、实际听感和完整厂商音色仍属于后续目标，不能由四次方法调用证明听感相同。

## 实际检查

- 旧提交有效 RED：通过只读 Vitest transform 加载 af2cb26 的原 GameRoom，不修改工作树。`round-opening-effective-red-r02.log` 为 3 失败 / 7 通过，实际显示 14 张而参考要求首批 4 张；初始 r01 同时存在断言库用法错误，不当作完整产品 RED。
- 严格模式 RED：`round-opening-strict-red-r01.log` 为 1 失败 / 12 通过，300 ms 时仍只有 4 张。修复后 `round-opening-target-r04.log` 为 22 项通过。
- 最终完整 `round-opening-full-r04.log`：102 文件 / 1180 项通过，包括既有成员权限、并发、持久化及恢复检查、完整实际电脑游戏和新增三/四麻默认开局等待。
- 最终 `round-opening-type-r05.log`、`round-opening-build-r02.log` 实际退出 0；Build `LKzECc9E3TNcufzATJSpE`。`round-opening-secrets-r02.log` 为 374 构建文件扫描通过。
- `round-opening-network-r04.log`：32 个实际 RoomStore / HTTP / Socket.IO 场景全部通过；Chromium/WebKit、三/四麻、667×375/1440×810、WebSocket/polling、两种 HTTP/Socket 到达顺序、严格模式。真实大厅准备与开始指令，逐案检查固定浏览器时钟下 0/299/300/600/900/1199/1200/1499/1500 九个画面阶段、本家和对手牌数、宝牌、手牌禁用、动作栏及一次真实合法自摸。Session 与 Next 导航使用本机测试适配，不能称生产认证 WSS 验收。
- Native r01 在 WebKit 某一边界读取到 React 尚未提交的旧 DOM。r02 以后等待同一暂停时钟中的提交，不推进时间或放宽期望；r04 为最终源码，含严格模式修复。失败日志及截图保留。
- `round-opening-automatic-network-r02.log`：64 个实际规则引擎 HTTP/Socket 新局开关回归全部通过，包括庄家连庄、待发/已发送自动和牌和新局重新开启。
- `round-opening-automatic-regression-r02.log`：240 个既有实际 HTTP/Socket 自动与手动点按/键盘、摸切、鸣牌、荣和、特殊操作和拔北场景全部通过。

最终 336 个原生场景证据分别在 `.local/audit/round-opening-network-1791542415765`、`automatic-round-network-1791542416865`、`automatic-network-1791542418037`；提交前重新核对运行源码摘要一致。Full r02 的静音测试一次 act 跨过两个阶段，把 React 合并提交误当成逐帧；最终按各阶段分别提交，确认静音、恢复和不补播语义，失败记录保留。

## ECS 实际发布

同一冻结镜像 `sha256:5966eafc25a8b777969349f7b4e88143a7b3596fb80cecd3fde455f4af1a8f69` 在 ECS 以 0.5 CPU / 384 MiB、只读且无网络的临时容器执行 Linux 检查：46 文件 / 765 项全部通过。构建 PID 1765335、Linux PID 1766840、发布 PID 1772101 均已实际结束并退出 0；持续观察同一任务，没有因观察超时重启。

731 源码 / 449 构建文件全部摘要一致，清单摘要 `9c5693123675d75aa7b93266b51b76d36cb07772ebe20038b9ab77887470afb5`。十三阶段终态核验和公网 145 项资源逐项摘要通过，可信 TLS 健康接口 200。发布期间权威检查无活跃真人牌桌，保护门已恢复。

十二表发布前后摘要均为 `9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`；用户 7、空间 3、成员 5、照片 29、迁移 7。清理器身份和镜像保持；应用 1 CPU / 768 MiB、运行正常且无 OOM。禁备份标记保持为空的普通文件，定时器 masked/inactive、服务 inactive，三个备份路径不存在；没有下载用户资料。完整本机闭环证据在 `.local/ecs-deploy/round-opening-published-closeout-r01.json`。

真实 Android、原始隐藏发牌顺序、厂商完整入场/理牌轨迹与音色、首局音频授权、生产认证 WSS 故障仍未全部验收，整体目标继续 active。
