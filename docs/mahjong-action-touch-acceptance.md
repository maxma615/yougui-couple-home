# 麻将操作按钮触控区域（本地，未发布）

2026-10-08。线上仍是d817373，完整体验目标active。

## 问题与范围

正式page.tsx样式顺序，真实Chromium/WebKit测量确认短横屏部分操作高度35px，较大触屏42px；立直取消文字也小于44px。本次只对pointer:coarse设备把操作与立直取消最小宽高设为44 CSS px；牌面预览、法律Choice与发送逻辑不变。较宽的牌面组合按内容保留宽度；鼠标设备原紧凑布局不变。

保留较旧53px最小宽度、仅升高度时，667宽五类响应压力显示中吃牌组合+过按钮比容器约宽1px，多占一行并使荣和顶部角落被静音/屏幕控件覆盖。actual elementFromPoint追踪记录在action-touch-width-probe-r01；恢复44px最小宽度后四角命中检查通过。未将扩大高度后出现的碰撞放宽掉。

## 已执行验证

原产品RED: action-touch-red-r01，35/42px尺寸失败。第一次互动harness因缺process shim失败保留；修正后互动r02实测取消按钮太小。类型检查发现测试choices[0]可能未定义；改为assert存在的原生合法Choice。最终action-touch-final-r04真实24场景/0失败，proof `.local/audit/action-touch-1791445787320/proof.json`，CSS与测试SHA保留。

两个浏览器×三尺寸(667×375/844×390/1440×810)×触控/鼠标×两场景。原生三麻界面实际tap/click立直→返回普通切牌→拔北，精确原生Choice回调并由同一原生引擎接受，公开North计数变1。显式响应布局压力场景覆盖荣和、两种杠、碰、两种吃、过，实际打开组合对话框并选择精确吃牌Choice；该压力场景不称为原生规则牌局。操作区域四角命中、视口边界和现有手牌/牌河投影交叉检查通过；取消按钮检测44px并实际点击，但未声称所有真实残局布局都已验收。

生产构建action-touch-build-r01实际exit0、Compiled successfully；类型action-touch-type-r04空日志exit0；秘密扫描action-touch-secrets-r01实际通过。独立审查及真实Linux/ECS发布后续完成。无真实Android触摸验收，不包含相机修改；用户设备桌面变形仍待定位。

## 一次审查与根一次修正

独立只读reviewer /root/action_touch_final_review对daa46d6..f2ddfa4审查：Critical0/Important0；Minor为未挂载外层提示条、未测中心、取消按钮未测四角。根一次仅加强测试：加入实际提示条结构；操作按钮中心、取消四角/中心、视口及手牌/牌河碰撞均检测。没有二次审查，也没有增加产品改动。最终final-r05实际24/24，proof `.local/audit/action-touch-1791446165498/proof.json`，type-r05实际exit0。当前版本完整780/78和本地Linux候选集263/16实际exit0。构建与秘密扫描仍对应未再改变的产品CSS。真实Linux与发布未完成。
