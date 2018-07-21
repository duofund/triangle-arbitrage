const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const DBHelpers = require('./DBHelpers').DBHelpers;
const PaperTradeCore = require('./PaperTradeCore');
const utils = require('./utils');
const request = require('request');

QuantityTools = utils.QuantityTools

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
  this._percentageOfBestQuantity = tradeOpts.percentageOfBestQuantity
  this._paperOnly = tradeOpts.paperOnly;
  this._arbitrage = ctrl.options.arbitrage;

  this._currencyCore = ctrl.currencyCore;
  this._exchange = ctrl.exchange;
  this._db = ctrl.storage.db;
  this._ctrl = ctrl;

  this._tradeTime = tradeOpts._tradeTime;
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

  await keys.map(async (key) => {
    let cand = queue[key];

    if (cand.hits < this._minHitsThreshold) return

    if (self._tradeTime <= 0 || cand.isTrade) {
      // debugger;
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
  })
};

TradingCore.prototype.subAllFee = function () {
    return 0.0
}

TradingCore.prototype.trading = async function (candidate) {
    console.log(`<${candidate.id}> ${candidate.trading.dir} ==========  ${candidate.a.s} | ${candidate.b.s} | ${candidate.c.s}  ===========`)

    if (candidate.ts - candidate.ws_ts > 260) {
        console.log(`<${candidate.id}> Price is too order more then 199ms ts: ${candidate.ts} ws_ts: ${candidate.ws_ts}`)
        return false
    }

    let tradeObj

    switch (candidate.trading.dir) {
        case 'NEG':
            tradeObj = this.negCycleArbitrage(candidate)
            break
        case 'POS':
            tradeObj = this.posCycleArbitrage(candidate)
            break
        default:
            return
    }

    console.log(`<${candidate.id}> ===== ${candidate.trading.dir} ====== tradeObj: `, tradeObj, candidate)

    let { trade1, trade2, trade3, trade1Qty, trade2Qty, trade3Qty } = tradeObj

    console.log(`<${candidate.id}> <Trade1> We:${trade1.quantity} Best: ${trade1Qty} | 
                    <Trade2> We: ${trade2.quantity} Best: ${trade2Qty} | <Trade3> We: ${trade3.quantity} Best: ${trade3Qty}`)

    // if best quantity 1 less then we 80% of quantity then skip this
    if (trade1Qty < trade1.quantity * 0.5 || trade2Qty < trade2.quantity * 0.5 || trade3Qty < trade3.quantity * 0.5) {
        console.log(`<${candidate.id}> Not enough quantity!`)
        return
    }

    // trade1.quantity = trade1Qty

    this._tradeTime = this._tradeTime - 1;

    if (this._paperOnly) {
        this.paperTradeCore.arbitrage(trade1, trade2, trade3, candidate);
        return;
    }

    // save
    this.dBHelpers.createArbPair(this._db, { trade1, trade2, trade3, cId: candidate.id });

    try {
        if (trade1.side === 'BUY') {
            return await this.executeAsyncTrading(candidate, trade1, trade2, trade3, tradeObj)
        }

        return await this.executeTrading(candidate, trade1, trade2, trade3, tradeObj)
    } catch (e) {
        console.log(`%c <${candidate.id}> Arbitrage Failed:`, 'color: green', e);
    }
}

TradingCore.prototype.executeAsyncTrading = async function (candidate, trade1, trade2, trade3, tradeObj) {

    console.log(`<${candidate.id}> [trade1]:`, 'symbol:', trade1);

    // sync with trade1, say trade1 trade2 execute at same time
    const trade1Promise = new Promise(resolve => {
        this.asyncNewOrder({ ...trade1 }, candidate.id + ' trade1 ' + candidate.ts, true).then(res => {
            resolve(res)
        })
    })

    console.log(`<${candidate.id}> [trade3]:`, 'symbol:', trade3);
    const trade3Promise = new Promise(resolve => {
        this.asyncNewOrder({ ...trade3 }, candidate.id + ' trade3 ' + candidate.ts, true).then(res => {
            resolve(res)
        })
    })

    const tradeRes1 = await trade1Promise;

    console.log(`<${candidate.id}> [trade2]:`, 'symbol:', trade2);
    const tradeRes2 = await this.asyncNewOrder({ ...trade2 }, candidate.id + ' trade2 ' + candidate.ts, true);

    const tradeRes3 = await trade3Promise

    this.computeAndSaveProfit(candidate, tradeObj, {
        tradeRes1, tradeRes2, tradeRes3
    })

    console.log(`%c <${candidate.id}> Arbitrage Success:`, 'color: red');
}

