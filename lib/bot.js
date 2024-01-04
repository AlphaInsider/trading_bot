const _ = require('lodash');
const j = require('joi');
const math = require('mathjs');
const EventEmitter = require('events');
const Cron = require('cron').CronJob;

const lib = require('./index');

class Bot extends EventEmitter {
  //DONE: constructor <{alphainsider}> <{broker}> <strategy_id> --rebalance_on_start-- --close_on_stop--
  constructor(params) {
    //init event emitter
    super();
    
    //validate
    j.assert(params, j.object({
      alphainsider: j.object().required(),
      broker: j.object().required(),
      strategy_id: j.string().required(),
      rebalance_on_start: j.boolean().optional(),
      close_on_stop: j.boolean().optional()
    }).required());
    
    //AlphaInsider, Broker
    try {
      //AlphaInsider
      this.AlphaInsider = new lib.AlphaInsider({
        alphainsider_key: params.alphainsider.alphainsider_key
      });
      //Broker
      if(params.broker.type === 'alpaca') {
        this.Broker = new lib.Alpaca({
          alpaca_key: params.broker.alpaca_key,
          alpaca_secret: params.broker.alpaca_secret
        });
      }
      else if(params.broker.type === 'tastytrade') {
        this.Broker = new lib.TastyTrade({
          tastytrade_email: params.broker.tastytrade_email,
          tastytrade_password: params.broker.tastytrade_password,
          account_id: params.broker.account_id
        });
      }
      else throw new Error('Invalid broker type.');
    }
    catch(error) {
      if(this.AlphaInsider) this.AlphaInsider.destroy();
      if(this.Broker) this.Broker.destroy();
      throw error;
    }
    
    //data
    this.strategyId = params.strategy_id;
    this.rebalanceOnStart = ((params.rebalance_on_start !== undefined) ? params.rebalance_on_start : true);
    this.closeOnStop = ((params.close_on_stop !== undefined) ? params.close_on_stop : true);
    
    this.prevStrategyPositions = undefined;
    this.alphaBrokerIndex = {};
    
    this.status = {
      running: false,
      rebalancing: false,
      closing: false,
      scheduled_rebalance: false,
      scheduled_close: false
    }
    
    this.repeatRebalance = false;
    
    this.cron = new Cron('30 */5 * * * *', () => {
      this._cronSchedule().catch((error) => {});
    }, null, true, 'UTC');
    
    //init
    this.ready = (async () => {})();
  }
  
  //DONE: destroy
  async destroy() {
    if(this.cron) this.cron.stop();
    if(this.AlphaInsider) await this.AlphaInsider.destroy();
    if(this.Broker) await this.Broker.destroy();
    this.AlphaInsider.removeAllListeners();
    this.repeatRebalance = false;
  }
  
  //DONE: start --rebalance--
  async start(params = {}) {
    //validate
    j.assert(params, j.object({
      rebalance: j.boolean().optional()
    }).required());
    
    //skip if running
    if(this.status.running) return;
    
    //stop existing bot
    await this.stop({close: false});
    
    //update running status
    await this._updateStatus({running: true});
    
    //on message, rebalance
    this.AlphaInsider.on('message', async (message) => {
      await this.rebalance().catch((error) => {});
    });
    
    //on reconnecting, emit warning
    this.AlphaInsider.on('reconnecting', async () => {
      this.emit('warning', {info: {type: 'reconnecting'}, message: 'Connection closed, reconnecting.'});
    });
    
    //on error, handle error
    this.AlphaInsider.on('error', async (error) => {
      this.emit('error', {info: {type: 'websocket_error', data: error}, message: 'Websocket error, stopping bot.'});
      await this.stop();
    });
    
    //start websocket
    await this.AlphaInsider.wsConnect({
      strategy_id: this.strategyId
    });
    
    //rebalance
    if(params.rebalance === true || (params.rebalance === undefined && this.rebalanceOnStart)) {
      await this.rebalance().catch((error) => {});
    }
  }
  
