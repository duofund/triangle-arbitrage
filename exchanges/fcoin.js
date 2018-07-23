const WebSocket = require('ws')
const request = require('request')
const Exchange = require('./base/Exchange')
const Ticker = require('./base/Ticker')

const exchangeAPI = {}

module.exports = class FCoin extends Exchange {
    constructor () {
        super()

        this._wsTopics = {}

        this.WS_URL = 'wss://api.fcoin.com/v2/ws';
        this.API_URL = 'https://api.fcoin.com/v2/market';

        this.wsConnect = null
        this.callbackTickerTime = 0
    }

    async init() {
        await super.init()
        this._generateLocalSymbolDict()
    }

    _generateLocalSymbolDict () {
        this.symbols.map(symbol => {
            const local = symbol.split('/').join('').toLowerCase()
            this.localCommonSymbolsDict[local] = symbol
            this.commonLocalSymbolsDict[symbol] = local
        })
    }

    _formatTicker (symbol, ticker) {
        return Ticker(ticker[5], ticker[3], ticker[2], ticker[4], symbol, new Date().getTime())
    }

    startWebSocket () {
        this.ws = new WebSocket(this.WS_URL)

        this.ws.on('open', conn => {
            console.log('on ws open:', conn)
            this.wsConnect = conn

            this.symbols.map(topic => {
                this.subscribe(`ticker.${this.commonLocalSymbolsDict[topic]}`)
            })
        })

        this.ws.on('message', message => {
            let data = JSON.parse(message);
            let type = data.type

            if (/^ticker\./.test(type)) {
                let symbol = type.split('.')[1];
                let commonSymbol = this.localCommonSymbolsDict[symbol]
                this.streams[commonSymbol] = this._formatTicker(commonSymbol, data.ticker)

                const res = []

                for (let symbol in this.streams) {
                    res.push(this.streams[symbol])
                }

                if (this.callbackTickerTime < 20) {
                    this.callbackTickerTime++
                    return
                }

                this.callbackTickerTime = 0
                this.callbacks.tickers(res)
            } else if (/^depth\./.test(type)) {
                console.log('depth:', data)
                this.callbacks.depths(this.streams)
            } else if (/^trade\./.test(type)) {
                console.log('trade:', data)
                this.callbacks.trades(this.streams)
            }
        })

        this.ws.on('close', function () {
            console.log('close')
            this.wsConn = null;
            this.ws && setTimeout(() => this.ws.connect(WS_URL), 10000);
        })

        this.ws.on('error', () => {})
    }

    async startAllTickerStream (callback) {
        this.callbacks.tickers = callback
        await this.startWebSocket()
    }

    subscribe (topic) {
        if (!this.ws) return

        this.ws.send(JSON.stringify({
            cmd: 'sub',
            args: [topic]
        }));
    }

    unSubscribe (topic) {
        if (!this.ws) return

        this.ws.send(JSON.stringify({
            cmd: 'unsub',
            args: [topic]
        }));
    }
}
