const _ = require('lodash');
const j = require('joi');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const math = require('mathjs');
const moment = require('moment');
const WebSocket = require('ws');
const EventEmitter = require('events');

class AlphaInsider extends EventEmitter {
  //DONE: constructor <alphainsider_key>
  constructor(params = {}) {
    //init event emitter
    super();
    
    //validate
    j.assert(params, j.object({
      alphainsider_key: j.string().required()
    }).required());
    
    //data
    this.alphainsiderKey = params.alphainsider_key;
    
    this.ws = undefined;
    
    this.alphaStocks = {};
    
    //init
    this.ready = (async () => {})();
  }
  
  //DONE: destroy
  async destroy() {
    if(this.ws) await this.wsClose();
  }
  
  //CHECK: verify
  async verify() {
    //get AlphaInsider status
    return axios({
      method: 'get',
      url: 'https://alphainsider.com/api/getAccountSubscription',
      headers: {
        'authorization': this.alphainsiderKey,
      }
    })
    //valid
    .then((data) => {
      if(data.data.success !== true) throw new Error('Invalid response.');
      return 'valid';
    })
    //invalid
    .catch((error) => {
      if(error.response.data.success !== false) throw new Error('Invalid response.');
      return 'invalid';
    })
    //offline
    .catch(() => {
      return 'offline';
    });
  }
  
