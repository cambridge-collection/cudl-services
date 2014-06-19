var express = require('express');
var fs = require("fs"), json;

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:format/:id', function(req, res) {
	if (req.params.format == 'json') {
        	var path = config.dataDir+'/json/' + req.params.id + '.json';
        	res.sendfile(path);
	} else {
		var path = config.dataDir+'/data/'+req.params.format+'/'+req.params.id+'/'+req.params.id+'.xml';;
 		res.sendfile(path);
  }
});

module.exports = router;
