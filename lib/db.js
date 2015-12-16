/**
 * This module contains functions for working with Postgres.
 */

var url = require('url');
var assert = require('assert');

var pg = require('pg');
var Q = require('q');

var config = require('../config/base.js');

/**
 * Get a postgres connection URL from the settings in the config file.
 */
function getConnectionString() {
    return url.format({
        protocol: 'postgres',
        slashes: true,
        auth: config.postUser + ':' + config.postPass,
        host: config.postHost,
        pathname: config.postDatabase
    });
}

/**
 * Obtain an open connection to the database from the pool.
 *
 * @return A Promise resolving to [client, done]
 * @see pg.connect()
 */
function connect() {
    return Q.Promise(function(resolve, reject, notify) {
        pg.connect(getConnectionString(), function(err, client, done) {
            if(err)
                reject(err);
            else {
                assert(client);
                assert(done);
                resolve([client, done]);
            }
        });
    });
}

/**
 * Obtain a db connection an execute a single query.
 */
function query(sql, bindParams) {
    var done;

    return connect()
    .then(function(args) {
        var client = args[0];
        done = args[1];
        return Q.ninvoke(client, 'query', sql, bindParams || []);
    })
    .then(function(result) {
        // Release the db client back to the pool
        done();

        return result;
    });
}

module.exports = {
    getConnectionString: getConnectionString,
    connect: connect,
    query: query
};
