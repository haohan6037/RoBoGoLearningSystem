# RoBoGo 课程管理系统升级设计文档

- 文档版本：V1.0
- 编写日期：2026-08-10
- 关联需求：`RoBoGo_Learning_Portal_Upgrade_Requirements.md`
- 关联计划：`RoBoGo_Learning_Portal_Upgrade_Development_Plan.md`

## 1. 设计目标

本设计在现有 FastAPI、静态 HTML/CSS/JavaScript 和 SQLite/PostgreSQL 架构上增量升级。近期重点是建立清晰的信息架构和稳定的公共前端壳层；中期再拆分课程、权限和竞赛领域模型。

设计必须满足：

- 不牺牲现有课件和授课功能。
- 菜单与教师工作任务对应，而不是与数据库表对应。
- 常规课和竞赛课共享账号、班级、学生和课件基础能力，但保持各自业务记录独立。
- 工程笔记保留学生作者身份和明确发布控制。

## 2. 当前架构概述

### 2.1 前端

- 入口：`public/index.html`
- 页面逻辑：`public/js/app.js`
- 样式：`public/css/app.css`
- 形态：前端通过 `app.innerHTML` 重绘整页，教师菜单在多个渲染函数中重复。
- 导航：使用内存中的 `teacherView` 和 `href="#"`，没有稳定页面 URL。

### 2.2 后端

- FastAPI 单体应用：`backend/app/main.py`
- 数据访问：`backend/app/database.py`
- Pydantic 模型：`backend/app/models.py`
- 认证：本地 MVP 账号和内存会话。
- 数据库：PostgreSQL 为默认方向，SQLite 为本地回退。

### 2.3 当前核心实体

- User
- StudentProfile
- ClassGroup
- ClassMembership
- ClassSession
- Material
- MaterialStep
- SessionMaterialAssignment
- MaterialViewRecord
- AttendanceRecord

当前没有独立 Course、TeacherProfile、CompetitionSeason、StageAchievement 等主工作区实体。

## 3. 目标信息架构

```text
教师门户
├── 工作台
├── 系统设置
│   ├── 教师管理
│   ├── 班级管理
│   └── 学生管理
├── 常规课
│   ├── 课程管理
│   └── 授课
├── 竞赛课
│   ├── 队伍管理
│   ├── 工程笔记
│   └── 阶段成果展示
└── 课件管理
    ├── 课件库
    └── 3D课件制作
```

## 4. 前端设计

### 4.1 公共菜单配置

菜单必须由一份配置产生，不允许每个页面复制侧边栏 HTML。

建议结构：

```js
const teacherNavigation = [
  { id: "dashboard", label: "工作台", route: "/teacher/dashboard" },
  {
    id: "system",
    label: "系统设置",
    children: [
      { id: "teachers", label: "教师管理", route: "/teacher/settings/teachers" },
      { id: "classes", label: "班级管理", route: "/teacher/settings/classes" },
      { id: "students", label: "学生管理", route: "/teacher/settings/students" },
    ],
  },
  {
    id: "regular",
    label: "常规课",
    children: [
      { id: "courses", label: "课程管理", route: "/teacher/regular/courses" },
      { id: "teaching", label: "授课", route: "/teacher/regular/teaching" },
    ],
  },
  {
    id: "competition",
    label: "竞赛课",
    children: [
      { id: "teams", label: "队伍管理", route: "/teacher/competition/teams" },
      { id: "notebooks", label: "工程笔记", route: "/teacher/competition/notebooks" },
      { id: "achievements", label: "阶段成果展示", route: "/teacher/competition/achievements" },
    ],
  },
  {
    id: "materials",
    label: "课件管理",
    children: [
      { id: "library", label: "课件库", route: "/teacher/materials/library" },
      { id: "assembly", label: "3D课件制作", externalUrl: "http://localhost:3000" },
    ],
  },
];
```

### 4.2 公共页面壳层

建议提供：

```text
renderTeacherPortalShell
├── Brand/Header
├── GroupedNavigation
├── PageHeader
│   ├── Breadcrumb
│   ├── Title/Description
│   └── PageActions
├── NotificationArea
└── PageContent
```

页面渲染函数只返回自己的业务内容，不再负责侧边栏、顶部用户信息和退出按钮。

### 4.3 路由设计

第一阶段可使用 History API 或结构化 hash 路由，不要求立即引入前端框架。

最低要求：

- URL 唯一表示当前页面。
- 页面刷新可恢复当前视图。
- 前进、后退可切换页面。
- 菜单展开状态可以根据当前路由推导。
- 旧 `teacherView` 值提供兼容映射。

### 4.4 页面布局规范

#### 列表页

```text
页面标题 + 主操作
筛选栏
结果摘要
列表/表格
分页或空状态
```

#### 详情页

```text
返回路径 + 标题 + 状态
摘要区
页签：概览 / 课次 / 课件 / 考勤
上下文操作区
```

#### 授课页

