const _ = require('lodash');
const j = require('joi');
const math = require('mathjs');

class Bot {
  //CHECK: constructor <AlphaInsider> <Broker> --multiplier-- --buffer_amount--
  constructor(params) {
    //validate
    j.assert(params, j.object({
      AlphaInsider: j.any().required(),
      Broker: j.any().required(),
      multiplier: j.number().greater(0).max(10).optional(), 
      buffer_amount: j.number().min(0).optional()
    }).required());
    
    //data
    this.AlphaInsider = params.AlphaInsider;
    this.Broker = params.Broker;
    this.multiplier = ((params.multiplier !== undefined) ? params.multiplier : 1);
    this.bufferAmount = ((params.buffer_amount !== undefined) ? params.buffer_amount : 0);
    
    this.prevStrategyPositions = undefined;
    this.alphaBrokerIndex = {};
    
    this.rebalancing = false;
    this.repeatRebalance = false;
    
    //init
    this.ready = (async () => {})();
  }
  
  //CHECK: executeOrders <[[{orders}]]>
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
  
  //CHECK: calculateNewOrders
  async calculateNewOrders() {
    //get strategy details and broker details
    let [strategyDetails, brokerDetails] = await Promise.all([
      this.AlphaInsider.getStrategyDetails(),
      this.Broker.getAccountDetails()
    ]);
    
    //error if not a stock strategy
    if(strategyDetails.type !== 'stock') throw new Error('Must be a stock strategy.');
    
    //error if account is not a margin account
    if(!brokerDetails.margin_types_available.includes('reg_t')) throw new Error('Account must be a margin account.');
    
    //error if account is less than 25k
    if(math.evaluate('a < 25000', {a: brokerDetails.value})) throw new Error('Account must maintain a balance of at least $25,000.');
    
    //error if broker value or buying power is negative
    if(math.evaluate('a < 0', {a: brokerDetails.value})) throw new Error('Invalid broker value.');
    if(math.evaluate('a < 0', {a: brokerDetails.buying_power})) throw new Error('Invalid buying power.');
    
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
    
    //adjust broker buying power
    let brokerBuyingPower = math.evaluate('bignumber(a) - bignumber(b)', {
      a: brokerDetails.buying_power,
      b: this.bufferAmount
    }).toString();
    
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
      let total = math.evaluate('bignumber(a) * bignumber(b) * bignumber(c)', {
        a: brokerBuyingPower,
        b: curr.percent,
        c: this.multiplier
      }).toString();
      prev.finalState[brokerId] = math.evaluate('bignumber(a) / bignumber(b) * bignumber(c)', {
        a: total,
        b: price,
        c: ((isLong) ? '1' : '-1')
      }).toString();
      prev.finalStatePositionsTotal = math.evaluate('bignumber(a) + bignumber(b)', {a: prev.finalStatePositionsTotal, b: total}).toString();
      return prev;
    }, {finalState: {}, finalStatePositionsTotal: 0});
    
    //error if finalStatePositionsTotal exceeds buffered max buying power
    if(math.evaluate('a > b', {a: finalStatePositionsTotal, b: brokerBuyingPower})) throw new Error('Calculated orders exceed buffered max buying power.');
    
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
    let rebalancePositions = async () => {
      //cancel all open orders
      await this.Broker.cancelAllOpenOrders();
      
      //calculate new orders
      let newOrders = await this.calculateNewOrders();
      
      //execute new orders
      let orders = await this.executeOrders({orders: newOrders});
      
      //repeat re-balance if flag is set
      let repeatRebalanceOrders = [];
      if(this.repeatRebalance) {
        this.repeatRebalance = false;
        repeatRebalanceOrders = await rebalancePositions();
      }
      
      //return
      return orders.concat(repeatRebalanceOrders);
    }
    
    //start transaction
    if(this.rebalancing) {
      this.repeatRebalance = true;
      return;
    }
    this.rebalancing = true;
    
    //rebalance
    return rebalancePositions()
    //error, close all orders and positions
    .catch(async (error) => {
      //close all orders and positions
      await this.Broker.cancelAllOpenOrders().catch((error) => {});
      await this.Broker.closeAllPositions().catch((error) => {});
      //propagate error upwards
      throw error;
    })
    //end transaction
    .finally(() => {
      this.rebalancing = false;
      this.repeatRebalance = false;
    });
  }
  
  //CHECK: destroy
  async destroy() {}
}

module.exports = Bot;