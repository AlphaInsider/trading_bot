const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');

let mainWindow = undefined;
let expressAppProcess = undefined;

const createWindow = () => {
  //if mainWindow already exists, focus it
  if(mainWindow) {
    if(mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  
  //create electron window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });
  mainWindow.loadURL(`http://localhost:3001`);
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

app.on('ready', () => {
  //spawn express server
  expressAppProcess = spawn('node', ['./express.js', '--electron=true']);
  expressAppProcess.stdout.on('data', (data) => {
    console.log(data);
  });
  expressAppProcess.stderr.on('data', (error) => {
    console.error(error);
  });
  
  //create window
  createWindow();
});
app.on('window-all-closed', () => {
  if(process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if(mainWindow === undefined) {
    createWindow();
  }
});
//terminate child process when app is completely closed
app.on('will-quit', () => {
  if(expressAppProcess) expressAppProcess.kill();
});