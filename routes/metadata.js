var express = require('express');
var fs = require("fs"), json;

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
    res.status(401).send('Unathorised');
/*  res.render('index', { title: 'Unathorised' });*/
});

router.get('/:format/:id', 
/*	passport.authenticate('localapikey', { session: false,failureRedirect: '..', failueFlash: true }), */
	passport.authenticate('localapikey', { session: false }),
	function(req, res) {	
		if (req.params.format == 'json') {
        		var path = config.dataDir+'/json/' + req.params.id + '.json';
        		res.sendfile(path);
		} else {
			var path = config.dataDir+'/data/'+req.params.format+'/'+req.params.id+'/'+req.params.id+'.xml';;
 			res.sendfile(path);
  		}
	}
);

module.exports = router;
