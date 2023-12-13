const _ = require('lodash');
const j = require('joi');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const moment = require('moment');
const {nanoid} = require('nanoid');
const semver = require('semver');
const WebSocket = require('ws');

const lib = require('./index');

class Server {
  //DONE: constructor <db> --password--
  constructor(params) {
    //validate
    j.assert(params, j.object({
      db: j.any().required(),
      password: j.string().optional(),
    }).required());
    
    //data
    this.knex = params.db;
    this.password = params.password;
    this.jwtSecret = crypto.randomBytes(64).toString('base64');
    
    this.Bot = undefined;
    this.AlphaInsider = undefined;
    this.Broker = undefined;
    
    this.ws = undefined;
    
    //init
    this.ready = (async () => {
      await this.knex.migrate.latest();
      await this._refreshSettings();
    })();
  }
  
  //DONE: destroy
  async destroy() {
    if(this.Bot) await this.Bot.destroy();
    if(this.AlphaInsider) await this.AlphaInsider.destroy();
    if(this.Broker) await this.Broker.destroy();
    if(this.ws) await this.wsClose();
  }
  
  //DONE: login --password--
  async login(params) {
    //validate
    j.assert(params, j.object({
      password: j.string().optional()
    }).required());
    
    //verify password
    if(params.password !== this.password) throw new Error('Invalid password.');
    
    //create auth token, expire 1d
    let authToken = jwt.sign({}, this.jwtSecret, {
      expiresIn: 60 * 60 * 24
    });
    
    //return
    return {
      auth_token: authToken
    };
  }
  
  //DONE: verifyAuthToken <auth_token>
  async verifyAuthToken(params) {
    //validate
    j.assert(params, j.object({
      auth_token: j.string().required()
    }).required());
    
    //verify auth token
    let token = jwt.verify(params.auth_token, this.jwtSecret);
    
    //return
    return token;
  }
  
  //DONE: getVersion
  async getVersion() {
    //init
    await this.ready;
    
    //get current version
    let currentVersion = lib.config.version;
    
    //get latest version
    let latestVersion = await axios({
      method: 'get',
      url: 'https://api.github.com/repos/AlphaInsider/trading_bot/tags'
    })
    .then((data) => _.map(data.data, 'name')[0]);
    
    //check if upgradable
    let upgradable = semver.gt(latestVersion, currentVersion);
    
    //return
    return {
      current_version: currentVersion,
      latest_version: latestVersion,
      upgradable: upgradable
    };
  }
  
  //DONE: getBotInfo
  async getBotInfo() {
    //init
    await this.ready;
    
    //get bot info
    let bot = await this.knex('bot')
    .select([
      'bot_id',
      'buffer_amount',
      'rebalance_on_start',
      'close_on_stop',
      'updated_at',
      'created_at'
    ])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //get user account subscription
    let alphaAccountDetails = {};
    let alphaKeyDetails = {};
    if(this.AlphaInsider) {
      alphaAccountDetails = await this.AlphaInsider.getAccountSubscription();
      alphaKeyDetails = await this.AlphaInsider.getAPIKeyInformation();
    }
    
    //get broker account details
    let brokerDetails = {};
    if(this.Broker) {
      brokerDetails = await this.Broker.getAccountDetails();
    }
    
    //return
    return {
      bot_id: bot.bot_id,
      status: ((this.Bot) ? this.Bot.getStatus() : 'off'),
      buffer_amount: bot.buffer_amount,
      rebalance_on_start: bot.rebalance_on_start,
      close_on_stop: bot.close_on_stop,
      alphainsider: ((this.AlphaInsider) ? {
        ...alphaKeyDetails,
        account_type: ((alphaAccountDetails.status === 'active') ? alphaAccountDetails.type : 'standard')
      } : null),
      broker: ((this.Broker) ? {
        type: brokerDetails.type,
        account_id: brokerDetails.account_id,
        live: brokerDetails.live,
        margin_types_available: brokerDetails.margin_types_available,
        value: brokerDetails.value,
        buying_power: brokerDetails.buying_power,
        initial_buying_power_percent: brokerDetails.initial_buying_power_percent,
        positions: brokerDetails.positions
      } : null),
      updated_at: bot.updated_at,
      created_at: bot.created_at
    }
  }
  
