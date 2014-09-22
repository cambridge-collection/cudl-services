var express = require('express');
var request = require('request');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.use('/image/', function(req, res) { 
	 var url = config.imageServer + req.url;
	 console.log(url);
  	 req.pipe(request(url)).pipe(res);
});

module.exports = router;
