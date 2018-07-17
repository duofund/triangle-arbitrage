
var exchangeAPI = {};

const api = require('binance');
exchangeAPI = new api.BinanceRest({
    key: '8Fi61QWrLnMI6PtkEPIGJExqYtmqJ9FODgQONAfhddFhcP2MmMEekYwfDmV1yzFL',
    secret: 'sABVL2FnaDPACr3EzZz7tzmhFHBywJhPZ4U3NdUBMpnJ73kUr6eApDHqEoWGz3wB',
    timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: 1000, // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: true
});

console.log('time:', new Date().getTime())

exchangeAPI.bookTicker().then(data => {
    console.log('array time:', new Date().getTime())

    console.log('data:', data)
})

setTimeout(() => {
    console.log('its over')
}, 100 * 1000)