//config
exports.config = {
  version: 'v'+require('../package.json').version,
  wsChannels: ['wsActivity', 'wsStatus']
}

//classes
exports.Server = require('./server.js');
exports.Bot = require('./bot.js');
exports.AlphaInsider = require('./alphainsider.js');
exports.Alpaca = require('./alpaca.js');
exports.TastyTrade = require('./tastytrade.js');
exports.Binance = require('./binance.js');
exports.Bitfinex = require('./bitfinex.js');