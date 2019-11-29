var db = require('./db');

var ITEM_EXISTS_SQL = 'SELECT exists(SELECT 1 FROM items WHERE itemid = $1);';

/**
 * Get a promise which resolves true if an item with id exists.
 */
function itemExists(id) {
    return db.query(ITEM_EXISTS_SQL, [id])
    .then(function(result) {
        return result.rows[0].exists;
    });
}

/**
 * Get a promise which is rejected if an item with id does not exist.
 */
function ensureItemExists(id) {
    return itemExists(id)
    .then(function(exists) {
        if(!exists) {
            throw new NotFoundError('No item exists with ID: ' + id, id);
        }
    });
}

module.exports = {
    itemExists: itemExists,
    ensureItemExists: ensureItemExists
};
