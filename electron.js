const path = require('path');
const {app, BrowserWindow, Tray, Menu, shell} = require('electron');
const {fork} = require('child_process');
const axios = require('axios');
const {autoUpdater} = require('electron-updater');

const host = 'http://localhost:5050';

let splashWindow = undefined;
let mainWindow = undefined;
let tray = undefined;
let expressAppProcess = undefined;
let isQuitting = false;

//DONE: createSplashWindow
let createSplashWindow = async () => {
  //create electron window
  splashWindow = new BrowserWindow({
    title: 'AlphaBot',
    icon: path.resolve(__dirname, './electron_assets/icon.png'),
    width: 600,
    height: 400,
    frame: false
  });
  
  //load splash screen
  splashWindow.loadFile(path.resolve(__dirname, './public/splash.html'));
}

//DONE: createAppWindow
let createAppWindow = async () => {
  //create electron window
  mainWindow = new BrowserWindow({
    title: 'AlphaBot',
    icon: path.resolve(__dirname, './electron_assets/icon.png'),
    width: 1200,
    height: 800,
    autoHideMenuBar: true
  });
  
  //handle update events and external links
  mainWindow.webContents.on('will-navigate', (event) => {
    //handle update
    if(event.url === 'process:update') {
      autoUpdater.downloadUpdate().catch(() => {});
    }
    //handle external links
    else if(new URL(host).host !== new URL(event.url).host) {
      event.preventDefault();
      shell.openExternal(event.url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler((event) => {
    if(new URL(host).host !== new URL(event.url).host) shell.openExternal(event.url);
    return {action: 'deny'};
  });
  
  //minimize window on close
  mainWindow.on('close', (event) => {
    if(!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  //load app page
  mainWindow.loadURL(host);
}

//DONE: createTray
let createTray = async () => {
  //create tray
  tray = new Tray(path.resolve(__dirname, './electron_assets/tray_icon.png'));
  
  //right click menu
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open AlphaBot',
      click: async () => {
        await mainWindow.loadURL(host);
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: async () => {
        app.quit();
      }
    }
  ]));
  
  //click to reopen
  tray.on('click', async () => {
    if(process.platform === 'darwin') return;
    if(mainWindow.isVisible()) {
      mainWindow.hide();
    }
    else {
      await mainWindow.loadURL(host);
      mainWindow.show();
    }
  });
}

//==== START ====
//prevent multiple instances
const firstInstance = app.requestSingleInstanceLock();
if(!firstInstance) app.exit();
app.on('second-instance', async () => {
  if(mainWindow && !mainWindow.isVisible()) {
    await mainWindow.loadURL(host);
    mainWindow.show();
  }
});

//start app
app.on('ready', () => Promise.resolve().then(async () => {
  //check for updates
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (error) => {
    console.log(error);
  });
  autoUpdater.checkForUpdates();
  
  //create splash window
  await createSplashWindow();
  
  //start express server
  expressAppProcess = fork(path.resolve(__dirname, './express.js'), [
    '--electron',
    '--db='+path.join(app.getPath('userData'), 'database.sqlite3')
  ], {
    silent: false
  });
  
  //wait for express server to start
  let waitForServer = async (attempt = 0) => {
    if(attempt <= 0) throw new Error('Failed to start express server.');
    return axios.get(host)
    .then((data) => {
      if(data.status !== 200) throw new Error('Server not ready.');
    })
    .catch(async (error) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return waitForServer(attempt-1);
    });
  }
  await waitForServer(120).catch((error) => {
    app.quit();
    throw error;
  });
  
  //close splash screen
  splashWindow.close();
  
  //create app window
  createAppWindow();
  
  //create tray
  await createTray();
}).catch((error) => {}));

//stop app
app.on('before-quit', () => {
  isQuitting = true;
  if(expressAppProcess) expressAppProcess.kill();
});