var fixtures = require('../mongodb-fixtures.js');

var Db = require('mongodb').Db,
  Connection = require('mongodb').Connection,
  Server = require('mongodb').Server;

var db = new Db('wines', new Server("localhost", Connection.DEFAULT_PORT, {}));

var data = fixtures.load();
fixtures.save(data, db, function() {
  db.close();
  console.dir(data);
});

