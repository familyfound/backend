
var express = require('express')
  , cors = require('cors')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)

  , mdb = require('mongodb')
  , MongoClient = mdb.MongoClient

  , config = require('./config')

app.use(cors())

server.listen(config.port, function () {
  console.log('listening')
})

function newsocket(socket) {
  socket.on('authorize', function (token, ready) {
    getCrawler(token, function (err, crawler) {
      new Socket(socket, crawler)
      ready()
    })
  })
}

io.sockets.on('connection', function (socket) {
  new Socket(socket)
})
