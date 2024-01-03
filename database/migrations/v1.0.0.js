const j = require('joi');
const moment = require('moment');
const {nanoid} = require('nanoid');

exports.up = async (knex) => {
  //create tables
  await knex.schema.createTable('bot', (table) => {
    table.string('bot_id', 50).notNullable().primary().unique();
    table.string('status', 50).notNullable().defaultTo('off'); //on, off, rebalancing, closing, scheduled_rebalance, scheduled_close
    table.boolean('rebalance_on_start').notNullable().defaultTo(true);
    table.boolean('close_on_stop').notNullable().defaultTo(true);
    table.string('alphainsider_key', 10000);
    table.jsonb('broker').notNullable().defaultTo('{}'); //{type, account_id, live, alpaca_key, alpaca_secret, tastytrade_email, tastytrade_password}
    table.timestamp('updated_at').notNullable();
    table.timestamp('created_at').notNullable();
  });
  await knex.schema.createTable('allocation', (table) => {
    table.string('allocation_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bot.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('strategy_id', 50).notNullable();
    table.timestamp('created_at').notNullable().index();
  });
  await knex.schema.createTable('activity', (table) => {
    table.string('activity_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bot.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('type', 50).notNullable().index(); //info, warning, error
    table.jsonb('info').notNullable().defaultTo('{}');
    table.string('message', 30000).notNullable().defaultTo('');
    table.timestamp('created_at').notNullable().index();
  });
  
  //add bot
  let bot = await knex('bot')
  .insert({
    bot_id: nanoid(),
    updated_at: moment().toISOString(),
    created_at: moment().toISOString()
  })
  .returning(['*'])
  .then((data) => j.attempt(data, j.array().min(1).required())[0]);
  
  //add first activity
  await knex('activity')
  .insert({
    activity_id: nanoid(),
    bot_id: bot.bot_id,
    type: 'info',
    message: 'Bot created.',
    created_at: moment().toISOString()
  })
  .returning(['*'])
  .then((data) => j.attempt(data, j.array().min(1).required())[0]);
}

exports.down = async (knex) => {
  //drop all tables
  await knex.schema.dropTable('activity');
  await knex.schema.dropTable('allocation');
  await knex.schema.dropTable('bot');
}