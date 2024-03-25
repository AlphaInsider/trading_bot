const _ = require('lodash');
const j = require('joi');
const axios = require('axios');
const moment = require('moment');
const crypto = require('crypto');
const math = require('mathjs');

class Bitfinex {
  //DONE: constructor <bitfinex_key> <bitfinex_secret>
  constructor(params = {}) {
    //validate
    j.assert(params, j.object({
      bitfinex_key: j.string().required(),
      bitfinex_secret: j.string().required()
    }).required());
    
    //data
    this.type = 'bitfinex';
    this.assetClass = 'cryptocurrency';
    this.bitfinexKey = params.bitfinex_key;
    this.bitfinexSecret = params.bitfinex_secret;
    
    this.minTotal = '10';
    this.brokerStocks = {};
    this.requestLoading = false;
    
    //init
    this.ready = (async () => {})();
  }
  
  //DONE: destroy
  async destroy() {}
  
  //DONE: verify
  async verify() {
    //get account details
    return this._request({
      type: 'post',
      auth: true,
      url: '/v2/auth/r/info/user'
    })
    //validate
    .then((data) => {
      //user is intermediate/full verification (level 2+) or is paper account
      if(data[5] >= 2 || data[21] === 1) return 'valid';
      return 'invalid';
    })
    //invalid
    .catch((error) => {
      if(!_.isArray(error.response.data)) throw new Error('Unable to connect.');
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
      //get tradable bitfinex crypto margin assets
      let bitfinexAssets = await this._request({
        type: 'get',
        auth: true,
        url: '/v1/symbols_details'
      });
      bitfinexAssets = _.filter(bitfinexAssets, {margin: true});
      
      //get new stocks to add to broker stock list
      let newBrokerStocks = await newStocks.reduce((chain, curr) => chain.then(async (prev) => {
        //get stock
        let stock = _.find(bitfinexAssets, {pair: _.chain(curr).split('t', 2).nth(1).toLower().value()});
        // throw if bitfinex stock not found
        if(!stock) throw new Error('Security is not tradable.');
        let info = {
          id: 't'+_.toUpper(stock.pair),
          symbol: 't'+_.toUpper(stock.pair),
          security: 'cryptocurrency',
          marginable: true,
          step_size: math.evaluate('bignumber(a)', {a: stock.minimum_order_size}).toString(),
          expires_at: moment().add(60*60, 'seconds').toISOString()
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
    
    //get account details
    let accountDetails = await this.getAccountDetails();
    
    //get stock ids for broker
    let brokerStockIds = params.alpha_stocks.map(stock => this._getStockSymbol({alpha_stock: stock, live: accountDetails.live}));
    //get broker stocks
    let stocks = await this.getStocks({broker_stock_id: brokerStockIds});
    
    //return
    return params.alpha_stocks.reduce((prev, curr) => {
      let value = _.find(stocks, {id: this._getStockSymbol({alpha_stock: curr, live: accountDetails.live})});
      if(value) return {...prev, [curr.stock_id]: value.id};
      return prev;
    }, {});
  }
  
  //DONE: getAccountDetails
  async getAccountDetails() {
    //get account details, marginDetails and positions
    let [accountDetails, marginDetails, accountPositions] = await Promise.all([
      this._request({
        type: 'post',
        auth: true,
        url: '/v2/auth/r/info/user'
      }),
      this._request({
        type: 'post',
        auth: true,
        url: '/v2/auth/r/info/margin/base'
      }),
      this._request({
        type: 'post',
        auth: true,
        url: '/v2/auth/r/positions'
      })
    ]);
    marginDetails = marginDetails[1];
    
    //get margin type: (portfolio: intermediate/full verification or is paper account)
    let marginType = (accountDetails[5] >= 2 || accountDetails[21] === 1 ? 'portfolio' : 'cash');
    
    //get portfolio value
    let portfolioValue = math.evaluate('bignumber(a)', {a: marginDetails[3]}).toString();
    
    //calculate buying power
    let buyingPower = portfolioValue;
    if(marginType === 'portfolio') buyingPower = math.evaluate('bignumber(a) / 0.2', {a: portfolioValue}).toString();
    
    //format positions
    let positions = _.chain(accountPositions).filter(position => (position[1] === 'ACTIVE')).map((position) => {
      return {
        id: position[0],
        amount: math.evaluate('bignumber(a)', {a: position[2]}).toString()
      };
    }).value();
    
    //return
    return {
      type: this.type,
      assetClass: this.assetClass,
      account_id: accountDetails[0],
      live: (accountDetails[21] !== 1),
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
        amount: math.evaluate('abs(bignumber(a))', {a: item.amount}).toString()
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
    if(math.evaluate('bignumber(a) == 0', {a: fullShares})) return [];
    
    //skip if less than min total
    if(params.type !== 'close') {
      let total = math.evaluate('bignumber(a) * bignumber(b)', {a: fullShares, b: params.price}).toString();
      if(math.evaluate('a < b', {a: total, b: this.minTotal})) return [];
    }
    
    //execute order
    let order = await this._request({
      type: 'post',
      auth: true,
      url: '/v2/auth/w/order/submit',
      query: {
        symbol: params.broker_stock_id,
        type: 'MARKET',
        amount: (params.action === 'sell' ? math.evaluate('-bignumber(a)', {a: fullShares}).toString() : fullShares)
      }
    });
    
    //skip if no order was created
    if(order.length <= 0 || order[6] !== 'SUCCESS') return [];
    
    //get order details
    order = _.first(order[4]);
    
    //wait for order to complete, expire 20s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 20) throw new Error('Order failed to complete.');
      //get order
      let openOrders = await this._getOpenOrders();
      //check if order is still on the books
      return _.some(openOrders, {id: order[0]});
    }, 1000);
    
    //return
    return this._formatOrders({orders: [order]});
  }
  
  //DONE: cancelAllOpenOrders
  async cancelAllOpenOrders() {
    //get open orders
    let openOrders = await this._getOpenOrders();
    
    //cancel orders
    let canceledOrders = await Promise.all(openOrders.map(order => {
      return this._request({
        type: 'post',
        auth: true,
        url: '/v2/auth/w/order/cancel',
        query: {
          id: order.id
        }
      })
      //success
      .then((order) => {
        //return order
        if(order[6] === 'SUCCESS') return order[4];
        else throw new Error('Unable to cancel order.');
      })
      //error
      .catch(() => {})
    }));
    canceledOrders = this._formatOrders({orders: _.compact(canceledOrders)});
    
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
    return canceledOrders;
  }
  
  //DONE: _request <type> <url> --{query}-- --{headers}-- --auth--
  async _request(params = {}) {
    //wait for all other requests to finish
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 100) throw new Error('Waited too long.');
      //repeat if still loading
      return this.requestLoading;
    }, 300);
    
    //start loading
    this.requestLoading = true;
    
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
    let nonce, signature;
    if(params.auth) {
      //generate nonce
      nonce = moment().valueOf();
      //generate signature
      const signaturePayload = `/api${params.url}${nonce}${JSON.stringify(params.query || {})}`;
      signature = crypto.createHmac('sha384', this.bitfinexSecret).update(signaturePayload).digest('hex');
    }
    
    //make request
    let response = await axios({
      method: params.type,
      headers: {
        'Content-Type': 'application/json',
        ...params.headers,
        ...(params.auth ? {'bfx-nonce': nonce, 'bfx-apikey': this.bitfinexKey, 'bfx-signature': signature} : {})
      },
      url: `https://api${(!params.auth ? '-pub' : '')}.bitfinex.com${params.url}`,
      params: ((params.type.toLowerCase() === 'get') ? params.query : undefined),
      data: ((params.type.toLowerCase() === 'post') ? JSON.stringify(params.query || {}) : undefined)
    })
    .then((result) => result.data);
    
    //finish loading
    this.requestLoading = false;
    
    //return
    return response;
  }
  
  //DONE: _getOpenOrders
  async _getOpenOrders() {
    return this._request({
      type: 'post',
      auth: true,
      url: '/v2/auth/r/orders'
    })
    .then((orders) => {
      return this._formatOrders({orders});
    });
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
  
  //DONE: _getStockSymbol <{alpha_stock}> <live>
  _getStockSymbol(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stock: j.object().required(),
      live: j.boolean().required()
    }).required());
    
    //alpha stock
    let alphaStock = params.alpha_stock;
    
    //handle crypto symbol
    if(alphaStock.security === 'cryptocurrency') {
      return (!params.live ? `tTEST${alphaStock.stock}:TESTUSD` : 't'+alphaStock.stock+'USD');
    }
    
    //else, undefined
    else {
      return undefined;
    }
  }
  
  //DONE: _formatOrders --[[orders]]--
  _formatOrders(params = {}) {
    //validate
    j.assert(params, j.object({
      orders: j.array().items(j.array().optional()).required()
    }).required());
    
    //format orders
    return _.map(params.orders, (order) => {
      return {
        id: order[0],
        symbol: order[3]
      };
    });
  }
}

module.exports = Bitfinex;