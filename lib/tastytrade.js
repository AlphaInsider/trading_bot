const _ = require('lodash');
const j = require('joi');
const axios = require('axios');
const math = require('mathjs');
const moment = require('moment');

class TastyTrade {
  //CHECK: constructor <tastytrade_email> <tastytrade_password> <account_id>
  constructor(params = {}) {
    //validate
    j.assert(params, j.object({
      tastytrade_email: j.string().required(),
      tastytrade_password: j.string().required(),
      account_id: j.string().required()
    }).required());
    
    //data
    this.type = 'tastytrade';
    this.live = true;
    this.tastytradeEmail = params.tastytrade_email;
    this.tastytradePassword = params.tastytrade_password;
    this.accountId = params.account_id;
    
    this.authToken = undefined;
    this.refreshToken = undefined;
    this.tokenExp = undefined;
    
    this.maintenanceMargin = '0.3';
    this.minTotal = '6';
    this.brokerStocks = undefined;
    
    //init
    this.ready = (async () => {
      await this._getToken();
    })();
  }
  
  //DONE: destroy
  async destroy() {}
  
  //CHECK: verify
  async verify() {
    //get TastyTrade status
    return this._request({
      type: 'get',
      url: '/customers/me/accounts/'+this.accountId
    })
    //valid
    .then((data) => {
      if(!data['account-number']) throw new Error('Invalid response.');
      return 'valid';
    })
    //invalid
    .catch((error) => {
      if(!error.response.data.error) throw new Error('Invalid response.');
      return 'invalid';
    })
    //offline
    .catch(() => {
      return 'offline';
    });
  }
  
