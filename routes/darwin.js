var express = require('express');
var request = require('request');

var router = express.Router();

/* GET home page. */
router.get('/*', 
   passport.authenticate('localapikey', { session: false }),
	function(req, res) {
    		var url = config.darwinXTF + req.url;
		console.log(url);
		req.pipe(request(url)).pipe(res);	
	}
);

module.exports = router;
