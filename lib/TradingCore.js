const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const DBHelpers = require('./DBHelpers').DBHelpers;
const PaperTradeCore = require('./PaperTradeCore');
const utils = require('./utils');

module.exports = TradingCore;

function TradingCore(ctrl) {
  if (!(this instanceof TradingCore)) return new TradingCore(ctrl);
  const tradeOpts = ctrl.options.trading

  this.paperTradeCore = new PaperTradeCore(tradeOpts.percentageOfFee, tradeOpts.mainCoinQuantityLimit);
  this.dBHelpers = new DBHelpers();
  this._started = Date.now();
  this._minQueuePercentageThreshold = tradeOpts.minQueuePercentageThreshold // (tradeOpts.minQueuePercentageThreshold) ? (tradeOpts.minQueuePercentageThreshold / 100) + 1 : 0;
  this._minHitsThreshold = (tradeOpts.minHitsThreshold) ? tradeOpts.minHitsThreshold : 0;
  this._mainCoinQuantityLimit = tradeOpts.mainCoinQuantityLimit;
  this._percentageOfFee = tradeOpts.percentageOfFee
  this._paperOnly = tradeOpts.paperOnly;
  this._arbitrage = ctrl.options.arbitrage;

  this._currencyCore = ctrl.currencyCore;
  this._exchange = ctrl.exchange;
  this._db = ctrl.storage.db;
  this._ctrl = ctrl;

  this._tradeTime = 2;
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

  // console.log('%c == {Other} queue:', 'background-color: red; color: white;', queue)

  for (let i=0;i<candidates.length;i++) {
    let cand = candidates[i];

    if (!cand) {
        continue
    }

    if (cand.rate >= this._minQueuePercentageThreshold){
      let key = cand.a_step_from + cand.b_step_from + cand.c_step_from;

      // store in queue using trio key. If new, initialise rates and hits. Else increment hits by 1.
      if (!queue[key]){
        cand.rates = [];
        cand.hits = 1;
        cand.isTrade = false;
        queue[key] = cand;
      } else {
        // queue[key].hits++
        // queue[key].isTrade = false
        queue[key] = { ...queue[key], ...cand, hits: ++queue[key].hits, isTrade: false };
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

    if (cand.hits < this._minHitsThreshold) {
        return
    }
      // let liveRate = self._currencyCore.getArbitageRate(stream, cand.a_step_from, cand.b_step_from, cand.c_step_from);
      //
      // console.log('liveRate:', liveRate)
      //
      // // if rate not rach threshold or is already traded or tradeTime less then 0 then do not trade
      // if (liveRate && liveRate.rate < this._minQueuePercentageThreshold || self._tradeTime <= 0 || cand.isTrade) {
      //   return;
      // }

    console.log(`<before ${cand.id}> ${cand.dir} ==========  ${cand.a.s} | ${cand.b.s} | ${cand.c.s}  ===========`)

    if (self._tradeTime <= 0 || cand.isTrade) {
      return
    }

    cand.isTrade = true
    cand.id = this.cid
    this.cid = this.cid + 1;

    self.emit('newTradeQueued', cand, self.time());

    try {
      await self.trading(cand);
    } catch(e) {
      console.log('[trading] e:', e)
    }
  }
};

TradingCore.prototype.subAllFee = function () {
    return 0.0
}

TradingCore.prototype.trading = async function (candidate) {
    const self = this

    console.log(`<${candidate.id}> ${candidate.trading.dir} ==========  ${candidate.a.s} | ${candidate.b.s} | ${candidate.c.s}  ===========`)

    let tradeObj

    switch (candidate.trading.dir) {
        case 'NEG':
            // tradeObj = self.negCycleArbitrage(candidate)
            tradeObj = self.posCycleArbitrage(candidate)
            break
        case 'POS':
            // tradeObj = self.posCycleArbitrage(candidate)
            tradeObj = self.negCycleArbitrage(candidate)
            break
        default:
            return
    }

    console.log(`<${candidate.id}> ===== ${candidate.dir} ======`)

    const { trade1, trade2, trade3 } = tradeObj

    self._tradeTime = self._tradeTime - 1;

    if (this._paperOnly) {
        this.paperTradeCore.arbitrage(trade1, trade2, trade3, candidate);
        return;
    }

    // save
    self.dBHelpers.createArbPair(this._db, { trade1, trade2, trade3, cId: candidate.id });

    try {
        console.log(`<${candidate.id}> [trade1]:`, 'symbol:', trade1);
        await self.asyncNewOrder({ ...trade1 }, candidate.id + ' trade1')

        console.log(`<${candidate.id}> [trade2]:`, 'symbol:', trade2);
        await self.asyncNewOrder({ ...trade2 }, candidate.id + ' trade2', true);

        console.log(`<${candidate.id}> [trade3]:`, 'symbol:', trade3);
        const res = await self.asyncNewOrder({ ...trade3 }, candidate.id + ' trade3', true);

        console.log(`%c <${candidate.id}> Arbitrage Success:`, 'color: red', `use ${trade1.quantity / trade1.a} ETH to get: ${res.quantity * res.price} ETH`);
    } catch (e) {
        console.log(`%c <${candidate.id}> Arbitrage Failed:`, 'color: green', e);
        // self._tradeTime = self._tradeTime + 1;
    }
}

/**
 * positive cycle arbitrage
 * @param candidate
 */
TradingCore.prototype.posCycleArbitrage = function (candidate) {
    const quantityLimit = this._mainCoinQuantityLimit;
    // const fee = self._ctrl.trading.percentageOfFee;

    const { baseMid, quoteMid, baseQuote } = candidate.trading

    const trade1 = baseQuote.tradeInfo;
    const trade2 = baseMid.tradeInfo;
    const trade3 = quoteMid.tradeInfo;

    trade1.price = parseFloat(baseQuote.a)
    trade2.price = parseFloat(baseMid.b)
    trade3.price = parseFloat(quoteMid.a)

    trade1.side = 'BUY';
    trade2.side = 'SELL';
    trade3.side = 'BUY';

    trade1.quantity = parseFloat(quantityLimit.div(trade1.price).toFixed(2));
    trade2.quantity = trade1.quantity.mul(1.0.sub(this._percentageOfFee)) // * trade2.b;

    // trade2.qut * trade2.buy1 / trade3.sell1
    trade3.quantity = parseFloat(((trade2.quantity.mul(trade2.price)).div(trade3.price)).toFixed(2)).mul(1.0.sub(this._percentageOfFee));

    trade1.type = 'LIMIT';
    trade1.timeInForce = 'GTC';
    trade2.type = 'LIMIT';
    trade2.timeInForce = 'GTC';
    trade3.type = 'LIMIT';
    trade3.timeInForce = 'GTC';

    if (this._paperOnly) {
        trade1.stepFrom = baseQuote.stepFrom;
        trade2.stepFrom = baseMid.stepFrom;
        trade3.stepFrom = quoteMid.stepFrom;
    }

    return { trade1, trade2, trade3 };
}

TradingCore.prototype.negCycleArbitrage = function (candidate) {
    const quantityLimit = this._mainCoinQuantityLimit;
    // const fee = self._ctrl.trading.percentageOfFee;

    const { baseMid, quoteMid, baseQuote } = candidate.trading

    // neg
    const trade1 = quoteMid.tradeInfo;
    const trade2 = baseMid.tradeInfo;
    const trade3 = baseQuote.tradeInfo;

    trade1.price = parseFloat(quoteMid.b)
    trade2.price = parseFloat(baseMid.a)
    trade3.price = parseFloat(baseQuote.b)

    // neg
    trade1.side = 'SELL';
    trade2.side = 'BUY';
    trade3.side = 'SELL';

    trade1.quantity = parseFloat((quantityLimit.div(trade1.price)).toFixed(2));
    trade2.quantity = (trade1.quantity.mul(trade1.price)).div(trade2.price);
    trade3.quantity = trade2.quantity.mul(1.0.sub(this._percentageOfFee));

    trade1.type = 'LIMIT';
    trade1.timeInForce = 'GTC';
    trade2.type = 'LIMIT';
    trade2.timeInForce = 'GTC';
    trade3.type = 'LIMIT';
    trade3.timeInForce = 'GTC';

    if (this._paperOnly) {
        trade1.stepFrom = quoteMid.stepFrom;
        trade2.stepFrom = baseMid.stepFrom;
        trade3.stepFrom = baseQuote.stepFrom;
    }

    return { trade1, trade2, trade3 };
}

TradingCore.prototype.asyncQueryOrder = async function (trade, orderId, cid) {
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
                orderId: orderId
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
        const orderStatus = await self.asyncQueryOrder(trade, payload.orderId, cid)
        console.log(`<${cid}> [${trade.symbol}] Book order result:`, payload)

        if (orderStatus.status !== 'FILLED' && trade.timeInForce !== 'IOC') {
            console.log(`<${cid}> Prepare to cancel`)

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
        console.log(`<${cid}> what happened:`, e);
    }

    throw new Error('EXEC FAILED: order not filled')
    return {}
}

TradingCore.prototype.time = function() {
    var self = this;
    return this._started && Date.now() - this._started;
};