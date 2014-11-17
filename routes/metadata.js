var express = require('express');
var fs = require("fs");
var util = require("util");

var config = require('../config/base');
var serviceUtil = require("../util.js");

var CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*"
};

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
    res.status(401).send('Unathorised');
/*  res.render('index', { title: 'Unathorised' });*/
});

router.get('/:format/:id',
	function(req, res) {
		// We always want to allow remote ajax access
		res.set(CORS_HEADERS);

		// The response depends on the Origin header, as we block access to
		// non-embeddable items from non-cudl origins. If we don't set
		// Vary: Origin then a response for a client on CUDL could be used by a
		// cache to service a request from an external site.
		res.set("Vary", "Origin");

		// Ensure our ID doesn't contain slashes, as it's used to build
		// filesystem paths.
		if(/\//.test(req.params.id)) {
			res.status(400).json({
				error: util.format("Bad id: %s", req.params.id)
			});
			return;
		}

		var path;

		if (req.params.format == 'json') {
			path = config.dataDir + '/json/' + req.params.id + '.json';
			loadJsonMetadata(path, function(err, data) {
				if(err) {
					res.status(404).json({
						error: util.format(
							"ID does not exist: %s", req.params.id)
					});
					return;
				}

				// If the request is an external CORS request we'll restrict
				// access to items which are not embeddable. This prevents
				// external sites using CORS request to get at non-embeddable
				// content, while allowing cudl itself to get at it. Note that
				// there's nothing to stop someone setting up a proxy which
				// strips or fakes the origin header.
				if(serviceUtil.isExternalCorsRequest(req) &&
						data.embeddable === false) {
					res.status(403).json({
						error: "This item is only available from " +
								"cudl.lib.cam.ac.uk"
					});
					return;
				}

				res.json(data);
			});
		} else {
			path = config.dataDir+'/data/'+req.params.format+'/'+req.params.id+'/'+req.params.id+'.xml';
 			res.sendfile(path);
  		}
	}
);

function loadJsonMetadata(path, cb) {
	fs.readFile(path, "utf-8", function(err, data) {
		if(err) cb(err);
		try{
			var parsed = JSON.parse(data);
		}
		catch(e) {
			cb(util.format("Error parsing file as JSON: %s. %s", path, e));
			return;
		}
		cb(null, parsed);
	});
}

module.exports = router;
