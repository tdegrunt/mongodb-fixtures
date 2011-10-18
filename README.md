mongodb-fixtures
----------------

Easy fixtures for mongodb:

1) Put a fixtures folder in your project

2) Put JSON files in the fixtures folder, with the filenames being the collection-names (plural)

3) Create code similar to:

    var fixtures = require('mongodb-fixtures');

    var Db = require('mongodb').Db,
      Connection = require('mongodb').Connection,
      Server = require('mongodb').Server;

    var db = new Db('wines', new Server("localhost", Connection.DEFAULT_PORT, {}));

    fixtures.load();
    fixtures.save(db, function() {
      db.close();
      console.dir(fixtures);
    });