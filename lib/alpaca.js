const _ = require('lodash');
const j = require('joi');
const math = require('mathjs');
const AlpacaAPI = require('@alpacahq/alpaca-trade-api');
const moment = require('moment');

class Alpaca {
  //DONE: constructor <alpaca_key> <alpaca_secret>
  constructor(params = {}) {
    //validate
    j.assert(params, j.object({
      alpaca_key: j.string().required(),
      alpaca_secret: j.string().required()
    }).required());
    
    //data
    this.type = 'alpaca';
    this.allocationType = 'stock';
    this.live = !_.startsWith(params.alpaca_key, 'P')
    this.alp = new AlpacaAPI({
      keyId: params.alpaca_key,
      secretKey: params.alpaca_secret,
      paper: !this.live
    });
    
    this.maintenanceMargin = '0.25';
    this.minTotal = '1';
    this.brokerStocks = {};
    
    //init
    this.ready = (async () => {})();
  }
  
  //DONE: destroy
  async destroy() {}
  
  //DONE: verify
  async verify() {
    //get Alpaca status
    return this.alp.getAccount()
    //valid
    .then((data) => {
      if(!data.id) throw new Error('Invalid response.');
      return 'valid';
    })
    //invalid
    .catch((error) => {
      if(!error.response.data.message) throw new Error('Unable to connect.');
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
      let newBrokerStocks = await newStocks.reduce((chain, curr) => chain.then(async (prev) => {
        //get stock details
        let stock = await this.alp.getAsset(curr);
        //error if stock is not tradable or is crypto asset
        if(!stock.tradable || stock.class === 'crypto') throw new Error('Security is not tradable.');
        //filter broker data
        let info = {
          id: stock.symbol,
          symbol: stock.symbol,
          security: 'stock',
          marginable: stock.marginable,
          step_size: ((stock.fractionable) ? '0.00001' : '1'),
          expires_at: moment().add(60*60, 'seconds').toISOString()
        };
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
    //error if any stock is not of type stock
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
    //get account details and positions
    let [accountDetails, positions] = await Promise.all([
      this.alp.getAccount(),
      this.alp.getPositions()
    ]);
    
    //error if any positions are crypto
    if(_.find(positions, {asset_class: 'crypto'})) throw new Error('Unable to trade cryptocurrency positions.');
    
    //calculate buying power
    let buyingPower = math.evaluate('bignumber(a) / 0.5', {a: accountDetails.portfolio_value}).toString();
    if(accountDetails.pattern_day_trader) {
      buyingPower = math.evaluate('bignumber(a) / 0.5', {a: accountDetails.portfolio_value}).toString(); //replace 0.5 with this.maintenanceMargin for full margin
      let dayTradingBuyingPower = math.evaluate('max(bignumber(a) - bignumber(b), 0) / bignumber(c)', {a: accountDetails.last_equity, b: accountDetails.last_maintenance_margin, c: this.maintenanceMargin}).toString();
      if(math.evaluate('a < b', {a: dayTradingBuyingPower, b: buyingPower})) buyingPower = dayTradingBuyingPower;
    }
    
    //format positions
    positions = _.map(positions, (position) => {
      return {
        id: position.symbol,
        amount: position.qty
      };
    });
    
    //return
    return {
      type: this.type,
      allocation_type: this.allocationType,
      account_id: accountDetails.account_number,
      live: this.live,
      margin_type: 'reg_t',
      value: accountDetails.portfolio_value,
      buying_power: buyingPower,
      initial_buying_power_percent: '0.95',
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
    
    //create new order
    let order = await Promise.resolve().then(async () => {
      //if close, create closing order
      if(params.type === 'close') {
        return this.alp.closePosition(brokerStock.symbol);
      }
      
      //round amount
      let fullShares = math.evaluate('floor(bignumber(a) / bignumber(b)) * bignumber(b)', {a: params.amount, b: brokerStock.step_size}).toString();
      if(['sell_short'].includes(params.type)) {
        fullShares = math.fix(params.amount, 0).toString();
      }
      
      //skip if amount is zero
      if(math.evaluate('bignumber(a) == 0', {a: fullShares})) return;
      
      //skip if less than min total
      let total = math.evaluate('bignumber(a) * bignumber(b)', {a: fullShares, b: params.price}).toString()
      if(math.evaluate('a < b', {a: total, b: this.minTotal})) return;
      
      //new order
      return this.alp.createOrder({
        symbol: brokerStock.symbol,
        side: params.action,
        type: 'market',
        time_in_force: 'day',
        qty: fullShares
      });
    });
    
    //skip if no order was created
    if(!order) return [];
    
    //wait for order to complete, expire 20s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 60) throw new Error('Order failed to complete.');
      //get order
      order = await this.alp.getOrder(order.id);
      //repeat if order is not filled
      return order.status !== 'filled';
    }, 1000);
    
    //return
    return this._formatOrders({orders: [order]});
  }
  
  //DONE: cancelAllOpenOrders
  async cancelAllOpenOrders() {
    //cancel all orders
    let canceledOrders = await this.alp.cancelAllOrders();
    
    //wait for all open orders to cancel, expire 10s
    await this._wait(async (time) => {
      //error, waited too long
      if(time >= 20) throw new Error('Failed to cancel all open orders.');
      //get open orders
      let openOrders = await this.alp.getOrders({status: 'open'});
      //repeat if openOrders still exist
      return openOrders.length > 0;
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

module.exports = Alpaca;