```text
今日课程选择
当前课程标题及状态
阶段控制
├── 等待
├── 理论
└── 搭建
实时工作区
├── 学生/考勤
└── 当前阶段课件
```

### 4.5 视觉规范

#### 色彩与层级

- 主色：用于当前菜单、主操作和关键进度。
- 中性色：用于普通卡片、列表和辅助信息。
- 成功色：用于已完成、已签到和发布。
- 警告色：用于缺少课件、位置异常和待确认。
- 危险色：只用于取消、停用、删除和撤回。

#### 组件

- `PageHeader`
- `FilterBar`
- `DataTable` / `CompactCardList`
- `StatusBadge`
- `EmptyState`
- `ConfirmDialog`
- `DrawerForm`
- `Toast`
- `LoadingState`

#### 响应式

- 大屏：固定分组侧边栏。
- 平板：可折叠窄侧边栏或抽屉。
- 手机：顶部菜单按钮打开全屏/侧滑导航。
- 禁止在窄屏将完整侧边栏直接堆在页面内容之前。

## 5. 业务领域设计

### 5.1 系统设置领域

#### TeacherProfile（新增建议）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 教师资料 ID |
| user_id | string | 关联 User |
| display_name | string | 显示名称 |
| status | active/inactive | 启用状态 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

不建议继续只通过 `User.role == Teacher` 表达所有教师管理信息。

#### ClassGroup（调整）

保留：

- 班级名称
- 描述
- 状态
- 创建时间

逐步移出：

- weekday
- start_time
- end_time

这些字段应属于课程计划或排课规则。

### 5.2 常规课领域

#### Course（新增建议）

代表一个可持续安排课次的课程计划，而不是某天的一节课。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 课程 ID |
| name | string | 课程名称 |
| class_group_id | string | 授课班级 |
| teacher_id | string | 负责教师 |
| description | string | 课程说明 |
| status | draft/active/archived | 状态 |
| schedule_rule | object/string | 周期排课规则 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### ClassSession（保留并扩展）

- 新增 `course_id`。
- 保留具体日期、开始时间、结束时间和状态。
- 阶段继续使用 `not_started/theory/building`，但增加状态转换约束。

推荐状态转换：

```text
scheduled
  ├── completed
  └── cancelled

not_started → theory → building
```

阶段默认只允许向前转换。是否允许回退应成为显式业务规则，不由按钮随意调用通用更新接口。

### 5.3 竞赛课领域

工程笔记工作树中已有 Engineering Team、成员角色和笔记记录，集成时以现有已验证模型为源，不在本文重新发明一套不兼容模型。

建议领域关系：

```text
CompetitionSeason
└── EngineeringTeam
    ├── TeamMember
    ├── CompetitionSession
    ├── EngineeringRecord
    │   ├── MergeProposal
    │   ├── Confirmation
    │   └── PublishedEntry
    └── StageAchievement
```

#### StageAchievement（新增建议）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 成果 ID |
| season_id | string | 赛季 |
| team_id | string | 队伍 |
| stage | string | 阶段标识 |
| title | string | 标题 |
| description | string | 说明 |
| status | draft/published/withdrawn | 发布状态 |
| related_record_id | string/null | 关联工程笔记发布记录 |
| related_project_url | string/null | 关联 3D 项目或其他成果 |
| created_by | string | 创建人 |
| created_at | datetime | 创建时间 |
| published_at | datetime/null | 发布时间 |

附件建议使用独立关联表，避免一个成果只能保存一个文件。

### 5.4 课件领域

现有 Material、MaterialStep 和 SessionMaterialAssignment 继续保留。

建议改进：

- 页面术语统一为“课件”和“课件步骤”。
- 课件可以被常规课和竞赛课复用。
- 3D Assembly Project 通过稳定项目引用与课件关联，不直接复制浏览器本地模型数据。
- 课件删除继续使用软删除，历史课次关联必须可追溯。

## 6. API 设计建议

### 6.1 系统设置

```text
GET    /api/teacher/settings/teachers
POST   /api/teacher/settings/teachers
PUT    /api/teacher/settings/teachers/{teacher_id}
POST   /api/teacher/settings/teachers/{teacher_id}/activate
POST   /api/teacher/settings/teachers/{teacher_id}/deactivate
POST   /api/teacher/settings/teachers/{teacher_id}/reset-password

GET    /api/teacher/settings/classes
POST   /api/teacher/settings/classes/{class_id}/archive
DELETE /api/teacher/settings/classes/{class_id}/members/{student_id}

POST   /api/teacher/settings/students/{student_id}/activate
POST   /api/teacher/settings/students/{student_id}/deactivate
```

### 6.2 常规课

```text
GET    /api/teacher/regular/courses
POST   /api/teacher/regular/courses
GET    /api/teacher/regular/courses/{course_id}
PUT    /api/teacher/regular/courses/{course_id}
POST   /api/teacher/regular/courses/{course_id}/generate-sessions

GET    /api/teacher/regular/teaching/today
GET    /api/teacher/regular/sessions/{session_id}/classroom
POST   /api/teacher/regular/sessions/{session_id}/advance-phase
```

