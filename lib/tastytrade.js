const _ = require('lodash');
const j = require('joi');
const axios = require('axios');
const math = require('mathjs');
const moment = require('moment');

class TastyTrade {
  //DONE: constructor <tastytrade_email> <tastytrade_password> <account_id>
  constructor(params = {}) {
    //validate
    j.assert(params, j.object({
      tastytrade_email: j.string().required(),
      tastytrade_password: j.string().required(),
      account_id: j.string().required()
    }).required());
    
    //data
    this.type = 'tastytrade';
    this.allocationType = 'stock';
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
  
  //DONE: verify
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
      if(error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED' || !error.response.data.error) throw new Error('Unable to connect.');
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
      //get new stocks to add to broker stock list
      let newBrokerStocks = await newStocks.reduce((chain, curr) => chain.then(async (prev) => {
        //get stock data
        let stock = await this._request({
          type: 'get',
          url: '/instruments/equities',
          query: {
            symbol: curr
          }
        })
        .then((data) => j.attempt(data, j.array().min(1).required())[0]);
        //error if stock is not tradable
        if(!stock.active) throw new Error('Security is not tradable.');
        //filter data
        let info = {
          id: stock.symbol,
          symbol: stock.symbol,
          security: 'stock',
          marginable: true,
          step_size: (stock['is-fractional-quantity-eligible'] ? '0.00001' : '1'),
          expires_at: moment().add(60*60*24, 'seconds').toISOString()
        };
        //return
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
    if(_.find(params.alpha_stocks, (stock) => stock.security !== 'stock')) throw new Error('Some securities are not of type stock.');
    
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
      allocation_type: this.allocationType,
      account_id: accountDetails['account-number'],
      live: this.live,
      margin_type: marginType,
      value: portfolioValue,
      buying_power: buyingPower,
      initial_buying_power_percent: '0.35',
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
    
    //break amount into whole and fractional shares
    let fullShares =  math.evaluate('floor(bignumber(a) / bignumber(b)) * bignumber(b)', {a: params.amount, b: brokerStock.step_size}).toString();
    let wholeShares = math.fix(fullShares, 0).toString();
    let fractionalShares = math.evaluate('bignumber(a) - bignumber(b)', {a: fullShares, b: wholeShares}).toString();
    
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
          'time-in-force': 'Day',
          'legs': [
            {
              'instrument-type': 'Equity',
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
  
  //DONE: cancelAllOpenOrders
  async cancelAllOpenOrders() {
    //get cancelable open orders
    let openOrders = await this._getOpenOrders({cancelable: true});
    
    //cancel orders
    let canceledOrders = await Promise.all(openOrders.map((order) => {
      return this._request({
        type: 'delete',
        url: '/accounts/'+this.accountId+'/orders/'+order.id
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