const fs = require('fs');
const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'AlphaBot',
    executableName: 'alpha_bot',
    icon: path.resolve(__dirname, './public/electron/desktop_icon'),
    ignore: (() => {
      let allowList = [
        'node_modules/',
        'database/',
        'lib/',
        'public/',
        'electron.js',
        'express.js',
        'package.json'
      ];
      let files = fs.readdirSync(path.resolve(__dirname, './'), {withFileTypes: true}).map(file => file.isDirectory() ? `${file.name}/` : file.name);
      let ignoreList = files.filter(file => !allowList.includes(file)).map((file) => '/'+file.replace(/\/$/, ''));
      return ignoreList;
    })()
  },
  makers: [
    // windows
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        loadingGif: path.resolve(__dirname, './public/electron/loading.gif'),
        iconUrl: path.resolve(__dirname, './public/electron/desktop_icon.ico'),
        setupIcon: path.resolve(__dirname, './public/electron/desktop_icon.ico')
      }
    },
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.resolve(__dirname, './public/electron/desktop_icon.icns'),
        format: 'ULFO'
      }
    },
    // linux
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {}
      }
    }
  ],
  publishers: []
};