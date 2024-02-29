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
  afterSign: 'electron-builder-notarize',
  win: {
    target: ['nsis']
  },
  mac: {
    target: ['dmg'],
    hardenedRuntime: true
  },
  linux: {
    target: ['AppImage']
  }
};