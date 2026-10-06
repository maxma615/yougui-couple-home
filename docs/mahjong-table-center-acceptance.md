# 方形场况台与宝牌区验收

日期：2026-10-07。产品源码 `f8e300a28273fd8e4c580fdef41857a5925d19ce`，Build `quOcxqqPLnoSDmSp7qi8m`。已实际发布到 https://8.133.186.15/mahjong 。完整雀魂体验连续目标保持 active，本次是界面布局修正。

## 实际修改

采用[雀魂官方操作指南](https://mahjongsoul.com/startguide/)的 tutorial01 / tutorial02 作为构图观察：统一圆角方形场况台，比分按四边座位方向旋转；本场与立直棒计数放到宝牌指示牌下方，中央保留局数与余牌。参考像素仅在忽略目录观察，产品继续使用授权的标准日本麻将牌面和原创牌桌。

保留生效 CSS 的 top44% 和原动态尺寸，未移动河牌、手牌或动画锚点。基线桌面中心为圆形，手机覆盖规则原本已是圆角方形，不能称手机原先也为圆形。比分、余牌、宝牌计数在小屏设置至少9px；侧边分数块向边缘移动，消除与中央读数相交。合法操作选择与拔北累计托盘逻辑未改。

## 实际验证

- 组件测试用真实 RiichiGame / SanmaGame DTO 覆盖七个 viewer 风位和独特分数，以及本场2、立直棒3、余牌47；初始8项RED后8项GREEN。数值赋值是显示夹具，不冒充真实局进程。
- 根实际复现桌面圆形与缺少宝牌下计数；最终小屏中央相交检查先RED（667三麻四处），调整后GREEN。
- 完整318项测试、39测试文件通过，覆盖已有成员权限、并发、真实持久化和恢复检查。
- 26浏览器回归通过，其中20真实Socket场景、6显示/API夹具；隔离数据库和附件清理完成。
- Chromium / WebKit 56实际引擎所有座位初始布局、32满牌河/满副露压力布局、98出牌动效几何与边界通过。56检查实际方向矩阵、至少9px字号、中心读数与座位矩形不相交，以及公开内容位于视口内且未被遮挡。根实际查看667和1440最终截图。
- 最终typecheck、生产build与360构建文件秘密扫描实际exit0。独立审查Approved，独立组件8/8，根逐个核对七文件摘要；非阻塞建议为场况台/风位增加辅助技术分组语义，尚未实施。

## 边界

本机浏览器视口不等于Android实机验收；230ms出牌和900ms短反馈仍为本产品参数，未测得厂商相同时序。本轮未改变规则或牌山协议。官方发行方在[Google Play开发者回复](https://play.google.com/store/apps/details?gl=TW&hl=zh&id=com.soulgamechst.majsoul)中说明每局开始时固定牌山、牌谱下方有SHA256验证入口；仍不足以确定盐、输入编码、揭示协议或RNG。

## 实际发布与资料保护

- 源码 f8e300a / Build quOcxqqPLnoSDmSp7qi8m，镜像 `yougui-app:f8e300a-ecs` / `sha256:9f6f3e54d3a156d2e405eb4fe016220efdabb5b3cda04171aa2506ec3af13974`，运行目录 `/srv/yougui/releases/f8e300a`。
- 本机已完成Next生产编译，ECS仅COPY构建Linux amd64镜像。冻结404源码和479构建文件的完整路径集与SHA匹配；传输tar.gz 58,008,404字节，SHA256 `005ce110d38e3c51510856108505374c4ce94a61b02981fbdc9221125d9b74d0`。
- 复用原8个操作helper与受保护发布器，摘要保持。发布器实际exit0，入口限制恢复；发布前与冻结后都确认无活跃真人桌，未结束任何牌桌，未创建QA账号或会话。
- 公网默认TLS验证健康200，54个资源SHA与冻结包一致。12表摘要自初次readiness至发布后完全一致，3原会话、3账号与28照片保留；原照片清理容器CID及镜像未替换。应用1CPU/768MiB、正在运行且没有OOM标记，备份timeractive。
- 新鲜一致备份 `20261006T220846Z-efe93065c986`，29文件137,443,711字节；站外tar实际下载并验证COMPLETE及29成员摘要，tar 137,512,960字节，SHA256 `c87c78d2d41217a2caff143061cb608bbae898692807f435edd78190395c6cc6`。本机仅保存于应用数据备份目录，文件0600、父目录0700。

证据入口：`.local/mahjong-center-final-source-proof.json`、`.local/mahjong-table-center-review.md`、`.local/mahjong-center-public-independent.json`、`.local/ecs-deploy/center-offsite-proof.json` 与主目录忽略路径 `sanma-center-*.json`。这些过程记录不代替实际Android验收。
