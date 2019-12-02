/**
 * This module contains functions for working with Postgres.
 */
const {Pool} = require('pg');

const config = require('./config').default;

const pool = new Pool({
    host: config.postHost,
    user: config.postUser,
    password: config.postPass,
    database: config.postDatabase
});

/**
 * Obtain a db connection an execute a single query.
 */
async function query(sql, bindParams) {
    const client = await pool.connect();
    try {
        return await client.query(sql, bindParams || []);
    }
    finally {
        client.release();
    }
}
module.exports.query = query;
