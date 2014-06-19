var xslt = require("xslt4node");
var transform = xslt.transform;
var express = require('express');
var fs = require("fs"), json;
var http = require("http");
var cache = require('Simple-Cache').SimpleCache("/home/cudl/node/metadata-api/public/cache", console.log);
var router = express.Router();

xslt.addLibrary('/home/cudl/node/metadata-api/saxon/saxon9he.jar');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:language/:location/:id/:from/:to', function(req, res) {
	cache.get('transcription-'+req.params.language+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
		var config = {
    			xsltPath: '/home/cudl/node/metadata-api/transforms/transcriptions/pageExtract.xsl',
    			sourcePath: '/home/cudl/node/metadata-api/public/data/tei/'+req.params.id+'/'+req.params.id+'.xml',
    			result: String,
			params: {
        			start: req.params.from,
				end: req.params.to,
				type: 'translation'
    			},
		};

		transform(config, function(err, singlepage) {
			if (err) {
        			res.render('error', { 
					message: err,
					error: { status: 404 }
				});
    			} else {
				console.log(singlepage);
				var config = {
                        		xsltPath: '/home/cudl/node/metadata-api/transforms/transcriptions/msTeiTrans.xsl',
                        		source: singlepage,
                        		result: String,
				};
				transform(config, function(err, html) {
					if (err) {
                                		res.render('error', {
                                        		message: err,
                                        		error: { status: 500 }
						});
					} else {
						callback(html);
					}
				});
			}
		});
	}).fulfilled(function(data) {
		res.send(data);
	});
});

module.exports = router;
