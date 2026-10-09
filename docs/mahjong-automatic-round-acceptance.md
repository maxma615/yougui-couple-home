# 新局自动操作开关与便捷菜单验收

日期：2026-10-09。本轮本地验证和 ECS 发布完成；线上运行 c558d05，新局自动操作重置和菜单修复已生效。

新一局开始时，自动和牌、自动摸切、自动拔北和不鸣牌全部关闭，并取消上一局尚未发出的操作。作用域包含服务器 handId，因此庄家连庄而局名不变时也能识别新局。同一局的新决策、重复快照和断线重连保留开关；新局允许用户再次打开自动和牌。

参考公开客户端 ActionNewRound.play 的四个开关重置调用，版本与摘要保存在 tests/fixtures/mahjong-automatic-round-reference.json。仅提取默认新局重置语义，没有复制厂商程序或素材，也未声称完成其发牌动画、全部重连逻辑或整个游戏体验。

便捷操作菜单展开后，点击或聚焦到菜单外将收起；菜单内按 Escape 收起并将焦点还给入口。菜单内切换开关保持展开。入口点击主动获取焦点。修复了菜单遮挡手机自摸按钮的问题，未调整牌桌相机、布局、规则或持久化数据。

## 实际验证

- 旧实现有效 RED：automatic-round-red-r01.log，3 失败、13 通过；纠正旧测试中“新局保留开关”的错误假设。
- 完整测试 automatic-round-full-r03.log：99 文件、1158 项通过。r02 因测试进程缺少 pg_dump 路径失败，修正本机 PATH 后重跑全部，不修改产品逻辑或略过恢复测试。
- 最终类型 automatic-round-type-r03.log、生产构建 automatic-round-build-r02.log 均实际退出 0；构建 F_bBAX83u7nb9cSpS7Jtp。
- automatic-round-secrets-r01.log：374 构建文件扫描通过。
- automatic-round-network-r04.log：64 个 Chromium/WebKit、三麻/四麻、667×375/1440×810、WebSocket/polling、HTTP/Socket 两种先后顺序、上一局自动和牌待发/已发送场景。使用同一个真实规则引擎执行合法和牌及各席确认，实际连庄进入 handId+1；断言新局全部关闭、不重复 POST、再次启用后只提交一次合法和牌。
- automatic-round-regression-r03.log：240 个既有原生 HTTP/Socket 场景全部通过，包含手动点按、键盘、自动摸切、不鸣牌、荣和、特殊操作和拔北。r01 的原生自摸点击被便捷菜单遮挡，真实失败证据保留；修复后没有 force 点击或放宽断言。
- automatic-menu-r03.log：8 个三麻/四麻、双浏览器及两个尺寸场景，验证菜单内部操作、键盘 Escape、外部焦点、桌布按钮点按和原生自摸可达。WebKit 点击按钮默认不取键盘焦点，键盘场景明确聚焦菜单按钮后发送 Escape；r01/r02 失败记录保留。

三份最终原生证据目录：automatic-round-network-1791536508960、automatic-network-1791536510109、automatic-menu-1791536677706；均位于 .local/audit，各自记录运行源码摘要，提交前已重新核对一致。完整日志及截图不包含生产用户资料，也不纳入公开代码提交。

312 个本机场景不替代真实 Android、生产认证 WSS 故障或完整当前厂商音画验收。ECS 与公网验证范围见下节。

## ECS 发布终态

发布源提交 `c558d051959d573c97a94f6434a0269da497b885`，地址 <https://8.133.186.15/mahjong>，Build `F_bBAX83u7nb9cSpS7Jtp`。镜像 `sha256:834d80eede5a9d7d627c7ba795cdc9fa8f0906576adb3c85d79d362db6ca910a`，从实际在线 c0ec700 镜像继承依赖；未更改规则后端、数据库或部署配置。

同一 Linux 镜像在无网络、只读、半核 CPU / 384 MiB / 64 MiB tmpfs 容器中通过 43 文件 / 743 项测试。构建 PID 1735133、Linux PID 1736733、发布 PID 1740070 均已记录实际终态 0；Linux r01 仅确认进程仍运行，r02 同一 PID 实际完成，未重启任务。发布器确认不存在真人进行中的牌桌后切换，保护门已恢复。

冻结发布包 37,740,486 字节，摘要 `c5f53f09abd00d2b5b106b56844594bfffd41f1f1d86b00bde8c46bf6624bf17`；清单摘要 `16ce76a93b95b3e6073b569cef2ab6ee4779096e4074894594a7917e846e8625`。722 源码 / 449 构建文件在线逐文件一致，公网 145 静态资源摘要一致、可信 TLS 与 health 200。十三阶段实际退出及身份核对见本机 `.local/ecs-deploy/automatic-round-published-closeout-r01.json`。

十二表摘要发布前后均为 `9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`；账号 7、空间 3、成员 5、照片 29、迁移 7。清理器容器与镜像保持，应用运行无 OOM，维持 1 CPU / 768 MiB。八个部署辅助文件及两个发布器摘要一致；禁备份空标记保持、timer masked/inactive、service inactive、无备份目录。没有生成备份或下载真实资料。

此处公网资源和 ECS 检查不替代真实 Android 手势、生产认证 WSS 故障、开局发牌动画或全部厂商行为验收；整体目标继续 active。
