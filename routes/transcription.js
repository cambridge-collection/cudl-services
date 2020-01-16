var SimpleCache = require('Simple-Cache').SimpleCache;
var debug = require('debug')('cudl:transcription');
var express = require('express');
var glob = require('glob');
var http = require('http');
var iconv = require('iconv-lite');
var parseHttpHeader = require('parse-http-header');
var tidy = require('htmltidy2').tidy;
var url = require('url');
var xslt = require('xslt4node');
var zacynthius = require('../lib/zacynthius');
var zacynthiusHandlers = require('./zacynthius-handlers');

var config = require('../config/base');
var cache = SimpleCache(config.cacheDir+'/transcriptions', debug);
var router = express.Router();
var transform = xslt.transform;

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
        var charset = parseHttpHeader(response.headers['content-type']).charset;
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
            host: 'www.newtonproject.ox.ac.uk',
            path: '/view/texts/' + req.params.type + '/' + req.params.id + '?skin=minimal&show_header=no&start=' +
                req.params.from + '&end=' + req.params.to
        };

        var request = http.get(options, function(response) {

            var requestFailed = false;
            var detectedEncoding = detectEncoding(response);
            if(!detectedEncoding) {
                request.abort();
                response.destroy();
                res.status(500).render('error', {
                    message: 'Unsupported external transcription provider encoding.',
                    error: { status: 500 }
                });
                requestFailed = true;
            }

            if (response.statusCode !== 200) {
                res.status(500).render('error', {
                    message: 'Transcription not found at external provider',
                    error: { status: response.statusCode }
                });
            }
            var body = '';
            response.on('data', function(chunk) {
                    body += chunk;
              });
             response.on('end', function() {
                // Don't cache the result of failed responses
                if(requestFailed) {
                    return;
                }

                //Newton CSS and JS must be served by us over HTTPS not by Newton over HTTP to avoid browser blocking
                var localCssPath = encodeURI('/newton/css');
                body = body.replace(new RegExp('\/resources\/css', 'g'), localCssPath);
                var localJsPath = encodeURI('/newton/js');
                body = body.replace(new RegExp('\/resources\/js', 'g'), localJsPath);

                // Newton images relative paths must be made absolute to point to Newton server
                 var newtonServerUrl = encodeURI('http://www.newtonproject.ox.ac.uk/resources/images');
                 body = body.replace(new RegExp('\/resources\/images', 'g'), newtonServerUrl);

                callback(body);
            });

        }).on('error', function(e) {
            res.status(500).render('error', {
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
                };

                http.get(options, function(response) {
                        if (response.statusCode !== 200) {
                                 res.status(500).render('error', {
                                        message: 'Transcription not found at external provider',
                                        error: { status: response.statusCode }
                                });

                        }
                        var body = '';
                        response.on('data', function(chunk) {
                                body += chunk;
                        });
                        response.on('end', function() {
                                var opts = {};
                                opts['output-xhtml'] = true;
                                opts['char-encoding'] = 'utf8';
                                tidy(body, opts, function(err, html) {
                                        callback(html);
                                });
                        });

                }).on('error', function(e) {
                        res.status(500).render('error', {
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
                    res.status(500).render('error', {
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
                                        res.status(500).render('error', {
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
                                indent: 'no'
                        }
                };

                transform(tconfig, function(err, singlepage) {
                        if (err) {
                                res.status(500).render('error', {
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
                                                res.status(500).render('error', {
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
                                res.status(500).render('error', {
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
                                                res.status(500).render('error', {
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
                                    res.status(500).render('error', {
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
                                                    res.status(500).render('error', {
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

/* Adding a new catch for Quranic palimpsests - 05/01/16 JF */
router.get('/palimpsest/:type/:location/:id/:from/:to', function(req, res) {
    cache.get('palimpsest-'+req.params.type+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
        var options = {
            host: 'cal-itsee.bham.ac.uk',
            path: '/itseeweb/fedeli/' + req.params.id + '/' +req.params.from + '_' + req.params.id + '.html'
        };

        var request = http.get(options, function(response) {

            var requestFailed = false;

            var detectedEncoding = detectEncoding(response);


            if(!detectedEncoding) {
                request.abort();
                response.destroy();
                res.status(500).render('error', {
                    message: 'Unsupported external transcription provider encoding.',
                    error: { status: 500 }
                });
                requestFailed = true;
            }

            if (response.statusCode !== 200) {
                res.status(500).render('error', {
                    message: 'Transcription not found at external provider',
                    error: { status: response.statusCode }
                });
            }
            var body = '';
            response.on('data', function(chunk) {
                    body += chunk;
              });
             response.on('end', function() {
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
            res.status(500).render('error', {
                message: 'Could not contact external transcription provider',
                error: { status: 500 }
            });
        });
    }).fulfilled(function(data) {
        res.send(data);
    });
});

const ZACYNTHIUS_TRANSCRIPTION_TYPES = [zacynthius.TYPE_UNDERTEXT, zacynthius.TYPE_OVERTEXT];

router.get('/zacynthius/:type/:page', zacynthiusHandlers.createDataHandler({
    types: ZACYNTHIUS_TRANSCRIPTION_TYPES,
    resourceUrlRewriter: ({type, relativeURL}) => {
        return url.resolve(`../resources/${type}/`, relativeURL);
    }
}));
router.get('/zacynthius/resources/:type/:path(*)', zacynthiusHandlers.createResourceHandler({
    types: ZACYNTHIUS_TRANSCRIPTION_TYPES
}));

module.exports = router;
