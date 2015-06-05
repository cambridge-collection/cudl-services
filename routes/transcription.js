var xslt = require("xslt4node");
var express = require('express');
var fs = require("fs"), json;
var http = require("http");
var cache = require('Simple-Cache').SimpleCache(config.cacheDir+'/transcriptions', console.log);
var tidy = require('htmltidy').tidy;
var glob = require('glob');
var iconv = require('iconv-lite');
var parseHttpHeader = require('parse-http-header');

var transform = xslt.transform;
var router = express.Router();

// The newtonproject's responses are latin1 encoded, which node doesn't support
// by default. iconv-lite provides extra encodings such as latin1.
iconv.extendNodeEncodings();

xslt.addLibrary(config.appDir+'/saxon/saxon9he.jar');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

/**
 * Automatically set the encoding of an HTTP response according to the
 * Content-Type header's charset field.
 *
 * @returns true if successful, false otherwise
 */
function detectEncoding(response) {
    if(typeof response === 'object' && response.headers) {
        var charset = parseHttpHeader(response.headers['content-type'])['charset'];
        if(charset !== undefined) {
            try {
                response.setEncoding(charset);
                return true;
            }
            catch(e) {
                // unsupported encoding
            }
        }
    }

    return false;
}

router.get('/newton/:type/:location/:id/:from/:to', function(req, res) {
    cache.get('newton-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
        var options = {
            host: 'www.newtonproject.sussex.ac.uk',
            path: '/get/text/'+req.params.id+'?mode='+req.params.type
            +'&format=minimal_html&skin=minimal&show_header=no&start='
            +req.params.from+'&end='+req.params.to
        }

        var request = http.get(options, function(responce) {

            var requestFailed = false;
            var detectedEncoding = detectEncoding(responce);
            if(!detectedEncoding) {
                request.abort();
                responce.destroy();
                res.render('error', {
                    message: 'Unsupported external transcription provider encoding.',
                    error: { status: 500 }
                });
                requestFailed = true;
            }

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
                // Don't cache the result of failed responses
                if(requestFailed) {
                    return;
                }

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
                        host: 'darwin.amnh.org',
                        path: '/transcription-viewer.php?eid='+req.params.id
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

router.get('/dcpfull/:type/:location/:id/:from?/:to?', function(req, res) {
        cache.get('tei-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
        glob(config.dcpdataDir+'/'+req.params.id+'_*.xml', function(err, files) {
            var tconfig = {
                            xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
                            sourcePath: files[0],
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
