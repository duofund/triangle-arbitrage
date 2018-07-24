const utils = require('./utils')
const algorithms = require('./algorithms')

var CurrencyCore = {}
var controller = {}

CurrencyCore.events = {}
CurrencyCore.events.onAllTickerStream = ()=>{},

// constructor
CurrencyCore.init = (ctrl, tradingCore) => {
  if (!ctrl.exchange) {
    throw 'Undefined currency exchange connector. Will not be able to communicate with exchange API.'
  }
  
  // Stores
  CurrencyCore.currencies = {}, 
  CurrencyCore.sockets = {},
  CurrencyCore.streams = {},
  controller = ctrl,
  CurrencyCore.steps = ctrl.options.arbitrage.mainMarkets // ['BTC','ETH','BNB','USDT']

  CurrencyCore.startAllTickerStream(ctrl.exchange, ctrl)

  CurrencyCore.tradingCore = tradingCore
  CurrencyCore.cid = 1001

  CurrencyCore.tradeLimitCoins = {'BTC': true, 'ETH': true, 'BCH': true, 'LTC': true, 'ETC': true, 'XRP': true, 'FT': true, 'ZIP': true, 'OMG': true, 'BTM': true, 'ZRX': true, 'USDT': true, 'FI': true }

  return CurrencyCore
}

CurrencyCore.getCurrencyFromStream = (stream, fromCur, toCur)=>{
  if (!stream || !fromCur || !toCur) return

  var currency = stream.obj[toCur + '/' + fromCur]
  if (currency) {
    currency.flipped = false
    currency.rate = currency.a
  } else {
    currency = stream.obj[fromCur + '/' + toCur]

    if (!currency) return false

    currency.flipped = true
    currency.rate = (1/currency.b)
  }

  currency.stepFrom = fromCur
  currency.stepTo = toCur
  currency.tradeInfo = {
      symbol: currency.s
  }
  
  return currency
}

CurrencyCore.getArbitageRate = (stream, step1, step2, step3) => {
  if (!stream || !step1 || !step2 || !step3) return
  var ret = {
    a: CurrencyCore.getCurrencyFromStream(stream, step1, step2),
    b: CurrencyCore.getCurrencyFromStream(stream, step2, step3),
    c: CurrencyCore.getCurrencyFromStream(stream, step3, step1)
  }

  if (!ret.a || !ret.b || !ret.c) return

  ret.rate = (ret.a.rate) * (ret.b.rate) * (ret.c.rate)

  return ret
}

CurrencyCore.checkPosNeg = function (candidate) {
  const { baseMid, quoteMid, baseQuote } = utils.findArbitrageRelationship(candidate)
  const { posIndex, negIndex } = algorithms.triangularArbitrageDirection(baseMid, quoteMid, baseQuote)
  const allFee = 0.001 // this.subAllFee()
  const color = posIndex > 0 || negIndex > 0 ? 'red':'green'
  const profit = (posIndex > 0 ? posIndex : negIndex).mul(100).betterToFixed(4)

  let dir = posIndex > allFee ? 'POS' : negIndex > allFee ? 'NEG' : false

  color === 'red' && dir && console.log(`%c <${baseMid.s + quoteMid.s + baseQuote.s}> Profit: ${profit} %`, `background-color: ${profit > 0.1 ? color : 'green'}; color: white`)

  return {
    trading: {
        dir, posIndex, negIndex,
        baseMid, quoteMid, baseQuote
    },
    rate: profit
  }
}

CurrencyCore.checkAndTrade = function (candidate, arrowTime, keys) {
  if (!candidate.trading.dir || candidate.rate < controller.options.trading.minQueuePercentageThreshold) {
    return false
  }

  if (!this.checkIfTrade(keys)) return console.log('Keys not trade:', keys)


    candidate.id = this.cid
  this.cid++

  return new Promise(resolve => {
      console.log(`%c <${candidate.id} Check To Trade> ${new Date().getTime()} An Order been added <${candidate.ts}>`, 'color: #999999')
      candidate.ts = arrowTime
      this.tradingCore.trading(candidate)
      resolve()
  })
}