原有 API 在迁移期保持可用，由新 API 调用同一服务逻辑或提供兼容层。

### 6.3 竞赛课

工程笔记相关 API 以独立工作树现状为基础合并。新增阶段成果 API：

```text
GET    /api/teacher/competition/achievements
POST   /api/teacher/competition/achievements
GET    /api/teacher/competition/achievements/{achievement_id}
PUT    /api/teacher/competition/achievements/{achievement_id}
POST   /api/teacher/competition/achievements/{achievement_id}/publish
POST   /api/teacher/competition/achievements/{achievement_id}/withdraw
```

## 7. 权限设计

建议最小权限矩阵：

| 能力 | 管理员 | 教师 | 学生 |
|---|---:|---:|---:|
| 管理教师账号 | 是 | 否 | 否 |
| 管理班级和学生 | 是 | 授权范围 | 否 |
| 管理常规课程 | 是 | 授权范围 | 否 |
| 现场授课和手动签到 | 是 | 授权范围 | 否 |
| 管理竞赛队伍 | 是 | 授权范围 | 否 |
| 编辑个人工程笔记 | 否 | 否 | 是 |
| 查看学生工程笔记 | 是 | 只读 | 本人/队伍范围 |
| 发布队伍笔记 | 否 | 否 | Notebooker |
| 管理阶段成果 | 是 | 授权范围 | 视产品规则授权 |

当前本地 MVP 认证不能满足生产权限要求。权限阶段实施前必须单独确认管理员角色、教师负责范围和学生可见范围。

## 8. 数据迁移设计

建议迁移顺序：

1. 创建正式迁移机制及数据库备份。
2. 新增 TeacherProfile、Course 和新状态字段。
3. 为现有 ClassGroup 创建对应 Course，迁移星期和时间规则。
4. 为 ClassSession 回填 course_id。
5. 验证课次数量、课件关联和考勤记录数量不变。
6. 合并工程笔记工作树的竞赛表结构。
7. 新增 StageAchievement 及附件关联表。

迁移必须满足：

- 可重复执行。
- 中途失败可安全停止。
- 不删除原字段，直到新流程稳定并明确批准清理。
- 迁移前后输出记录数量和外键关联检查报告。

## 9. 状态与交互规则

### 9.1 课程状态

- `scheduled`：允许配置课件和进入授课。
- `completed`：只读查看总结、课件和考勤。
- `cancelled`：不进入今日授课，保留历史记录。

### 9.2 授课阶段

- Waiting：显示课程准备状态和预览信息。
- Theory：显示理论课件和考勤情况。
- Building：显示搭建课件和课堂执行信息。
- 阶段前进必须显示成功反馈。
- 失败时保留原状态，不显示虚假成功。

### 9.3 危险操作

- 删除课件、取消课程、停用账号、撤回成果必须二次确认。
- 确认框必须说明影响对象和是否可恢复。
- 可恢复操作优先使用停用、归档或软删除。

## 10. 可测试性设计

### 前端最小回归

- 菜单分组、展开、当前项高亮。
- URL 刷新和前进后退。
- Students、Classes、Sessions 旧入口兼容映射。
- 授课阶段只能按规则变化。
- 窄屏菜单可打开、选择和关闭。

### 后端最小回归

- 教师、学生、班级启停和权限。
- 课程计划生成课次。
- 课次关联课件和考勤不丢失。
- 工程笔记唯一性、持续编辑、确认、发布和导出。
- 阶段成果草稿、发布、撤回和权限。

### 浏览器关键路径

```text
教师登录
→ 工作台
→ 今日课程
→ 进入授课
→ 开始理论
→ 查看考勤和课件
→ 开始搭建
→ 完成课程
→ 查看课程详情和历史考勤
```

```text
学生登录
→ 选择竞赛课次
→ 编辑唯一工程笔记
→ 保存后继续编辑
→ 提议合并
→ 来源作者确认
→ Notebooker 发布
→ 导出 PDF
```

## 11. 兼容与回滚

- 第一阶段保留旧视图标识到新路由的映射。
- 后端 API 迁移期间保留现有端点。
- 数据迁移先新增后切换，不立即删除旧字段。
- 工程笔记集成前保存主工作区和独立工作树的明确提交/补丁点。
- 任一阶段验证失败时，只回滚该阶段文件和迁移，不触碰无关 Assembly Studio 改动。

## 12. 待确认设计决策

以下问题必须在对应开发阶段开始前确认：

1. “课程”是否必须成为独立实体，还是首版继续使用 ClassGroup 作为课程计划。
2. 是否需要独立管理员角色，还是暂由特定教师承担系统设置权限。
3. 教师能否跨班级查看学生和竞赛队伍。
4. 授课阶段是否完全禁止倒退，还是允许确认后倒退。
5. 阶段成果由教师发布、Notebooker 发布，还是两者均可。
6. Assembly Project 与课件的关联采用本地链接、导出快照还是后端持久化项目 ID。
