const {app, BrowserWindow, Tray, Menu, shell} = require('electron');
const {spawn} = require('child_process');

//let host = 'http://localhost:3001';
let host = 'http://localhost:8080'; //TODO: remove

let mainWindow = undefined;
let tray = undefined;
let expressAppProcess = undefined;

//DONE: createWindow
let createWindow = async () => {
  //create electron window
  mainWindow = new BrowserWindow({
    title: 'AlphaBot',
    width: 800,
    height: 600
  });
  
  //load local express app
  mainWindow.loadURL(host);
  
  //minimize window on close
  mainWindow.on('close', function (event) {
    if(!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  //TODO: redirect external links through default browser
  mainWindow.webContents.on('did-start-navigation', (data) => {
    console.log(data);
  });
  /*app.on('web-contents-created', (event, win) => {
    event.preventDefault();
    console.log('New web contents');
  });*/
}

//DONE: createTray
let createTray = async () => {
  //create tray
  tray = new Tray('public/img/logo.png');
  
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
app.on('ready', async () => {
  //spawn express server
  expressAppProcess = spawn('node', ['./express.js', '--electron=true']);
  expressAppProcess.stdout.on('data', (data) => {
    console.log(data.toString());
  });
  expressAppProcess.stderr.on('data', (error) => {
    console.error(error.toString());
  });
  
  //wait for express server to spin up
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  //create window
  createWindow();
  
  //create tray
  createTray();
});
app.on('will-quit', () => {
  if(expressAppProcess) expressAppProcess.kill();
});