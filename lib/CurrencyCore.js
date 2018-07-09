const utils = require('./utils')
const algorithms = require('./algorithms')

var CurrencyCore = {};
var controller = {};

CurrencyCore.events = {};
CurrencyCore.events.onAllTickerStream = ()=>{},

// constructor
CurrencyCore.init = (ctrl, tradingCore) => {
  if (!ctrl.exchange){
    throw 'Undefined currency exchange connector. Will not be able to communicate with exchange API.';
  }
  
  // Stores
  CurrencyCore.currencies = {}, 
  CurrencyCore.sockets = {},
  CurrencyCore.streams = {},
  controller = ctrl,
  CurrencyCore.steps = ['BTC','ETH','BNB','USDT'];

  //CurrencyCore.startWSockets(exchange, ctrl);
  CurrencyCore.startAllTickerStream(ctrl.exchange, ctrl);
  CurrencyCore.queueTicker(5000);

  CurrencyCore.tradingCore = tradingCore;
  CurrencyCore.cid = 1001;

  return CurrencyCore;
};

CurrencyCore.queueTicker = (interval)=>{
  if (!interval) interval = 3000;
  setTimeout(()=>{ 
    CurrencyCore.queueTicker(interval);
  }, interval);
  CurrencyCore.tick();
};

CurrencyCore.tick = ()=>{
  //debugger;
};

CurrencyCore.getCurrencyFromStream = (stream, fromCur, toCur)=>{
  if (!stream || !fromCur || !toCur) return;
    
  /*
   Binance uses xxxBTC notation. If we're looking at xxxBTC and we want to go from BTC to xxx, that means we're buying, vice versa for selling.
  */
  var currency = stream.obj[toCur + fromCur];
  if (currency){

    // return false
    // found a match using reversed binance syntax, meaning we're buying if we're going from->to (btc->xxx in xxxBTC ticker) using a fromCurtoCur ticker.
    currency.flipped = false;
    currency.rate = currency.a;
    
    // BNBBTC
    // ask == trying to buy
  } else {
    // debugger;
    currency = stream.obj[fromCur + toCur];
    if (!currency){
      return false;
    }
    currency.flipped = true;
    currency.rate = (1/currency.b);

    // BTCBNB
    // bid == im trying to sell.
  }
  currency.stepFrom = fromCur;
  currency.stepTo = toCur;
    
  currency.tradeInfo = {
    symbol: currency.s,
    side: (currency.flipped == true) ? 'SELL' : 'BUY',
    type: 'MARKET',
    quantity: 1
  };
  // console.log('getCurrencyFromStream: from/to: ', currency.stepFrom, currency.stepTo);
  
  return currency;
};

CurrencyCore.getArbitageRate = (stream, step1, step2, step3)=>{
  if (!stream || !step1 || !step2 || !step3) return;
  var ret = {
    a: CurrencyCore.getCurrencyFromStream(stream, step1, step2),
    b: CurrencyCore.getCurrencyFromStream(stream, step2, step3),
    c: CurrencyCore.getCurrencyFromStream(stream, step3, step1)
  };

  if (!ret.a || !ret.b || !ret.c) return;

  ret.rate = (ret.a.rate) * (ret.b.rate) * (ret.c.rate);

  // if (ret.rate > 1.03) {
  //   console.log(`a: ${ret.a.s} ${ret.a.tradeInfo.side}`)
  //   console.log(`b: ${ret.b.s} ${ret.b.tradeInfo.side}`)
  //   console.log(`c: ${ret.c.s} ${ret.c.tradeInfo.side}`)
  //   console.log('rate:', ret.rate)
  //   debugger;
  // }

  return ret;
};

CurrencyCore.checkPosNeg = function (candidate) {
  const { baseMid, quoteMid, baseQuote } = utils.findArbitrageRelationship(candidate)
  const { posIndex, negIndex } = algorithms.triangularArbitrageDirection(baseMid, quoteMid, baseQuote)
  const allFee = 0.001 // this.subAllFee()
  const color = posIndex > 0 || negIndex > 0 ? 'red':'green'
  const profit = (posIndex > 0 ? posIndex : negIndex).mul(100).betterToFixed(4)

  let dir = posIndex > allFee ? 'POS' : negIndex > allFee ? 'NEG' : false

  color === 'red' && dir && console.log(`%c <${baseMid.s + quoteMid.s + baseQuote.s}> Profit: ${profit} %`, `background-color: ${profit > 0.1 ? color : 'green'}; color: white;`)

  return {
    trading: {
        dir, posIndex, negIndex,
        baseMid, quoteMid, baseQuote
    },
    rate: profit // posIndex > negIndex ? posIndex : negIndex
  }
}

