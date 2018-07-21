// load logger library
const logger = require('./lib/LoggerCore')
const ccxt = require('ccxt')
const binanceApi = require('binance')

const env = require('node-env-file')
env(__dirname + '/.keys')
env(__dirname + '/conf.ini')

let exchangeAPI = {}
const exchangeName = process.env.activeExchange

if (!process.env.binance_key || !process.env.binance_secret) {
    throw 'Error: Specify your binance API settings in a file called ".keys". The .keys-template can be used as a template for how the .keys file should look.'
}

logger.info('\n\n\n----- Bot Starting : -----\n\n\n')
logger.info('--- Loading Exchange API ')
logger.info('--- \tActive Exchange:' + process.env.activeExchange)


exchangeAPI = new ccxt[exchangeName]({
    'verbose': false,
    'apiKey': process.env[`${exchangeName}_key`],
    'secret': process.env[`${exchangeName}_secret`],
    timeout: parseInt(process.env.restTimeout), // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: parseInt(process.env.restRecvWindow), // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: process.env.restBeautify != 'true'
})

if (exchangeName == 'binance') {
    exchangeAPI.WS = new binanceApi.BinanceWS()
}

const botOptions = {
    UI: {
        title: 'Top Potential Arbitrage Triplets, via: ' + process.env.binanceColumns
    },
    arbitrage: {
        paths: process.env.binanceColumns.split(','),
        start: process.env.binanceStartingPoint
    },
    storage: {
        logHistory: false
    },
    trading: {
        paperOnly: false,
        // only candidates with over x% gain potential are queued for trading
        // minQueuePercentageThreshold: 0.3,
        minQueuePercentageThreshold: 0.19,
        // how many times we need to see the same opportunity before deciding to act on it
        minHitsThreshold: 1,
        mainCoinQuantityLimit: process.env.mainCoinQuantityLimit,
        percentageOfFee: 0.05,
        percentageOfBestQuantity: 0.8,
        tradeTime: 2
    }
}

const ctrl = {
    options: botOptions,
    storage: {
        trading: {
        // queued triplets
        queue: [],
        // actively trading triplets
        active: []
        },
        candidates: [],
        streams: [],
        pairRanks: []
    },
    logger: logger,
    exchange: exchangeAPI
}

function getMiniQuantity () {
    ctrl.exchange.loadMarkets().then(markets => {
        const miniQuantity = {}

        for (let symbol in markets) {
            miniQuantity[symbol] = markets[symbol].limits.amount.min
        }

        ctrl.miniQuantity = miniQuantity
    }).catch(e => {
      console.log('[Mini Quantity] Error', e)
      getMiniQuantity()
    })
}

getMiniQuantity()

// load DBCore, then start streams once DB is up and connected
require('./lib/DBCore')(logger, (err, db)=>{
    if (process.env.useMongo == 'true'){
        ctrl.storage.db = db
        ctrl.options.storage.logHistory = true
    }

    if (err){
        ctrl.logger.error('MongoDB connection unavailable, history logging disabled: ' + err)
        ctrl.options.storage.logHistory = false
    }

    ctrl.UI       = require('./lib/UI')(ctrl.options),
    ctrl.events   = require('./lib/EventsCore')(ctrl)

    // We're ready to start. Load up the webhook streams and start making it rain.
    require('./lib/BotCore')(ctrl)

    ctrl.logger.info('----- Bot Startup Finished -----')
})
