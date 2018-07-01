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

  this._tradeTime = 3;
  this.cid = 1001;

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
TradingCore.prototype.updateCandidateQueue = async function(stream, candidates, queue){
  var self = this;

  console.log('%c == {Other} queue:', 'background-color: red; color: white;', queue)

  for (let i=0;i<candidates.length;i++) {
    let cand = candidates[i];

    if (cand.rate >= this._minQueuePercentageThreshold){
      let key = cand.a_step_from + cand.b_step_from + cand.c_step_from;

      console.log('== {Other} key:', key)

      // store in queue using trio key. If new, initialise rates and hits. Else increment hits by 1.
      if (!queue[key]){
        cand.rates = [];
        cand.hits = 1;
        cand.isTrade = false;
        queue[key] = cand;
      } else {
        queue[key] = { ...queue[key], hits: ++queue[key].hits, isTrade: false };
      }
      queue[key].rates.push(cand.rate);
    } else {
      // results are sorted descending by rate
      // break to loop, why waste CPU if the rest in this call are definitely not past the threshold.
      break;
    }
  }
  
  // place top candidates at beginning of queue
  if (queue) {
    queue.sort(function(a, b) { return parseInt(b.hits) - parseInt(a.hits); });

    self.candidateQueue = queue;
    self.emit('queueUpdated', queue);
    await self.processQueue(queue, stream, self.time());
  }

  return queue;
};


// act on elements in the queue that 
TradingCore.prototype.processQueue = async function(queue, stream){
  var self = this;
  let keys = Object.keys(queue);

  for (let i=0;i<keys.length;i++){
    let cand = queue[keys[i]];
    
    if (cand.hits >= this._minHitsThreshold){
      
      let liveRate = self._currencyCore.getArbitageRate(stream, cand.a_step_from, cand.b_step_from, cand.c_step_from);

      if (liveRate && liveRate.rate < this._minQueuePercentageThreshold && cand.isTrade) {
        return;
      }

      self.emit('newTradeQueued', cand, self.time());

      cand.isTrade = true
      cand.id = this.cid
      this.cid = this.cid + 1;

      await self.trading(cand);
    }
  }
};

TradingCore.prototype.trading = async function (candidate) {
    const self = this
    const trade1 = { ...candidate.a }
    const trade2 = { ...candidate.b }
    const trade3 = { ...candidate.c }

    console.log(`<${candidate.id}> ==========  ${trade1.s} | ${trade2.s} | ${trade3.s}  ===========`)

    if (trade1.tradeInfo.symbol.indexOf('ETH') <= 0) {
        console.log(`<${candidate.id}>[warning] tradeA eth pos less then 0`)
        return;
    }

    if (self._tradeTime <= 0) {
        console.log(`<${candidate.id}> well its over!`)
        return;
    }

    self._tradeTime = self._tradeTime - 1;

    // save
    self.dBHelpers.createArbPair(this._db, candidate);

    trade1.tradeInfo.type = 'limit';
    trade1.tradeInfo.timeInForce = 'IOC';
    trade1.tradeInfo.side = 'BUY';
    trade1.tradeInfo.quantity = (0.035 / trade1.a).toFixed(2)
    trade1.tradeInfo.price = trade1.a

    // trade2.tradeInfo.type = 'limit';
    // trade2.tradeInfo.timeInForce = 'IOC';

    trade2.tradeInfo.side = 'BUY';
    trade2.tradeInfo.type = 'LIMIT';
    trade2.tradeInfo.timeInForce = 'GTC';
    trade2.tradeInfo.quantity = parseInt(trade1.tradeInfo.quantity / trade2.a);
    trade2.tradeInfo.price = trade2.a

    trade3.tradeInfo.side = 'SELL';
    trade3.tradeInfo.type = 'LIMIT';
    trade3.tradeInfo.timeInForce = 'GTC';
    trade3.tradeInfo.quantity = trade2.tradeInfo.quantity
    trade3.tradeInfo.price = trade3.b

    // console.log('[trade1]:', 'symbol:', trade1.tradeInfo.symbol, 'side:', trade1.tradeInfo.side);
    // console.log('[trade2]:', 'symbol:', trade2.tradeInfo.symbol, 'side:', trade2.tradeInfo.side);
    // console.log('[trade3]:', 'symbol:', trade3.tradeInfo.symbol, 'side:', trade3.tradeInfo.side);

    console.log(`<${candidate.id}> [trade1]:`, 'symbol:', trade1.tradeInfo);

    try {
        await self.asyncNewOrder({ ...trade1.tradeInfo }, candidate.id + ' trade1')
        console.log(`<${candidate.id}> [trade2]:`, 'symbol:', trade2.tradeInfo);
        await self.asyncNewOrder({ ...trade2.tradeInfo }, candidate.id + ' trade2', true);
        console.log(`<${candidate.id}> [trade3]:`, 'symbol:', trade3.tradeInfo);
        const res = await self.asyncNewOrder({ ...trade3.tradeInfo }, candidate.id + ' trade3', true);
        console.log(`%c <${candidate.id}> Arbitrage Success:`, 'color: red', `use ${trade1.tradeInfo.quantity * trade1.a} ETH to get: ${res.quantity * res.price} ETH`);
    } catch (e) {
        console.log(`%c <${candidate.id}> Arbitrage Failed:`, 'color: green',e);
        self._tradeTime = self._tradeTime + 1;
    }
}

