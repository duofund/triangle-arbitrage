const moment = require('moment')

// DBHelpers.js
var DBHelpers = function () {};

// saving websocket ticks to DB
DBHelpers.prototype.saveRawTick  = (rows, db, logger, cb)=>{
  let rawTicksTable = db.collection(process.env.rawTicksTable);
  
  rawTicksTable.insertMany(rows, (err, result)=>{
    if (err){
      logger.error('--- MongoDB Error in saveRawTick(): ' + err);
      return (cb) ? cb(err, result) : false;
    }
    
    logger.debug('----- Logged '+result.result.n+' raw ticks to DB');
    return (cb) ? cb(err, result) : true;
  });
};

// save arbitrage calculation ticks to DB for later analysis
DBHelpers.prototype.saveArbRows  = (rows, db, logger, cb)=>{
  let arbitrageTicksTable = db.collection(process.env.arbitrageTicksTable);
  
  // console.log("----- saveArbRows()")
  // console.log("flipped: ", rows[0].a.flipped)
  // console.log(rows[0].a.stepFrom, rows[0].a.stepTo)
  // console.log(rows[0].a_step_from, rows[0].a_step_to)
  
  arbitrageTicksTable.insertMany(rows, (err, result)=>{
    if (err){
      logger.error('--- MongoDB Error in saveArbRows(): ' + err);
      return (cb) ? cb(err, result) : false;
    }
    
    logger.debug('----- Logged '+result.result.n+' arbitrage rows to DB');
    return (cb) ? cb(err, result) : true;
  });
};

DBHelpers.prototype.createArbPair = (db, candi) => {
    let tradeArbitragePair = db.collection(process.env.tradeArbitragePair);

    const pair = {
        ...candi,
        status: 'executing',
        details: candi,
        created: moment().valueOf(),
        finished: null,
        predict_profit: candi.profit
    }

    return new Promise(resolve => tradeArbitragePair.insert(pair, resolve));
}

DBHelpers.prototype.updateArbPair = (db, id, trade1Id, trade2Id, trade3Id, status, finalProfit) => {
    let tradeArbitragePair = db.collection(process.env.tradeArbitragePair);

    const where = {'_id': id}
    const update = {$set: {
      trade1_id: trade1Id,
      trade2_id: trade2Id,
      trade3_id: trade3Id,
      status: status,
      final_profit: finalProfit
    }}

    return new Promise(resolve => tradeArbitragePair.updateOne(where, update, resolve));
}

DBHelpers.prototype.saveOrder = (db, order) => {
    let tradeRecord = db.collection(process.env.tradeRecord);

    order = {
        ...order,
        status: 'executing',
        created: moment().valueOf(),
        finished: null
    }

    return new Promise(resolve => tradeRecord.insert(order, resolve))
}

DBHelpers.prototype.updateOrderState = (db, id, order) => {
    let tradeRecord = db.collection(process.env.tradeRecord);

    const where = {'_id': id}
    const update = {$set: order}

    return new Promise(resolve => tradeRecord.updateOne(where, update, resolve))
}


DBHelpers.prototype.saveReturn = (db, profits) => {
    let tradeRecord = db.collection(process.env.arbProfit);

    return new Promise(resolve => tradeRecord.insert(profits, resolve))
}

exports.DBHelpers = DBHelpers;
