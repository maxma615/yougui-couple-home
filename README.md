<div align="center">

# 有归 · 情侣空间

**把两个人的日常留下来，也约朋友一起打一局。**

深色电影感的自托管生活空间，包含照片、日历、纪念日、共同待办，以及日本麻将联机。

[如何使用](#使用入口) · [开发接手](docs/development-handoff.md) · [麻将进度](docs/mahjong-fidelity-progress.md) · [部署运维](docs/operations.md) · [MIT License](LICENSE)

![Node.js](https://img.shields.io/badge/Node.js-24%2B-43853D?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-111111?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-B75B72)

<img src="docs/screenshots/cinematic-login-desktop.png" alt="有归深色电影感登录界面" width="100%" />

<sub>截图来自隔离测试环境，使用合成账号和内容；界面预览记录于 2026-10-05，后续功能持续迭代。</sub>

</div>

## 现在的有归

有归已经从双人记录工具发展为带管理员面板和麻将室的情侣空间。一个部署可以容纳多对情侣，每个生活空间仍只属于两位成员；相册和生活记录按空间隔离。麻将室独立于空间成员关系，来自不同空间的朋友可以坐在同一张牌桌上。

项目提供可自行部署的完整源码。当前有个人使用的 ECS 实例，不提供公共注册或共享演示账号。仓库 `main` 是继续开发的入口，生产运行版本另见发布记录。

| 部分 | 已有功能 |
| --- | --- |
| 情侣空间 | 深色首页、恋爱天数、近期安排、纪念日、共同待办、全天与定时日历 |
| 点滴与照片 | 记录新增和编辑、照片上传、相册和大图查看、鉴权读取、附件清理 |
| 账号与配对 | 手机号或邮箱加密码登录、修改密码、限时一次性邀请、双人成员绑定 |
| 管理员 | 独立管理员账号、成员账号与密码管理、启停账号、空间空位绑定、跨空间相册只读 |
| 实时协作 | 修改通知、断线回退、并发版本检查与冲突草稿保留 |
| 日本麻将 | 四人麻将、标准三麻、真人联机、电脑补位、东风／半庄 |

管理员不占双人空间名额。普通成员不能访问其他空间的生活内容；管理员相册能力是独立的只读入口。

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

麻将房主把 **8 位房间码**分享给朋友，朋友登录后输入房间码加入；人数不足时可选择「电脑补齐空位」。真人准备后，由房主开始牌局。电脑不需要另建账号。本机 `127.0.0.1` 的预览和邀请只能在当前电脑使用，跨设备需要共同可访问的部署地址。

## 麻将室

三人桌与四人桌都能加入真人或用电脑补位。三麻移除二至八万，支持拔北；四麻使用固定版本的 `@kobalab/majiang-core`，三麻规则和计分由本项目适配。

- **牌桌呈现**：共享透视相机、实体牌与副露、牌河、拔出的北牌和计数、宝牌指示、可切换的三款原创织物桌布。
- **出牌与操作**：点选／双击、拖牌出牌、键盘操作；吃、碰、杠、拔北、立直、自摸、荣和与跳过按当前合法选择显示，鸣牌选项包含对应牌面。
- **动作反馈**：真实起手牌序、开局分批发牌与线性理牌、摸牌和弃牌动效、鸣牌与和牌宣告、书法字体、原创提示音与固定日语语音、静音控制。
- **结算**：役种、符翻、逐席详情与收支、多人荣和、终局排名；下一局重置自动操作状态。
- **电脑补位**：有预算限制的规则算法，在隔离 worker 中计算，不运行大语言模型，不依赖云端推理服务。

麻将服务按需启动，牌局只保存在内存中，服务重启后不恢复。生活记录、账号与照片仍独立持久化。外部连接走网站的 HTTP／Socket.IO 入口，内部麻将端口不直接开放到公网。

杭州麻将、四川麻将尚未实现。当前视觉使用原创或有许可证的素材；目标是接近成熟麻将产品的体验，完整参考音画、真实 Android 和部分网络故障验收仍在推进。详见[麻将进度与未完成项](docs/mahjong-fidelity-progress.md)。

## 从另一台设备继续开发

完整的[开发接手指南](docs/development-handoff.md)包含数据库准备、账号初始化、代码地图、测试入口、生产环境约定和后续待办。

需要 **Node.js 24+、npm、Git、PostgreSQL 18**。备份恢复工具还需要同主版本的 `pg_dump` 与 `pg_restore`。不要复制另一台电脑的 `node_modules`。

```sh
git clone https://github.com/maxma615/yougui-couple-home.git
cd yougui-couple-home
npm ci --cache .local/npm-cache
cp .env.example .env.local
```

编辑 `.env.local`：

| 变量 | 本地配置 |
| --- | --- |
| `DATABASE_URL` | 自己的空开发数据库连接字符串 |
| `SESSION_SECRET` | 独立随机密钥，至少 32 字符 |
| `APP_ORIGIN` | `http://127.0.0.1:3000` |
| `ATTACHMENTS_DIR` | 已创建的本机绝对附件目录 |
| `MAHJONG_PORT` | 默认内部端口 `3100`，冲突时换空闲端口 |

然后初始化并启动：

```sh
npm run migrate
npm run init-admin -- --email developer@example.com --display-name 开发成员
npm run dev
```

按终端提示输入密码，打开 `http://127.0.0.1:3000` 登录并创建空间。`init-admin` 是历史命名，创建的是首位普通成员；第二人通过邀请加入。独立管理员和手机号测试账号的配置方式见[接手指南](docs/development-handoff.md)。密码、环境文件和真实用户资料不进入代码仓库。

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

数据库与附件使用独立持久化卷。当前个人实例采用上海 ECS 和 IP HTTPS，配置入口为 `deploy/compose.ip.yml`、`deploy/Caddyfile.ip`；它与通用域名部署有差异，不能只换地址照搬。

[运维手册](docs/operations.md)记录部署和维护能力，[ECS 发布记录](docs/ecs-deployment.md)记录实际环境。**当前自用实例已按用户要求关闭备份**，以 [AGENTS.md](AGENTS.md) 和[禁备份约定](docs/2026-10-07-backups-disabled.md)为准；旧文档的备份记录属于历史，不表示应重新开启。

## 验证状态

截至 2026-10-10，最新运行代码 `be7564e` 已完成以下实际检查；之后的 README 与交接文档提交不改变网站运行代码。

| 范围 | 结果 |
| --- | --- |
| 完整单元／组件／集成检查 | 1206 项，104 文件通过 |
| 本轮原生浏览器与联机场景 | 382 场景通过 |
| 类型、生产构建、构建秘密扫描 | 通过 |
| ECS 同镜像受限 Linux 检查 | 791 项，48 文件通过 |
| 发布后文件与公网资源 | 源码／构建摘要一致，145 项资源核验，健康接口 200 |
| GitHub 干净克隆（`c7123f7` 历史版本） | 全新依赖安装、类型检查、生产构建和秘密扫描通过；未对 `be7564e` 重新执行干净克隆验证 |

这些结果有各自的测试环境与范围，不能替代真实 Android、所有 Windows 开发流程或生产认证 WSS 故障验收。详见[真实起手牌序与理牌发布](docs/mahjong-initial-deal-acceptance.md)及[交接复核](docs/development-handoff.md)。

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

- [开发交接、代码地图与本地配置](docs/development-handoff.md)
- [整站电影感界面重构](docs/cinematic-redesign-acceptance.md)
- [管理员与手机号账号](docs/admin-phone-acceptance.md)
- [管理员相册](docs/admin-albums-acceptance.md)
- [麻将功能进度与待办](docs/mahjong-fidelity-progress.md)
- [首局音频验收与上线](docs/mahjong-lobby-audio-acceptance.md)
- [真实起手牌序与理牌位移](docs/mahjong-initial-deal-acceptance.md)
- [分批发牌与开局呈现](docs/mahjong-round-opening-acceptance.md)
- [部署运维](docs/operations.md)

## License

项目源码采用 [MIT](LICENSE)。第三方依赖、字体、牌面和音频模型相关内容按各自许可证使用，声明保留在 `public/licenses/`。公开代码不包含私人照片、业务数据库、账号密码或生产环境密钥。
