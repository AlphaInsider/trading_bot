module.exports = {
  productName: 'AlphaBot',
  appId: 'com.alphainsider.alphabot',
  asar: false,
  directories: {
    output: 'dist',
    buildResources: 'public/electron',
  },
  files: [
    'database/**/*',
    'lib/**/*',
    'public/**/*',
    'electron.js',
    'express.js',
    'package.json'
  ],
  win: {
    target: ['nsis']
  },
  mac: {
    target: ['dmg']
  },
  linux: {
    target: ['AppImage']
  }
};