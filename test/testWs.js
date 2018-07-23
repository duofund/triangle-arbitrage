const binanceApi = require('binance')
const ws = new binanceApi.BinanceWS()
ws.onAllTickers((steam) => {
    console.log('what:', steam)
})