  //DONE: stop --close--
  async stop(params = {}) {
    //validate
    j.assert(params, j.object({
      close: j.boolean().optional()
    }).required());
    
    //skip if not running or is rebalancing
    if(!this.status.running || this.status.rebalancing) return;
    
    //stop watching for changes
    await this.AlphaInsider.wsClose();
    this.AlphaInsider.removeAllListeners();
    this.repeatRebalance = false;
    
    //force stop if already closing
    if(this.status.closing || this.status.scheduled_close) {
      return this._updateStatus({
        running: false,
        rebalancing: false,
        closing: false,
        scheduled_rebalance: false,
        scheduled_close: false
      });
    }
    
    //close on stop
    if(params.close === true || (params.close === undefined && this.closeOnStop)) {
      await this.closeAllPositions().catch((error) => {});
    }

    //update status
    await this._updateStatus({
      running: (this.status.closing || this.status.scheduled_close),
      rebalancing: false,
      scheduled_rebalance: false
    });
  }
  
  //DONE: getStatus
  async getStatus() {
    if(this.status.closing) return 'closing';
    else if(this.status.scheduled_close) return 'scheduled_close';
    else if(this.status.rebalancing) return 'rebalancing';
    else if(this.status.scheduled_rebalance) return 'scheduled_rebalance';
    else if(this.status.running) return 'on';
    else return 'off';
  }
  
  //DONE: executeOrders <[[{orders}]]>
  async executeOrders(params) {
    //validate
    j.assert(params, j.object({
      orders: j.array().items(
        j.array().items(j.object().optional()).optional()
      ).required()
    }).required());
    
    //foreach group of orders
    let executedOrders = await params.orders.reduce((chain, curr) => chain.then(async (prev) => {
      //foreach order
      let orders = await Promise.all(curr.map(async (order) => {
        //skip if less than min total
        if(order.type !== 'close' && math.evaluate('a < b', {a: order.total, b: this.Broker.minTotal})) return undefined;
        //execute order
        return this.Broker.newOrder({
          broker_stock_id: order.id,
          type: order.type,
          action: order.action,
          amount: order.amount,
          price: order.price
        });
      }));
      //return
      return _.concat(prev, orders);
    }), Promise.resolve([]));
    
    //return
    return _.compact(executedOrders);
  }
  