TradingCore.prototype.asyncQueryOrder = async function (trade, orderId) {
    const self = this
    let i = 3

    let orderStatus = await self._exchange.queryOrder({
        symbol: trade.symbol,
        orderId: orderId
    });

    // Check 3 time if order filled
    if (orderStatus.status !== 'FILLED' && trade.timeInForce !== 'IOC') {
        while (i > 0) {
            i--;
            console.log(`<${cid}> Get Order Info ${i} time`)

            orderStatus = await self._exchange.queryOrder({
                symbol: trade.symbol,
                orderId: payload.orderId
            });

            if (orderStatus.status === 'FILLED') {
                break
            }
        }
    }

    return orderStatus
}

/**
 * Async place an order
 *
 * If order not limit IOC, wait to check 3 time if the order was filled
 * if not, then cancel, and report an error, .
 *
 * @param mustBeFilled For those 3 time not filled order, buy or sell by market price
 * @param trade
 * @returns {Promise.<*>}
 */
TradingCore.prototype.asyncNewOrder = async function (trade, cid, mustBeFilled = false) {
    const self = this

    try {
        const payload = await self._exchange.newOrder(trade)
        const orderStatus = await self.asyncQueryOrder(trade, payload.orderId)
        console.log(`<${cid}> [${trade.symbol}] Book order result:`, payload)

        if (orderStatus.status !== 'FILLED' && trade.timeInForce !== 'IOC') {
            // If not filled then cancel.
            const cancelResult = await self._exchange.cancelOrder({
                symbol: trade.symbol,
                orderId: payload.orderId
            })

            console.log(`<${cid}> Cancel Result:`, cancelResult)

            // place an new order with market price
            if (mustBeFilled) {
                const newTrade = { ...trade, type: 'MARKET' }
                console.log(`<${cid}> Convert to Market Price: `, newTrade)

                delete newTrade.timeInForce
                delete newTrade.price

                return await self.asyncNewOrder(newTrade, false)
            }
        }

        console.log(`<${cid}> Get Order Info:`, orderStatus)

        trade.cid = cid;
        trade.status = orderStatus.status;
        trade.orderId = orderStatus.orderId;
        trade.quantity = orderStatus.executedQty;
        trade.price = orderStatus.price;

        self.dBHelpers.saveOrder(this._db, trade);

        if (orderStatus.status === 'FILLED') {
            return trade;
        }

    } catch (e) {
        console.log('what happened:', e);
    }

    throw new Error('EXEC FAILED: order not filled')
    return {}
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