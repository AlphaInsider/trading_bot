const _ = require('lodash');
const j = require('joi');
const math = require('mathjs');
const AlpacaAPI = require('@alpacahq/alpaca-trade-api');

class Alpaca {
  //CHECK: constructor <alpaca_key> <alpaca_secret>
  constructor(params) {
    //validate
    j.assert(params, j.object({
      alpaca_key: j.string().required(),
      alpaca_secret: j.string().required()
    }).required());
    
    //data
    this.type = 'alpaca';
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
  
  //CHECK: destroy
  async destroy() {}
  
  //CHECK: mapStocks --{alpha_stocks}--
  async mapStocks(params) {
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
    let calcPrecision = (increment) => {
      let decimalPart = (increment+'').split('.')[1];
      return ((decimalPart) ? decimalPart.length : 0);
    };
    let newStocks = await newAlphaStocksToGet.reduce((chain, curr) => chain.then(async (prev) => {
      //get stock
      let stock = await this.alp.getAsset(this._getStockSymbol({alpha_stock: curr}));
      //error if stock is not trade-able
      if(!stock.tradable) throw new Error('Security is not trade-able.');
      //filter broker data
      let filteredData = {
        id: stock.symbol,
        symbol: stock.symbol,
        security: ((stock.class === 'crypto') ? 'cryptocurrency' : 'stock'),
        marginable: stock.marginable,
        precision_amount: ((stock.min_trade_increment) ? calcPrecision(stock.min_trade_increment) : (stock.fractionable) ? 9 : 0)+'',
        alpha_stock: curr
      };
      //set broker stock
      prev[filteredData.id] = filteredData;
      if(curr.security === 'cryptocurrency') prev[_.replace(filteredData.id, '/', '')] = filteredData;
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
    //get account details and positions
    let [accountDetails, positions] = await Promise.all([
      this.alp.getAccount(),
      this.alp.getPositions()
    ]);
    
    //calculate buying power
    let buyingPower = math.evaluate('bignumber(a) / 0.5', {a: accountDetails.portfolio_value}).toString();
    if(accountDetails.pattern_day_trader) {
      buyingPower = math.evaluate('bignumber(a) / bignumber(b)', {a: accountDetails.portfolio_value, b: this.maintenanceMargin}).toString();
      let dayTradingBuyingPower = math.evaluate('max(bignumber(a) - bignumber(b), 0) / bignumber(c)', {a: accountDetails.last_equity, b: accountDetails.last_maintenance_margin, c: this.maintenanceMargin}).toString();
      if(math.evaluate('a < b', {a: dayTradingBuyingPower, b: buyingPower})) buyingPower = dayTradingBuyingPower;
    }
    
    //format positions
    positions = positions.map((position) => {
      if(position.asset_class === 'crypto' && !position.symbol.includes('/')) {
        position.symbol = _.trimEnd(position.symbol, 'USD') + '/USD';
      }
      return {
        id: position.symbol,
        amount: position.qty
      };
    });
    
    //return
    return {
      type: this.type,
      account_id: accountDetails.account_number,
      live: this.live,
      margin_types_available: ['reg_t'],
      value: accountDetails.portfolio_value,
      buying_power: buyingPower,
      initial_buying_power_percent: '0.95',
      positions: positions
    }
  }
  
  //CHECK: closeAllPositions
  async closeAllPositions() {
    //cancel all open orders
    await this.cancelAllOpenOrders();
    
    //get positions
    let positions = await this.alp.getPositions();
    
    //close all positions
    let orders = await Promise.all(positions.map((item) => {
      return this.newOrder({
        broker_stock_id: item.symbol,
        type: 'close',
        action: ((item.side === 'long') ? 'sell' : 'buy'),
        amount: math.evaluate('abs(bignumber(a))', {a: item.qty}).toString()
      });
    }));
    
    //return
    return _.flatten(orders);
  }
  
  //CHECK: newOrder <broker_stock_id> <type> <action> <amount> --price--
  async newOrder(params) {
    //validate
    j.assert(params, j.object({
      broker_stock_id: j.string().required(),
      type: j.string().valid('close', 'sell_long', 'buy_short', 'buy_long', 'sell_short').required(),
      action: j.string().valid('buy', 'sell').required(),
      amount: j.number().unsafe().greater(0).required(),
      price: j.number().greater(0).optional()
    }).required());
    if(params.type !== 'close' && !params.price) throw new Error('Price is required.');
    
    //symbol
    let symbol = _.replace(params.broker_stock_id, '/', '');
    
    //create new order
    let order = await Promise.resolve().then(async () => {
      //if close, create closing order
      if(params.type === 'close') {
        return this.alp.closePosition(symbol);
      }
      
      //get stock
      let brokerStock = this.brokerStocks[symbol];
      
      //round amount
      let amount = math.fix(params.amount, brokerStock.precision_amount).toString();
      if(['sell_short'].includes(params.type)) {
        amount = math.fix(params.amount, 0).toString();
      }
      
      //skip if amount is zero
      if(math.evaluate('bignumber(a) == 0', {a: amount})) return undefined;
      
      //skip if less than min total
      let total = math.evaluate('bignumber(a) * bignumber(b)', {a: amount, b: params.price}).toString()
      if(math.evaluate('a < b', {a: total, b: this.minTotal})) return undefined;
      
      //new order
      return this.alp.createOrder({
        symbol: symbol,
        side: params.action,
        type: 'market',
        time_in_force: ((brokerStock.security === 'stock') ? 'day' : 'gtc'),
        qty: amount
      });
    });
    
    //skip if no order was created
    if(!order) return undefined;
    
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
  
  //CHECK: cancelAllOpenOrders
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
  
  //CHECK: _wait <fn> --wait--
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
  
  //CHECK: _getStockSymbol <{alpha_stock}>
  _getStockSymbol(params) {
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
  
  //CHECK: _formatOrders --[{orders}]--
  _formatOrders(params) {
    //validate
    j.assert(params, j.object({
      orders: j.array().items(j.object().optional()).required()
    }).required());
    
    //format orders
    return _.map(params.orders, 'id');
  }
}

module.exports = Alpaca;