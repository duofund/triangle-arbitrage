var TradingCore = require('./TradingCore');
var DBHelpers = require('./DBHelpers').DBHelpers;
var PairRanker = require('./PairRanker').PairRanker;

const BotCore = function (ctrl) {
    this.dbHelpers = new DBHelpers();
    this.pairRanker = new PairRanker();

    this.start = 'ETH'
    this.steps = ['BTC','ETH','BNB','USDT'];
};


BotCore.prototype.streamTick = (stream, streamID) => {
    ctrl.storage.streams[streamID] = stream;

    if (streamID != 'allMarketTickers') {
        return;
    }

    // Run logic to check for arbitrage opportunities
    ctrl.storage.candidates = ctrl.currencyCore.getDynamicCandidatesFromStream(stream, ctrl.options.arbitrage);

    if (this.tradingCore)
        this.tradingCore.updateCandidateQueue(stream, ctrl.storage.candidates, ctrl.storage.trading.queue);

    // update UI with latest values per currency
    ctrl.UI.updateArbitageOpportunities(ctrl.storage.candidates);

};

BotCore.prototype.startWSockets = function(exchange, ctrl){

    // loop through provided csv selectors, and initiate trades & orderBook sockets for each
    for (let i = 0;i < CurrencyCore.selectors.length;i++){

        let selector = require('./CurrencySelector.js')(CurrencyCore.selectors[i], exchange);

        CurrencyCore.currencies[selector.key] = selector;
        CurrencyCore.currencies[selector.key].handleEvent = ctrl.events.wsEvent;
        CurrencyCore.currencies[selector.key].startWSockets(ctrl.events);
    }
};

module.exports = BotCore