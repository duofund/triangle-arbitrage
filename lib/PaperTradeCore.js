const utils = require('./utils')

function PaperTradeCore (fee, mainCoinLimit) {
    this.balance = {
        BNB: 100,
        ETH: 100,
        BTC: 100
    };
    this.percentageOfFee = fee;
    this.mainCoinLimit = mainCoinLimit;
    this.orderId = 2001;
};

module.exports = PaperTradeCore;

PaperTradeCore.prototype.arbitrage = function (trade1, trade2, trade3, candidate) {
    const beforeBalance = { ...this.balance }

    // debugger;

    const resTrade1 = this.openOrders(trade1);
    resTrade1.status !== 'FILLED' && console.log('%c Error had happened', 'background-color: black; color: white;', resTrade1)

    const resTrade2 = this.openOrders(trade2);
    resTrade2.status !== 'FILLED' && console.log('%c Error had happened', 'background-color: black; color: white;', resTrade2)

    const resTrade3 = this.openOrders(trade3);
    resTrade3.status !== 'FILLED' && console.log('%c Error had happened', 'background-color: black; color: white;', resTrade3)

    const afterBalance = { ...this.balance }

    if (resTrade1.status !== 'FILLED' || resTrade2.status !== 'FILLED' || resTrade3.status !== 'FILLED') {
        console.log('order not filled')
        return
    }

    let profit = 0

    console.log(`<${candidate.id}> beforeBalance: `, beforeBalance, 'afterBalance:', afterBalance)

    for (let key in beforeBalance) {
        const ret = afterBalance[key].sub(beforeBalance[key])
        console.log(`key: ${key} | ret: ${ret}`)

        switch (key) {
            case 'BNB':
                const amount = ret.mul(resTrade1.price)
                profit = ret > 0 ? profit.add(amount) : profit.sub(amount)
                break

            case 'ETH':
                profit = ret > 0 ? profit.add(resTrade1.price) : profit.sub(resTrade1.price)
                break
        }
    }

    console.log(`%c <${candidate.id}> Profit: ${profit} ETH | ${(profit.div(resTrade1.quantity.mul(resTrade1.price)) * 100).betterToFixed(2)} %`, `background-color: ${profit > 0 ? 'red' : 'green'}; color: white;`, ` | Expect: ${candidate.rate}`)
}

function convertToFloat (tradeInfo) {
    tradeInfo.quantity = parseFloat(tradeInfo.quantity)
    tradeInfo.price = parseFloat(tradeInfo.price)
}

PaperTradeCore.prototype.openOrders = function (trade) {
    const tradeInfo = trade;
    const orderId = this.orderId++;
    const posOfKey = tradeInfo.symbol.indexOf(trade.stepFrom)

    let baseCur = trade.stepFrom
    let quoteCur = trade.stepFrom

    if (posOfKey === 0) {
        quoteCur = trade.symbol.substring(trade.stepFrom.length, trade.symbol.length)
    } else {
        baseCur = trade.symbol.substring(0, posOfKey)
    }

    convertToFloat(tradeInfo)

    const amount = tradeInfo.quantity.mul(tradeInfo.price)

    if (tradeInfo.quantity <= 0 || tradeInfo.price <= 0) {
        return { ...tradeInfo, code: -1002, message: 'Parameter error', status: 'error' };
    }

    if (!this.balance[baseCur]) {
        this.balance[baseCur] = 0
    }

    if (tradeInfo.side === 'BUY') {
        const balance = this.balance[quoteCur]
        if (!balance || balance < amount) {
            return { ...tradeInfo, code: -1003, message: 'Out of account balance', status: 'error' };
        }

        // do paper trade
        this.balance[quoteCur] = this.balance[quoteCur].sub(amount);
        this.balance[baseCur] = this.balance[baseCur].add(
            tradeInfo.quantity.mul(
                1.0.sub(this.percentageOfFee)));
    } else {
        const balance = this.balance[baseCur]
        if (!balance || balance < tradeInfo.quantity) {
            return { ...tradeInfo, code: -1003, message: 'Out of account balance', status: 'error' };
        }

        this.balance[baseCur] = this.balance[baseCur].sub(tradeInfo.quantity);
        const arrive = amount.mul(1.0.sub(this.percentageOfFee))
        this.balance[quoteCur] = this.balance[quoteCur].add(arrive)
    }

    return {
        ...tradeInfo,
        status: 'FILLED',
        orderId,
        execQty: tradeInfo.quantity
    };
};