  //DONE: getAllocation
  async getAllocation() {
    //init
    await this.ready;
    
    //get allocation
    let allocation = await this.knex('allocation')
    .select([
      'allocation_id',
      'bot_id',
      'strategy_id',
      'multiplier',
      'created_at'
    ]);
    
    //return
    return allocation;
  }
  
  //DONE: updateAllocation <strategy_id> --multiplier--
  async updateAllocation(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      strategy_id: j.string().required(),
      multiplier: j.number().greater(0).optional()
    }).required());
    
    //validate strategy_id
    if(!this.AlphaInsider) throw new Error('AlphaInsider does not exist.');
    let strategy = await this.AlphaInsider.getStrategyDetails({
      strategy_id: params.strategy_id
    });
    
    //get bot info
    let bot = await this.knex('bot')
    .select(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    let transaction = async (trx) => {
      //delete existing allocation
      let allocation = await this.knex('allocation')
      .transacting(trx)
      .del()
      .returning(['*'])
      .then((data) => data[0] || {});
      
      //insert new allocation
      await this.knex('allocation')
      .transacting(trx)
      .insert({
        allocation_id: nanoid(),
        bot_id: bot.bot_id,
        strategy_id: strategy.strategy_id,
        multiplier: ((params.multiplier !== undefined) ? params.multiplier : (allocation.multiplier !== undefined) ? allocation.multiplier : undefined),
        created_at: moment().toISOString()
      })
      .returning(['*'])
      .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    }
    await this.knex.transaction((trx) => transaction(trx));
    
    //refresh settings
    await this._refreshSettings();
    
    //return
    return 'Updated allocation.';
  }
  
  //DONE: updateSettings --buffer_amount-- --rebalance_on_start-- --close_on_stop--
  async updateSettings(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      buffer_amount: j.number().integer().allow(0).optional(),
      rebalance_on_start: j.boolean().optional(),
      close_on_stop: j.boolean().optional()
    }).required());
    if(_.every(params, _.isUndefined)) throw new Error('No settings changed.');
    
    //update settings
    await this.knex('bot')
    .update({
      ...((params.buffer_amount !== undefined) ? {buffer_amount: params.buffer_amount} : {}),
      ...((params.rebalance_on_start !== undefined) ? {rebalance_on_start: params.rebalance_on_start} : {}),
      ...((params.close_on_stop !== undefined) ? {close_on_stop: params.close_on_stop} : {}),
      updated_at: moment().toISOString()
    })
    .returning(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //refresh settings
    await this._refreshSettings();
    
    //return
    return 'Settings updated.';
  }
  
  //DONE: updateAlphaInsider <alphainsider_key>
  async updateAlphaInsider(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      alphainsider_key: j.string().required()
    }).required());
    
    //validate alphainsider key
    await axios({
      method: 'get',
      url: 'https://alphainsider.com/api/getAccountSubscription',
      headers: {
        'authorization': params.alphainsider_key,
      }
    })
    .then(data => data.data.response);
    
    //validate permissions
    let decoded = jwt.decode(params.alphainsider_key);
    if(_.difference(lib.config.permissions, decoded.scope).length !== 0) throw new Error('Invalid token scope.');
    
    //update db
    await this.knex('bot')
    .update({
      alphainsider_key: params.alphainsider_key,
      updated_at: moment().toISOString()
    })
    .returning(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //refresh settings
    await this._refreshSettings();
    
    //return
    return 'AlphaInsider updated.';
  }
  
  //DONE: updateBrokerAlpaca <alpaca_key> <alpaca_secret>
  async updateBrokerAlpaca(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      alpaca_key: j.string().required(),
      alpaca_secret: j.string().required()
    }).required());
    
    //get broker details
    let alpaca = new lib.Alpaca({
      alpaca_key: params.alpaca_key,
      alpaca_secret: params.alpaca_secret
    });
    let brokerDetails = await alpaca.getAccountDetails();
    await alpaca.destroy();
    
    //verify user permissions
    if(brokerDetails.live) {
      let accountSubscription = await this.AlphaInsider.getAccountSubscription();
      if(accountSubscription.type !== 'premium') throw new Error('Invalid permissions.');
    }
    
    //update db
    await this.knex('bot')
    .update({
      broker: {
        type: brokerDetails.type,
        account_id: brokerDetails.account_id,
        live: brokerDetails.live,
        alpaca_key: params.alpaca_key,
        alpaca_secret: params.alpaca_secret
      },
      updated_at: moment().toISOString()
    })
    .returning(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //refresh settings
    await this._refreshSettings();
    
    //return
    return 'Broker updated.';
  }
  
  //DONE: updateBrokerTastytrade <tastytrade_email> <tastytrade_password> <account_id>
  async updateBrokerTastytrade(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      tastytrade_email: j.string().required(),
      tastytrade_password: j.string().required(),
      account_id: j.string().required()
    }).required());
    
    //get broker details
    let tastyTrade = new lib.TastyTrade({
      tastytrade_email: params.tastytrade_email,
      tastytrade_password: params.tastytrade_password,
      account_id: params.account_id
    });
    let brokerDetails = await tastyTrade.getAccountDetails();
    await tastyTrade.destroy();
    
    //verify user permissions
    if(brokerDetails.live) {
      let accountSubscription = await this.AlphaInsider.getAccountSubscription();
      if(accountSubscription.type !== 'premium') throw new Error('Invalid permissions.');
    }
    
    //update db
    await this.knex('bot')
    .update({
      broker: {
        type: brokerDetails.type,
        account_id: brokerDetails.account_id,
        live: brokerDetails.live,
        tastytrade_email: params.tastytrade_email,
        tastytrade_password: params.tastytrade_password
      },
      updated_at: moment().toISOString()
    })
    .returning(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //refresh settings
    await this._refreshSettings();
    
    //return
    return 'Broker updated.';
  }
  
  //DONE: startBot
  async startBot() {
    //init
    await this.ready;
    
    //destroy bot
    if(this.Bot) await this.Bot.destroy();
    this.Bot = undefined;
    
    //refresh settings
    await this._refreshSettings();
    
    //verify bot exists
    if(!this.Bot) throw new Error('Bot does not exist.');
    
    //start bot
    await this.Bot.start();
    
    //return
    return 'Bot started.';
  }
  
  //DONE: stopBot
  async stopBot() {
    //init
    await this.ready;
    
    //verify bot exists
    if(!this.Bot) throw new Error('Bot does not exist.');
    
    //stop bot
    await this.Bot.stop();
    
    //return
    return 'Bot stopped.';
  }
  
  //DONE: rebalance
  async rebalance() {
    //init
    await this.ready;
    
    //verify bot exists
    if(!this.Bot) throw new Error('Bot does not exist.');
    
    //rebalance
    await this.Bot.rebalance();
    
    //return
    return 'Rebalanced.';
  }
  
  //DONE: closeAllPositions
  async closeAllPositions() {
    //init
    await this.ready;
    
    //verify broker exists
    if(!this.Broker) throw new Error('Broker does not exist.');
    
    //close all positions
    await this.Broker.closeAllPositions();
    
    //return
    return 'Positions closed.';
  }
  
  //DONE: getStrategies <[strategy_id]> --timeframe--
  async getStrategies(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      strategy_id: j.array().items(j.string().required()).required(),
      timeframe: j.string().optional()
    }).required());
    
    //check if AlphaInsider exists
    if(!this.AlphaInsider) throw new Error('AlphaInsider does not exist.');
    
    //get user strategies
    let strategies = await this.AlphaInsider.getStrategies({
      ...params
    });
    
    //return
    return strategies;
  }
  
  //DONE: searchStrategies --search-- --{positions}-- --{industries}-- --{type}-- --[risk]-- --trade_count_min-- --trade_count_max-- --price_min-- --price_max-- --timeframe-- --sort-- --limit-- --offset_id--
  async searchStrategies(params) {
    //init
    await this.ready;
    
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
    
    //check if AlphaInsider exists
    if(!this.AlphaInsider) throw new Error('AlphaInsider does not exist.');
    
    //search strategies
    let strategies = await this.AlphaInsider.searchStrategies({
      ...params
    });
    
    //return
    return strategies;
  }
  
  //DONE: getActivity --activity_id-- --[type]-- --limit-- --offset_id--
  async getActivity(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      activity_id: j.string().optional(),
      type: j.array().items(j.string().valid('info', 'warning', 'error').optional()).optional(),
      limit: j.number().integer().min(1).optional(),
      offset_id: j.string().optional()
    }).required());
    
    //get activity
    let activity = await this.knex('activity')
    .where((k) => {
      if(params.activity_id) k.where('activity_id', '=', params.activity_id);
      if(params.type && params.type.length > 0) k.whereIn('type', params.type);
      if(params.limit) k.limit(params.limit);
      if(params.offset_id) {
        let offsetQuery = this.knex('activity')
        .where('activity_id', '=', params.offset_id)
        .select(['created_at']);
        k.where('created_at', '<', offsetQuery.clone());
      }
    })
    .select([
      'activity_id',
      'bot_id',
      'type',
      'message',
      'created_at'
    ])
    .orderBy('created_at', 'desc');
    
    //return
    return activity;
  }
  
  //DONE: wsConnect <http>
  async wsConnect(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      http: j.any().required()
    }).required());
    
    //init websocket
    this.ws = new WebSocket.Server({
      path: '/ws',
      server: params.http
    });
    
    //websocket on connection, accept subscriptions
    this.ws.on('connection', (client) => {
      //initialise client
      client.channels = [];
      client.token = '';
      //handle message
      client.on('message', async (message) => {
        //verify request
        try {
          let {event, payload} = JSON.parse(message);
          if(event !== 'subscribe') throw new Error('Invalid event.');
          //verify token
          try {
            //verify token
            await this.verifyAuthToken({
              auth_token: payload.token
            });
            //split channels between valid and invalid channels
            let validChannels = _.intersection(payload.channels, lib.config.wsChannels);
            let invalidChannels = _.filter(payload.channels, (item) => !_.includes(validChannels, item));
            //set channels and token
            client.channels = validChannels;
            client.token = payload.token;
            //valid channels
            client.send(JSON.stringify({
              event: 'subscribe',
              response: validChannels
            }));
            //invalid channels
            invalidChannels.forEach((item) => {
              client.send(JSON.stringify({
                event: 'error',
                channel: item,
                response: 'Failed to subscribe to channel.'
              }));
            });
          }
          //error, authentication failed
          catch(error) {
            client.send(JSON.stringify({
              event: 'error',
              response: 'Authentication failed.'
            }));
            payload.channels.forEach((item) => {
              client.send(JSON.stringify({
                event: 'error',
                channel: item,
                response: 'Failed to subscribe to channel.'
              }));
            });
          }
        }
        //error, request failed
        catch(error) {
          client.send(JSON.stringify({
            event: 'error',
            response: 'Request failed.'
          }));
        }
      });
    });
    
    //reVerify tokens (5 seconds)
    this.ws.reVerify = setInterval(() => {
      this.ws.clients.forEach(async (client) => {
        //verify token
        try {
          await this.verifyAuthToken({
            auth_token: client.token
          });
        }
        //error, close channels
        catch(error) {
          client.send(JSON.stringify({
            event: 'error',
            response: 'Authentication failed.'
          }));
          client.channels.forEach((channel) => {
            client.send(JSON.stringify({
              event: 'error',
              channel: channel,
              response: 'Channel closed.'
            }));
          });
          client.channels = [];
          client.token = '';
        }
      });
    }, 5000);
  }
  
  //DONE: wsClose
  async wsClose() {
    if(this.ws) {
      clearInterval(this.ws.reVerify);
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = undefined;
    }
  }
  
  //DONE: wsMessage <channel> <message>
  async wsMessage(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      channel: j.string().valid(...lib.config.wsChannels).required(),
      message: j.string().required()
    }).required());
    
    //send message to subscribed users
    this.ws.clients.forEach(async (client) => {
      //send message
      try {
        if(!client.channels.includes(channel)) throw new Error('User not subscribed.');
        client.send(JSON.stringify({
          event: 'message',
          channel: params.channel,
          response: params.message
        }));
      }
      //error, ignore
      catch(error) {}
    });
  }
  
  //DONE: _refreshSettings
  async _refreshSettings() {
    //check if bot is running
    let botIsRunning = (this.Bot && this.Bot.status.running);
    
    //destroy
    if(this.Bot) this.Bot.destroy();
    if(this.AlphaInsider) this.AlphaInsider.destroy();
    if(this.Broker) this.Broker.destroy();
    this.Bot = undefined;
    this.AlphaInsider = undefined;
    this.Broker = undefined;
    
    //get bot keys
    let bot = await this.knex('bot')
    .select(['*'])
    .then((data) => data[0] || {});
    
    //get strategy allocation
    let allocation = await this.knex('allocation')
    .select(['*'])
    .then((data) => data[0] || {});
    
    //set Bot
    try {
      this.Bot = new lib.Bot({
        alphainsider: {
          alphainsider_key: bot.alphainsider_key
        },
        broker: bot.broker,
        strategy_id: allocation.strategy_id,
        multiplier: allocation.multiplier,
        buffer_amount: bot.buffer_amount,
        rebalance_on_start: bot.rebalance_on_start,
        close_on_stop: bot.close_on_stop
      });
      this.Bot.on('status', (data) => {
        this.wsMessage({channel: 'wsStatus', message: data});
        this._newActivity({type: 'info', message: 'Bot status changed to "'+data+'".'});
      });
      this.Bot.on('info', (data) => this._newActivity({...data}));
      this.Bot.on('warning', (data) => this._newActivity({...data}));
      this.Bot.on('error', (data) => this._newActivity({...data}));
    }
    catch(error) {}
    
    //set AlphaInsider
    try {
      this.AlphaInsider = ((this.Bot) ? this.Bot.AlphaInsider : new lib.AlphaInsider({
        alphainsider_key: bot.alphainsider_key
      }));
    }
    catch(error) {}
    
    //set Broker
    try {
      if(bot.broker.type === 'alpaca') {
        this.Broker = ((this.Bot) ? this.Bot.Broker : new lib.Alpaca({
          alpaca_key: bot.broker.alpaca_key,
          alpaca_secret: bot.broker.alpaca_secret
        }));
      }
      else if(bot.broker.type === 'tastytrade') {
        this.Broker = ((this.Bot) ? this.Bot.Broker : new lib.TastyTrade({
          tastytrade_email: bot.broker.tastytrade_email,
          tastytrade_password: bot.broker.tastytrade_password,
          account_id: bot.broker.account_id
        }));
      }
      else throw new Error('Invalid broker type.');
    }
    catch(error) {}
    
    //if bot was running, start bot again
    if(this.Bot && botIsRunning) await this.Bot.start({rebalance: false});
  }
  
  //DONE: _newActivity <type> --{info}-- --message--
  async _newActivity(params) {
    //init
    await this.ready;
    
    //validate
    j.assert(params, j.object({
      type: j.string().valid('info', 'warning', 'error').required(),
      info: j.object().optional(),
      message: j.string().max(30000).optional()
    }).required());
    
    //get bot info
    let bot = await this.knex('bot')
    .select(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //insert new activity
    let newActivity = await this.knex('activity')
    .insert({
      activity_id: nanoid(),
      bot_id: bot.bot_id,
      type: params.type,
      info: params.info,
      message: params.message,
      created_at: moment().toISOString()
    })
    .returning(['*'])
    .then((data) => j.attempt(data, j.array().min(1).required())[0]);
    
    //get activity
    let activity = await this.getActivity({
      activity_id: newActivity.activity_id
    });
    
    //send wsActivity
    this.wsMessage({channel: 'wsActivity', message: activity[0]});
    
    //return
    return activity[0];
  }
}

module.exports = Server;