const WebSocket = require('ws')
const request = require('request')
const Exchange = require('./base/Exchange')
const Ticker = require('./base/Ticker')
const binanceApi = require('binance')

const exchangeAPI = {}

module.exports = class Binance extends Exchange {
    async constructor () {
        await super()

        const _wsTopics = {}

        this.WS_URL = 'wss://api.fcoin.com/v2/ws';
        this.API_URL = 'https://api.fcoin.com/v2/market';

        this.wsConnect = null
        this.ws = new binanceApi.BinanceWS()

        this._generateLocalSymbolDict()
    }

    _generateLocalSymbolDict () {
        this.symbols.map(symbol => {
            const local = symbol.split('/').join('')
            this.localCommonSymbolsDict[local] = symbol
            this.commonLocalSymbolsDict[symbol] = local
        })
    }

    _formatTicker (symbol, ticker) {
        return Ticker(ticker[5], ticker[3], ticker[2], ticker[4], symbol, new Date().getTime())
    }

    startAllTickerStream (callback) {
        return this.ws.onAllTickers(callback)
    }
}

// start
const fCoin = new FCoin()
setTimeout(() => {}, 100 * 10000)
