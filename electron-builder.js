module.exports = {
  productName: 'AlphaBot',
  appId: 'com.alphainsider.alphabot',
  asar: false,
  artifactName: '${productName}-${version}.${ext}',
  directories: {
    output: 'dist',
    buildResources: 'electron_assets',
  },
  files: [
    'database/**/*',
    'electron_assets/**/*',
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
    hardenedRuntime: true,
    entitlements: './electron_assets/entitlements.mac.plist',
    entitlementsInherit: './electron_assets/entitlements.mac.plist'
  },
  linux: {
    target: ['AppImage']
  }
};