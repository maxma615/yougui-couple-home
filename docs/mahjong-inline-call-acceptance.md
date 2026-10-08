# 桌内鸣牌组合选择（2026-10-09）

## 差异与实现

对照已缓存的官方旧Web客户端UI_PlayerOperation.showDetail / UI_ChiPengHu.onDetailBack：多组合选择在桌内居中展开，隐藏普通操作按钮；返回只恢复普通选项，不提交跳过。参考地址https://game.maj-soul.com/1/v0.11.252.w/code.js，本地解码证据`.local/audit/official-game-code-decoded.js`。这证明旧公开客户端的交互逻辑，不证明当前Unity客户端全部视觉已对齐；没有复制厂商图片、声音或代码到产品。

原实现使用showModal的全屏遮罩窗口及YOUR CALL标题。现改成桌内居中的非模态组合面板，展示既有实体吃/碰/明杠/暗杠/加杠预览与精确合法Choice ID；普通操作在组合选择期间隐藏，返回或Escape恢复操作，不擅自过牌。没有加入额外动画或服务端任务。断线/决定更新仍清理旧选项，busy/断线禁提交，选择后关闭。

第一项合法组合获得键盘焦点；显式记录打开面板的按钮以便返回。真实WebKit发现点击入口不一定获得焦点，原依赖document.activeElement的返回会落到body；记录触发按钮后，Escape在两浏览器均回到正确入口。非模态面板不限制Tab在整桌循环。

## 实际验证

- 新组件用例原先查询关闭dialog的初始环境失败保留r01/r02；补齐既有showModal测试环境后r03取得有效RED（原DIALOG，要求桌内SECTION）。实现后44项定向组件通过，包含两种赤/普通组合、全部实体牌、原生ID、不误提交、忙碌/断线、决定更新、无焦点入口及Escape返回。
- 最终`call-inline-touch-r03.log`exit0，Chromium/WebKit × 667×375/844×390/1440×810 × touch/mouse，共24场景，零几何/命中失败。含12原生三麻拔北和12明确标注的多组合布局压力场景；后者不冒充原生吃牌。选牌面板在视口内且居中、全部选项至少44px、实体牌命中原按钮，非模态且无dialog:modal；返回/真实Escape零指令，重新打开只提交精确选项，桌内选项获得焦点。保留r02 WebKit Escape回到body的有效失败，没有force点击/扩大等待。最终证据`.local/audit/action-touch-1791491815264/proof.json`，短横屏截图实际查看。
- 最终`call-inline-native-r03.log`exit0，正式GameRoom与物理108/136张引擎54种原生选择场景，84个精确合法组合分别消费进引擎并产生相同副露；赤五/普通五和全部吃碰杠类型保持。既有各席验证也通过66物理画面、18合成帧，零运行错误。最终`.local/audit/seat-theme-green-1791491824034/proof.json`结束前后及根复核源摘要匹配。r01/r02是中间源码验证，不作为最终候选证据。
- 生产构建r03、类型r03和374构建文件凭据扫描r01均exit0。完整`call-inline-full-r05.log`950项/90文件实际exit0，最终完整回归通过。初次full-r01误绕过npm test的.env.local加载，缺DATABASE_URL且旧dialog标签断言失败；修正执行入口与语义查询。full-r03另复现重连测试在Socket初始化前读取old.deliver的竞态；仅让start等待真实mock Socket创建，没有更改产品重连、时限或测试隔离。失败全部保留。

根审查非独立。实际浏览器覆盖桌内布局、输入和原生选择，但不是生产账号TLS/WSS、真实Android或当前雀魂逐帧对比。相机未改动，不据WebKit软件截图宣称修正用户设备透视。规则、公开/私有字段、权限、数据迁移、CPU/内存预算均未改。

## 交付状态

本步代码已立即推送GitHub main和工作分支，固定候选Linux及ECS实际发布已完成；线上现820bc85 / Build gxd3NxhCMNuLmu2jN1ePn。原完整体验目标保持active，真实Android/当前厂商全体验仍未验收。


## ECS实际发布

入口：https://8.133.186.15/mahjong。运行源`820bc8577b39aa29941d1b36a93702c091c24ed4`，Build `gxd3NxhCMNuLmu2jN1ePn`，镜像`sha256:0750a1c2d0f9c05c87974be161fe381fb074aab3a25bf2690b8e332fe2b00bd2`。

- 新鲜父版本fef6e66及固定发布器、8项辅助脚本、清理器、禁备份策略预检通过。冻结包37321654字节，SHA256 `9f0f3250dfaca0c8f285c86f14ac386799b131cf0ed1885c3622ee9884e0c27e`匹配。657源码/449构建全摘要、Linux x64及父镜像依赖层继承通过。
- 本地与同一冻结镜像的Linux受限验证517项/33文件实际exit0，含选牌、出牌动作及Root排序；精确文件/断言数通过。单worker、threads/isolate:true、0.5CPU/384MiB、无网络/只读/64MiB临时目录、单项120秒/整个240秒保持。只轮询同一PID1481208，实际exit0后才进入发布，没有重启或将running当成通过。
- 发布命令根复核初始两项错误假设（每阶段均直接包含完整版本号、PID文件使用字面拼接）产生本地误报；按实际候选image/证据摘要与Path.with_suffix生成PID/exit文件进行分阶段复核后通过。六个阶段命令未改，也未在误报期间提交切换；记录`.local/ecs-deploy/inline-command-review-r03.json`。身份、资源、数据和策略检查保持。
- 固定发布器实际exit0，屏障内权威确认无真人活动牌局，切换后健康通过并恢复入口。默认可信TLS公网健康200，133项公开资源摘要一致；应用Running无OOM，1CPU/768MiB预算保持。
- 12张业务/迁移表摘要发布前后相同`9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`，用户7/空间3/成员5/照片29/迁移7。照片清理器CID/image保持，禁备份标记、timer masked/inactive、service inactive及三个不存在的备份路径保持。没有备份创建或真实资料下载。

实际发布闭环`.local/ecs-deploy/inline-published-closeout-r01.json`绑定13个终结成功阶段、133公网资源、同一冻结清单`bc4fb08a18c3d270d43f3f151467090cece16e2a19e895d5318f2c7950242f90`。发布记录立即推送GitHub两分支。公网身份/资源与健康检查不能代替真实生产账号/WSS选牌端到端、真实Android或当前厂商画面完整对齐，原整体目标继续active。
