require('dotenv').config();

const knex = require('knex')({
  client: 'pg',
  connection: process.env['DATABASE_URL'],
  pool: {max: 10},
  debug: false
});

//===== MODELS =====
Promise.resolve()
//CHECK: bot
.then(() => {
  return knex.schema.createTable('bot', (table) => {
    table.string('bot_id', 50).notNullable().primary().unique();
    table.string('status', 50).notNullable(); //on, off, rebalancing, closing, scheduled_rebalance, scheduled_close
    table.boolean('rebalance_on_start').notNullable();
    table.boolean('close_on_stop').notNullable();
    table.string('alphainsider_key', 10000);
    table.jsonb('broker').notNullable(); //{type, account_id, live, alpaca_key, alpaca_secret, tastytrade_email, tastytrade_password}
    table.timestamp('updated_at').notNullable();
    table.timestamp('created_at').notNullable();
  });
})

//CHECK: allocation
.then(() => {
  return knex.schema.createTable('allocation', (table) => {
    table.string('allocation_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bot.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('strategy_id', 50).notNullable();
    table.timestamp('created_at').notNullable().index();
  });
})

//CHECK: activity
.then(() => {
  return knex.schema.createTable('activity', (table) => {
    table.string('activity_id', 50).notNullable().primary().unique();
    table.string('bot_id', 50).notNullable().references('bot.bot_id').onDelete('CASCADE').onUpdate('CASCADE');
    table.string('type', 50).notNullable().index(); //info, warning, error
    table.jsonb('info').notNullable();
    table.string('message', 30000).notNullable();
    table.timestamp('created_at').notNullable().index();
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

