let express = require('express');
let request = require('request-promise');
let url = require('url');
let serviceUtil = require('../util');

let router = express.Router();

// E.g. http://localhost:3000/v1/iiif/annotation/MS-ADD-10062-UNDERTEXT/0
router.get('/:item/:page', function (req, res) {

    // Allow x-domain ajax access
    res.set(serviceUtil.CORS_HEADERS);

    // Get url for this request
    let thisURL = url.format({
        protocol: req.protocol,
        host: req.get('host'),
        pathname: req.originalUrl
    });

    // get json data for item
    makeLocalRequest('/v1/metadata/json/' + req.params.item).then(async (output) => {

        let itemJSON = JSON.parse(output[1]);
        let page = itemJSON.pages[req.params.page - 1];

        let canvasId = url.format({
            protocol: req.protocol,
            host: req.get('host'),
            pathname: 'iiif/' + req.params.item + '/canvas/' + req.params.page
        });

        let resources = [];
        if (page.translationURL) {
            await makeLocalRequest(page.translationURL).then(([transURL, html]) => {
                resources.push(makeResource(thisURL+"/translation", "Translation", canvasId, html));
            });
        }

        if (page.transcriptionDiplomaticURL) {
            await makeLocalRequest(page.transcriptionDiplomaticURL).then(([transURL, html]) => {
                resources.push(makeResource(thisURL+"/transcriptionDiplomatic", "Diplomatic Transcription", canvasId, html));
            });
        }

        if (page.transcriptionNormalisedURL) {
            await makeLocalRequest(page.transcriptionNormalisedURL).then(([transURL, html]) => {
                resources.push(makeResource(thisURL+"/transcriptionNormalised", "Normalised Transcription", canvasId, html));
            });
        }

        // Add in resources and return JSON
        let response = {
            "@context": "http://iiif.io/api/presentation/2/context.json",
            "@id": thisURL,
            "@type": "sc:AnnotationList",
            "resources": resources
        };

        res.send(response);

    });


    async function makeLocalRequest(path) {

        let output = [];
        const itemURL = url.format({
            protocol: req.protocol,
            host: req.get('host'),
            pathname: path
        });

        await request(itemURL).then((res) => {
            output = [itemURL, res]
        }).catch(err => {
            return console.log(err);
        });

        return output;
    }

    function makeResource(id, label, canvasId, html) {
        return {
            "@context": "http://iiif.io/api/presentation/2/context.json",
            "@id": id,
            "@type": "oa:Annotation",
            "label": label,
            "motivation": [
                "oa:commenting"
            ],
            "on": canvasId,
            "resource": [
                {
                    "label": label,
                    "@type": "dctypes:Text",
                    "format": "text/html",
                    "chars": html
                }
            ]
        };
    }
});

module.exports = router;