  //CHECK: mapStocks <[alpha_stock_ids]> --seconds_expire--
  async mapStocks(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stock_ids: j.array().items(j.string().optional()).required(),
      seconds_expire: j.number().integer().min(0).optional()
    }).required());
    
    //remove expired stocks
    this.alphaStocks = _.pickBy(this.alphaStocks, (item) => {
      return moment().isBefore(item.expires_at);
    });
    
    //filter new stocks to get, excluding cash
    let newStockIds = _.difference(params.alpha_stock_ids, [...Object.keys(this.alphaStocks), 'ubfhvYUsgvMIuJPwr76My']);
    
    //get new stocks
    let newStocks = [];
    if(newStockIds.length > 0) {
      newStocks = await axios({
        method: 'get',
        url: 'https://alphainsider.com/api/getStocks',
        params: {
          stock_id: newStockIds
        }
      })
      .then((data) => data.data.response)
      .then((data) => {
        if(data.length < newStockIds.length) throw new Error('Could not get all stock details.');
        return data;
      });
    }
    
    //add expires_at to new stocks
    let secondsToExpire = ((params.seconds_expire !== undefined) ? params.seconds_expire : 60*60*24)
    newStocks = newStocks.map((item) => ({
      ...item,
      expires_at: moment().add(secondsToExpire, 'seconds').toISOString()
    }));
    
    //union new stocks with existing stocks
    this.alphaStocks = {...this.alphaStocks, ..._.keyBy(newStocks, 'stock_id')};
    
    //return
    return this.alphaStocks;
  }
  
  //CHECK: getStockPrices <[alpha_stock_ids]>
  async getStockPrices(params = {}) {
    //validate
    j.assert(params, j.object({
      alpha_stock_ids: j.array().items(j.string().required()).required()
    }).required());
    
    //get stock prices
    let stocks = await axios({
      method: 'get',
      url: 'https://alphainsider.com/api/getStocks',
      params: {
        stock_id: params.alpha_stock_ids
      }
    })
    .then((data) => data.data.response);
    
    //extract stock prices
    let stockPrices = stocks.reduce((prev, curr) => {
      prev[curr.stock_id] = {
        bid: curr.bid,
        ask: curr.ask
      }
      return prev;
    }, {});
    
    //return
    return stockPrices;
  }
  
  //CHECK: getStrategies <strategy_id> --timeframe--
  async getStrategies(params = {}) {
    //validate
    j.assert(params, j.object({
      strategy_id: j.array().items(j.string().required()).required(),
      timeframe: j.string().optional()
    }).required());
    
    // get strategies
    let strategies = await axios({
      method: 'get',
      headers: {
        authorization: this.alphainsiderKey
      },
      url: 'https://alphainsider.com/api/getStrategies',
      params: params
    })
    .then((data) => data.data.response);
    
    // return 
    return strategies;
  }
  
  //CHECK: searchStrategies --search-- --{positions}-- --{industries}-- --{type}-- --[risk]-- --trade_count_min-- --trade_count_max-- --price_min-- --price_max-- --timeframe-- --sort-- --limit-- --offset_id--
  async searchStrategies(params = {}) {
    //validate
    j.assert(params, j.object({
      search: j.string().allow('').optional(),
      positions: j.object({
        includes: j.array().items(j.string().optional()).required(),
        excludes: j.array().items(j.string().optional()).required(),
      }).optional(),
      industries: j.object().optional(),
      type: j.object({
        includes: j.array().items(j.string().optional()).required(),
        excludes: j.array().items(j.string().optional()).required()
      }).optional(),
      risk: j.array().items(j.string().optional()).optional(),
      trade_count_min: j.number().integer().optional(),
      trade_count_max: j.number().integer().optional(),
      price_min: j.number().integer().optional(),
      price_max: j.number().integer().optional(),
      timeframe: j.string().optional(),
      sort: j.string().optional(),
      limit: j.number().integer().optional(),
      offset_id: j.string().optional()
    }).required());
    
    //search strategies
    let strategies = await axios({
      method: 'post',
      headers: {
        authorization: this.alphainsiderKey
      },
      url: 'https://alphainsider.com/api/searchStrategies',
      data: params
    })
    .then((data) => data.data.response);
    
    // return 
    return strategies;
  }
  
  //CHECK: getStrategyDetails <strategy_id>
  async getStrategyDetails(params = {}) {
    //validate
    j.assert(params, j.object({
      strategy_id: j.string().required()
    }).required());
    
    //get strategy details and positions
    let [strategyDetails, positions] = await Promise.all([
      this.getStrategies({strategy_id: [params.strategy_id]}),
      this._getPositions({strategy_id: params.strategy_id})
    ]);
    strategyDetails = strategyDetails[0];
    
    //calculate strategy value and gross exposure
    let {strategyValue, grossExposure} = positions.reduce((prev, curr) => {
      let price = ((math.evaluate('a >= 0', {a: curr.amount})) ? curr.bid : curr.ask);
      prev.strategyValue = math.evaluate('bignumber(a) + (bignumber(b) * bignumber(c))', {a: prev.strategyValue, b: curr.amount, c: price}).toString();
      prev.grossExposure = math.evaluate('bignumber(a) + (abs(bignumber(b)) * bignumber(c))', {a: prev.grossExposure, b: curr.amount, c: price}).toString();
      return prev;
    }, {strategyValue: '0', grossExposure: '0'});
    
    //calculate buying power
    let buyingPower = math.evaluate('bignumber(a) * 5', {a: strategyValue}).toString();
    if(math.evaluate('a > b', {a: grossExposure, b: buyingPower})) buyingPower = grossExposure;
    
    //remove cash and calculate percents
    positions = positions.reduce((prev, curr) => {
      if(!curr.id) return prev;
      let price = ((math.evaluate('a >= 0', {a: curr.amount})) ? curr.bid : curr.ask);
      prev.push({
        ...curr,
        percent: math.evaluate('(abs(bignumber(a)) * bignumber(b)) / bignumber(c)', {a: curr.amount, b: price, c: buyingPower}).toString()
      });
      return prev;
    }, []);
    
    //return
    return {
      strategy_id: strategyDetails.strategy_id,
      type: strategyDetails.type,
      value: strategyValue,
      buying_power: buyingPower,
      positions: positions
    };
  }
  
  //CHECK: getAccountSubscription
  async getAccountSubscription() {
    //get account subscription
    let accountSubscription = await axios({
      method: 'get',
      url: 'https://alphainsider.com/api/getAccountSubscription',
      headers: {
        'authorization': this.alphainsiderKey,
      }
    })
    .then((data) => data.data.response);
    
    //return
    return accountSubscription;
  }
  
  //CHECK: getExchangeStatus
  async getExchangeStatus() {
    //get exchange status
    let exchangeStatus = await axios({
      method: 'get',
      url: 'https://alphainsider.com/api/getExchangeStatus'
    })
    .then((data) => data.data.response);
    
    //return
    return exchangeStatus;
  }
  
  //CHECK: getAPIKeyInformation
  async getAPIKeyInformation() {
    let keyInfo = jwt.decode(this.alphainsiderKey);
    return {
      user_id: keyInfo.user_id,
      holder: keyInfo.holder,
      type: keyInfo.type,
      name: keyInfo.name,
      scope: keyInfo.scope,
      created_at: moment.unix(keyInfo.iat).utc().toISOString()
    }
  }
  
  //CHECK: wsConnect <strategy_id>
  async wsConnect(params = {}) {
    //validate
    j.assert(params, j.object({
      strategy_id: j.string().required()
    }).required());
    
    //close existing websocket
    await this.wsClose();
    
    //skip if already connecting
    if(this.ws) return;
    
    //start new websocket
    this.ws = new WebSocket('wss://alphainsider.com/ws');
    let channels = ['wsPositions:'+params.strategy_id];
    
    //start heartbeat, 30 seconds
    this.ws.heartbeat = setInterval(() => Promise.resolve().then(async () => {
      //if connection open, ping
      if(this.ws.isConnected) {
        this.ws.isConnected = false;
        this.ws.ping();
      }
      //else, reconnect
      else {
        await this.wsConnect({strategy_id: params.strategy_id});
      }
    }).catch((error) => {}), 30000);
    
    //on pong, set connected
    this.ws.on('pong', () => Promise.resolve().then(async () => {
      this.ws.isConnected = true;
    }).catch((error) => {}));
    
    //on open, subscribe to channels
    this.ws.on('open', () => Promise.resolve().then(async () => {
      //set connected
      this.ws.isConnected = true;
      //subscribe
      this.ws.send(JSON.stringify({
        event: 'subscribe',
        payload: {
          channels: channels,
          token: this.alphainsiderKey
        }
      }));
    }).catch((error) => {}));
    
    //on message, handle events
    this.ws.on('message', (data) => Promise.resolve().then(async () => {
      //parse message
      let response = JSON.parse(data);
      //subscribe, verify subscription
      if(response.event === 'subscribe') {
        if(_.difference(channels, response.response).length !== 0) {
          //emit error
          this.emit('error', 'Websocket failed to subscribe.');
          //close connection
          await this.wsClose();
        }
      }
      //wsPositions, run callback function
      else if(response.event === 'wsPositions' && channels.includes(response.channel)) {
        this.emit('message', response);
      }
      //else, close websocket
      else {
        this.ws.close(1000, 'Unhandled Event');
      }
    }).catch((error) => {}));
    
    //on error, do nothing
    this.ws.on('error', (error) => {});
    
    //on close, delay and reconnect
    this.ws.on('close', () => Promise.resolve().then(async () => {
      this.emit('reconnecting', 'Websocket closed, reconnecting.');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.wsConnect({strategy_id: params.strategy_id});
    }).catch((error) => {}));
  }
  
  //CHECK: wsClose
  async wsClose() {
    if(this.ws) {
      clearInterval(this.ws.heartbeat);
      this.ws.removeAllListeners();
      this.ws.on('error', (error) => {});
      if(this.ws.readyState === WebSocket.CONNECTING) await new Promise((resolve) => this.ws.once('open', resolve).once('close', resolve));
      this.ws.close();
      this.ws.removeAllListeners();
      this.ws = undefined;
    }
  }
  
  //CHECK: _getPositions <strategy_id>
  async _getPositions(params = {}) {
    //validate
    j.assert(params, j.object({
      strategy_id: j.string().required()
    }).required());
    
    //get strategy positions
    let strategyPositions = await axios({
      method: 'get',
      headers: {
        authorization: this.alphainsiderKey
      },
      url: 'https://alphainsider.com/api/getPositions',
      params: {
        strategy_id: params.strategy_id
      }
    })
    .then((data) => data.data.response);
    
    //get prices
    let positionPrices = await this.getStockPrices({alpha_stock_ids: _.map(strategyPositions, 'stock_id')});
    
    //map prices to positions
    strategyPositions = _.chain(strategyPositions).groupBy('stock_id').map((similarPositions, stockId) => {
      return {
        id: ((stockId === 'ubfhvYUsgvMIuJPwr76My') ? undefined : stockId),
        amount: math.evaluate('sum(bignumber(a))', {a: _.map(similarPositions, 'amount')}).toString(),
        bid: positionPrices[stockId].bid,
        ask: positionPrices[stockId].ask
      }
    }).value();
    
    //return
    return strategyPositions;
  }
}

module.exports = AlphaInsider;