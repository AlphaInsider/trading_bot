const _ = require('lodash');
const j = require('joi');
const axios = require('axios');
const moment = require('moment');
const crypto = require('crypto');
const math = require('mathjs');

class Binance {
  //DONE: constructor <binance_key> <binance_secret>
  constructor(params = {}) {
    //validate
    j.assert(params, j.object({
      binance_key: j.string().required(),
      binance_secret: j.string().required()
    }).required());

    //data
    this.type = 'binance';
    this.allocationType = 'cryptocurrency';
    this.binanceKey = params.binance_key;
    this.binanceSecret = params.binance_secret;
    this.live = true;

    this.maintenanceMargin = '0.25';
    this.minTotal = '100';
    this.brokerStocks = {};

    //init
    this.ready = (async () => {})();
  }

  //DONE: destroy
  async destroy() {}

  //DONE: verify
  async verify() {
    //get account details
    return this._request({
      type: 'get',
      auth: true,
      url: '/sapi/v1/account/apiRestrictions'
    })
    //valid
    .then((data) => {
      //margin not available
      if(!data.enableSpotAndMarginTrading && !data.enableMargin && !data.enablePortfolioMarginTrading) throw new Error('Invalid API key permissions.');
      return 'valid';
    })
    //invalid
    .catch((error) => {
      //unable to connect
      if(error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED') throw new Error('Unable to connect.');
      return 'invalid';
    })
    //offline
    .catch(() => {
      return 'offline';
    });
  }
  
  //DONE: getStocks <[broker_stock_id]>
  async getStocks(params = {}) {
    //validate
    j.assert(params, j.object({
      broker_stock_id: j.array().items(j.string().optional()).required()
    }).required());
    
    //remove expired stocks
    this.brokerStocks = _.pickBy(this.brokerStocks, (brokerStock) => {
      return moment().isBefore(brokerStock.expires_at);
    });
    
    //find new stocks
    let newStocks = _.difference(params.broker_stock_id, _.keys(this.brokerStocks));
    if(newStocks.length > 0) {
      //get binance crypto margin assets
      let exchangeInfo = await this._request({
        type: 'get',
        auth: false,
        url: '/api/v3/exchangeInfo'
      });
      let binanceAssets = exchangeInfo.symbols.filter(asset => (asset.quoteAsset === 'USDT' && asset.isMarginTradingAllowed));
      //get new stocks to add to broker stock list
      let newBrokerStocks = await newStocks.reduce((chain, curr) => chain.then(async (prev) => {
        //get stock
        let stock = _.find(binanceAssets, {baseAsset: curr});
        // throw if binance stock not found
        if(!stock) throw new Error('Stock not found');
        //generate broker stock information
        let stepSize = _.find(stock.filters, {filterType: 'LOT_SIZE'}).stepSize;
        let info = {
          id: stock.baseAsset,
          symbol: stock.baseAsset,
          security: 'cryptocurrency',
          marginable: true,
          step_size: math.evaluate('bignumber(a)', {a: stepSize}).toString(),
          expires_at: moment().add(60*60*24, 'seconds').toISOString()
        }
        return {...prev, [curr]: info}
      }), Promise.resolve({}));
      //add new stocks
      this.brokerStocks = {...this.brokerStocks, ...newBrokerStocks};
    }
    
    //return
    return _.chain(this.brokerStocks).values().filter(stock => params.broker_stock_id.includes(stock.id)).value();
  }
  
  //DONE: mapStocks --[{alpha_stocks}]--
  async mapStocks(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stocks: j.array().items(j.object().optional()).required()
    }).required());
    
    //return empty object if no stocks passed
    if(params.alpha_stocks.length <= 0) return {};
    //error if any stock is not of type cryptocurrency
    if(_.find(params.alpha_stocks, (stock) => stock.security !== 'cryptocurrency')) throw new Error('Some securities are not of type cryptocurrency.');
    
    //get stock ids for broker
    let brokerStockIds = params.alpha_stocks.map(stock => this._getStockSymbol({alpha_stock: stock}));
    //get broker stocks
    let stocks = await this.getStocks({broker_stock_id: brokerStockIds});
    
    //return
    return params.alpha_stocks.reduce((prev, curr) => {
      let value = _.find(stocks, {id: this._getStockSymbol({alpha_stock: curr})});
      if(value) return {...prev, [curr.stock_id]: value.id};
      return prev;
    }, {});
  }

  //DONE: getAccountDetails
  async getAccountDetails() {
    //get account details, balances, and positions
    let [accountDetails, accountMarginDetails, btcInfo] = await Promise.all([
      this._request({
        type: 'get',
        auth: true,
        url: '/api/v3/account'
      }),
      this._request({
        type: 'get',
        auth: true,
        url: '/sapi/v1/margin/account'
      }),
      this._request({
        type: 'get',
        auth: false,
        url: '/api/v3/ticker/price',
        query: {
          symbol: 'BTCUSDT'
        }
      })
    ]);
    let positions = accountMarginDetails.userAssets.filter(asset => math.evaluate('a != 0', {a: asset.netAsset}) && asset.asset !== 'USDT');
    
    //get margin type
    let marginType = (accountMarginDetails.borrowEnabled ? 'portfolio' : 'cash');
    
    //get portfolio value
    let portfolioValue = math.evaluate('bignumber(a) * bignumber(b)', {a: accountMarginDetails.totalNetAssetOfBtc, b: btcInfo.price}).toString();

    //calculate buying power
    let buyingPower = portfolioValue;
    if(marginType === 'portfolio') buyingPower = math.evaluate('bignumber(a) / 0.2', {a: portfolioValue}).toString();

    //format positions
    positions = positions.map((position) => {
      return {
        id: position.asset,
        amount: position.netAsset
      };
    });

    //return
    return {
      type: this.type,
      allocation_type: this.allocationType,
      account_id: accountDetails.uid,
      live: this.live,
      margin_type: marginType,
      value: portfolioValue,
      buying_power: buyingPower,
      initial_buying_power_percent: '1',
      positions: positions
    }
  }

  //DONE: closeAllPositions
  async closeAllPositions() {
    //cancel all open orders
    await this.cancelAllOpenOrders();
    
    //get positions
    let accountDetails = await this.getAccountDetails();

    //close all positions
    let orders = await Promise.all(accountDetails.positions.map((item) => {
      return this.newOrder({
        broker_stock_id: item.id,
        type: 'close',
        action: (math.evaluate('a > 0', {a: item.amount}) ? 'sell' : 'buy'),
        amount: item.amount
      });
    }));

    //return
    return _.flatten(orders);
  }

  //DONE: newOrder <broker_stock_id> <type> <action> <amount> --price--
  async newOrder(params = {}) {
    //validate
    j.assert(params, j.object({
      broker_stock_id: j.string().required(),
      type: j.string().valid('close', 'sell_long', 'buy_short', 'buy_long', 'sell_short').required(),
      action: j.string().valid('buy', 'sell').required(),
      amount: j.number().unsafe().greater(0).required(),
      price: j.number().greater(0).optional()
    }).required());
    if(params.type !== 'close' && !params.price) throw new Error('Price is required.');
    
    //get broker stock info
    let brokerStock = (await this.getStocks({broker_stock_id: [params.broker_stock_id]}))[0];
    //error if broker stock not found
    if(!brokerStock) throw new Error('Unable to find broker stock information.');
    
    //get share amount
    let fullShares =  math.evaluate('floor(bignumber(a) / bignumber(b)) * bignumber(b)', {a: params.amount, b: brokerStock.step_size}).toString();

    //skip if amount is zero
    if(math.evaluate('bignumber(a) == 0', {a: fullShares})) return undefined;

    //skip if less than min total
    if(params.type !== 'close') {
      let total = math.evaluate('bignumber(a) * bignumber(b)', {a: fullShares, b: params.price}).toString();
      if(math.evaluate('a < b', {a: total, b: this.minTotal})) return undefined;
    }

    //execute order
    let order = await this._request({
      type: 'post',
      auth: true,
      url: '/sapi/v1/margin/order',
      query: {
        symbol: params.broker_stock_id+'USDT',
        side: params.action.toUpperCase(),
        type: 'MARKET',
        quantity: fullShares,
        sideEffectType: 'AUTO_BORROW_REPAY'
      }
    })
    .catch((error) => {
      //skip error if close trade and code is -1013: Filter error
      if (params.type === 'close' && error.response.data && [-1013].includes(error.response.data.code)) return;
      throw error;
    });

    //wait for order to complete, expire 20s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 20) throw new Error('Order failed to complete.');
      //get order
      let openOrders = await this._request({
        type: 'get',
        auth: true,
        url: '/sapi/v1/margin/openOrders'
      });
      //check if order is still on the books
      return (order && _.some(openOrders, {orderId: order.orderId}));
    }, 1000);

    //return
    return (order ? this._formatOrders({orders: [order]}) : []);
  }

  //DONE: cancelAllOpenOrders
  async cancelAllOpenOrders() {
    //get open orders
    let openOrders = await this._getOpenOrders();
    
    //cancel orders
    let canceledOrders = await Promise.all(openOrders.map(order => {
      return this._request({
        type: 'delete',
        auth: true,
        url: '/sapi/v1/margin/order',
        query: {
          symbol: order.symbol,
          orderId: order.orderId
        }
      }).catch(() => {});
    }));

    //wait for all orders to cancel, expire 10s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 10) throw new Error('Failed to cancel all open orders.');
      //get open orders
      openOrders = await this._getOpenOrders();
      //repeat if canceledOrders still exist
      return _.intersectionBy(canceledOrders, openOrders, 'id').length > 0;
    }, 1000);

    //return
    return this._formatOrders({orders: canceledOrders});
  }

  //DONE: _wait <fn> --wait--
  async _wait(fn, wait = 1000, start = Date.now()) {
    //wait
    await new Promise(resolve => setTimeout(resolve, wait));
    //execute function
    let repeat = await fn((Date.now()-start)/1000);
    //repeat
    if(repeat) {
      return this._wait(fn, wait, start);
    }
  }

  //DONE: _getOpenOrders
  async _getOpenOrders() {
    return this._request({
      type: 'get',
      auth: true,
      url: '/sapi/v1/margin/openOrders'
    });
  }

  //DONE: _request <type> <url> --{query}-- --{headers}-- --auth--
  async _request(params = {}) {
    //init
    await this.ready;

    //validate
    j.assert(params, j.object({
      type: j.string().valid('get', 'post', 'delete').required(),
      url: j.string().required(),
      query: j.object().optional(),
      headers: j.object().optional(),
      auth: j.boolean().optional()
    }).required());
    
    //set timestamp and signature for auth requests
    let timestamp, signature;
    if(params.auth) {
      //get binance server timestamp
      timestamp = await axios({method: 'get', url: 'https://api.binance.com/api/v3/time'}).then(result => result.data.serverTime);

      //get signature
      signature = this._getSignature({query: params.query, timestamp});
    }

    //make request
    let response = await axios({
      method: params.type,
      headers: {
        ...params.headers,
        ...(params.auth ? {'X-MBX-APIKEY': this.binanceKey} : {})
      },
      url: 'https://api.binance.com' + params.url,
      params: (params.query ? {...params.query, timestamp, signature} : {timestamp, signature}),
      data: undefined
    })
    .then((result) => result.data);

    //return
    return response;
  }

  //DONE: _getSignature <timestamp> --{query}--
  _getSignature(params) {
    //validate
    j.assert(params, j.object({
      timestamp: j.number().required(),
      query: j.object().optional()
    }).required());

    // Prepare query string
    const query = (params.query ? new URLSearchParams(params.query).toString() : '');
    const queryString = (params.query ? `${query}&timestamp=${params.timestamp}` : `timestamp=${params.timestamp}`);
    
    //create an HMAC SHA256 signature
    const hmac = crypto.createHmac('sha256', this.binanceSecret);
    hmac.update(queryString);
    let signature = hmac.digest('hex');
    
    //return
    return signature
  }

  //DONE: _getStockSymbol <{alpha_stock}>
  _getStockSymbol(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stock: j.object().required()
    }).required());

    //alpha stock
    let alphaStock = params.alpha_stock;

    //handle crypto symbol
    if(alphaStock.security === 'cryptocurrency') {
      return alphaStock.stock;
    }

    //else, undefined
    else {
      return undefined;
    }
  }

  //DONE: _formatOrders --[{orders}]--
  _formatOrders(params = {}) {
    //validate
    j.assert(params, j.object({
      orders: j.array().items(j.object().optional()).required()
    }).required());

    //format orders
    return _.map(params.orders, 'orderId');
  }
}

module.exports = Binance;