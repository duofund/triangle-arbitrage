const request = require('request');

/***
 *
 * Algorithm compute trade1, 2, 3's quantity
 *
 * @type {{trade1: ((p1:*, p2:*)), trade2: ((p1:*, p2:*)), trade3: ((p1:*, p2:*))}}
 */
const QuantityTools = {

    trade1: (trade, vol) => {
        if (trade.symbol.indexOf(process.env.binanceStartingPoint) === 0) {
            return process.env.mainCoinQuantityLimit
        }

        let stands = process.env.mainCoinQuantityLimit.div(trade.price)
        return stands
        // const baseQty = this._percentageOfBestQuantity.mul(vol)
        //
        // // if stands bigger then baseQty, then use baseQty (80% of base quantity)
        // if (stands < baseQty || baseQty < 0.2.sub(stands)) {
        //     return stands
        // }
        //
        // return baseQty
    },

    trade2: (trade1, trade2) => {
        // POS
        if (trade1.side === 'BUY' && trade2.side === 'SELL') {
            return trade1.quantity
        }

        // neg
        return trade1.quantity.mul(trade1.price).div(trade2.price)
    },

    trade3: (trade2, trade3) => {
        if (trade2.side === 'SELL' && trade3.side === 'BUY') {
            return trade2.quantity.mul(trade2.price).div(trade3.price)
        }

        return trade2.quantity
    }
}

/**
 * quoteQuantity / price * (1 - fee)
 * BTCUSDT say price is 6000,
 *  we have 6000 usdt can by: 6000 / 6000 * 1 - fee
 * @param quoteQuantity
 * @param price
 * @param fee
 */
function getQuantityByQuoteNumber (quoteQuantity, price, fee) {
    return quoteQuantity.div(price).mul(1.0.sub(fee));
}

function findArbitrageRelationship (candidate) {
    const { a, b, c } = candidate
    const markets = [a, b, c]
    const coins = [candidate.aPair, candidate.bPair, candidate.cPair]
    const marketsMap = { [a.s]: a, [b.s]: b, [c.s]: c }
    const symbols = `${a.s}${b.s}${c.s}`
    const ope = {[candidate.aPair]: 0, [candidate.bPair]: 0, [candidate.cPair]: 0}

    coins.map(coin => {
        let score = 0
        markets.map(can => {
            if (can.s.indexOf(coin) < 0) return
            if(can.s.indexOf(coin) === 0) score++
            else score--
        })

        ope[coin] = score
    })

    let quote = null
    let mid = null
    let base = null

    coins.filter(coin => {
        switch(ope[coin]) {
            case 0:
                quote = coin
                break
            case 2:
                base = coin
                break
            case -2:
                mid = coin
                break
            default:
                debugger
        }
    })

    if (!marketsMap[base + mid] || !marketsMap[base + quote]) {
        console.log('%c Computation Error:', quote, mid, base, 'With:', symbols)
        debugger;
        return {
            dir: false,
            rate: -9999
        }
    }

    const baseMid = marketsMap[base + mid]
    const quoteMid = marketsMap[quote + mid]
    const baseQuote = marketsMap[base + quote]

    return { baseMid, quoteMid, baseQuote }
}

function floatSub(arg1,arg2) {
    var r1,r2,m,n;
    try {
        r1=arg1.toString().split('.')[1].length;
    } catch (e){
        r1=0;
    }

    try {
        r2=arg2.toString().split('.')[1].length;
    } catch (e) {
        r2=0;
    }

    m=Math.pow(10,Math.max(r1,r2));
    //动态控制精度长度
    n=(r1>=r2)?r1:r2;
    return ((arg1*m-arg2*m)/m).betterToFixed(n);
}

function floatMul(arg1,arg2){
    var m=0,s1=arg1.toString(),s2=arg2.toString();
    try {
        m+=s1.split('.')[1].length;
    } catch (e) {
        () => {};
    }

    try {
        m+=s2.split('.')[1].length;
    } catch (e) {
        () => {};
    }

    return (Number(s1.replace('.', ''))*Number(s2.replace('.', ''))/Math.pow(10,m));
}

function isBuyingCoin(symbol, coin, side) {
    const isMain = symbol.toUpperCase().indexOf(coin.toUpperCase()) === 0;
    const res = isMain && side === 'BUY' || !isMain && side === 'SELL' || false;

    console.log('[isBuyingCoin] res:', res, 'symbol:', symbol, 'coin: ', coin, 'side:', side);
    return res;
}