  //DONE: calculateNewOrders
  async calculateNewOrders() {
    //get strategy details and broker details
    let [strategyDetails, brokerDetails] = await Promise.all([
      this.AlphaInsider.getStrategyDetails({strategy_id: this.strategyId}),
      this.Broker.getAccountDetails()
    ]);
    
    //error if not a stock strategy
    if(strategyDetails.type !== 'stock') throw new Error('Must be a stock strategy.');
    
    //error if account is not a margin account
    if(!brokerDetails.margin_types_available.includes('reg_t')) throw new Error('Account must be a margin account.');
    
    //error if account is less than 25k
    if(math.evaluate('a < 25000', {a: brokerDetails.value})) throw new Error('Account must maintain a value of at least $25,000.');
    
    //error if broker buying power is negative
    if(math.evaluate('a < 0', {a: brokerDetails.buying_power})) throw new Error('Broker buying power can not be negative.');
    
    //map new or expired stock details
    let alphaStocks = await this.AlphaInsider.mapStocks({alpha_stock_ids: _.map(strategyDetails.positions, 'id')});
    let brokerStocks = await this.Broker.mapStocks({alpha_stocks: alphaStocks});
    this.alphaBrokerIndex = _.values(brokerStocks).reduce((prev, curr) => {
      prev[curr.alpha_stock.stock_id] = curr.id;
      return prev;
    }, {});
    
    //skip if positions haven't changed
    let prevStrategyPositions = this.prevStrategyPositions;
    let currStrategyPositions = _.chain(strategyDetails.positions).map(({id, amount}) => ({id, amount})).orderBy('id', 'desc').value();
    this.prevStrategyPositions = currStrategyPositions;
    if(JSON.stringify(prevStrategyPositions) === JSON.stringify(currStrategyPositions)) return [];
    
    //get prices
    let prices = _.reduce(strategyDetails.positions, (prev, curr) => {
      let brokerId = this.alphaBrokerIndex[curr.id];
      if(brokerId === undefined) throw new Error('No broker stock mapping found for stock_id: '+curr.id);
      if(math.evaluate('a <= 0 or b <= 0', {a: curr.bid, b: curr.ask})) throw new Error('Invalid stock price for stock_id: '+curr.id);
      prev[brokerId] = {bid: curr.bid, ask: curr.ask};
      return prev;
    }, {});
    
    //current state
    let currentState = _.reduce(brokerDetails.positions, (prev, curr) => {
      if(math.evaluate('a != 0', {a: curr.amount})) {
        prev[curr.id] = curr.amount;
      }
      return prev;
    }, {});
    
    //final state
    let {finalState, finalStatePositionsTotal} = _.reduce(strategyDetails.positions, (prev, curr) => {
      let brokerId = this.alphaBrokerIndex[curr.id];
      let isLong = math.evaluate('a >= 0', {a: curr.amount});
      let price = ((isLong) ? curr.bid : curr.ask);
      let total = math.evaluate('bignumber(a) * bignumber(b)', {
        a: brokerDetails.buying_power,
        b: curr.percent
      }).toString();
      prev.finalState[brokerId] = math.evaluate('bignumber(a) / bignumber(b) * bignumber(c)', {
        a: total,
        b: price,
        c: ((isLong) ? '1' : '-1')
      }).toString();
      prev.finalStatePositionsTotal = math.evaluate('bignumber(a) + bignumber(b)', {a: prev.finalStatePositionsTotal, b: total}).toString();
      return prev;
    }, {finalState: {}, finalStatePositionsTotal: 0});
    
    //error if finalStatePositionsTotal exceeds max buying power
    if(math.evaluate('a > b', {a: finalStatePositionsTotal, b: brokerDetails.buying_power})) throw new Error('Calculated orders exceed max buying power.');
    
    //calculate new orders to go from current state to final state
    let isPositive = (a) => math.evaluate('a > 0', {a: a});
    let subtract = (a, b) => math.evaluate('bignumber(a) - bignumber(b)', {a: a, b: b}).toString();
    let getAction = (a) => ((math.evaluate('a >= 0', {a: a})) ? 'buy' : 'sell');
    let newOrders = _.union(Object.keys(currentState), Object.keys(finalState)).reduce((prev, curr) => {
      //get values
      let currentAmount = currentState[curr] || 0;
      let finalAmount = finalState[curr] || 0;
      
      //skip if currentAmount and finalAmount are the same
      if(math.evaluate('a == b', {a: currentAmount, b: finalAmount})) return prev;
      
      //close opposite positions and unmatched positions
      let oppositeSigns = math.evaluate('bignumber(a) * bignumber(b) < 0', {a: currentAmount, b: finalAmount});
      if(oppositeSigns || math.evaluate('a == 0', {a: finalAmount})) {
        let amount = subtract(0, currentAmount);
        prev.push({
          id: curr,
          type: 'close',
          action: getAction(amount),
          amount: math.evaluate('abs(bignumber(a))', {a: amount}).toString()
        });
        currentAmount = 0;
      }
      
      //increase or decrease positions
      let amount = subtract(finalAmount, currentAmount);
      let action = getAction(amount);
      if(math.evaluate('a != 0', {a: amount})) {
        //get price and total
        let quote = prices[curr];
        let price = ((action === 'buy') ? quote.ask : quote.bid)
        let total = math.evaluate('bignumber(a) * bignumber(b)', {a: amount, b: price}).toString();
        //determine order type
        let type = undefined;
        if(action === 'sell' && isPositive(finalAmount)) type = 'sell_long';
        if(action === 'buy' && !isPositive(finalAmount)) type = 'buy_short';
        if(action === 'buy' && isPositive(finalAmount)) type = 'buy_long';
        if(action === 'sell' && !isPositive(finalAmount)) type = 'sell_short';
        //create new order
        prev.push({
          id: curr,
          type: type,
          action: action,
          amount: math.evaluate('abs(bignumber(a))', {a: amount}).toString(),
          total: math.evaluate('abs(bignumber(a))', {a: total}).toString(),
          price: price
        });
      }
      //return
      return prev;
    }, []);
    
    //group orders for parallel execution
    let decreaseOrders = _.filter(newOrders, (item) => ['close', 'sell_long', 'buy_short'].includes(item.type));
    let increaseOrders = _.filter(newOrders, (item) => ['buy_long', 'sell_short'].includes(item.type));
    
    //calculate buying power before increase
    let buyingPowerBeforeIncrease = math.evaluate('bignumber(a) - sum(bignumber(a))', {a: finalStatePositionsTotal, b: _.map(increaseOrders, 'total')}).toString();
    
    //group increase orders by initial buying power
    let remainingOrders = _.orderBy(increaseOrders, ['action', (item) => math.evaluate('round(bignumber(a))', {a: item.total}).toNumber()], ['asc', 'desc']);
    let currentGroup = [];
    let groupedOrders = [];
    let remainingBuyingPower = math.evaluate('bignumber(a) - bignumber(b)', {a: brokerDetails.buying_power, b: buyingPowerBeforeIncrease}).toString();
    let currentGroupBuyingPower = math.evaluate('bignumber(a) * bignumber(b)', {a: remainingBuyingPower, b: brokerDetails.initial_buying_power_percent}).toString();
    while(remainingOrders.length > 0) {
      //get order details
      let order = remainingOrders.pop();
      let remainingOrderTotal = order.total;
      
      //while remainingOrderTotal and currentGroupBuyingPower are greater than minTotal, add order into groups
      while(math.evaluate('(a >= c) and (b >= c)', {a: remainingOrderTotal, b: currentGroupBuyingPower, c: this.Broker.minTotal})) {
        //calculate new order
        let newOrderTotal = ((math.evaluate('a <= b', {a: remainingOrderTotal, b: currentGroupBuyingPower})) ? remainingOrderTotal : currentGroupBuyingPower);
        
        //add order to current group
        currentGroup.push({
          ...order,
          amount: math.evaluate('bignumber(a) / bignumber(b)', {a: newOrderTotal, b: order.price}).toString(),
          total: newOrderTotal
        });
        
        //update totals
        remainingOrderTotal = math.evaluate('bignumber(a) - bignumber(b)', {a: remainingOrderTotal, b: newOrderTotal}).toString();
        remainingBuyingPower = math.evaluate('bignumber(a) - bignumber(b)', {a: remainingBuyingPower, b: newOrderTotal}).toString();
        currentGroupBuyingPower = math.evaluate('bignumber(a) - bignumber(b)', {a: currentGroupBuyingPower, b: newOrderTotal}).toString();
        
        //if isLastOrder or currentGroupBuyingPower < minTotal, push and reset current group
        let isLastOrder = remainingOrders.length <= 0;
        let isLastSplitOrder = math.evaluate('a < b', {a: remainingOrderTotal, b: this.Broker.minTotal});
        let currentGroupFull = math.evaluate('a < b', {a: currentGroupBuyingPower, b: this.Broker.minTotal});
        if((isLastOrder && isLastSplitOrder) || currentGroupFull) {
          groupedOrders.push(currentGroup);
          currentGroup = [];
          currentGroupBuyingPower = math.evaluate('bignumber(a) * bignumber(b)', {a: remainingBuyingPower, b: brokerDetails.initial_buying_power_percent}).toString();
        }
      }
    }
    
    //return
    return [decreaseOrders, ...groupedOrders];
  }
  
