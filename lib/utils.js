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

function isBuyingCoin(symbol, coin, side) {
    const isMain = symbol.toUpperCase().indexOf(coin.toUpperCase()) === 0;
    const res = isMain && side === 'BUY' || !isMain && side === 'SELL' || false;

    console.log('[isBuyingCoin] res:', res, 'symbol:', symbol, 'coin: ', coin, 'side:', side);
    return res;
}

module.exports = {
    floatSub, isBuyingCoin
};