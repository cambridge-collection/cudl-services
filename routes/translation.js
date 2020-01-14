var debug = require('debug')('cudl:translation');
var express = require('express');
var SimpleCache = require('Simple-Cache').SimpleCache;
var xslt = require("xslt4node");
var zacynthius = require('../lib/zacynthius');

var config = require('../config/base');
var transform = xslt.transform;
var cache = SimpleCache(config.cacheDir+'/translations', debug);
var router = express.Router();

xslt.addLibrary(config.appDir+'/saxon/saxon9he.jar');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Metadata' });
});

router.get('/:localtion/:language/:id/:from/:to', function(req, res) {
    cache.get('transcription-'+req.params.language+'-'+req.params.id+'-'+req.params.from+'-'+req.params.to, function(callback) {
        var tconfig = {
                xsltPath: config.appDir+'/transforms/transcriptions/pageExtract.xsl',
                sourcePath: config.dataDir+'/data/tei/'+req.params.id+'/'+req.params.id+'.xml',
                result: String,
            params: {
                    start: req.params.from,
                end: req.params.to,
                type: 'translation'
                },
        };

        transform(tconfig, function(err, singlepage) {
            if (err) {
                    res.status(404).render('error', {
                    message: err,
                    error: { status: 404 }
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

router.get('/zacynthius/:page', function (req, res) {
    var page = req.params.page;

    if(!zacynthius.isValidPage(page)) {
        res.status(400).send('Invalid page');
        return;
    }

    zacynthius.getZacynthiusData(zacynthius.TYPE_TRANSLATION, page, function(err, data) {
        if(err && err.missingPage) {
            res.status(404).json({message: 'Page not found', page: page});
        }
        if(err && err.isTemporary) {
            res.status(502).json({message: 'Zacynthius service is temporarily unavailable'});
            return;
        }
        else if(err) {
            res.status(500).json({message: 'Something went wrong'});
            return;
        }

        res.type('text/html');
        res.send(data);
    });
});

module.exports = router;
