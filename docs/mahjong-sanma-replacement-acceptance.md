# 三麻补牌与杠宝牌验收

日期：2026-10-07至2026-10-08。范围：拔北补牌岭上役、大明杠与加杠的杠宝牌后翻，以及规则弹窗本场说明。此记录不将完整牌山算法、厂商逐帧反馈或 Android 实机列作已完成。

## 一手规则与复现

已保存的雀魂公开配置 `v0.11.252.w/res/config/lqc.lqbin` 中，规则行24、25、57均明确“拔北自摸算岭上开花”。原文件17,483,020字节，SHA-256 `a5959513fa31d3b5297d2dda400c86c0eacbdb4adad461b583439d7f673c9086`；抽取行文件 `.local/audit/official-config-rule-rows.json` 摘要 `5910787f7796df63f21f7f826c6541d6a8d4b2f15d5b0195b8b1bb4bd9b41023`。官方 [2019年三麻说明](https://x.com/MahjongSoul_JP/status/1151688215943757825) 的公开 oEmbed 也明确北补牌自摸计岭上，原响应1261字节，摘要 `6496e4545a17b6435663f1bba4c5f59691eb6788517715c4348d90029d31a56a`。

公开配置标签2111为“明杠宝牌即开”，公开客户端 `DefaultDetailGameRule3` 与 `DefaultDora3DetailGameRule` 均默认 `ming_dora_immediately_open:false`。固定依赖 majiang-core 1.4.1 的 `カンドラ後乗せ` 语义让大明杠和加杠后翻，暗杠即翻：待翻牌在弃牌或下一次合法杠开始时公开。该证据是默认配置与引擎语义，未声称已抓取厂商服务器的该动作序列。

实际旧产品 RED `.local/audit/mahjong-sanma-replacement-red-20261007-6cd61a577e/` 有4个行为断言失败。合法108张实体 fixture 已走到补牌决策：开放手牌的唯一岭上役不能自摸；大明杠、加杠及连续杠提前暴露指示牌。抢北与抢加杠阴性检查通过。规格中旧的“不计北岭上”由该一手证据更正。

## 实现范围

实际杠次数与已翻指示牌数分别记录。未翻出的 dora/ura 同时从公开画面和计分中排除；新局重置等待状态。暗杠仍立即翻牌，拔北不新增指示牌。正常摸牌、荣和、抢北不继承岭上役，被抢加杠不新增该杠的指示牌。杠限制依据实际已完成次数，不能通过暂未翻牌绕过。

规则弹窗同步本产品当前三麻自摸损：每本场两家各加100，荣和加200；责任支付沿实际计分说明。原108张数量、实体补牌顺序、crypto随机洗牌、公开北牌实体和230ms动效保持。

## 验证与发布状态

本地Sanma46/46、相关四麻2/2、类型检查通过；追加两条North精确结算断言后2/2通过。开放手仅岭上+北宝牌为2翻30符2000点，分差 `[2000,-1000,-1000]`；闭手示例为6翻30符12000点，分差 `[12000,-6000,-6000]`，两者守恒。

原生Chromium/WebKit各5个真实Choice场景共10项通过，844×390横屏：开放北补牌自摸、闭手北补牌精确结算、大明杠补牌自摸不计待翻dora、大明杠弃牌后公开、加杠弃牌后公开。北牌托盘保留1张，UI提交的Choice ID与引擎一致；所有页面无异常。最终证据 `.local/audit/mahjong-sanma-fidelity-native-1791388323111/`，root实际查看Chromium的6翻12000点结算图。此前无数值断言的首轮原生结果保留，不替代本轮证据。

最终源码 `f7baf30da91fa4b8b096b6e14713b552376232ba` 完整519项/59文件通过，4项真实三麻联机/电脑补位回归通过；构建、类型和秘密扫描通过。COPY-only镜像 `sha256:4420a8ba23051f9ecd89e0c84641784774defc4d36aca485f71872419af5a6ee`，Build `vwlHC1DNKEaLHvZWqwcIQ`，Linux/amd64独立只读容器实际46/46三麻测试通过。首轮Linux运行因Vitest无法在只读用户目录创建API token而未开始测试；原失败证据保留，临时XDG目录放入容器tmpfs后r02通过，不计作产品失败或通过数。

已发布到上海ECS `i-uf6i9ie15g82dprialoy`，`/srv/yougui/releases/f7baf30`，地址 `https://8.133.186.15`。514源码与449构建文件逐项摘要、公网129资源、默认TLS及健康200通过。现有publisher actual exit0，屏障active1/held3/restored1；真实牌桌权威确认为空才切换。发布dispatch无stdout触发本地wrapper拒绝，保留原remote exit0记录，没有重复dispatch；实际publisher状态、运行镜像与完整live/final检查消除此歧义。

12张表的数据摘要相同，7账号/3空间/5成员/29照片及清理器完整CID/image保持；APP继续1CPU/768MiB，无OOM，最后检查可用磁盘23,917,445,120字节。8个server helper与两个publisher摘要不变。禁用备份标记、masked/inactive timer/service和备份目录不存在均核对；没有备份或用户资料下载。验证只使用隔离合法fixture，不创建生产假牌桌。

发布总证据 `.local/ecs-deploy/sanma-fidelity-f7baf30-publication-proof.json`；首次8文件同步 `.local/ecs-deploy/sanma-fidelity-f7baf30-primary-sync-proof.json` 保留512项foreign字节和primary HEAD/index/next-env。本记录、计划与进度的发布后文档提交另作3文件guarded closeout同步；实际运行的产品源码仍是f7baf30。

公开 Akagi 固定提交 `cd68865f9e93eddcda6451cd18874a6f68c5fb49` 的 `action_new_round_three_player_real_payload` 样例包含庄家14张与剩余54，作者注释称第14张是首摸，可与本产品首摸后的54核对。这不是完整牌山与盐的预像，也不能证明 RNG 相同。官方韩文 FAQ 提到2024-02-28后的盐化SHA-256验牌，尚无完整输入/盐/摘要可验证向量，不能猜测私有算法。
