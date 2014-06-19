var xslt = require("xslt4node");
var transform = xslt.transform;
var express = require('express');
var fs = require("fs"), json;
var http = require("http");
var cache = require('Simple-Cache').SimpleCache(config.cacheDir, console.log);
var router = express.Router();

xslt.addLibrary(config.appDir+'/saxon/saxon9he.jar');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:language/:location/:id/:from/:to', function(req, res) {
	cache.get('transcription-'+req.params.language+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
		var config = {
    			xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
    			sourcePath: config.dataDir+'/data/tei/'+req.params.id+'/'+req.params.id+'.xml',
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
                        		xsltPath: config.appDir+'/transforms/transcriptions/msTeiTrans.xsl',
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
