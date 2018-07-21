const WebSocketClient = require('websocket').client;
const request = require('request')
const ccxt = require('ccxt')
const path = require('path')
const EventEmitter = require('events');
const env = require('node-env-file')
env(path.join(__dirname, '../.keys'))
env(path.join(__dirname, '../conf.ini'))

const WS_URL = 'wss://api.fcoin.com/v2/ws';
const api_URL = 'https://api.fcoin.com/v2/market';

const exchangeAPI = {}
const exchangeName = process.env.activeExchange

class FCoin extends EventEmitter {
    constructor () {
        super()
        this.wsTopics = []

        const exchange = new ccxt[exchangeName]({
            'verbose': true,
            'apiKey': process.env[`${exchangeName}_key`],
            'secret': process.env[`${exchangeName}_secret`],
            timeout: parseInt(process.env.restTimeout), // Optional, defaults to 15000, is the request time out in milliseconds
            recvWindow: parseInt(process.env.restRecvWindow), // Optional, defaults to 5000, increase if you're getting timestamp errors
            disableBeautification: process.env.restBeautify != 'true'
        })

        exchange.fetchMarkets().then(res => {
            console.log('res:', res)
            const symbols = []
            res.map(re => {
                symbols.push(re.symbol.split('/').join('').toLowerCase())
            })

            this.connectWebSocket(symbols)
        })
    }

    subscribe (topic) {
        this.wsTopics[topic] = new Date();
        if (this.wsConn) {
            this.wsConn.send(JSON.stringify({
                cmd: 'sub',
                args: [topic]
            }));
        }
    }

    unSubscribe (topic) {
        delete this.wsTopics[topic];
        if (this.wsConn) {
            this.wsConn.send(JSON.stringify({
                cmd: 'unsub',
                args: [topic]
            }));
        }
    }

    connectWebSocket (wsTopics) {
        console.log('[connectWebSocket] wsTopics:', wsTopics)

        this.ws = new WebSocketClient()
        this.wsTopics = {}
        this.wsConn = null
        this.ws.on('connectFailed', () => {
            console.log('connectFailed')
            this.wsconn = null;
            setTimeout(() => this.ws.connect(WS_URL), 10000);
        })

        this.ws.on('connect', conn => {
            this.wsConn = conn;

            wsTopics.map(topic => {
                this.subscribe(`ticker.${topic}`)
            })

            conn.on('message', message => {
                let data = JSON.parse(message.utf8Data);

                console.log('[message] data:', data)

                let type = data.type

                if (/^ticker\./.test(type)) {
                    console.log('ticker:', data)
                    let symbol = type.split('.')[1];
                    this.emit('ticker', {
                        symbol,
                        ticker: data.ticker
                    });
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
            conn.on('close', function () {
                console.log('close')
                this.wsConn = null;
                this.ws && setTimeout(() => this.ws.connect(WS_URL), 10000);
            })

            conn.on('error', () => {
            })
        })
        this.ws.connect(WS_URL)
    }
}

// start
const fCoin = new FCoin()
setTimeout(() => {}, 100 * 10000)
