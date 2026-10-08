# 和牌结算指示牌补齐

2026-10-08。已发布源 **5b5eaef**，入口 <https://8.133.186.15/mahjong>。本地阶段的待验表述保留历史范围，最终状态以文末发布结果为准。

原和牌详情只显示里宝牌，普通宝牌被结算遮罩遮住。现在详情中并列展示宝牌、里宝牌各五个位置，未公开位置显示既有牌背；直接使用 game.doraIndicators 和当前赢家 settlement.uraIndicators，不推导隐藏牌、不改评分。多荣切到下一赢家时无里宝牌则全部牌背，不残留上一家的公开值；收支页不重复显示。素材继续采用现有授权牌面。

历史官方 v0.11.252.w 客户端在 winUI 初始化各五个 dora/lidora 槽，show 阶段未开槽显示 back。证据与字符切片摘要保存在 `.local/audit/settlement-indicators-20261008/reference-r01.json`；没有验证当前厂商版本，不把旧版研究当作当前像素一致。

测试先 RED：两种人数缺少普通指示牌，原23项通过；实现后25项通过。既有测试通过语义组精确区分两种指示牌，不再把新增普通牌误当成里宝牌；相关31项通过。完整78文件/780项通过，生产构建、类型、374构建文件秘密扫描通过。日志保留首轮选择器回归失败和构建类型失败；仅修正测试查询，不改变结算支付。

真实原生三/四麻双荣 RoomStore 驱动 mounted GameRoom，正式 page.tsx CSS顺序，Chromium/WebKit×667横屏/1440桌面共8场景通过：五槽非零尺寸与行宽、公开指示值一致、双赢家独立确认、单次净收支和下一局原生点数一致。图片已实际查看。证据 `.local/audit/settlement-sequence-browser-1791442161412/`。组件另验证赤五、多张公开指示和不同赢家里宝牌切换。真实原生立直里宝牌浏览器范围扩展仍待完成。

待完成：独立最终审查、原生立直/杠指示场景扩展、实际Linux候选与指定ECS发布、公网TLS/业务数据/清理器/禁备份和保护同步。真实Android、当前厂商视觉/语音和总体体验仍未验收；整个目标继续active。

## 最终审查与扩展验证

唯一独立审查 base5b7582c..770275d 无Critical/Important/已确认Minor；独立重跑31组件和16原生浏览器，审查者输出1791442479568，首报误引用根输出1791442473911后已更正，未复测或第二次审查。报告 `.local/audit/settlement-indicators-final-review-20261008.md`。

根单次修复轮只补覆盖：原生物理牌墙预留赤五p0作为指示牌，真实立直接受自摸与暗杠岭上自摸，检查 is-red、Pin5-Dora.svg 和已加载图片；三/四麻×两引擎×横屏/桌面16/16通过，`.local/audit/settlement-indicators-native-1791442628356`，未修改产品逻辑。暗杠后两张公开指示牌，非立直里宝牌五背；原生里宝牌与当前结算一致。type-r05 exit0；Linux候选本地选择15文件238项通过，仅选择证据。

根裁决：红五覆盖缺口已补；审查未触及Linux/ECS/data/cleaner/backups，继续作为必要发布门槛，不能凭本地结果声称上线；Android实际显示、当前厂商版本视觉仍无证明，可能存在设备和参考差异；本轮复用既有授权资源，不新增厂商资产，未重新全量授权审计。整体目标保持active。

## ECS 最终发布

实际Linux候选15文件238项通过，来源5b5eaef6d6c3b3ebfa5fab3871e737879719dfc6，Build ljPrqP5UqPVSitwFOHeGz，镜像 sha256:df89ac64e71290fad5c2b6ee52a1104bbfaded4557d6e4aa8c1badededb061b2。590源码/449构建文件摘要匹配。发布器确认无真人牌局，exit0并恢复入口；12表逐表摘要发布前后相同，照片清理器CID/镜像及禁备份策略保持，不创建生产测试牌局、备份或下载真实记录。1CPU/768MiB保持，无OOM。公网默认TLS健康200，130资源摘要一致。

本阶段12个所属路径保护同步通过，主目录HEAD/index/next-env、其他文件和Git状态保持原样；f7f27e9父镜像作为回滚目标保留。实际捕获位于 `.local/ecs-deploy/settlement-indicators-remote-captures/`：build-status r02、Linux r04、publish-status r02、live-check/final-health/published-preflight r01；公网和owned-sync proof位于部署目录。

以上只证明本阶段发布和所列原生场景，不证明实际安卓、当前厂商版本像素/声音、完整私有协议或全目标已完成。整体目标保持active。
