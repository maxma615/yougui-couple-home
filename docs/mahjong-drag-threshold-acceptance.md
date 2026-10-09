# 拖牌判定距离与释放边界

日期：2026-10-09。整体对齐目标保持 active；本步已发布到授权 ECS。

## 行为与参考范围

此前指针移动距离达到12个CSS像素便进入拖牌。现在移动及松手都采用 `dx² + dy² > 400`：恰好20不进入拖牌，超过后才进入；已经进入拖牌后允许拖回并取消。有效桌布、原始手牌边界、一次提交、取消/断线清理仍由原有逻辑处理。没有改变相机、牌体、规则、声音或数据库。

2026-10-09重新取得[官方公开客户端代码](https://game.maj-soul.com/1/v0.11.252.w/code.js)，原文件SHA256为 `63ae7207dcef9cef6b7c0e18855ad81499e1723b9da590634885ee90b632189b`；仅静态解析字符串表，未执行厂商客户端。解码SHA256为 `5308fe6d3ab8bb8b0c8ab283e75176f839de9723d67179d00abeb15e6a39ff4f`。公开客户端 onMouseMove 采用位移平方严格大于400，本产品沿用该判定形式。厂商使用Laya鼠标坐标，本产品使用浏览器client坐标；不同屏幕、缩放与DPR的物理手感未全部对照，不能据此宣称跨设备像素一致。未复制厂商素材。

## 实际验证

- 新增14个组件场景覆盖12/19/20/21、斜向12/16及12/17、横向越界距离，以及有move和只有release的两种事件序列。旧实现8failed/42passed，修正后相关三个文件72/72通过。
- Chromium与WebKit、667×375／844×390／1440×810共36个真实鼠标场景：桌面二次点击偏好下，无悬停预选干扰；20及以下不拖牌，超过20才拖牌，按住不提交，合法落点松手仅提交一次。斜向边界也通过，页面无异常。使用真实四人引擎合法手牌和选择，正式GameRoom与应用CSS；不是生产登录或触屏证据。
- 两浏览器与三个尺寸共24个现有原生拖牌回归通过，覆盖有效落点、拖回、指针取消、断线；没有把选择的24场景称为完整拖牌矩阵。
- 最终96文件/1084项完整检查、类型、生产构建（Build `hkYXOsOKAt0TWe8Q0Nrmk`）、374构建文件泄漏扫描通过。首次完整检查6项失败为测试环境找不到pg_dump（ENOENT）；只补上应用已有PostgreSQL二进制的PATH后独立r02重跑通过，未修改产品、测试断言或跳过失败项。仅处理隔离合成测试资料，未下载真实用户数据。

证据保存在应用忽略目录：`.local/audit/drag-threshold-red-r01.log`、`drag-threshold-target-r01.log`、`drag-threshold-full-r01.log`及`r02.log`、`drag-threshold-type-r01.log`、`drag-threshold-build-r01.log`、`drag-threshold-secrets-r01.log`。原生36场景为 `.local/audit/drag-threshold-1791506677491/proof.json`；24回归为 `.local/audit/seat-drag-threshold-regression-1791507593830/proof.json`，源码、脚本和样式摘要已逐项对照当前文件。根任务检查不称为独立审查。

## ECS 发布与剩余范围

已发布源提交 `d55b35fcef392c5dbb7c842c6203b4b32f63144f`／Build `hkYXOsOKAt0TWe8Q0Nrmk`，入口 <https://8.133.186.15/mahjong>。冻结Linux amd64镜像为 `sha256:0a7cc604ad80f538a8120764a383b90eb700801fed973c52bbb7d5a93a1d5d41`，692源码/449构建文件逐项摘要一致，manifest SHA256 `8b3d919a60f10aa2475fc40ada13c5b2e10584e1d592b0ac65e2aeab5ef7281d`。同一冻结镜像在半核CPU、384MiB、无网络、只读、单线程独立隔离容器中通过40文件/669项检查，测试进程PID1577770实际退出0，未重启任务或放宽360秒外层期限。发布器PID1579999实际退出0，入口保护恢复；可信TLS健康200及143个公网资源摘要全部一致。

13个远程阶段均有命令绑定的实际退出0证据，汇总在应用忽略目录 `.local/ecs-deploy/drag-threshold-published-closeout-r01.json`。发布前后12张持久化表摘要一致（`9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`），权威检查无进行中的真人牌桌；照片清理器CID/镜像保持，应用1CPU/768MiB且无OOM。禁备份标记、masked/inactive timer和inactive service保持，未生成备份或下载真实资料。

真实Android手势、厂商坐标缩放、生产认证WSS故障和完整当前厂商体验仍未全部验收。之前语音及其他几何证据属于此前验证，此次没有把它们称为新镜像重新执行的原生验收。
