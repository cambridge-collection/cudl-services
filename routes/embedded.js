var express = require('express');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:id', function(req, res) {
	var images = [];
	images.push("http://found-dev-pres01.lib.cam.ac.uk/content/images/MS-DAR-00100-000-00001.dzi")
	console.log('laa');
	res.render('player', { title: req.params.id,
			       images: JSON.stringify(images)
	});
	
});

module.exports = router;