CurrencyCore.checkIfTrade = function ({ a, b, c }) {
    const ifTrade = (CurrencyCore.tradeLimitCoins && (CurrencyCore.tradeLimitCoins[a] && CurrencyCore.tradeLimitCoins[b] && CurrencyCore.tradeLimitCoins[c]))
        || !CurrencyCore.tradeLimitCoins

    return ifTrade
}

CurrencyCore.findCandidatesFromStreamViaPath = function (stream, aPair, bPair, arrowTime) {
    var keys = {
        a: aPair.toUpperCase(),
        b: bPair.toUpperCase(),
        c: 'findme'.toUpperCase(),
    }

    var apairs = stream.markets[keys.a]
    var bpairs = stream.markets[keys.b]

    var akeys = []
    apairs.map((obj, i, array) => {
        const coin = obj.s.replace(keys.a, '').split('/')[obj.s.indexOf(keys.a) === 0 ? 1 : 0]
        akeys[coin] = obj
    })

    // prevent 1-steps
    delete akeys[keys.b]

    var bmatches = []

    bpairs.map(bPairTicker => {
        const coins = bPairTicker.s.split('/')
        bPairTicker.key = coins.indexOf(keys.b) === 0 ? coins[1] : coins[0] // replace(keys.b,'')
        bPairTicker.startsWithKey = bPairTicker.s.startsWith(keys.b)
        bPairTicker.endsWithKey = bPairTicker.s.endsWith(keys.b)

        if (!akeys[bPairTicker.key]) return

        var match = bPairTicker
        var stepC = CurrencyCore.getCurrencyFromStream(stream, match.key, keys.a)

        if (!stepC) return

        keys.c = match.key

        var comparison = CurrencyCore.getArbitageRate(stream, keys.a, keys.b, keys.c)

        if (!comparison) return

        var dt = new Date()
        var triangle = {
            ws_ts: comparison.a.E,
            ts: +dt,
            dt: dt,

            aPair,
            bPair,
            cPair: keys.c,

            a: comparison.a,
            b: comparison.b,
            c: comparison.c,
            rate: comparison.rate
        }

        const checkPosNeg = this.checkPosNeg(triangle)
        triangle.rate = checkPosNeg.rate
        triangle.trading = checkPosNeg.trading
        triangle.trading.dir && bmatches.push(triangle)

        this.checkAndTrade(triangle, arrowTime, keys)
    })

    return bmatches
}


CurrencyCore.getDynamicCandidatesFromStream = (stream, options, arrowTime) => {
  var matches = []

  options.mainMarkets.map(path => {
    // for each path, open a new thread to handle it
    new Promise(resolve => {
      CurrencyCore.findCandidatesFromStreamViaPath(stream, options.start, path, arrowTime)
      resolve()
    })
  })

  return matches
}

CurrencyCore.events.onAllTickerStream = stream =>{
  const arrowTime = new Date().getTime()

  if (!stream || stream.length < 20) return

  var key = 'allMarketTickers'
  
  // Basic array from api arr[0].s = ETHBTC
  CurrencyCore.streams.allMarketTickers.arr = stream
  
  // Mapped object arr[ETHBTC]
  CurrencyCore.streams.allMarketTickers.obj = stream.reduce(function ( array, current ) {
    array[current.s] = current
    return array
  }, {})

  // Sub objects with only data on specific markets
  CurrencyCore.steps.map(step => {
    CurrencyCore.streams.allMarketTickers.markets[step] = stream.filter(e => (e.s.endsWith(step) || e.s.startsWith(step)))
  })

  // something's wrong here. The BNB tree doesn't have BTC, although the BTC tree does.
  
  if (controller && controller.storage.streamTick)
    controller.storage.streamTick(CurrencyCore.streams[key], key, arrowTime)
}

CurrencyCore.startAllTickerStream = function(exchange){
  if (!CurrencyCore.streams.allMarketTickers){
    CurrencyCore.streams.allMarketTickers = {}
    CurrencyCore.streams.allMarketTickers.arr = [],
    CurrencyCore.streams.allMarketTickers.obj = {}
    CurrencyCore.streams.allMarketTickers.markets = []
  }

  CurrencyCore.sockets.allMarketTickerStream = exchange.startAllTickerStream(CurrencyCore.events.onAllTickerStream)
}

module.exports = CurrencyCore.init