TradingCore.prototype.executeTrading = async function (candidate, trade1, trade2, trade3, tradeObj) {

    console.log(`<${candidate.id}> [trade1]:`, 'symbol:', trade1);

    // sync with trade1, say trade1 trade2 execute at same time
    const trade1Promise = new Promise(resolve => {
        this.asyncNewOrder({ ...trade1 }, candidate.id + ' trade1 ' + candidate.ts, true).then(res => {
            resolve(res)
        })
    })

    console.log(`<${candidate.id}> [trade2]:`, 'symbol:', trade2);
    const tradeRes2 = await this.asyncNewOrder({ ...trade2 }, candidate.id + ' trade2 ' + candidate.ts, true);

    console.log(`<${candidate.id}> [trade3]:`, 'symbol:', trade3);
    const tradeRes3 = await this.asyncNewOrder({ ...trade3 }, candidate.id + ' trade3 ' + candidate.ts, true);

    const tradeRes1 = await trade1Promise

    this.computeAndSaveProfit(candidate, tradeObj, {
        tradeRes1, tradeRes2, tradeRes3
    })

    console.log(`%c <${candidate.id}> Arbitrage Success:`, 'color: red');
}

TradingCore.prototype.computeAndSaveProfit = function (candidate, tradeObj, tradeRes) {
    utils.computeReturn(candidate, tradeObj, tradeRes).then(res => {
        console.log(`<${candidate.id}> [computeReturn] res:`, res)
        this.dBHelpers.saveReturn(this._db, res)
    })
}

/**
 * positive cycle arbitrage
 * @param candidate
 */
TradingCore.prototype.posCycleArbitrage = function (candidate) {
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

    this.computeQuantity(trade1, trade2, trade3, baseQuote.A, candidate)

    if (this._paperOnly) {
        trade1.stepFrom = baseQuote.stepFrom;
        trade2.stepFrom = baseMid.stepFrom;
        trade3.stepFrom = quoteMid.stepFrom;
    }

    return { trade1, trade2, trade3, trade1Qty: baseQuote.A, trade2Qty: baseMid.B, trade3Qty: baseQuote.A };
}

TradingCore.prototype.negCycleArbitrage = function (candidate) {
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

    this.computeQuantity(trade1, trade2, trade3, quoteMid.B, candidate)

    if (this._paperOnly) {
        trade1.stepFrom = quoteMid.stepFrom;
        trade2.stepFrom = baseMid.stepFrom;
        trade3.stepFrom = baseQuote.stepFrom;
    }

    return { trade1, trade2, trade3, trade1Qty: quoteMid.B, trade2Qty: baseMid.A, trade3Qty: baseQuote.B };
}

TradingCore.prototype.computeQuantity = function (trade1, trade2, trade3, { trade1Vol }, candidate) {
    trade1.quantity = this.computeMiniQuantity(trade1.symbol, QuantityTools.trade1(trade1, trade1Vol));
    trade2.quantity = this.computeMiniQuantity(trade2.symbol, QuantityTools.trade2(trade1, trade2))
    trade3.quantity = this.computeMiniQuantity(trade3.symbol, QuantityTools.trade3(trade2, trade3))

    trade1.type = 'LIMIT';
    trade1.timeInForce = 'GTC';
    trade2.type = 'LIMIT';
    trade2.timeInForce = 'GTC';
    trade3.type = 'LIMIT';
    trade3.timeInForce = 'GTC';
}

TradingCore.prototype.computeMiniQuantity = function (symbol, quantity) {
    const miniQuantity = this._ctrl.miniQuantity[symbol]

    if (quantity.toString().indexOf('.') === -1) return quantity
    if (miniQuantity === 1) return parseInt(quantity)

    const howMany = miniQuantity.toString().split('.')[1].length
    const res = quantity.betterToFixed(howMany)

    // console.log(`- [computeMiniQuantity] ${symbol} | quantity: ${quantity} | res: ${res}`)
    return res
}

