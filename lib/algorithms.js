function triangularArbitrageDirection (baseMid, quoteMid, baseQuote) {
    const baseMidBuy = baseMid.b
    const baseMidSell = baseMid.a
    const quoteMidBuy = quoteMid.b
    const quoteMidSell = quoteMid.a
    const baseQuoteBuy = baseQuote.b
    const baseQuoteSell = baseQuote.a

    const posIndex = ((baseMidBuy / quoteMidSell) - baseQuoteSell) / baseQuoteSell
    const negIndex = (baseQuoteBuy - (baseMidSell / quoteMidBuy)) / baseQuoteBuy

    return { posIndex, negIndex }
}

function getQuantity (price, quantityLimit, symbol, mainCoin, size) {

    return parseFloat((quantityLimit.div(price)).betterToFixed(2))
}

module.exports = {
    triangularArbitrageDirection
}