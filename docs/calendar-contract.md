# 共同日历实现契约（Task 9）

承接已确认规格 4.6，M1 本地验证闸门之后执行。无需外部日历/账号/学术端依赖。

## 公开数据与路由

`CalendarValues`：`title`（1–120）、`location`（默认空串，最多500）、`description`（默认空串，最多20000）、`allDay`、`start`、`end`。

- `allDay=true`：start/end 为 YYYY-MM-DD，结束日包含，允许同日。
- `allDay=false`：API输入必须包含 Z 或显式偏移；严格校验真实日期，返回统一 UTC ISO 字符串。比较实际时刻，结束不得早于开始，允许零时长。
- `CalendarEventDto` 追加 id/version/createdAt/updatedAt/createdBy/updatedBy，不暴露 homeId 或内部四个可空存储列。
- `/api/calendar` GET `{items}` / POST201；`/api/calendar/[id]` GET/PATCH/DELETE。PATCH/DELETE version和409 current遵循M1；homeId只能来自会话。
- 所有写入同事务发布 `calendar` 事件，使用已有维护锁。

## 存储

0005_calendar.sql 独立 calendar_events 表：date 类型 start_date/end_date、timestamptz 类型 start_at/end_at，由 all_day 和 CHECK保证恰好一组有效且顺序正确。切换类型时清空另一组。成员审计组合外键、home范围索引与版本规则同M1。

## 浏览器安全共享接口

- `src/modules/calendar/schema.ts`：CalendarValues/CalendarEventDto 类型；不得引入PG/config等服务器依赖。
- `src/modules/calendar/time.ts`：parseOffsetInstant(value):string、shanghaiDateTimeInput(instant):string、shanghaiInputToInstant(local):string、monthGrid(year,month):CalendarDay[]、eventOccursOnDate(event,date):boolean。
- CalendarDay `{date,inMonth}`，月份1–12，周一开始、42格。
- `src/modules/calendar/queries.ts`：eventsForDate(events,date)、upcomingEvents(events,now,limit=4)，均为纯浏览器安全选择器。
- `src/modules/calendar/service.ts`：createCalendarService(pool?)，list/get/create/update/remove 形状兼容已有资源路由。

日期时刻控件明确标示 Asia/Shanghai；datetime-local 输入不能使用浏览器默认时区解析。时区逆转换须回验，历史夏令时不存在/歧义的本地时间需明确拒绝。显式偏移的API时刻本身无歧义。

按天显示：全天包含两端；带时刻按[start,end)判断重叠，午夜结束不占第二天，零时长显示在开始日。选中日先全天后按开始时刻，最后ID稳定排序。首页近期事项包括正在进行的事件，排除已结束事件。

## 所有权与验收

后端负责schema/time/queries/service、0005迁移、API、calendar-time与calendar API测试；UI负责calendar页面/表单/月视图、导航、首页摘要与calendar E2E。根负责HTTP权限矩阵扩展、持久化/备份回归、完整闸门与文档。

覆盖：跨月全天/闰日、实际时刻顺序、DST回拨1:30-04:00到1:15-05:00有效、春季跳时差45分钟、无偏移与无效日期拒绝、午夜结束、零时长、非上海浏览器、切换类型清空列、跨屋/CSRF/409、SSE、备份保留两种事件及版本审计。

实现边界补充：日历自身支持0002-01-01至9998-12-31，API、月导航与控件共用time.ts常量；42格边缘日期仍是合法四位日期，超日历范围的相邻格禁用。不改变M1纯日期函数的范围。API保留秒/毫秒；分钟级控件在用户未改时间时保留原时刻，避免仅修改标题造成时间截断。
