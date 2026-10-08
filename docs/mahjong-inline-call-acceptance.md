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

本步为完成本地验收的候选，提交后立即推送GitHub main和工作分支；线上仍fef6e66 / Build SyqNXitxCD_KjJQ7Iwn4g。Linux固定候选验证及ECS发布继续待完成，未宣称此界面已上线。原完整体验目标保持active，真实Android/当前厂商全体验仍未验收。
