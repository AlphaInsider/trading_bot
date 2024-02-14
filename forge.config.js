const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'AlphaBot',
    icon: path.resolve(__dirname, './public/electron/desktop_icon'),
    ignore: (filePath) => {
      let allowList = [
        'node_modules/',
        'database/',
        'lib/',
        'public/',
        'electron.js',
        'express.js',
        'package.json'
      ];
      let normalizedPath = filePath.replace(/\\/g, '/');
      return normalizedPath && !allowList.some((item) => {
        return '/'+item.endsWith('/')
          ? normalizedPath === '/'+item.slice(0, -1) || normalizedPath.startsWith('/'+item)
          : normalizedPath === '/'+item
      });
    }
  },
  makers: [
    // zip
    /*{
      name: '@electron-forge/maker-zip'
    },*/
    // windows
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        //loadingGif: '',
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
    //TODO: linux
    {
      name: '@electron-forge/maker-deb',
      config: {
        productName: 'AlphaBot',
        productDescription: 'Auto trade any AlphaInsider strategy with your broker.',
        categories: ['Utility']
      }
    }
  ],
  publishers: []
};