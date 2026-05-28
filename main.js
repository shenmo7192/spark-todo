const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const ExcelDB = require('./db');
const Exporter = require('./export');

let mainWindow;
const dbPath = path.join(__dirname, 'data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
const dbFile = path.join(dbPath, 'todo.xlsx');

const db = new ExcelDB(dbFile);
const exporter = new Exporter(db);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers with error catching
function safeHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error('IPC Error:', e);
      throw e;
    }
  };
}

ipcMain.handle('db:getCategories', safeHandler(() => db.getCategories()));
ipcMain.handle('db:addCategory', safeHandler((_, name, isRoutine) => db.addCategory(name, isRoutine)));
ipcMain.handle('db:updateCategory', safeHandler((_, id, name, isRoutine) => db.updateCategory(id, name, isRoutine)));
ipcMain.handle('db:moveCategory', safeHandler((_, id, direction) => db.moveCategory(id, direction)));
ipcMain.handle('db:deleteCategory', safeHandler((_, id) => db.deleteCategory(id)));

ipcMain.handle('db:getTasks', safeHandler((_, categoryId, yearMonth) => db.getTasks(categoryId, yearMonth)));
ipcMain.handle('db:getTaskById', safeHandler((_, taskId) => db.getTaskById(taskId)));
ipcMain.handle('db:addTask', safeHandler((_, task) => db.addTask(task)));
ipcMain.handle('db:updateTask', safeHandler((_, task) => db.updateTask(task)));
ipcMain.handle('db:deleteTask', safeHandler((_, id) => db.deleteTask(id)));

ipcMain.handle('db:getStages', safeHandler((_, taskId) => db.getStages(taskId)));
ipcMain.handle('db:addStage', safeHandler((_, stage) => db.addStage(stage)));
ipcMain.handle('db:updateStage', safeHandler((_, stage) => db.updateStage(stage)));
ipcMain.handle('db:deleteStage', safeHandler((_, stageId) => db.deleteStage(stageId)));

ipcMain.handle('db:getRoutineRecord', safeHandler((_, taskId, yearMonth) => db.getRoutineRecord(taskId, yearMonth)));
ipcMain.handle('db:fillRoutine', safeHandler((_, record) => db.fillRoutine(record)));
ipcMain.handle('db:getLastMonthRoutine', safeHandler((_, taskId, yearMonth) => db.getLastMonthRoutine(taskId, yearMonth)));
ipcMain.handle('db:checkRoutineUnfilled', safeHandler((_, categoryId, yearMonth) => db.checkRoutineUnfilled(categoryId, yearMonth)));

ipcMain.handle('db:getAllActiveMonths', safeHandler(() => db.getAllActiveMonths()));
ipcMain.handle('db:carryOverTasks', safeHandler((_, targetYearMonth, categoryId) => db.carryOverTasks(targetYearMonth, categoryId)));

ipcMain.handle('export:excel', async (_, targetPath) => {
  try {
    await exporter.exportToExcel(targetPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('export:monthlyExcel', async (_, dirPath, startMonth, endMonth) => {
  try {
    await exporter.exportMonthly(dirPath, startMonth, endMonth);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
