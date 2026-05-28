# AGENTS.md – Spark Todo 工单系统台账生成器

## 项目概述

Spark Todo 是一个用于个人/团队工作台账管理的桌面应用，支持**日常工作**和**非日常工作**两类事务的分类、跟踪、填报与导出。应用基于 Electron 构建，使用 Excel 文件（`.xlsx`）作为本地数据库，无需外部服务依赖，适合内网环境部署。

---

## 技术栈

| 角色       | 实现                                         |
| ---------- | -------------------------------------------- |
| 运行时     | Electron 28 (Node.js)                        |
| 前端       | 原生 HTML / CSS / JS (可以有框架，但运行时不可依赖外部 CDN)    |
| 数据库     | Excel `.xlsx` (via `xlsx` npm 包)            |
| 导出       | `xlsx` npm 包                                |
| 打包分发   | electron-builder                             |

---

## 项目结构

```
spark-todo/
├── main.js          # Electron 主进程：窗口创建 + IPC 调度
├── preload.js       # contextBridge API 暴露给渲染进程
├── db.js            # Excel 文件读写层（模拟 CRUD 数据库）
├── export.js        # 台账导出逻辑（按年月分 Sheet）
├── index.html       # 前端 UI（弹窗、卡片、Tab）
├── renderer.js      # 前端交互逻辑（DOM 操作、数据渲染）
├── styles.css       # 样式（CSS Variables、动画）
├── package.json     # 依赖与构建配置
├── data/            # 运行时生成的 Excel 数据库文件
│   └── todo.xlsx
└── assets/          # 图标等静态资源
```

---

## 架构说明

### 数据流

```
renderer.js (UI层)
    ↓ 通过 preload.js 暴露的 electronAPI
main.js (IPC 调度)
    ↓ 按 handler 路由
db.js (数据层: ExcelDB 类)
    ↓ xlsx 读写
data/todo.xlsx (Excel 文件)
```

### 核心类

#### `ExcelDB` (db.js)
- **职责**: 将 Excel 的 5 个 Sheet 当作关系型数据库的表来操作
- **Sheet 结构**:
  - `meta` – 键值对元数据（自增 ID 计数器等）
  - `categories` – 事务分类（id, name, is_routine, sort_order, created_at）
  - `tasks` – 任务主表（id, category_id, title, description, status, progress, is_routine, created_at, started_at, completed_at）
  - `stages` – 非日常任务的阶段记录（id, task_id, stage_index, note, progress_value, created_at, updated_at）
  - `routine_records` – 日常工作的月度填报记录（id, task_id, year_month, quantity, filled_at）
- **关键方法**: `getCategories`, `addCategory`, `getTasks`, `getTaskById`, `addTask`, `updateTask`, `deleteTask`, `addStage`, `fillRoutine`, `checkRoutineUnfilled`, `getExportData`

#### `Exporter` (export.js)
- **职责**: 将任务数据按年月分 Sheet 导出为标准台账 Excel
- **关键逻辑**:
  - 日常工作: 每月一行，包含分类、任务名、描述、填报数量
  - 非日常工作: 每阶段一行，支持**跨月延续**（若阶段跨月，下月保留上月最后一条进度，标记 `[跨月延续]`）
  - 导出列: 分类、任务名称、文本描述、段号、阶段备注(更新内容)、任务接收时间(创建时间)、开始时间、阶段更新时间、结束时间、完成度%、状态

---

## 功能清单

### 1. 事务分类管理
- 预设分类: "日常工作"、"其他工作"
- 支持**动态添加/删除**分类（Tab 栏可配）
- 分类可标记为 `is_routine`（日常工作型）或 `is_routine=0`（普通 TODO 型）
- 在 Tab 间切换时加载对应分类的任务列表

### 2. 任务管理
| 特性           | 日常工作 (`is_routine=1`)                        | 非日常工作 (`is_routine=0`)                     |
| -------------- | ------------------------------------------------ | ----------------------------------------------- |
| 状态流转       | 始终为"日常工作"状态，不会被"完成"              | 已创建(0%) → 进行中 → 已完成(100%)              |
| 进度管理       | 每月填报数量                                     | 多阶段迭代，每增一阶段自动重算百分比             |
| 生命周期       | 每月刷新，永不过期                               | 传统 TODO 生命周期                               |
| 创建时间       | 记录创建时间，但不会标记为完成                   | 记录创建/开始/阶段更新/结束时间                   |

