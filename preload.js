const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Categories
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addCategory: (name, isRoutine) => ipcRenderer.invoke('db:addCategory', name, isRoutine),
  deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),

  // Tasks
  getTasks: (categoryId, yearMonth) => ipcRenderer.invoke('db:getTasks', categoryId, yearMonth),
  getTaskById: (taskId) => ipcRenderer.invoke('db:getTaskById', taskId),
  addTask: (task) => ipcRenderer.invoke('db:addTask', task),
  updateTask: (task) => ipcRenderer.invoke('db:updateTask', task),
  deleteTask: (id) => ipcRenderer.invoke('db:deleteTask', id),

  // Stages
  getStages: (taskId) => ipcRenderer.invoke('db:getStages', taskId),
  addStage: (stage) => ipcRenderer.invoke('db:addStage', stage),
  updateStage: (stage) => ipcRenderer.invoke('db:updateStage', stage),

  // Routine
  getRoutineRecord: (taskId, yearMonth) => ipcRenderer.invoke('db:getRoutineRecord', taskId, yearMonth),
  fillRoutine: (record) => ipcRenderer.invoke('db:fillRoutine', record),
  getLastMonthRoutine: (taskId, yearMonth) => ipcRenderer.invoke('db:getLastMonthRoutine', taskId, yearMonth),
  checkRoutineUnfilled: (categoryId, yearMonth) => ipcRenderer.invoke('db:checkRoutineUnfilled', categoryId, yearMonth),

  getAllActiveMonths: () => ipcRenderer.invoke('db:getAllActiveMonths'),

  // Export
  exportExcel: (targetPath) => ipcRenderer.invoke('export:excel', targetPath),

  // Dialog
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options)
});