TradingCore.prototype.asyncQueryOrder = async function (trade, orderId, cid, isOnly=false) {
    const self = this
    let i = 3
    let orderStatus;

    try {
        orderStatus = await self._exchange.fetchOrder(orderId, symbol);

        // Check 3 time if order filled
        if (orderStatus.status !== 'FILLED' && trade.timeInForce !== 'IOC') {
            while (i > 0) {
                i--;
                console.log(`<${cid}> Get Order Info ${i} time`)

                orderStatus = await self._exchange.queryOrder(orderId, trade.symbol);

                if (orderStatus.status === 'FILLED') {
                    break
                }

                // await utils.sleep(80)
            }
        }
    } catch (e) {
        console.log(`<${cid}> Get error: `, e, trade, orderId)
        if (!isOnly) {
            await utils.sleep(20)
            return await this.asyncQueryOrder(trade, orderId, cid, true)
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
TradingCore.prototype.asyncNewOrder = async function (trade, cid, mustBeFilled = false, notDecrease = false) {
    const self = this
    let orderStatus

    try {
        console.log(`<${cid}> ${new Date().getTime()} Trade Begin`)
        const payload = await self._exchange.createOrder(trade.symbol, trade,type, trade.side, trade.quantity, trade.price, {timeInForce: trade.timeInForce})
        console.log(`<${cid}> ${new Date().getTime()} Trade Placed:`, payload)

        if (payload.status !== 'FILLED') {
            orderStatus = await self.asyncQueryOrder(trade, payload.orderId, cid)
        } else {
            orderStatus = payload
        }

        console.log(`<${cid}> ${new Date().getTime()} Get Order Result:`, orderStatus)

        if (orderStatus.status !== 'FILLED' && trade.timeInForce !== 'IOC') {
            console.log(`<${cid}> ${new Date().getTime()} Prepare to cancel`)

            // If not filled then cancel.
            try {
                await this.cancelOrder(cid, trade, payload.orderId)
            } catch (e) {
                console.log(`<${cid}> Cancel Failed Arbitrage Continue: `, e)
                orderStatus = await self.asyncQueryOrder(trade, payload.orderId, cid)
            }

            // place an new order with market price
            if (mustBeFilled && orderStatus.status !== 'FILLED') {
                if (orderStatus.status === 'PARTIALLY_FILLED') trade.quantity = trade.quantity - orderStatus.executedQty
                // if (trade.quantity < this._ctrl.miniQuantity[trade.symbol]) {
                //     // TODO
                // }
                return await this.convertOrderToMarketPrice(trade, cid)
            }
        }

        this.saveTradeResult(trade, orderStatus, cid)

        if (orderStatus.status === 'FILLED') {
            console.log(`<${cid}> ${new Date().getTime()} Trade Successed`)
            return orderStatus;
        }

    } catch (e) {
        console.log(`<${cid}> what happened:`, e);
        if (e.code === -2010 && mustBeFilled && trade.quantity > 0.001 && !notDecrease) {

            console.log(`<${cid}> To 0.99%`)
            trade.quantity = this.computeMiniQuantity(trade.symbol, trade.quantity.mul(0.99))
            return await this.asyncNewOrder(trade, cid, mustBeFilled, true)
        }

        throw new Error(e)
    }

    // throw new Error('EXEC FAILED: order not filled')
    return orderStatus
}

TradingCore.prototype.saveTradeResult = function (trade, orderStatus, cid) {
    return new Promise((resolve) => {
        console.log(`<${cid}> Get Order Info:`, orderStatus)

        trade.cid = cid;
        trade.status = orderStatus.status;
        trade.orderId = orderStatus.orderId;
        trade.quantity = orderStatus.executedQty;
        trade.price = orderStatus.price;

        this.dBHelpers.saveOrder(this._db, trade);

        resolve()
    })
}

TradingCore.prototype.convertOrderToMarketPrice = async function (trade, cid) {
    // const newTrade = { ...trade, type: 'MARKET' }
    // console.log(`<${cid}> Convert to Market Price: `, newTrade)

    // query price now
    const currentTicker = await this._exchange.fetchTicker(trade.symbol)

    console.log('currentTicker:', currentTicker)

    const tmpPrice = trade.price
    trade.price = trade.side === 'BUY' ? currentTicker.ask : currentTicker.bid

    console.log(`<${cid}> Convert to current ticker price from: ${tmpPrice} to: ${trade.price}`)

    return await this.asyncNewOrder(trade, cid, true)
}

TradingCore.prototype.cancelOrder = async function (cid, trade, orderId) {
    await this._exchange.cancelOrder(orderId, trade.symbol)

    console.log(`<${cid}> Order Canceled`)
}

TradingCore.prototype.time = function() {
    return this._started && Date.now() - this._started;
};