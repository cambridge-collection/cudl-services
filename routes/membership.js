var express = require('express');
var o2x = require('object-to-xml');
var pg = require('pg');

var router = express.Router();
var connection = 'postgres://'+config.postUser+':'+config.postPass+'@'+config.postHost+'/'+config.postDatabase;

/* GET home page. */
router.get('/', function(req, res) {
    res.render('index', { title: 'Metadata' });
});

router.get('/collections/:id', function(req, res) {
    var query = '(select title, collections.collectionid, collections.collectionorder from collections where collectionid IN (select parentcollectionid from collections where collectionid IN (select collectionid from itemsincollection where itemid = $1::text and visible=true))) UNION (select title, collections.collectionid, collections.collectionorder from itemsincollection, collections where collections.collectionid=itemsincollection.collectionid and itemid = $1::text and visible=true) order by collectionorder';
    pg.connect(connection, function(err, client, done) {
    	client.query(query, [req.params.id], function(err, result) {
        	if (err) throw err;
        	res.set('Content-Type', 'text/xml');
        	res.send(o2x({
            		'?xml version="1.0" encoding="utf-8"?': null,
            		collections: {
                		collection: result['rows']
            		}
        	}));
    	});
   });
});

module.exports = router;