CurrencyCore.getCandidatesFromStreamViaPath = function (stream, aPair, bPair, arrowTime) {
  var keys = {
    a: aPair.toUpperCase(),
    b: bPair.toUpperCase(),
    c: 'findme'.toUpperCase(),
  };
  
  var apairs = stream.markets[keys.a];
  var bpairs = stream.markets[keys.b];
  
  var akeys = [];
  apairs.map((obj, i, array)=>{ akeys[obj.s.replace(keys.a, '')] = obj; });
    
  // prevent 1-steps
  delete akeys[keys.b];
  
  /*
    Loop through BPairs
      for each bpair key, check if apair has it too. 
      If it does, run arbitrage math
  */
  var bmatches = [];
  for (let i=0;i<bpairs.length;i++){
    var bPairTicker = bpairs[i];
    bPairTicker.key = bPairTicker.s.replace(keys.b,'');
    
    // from B to C
    bPairTicker.startsWithKey = bPairTicker.s.startsWith(keys.b);
    
    // from C to B
    bPairTicker.endsWithKey = bPairTicker.s.endsWith(keys.b);
    
    if (akeys[bPairTicker.key]){       
      var match = bPairTicker;
      // check price from bPairTicker.key to keys.a
       
      var stepC = CurrencyCore.getCurrencyFromStream(stream, match.key, keys.a);
       
      // only do this if we definitely found a path. Some paths are impossible, so will result in an empty stepC quote.
      if (stepC){
        keys.c = match.key;
       
        var comparison = CurrencyCore.getArbitageRate(stream, keys.a, keys.b, keys.c);

         
        if (comparison){
          // console.log('getCandidatesFromStreamViaPath: from/to a: ', comparison.a.stepFrom, comparison.a.stepTo);
          // console.log('getCandidatesFromStreamViaPath: from/to b: ', comparison.b.stepFrom, comparison.b.stepTo);
          // console.log('getCandidatesFromStreamViaPath: from/to c: ', comparison.c.stepFrom, comparison.c.stepTo);
          var dt = new Date();
          var triangle = {
            ws_ts: comparison.a.E,
            ts: +dt,
            dt: dt,

            aPair,
            bPair,
            cPair: keys.c,

            // these are for storage later
            a: comparison.a,//full ticker for first pair (BTC->BNB)
            a_symbol: comparison.a.s,
            a_step_from: comparison.a.stepFrom,//btc
            a_step_to: comparison.a.stepTo,//bnb
            a_step_type: comparison.a.tradeInfo.side,
            a_bid_price: comparison.a.b,
            a_bid_quantity: comparison.a.B,
            a_ask_price: comparison.a.a,
            a_ask_quantity: comparison.a.A,
            a_volume: comparison.a.v,
            a_trades: comparison.a.n,
             
            b: comparison.b,//full ticker for second pair (BNB->XMR)
            b_symbol: comparison.b.s,
            b_step_from: comparison.b.stepFrom,//bnb
            b_step_to: comparison.b.stepTo,//xmr
            b_step_type: comparison.b.tradeInfo.side,
            b_bid_price: comparison.b.b,
            b_bid_quantity: comparison.b.B,
            b_ask_price: comparison.b.a,
            b_ask_quantity: comparison.b.A,
            b_volume: comparison.b.v,
            b_trades: comparison.b.n,
             
            c: comparison.c,////full ticker for third pair (XMR->BTC)
            c_symbol: comparison.c.s,
            c_step_from: comparison.c.stepFrom,//xmr
            c_step_to: comparison.c.stepTo,//btc
            c_step_type: comparison.c.tradeInfo.side,
            c_bid_price: comparison.c.b,
            c_bid_quantity: comparison.c.B,
            c_ask_price: comparison.c.a,
            c_ask_quantity: comparison.c.A,
            c_volume: comparison.c.v,
            c_trades: comparison.c.n,
             
            rate: comparison.rate
          };

          const checkPosNeg = this.checkPosNeg(triangle)
          triangle = { ...triangle, ...checkPosNeg }
          triangle.trading.dir &&  bmatches.push(triangle);

          this.checkAndTrade(triangle, arrowTime)
           
          // console.log('getCandidatesFromStreamViaPath: from/to a: ', triangle.a_step_from, triangle.a_step_to);
          // console.log('getCandidatesFromStreamViaPath: from/to b: ', triangle.b_step_from, triangle.b_step_to);
          // console.log('getCandidatesFromStreamViaPath: from/to c: ', triangle.c_step_from, triangle.c_step_to);
        }
      }           
    }
  }
    
  // if (bmatches.length){
  //   bmatches.sort(function(a, b) { return parseFloat(b.rate) - parseFloat(a.rate); });
  // }
  
  return bmatches;
};

