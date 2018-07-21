const WebSocket = require('ws')
const request = require('request')
const Exchange = require('./base/Exchange')
const Ticker = require('./base/Ticker')

const exchangeAPI = {}

module.exports = class FCoin extends Exchange {
    async constructor () {
        await super()

        const _wsTopics = {}

        this.WS_URL = 'wss://api.fcoin.com/v2/ws';
        this.API_URL = 'https://api.fcoin.com/v2/market';

        this.wsConnect = null

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

    startWebSocket () {
        this.ws = new WebSocket(this.WS_URL)

        this.ws.on('connect', conn => {
            this.wsConnect = conn
        })

        this.ws.on('message', message => {
            let data = JSON.parse(message.utf8Data);
            let type = data.type

            if (/^ticker\./.test(type)) {
                let symbol = type.split('.')[1];
                let commonSymbol = this.localCommonSymbolsDict[symbol]
                this.streams[commonSymbol] = this._formatTicker(commonSymbol, data.ticker)
                console.log('this.streams[commonSymbol]:', this.streams[commonSymbol])

                callback(this.streams)
            } else if (/^depth\./.test(type)) {
                console.log('depth:', data)
                let symbol = type.split('.')[2];
                this.emit('depth', {
                    symbol,
                    depth: {
                        asks: data.asks,
                        bids: data.bids
                    }
                });
            } else if (/^trade\./.test(type)) {
                console.log('trade:', data)
                let symbol = type.split('.')[1];
                this.emit('trade', {
                    symbol,
                    ts: data.ts,
                    trade: {
                        id: data.id,
                        side: data.side,
                        price: data.price,
                        amount: data.amount
                    }
                })
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
        console.log('[connectWebSocket] wsTopics:', wsTopics)
        this.callbacks.tickers = callback
        await this.startWebSocket()

        this.symbols.map(topic => {
            this.subscribe(`ticker.${topic}`)
        })
    }

    subscribe (topic) {
        if (!this.wsConn) return

        this.wsConn.send(JSON.stringify({
            cmd: 'sub',
            args: [topic]
        }));
    }

    unSubscribe (topic) {
        if (!this.wsConn) return

        this.wsConn.send(JSON.stringify({
            cmd: 'unsub',
            args: [topic]
        }));
    }
}

// start
const fCoin = new FCoin()
setTimeout(() => {}, 100 * 10000)
