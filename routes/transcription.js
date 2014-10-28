var xslt = require("xslt4node");
var transform = xslt.transform;
var express = require('express');
var fs = require("fs"), json;
var http = require("http");
var cache = require('Simple-Cache').SimpleCache(config.cacheDir+'/transcriptions', console.log);
var tidy = require('htmltidy').tidy;
var router = express.Router();
xslt.addLibrary(config.appDir+'/saxon/saxon9he.jar');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/newton/:type/:location/:id/:from/:to', function(req, res) {
	cache.get('newton-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
		var options = {
			host: 'www.newtonproject.sussex.ac.uk',
			path: '/get/text/'+req.params.id+'?mode='+req.params.type
			+'&format=minimal_html&skin=minimal&show_header=no&start='
			+req.params.from+'&end='+req.params.to
		}

  		http.get(options, function(responce) {
  			if (responce.statusCode != 200) { 
				 res.render('error', {
            				message: 'Transcription not found at external provider',
            				error: { status: responce.statusCode } 
				});

			}
			var body = '';
			responce.on('data', function(chunk) {
    				body += chunk;
  			});
		 	responce.on('end', function() {
				var opts = {};
				opts['output-xhtml'] = true;
				opts['char-encoding'] = 'utf8';
				tidy(body, opts, function(err, html) {
  					callback(html);
				});
			});
		
		}).on('error', function(e) {
		 	res.render('error', {
                                message: 'Could not contact external transcription provider',
                                error: { status: 500 }
                        });
		});
	}).fulfilled(function(data) {
		res.send(data);
	});	
});

router.get('/dmp/:type/:location/:id/:from?/:to?', function(req, res) {
        cache.get('dmp-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
                var options = {
                        host: 'http://darwin.amnh.org/',
                        path: 'transcription-viewer.php?eid='+req.params.id+
                }

                http.get(options, function(responce) {
                        if (responce.statusCode != 200) {
                                 res.render('error', {
                                        message: 'Transcription not found at external provider',
                                        error: { status: responce.statusCode }
                                });

                        }
                        var body = '';
                        responce.on('data', function(chunk) {
                                body += chunk;
                        });
                        responce.on('end', function() {
                                var opts = {};
                                opts['output-xhtml'] = true;
                                opts['char-encoding'] = 'utf8';
                                tidy(body, opts, function(err, html) {
                                        callback(html);
                                });
                        });

                }).on('error', function(e) {
                        res.render('error', {
                                message: 'Could not contact external transcription provider',
                                error: { status: 500 }
                        });
                });
        }).fulfilled(function(data) {
                res.send(data);
        });
});

router.get('/bezae/:type/:location/:id/:from/:to', function(req, res) {
	cache.get('bezae-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
		var tconfig = {
    			xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
    			sourcePath: config.dataDir+'/data/transcription/'+req.params.id+'/'+req.params.location,
    			result: String,
			params: {
        			start: req.params.from,
				end: req.params.to
    			},
			props: {
        			indent: 'yes'
    			}
		};

		transform(tconfig, function(err, singlepage) {
			if (err) {
        			res.render('error', { 
					message: err,
					error: { status: 500 }
				});
    			} else {
				var tconfig = {
                        		xsltPath: config.appDir+'/transforms/transcriptions/bezaeHTML.xsl',
                        		source: singlepage,
                        		result: String,
				};
				transform(tconfig, function(err, html) {
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

router.get('/tei/:type/:location/:id/:from/:to', function(req, res) {
        cache.get('tei-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
                var tconfig = {
                        xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
                        sourcePath: config.dataDir+'/data/tei/'+req.params.id+'/'+req.params.id+'.xml',
                        result: String,
                        params: {
                                start: req.params.from,
                                end: req.params.to
                        },
                        props: {
                                indent: 'yes'
                        }
                };

                transform(tconfig, function(err, singlepage) {
                        if (err) {
                                res.render('error', {
                                        message: err,
                                        error: { status: 500 }
                                });
                        } else {
                                var tconfig = {
                                        xsltPath: config.appDir+'/transforms/transcriptions/msTeiTrans.xsl',
                                        source: singlepage,
                                        result: String,
                                };
                                transform(tconfig, function(err, html) {
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

router.get('/dcp/:type/:location/:id/:from?/:to?', function(req, res) {
        cache.get('tei-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
                var tconfig = {
                        xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
                        sourcePath: config.dataDir+'/data/dcp/'+req.params.id+'/'+req.params.id+'.xml',
                        result: String,
                        params: {
                                start: req.params.from,
                                end: req.params.to
                        },
                        props: {
                                indent: 'yes'
                        }
                };

                transform(tconfig, function(err, singlepage) {
                        if (err) {
                                res.render('error', {
                                        message: err,
                                        error: { status: 500 }
                                });
                        } else {
                                var tconfig = {
                                        xsltPath: config.appDir+'/transforms/transcriptions/dcpTrans.xsl',
                                        source: singlepage,
                                        result: String,
                                };
                                transform(tconfig, function(err, html) {
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



/*router.get('/:format/:type/:location/:id/:from/:to', function(req, res) {
	cache.get(req.params.format+'-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
		if (req.params.location === 'external') {
			 var options = {
                        	host: 'www.newtonproject.sussex.ac.uk',
                        	path: '/get/text/'+req.params.id+'?mode='+req.params.type
                        	+'&format=minimal_html&skin=minimal&show_header=no&start='
                        	+req.params.from+'&end='+req.params.to
                	}

                	http.get(options, function(responce) {
                        	if (responce.statusCode != 200) { res.render('error', { message: 'Transcription not found at external provider', error: { status: responce.statusCode } }); }
			});
                        var body = '';
                        responce.on('data', function(chunk) { body += chunk; });
                        responce.on('end', function() {
                                callback(body);
                        });

                }).on('error', function(e) {
                        res.render('error', {
                                message: 'Could not contact external transcription provider',
                                error: { status: 500 }
                        });
                });
		 
		} else {
			var options = { xsltPath: '/home/cudl/node/metadata-api/transforms/transcriptions/pageExtract.xsl',
				       result: String,
				       params: {
						start: req.params.from,
                                		end: req.params.to
				       }	
			 };
			if (req.params.format === 'bezae') { options.sourcePath = '/home/cudl/node/metadata-api/public/data/transcription/'+req.params.id+'/'+req.params.location }
			else if (req.params.format === 'tei') { options.sourcePath = '/home/cudl/node/metadata-api/public/data/transcription/'+req.params.id+'/'+req.params.location }
			else { res.render('error', { message: Unrecognised transcription format, error: { status: 404 } }); }
			transform(options, function(err, singlepage) {
                        	if (err) { res.render('error', { message: err, error: { status: 500 } }); }
				else { 
					var options = {  source: singlepage, result: String };
				 	if (req.params.format === 'bezae') { options.xsltPath = '/home/cudl/node/metadata-api/transforms/transcriptions/bezaeHTML.xsl' }
				 	if (req.params.format === 'tei') { options.xsltPath = '/home/cudl/node/metadata-api/transforms/transcriptions/msTeiTrans.xsl' }
				 	transform(options, function(err, html) {
                        	 		if (err) { res.render('error', { message: err, error: { status: 500 } }); }
				 		else { callback(html); }
					});
				     }
			});	
		}		
	}).fulfilled(function(data) {
           res.send(data);
	});
});*/

module.exports = router;
