var express = require('express');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:id', function(req, res) {
	var images = [];
	images.push("http://172.22.83.199:3000/iiif/image/o.tif/info.json")
	console.log('laa');
	res.render('player', { title: req.params.id,
			       images: JSON.stringify(images)
	});
	
});

module.exports = router;
