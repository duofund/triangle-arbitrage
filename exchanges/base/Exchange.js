const path = require('path')
const ccxt = require('ccxt')

const env = require('node-env-file')
env(path.join(__dirname, '../../.keys'))
env(path.join(__dirname, '../../conf.ini'))

const exchangeName = process.env.activeExchange

module.exports = class Exchange {
    constructor () {
        this.WS_URL = ''
        this.API_URL = ''

        this.symbols = []
        this.miniAmount = []
        this.markets = {}
        this.streams = {}
        this.callbacks = {
            tickers: () => {},
            depths: () => {},
            trade: () => {}
        }

        // this.callbacks.depths()

        // translate from exchange symbol to common symbol
        this.localCommonSymbolsDict = {}
        // translate from common symbol to exchange symbol
        this.commonLocalSymbolsDict = {}

        this.apis = new ccxt[exchangeName]({
            'verbose': false,
            'apiKey': process.env[`${exchangeName}_key`],
            'secret': process.env[`${exchangeName}_secret`],
            timeout: parseInt(process.env.restTimeout), // Optional, defaults to 15000, is the request time out in milliseconds
            recvWindow: parseInt(process.env.restRecvWindow), // Optional, defaults to 5000, increase if you're getting timestamp errors
            disableBeautification: process.env.restBeautify != 'true'
        })
    }

    async init() {
        this.markets = await this.apis.fetchMarkets()

        this.loadAllSymbols()
        this.loadMiniAmounts()
    }

    loadMiniAmounts () {
        const miniAmounts = {}

        this.markets.map(market => {
            const symbol = market.symbol
            miniAmounts[symbol] = market.limits.amount ? market.limits.amount.min : 1
        })
        this.miniAmounts = miniAmounts
    }

    loadAllSymbols () {
        const symbols = []

        this.markets.map(re => {
            symbols.push(re.symbol) // .split('/').join('').toLowerCase())
        })

        this.symbols = symbols
    }

    startAllTickerStream (callback) {}

    // translate from exchange symbol to ccxt symbol
    _generateLocalSymbolDict () {}

    _formatTicker () {}

    _formatSymbol () {}
}