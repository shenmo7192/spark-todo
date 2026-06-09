/**
 * 模拟数据注入脚本 — 向当前 todo.xlsx 写入跨季度测试数据
 * 用法: node seed.js
 * 注意：会覆盖已有数据，请先备份 data/todo.xlsx
 */
const ExcelDB = require('./db');
const path = require('path');

const db = new ExcelDB(path.join(__dirname, 'data', 'todo.xlsx'));

// 清空现有数据（保留默认分类种子，但我们会重建）
const SHEETS = { meta: 'meta', categories: 'categories', tasks: 'tasks', stages: 'stages', routine_records: 'routine_records', carry_overs: 'carry_overs' };
const HEADERS = {
  meta: ['key', 'value'],
  categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at'],
  tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order'],
  stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
  routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
  carry_overs: ['task_id', 'year_month', 'carried_at']
};

for (const [name, headers] of Object.entries(HEADERS)) {
  db._replaceSheet(name, []);
}

// Helper
let nextCatId = 1, nextTaskId = 1, nextStageId = 1, nextRoutineId = 1;

function dateStr(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day || 1).padStart(2, '0');
  return `${year}-${m}-${d}T00:00:00.000Z`;
}

// ----- Categories -----
const cats = [
  { id: nextCatId++, name: '工作任务', is_routine: 0, sort_order: 0 },
  { id: nextCatId++, name: '日常工作', is_routine: 1, sort_order: 1 },
  { id: nextCatId++, name: '专项工作', is_routine: 0, sort_order: 2 },
];
const catRows = cats.map(c => [c.id, c.name, c.is_routine, c.sort_order, dateStr(2026, 1)]);
db._replaceSheet('categories', catRows);

// ----- Tasks (spread across Jan ~ Aug 2026) -----
const taskDefs = [
  // 工作任务 (cat 1) — 已完成，跨 Q1-Q2
  { id: nextTaskId++, cat: 1, title: '用户登录模块开发', desc: '实现 OAuth2.0 登录流程，包括 token 刷新。', status: 'completed', progress: 100, createdAt: '2026-01-15', completedAt: '2026-04-10', sort: 1 },
  // 工作任务 (cat 1) — 进行中，跨 Q2
  { id: nextTaskId++, cat: 1, title: '数据导出重构', desc: '将导出逻辑迁移到新架构，支持年度季度。', status: 'in_progress', progress: 60, createdAt: '2026-04-01', completedAt: null, sort: 2 },
  // 工作任务 (cat 1) — 进行中，跨 Q2-Q3
  { id: nextTaskId++, cat: 1, title: '性能优化专项', desc: '前端渲染性能优化，减少重绘。后端 SQL 查询索引优化。', status: 'in_progress', progress: 30, createdAt: '2026-05-10', completedAt: null, sort: 3 },
  // 工作任务 (cat 1) — 已创建（未开始），Q3
  { id: nextTaskId++, cat: 1, title: '单元测试覆盖率提升', desc: '将核心模块覆盖率从 40% 提升到 80%。', status: 'created', progress: 0, createdAt: '2026-07-20', completedAt: null, sort: 4 },

  // 专项工作 (cat 3) — 已完成，Q1
  { id: nextTaskId++, cat: 3, title: '安全审计整改', desc: '修复 OWASP Top 10 中扫描出的 3 处中危漏洞。', status: 'completed', progress: 100, createdAt: '2026-02-01', completedAt: '2026-03-15', sort: 1 },
  // 专项工作 (cat 3) — 进行中，跨 Q2-Q3
  { id: nextTaskId++, cat: 3, title: '微服务拆分', desc: '将单体应用拆分为 4 个微服务，当前已完成 2 个。', status: 'in_progress', progress: 50, createdAt: '2026-05-01', completedAt: null, sort: 2 },
  // 专项工作 (cat 3) — 已创建，Q3
  { id: nextTaskId++, cat: 3, title: '海外多语言支持', desc: 'i18n 方案调研与前端多语言框架集成。', status: 'created', progress: 0, createdAt: '2026-08-01', completedAt: null, sort: 3 },
];

const taskRows = taskDefs.map(t => [
  t.id, t.cat, t.title, t.desc, t.status, t.progress, 0,
  t.createdAt, t.status !== 'created' ? t.createdAt : '', t.completedAt || '', t.sort
]);
db._replaceSheet('tasks', taskRows);

