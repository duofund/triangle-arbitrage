var path = require('path');
var numbers = require('numbers');
var env = require('node-env-file');
var utils = require('../lib/utils');
env(path.join(__dirname, '../', '.keys'));
env(path.join(__dirname, '../', 'conf.ini'));

const api = require('binance')

const exchangeAPI = new api.BinanceRest({
    key: process.env.binance_key,
    secret: process.env.binance_secret,
    timeout: parseInt(process.env.restTimeout), // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: parseInt(process.env.restRecvWindow), // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: process.env.restBeautify != 'true'
})

// exchangeAPI.allOrders({
//     symbol: 'BNBETH'  // Object is transformed into a query string, timestamp is automatically added
// }).then((data) => {
//     console.log(data);
// })

function getPortfolio () {
    return exchangeAPI.account().then((data) => {
        return data.balances.filter(coin => parseFloat(coin.free) > 0);
    });
}

const symbol = 'EOSETH'

exchangeAPI.tickerPrice(symbol).then(data => {
    console.log('data:', data);
});

function newOrder (symbol, price) {
    console.log('here \'s the price:', price);

    const callback = (err, payload) => {
        console.log('[newOrder] payload:', payload);

        exchangeAPI.queryOrder({
            symbol,
            orderId: payload.orderId
        }).then(data => {

        });
    }

    exchangeAPI.newOrder({
        symbol,
        side: 'BUY',
        type: 'limit',
        price,
        quantity: 1,
        timeInForce: 'IOC'
    }, callback);
}

exchangeAPI.bookTicker(symbol).then(data => {
    console.log('[bookTicker] data:', data);

    const price = data.bidPrice; // data.askPrice; // utils.floatSub(parseFloat(data.askPrice), 0.002)
    console.log('price:', price, 'ask price:', data.askPrice);

    newOrder(symbol, price);
});



setTimeout(() => {}, 30000);
