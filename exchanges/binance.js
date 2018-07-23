const WebSocket = require('ws')
const request = require('request')
const Exchange = require('./base/Exchange')
const Ticker = require('./base/Ticker')
const binanceApi = require('binance')

const exchangeAPI = {}

module.exports = class Binance extends Exchange {
    constructor () {
        super()

        const _wsTopics = {}

        this.WS_URL = 'wss://api.fcoin.com/v2/ws';
        this.API_URL = 'https://api.fcoin.com/v2/market';

        this.wsConnect = null

        // const exchangeAPI = new binanceApi.BinanceRest({
        //     key: process.env.binance_key,
        //     secret: process.env.binance_secret,
        //     timeout: parseInt(process.env.restTimeout), // Optional, defaults to 15000, is the request time out in milliseconds
        //     recvWindow: parseInt(process.env.restRecvWindow), // Optional, defaults to 5000, increase if you're getting timestamp errors
        //     disableBeautification: process.env.restBeautify != 'true'
        // })

        this.ws = new binanceApi.BinanceWS()
    }

    async init() {
        await super.init()
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

    _formatSymbol (symbol) {
        return this.localCommonSymbolsDict[symbol]
    }

    _socketCallback (steams) {
        // convert symbol format
        this.steams = steams.map(steam => {
            steam.s = this._formatSymbol(steam.s)
            return steam
        })

        this.callbacks.tickers(this.steams)
    }

    startAllTickerStream (callback) {
        this.callbacks.tickers = callback
        return this.ws.onAllTickers((steam) => {
            console.log('what:', steam)
        })
        // return this.ws.onAllTickers(this._socketCallback)
    }
}
