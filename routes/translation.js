var SimpleCache = require('Simple-Cache').SimpleCache;
var debug = require('debug')('cudl:translation');
var express = require('express');
var url = require('url');
var xslt = require("xslt4node");
var zacynthius = require('../lib/zacynthius');
var zacynthiusHandlers = require('./zacynthius-handlers');

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

const ZACYNTHIUS_TRANSLATION_TYPE = [zacynthius.TYPE_TRANSLATION];

router.get('/zacynthius/:page', zacynthiusHandlers.createDataHandler({
    types: ZACYNTHIUS_TRANSLATION_TYPE,
    resourceUrlRewriter: ({relativeURL}) => {
        return url.resolve(`./resources/`, relativeURL);
    }
}));
router.get('/zacynthius/resources/:path(*)', zacynthiusHandlers.createResourceHandler({
    types: ZACYNTHIUS_TRANSLATION_TYPE
}));

module.exports = router;
