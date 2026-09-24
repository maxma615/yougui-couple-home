# 本地实现接口契约

规格是行为权威，本文件用于并行实现的接口协作；所有 API 使用同源 Cookie 会话、JSON 错误响应，禁止信任客户端 homeId。

## 基础模块

- `src/lib/config.ts`: `loadConfig(env = process.env)`，返回 `databaseUrl, sessionSecret, appOrigin, attachmentsDir, maxUploadBytes, maxImagePixels, production`。
- `src/lib/db.ts`: `pool: pg.Pool`、`db: NodePgDatabase`、`transaction<T>(fn: (tx: PoolClient)=>Promise<T>): Promise<T>`；不在模块载入时打开网络连接。
- `src/lib/errors.ts`: `AppError(status, code, message, fields?, current?)`；统一响应 `{error:{code,message,fields?,current?}}`；不输出内部 SQL/堆栈/路径。
- `src/lib/auth-context.ts`: `requireSession(request): Promise<{userId:string}>`, `requireHomeMember(request): Promise<{userId:string,homeId:string}>`。
- `src/lib/events/publisher.ts`: `publishHomeEvent(tx,{homeId,type,resourceId,action,version})`，数据库事件记录与业务共用事务。
- 初始核心表列采用 snake_case：users(id uuid,email text unique,display_name text,password_hash text,created_at timestamptz)；homes(id uuid,name text,start_date date,version int,created_at,updated_at)；home_members(home_id,user_id unique,slot int check 1..2,primary key(home_id,user_id),unique(home_id,slot))；sessions(token_hash text primary key,user_id,expires_at,created_at)。
- `db/migrations/*.sql` 按文件名排序，记录校验和，事务迁移。后续任务自己新增迁移；不回写已应用迁移。
- 测试使用真实 PostgreSQL 隔离数据库（名字 ch_ 开头）或独立 schema；不得清空开发库。测试工具位于 tests/helpers/。

## 页面 API

所有日期字符串 `YYYY-MM-DD`，所有时刻 ISO 8601，所有资源 id UUID，所有编辑/删除带 version。响应为直接对象，列表为 `{items:[...]}`。409 的最新记录在 `error.current`。

| 路径 | 方法与输入 | 返回 |
| --- | --- | --- |
| /api/auth/login | POST {email,password} | {ok:true} + Cookie |
| /api/auth/logout | POST {} | {ok:true} + 清 Cookie |
| /api/auth/password | POST {currentPassword,newPassword} | {ok:true} + 轮换 Cookie |
| /api/session | GET | {user:{id,email,displayName},home:Home或null} |
| /api/home | GET / POST {name,startDate,displayName} / PATCH {name,startDate,members:[{id,displayName}],version} | Home |
| /api/invites | POST {} | {token,expiresAt}；默认24小时 |
| /api/invites/[token] | GET / POST {email,displayName,password} | 最小展示 {homeName,inviterName} / {ok:true} + Cookie |
| /api/anniversaries | GET / POST {title,date,note,yearly} | {items} / Anniversary |
| /api/anniversaries/[id] | GET / PATCH {同字段,version} / DELETE {version} | Anniversary / {ok:true} |
| /api/todos | GET / POST {title,description,assigneeId,dueDate,completed} | {items} / Todo |
| /api/todos/[id] | GET / PATCH {同字段,version} / DELETE {version} | Todo / {ok:true} |
| /api/moments | GET / POST {title,date,body} | {items} / Moment |
| /api/moments/[id] | GET / PATCH {同字段,version} / DELETE {version} | Moment / {ok:true} |
| /api/moments/[id]/photos | POST multipart(file,version) | {photo,version} |
| /api/photos/[id] | GET / DELETE {version:父点滴版本} | 鉴权图片 / {ok:true,version} |
| /api/events | GET SSE，支持 Last-Event-ID | event:change / event:reset；只有 id,type,resourceId,action,version |

Home={id,name,startDate,version,members:[{id,displayName}]}。
Anniversary={id,title,date,note,yearly,version,createdAt,updatedAt,createdBy,updatedBy}。
Todo={id,title,description,assigneeId:string或null（双方）,dueDate:string或null,completed,completedAt,version,createdAt,updatedAt,createdBy,updatedBy}。
Moment={id,title,date,body,photos:[{id,filename,mime,bytes}],version,createdAt,updatedAt,createdBy,updatedBy}。

小屋名称/标题最多120字符，成员显示名最多60，长正文最多20000；密码12–128字符；默认单张照片10MiB、最多40百万像素。所有限制服务端校验并给中文字段错误，文档说明可配置上传限制。

前端使用 `/home`, `/anniversaries`, `/todos`, `/moments`, `/settings`, `/login`, `/setup`, `/invite/[token]`。M2 再增加 `/calendar`。不创建生产示例数据。
