const {notarize} = require('@electron/notarize');
const path = require('path');
const package = require('../package.json');

module.exports = async (params) => {
  //skip if not macOS
  if(process.platform !== 'darwin') {
    return;
  }
  
  //notarize code
  console.log('Notarizing code...');
  await notarize({
    appBundleId: package.build.appId,
    appPath: path.join(params.appOutDir, `${params.packager.appInfo.productFilename}.app`),
    appleApiKey: `~/private_keys/AuthKey_${process.env.API_KEY_ID}.p8`,
    appleApiKeyId: process.env.API_KEY_ID,
    appleApiIssuer: process.env.API_KEY_ISSUER_ID
  });
  console.log('Notarization COMPLETE!');
};