# 第一次重读失败后的快捷恢复（2026-10-09，本地候选）

上线3205c63只在失败POST后的立即GET成功时解锁快捷手势。如果这一GET也失败，后续合法的GET或Socket已恢复界面，双击仍被同一决定的consumed挡住。正式Root新增两种迟恢复测试取得有效RED，分别为后续online触发的GET及当前Socket重新发送同一合法决定，第二次明确双击均无回调。证据late-recovery-red-r01.log（2失败/20通过）。

现把待恢复的房间/游戏/手局/席位/决定/原Choice保存在Root短生命周期ref，失败或被响应排序拒绝的读取保留标记。仅已接受且没有请求在途的权威状态消耗一次标记：全部身份及合法Choice仍匹配才递增恢复代次，清除旧手势，等重新双击；新状态已经撤销选项或改变身份则清除标记而不解锁。新的明确提交先清除旧失败标记，不让它影响下一笔请求。沿用现有响应顺序、Socket当前性、原生合法Choice、轮询及手势hook，不新增轮询、计时器或服务端推演，不自动补发。

组件覆盖后续GET和Socket均恢复、恢复不自动发送、移除选项后的标记不可复活，以及旧GET晚于撤销选项的新版Socket不会恢复旧Choice。原stale-get测试改为新Socket撤销选项（旧版合法Socket也会作为有效恢复，不能继续要求它锁住），保留过时GET的拒绝保护；真实网络stale-get则证明当前合法Socket解锁后，旧GET不会阻止新的明确重试。

一次初始定向运行的旧退休Socket测试因为create助手在替换Socket装好前返回而失败；为助手加入实际新Socket创建的等待，产品连接逻辑未改。失败late-recovery-target-r01.log保留；修正后66项/3文件通过，完整981项/92文件、类型检查、生产构建及374文件凭据扫描全部实际exit0。最终日志late-recovery-target-r03.log、late-recovery-full-r01.log、late-recovery-type-r02.log、late-recovery-build-r01.log、late-recovery-secrets-r01.log。当前Linux选择同一单worker/threads/isolate配置在本机548/35通过，只是本机选择证据，尚非ECS终态。

448种真实HTTP/Socket场景全部实际exit0：两浏览器、三四麻、两横屏、WebSocket/polling、鼠标触屏、弃牌/pass与七种故障/恢复次序。新增later-get及later-socket先确认立即GET失败且第二次手势仍零提交，再恢复真实GET或发出当前真实Socket状态，确认没有自动回调后重新双击，正好一次合法提交。持续GET失败仍锁定，已经接受的出牌/传输重试仍逐决定去重；过牌后的新决定可以等待入手完成后明确摸切。共448原生接受操作、768笔明确逻辑POST、64次相同nonce的浏览器传输重试，最多一笔在途。真实RoomStore经正常create/join/ready/start初始化，原生108/136张引擎，每个原生决定接受至多一次，无force输入、假时钟或超时放宽。

最终late-recovery-network-r01.log / .local/audit/blank-recovery-network-1791497818253/proof.json，结束后重新核对所有绑定源摘要；根非独立复核.local/audit/later-final/review.json。账号会话由本地测试HTTP端提供，不是生产账号鉴权验收。候选尚未上线。线上仍3205c63 / Build wxz_uK5KxqUXj9IPPPaNw。真实Android、生产账号认证/TLS/WSS故障及全部当前厂商视觉/语音/交互仍未完整验证，原对齐目标active。
