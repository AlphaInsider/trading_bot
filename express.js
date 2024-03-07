const _ = require('lodash');
const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
let http = require('http');
const router = express.Router();
const crypto = require('crypto');
const args = require('yargs').argv;

const lib = require('./lib');

//init server
let server = undefined;
if(args.electron) {
  server = new lib.Server({
    db: require('knex')({
      client: 'sqlite3',
      connection: {
        filename: args.db || path.resolve(__dirname, './database.sqlite3')
      },
      pool: {max: 10},
      debug: false,
      migrations: {
        directory: path.resolve(__dirname, './database/migrations')
      },
      useNullAsDefault: true
    })
  });
}
else {
  server = new lib.Server({
    db: require('knex')({
      client: 'pg',
      connection: {
        connectionString: _.split(process.env['DATABASE_URL'], '?')[0],
        ...((process.env['NODE_ENV'] === 'production') ? {ssl: {rejectUnauthorized: false}} : {})
      },
      pool: {max: 10},
      debug: false,
      migrations: {
        directory: path.resolve(__dirname, './database/migrations')
      }
    }),
    password: process.env['USER_PASSWORD'] || crypto.randomBytes(64).toString('base64')
  });
}

//==== setup ====
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(cors({
  origin: [
    'http://localhost',
    'http://localhost:8080',
    'http://localhost:8100'
  ]
}));
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));


//==== MIDDLEWARE ====
//CHECK: auth (auth_token)
let auth = (options = {}) => {
  return (req, res, next) => {
    return Promise.resolve()
    // VALIDATE
    .then(async () => {
      //get token
      let authToken = req.headers['authorization'].replace('Bearer ', '');
      //validate
      let token = await server.verifyAuthToken({
        auth_token: authToken
      });
      //return
      res.locals.auth = token;
      return next();
    })
    // ERROR
    .catch((error) => {
      res.status(401).json({
        success: false,
        response: 'Authentication failed.'
      });
    });
  };
};


//==== API ====
//CHECK: login --password--
router.post('/login',
  rateLimit({
    windowMs: 1000 * 60 * 60, //1 hour
    max: 20,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        response: 'Rate limit reached.'
      });
    }
  }),
  (req, res, next) => {
    server.login({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: getVersion
router.get('/getVersion',
  (req, res, next) => {
    server.getVersion({
      ...req.query
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *getBotInfo
router.get('/getBotInfo',
  auth(),
  (req, res, next) => {
    server.getBotInfo({
      ...req.query
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *getAllocation
router.get('/getAllocation',
  auth(),
  (req, res, next) => {
    server.getAllocation({
      ...req.query
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateAllocation <strategy_id>
router.post('/updateAllocation',
  auth(),
  (req, res, next) => {
    server.updateAllocation({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateSettings --rebalance_on_start-- --close_on_stop--
router.post('/updateSettings',
  auth(),
  (req, res, next) => {
    server.updateSettings({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateAlphaInsider <alphainsider_key>
router.post('/updateAlphaInsider',
  auth(),
  (req, res, next) => {
    server.updateAlphaInsider({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateBrokerAlpaca <alpaca_key> <alpaca_secret>
router.post('/updateBrokerAlpaca',
  auth(),
  (req, res, next) => {
    server.updateBrokerAlpaca({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateBrokerTastytrade <tastytrade_email> <tastytrade_password> <account_id>
router.post('/updateBrokerTastytrade',
  auth(),
  (req, res, next) => {
    server.updateBrokerTastytrade({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *updateBrokerBinance <binance_key> <binance_secret>
router.post('/updateBrokerBinance',
  auth(),
  (req, res, next) => {
    server.updateBrokerBinance({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *startBot
router.post('/startBot',
  auth(),
  (req, res, next) => {
    server.startBot({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *stopBot
router.post('/stopBot',
  auth(),
  (req, res, next) => {
    server.stopBot({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *getStrategies <[strategy_id]> --timeframe--
router.get('/getStrategies',
  auth(),
  (req, res, next) => {
    server.getStrategies({
      ...req.query
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *searchStrategies --search-- --{positions}-- --{industries}-- --{type}-- --[risk]-- --trade_count_min-- --trade_count_max-- --price_min-- --price_max-- --timeframe-- --sort-- --limit-- --offset_id--
router.post('/searchStrategies',
  auth(),
  (req, res, next) => {
    server.searchStrategies({
      ...req.body
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);

//DONE: *getActivity --activity_id-- --[type]-- --limit-- --offset_id--
router.get('/getActivity',
  auth(),
  (req, res, next) => {
    server.getActivity({
      ...req.query
    })
    .then((data) => {
      res.json({
        success: true,
        response: data
      });
    })
    .catch((error) => {
      res.status(400).json({
        success: false,
        response: 'Request failed.'
      });
    });
  }
);


//==== ROUTES ====
app.use('/api', router);
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//==== START ====
//start http server
let httpServer = undefined;
if(args.electron) {
  let port = 5050;
  app.set('port', port);
  httpServer = http.createServer(app);
  httpServer.listen(port, 'localhost');
}
else {
  let port = parseInt(process.env['PORT'], 10) || 3000;
  app.set('port', port);
  httpServer = http.createServer(app);
  httpServer.listen(port);
}

//==== WEBSOCKET ====
server.wsConnect({http: httpServer});