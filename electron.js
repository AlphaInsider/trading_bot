const path = require('path');
const {app, BrowserWindow, Tray, Menu, shell} = require('electron');
const {fork} = require('child_process');
const axios = require('axios');

if(require('electron-squirrel-startup')) app.quit();

const host = 'http://localhost:5050';

let mainWindow = undefined;
let tray = undefined;
let expressAppProcess = undefined;

//DONE: createWindow
let createWindow = async () => {
  //create electron window
  mainWindow = new BrowserWindow({
    title: 'AlphaBot',
    icon: path.resolve(__dirname, './public/electron/desktop_icon.png'),
    width: 1200,
    height: 1000
  });
  
  //open external links in user's default browser
  mainWindow.webContents.on('will-navigate', (event) => {
    if(new URL(host).host !== new URL(event.url).host) {
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
    if(!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  //load local express app
  mainWindow.loadURL(host);
}

//DONE: createTray
let createTray = async () => {
  //create tray
  tray = new Tray(path.resolve(__dirname, './public/electron/tray_icon.png'));
  
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
        app.isQuiting = true;
        app.quit();
      }
    }
  ]));
  
  //click to reopen
  tray.on('click', async () => {
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
if(!firstInstance) app.quit();
app.on('second-instance', async () => {
  if(mainWindow && !mainWindow.isVisible()) {
    await mainWindow.loadURL(host);
    mainWindow.show();
  }
});

//start app
app.on('ready', async () => {
  //spawn express server
  expressAppProcess = fork(path.resolve(__dirname, './express.js'), [
    '--electron',
    '--db='+path.join(app.getPath('userData'), 'database.sqlite3')
  ], {
    silent: false
  });

  const checkServerReady = async () => {
    try {
      const response = await axios.get(host);
      if (response.status === 200) {
        // Server is ready
        return true;
      }
    } catch (error) {
      // Server not ready
      return false;
    }
  }

  const waitForServerToBeReady = async () => {
    let serverReady = false;
    let attempts = 0;
    while (!serverReady && attempts < 10) { // Try for a maximum of 10 attempts
      serverReady = await checkServerReady();
      if (!serverReady) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
        attempts++;
      }
    }
    return serverReady;
  }

  // Wait for express server to spin up
  const serverReady = await waitForServerToBeReady();
  if (!serverReady) {
    console.error("Failed to start the Express server.");
    app.quit();
    return;
  }
  
  //create window
  createWindow();
  
  //create tray
  createTray();
});

//stop app
app.on('will-quit', () => {
  if(expressAppProcess) expressAppProcess.kill();
});