
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
    return ((arg1*m-arg2*m)/m).toFixed(n);
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
    return ((arg2*m-arg1*m)/m).toFixed(n);
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

module.exports = {
    floatSub, floatMul, isBuyingCoin, findArbitrageRelationship
};