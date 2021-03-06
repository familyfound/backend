
var fslayer = require('./fslayer')
  , Socket = require('./socket')
  , Db = require('./db')
  , Crawler = require('./crawler')
  , CrawlApi = require('./crawl-api')
  , debug = require('debug')('ff:api')

function newsocket(mongo, socket) {
  socket.on('authorize', function (userId, token, ready) {
    debug('on auth')
    fslayer(mongo, function (err, cached, _db) {
      if (err) {
        console.error("Failed to initialize FS and DB", err)
        return socket.emit('initialize:error')
      }
      var db = new Db(_db, userId, socket)
      var api = new CrawlApi(userId, token, cached)
      var crawler = new Crawler(api, db)
      new Socket(socket, userId, db, crawler)

      db.getHistory(function (err, items) {
        socket.emit('history', items)
      })
      db.getStarred(function (err, items) {
        socket.emit('starred', items)
      })
      ready()
    })
  })
}

module.exports = function (mongo, io, app) {
  io.sockets.on('connection', function (socket) {
    newsocket(mongo, socket)
  })
}