// ----- Stages / Routine Records -----
const stageDefs = [
  // 任务1: 登录模块 (已完成)，3个阶段
  { taskId: 1, stages: [
    { idx: 1, note: '完成 OAuth 授权码流程设计，对接 GitHub Provider', createdAt: '2026-01-20', updatedAt: '2026-01-25', completed: 1 },
    { idx: 2, note: '实现 token 自动刷新与本地存储', createdAt: '2026-02-10', updatedAt: '2026-02-28', completed: 1 },
    { idx: 3, note: '接入企业微信登录渠道', createdAt: '2026-03-05', updatedAt: '2026-04-10', completed: 1 },
  ]},
  // 任务2: 数据导出重构 (进行中)，2个阶段
  { taskId: 2, stages: [
    { idx: 1, note: '设计新导出数据模型，完成 Exporter 类重写', createdAt: '2026-04-10', updatedAt: '2026-05-15', completed: 1 },
    { idx: 2, note: '添加年度/季度导出功能，调试样式渲染', createdAt: '2026-05-20', updatedAt: '2026-06-01', completed: 0 },
  ]},
  // 任务3: 性能优化 (进行中)，1个阶段
  { taskId: 3, stages: [
    { idx: 1, note: '前端：使用 Virtual List 优化长列表；后端：添加慢查询日志', createdAt: '2026-05-15', updatedAt: '2026-06-01', completed: 0 },
  ]},
  // 安全审计 (已完成)，2个阶段
  { taskId: 5, stages: [
    { idx: 1, note: '修复 SQL 注入与 XSS 漏洞，升级依赖包版本', createdAt: '2026-02-10', updatedAt: '2026-02-20', completed: 1 },
    { idx: 2, note: '安全回归测试通过，提交整改报告', createdAt: '2026-03-01', updatedAt: '2026-03-15', completed: 1 },
  ]},
  // 微服务拆分 (进行中)，2个阶段
  { taskId: 6, stages: [
    { idx: 1, note: '拆分用户服务与订单服务，部署到 K8s 集群', createdAt: '2026-05-10', updatedAt: '2026-06-01', completed: 1 },
    { idx: 2, note: '拆分通知服务，联调中', createdAt: '2026-06-15', updatedAt: '2026-07-10', completed: 0 },
  ]},
];

const stageRows = [];
for (const def of stageDefs) {
  for (const s of def.stages) {
    stageRows.push([nextStageId++, def.taskId, s.idx, s.note, 0, s.createdAt, s.updatedAt, s.completed]);
  }
}
db._replaceSheet('stages', stageRows);

// ----- Routine Records (日常工作 cat=2) -----
const routineTaskId = nextTaskId++;
taskRows.push([routineTaskId, 2, '日报提交', '每日下班前提交工作日报，总结当日完成工作项。', 'in_progress', 0, 1, dateStr(2026, 1, 1), '', '', 1]);
db._replaceSheet('tasks', taskRows);

// 1月 ~ 8月填报记录
for (let m = 1; m <= 8; m++) {
  const ym = `2026-${String(m).padStart(2, '0')}`;
  db._appendRows('routine_records', [[nextRoutineId++, routineTaskId, ym, 20 + Math.floor(Math.random() * 5), dateStr(2026, m, 28)]]);
}

// 第二项日常工作
const routineTaskId2 = nextTaskId++;
taskRows.push([routineTaskId2, 2, '周报汇总', '每周五汇总本周工作产出与下周计划。', 'in_progress', 0, 1, dateStr(2026, 1, 1), '', '', 2]);
db._replaceSheet('tasks', taskRows);

for (let m = 1; m <= 8; m++) {
  const ym = `2026-${String(m).padStart(2, '0')}`;
  db._appendRows('routine_records', [[nextRoutineId++, routineTaskId2, ym, 1, dateStr(2026, m, 28)]]);
}

// ----- Meta -----
db._setMeta('last_category_id', nextCatId - 1);
db._setMeta('last_task_id', nextTaskId - 1);
db._setMeta('last_stage_id', nextStageId - 1);
db._setMeta('last_routine_id', nextRoutineId - 1);

db.save();

console.log('模拟数据注入成功！');
console.log(`  分类: ${cats.length} 个`);
console.log(`  任务: ${taskRows.length} 个 (含 ${routineTaskId2 - routineTaskId + 1} 项日常工作)`);
console.log(`  阶段: ${stageRows.length} 条`);
console.log('数据覆盖: 2026-01 ~ 2026-08');
