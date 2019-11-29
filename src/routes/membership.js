const express = require('express');
const o2x = require('object-to-xml');

const {query} = require('../db');

const router = express.Router();
module.exports = router;

/* GET home page. */
router.get('/', function(req, res) {
    res.render('index', { title: 'Metadata' });
});

router.get('/collections/:id', function(req, res, next) {
    const sql = `(
    select title, collections.collectionid, collections.collectionorder from collections
    where collectionid IN (
        select parentcollectionid from collections
        where collectionid IN (
            select collectionid from itemsincollection where itemid = $1::text and visible=true
        )
     )
) UNION (
    select title, collections.collectionid, collections.collectionorder from itemsincollection, collections
    where collections.collectionid=itemsincollection.collectionid and itemid = $1::text and visible=true
) order by collectionorder`;

    query(sql, [req.params.id]).then(() => {
        res.set('Content-Type', 'text/xml');
        res.send(o2x({
            '?xml version="1.0" encoding="utf-8"?': null,
            collections: {
                collection: result.rows
            }
        }));
    }).catch(err => {
        next(err);
    });
});