CurrencyCore.checkAndTrade = function (candidate, arrowTime) {
  if (!candidate.trading.dir || candidate.rate < controller.options.trading.minQueuePercentageThreshold) {
    return false
  }

  candidate.id = this.cid
  this.cid++

  return new Promise((resolve, reject) => {
      console.log(`%c <${candidate.id} Check To Trade> ${new Date().getTime()} An Order been added <${candidate.ts}>`, 'color: #999999')
      candidate.ts = arrowTime
      this.tradingCore.trading(candidate)
      resolve()
  })
}

CurrencyCore.getDynamicCandidatesFromStream = (stream, options, arrowTime)=>{
  var matches = [];

  for (let i=0;i<options.paths.length;i++){
    var pMatches = CurrencyCore.getCandidatesFromStreamViaPath(stream, options.start, options.paths[i], arrowTime);
    // matches = matches.concat(pMatches);
    // console.log("adding: " + pMatches.length + " to : " + matches.length);
  }
  
  // if (matches.length){
    //   matches.sort(function(a, b) { return parseFloat(b.rate) - parseFloat(a.rate); });
    // }

  return matches;
};

CurrencyCore.simpleArbitrageMath = (stream, candidates)=>{
  if (!stream || !candidates) return;
  //EURUSD * (1/GBPUSD) * (1/EURGBP) = 1 

  //start btc
  //via xUSDT
  //end btc
  
  var a = candidates['BTCUSDT'];
  var b = candidates['ETHUSDT'];
  var c = candidates['ETHBTC'];
  
  if (!a || isNaN(a) || !b || isNaN(b) || !c || isNaN(c)) return;
  
  //btcusd : (flip/usdEth) : ethbtc
  var d = (a.b) * (1/b.b) * (c.b);
  //debugger;
  return d;
};

// Fires once per second, with  all ticker data from Binance
CurrencyCore.events.onAllTickerStream = stream =>{
  const arrowTime = new Date().getTime()

  var key = 'allMarketTickers';
  
  // Basic array from api arr[0].s = ETHBTC
  CurrencyCore.streams.allMarketTickers.arr = stream;
  
  // Mapped object arr[ETHBTC]
  CurrencyCore.streams.allMarketTickers.obj = stream.reduce(function ( array, current ) {
    array[current.s] = current;
    return array;
  }, {});

  // Sub objects with only data on specific markets
  for (let i=0;i<CurrencyCore.steps.length;i++)
    CurrencyCore.streams.allMarketTickers.markets[CurrencyCore.steps[i]] = stream.filter(e => (e.s.endsWith(CurrencyCore.steps[i]) || e.s.startsWith(CurrencyCore.steps[i])));
  
  // something's wrong here. The BNB tree doesn't have BTC, although the BTC tree does.
  
  if (controller && controller.storage.streamTick)
    controller.storage.streamTick(CurrencyCore.streams[key], key, arrowTime);
};

// starts one global stream for all selectors. Stream feeds back info every second:
// https://github.com/binance-exchange/binance-official-api-docs/blob/master/web-socket-streams.md#all-market-tickers-stream
CurrencyCore.startAllTickerStream = function(exchange){
  if (!CurrencyCore.streams.allMarketTickers){
    CurrencyCore.streams.allMarketTickers = {};
    CurrencyCore.streams.allMarketTickers.arr = [],
    CurrencyCore.streams.allMarketTickers.obj = {};
    CurrencyCore.streams.allMarketTickers.markets = [];
  }

  CurrencyCore.sockets.allMarketTickerStream = exchange.WS.onAllTickers(CurrencyCore.events.onAllTickerStream);
};

// starts streams for specific selectors
CurrencyCore.startWSockets = function(exchange, ctrl){
  
  // loop through provided csv selectors, and initiate trades & orderBook sockets for each
  for (let i = 0;i < CurrencyCore.selectors.length;i++){
    
    let selector = require('./CurrencySelector.js')(CurrencyCore.selectors[i], exchange);
    
    CurrencyCore.currencies[selector.key] = selector;
    CurrencyCore.currencies[selector.key].handleEvent = ctrl.events.wsEvent;
    CurrencyCore.currencies[selector.key].startWSockets(ctrl.events);
  }
};


module.exports = CurrencyCore.init;
