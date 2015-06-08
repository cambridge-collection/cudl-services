var express = require('express');
var o2x = require('object-to-xml');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
    res.render('index', { title: 'Metadata' });
});

router.get('/collections/:id', function(req, res) {
    var query = '(select title, collections.collectionid, collections.collectionorder  from collections where collectionid IN (select parentcollectionid from collections where collectionid IN (select collectionid from itemsincollection where itemid = '+ connection.escape(req.params.id) + 'and visible=true))) UNION (select title, collections.collectionid, collections.collectionorder from itemsincollection, collections where collections.collectionid=itemsincollection.collectionid and itemid = '+ connection.escape(req.params.id) +' and visible=true) order by collectionorder';
    connection.query(query, function(err, rows) {
        if (err) throw err;
        console.log( rows );
        res.set('Content-Type', 'text/xml');
        res.send(o2x({
            '?xml version="1.0" encoding="utf-8"?': null,
            collections: {
                collection: rows
            }
        }));
    });
});

module.exports = router;
