const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const DBHelpers = require('./DBHelpers').DBHelpers;
const utils = require('./utils');

module.exports = TradingCore;

function TradingCore(opts, ctrl) {
  if (!(this instanceof TradingCore)) return new TradingCore(opts, ctrl);

  this.dBHelpers = new DBHelpers();
  this._started = Date.now();
  this._minQueuePercentageThreshold = (opts.minQueuePercentageThreshold) ? (opts.minQueuePercentageThreshold / 100) + 1 : 0;
  this._minHitsThreshold = (opts.minHitsThreshold) ? opts.minHitsThreshold : 0;
  this._currencyCore = ctrl.currencyCore;
  this._exchange = ctrl.exchange;
  this._db = ctrl.storage.db;
  this._ctrl = ctrl;

  this._tradeTime = 2;

  this._activeTrades = {};

  EventEmitter.call(this);
}

inherits(TradingCore, EventEmitter);

TradingCore.prototype.initiateTrade = function(pathInfo){
  var self = this;
  
  /*
   - 
  
  */
}
TradingCore.prototype.updateCandidateQueue = function(stream, candidates, queue){
  var self = this;
    
  for (let i=0;i<candidates.length;i++){
    let cand = candidates[i];

    if (cand.rate >= this._minQueuePercentageThreshold){
      let key = cand.a_step_from + cand.b_step_from + cand.c_step_from;
      
      // store in queue using trio key. If new, initialise rates and hits. Else increment hits by 1.
      if (!queue[key]){
        cand.rates = [];
        cand.hits = 1;
        queue[key] = cand;
      } else {
        queue[key].hits++;
      }
      queue[key].rates.push(cand.rate);
    } else {
      // results are sorted descending by rate
      // break to loop, why waste CPU if the rest in this call are definitely not past the threshold.
      break;
    }
  }
  
  // place top candidates at beginning of queue
  if (queue){
    queue.sort(function(a, b) { return parseInt(b.hits) - parseInt(a.hits); });

    self.candidateQueue = queue;
    self.emit('queueUpdated', queue);
    self.processQueue(queue, stream, self.time());
  }

  return queue;
};


// act on elements in the queue that 
TradingCore.prototype.processQueue = function(queue, stream){
  var self = this;
  let keys = Object.keys(queue);

  for (let i=0;i<keys.length;i++){
    let cand = queue[keys[i]];
    
    if (cand.hits >= this._minHitsThreshold){
      
      let liveRate = self._currencyCore.getArbitageRate(stream, cand.a_step_from, cand.b_step_from, cand.c_step_from);

      if (liveRate && liveRate.rate < this._minQueuePercentageThreshold) {
        return;
      }

      self.emit('newTradeQueued', cand, self.time());

      self.trading(cand);
    }
  }
};

TradingCore.prototype.trading = function (candidate) {
    const self = this

    const tradeInfoA = candidate.a.tradeInfo

    if (tradeInfoA.symbol.indexOf('ETH') <= 0) {
        console.log('[warning] tradeA eth pos less then 0', tradeInfoA)
        return;
    }

    if (self._tradeTime <= 0) {
        console.log('well its over!')
        return;
    }

    console.log('===============================')

    self._tradeTime = self._tradeTime - 1;

    // save
    self.dBHelpers.createArbPair(this._db, candidate);
    // console.log('candication:', candidate);
    const trade1 = candidate.a
    const trade2 = candidate.b
    const trade3 = candidate.c

    console.log('candication:', candidate);


    trade1.tradeInfo.type = 'limit';
    trade1.tradeInfo.timeInForce = 'IOC';
    trade1.tradeInfo.side = 'BUY';
    trade1.tradeInfo.quantity = (0.02 / trade1.a).toFixed(2)
    trade1.tradeInfo.price = trade1.a

    trade2.tradeInfo.type = 'limit';
    trade2.tradeInfo.timeInForce = 'IOC';
    trade2.tradeInfo.side = 'BUY';
    trade2.tradeInfo.quantity = parseInt(trade1.tradeInfo.quantity / trade2.a);
    trade2.tradeInfo.price = trade2.a

    trade3.tradeInfo.side = 'SELL';
    trade3.tradeInfo.quantity = trade2.tradeInfo.quantity
    trade3.tradeInfo.price = trade3.b

    // console.log('[trade1]:', 'symbol:', trade1.tradeInfo.symbol, 'side:', trade1.tradeInfo.side);
    // console.log('[trade2]:', 'symbol:', trade2.tradeInfo.symbol, 'side:', trade2.tradeInfo.side);
    // console.log('[trade3]:', 'symbol:', trade3.tradeInfo.symbol, 'side:', trade3.tradeInfo.side);

    console.log('[begin trade1]:', 'symbol:', trade1.tradeInfo);

    self.newOrder({ ...trade1.tradeInfo }).then(data => {
        console.log('[begin trade2]:', 'symbol:', trade2.tradeInfo);
        return self.newOrder({ ...trade2.tradeInfo });
    }).then(data => {
        console.log('[begin trade3]:', 'symbol:', trade3.tradeInfo);
        return self.newOrder({ ...trade3.tradeInfo });
    }).then(data => {
        console.log('Arbitrage success get:', data.quantity, 'ETH');
    }).catch(e => {
        console.log('Arbitrage failed get:', e);
        // self._tradeTime = self._tradeTime + 1;
    });
}

TradingCore.prototype.newOrder = function (trade) {
    const self = this
    let result = null

    return new Promise((resolve, reject) => {
        self._exchange.newOrder(trade).then(payload => {
            console.log('Take order:', payload)

            result = payload

            return self._exchange.queryOrder({
                symbol: trade.symbol,
                orderId: payload.orderId
            });
        }).then((data) => {
            console.log('Get order info:', data)

            trade.status = data.status;
            trade.orderId = result.orderId;
            self.dBHelpers.saveOrder(this._db, trade);

            if (data.status === 'FILLED') {
                return resolve(trade);
            }

            return reject(trade);
        }).catch(e => {
            console.log('what happened:', e);
            reject(e)
            // self._tradeTime = self._tradeTime + 1;
        });
    });
}

TradingCore.prototype.time = function() {
    var self = this;
    return this._started && Date.now() - this._started;
};

// TradingCore.prototype.execArbitrage = function (trade) {
//     this._exchange.bookTicker(trade.symbol).then(data => {
//         console.log('[bookTicker] data:', data);
//
//         const price = data.bidPrice; // data.askPrice; // utils.floatSub(parseFloat(data.askPrice), 0.002)
//         console.log('price:', price, 'ask price:', data.askPrice);
//
//         return this.newOrder(trade);
//     });
// }