  //CHECK: rebalance
  async rebalance() {
    //skip and set repeatRebalance if rebalancing
    if(this.status.rebalancing) {
      this.repeatRebalance = true;
      return;
    }
    
    //update rebalancing status
    await this._updateStatus({rebalancing: true});
    
    //rebalance
    let recursiveRebalance = async () => {
      //verify user permissions
      if(this.Broker.live) {
        let accountSubscription = await this.AlphaInsider.getAccountSubscription();
        if(accountSubscription.type !== 'premium') throw new Error('Invalid permissions.');
      }
      
      //check if market is open
      let exchangeStatus = await this.AlphaInsider.getExchangeStatus();
      if(exchangeStatus.nyse !== 'open') throw new Error('Exchange is closed.');
      
      //cancel all open orders
      await this.Broker.cancelAllOpenOrders();
      
      //calculate new orders
      let newOrders = await this.calculateNewOrders();
      
      //execute new orders
      let orders = await this.executeOrders({orders: newOrders});
      
      //emit rebalance
      this.emit('info', {info: {type: 'rebalance', data: orders}, message: 'Successfully rebalanced positions.'});
      
      //repeat re-balance if flag is set
      let repeatRebalanceOrders = [];
      if(this.repeatRebalance) {
        this.repeatRebalance = false;
        repeatRebalanceOrders = await recursiveRebalance();
      }
      
      //return
      return orders.concat(repeatRebalanceOrders);
    };
    return recursiveRebalance()
    
    //error, cancel all open orders and schedule rebalance
    .catch(async (error) => {
      await this.Broker.cancelAllOpenOrders().catch((error) => {});
      if(this.status.running) await this._updateStatus({scheduled_rebalance: true});
      throw error;
    })
    
    //update rebalancing status
    .finally(async () => {
      await this._updateStatus({rebalancing: false});
      this.repeatRebalance = false;
    });
  }
  
