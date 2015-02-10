var lingo = require('lingo')
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , eco = require('eco');

var ISO8601_DATE_FORMAT = /^(\d{4})\D?(0[1-9]|1[0-2])\D?([12]\d|0[1-9]|3[01])(\D?([01]\d|2[0-3])\D?([0-5]\d)\D?([0-5]\d)?\D?(\d{3})?([zZ]|([\+-])([01]\d|2[0-3])\D?([0-5]\d)?)?)?$/

/** @ignore */
var get = function (obj, path) {
  var segments = path.split('.')
    , cursor = obj
    , segment, i;
  
  for (i = 0; i < segments.length - 1; ++i) {
    segment = segments[i];
    cursor = cursor[segment] = cursor[segment] || {};
  }
  
  // Try and grab the _id if that's not what we're asking
  // FIXME: If you ask for an object, this breaks
  if (segments[i] !== "_id" && typeof(cursor[segments[i]]) === 'object') {
   return get(obj,path+"._id"); // FIXME: Not use get
  } else {
   return cursor[segments[i]];
  }
};

/** @ignore */
var walk = function(fixtures, obj) {
  var guide;
        
  if(!obj) {
    return;
  }
  
  _.each(_.keys(obj), function(propertyName) {

    // If the key of a record is a singular of a fixture, do our magic.
    // TODO: It would probably be faster to singularize the collections and look up, but that doesn't always produce correct results.
    if (lingo.en.isPlural(propertyName)) {
      propertyPlural = fixtures[propertyName.toLowerCase()];
    } else {
      propertyPlural = fixtures[lingo.en.pluralize(propertyName).toLowerCase()];
    }
    if (propertyPlural) {
      
      if (_.isString(obj[propertyName])) {
        obj[propertyName] = get(propertyPlural, obj[propertyName]);
      } else if (_.isArray(obj[propertyName])) {
        
        obj[propertyName] = _.map(obj[propertyName], function(item){
          return get(propertyPlural, item);
        });
        
      } else {
        // FIXME: Throw error if 'as' is not there as we expect a path and 'as' in the object 
        guide = obj[propertyName];  
        if (guide.paths) {
          obj[guide.as] = _.map(guide.paths, function(item){
            return get(propertyPlural, item);
          });
        } else {
          // Assume guide.path
          obj[guide.as] = get(propertyPlural, guide.path);
        }

        // Remove the "guide"
        if (guide.as !== propertyName) {
          delete obj[propertyName];
        }
      }
  
    } else {
      
      // So it was something else ...
      if(typeof obj[propertyName] === 'object'){
        walk(fixtures, obj[propertyName]);
      }
      
    }

  });
  
};

/**
 * Loads fixtures from the given path and returns data.
 * @param {string} fixture_path The path to the fixtures
 * @returns {object} fixtures
 */
var load = module.exports.load = function (fixture_path) {
  var fixtures = { collections: [] };
  var files = fs.readdirSync(fixture_path||"./fixtures");
  _.each(files, function(file) {
    if (path.extname(file) === ".json") {
      var collectionName = path.basename(file, ".json");
      fixtures.collections.push(collectionName);
      fixtures[collectionName] = JSON.parse(eco.render(""+fs.readFileSync(path.join(fixture_path||"./fixtures",file)), {}) , function(key, value) {
        var result = value;
        if (typeof value === 'string' && value.match(ISO8601_DATE_FORMAT)) {
          result = new Date(Date.parse(value));
        }
        return result;
      });
    }
  });
  return fixtures;
};

/**
 * Persists the fixtures to the database, clears any and all collections present in the fixtures.
 * @param {object} fixtures Fixtures returned by load()
 * @param {object} db Database connection
 * @param {function} cb Callback function once completed
 */
var save = module.exports.save = function(fixtures, db, cb) {
  var totalCollectionNr = 0;
  var currentCollectionCounter = 0;
  var totalRecordNr = 0;
  var currentRecordCounter = 0;
  
  db.open(function(err, _db) {

    totalCollectionNr = fixtures.collections.length;
    // Walk through the collections
    _.each(fixtures.collections, function(collectionName) {

      currentCollectionCounter++;

      db.collection(collectionName, function(err, collection) { 

        // Trash the collection in the database
        collection.remove({}, function(err, result){
          
          totalRecordNr += _.keys(fixtures[collectionName]).length;
          
          // Walk through a specific fixture's records
          _.each(_.keys(fixtures[collectionName]), function(recordId) {

            collection.insert(fixtures[collectionName][recordId], function(e, docs) {
              currentRecordCounter++;

              // Update the fixtures with the id
              if (docs) {
                fixtures[collectionName][recordId]['_id'] = docs[0]['_id'];
              }
              
              // Are we done?
              if ( currentCollectionCounter === totalCollectionNr && currentRecordCounter === totalRecordNr) {
                populate(fixtures, db, cb);
              }
              
            });
      
          });        
        
        });

      });
    });
  });
};

/** @ignore */
var populate = function(fixtures, db, cb) {
  var propertyPlural, 
    totalCollectionNr = 0, 
    currentCollectionCounter = 0,
    totalRecordNr = 0,
    currentRecordCounter = 0;

  totalCollectionNr = fixtures.collections.length;

  // Walk through the collections (again!)
  _.each(fixtures.collections, function(collectionName) {

    currentCollectionCounter++;
  
    db.collection(collectionName, function(err, collection) { 

      totalRecordNr += _.keys(fixtures[collectionName]).length;
  
      // Walk through a specific fixture's records
      _.each(_.keys(fixtures[collectionName]), function(recordId) {
        
        currentRecordCounter++;

        // Walk through the keys of a record, recursively
        walk(fixtures, fixtures[collectionName][recordId]);
        
        // TODO: Only do this when changes take place
        collection.update({'_id': fixtures[collectionName][recordId]._id}, fixtures[collectionName][recordId], true, function(e, docs){
          if (e) {
            throw e;
          }
          // Only now call callback
          if ( currentCollectionCounter === totalCollectionNr && currentRecordCounter === totalRecordNr) {
            cb();
          }
        });

      });
    
    });
  
  });


};