function accDiv(arg1,arg2){
    var t1=0,t2=0,r1,r2;
    try{t1=arg1.toString().split(".")[1].length}catch(e){}
    try{t2=arg2.toString().split(".")[1].length}catch(e){}
    with(Math){
        r1=Number(arg1.toString().replace(".",""));
        r2=Number(arg2.toString().replace(".",""));
        return (r1/r2)*pow(10,t2-t1);
    }
}

function accMul(arg1,arg2)
{
    var m=0,s1=arg1.toString(),s2=arg2.toString();
    try{m+=s1.split(".")[1].length}catch(e){}
    try{m+=s2.split(".")[1].length}catch(e){}
    return Number(s1.replace(".",""))*Number(s2.replace(".",""))/Math.pow(10,m);
}
function accAdd(arg1,arg2){
    var r1,r2,m;
    try{r1=arg1.toString().split(".")[1].length}catch(e){r1=0}
    try{r2=arg2.toString().split(".")[1].length}catch(e){r2=0}
    m=Math.pow(10,Math.max(r1,r2));
    return (arg1*m+arg2*m)/m;
}

//减法函数
function accSub(arg1,arg2){
    var r1,r2,m,n;
    try{ r1=arg1.toString().split(".")[1].length } catch(e) { r1=0 }
    try{ r2=arg2.toString().split(".")[1].length } catch(e) { r2=0 }
    m=Math.pow(10,Math.max(r1,r2));
    //last modify by deeka
    //动态控制精度长度
    n=(r1>=r2)?r1:r2;
    return ((arg2*m-arg1*m)/m).betterToFixed(n);
}

function computeReturn (cid, tradeObject, tradeResults) {
    return new Promise((resolve) => {
        const fee = 0.003
        const { trade1, trade2, trade3 } = tradeObject
        const startCoin = process.env.binanceStartingPoint
        const costQty = trade1.symbol.indexOf(startCoin) === 0 ? trade1.quantity : trade1.quantity.mul(trade1.price)
        const resultQty = trade3.symbol.indexOf(startCoin) === 0 ? trade3.quantity : trade3.quantity.mul(trade3.price)

        // const mergeQty = trade2.quantity


        const profit = resultQty.sub(costQty).sub(fee)
        const profitPercentage = resultQty.sub(costQty).div(costQty).mul(100).betterToFixed(4)

        // console.log(`${cid} ===== tradeResults:`, tradeResults)

        const msg = `[套利成功 ${cid}] 成本: ${costQty} ${startCoin} | 收益: ${resultQty} ${startCoin} | 手续费: ${fee} BNB | 净收益: ${profit} ${startCoin}  | (${profitPercentage} %)`
        dingDingPush(msg)

        resolve({
            cid, time: new Date().getTime(),
            msg, startCoin, costQty, resultQty, profit, profitPercentage,
            tradeObject, tradeResults
        })
    })
}

async function sleep (ms) {
    return await new Promise((resolve) => setTimeout(resolve, ms))
}

function dingDingPush(message) {
    try {
        const url = `https://oapi.dingtalk.com/robot/send?access_token=${process.env.token}`
        const options = {
            method: 'POST',
            json: {
                "msgtype": "text",
                "text": {
                    "content": message
                },
                "at": {
                    "atMobiles": [],
                    "isAtAll": false
                }
            }
        }

        request(url, options, (err, res) => {})
    } catch(e) {
        console.error('[Ding Ding Push] ERROR:', e)
    }
}

// add height level computation to Number
Number.prototype.sub = function (arg){
    return parseFloat(accSub(arg, this));
}

Number.prototype.add = function (arg){
    return parseFloat(accAdd(arg, this));
}

Number.prototype.mul = function (arg){
    return parseFloat(accMul(arg, this));
};

Number.prototype.div = function (arg){
    return parseFloat(accDiv(this, arg));
};


// add height level computation to Number
String.prototype.sub = function (arg){
    return parseFloat(accSub(parseFloat(arg), parseFloat(this)));
}

String.prototype.add = function (arg){
    return parseFloat(accAdd(parseFloat(arg), parseFloat(this)));
}

String.prototype.mul = function (arg){
    return parseFloat(accMul(parseFloat(arg), parseFloat(this)));
};

String.prototype.div = function (arg){
    return parseFloat(accDiv(parseFloat(this), parseFloat(arg)));
};


Number.prototype.betterToFixed = function (arg) {
    const num = this.toFixed(arg + 1)
    return parseFloat(num.substring(0, num.lastIndexOf('.') + 3))
}

module.exports = {
    QuantityTools, sleep, floatSub, floatMul, isBuyingCoin, findArbitrageRelationship, dingDingPush, computeReturn
};