  //CHECK: closeAllPositions
  async closeAllPositions() {
    return Promise.resolve()
    .then(async () => {
      //update closing status
      await this._updateStatus({closing: true});
      
      //check if market is open
      let exchangeStatus = await this.AlphaInsider.getExchangeStatus();
      if (exchangeStatus.nyse !== 'open') throw new Error('Exchange is closed.');
      
      //close all positions
      await this.Broker.closeAllPositions();
      
      //emit close
      this.emit('info', {info: {type: 'close'}, message: 'Successfully closed positions.'});
    })
    
    //error, cancel all open orders and schedule close
    .catch(async (error) => {
      await this.Broker.cancelAllOpenOrders().catch((error) => {});
      if(this.status.running) await this._updateStatus({scheduled_close: true});
      throw error;
    })
    
    //update closing status
    .finally(async () => {
      await this._updateStatus({closing: false});
    });
  }
  
  //DONE: _updateStatus --running-- --rebalancing-- --closing-- --scheduled_rebalance-- --scheduled_close--
  async _updateStatus(params) {
    //validate
    j.assert(params, j.object({
      running: j.boolean().optional(),
      rebalancing: j.boolean().optional(),
      closing: j.boolean().optional(),
      scheduled_rebalance: j.boolean().optional(),
      scheduled_close: j.boolean().optional()
    }).required());
    
    //get previous status
    let prevStatus = await this.getStatus();
    
    //update status
    this.status = {
      ...this.status,
      ...params
    }
    
    //get new status
    let newStatus = await this.getStatus();
    
    //emit status
    if(prevStatus !== newStatus) this.emit('status', newStatus);
  }
  
  //DONE: _cronSchedule
  async _cronSchedule() {
    //if rebalance or close scheduled
    if(this.status.scheduled_rebalance || this.status.scheduled_close) {
      //check if market is open
      let exchangeStatus = await this.AlphaInsider.getExchangeStatus();
      if(exchangeStatus.nyse !== 'open') throw new Error('Exchange is closed.');
      
      //close
      if(this.status.scheduled_close) {
        //close all positions
        await this.closeAllPositions()
        //error, emit error and stop
        .catch((error) => {
          this.emit('error', {info: {type: 'close_error', data: error}, message: 'Failed to close all positions.'});
        });
        //stop bot without closing positions
        await this.stop({close: false});
      }
      
      //rebalance
      else {
        //rebalance
        await this.rebalance()
        //error, emit error and stop
        .catch(async (error) => {
          this.emit('error', {info: {type: 'rebalance_error', data: error}, message: 'Failed to rebalance.'});
          await this.stop();
        });
      }
      
      //update status
      await this._updateStatus({
        scheduled_rebalance: false,
        scheduled_close: false
      });
    }
  }
}

module.exports = Bot;