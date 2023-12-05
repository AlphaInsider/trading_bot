const { app, BrowserWindow } = require('electron');
const path = require('path');

//TODO: setup
const createWindow = () => {
  //create browser window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  });
  //load website
  mainWindow.loadFile('./public/index.html');
  //start dev tools
  mainWindow.webContents.openDevTools();
}
app.whenReady().then(() => {
  //create window
  createWindow();
  //open when clicked from taskbar
  app.on('activate', () => {
    if(BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if(process.platform !== 'darwin') app.quit();
});

//TODO: api routes

//CHECK: default routes

//TODO: start server