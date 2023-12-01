require('dotenv').config();

const knex = require('knex')({
  client: 'pg',
  connection: process.env['DATABASE_URL'],
  pool: {max: 10},
  debug: false
});

//===== MODELS =====
Promise.resolve()
//CHECK: bots
.then(() => {
  return knex.schema.createTable('bots', (table) => {
    table.string('bot_id', 50).notNullable().primary().unique();
    table.bigInteger('buffer_amount').notNullable().defaultTo('0');
    table.decimal('max_day_margin', 30, 15); //0-4
    table.decimal('max_night_margin', 30, 15); //0-4
    table.time('rebalance_day_margin_at');
    table.time('rebalance_night_margin_at');
    table.string('error_action', 50).notNullable().defaultTo('close'); //close, stop
    table.string('alphainsider_key', 100).notNullable();
    table.jsonb('broker').notNullable().defaultTo('{}'); //{type, account_id, live, alpaca_key, alpaca_secret, tastytrade_email, tastytrade_password}
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
  });
})

//CHECK: allocation
.then(() => {
  return knex.schema.createTable('allocation', (table) => {
    table.string('allocation_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bots.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('strategy_id', 50).notNullable();
    table.decimal('multiplier', 30, 15).notNullable().defaultTo('1');
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
  });
})

//CHECK: activity
.then(() => {
  return knex.schema.createTable('activity', (table) => {
    table.string('activity_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bots.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('type', 50).notNullable().index(); //info, warning, error
    table.jsonb('info').notNullable().defaultTo('{}');
    table.string('message', 30000);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()')).index();
  });
})

// FINISH
.then((data) => {
  console.log('Database created!');
})
.catch((error) => {
  console.log(error);
})
// EXIT
.then(() => {
  process.exit(0);
});