### 3. 阶段迭代（非日常工作核心功能）
- 支持**多段任务**：每次迭代添加一个新阶段，阶段号递增
- **自动切分完成度**: 添加新阶段后，总百分比 100% 均分给各阶段（余数归最后一段）
- 每阶段关联一条**状态备注**
- 阶段列表**按时间倒序**展示（最新在上）
- 支持**直接完成**: 跳过迭代，直接标记 100%

### 4. 日常工作填报与提醒
- 每月自动出现在列表中，可填写数量
- **上月未填报提醒**: 启动时检测上月是否有未填报项，弹窗提示并引导补填
- 补填后刷新到当月（`fillRoutine` 支持指定 yearMonth）
- 不会被标记为"已完成"，每月刷新

### 5. 自动置顶
- 列表按 `status !== 'completed'` 置顶，已完成任务沉底
- 同组内按创建时间倒序

### 6. 文本描述/备注字段
- `tasks.description` 字段，支持富文本思路记录
- 可用于: STAR 原则总结、资源求助备忘、年终总结素材积累
- 在模态窗口中自动保存（2秒 debounce）

### 7. 删除任务
- 支持**级联删除**: 删除任务时自动清除关联的阶段记录和填报记录
- 操作有确认弹窗

### 8. 台账导出
- 文件保存对话框选择路径
- 按**年月自动分 Sheet** 导出
- 日常工作每月一行；非日常工作每阶段一行
- **跨月延续**: 若任务阶段跨越多月，在各月 Sheet 中保留该阶段的最后状态（标记 `[跨月延续]`）
- 导出列涵盖全部时间维度：接收时间、开始时间、阶段更新时间、结束时间

---

## 开发指南

### 启动开发环境

```bash
npm install
npm start
```

### 数据文件位置

- 开发环境: `./data/todo.xlsx`
- 生产环境: Electron `userData` 目录

### 技术约束

- **无外部 CDN**: 前端不依赖任何外部 CSS/JS 资源，所有样式和脚本均为本地文件
- **纯离线**: Excel 数据库在本地文件系统，无需网络
- **安全隔离**: `contextIsolation: true`, `nodeIntegration: false`，通过 `preload.js` 的 `contextBridge` 安全暴露 API

### 代码约定

- **UI 层** (`renderer.js`): 使用原生 DOM API，无框架依赖；`$` 函数是 `document.getElementById` 的简写
- **数据库层** (`db.js`): 使用 `_sheetToJson` 将 Sheet 转为二维数组，`_replaceSheet` 重写整个 Sheet；每次写操作后调用 `this.save()`
- **导出层** (`export.js`): 基于 `xlsx.utils.book_new()` / `aoa_to_sheet()` / `book_append_sheet()` 构建多 Sheet 工作簿
- **IPC 通道**: 所有 `ipcMain.handle` 注册在 `main.js`，使用 `safeHandler` 包装器统一错误处理；`preload.js` 统一暴露给渲染进程

### 添加新功能

1. **新数据字段**: 修改 `db.js` 对应 Sheet headers 和方法
2. **新 IPC 接口**: 在 `main.js` 添加 `ipcMain.handle`，在 `preload.js` 添加对应方法
3. **新 UI**: 在 `index.html` 添加结构，`renderer.js` 添加逻辑，`styles.css` 添加样式
4. **新导出逻辑**: 在 `export.js` 的 `_exportXxxRow` 方法族中扩展

---

## 需求蓝图（目标状态）

以下需求为项目的目标形态，当前部分已实现（标记 ✅），部分待开发：

- ✅ 事务分类（可配置 Tab，可点击新增）
- ✅ 弹窗展示当前进度，支持多次迭代更新
- ✅ 阶段自动切分完成度百分比
- ✅ 阶段按时间倒序展示
- ✅ 状态流转（已创建 → 进行中 → 已完成）
- ✅ 允许直接完成
- ✅ 多段任务每段作为一条导出
- ✅ 跨月保留上月最后一条进度
- ✅ 日常工作每月自动添加、可填报数量
- ✅ 上月未填报提醒
- ✅ 删除任务
- ✅ 自动置顶未完成任务
- ✅ 文本描述/备注字段（STAR 总结等）
- ✅ Excel 配置作为数据库
- ✅ 自动归集创建/开始/阶段更新/结束时间
- ✅ 导出按年月区分 Sheet
- ✅ 纯内网可运行，无外部 CDN 依赖