  //DONE: mapStocks --{alpha_stocks}--
  async mapStocks(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stocks: j.object().optional()
    }).required());
    
    //remove expired stocks
    this.brokerStocks = _.pickBy(this.brokerStocks, (brokerStock) => {
      let prevAlphaStock = brokerStock.alpha_stock;
      let newAlphaStock = params.alpha_stocks[prevAlphaStock.stock_id];
      return newAlphaStock && newAlphaStock.expires_at === prevAlphaStock.expires_at;
    });
    
    //filter new alpha stocks to get
    let existingBrokerAlphaStocks = _.map(this.brokerStocks, 'alpha_stock.stock_id');
    let newAlphaStocksToGet = _.filter(params.alpha_stocks, (item) => {
      return !existingBrokerAlphaStocks.includes(item.stock_id);
    });
    
    //get new stock details
    let newStocks = await newAlphaStocksToGet.reduce((chain, curr) => chain.then(async (prev) => {
      //check if stock or crypto
      let isStock = curr.security === 'stock';
      
      //get stock data
      let stock = await this._request({
        type: 'get',
        url: ((isStock) ? '/instruments/equities' : '/instruments/cryptocurrencies'),
        query: {
          symbol: this._getStockSymbol({alpha_stock: curr})
        }
      })
      .then((data) => j.attempt(data, j.array().min(1).required())[0]);
      
      //error if stock is not trade-able
      if(!stock.active) throw new Error('Security is not trade-able.');
      
      //filter data
      let filteredData = {
        id: stock.symbol,
        symbol: stock.symbol,
        security: curr.security,
        marginable: isStock,
        precision_amount: ((isStock) ? ((stock['is-fractional-quantity-eligible']) ? '5' : '0') : _.chain(stock['destination-venue-symbols']).filter(item => item.routable).minBy('max-quantity-precision').value()['max-quantity-precision']+''),
        alpha_stock: curr
      };
      
      //set broker stock
      prev[filteredData.id] = filteredData;
      
      //return
      return prev;
    }), Promise.resolve({}));
    
    //set broker stocks
    this.brokerStocks = {...this.brokerStocks, ...newStocks};
    
    //return
    return this.brokerStocks;
  }
  
  //CHECK: getAccountDetails
  async getAccountDetails() {
    //get account details, balances, and positions
    let [accountDetails, accountBalances, positions] = await Promise.all([
      this._request({
        type: 'get',
        url: '/customers/me/accounts/'+this.accountId
      }),
      this._request({
        type: 'get',
        url: '/accounts/'+this.accountId+'/balances'
      }),
      this._request({
        type: 'get',
        url: '/accounts/'+this.accountId+'/positions'
      })
    ]);
    
    //get portfolio value
    let portfolioValue = accountBalances['net-liquidating-value'];
    
    //get margin type
    let marginType = 'cash';
    if(accountDetails['margin-or-cash'] === 'Margin') marginType = 'reg_t';
    
    //calculate buying power
    let buyingPower = portfolioValue;
    if(accountDetails['margin-or-cash'] === 'Margin') {
      buyingPower = math.evaluate('bignumber(a) / 0.5', {a: portfolioValue}).toString(); //replace 0.5 with this.maintenanceMargin for full margin
      let dayTradingBuyingPower = math.evaluate('max(bignumber(a), 0) / bignumber(b)', {a: accountBalances['day-trade-excess'], b: this.maintenanceMargin}).toString();
      if(math.evaluate('a < b', {a: dayTradingBuyingPower, b: buyingPower})) buyingPower = dayTradingBuyingPower;
    }
    
    //format positions
    positions = positions.map((position) => {
      return {
        id: position.symbol,
        amount: math.evaluate('bignumber(a) * bignumber(b)', {a: position.quantity, b: ((position['quantity-direction'] === 'Long') ? '1' : '-1')}).toString()
      };
    });
    
    //return
    return {
      type: this.type,
      account_id: accountDetails['account-number'],
      live: this.live,
      margin_type: marginType,
      value: portfolioValue,
      buying_power: buyingPower,
      initial_buying_power_percent: '0.4',
      positions: positions
    }
  }
  
  //DONE: closeAllPositions
  async closeAllPositions() {
    //cancel all open orders
    await this.cancelAllOpenOrders();
    
    //get positions
    let positions = await this._request({
      type: 'get',
      url: '/accounts/'+this.accountId+'/positions'
    });
    
    //close all positions
    let orders = await Promise.all(positions.map((item) => {
      return this.newOrder({
        broker_stock_id: item.symbol,
        type: 'close',
        action: ((item['quantity-direction'] === 'Long') ? 'sell' : 'buy'),
        amount: item.quantity
      });
    }));
    
    //return
    return _.flatten(orders);
  }
  
  //CHECK: newOrder <broker_stock_id> <type> <action> <amount> --price--
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
    
    //determine if crypto or stock
    let isCrypto = params.broker_stock_id.includes('/USD');
    
    //break amount into whole and fractional shares
    let fullAmount = params.amount;
    if(!['close'].includes(params.type)) {
      let brokerStock = this.brokerStocks[params.broker_stock_id];
      fullAmount = math.fix(params.amount, brokerStock.precision_amount).toString();
    }
    let wholeShares = math.fix(fullAmount, 0).toString();
    let fractionalShares = math.evaluate('bignumber(a) - bignumber(b)', {a: fullAmount, b: wholeShares}).toString();
    
    //execute orders
    let orders = await Promise.all([wholeShares, fractionalShares].map(async (amount) => {
      //skip if amount is zero
      if(math.evaluate('bignumber(a) == 0', {a: amount})) return undefined;
      
      //skip if sell_short and fractional
      if(params.type === 'sell_short' && math.evaluate('a < 1', {a: amount})) return undefined;
      
      //skip if less than min total
      if(params.type !== 'close') {
        let total = math.evaluate('bignumber(a) * bignumber(b)', {a: amount, b: params.price}).toString();
        if(math.evaluate('a < b', {a: total, b: this.minTotal})) return undefined;
      }
      
      //execute order
      let order = await this._request({
        type: 'post',
        url: '/accounts/'+this.accountId+'/orders',
        query: {
          'order-type': 'Market',
          'time-in-force': ((isCrypto) ? 'IOC' : 'Day'),
          'legs': [
            {
              'instrument-type': ((isCrypto) ? 'Cryptocurrency' : 'Equity'),
              'action': ((params.action === 'buy') ? 'Buy' : 'Sell')+' to '+((['buy_long', 'sell_short'].includes(params.type)) ? 'Open' : 'Close'),
              'quantity': amount,
              'symbol': params.broker_stock_id
            }
          ]
        }
      });
      //return
      return order.order;
    }));
    orders = _.compact(orders);
    
    //wait for orders to complete, expire 20s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 20) throw new Error('Order failed to complete.');
      //get open orders
      let openOrders = await this._getOpenOrders();
      //repeat if order is not filled
      let orderIds = _.map(orders, 'id');
      return openOrders.filter((item) => orderIds.includes(item.id)).length > 0;
    }, 1000);
    
    //return
    return this._formatOrders({orders: orders});
  }
  
  //CHECK: cancelAllOpenOrders
  async cancelAllOpenOrders() {
    //get cancelable open orders
    let openOrders = await this._getOpenOrders({cancelable: true});
    
    //cancel orders
    let canceledOrders = await Promise.all(openOrders.map((order) => {
      return this._request({
        type: 'delete',
        url: '/accounts/'+this.accountId+'/orders/'+order.id
      });
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
  
  //DONE: _request <type> <url> --query-- --headers--
  async _request(params = {}) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      type: j.string().valid('get', 'post', 'delete').required(),
      url: j.string().required(),
      query: j.object().optional(),
      headers: j.object().optional()
    }).required());
    
    //get auth token
    let authToken = await this._getToken();
    
    //make request
    let response = await axios({
      method: params.type,
      headers: {
        Authorization: authToken,
        ...params.headers
      },
      url: 'https://api.tastyworks.com' + params.url,
      params: ((params.type === 'get' && params.query) ? params.query : undefined),
      data: ((params.type === 'post' && params.query) ? params.query : undefined)
    })
    .then((data) => data.data.data)
    .then((data) => ((data.items) ? data.items : data));
    
    //return
    return response;
  }
  
  //DONE: _getToken
  async _getToken() {
    //getTokens --throwOnError--
    let getTokens = async () => {
      return axios({
        method: 'post',
        url: 'https://api.tastyworks.com/sessions',
        data: {
          'login': this.tastytradeEmail,
          'remember-me': true,
          ...((this.refreshToken === undefined) ? {'password': this.tastytradePassword} : {'remember-token': this.refreshToken})
        },
        timeout: 3000
      })
      .then((data) => data.data.data)
      .catch(async (error) => {
        if(this.refreshToken !== undefined) {
          this.refreshToken = undefined;
          return getTokens();
        }
        else {
          throw new Error('Invalid email or password.');
        }
      });
    }
    
    //check if token expired
    let tokenExpired = math.evaluate('a >= b', {a: moment().utc().unix(), b: this.tokenExp || 0});
    
    //if token is pending, wait for it
    if(this.authToken === 'pending') {
      //wait for authToken, expire 10s
      await this._wait(async (time) => {
        //error, waited too long
        if(time >= 10) throw new Error('Failed to get auth token.');
        //repeat if authToken is still pending
        return this.authToken === 'pending';
      }, 1000);
    }
    
    //if token expired or doesn't exist, get a new one
    else if(tokenExpired || this.authToken === undefined) {
      //set authToken to pending so other requests wait
      this.authToken = 'pending';
      //get new auth and refresh tokens
      let tokens = await getTokens();
      //set tokens and data
      this.refreshToken = tokens['remember-token'];
      this.tokenExp = moment().add(20, 'hours').utc().unix();
      this.authToken = tokens['session-token'];
    }
    
    //return
    return this.authToken;
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
  
  //DONE: _getOpenOrders --cancelable--
  async _getOpenOrders(params = {}) {
    //validate
    j.assert(params, j.object({
      cancelable: j.boolean().optional()
    }).required());
    
    //get live orders
    let liveOrders = await this._request({
      type: 'get',
      url: '/accounts/'+this.accountId+'/orders/live'
    });
    
    //filter orders
    let filteredOrders = liveOrders.filter((item) => {
      //filter out terminal orders
      if(['Filled', 'Cancelled', 'Expired', 'Rejected', 'Removed', 'Partially Removed'].includes(item.status)) return false;
      //filter out cancelable orders
      if(params && params.cancelable !== undefined && item.cancellable !== params.cancelable) return false;
      //return
      return true;
    });
    
    //return
    return filteredOrders;
  }
  
  //DONE: _getStockSymbol <{alpha_stock}>
  _getStockSymbol(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stock: j.object().required()
    }).required());
    
    //alpha stock
    let alphaStock = params.alpha_stock;
    
    //handle stock symbol
    if(alphaStock.security === 'stock') {
      return alphaStock.stock;
    }
    
    //handle crypto symbol
    else if(alphaStock.security === 'cryptocurrency') {
      return alphaStock.stock + '/USD';
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
    return _.map(params.orders, 'id');
  }
}

module.exports = TastyTrade;