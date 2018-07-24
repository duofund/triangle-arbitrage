const request = require('request');

// Add accurate computation start

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

    n=(r1>=r2)?r1:r2;
    return ((arg2*m-arg1*m)/m).betterToFixed(n);
}

// add height level computation to Number
Number.prototype.sub = function (arg){
    return parseFloat(accSub(parseFloat(arg), this));
}

Number.prototype.add = function (arg){
    return parseFloat(accAdd(parseFloat(arg), this));
}

Number.prototype.mul = function (arg){
    return parseFloat(accMul(parseFloat(arg), this));
};

Number.prototype.div = function (arg){
    return parseFloat(accDiv(this, parseFloat(arg)));
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
    return parseFloat(num.substring(0, num.lastIndexOf('.') + (arg + 1)))
}

// Add accurate computation end

/***
 *
 * Algorithm compute trade1, 2, 3's quantity
 *
 * @type {{trade1: ((p1:*, p2:*)), trade2: ((p1:*, p2:*)), trade3: ((p1:*, p2:*))}}
 */
const QuantityTools = {
    mainQuantityLimit: parseFloat(process.env.mainCoinQuantityLimit),
    singleTradeDivider: (1.0).sub(parseFloat(process.env.singleTradeFee)),
    startCoin: process.env.startCoin,

    disFee: {
        trade1: (trade, vol) => {
            if (trade.symbol.indexOf(QuantityTools.startCoin) === 0) {
                if (QuantityTools.mainQuantityLimit <= 0) debugger
                return QuantityTools.mainQuantityLimit
            }

            let stands = QuantityTools.mainQuantityLimit.div(trade.price)
            return stands
        },

        trade2: (trade1, trade2) => {
            // POS
            if (trade1.side === 'buy' && trade2.side === 'sell') {
                return trade1.quantity
            }

            // neg
            return trade1.quantity.mul(trade1.price).div(trade2.price)
        },

        trade3: (trade2, trade3) => {
            if (trade2.side === 'sell' && trade3.side === 'buy') {
                return trade2.quantity.mul(trade2.price).div(trade3.price)
            }

            return trade2.quantity
        }
    },
    withFee: {
        trade1: (trade, vol) => {
            const mainQuantity = QuantityTools.mainQuantityLimit.mul(QuantityTools.singleTradeDivider)

            if (trade.symbol.indexOf(QuantityTools.startCoin) === 0) {
                return mainQuantity
            }

            let stands = mainQuantity.div(trade.price)
            return stands
        },

        trade2: (trade1, trade2) => {
            // POS
            if (trade1.side === 'buy' && trade2.side === 'sell') {
                return trade1.quantity.mul(QuantityTools.singleTradeDivider)
            }

            // neg
            return trade1.quantity.mul(QuantityTools.singleTradeDivider).mul(trade1.price).div(trade2.price)
        },

        trade3: (trade2, trade3) => {
            if (trade2.side === 'sell' && trade3.side === 'buy') {
                return trade2.quantity.mul(QuantityTools.singleTradeDivider).mul(trade2.price).div(trade3.price)
            }

            return trade2.quantity.mul(QuantityTools.singleTradeDivider)
        }
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

    if (!marketsMap[`${base}/${mid}`] || !marketsMap[`${base}/${quote}`]) {
        console.log('%c Computation Error:', quote, mid, base, 'With:', symbols)
        debugger;
        return {
            dir: false,
            rate: -9999
        }
    }

    const baseMid = marketsMap[`${base}/${mid}`]
    const quoteMid = marketsMap[`${quote}/${mid}`]
    const baseQuote = marketsMap[`${base}/${quote}`]

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
    const res = isMain && side === 'buy' || !isMain && side === 'sell' || false;

    console.log('[isBuyingCoin] res:', res, 'symbol:', symbol, 'coin: ', coin, 'side:', side);
    return res;
}

function computeReturn (candidate, tradeObject, tradeResults) {
    return new Promise((resolve) => {
        const fee = 0.005
        const { trade1, trade2, trade3 } = tradeObject
        const { tradeRes1, tradeRes2, tradeRes3 } = tradeResults
        const startCoin = process.env.startCoin

        const trade1Qty = parseFloat(trade1.quantity)
        const trade2Qty = parseFloat(trade2.quantity)
        const trade3Qty = parseFloat(trade3.quantity)
        const trade1Price = parseFloat(tradeRes1.price) || trade1.price
        const trade2Price = parseFloat(tradeRes2.price) || trade2.price
        const trade3Price = parseFloat(tradeRes3.price) || trade3.price

        const costQty = trade1.symbol.indexOf(startCoin) === 0 ? trade1Qty : trade1Qty.mul(trade1Price)
        let resultQty = 0
        const posMainCoin = trade3.symbol.indexOf(startCoin)

        if (posMainCoin === 0) resultQty = trade3Qty
        else if (posMainCoin !== -1) resultQty = trade3Qty.mul(trade3Price)
        else resultQty = trade3Qty.mul(trade2Price)

        let mergeMainQty = 0

        if (trade1.side === 'buy') {
            mergeMainQty = trade1Qty.sub(trade2Qty).mul(trade1Price)
            mergeMainQty = mergeMainQty.add(trade2Qty.mul(trade2Price).sub(trade3Qty.mul(trade3Price)).div(trade3Price))
        } else {
            mergeMainQty = (trade1Qty.mul(trade1Price).sub(trade2Qty.mul(trade2Price))).div(trade1Price)
        }

        const profit = resultQty.add(mergeMainQty).sub(costQty).sub(fee.mul(0.027944))
        const profitPercentage = profit.div(costQty).mul(100) // .betterToFixed(4)

        // console.log(`${cid} ===== tradeResults:`, tradeResults)

        const msg = `[套利成功 ${candidate.id}] 成本: ${costQty} ${startCoin} | 收益: ${resultQty} + ${mergeMainQty} ${startCoin} | 手续费: ${fee} BNB | 净收益: ${profit} ${startCoin}  | (${profitPercentage} %)`
        dingDingPush(msg)

        resolve({
            cid: candidate.id,
            time: new Date().getTime(),
            trade2Margin: candidate.trading.trade2Margin,
            trade3Margin: candidate.trading.trade2Margin,
            mergeMainQty: mergeMainQty,
            candidate,
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

const fee = process.env.mainCoinQuantityLimit.div(1000)

module.exports = {
    QuantityTools, sleep, floatSub, floatMul, isBuyingCoin, findArbitrageRelationship, dingDingPush, computeReturn
};