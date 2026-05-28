const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const ExcelDB = require('./db');
const Exporter = require('./export');

let mainWindow;
const dbPath = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
const dbFile = path.join(dbPath, 'todo.db');

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

// IPC handlers
ipcMain.handle('db:getCategories', () => db.getCategories());
ipcMain.handle('db:addCategory', (_, name, isRoutine) => db.addCategory(name, isRoutine));
ipcMain.handle('db:deleteCategory', (_, id) => db.deleteCategory(id));

ipcMain.handle('db:getTasks', (_, categoryId, yearMonth) => db.getTasks(categoryId, yearMonth));
ipcMain.handle('db:getTaskById', (_, taskId) => db.getTaskById(taskId));
ipcMain.handle('db:addTask', (_, task) => db.addTask(task));
ipcMain.handle('db:updateTask', (_, task) => db.updateTask(task));
ipcMain.handle('db:deleteTask', (_, id) => db.deleteTask(id));

ipcMain.handle('db:getStages', (_, taskId) => db.getStages(taskId));
ipcMain.handle('db:addStage', (_, stage) => db.addStage(stage));
ipcMain.handle('db:updateStage', (_, stage) => db.updateStage(stage));

ipcMain.handle('db:getRoutineRecord', (_, taskId, yearMonth) => db.getRoutineRecord(taskId, yearMonth));
ipcMain.handle('db:fillRoutine', (_, record) => db.fillRoutine(record));
ipcMain.handle('db:getLastMonthRoutine', (_, taskId, yearMonth) => db.getLastMonthRoutine(taskId, yearMonth));
ipcMain.handle('db:checkRoutineUnfilled', (_, categoryId, yearMonth) => db.checkRoutineUnfilled(categoryId, yearMonth));

ipcMain.handle('db:getAllActiveMonths', () => db.getAllActiveMonths());

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
