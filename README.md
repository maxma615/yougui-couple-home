<div align="center">

# 有归 · 情侣空间

**把两个人的日常留下来，也约朋友一起打一局。**

深色电影感的自托管生活空间，包含照片、日历、纪念日、共同待办，以及日本麻将联机。

[功能一览](#现在的有归) · [如何使用](#使用入口) · [麻将操作](#牌桌怎么操作) · [本地启动](#从另一台设备继续开发) · [开发接手](docs/development-handoff.md) · [麻将进度](docs/mahjong-fidelity-progress.md) · [部署运维](docs/operations.md) · [MIT License](LICENSE)

![Node.js](https://img.shields.io/badge/Node.js-24%2B-43853D?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-111111?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-B75B72)

<img src="docs/screenshots/cinematic-login-desktop.png" alt="有归深色电影感登录界面" width="100%" />

<sub>截图来自隔离测试环境，使用合成账号和内容；界面预览记录于 2026-10-05，后续功能持续迭代。</sub>

</div>

> 更新于 **2026-10-10**。当前自用地址：[有归](https://8.133.186.15) · [麻将室](https://8.133.186.15/mahjong)。需要已配置的账号登录。线上运行代码为 `4a238f0`，源码提交与服务器发布分别记录。

## 从这里开始

| 你的目的 | 阅读入口 |
| --- | --- |
| 先看有哪些功能、怎么配对和打牌 | [功能一览](#现在的有归)、[使用入口](#使用入口)、[麻将操作](#牌桌怎么操作) |
| 换一台设备继续开发 | [本地启动](#从另一台设备继续开发)、[开发交接](docs/development-handoff.md) |
| 部署自己的实例 | [自托管部署](#自托管部署)、[运维手册](docs/operations.md) |
| 接着完善麻将 | [当前进度与待办](docs/mahjong-fidelity-progress.md)、[最新上线验收](docs/mahjong-portrait-fallback-acceptance.md) |

当前已上线情侣空间、管理员面板、三／四人日本麻将和电脑补位。手机竖屏自动横向展示已上线；真实 Android 操作与完整参考体验仍在验证；杭州和四川麻将尚未开发。README 中的测试结果对应具体已发布版本，后续文档更新不会自动更新服务器。

## 现在的有归

有归已经从双人记录工具发展为带管理员面板和麻将室的情侣空间。一个部署可以容纳多对情侣，每个生活空间仍只属于两位成员；相册和生活记录按空间隔离。麻将室独立于空间成员关系，来自不同空间的朋友可以坐在同一张牌桌上。

项目提供可自行部署的完整源码，当前形态是浏览器网站，可在手机和电脑访问；没有独立 Android App 或微信小程序。个人 ECS 实例不提供公共注册或共享演示账号。仓库 `main` 是继续开发的入口，生产运行版本另见发布记录。

| 部分 | 已有功能 |
| --- | --- |
| 情侣空间 | 深色首页、恋爱天数、近期安排、纪念日、共同待办、全天与定时日历 |
| 点滴与照片 | 记录新增和编辑、照片上传、相册和大图查看、鉴权读取、附件清理 |
| 账号与配对 | 手机号或邮箱加密码登录、修改密码、限时一次性邀请、双人成员绑定 |
| 管理员 | 独立管理员账号、成员账号与密码管理、启停账号、空间空位绑定、跨空间相册只读 |
| 实时协作 | 修改通知、断线回退、并发版本检查与冲突草稿保留 |
| 日本麻将 | 四人麻将、标准三麻、真人联机、电脑补位、东风／半庄 |

管理员不占双人空间名额。普通成员不能访问其他空间的生活内容；管理员相册能力是独立的只读入口。

## 界面预览

<table>
  <tr>
    <td width="65%"><img src="docs/screenshots/cinematic-home-chromium.png" alt="情侣空间桌面首页" width="100%" /></td>
    <td width="35%"><img src="docs/screenshots/cinematic-home-webkit-mobile.png" alt="情侣空间手机尺寸首页" width="100%" /></td>
  </tr>
</table>

首页截图记录于 2026-10-05，使用合成内容。麻将牌桌后续持续改版，旧截图不作为当前牌桌效果或真实手机验收依据。

## 使用入口

| 想做什么 | 从哪里开始 |
| --- | --- |
| 登录 | `/login`，使用管理员配置的手机号或邮箱与密码 |
| 上传照片 | 首页「添加照片」或相册新增记录；填写标题、日期，保存后继续添加 JPEG、PNG、WebP |
| 邀请另一半 | 首页「邀请另一半」或「我们」里的配对入口，生成一次性邀请；对方打开后设置昵称、邮箱和密码，一次完成账号创建与加入 |
| 修改名字、恋爱日期或密码 | `/settings`（我们），在对应弹窗中修改 |
| 管理账号或添加另一对情侣 | 独立管理员登录 `/admin` 创建成员；未配对成员登录后创建自己的空间，再邀请或由管理员绑定第二位成员 |
| 开始麻将 | 首页「麻将室」或 `/mahjong`，选择三人／四人、东风／半庄并创建牌桌 |

网站没有公共注册入口。已配置账号直接登录；受邀成员通过邀请加入。每个生活空间最多两人，增加另一对情侣应创建另一个空间。

麻将房主把 **8 位房间码**分享给朋友，朋友登录后输入房间码加入；人数不足时可选择「电脑补齐空位」。真人准备后，由房主开始牌局。电脑不需要另建账号。三麻拔北后，北牌会公开显示在席位区域，并保留拔北数量；各类操作按钮只在当前可以执行时出现。本机 `127.0.0.1` 的预览和邀请只能在当前电脑使用，跨设备需要共同可访问的部署地址。

## 麻将室

三人桌与四人桌都能加入真人或用电脑补位。三麻移除二至八万，支持拔北；四麻使用固定版本的 `@kobalab/majiang-core`，三麻规则和计分由本项目适配。

- **牌桌呈现**：共享透视相机、实体牌与副露、牌河、拔出的北牌和计数、宝牌指示、可切换的三款原创织物桌布。
- **出牌与操作**：桌面悬停预选后点击、触屏二次点按、拖牌出牌、键盘操作；吃、碰、杠、拔北、立直、自摸、荣和与跳过按当前合法选择显示，鸣牌选项包含对应牌面。
- **动作反馈**：真实起手牌序、开局分批发牌与线性理牌、摸牌和弃牌动效、鸣牌与和牌宣告、书法字体、原创提示音与固定日语语音、静音控制。
- **结算**：役种、符翻、逐席详情与收支、多人荣和、终局排名；下一局重置自动操作状态。
- **电脑补位**：有预算限制的规则算法，在隔离 worker 中计算，不运行大语言模型，不依赖云端推理服务。

麻将服务按需启动，牌局只保存在内存中，服务重启后不恢复。生活记录、账号与照片仍独立持久化。外部连接走网站的 HTTP／Socket.IO 入口，内部麻将端口不直接开放到公网。

杭州麻将、四川麻将尚未实现。当前视觉使用原创或有许可证的素材；目标是接近成熟麻将产品的体验，完整参考音画、真实 Android 和部分网络故障验收仍在推进。详见[麻将进度与未完成项](docs/mahjong-fidelity-progress.md)。

### 牌桌怎么操作

| 操作 | 当前行为 |
| --- | --- |
| 桌面出牌 | 悬停预选后点击；也可在「便捷操作」开启二次点击确认 |
| 手机出牌 | 首次点按抬牌，再次点按确认；也可把牌拖出手牌区 |
| 吃／碰／杠 | 仅在有合法机会时显示，选项直接呈现组成副露的牌面 |
| 立直／自摸／荣和 | 根据当前手牌、役和规则显示；没有按钮时代表当前服务端未提供该操作 |
| 三麻拔北 | 有合法机会时出现，拔出的北牌和数量保留在自己的席位区域 |
| 横屏 | 手机触屏竖屏时自动横向显示；仍可进入全屏，手动旋转后恢复自然横屏 |
| 桌布和声音 | 选择海夜／暮紫／石墨桌布，按需开关声音；偏好保存在当前浏览器 |

开局采用实际起手牌序分批发牌，再完成理牌、庄家末张分隔和宝牌显示。开启桌布双击快捷操作后，开局理牌完成时会打出视觉最右侧的牌；自动摸切也使用同一视觉末张；普通摸牌时打出独立摸牌，存在和牌或特殊自操作机会时保留原优先级。真实摸牌身份和服务端合法选择保留。参考客户端的开局摸切标记语义仍待核对，见[本轮验收](docs/mahjong-opening-auto-acceptance.md)。

## 从另一台设备继续开发

完整的[开发接手指南](docs/development-handoff.md)包含数据库准备、账号初始化、代码地图、测试入口、生产环境约定和后续待办。

克隆后的仓库根目录就是应用目录，**无需再进入 `couple-home/`**。需要 **Node.js 24+、npm、Git、PostgreSQL 18**。备份恢复工具还需要同主版本的 `pg_dump` 与 `pg_restore`。不要复制另一台电脑的 `node_modules`。

```sh
git clone https://github.com/maxma615/yougui-couple-home.git
cd yougui-couple-home
npm ci --cache .local/npm-cache
cp .env.example .env.local
```

先创建自己的空开发数据库和附件目录，再编辑 `.env.local`。已有 PostgreSQL 时使用自己的空数据库；使用 Docker 时可先运行以下命令：

```sh
cp .env.compose.example .env
# 编辑 .env，设置独立开发用 POSTGRES_PASSWORD（建议随机十六进制）。
docker run -d --name yougui-dev-db --env-file .env -e POSTGRES_USER=couple_home -e POSTGRES_DB=couple_home -p 127.0.0.1:55432:5432 -v yougui_dev_pg:/var/lib/postgresql postgres:18
docker exec yougui-dev-db pg_isready -U couple_home -d couple_home
mkdir -p .local/attachments
```

等待就绪检查成功后，将 `.env.local` 的 `DATABASE_URL` 设置为 `postgresql://couple_home:你的开发密码@127.0.0.1:55432/couple_home`，将 `ATTACHMENTS_DIR` 设置为刚创建目录的绝对路径。Windows 可使用 `C:/yougui-data/attachments` 并自行创建目录；终端语法见[接手指南](docs/development-handoff.md#从空设备开始)。`npm run pg:start` 依赖旧开发机的本地二进制，不是跨设备安装入口。

编辑 `.env.local`：

| 变量 | 本地配置 |
| --- | --- |
| `DATABASE_URL` | 自己的空开发数据库连接字符串 |
| `SESSION_SECRET` | 独立随机密钥，至少 32 字符 |
| `APP_ORIGIN` | `http://127.0.0.1:3000` |
| `ATTACHMENTS_DIR` | 已创建的本机绝对附件目录 |
| `MAHJONG_PORT` | 默认内部端口 `3100`，冲突时换空闲端口 |

随机密钥可在本机生成，再填入 `.env.local`：

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

然后初始化并启动：

```sh
npm run migrate
npm run init-admin -- --email developer@example.com --display-name 开发成员
npm run dev
```

按终端提示输入 12–128 字符的密码，打开 `http://127.0.0.1:3000` 登录并创建空间。`init-admin` 是历史命名，创建的是首位普通成员；第二人通过邀请加入。独立管理员和手机号测试账号的配置方式见[接手指南](docs/development-handoff.md)。密码、环境文件和真实用户资料不进入代码仓库。

### 账号初始化怎么选

| 场景 | 操作 |
| --- | --- |
| 只想先运行网站 | `init-admin` 创建首位普通成员，登录后创建空间，通过邀请加入第二人 |
| 需要独立管理员和手机号登录 | 先完成首位成员建空间，再按[账号配置说明](docs/development-handoff.md#从空设备开始)用 `provision-accounts` 的标准输入配置；该命令会绑定两位成员并创建管理员 |
| 已有管理员，增加另一对情侣 | 在 `/admin` 创建成员，由首位成员建新空间，再邀请或绑定第二位成员 |

独立管理员和普通成员是不同身份。README 不提供生产密码或通用默认账号。

### 开发时常见问题

| 问题 | 检查 |
| --- | --- |
| 启动时报数据库连接错误 | 数据库是否运行、连接串是否正确、开发账号是否有建库及迁移权限 |
| 照片上传失败 | `ATTACHMENTS_DIR` 是否为本机绝对路径且可写；默认单文件上限 10 MiB，接受 JPEG／PNG／WebP |
| 找不到注册页面 | 网站采用受控账号与邀请加入，首次账号通过终端初始化 |
| 另一台手机打不开本地地址 | 默认开发服务监听 `127.0.0.1`；跨设备使用部署地址，邀请地址由 `APP_ORIGIN` 决定 |
| 麻将服务启动失败 | 检查内部 `MAHJONG_PORT` 是否占用；不要直接把它开放到公网 |

## 技术栈

| 层 | 当前选择 |
| --- | --- |
| 页面与服务端 | Next.js 16 App Router、React 19、TypeScript |
| 数据与附件 | PostgreSQL 18、Drizzle ORM、独立附件目录、Sharp 图片处理 |
| 账号 | Argon2 密码哈希、服务端会话、手机号／邮箱登录 |
| 实时通信 | 生活空间 SSE；麻将 HTTP 与 Socket.IO |
| 麻将规则 | `@kobalab/majiang-core` 1.4.1；本项目的三麻适配与计分 |
| 电脑玩家 | 规则策略与独立 worker，限制计算预算 |
| 运行与发布 | Node.js 24+、Docker Compose、Caddy HTTPS |
| 验证 | Vitest、Testing Library、Playwright、独立原生浏览器脚本 |

依赖的确切版本以 `package.json` 和 `package-lock.json` 为准。麻将采用浏览器 DOM／CSS 呈现，代码集中在 `src/components/mahjong/` 和 `src/app/mahjong/`。

## 项目结构

```text
src/app/                 页面与 HTTP API
src/components/          界面组件，含麻将牌桌
src/modules/             账号、空间、生活记录、照片与麻将领域逻辑
src/modules/mahjong/     规则、计分、房间、按需进程和电脑算法
src/lib/                 数据库、鉴权、事件与通用基础设施
src/cli/                 迁移、账号配置、附件清理与维护命令
db/migrations/           按序执行的 PostgreSQL 迁移
tests/                   单元、组件、集成、E2E 与原生浏览器验证
public/                  原创／授权的图片、牌面、字体和音频
deploy/                  ECS、IP HTTPS 和运维配置
docs/                    设计、开发交接、验收与发布记录
```

生活空间与麻将各自管理数据和生命周期，与研笺学术工作台独立运行。无需接入学术应用、飞书或外部日历。

## 自托管部署

仓库提供 `compose.yml`、`Dockerfile` 和 Caddy 配置。通用域名部署需要 Docker Compose、指向服务器的域名和 80／443 端口：

```sh
cp .env.compose.example .env
# 填写 APP_DOMAIN、APP_ORIGIN，并分别生成 POSTGRES_PASSWORD 和 SESSION_SECRET。
docker compose up -d --build
docker compose exec app npm run init-admin -- --email developer@example.com --display-name 首位成员
```

浏览器请求由 Caddy 转发到 Next.js，账号和生活记录保存在 PostgreSQL，照片保存在附件卷；需要打牌时，应用启动内部麻将子进程并管理电脑 worker。网站启动不要求麻将服务常驻。

```mermaid
flowchart LR
  browser[手机 / 电脑浏览器] --> caddy[Caddy HTTPS]
  caddy --> app[Next.js 网站]
  app --> db[(PostgreSQL)]
  app --> photos[(照片附件卷)]
  app --> mahjong[按需麻将进程]
  mahjong --> bots[电脑算法 worker]
```

数据库与附件使用独立持久化卷。当前个人实例采用上海 ECS 和 IP HTTPS，配置入口为 `deploy/compose.ip.yml`、`deploy/Caddyfile.ip`；它与通用域名部署有差异，不能只换地址照搬。

[运维手册](docs/operations.md)记录部署和维护能力，[ECS 发布记录](docs/ecs-deployment.md)记录实际环境。**当前自用实例已按用户要求关闭备份**，以 [AGENTS.md](AGENTS.md) 和[禁备份约定](docs/2026-10-07-backups-disabled.md)为准；旧文档的备份记录属于历史，不表示应重新开启。

## 后续开发

| 方向 | 当前状态 |
| --- | --- |
| 开局发牌与理牌 | 真实起手顺序、完整 14 张理牌、视觉末张分隔和 200 ms 材质入场已发布；桌布双击及自动摸切选视觉末张均已发布；参考开局摸切标记语义仍待核对 |
| 麻将视觉与交互 | 已有实体牌、副露、牌桌、宣告与结算；200 ms 线性入场材质与相对高度已发布，完整视觉与真机体验仍继续对齐 |
| 设备与网络 | 竖屏、点按、弹窗已有两浏览器验证，触摸拖牌已有 Chromium 验证；真实 Android 与生产认证 WSS 故障仍待验收 |
| 更多麻将规则 | 杭州、四川麻将尚未实现 |

具体剩余项与版本证据以[麻将进度](docs/mahjong-fidelity-progress.md)为准。接手时从 `main` 建自己的开发分支，按本次变更范围复跑检查。

仓库 `main` 保存可接手的代码、迁移、素材、测试与部署配置。克隆代码后需要自行准备开发数据库和账号；生产生活记录、照片和运行中的牌局不会随 GitHub 同步。完成变更并验证后提交、普通推送；网站发布另行执行，运行版本以最新发布验收为准。

## 验证状态

以下记录对应**已发布版本**，不混入本地未提交改动的测试数量。

截至 2026-10-10，最新运行代码 `4a238f0` 已完成以下实际检查；之后的 README 与交接文档提交不改变网站运行代码。

| 范围 | 结果 |
| --- | --- |
| 完整单元／组件／集成检查 | 1246 项，106 文件通过 |
| 本轮原生浏览器与联机场景 | 274 场景通过 |
| 类型、生产构建、构建秘密扫描 | 通过 |
| ECS 同镜像受限 Linux 检查 | 831 项，50 文件通过 |
| 发布后文件与公网资源 | 源码／构建摘要一致，145 项资源核验，健康接口 200 |
| GitHub 干净克隆（`c7123f7` 历史版本） | 全新依赖安装、类型检查、生产构建和秘密扫描通过；未对 `4a238f0` 重新执行干净克隆验证 |

这些结果有各自的测试环境与范围，不能替代真实 Android、所有 Windows 开发流程或生产认证 WSS 故障验收。详见[竖屏回退发布](docs/mahjong-portrait-fallback-acceptance.md)及[交接复核](docs/development-handoff.md)。

常用检查：

```sh
npm test
npm run typecheck
npm run build
npm run check:secrets
# 安装浏览器后再执行 E2E，路径配置见接手指南。
npm run test:e2e
```

数据库测试需要独立开发数据库和创建测试库权限。`tests/browser/*.tsx` 中的原生视觉／联机脚本是单独入口，不由 `npm test` 自动运行。

## 进一步阅读

- [手机竖屏回退、拖牌坐标与弹窗](docs/mahjong-portrait-fallback-acceptance.md)
- [开发交接、代码地图与本地配置](docs/development-handoff.md)
- [整站电影感界面重构](docs/cinematic-redesign-acceptance.md)
- [管理员与手机号账号](docs/admin-phone-acceptance.md)
- [管理员相册](docs/admin-albums-acceptance.md)
- [麻将功能进度与待办](docs/mahjong-fidelity-progress.md)
- [首局音频验收与上线](docs/mahjong-lobby-audio-acceptance.md)
- [开局线性材质与落位](docs/mahjong-deal-arrival-acceptance.md)
- [开局自动摸切选择视觉末张](docs/mahjong-opening-auto-acceptance.md)
- [开局双击桌布选择视觉末张](docs/mahjong-opening-last-shortcut-acceptance.md)
- [完整 14 张起手理牌](docs/mahjong-full-opening-rack-acceptance.md)
- [真实起手牌序与理牌位移](docs/mahjong-initial-deal-acceptance.md)
- [分批发牌与开局呈现](docs/mahjong-round-opening-acceptance.md)
- [部署运维](docs/operations.md)

## License

项目源码采用 [MIT](LICENSE)。第三方依赖、字体、牌面和音频模型相关内容按各自许可证使用，声明保留在 `public/licenses/`。公开代码不包含私人照片、业务数据库、账号密码或生产环境密钥。
