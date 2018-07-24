const env = require('node-env-file')
env(__dirname + '/.keys')
env(__dirname + '/conf.ini')

const exchangeName = process.env.activeExchange

if (!process.env[`${exchangeName}_key`] || !process.env[`${exchangeName}_secret`]) {
    throw 'Error: Specify your binance API settings in a file called ".keys". The .keys-template can be used as a template for how the .keys file should look.'
}

const logger = require('./lib/LoggerCore')
const DBCore = require('./lib/DBCore')
const BotCore = require('./lib/BotCore')
const EventsCore = require('./lib/EventsCore')
const UI = require('./lib/UI')
const Exchange = require(`./exchanges/${exchangeName}`)

let ctrl = null
let botOptions = null

async function init() {
    const exchange = new Exchange()
    await exchange.init()

    botOptions = {
        UI: {
            title: 'Top Potential Arbitrage Triplets, via: ' + process.env.binanceColumns
        },
        arbitrage: {
            paths: process.env.binanceColumns.split(','),
            start: process.env.startCoin,
            mainMarkets: process.env.mainMarkets.split(',')
        },
        storage: {
            logHistory: false
        },
        trading: {
            paperOnly: false,
            minQueuePercentageThreshold: 0.23,
            minHitsThreshold: 1,
            mainCoinQuantityLimit: process.env.mainCoinQuantityLimit,
            percentageOfFee: 0.05,
            percentageOfBestQuantity: 0.8,
            tradeTime: 2
        }
    }

    ctrl = {
        options: botOptions,
        storage: {
            trading: {
                queue: [],
                active: []
            },
            candidates: [],
            streams: [],
            pairRanks: []
        },
        logger: logger,
        exchange,
        miniQuantity: exchange.miniAmounts
    }

    const {err, db} = await DBCore(logger)

    if (process.env.useMongo == 'true') {
        ctrl.storage.db = db
        ctrl.options.storage.logHistory = true
    }

    if (err) {
        ctrl.logger.error('MongoDB connection unavailable, history logging disabled: ' + err)
        ctrl.options.storage.logHistory = false
    }

    ctrl.UI = UI(ctrl.options),
    ctrl.events = EventsCore(ctrl)

    BotCore(ctrl)

}

console.log('\n\n\n----- Bot Starting : -----\n\n\n')
console.log('--- Loading Exchange API ')
console.log('--- \tActive Exchange:' + process.env.activeExchange)


init().catch(e => {
    logger.error('----- Bot Startup ERROR -----:', e)
})
