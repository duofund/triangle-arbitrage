const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const DBHelpers = require('./DBHelpers').DBHelpers;
const PaperTradeCore = require('./PaperTradeCore');
const utils = require('./utils');

module.exports = TradingCore;

function TradingCore(opts, ctrl) {
  if (!(this instanceof TradingCore)) return new TradingCore(opts, ctrl);
  this.paperTradeCore = new PaperTradeCore(opts.percentageOfFee, opts.mainCoinQuantityLimit);
  this.dBHelpers = new DBHelpers();
  this._started = Date.now();
  this._minQueuePercentageThreshold = (opts.minQueuePercentageThreshold) ? (opts.minQueuePercentageThreshold / 100) + 1 : 0;
  this._minHitsThreshold = (opts.minHitsThreshold) ? opts.minHitsThreshold : 0;
  this._mainCoinQuantityLimit = opts.mainCoinQuantityLimit;
  this._percentageOfFee = opts.percentageOfFee
  this._paperOnly = opts.paperOnly;

  this._currencyCore = ctrl.currencyCore;
  this._exchange = ctrl.exchange;
  this._db = ctrl.storage.db;
  this._ctrl = ctrl;

  this._tradeTime = 10;
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
    
    if (cand.hits >= this._minHitsThreshold){
      
      let liveRate = self._currencyCore.getArbitageRate(stream, cand.a_step_from, cand.b_step_from, cand.c_step_from);

      // if rate not rach threshold or is already traded or tradeTime less then 0 then do not trade
      if (liveRate && liveRate.rate < this._minQueuePercentageThreshold || self._tradeTime <= 0) { // cand.isTrade) {
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

TradingCore.prototype.subAllFee = function () {
    return 0.003
}

TradingCore.prototype.checkPosNeg = function (candidate) {
    const { a, b, c } = candidate

    const quoteCur = candidate.a_step_from
    const baseCur = candidate.c_step_from
    const midCur = candidate.b_step_from

    const baseMidBuy = c.b
    const baseMidSell = c.a
    const quoteMidBuy = a.b
    const quoteMidSell = a.a
    const baseQuoteBuy = b.b
    const baseQuoteSell = b.a

    const allFee = this.subAllFee()
    const posIndex = (baseMidBuy / quoteMidSell - baseQuoteSell) / baseQuoteSell
    const negIndex = (baseQuoteBuy - baseMidSell / quoteMidBuy) / baseQuoteBuy

    console.log(`<${candidate.id}> posIndex: ${posIndex} | negIndex: ${negIndex} | allFee: ${allFee}`)

    if (posIndex > allFee) {
        return 'POS'
    }

    if (negIndex > allFee) {
        return 'NEG'
    }

    return false
}

TradingCore.prototype.trading = async function (candidate) {
    const self = this

    console.log(`<${candidate.id}> ==========  ${candidate.a.s} | ${candidate.b.s} | ${candidate.c.s}  ===========`)

    const tag = this.checkPosNeg(candidate)
    let tradeObj

    switch (tag) {
        case 'NEG':
            tradeObj = self.negCycleArbitrage(candidate)
            break
        case 'POS':
            tradeObj = self.posCycleArbitrage(candidate)
            break
        default:
            console.log(`<${candidate.id}> [ERROR] neither pos or neg cannot cover fee`)
            return
    }

    const trade1 = tradeObj.trade1
    const trade2 = tradeObj.trade2
    const trade3 = tradeObj.trade3

    if (trade1.tradeInfo.symbol.indexOf(process.env.binanceStartingPoint) <= 0) {
        console.log(`<${candidate.id}> [warning] tradeA eth pos less then 0`)
        return;
    }

    self._tradeTime = self._tradeTime - 1;

    if (this._paperOnly) {
        this.paperTradeCore.arbitrage(trade1, trade2, trade3, candidate);
        return;
    }

    // save
    self.dBHelpers.createArbPair(this._db, { trade1, trade2, trade3, cId: candidate.id });

    try {
        console.log(`<${candidate.id}> [trade1]:`, 'symbol:', trade1.tradeInfo);
        await self.asyncNewOrder({ ...trade1.tradeInfo }, candidate.id + ' trade1')

        console.log(`<${candidate.id}> [trade2]:`, 'symbol:', trade2.tradeInfo);
        await self.asyncNewOrder({ ...trade2.tradeInfo }, candidate.id + ' trade2', true);

        console.log(`<${candidate.id}> [trade3]:`, 'symbol:', trade3.tradeInfo);
        const res = await self.asyncNewOrder({ ...trade3.tradeInfo }, candidate.id + ' trade3', true);

        console.log(`%c <${candidate.id}> Arbitrage Success:`, 'color: red', `use ${trade1.tradeInfo.quantity / trade1.a} ETH to get: ${res.quantity * res.price} ETH`);
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
    const self = this;

    const quantityLimit = self._mainCoinQuantityLimit;
    // const fee = self._ctrl.trading.percentageOfFee;

    const trade1 = { ...candidate.a };
    const trade2 = { ...candidate.b };
    const trade3 = { ...candidate.c };

    trade1.tradeInfo.side = 'BUY';
    trade2.tradeInfo.side = 'BUY';
    trade3.tradeInfo.side = 'SELL';

    trade1.tradeInfo.quantity = parseInt(quantityLimit / trade1.b);
    trade2.tradeInfo.quantity = trade1.tradeInfo.quantity / trade2.b;
    // trade2.tradeInfo.quantity = parseInt(trade1.tradeInfo.quantity / trade2.b);
    trade3.tradeInfo.quantity = parseFloat(trade2.tradeInfo.quantity).mul(1.0.sub(this._percentageOfFee));

    trade1.tradeInfo.type = 'LIMIT';
    trade1.tradeInfo.timeInForce = 'GTC';
    trade2.tradeInfo.type = 'LIMIT';
    trade2.tradeInfo.timeInForce = 'GTC';
    trade3.tradeInfo.type = 'LIMIT';
    trade3.tradeInfo.timeInForce = 'GTC';

    trade1.tradeInfo.price = trade1.a
    trade2.tradeInfo.price = trade2.a
    trade3.tradeInfo.price = trade3.b

    return { trade1, trade2, trade3 };
}

TradingCore.prototype.negCycleArbitrage = function (candidate) {
    const self = this;

    const quantityLimit = self._mainCoinQuantityLimit;
    // const fee = self._ctrl.trading.percentageOfFee;

    // neg
    const trade1 = { ...candidate.a };
    const trade2 = { ...candidate.c };
    const trade3 = { ...candidate.b };

    // neg
    trade1.tradeInfo.side = 'SELL';
    trade2.tradeInfo.side = 'BUY';
    trade3.tradeInfo.side = 'SELL';

    trade1.tradeInfo.quantity = (quantityLimit / trade1.b).toFixed(2);
    // trade2.tradeInfo.quantity = parseInt(quantityLimit * utils.floatSub(1, parseFloat(trade2.a))); // .toFixed(2);
    trade2.tradeInfo.quantity = quantityLimit / trade2.a; // .toFixed(2);
    // trade2.tradeInfo.quantity = parseInt(quantityLimit / trade2.a); // .toFixed(2);
    trade3.tradeInfo.quantity = parseFloat(trade2.tradeInfo.quantity).mul(1.0.sub(this._percentageOfFee));

    trade1.tradeInfo.type = 'LIMIT';
    trade1.tradeInfo.timeInForce = 'GTC';
    trade2.tradeInfo.type = 'LIMIT';
    trade2.tradeInfo.timeInForce = 'GTC';
    trade3.tradeInfo.type = 'LIMIT';
    trade3.tradeInfo.timeInForce = 'GTC';

    trade1.tradeInfo.price = trade1.b
    trade2.tradeInfo.price = trade2.a
    trade3.tradeInfo.price = trade3.b

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