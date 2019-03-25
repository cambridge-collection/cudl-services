var express = require('express');
var request = require('request');

var router = express.Router();

module.exports = function(passport) {

	router.get('/*', passport.authenticate('token', { session: false }),
		function(req, res) {
			var url = config.darwinXTF + req.url + ";idx-ignore=dcpPublic";
			console.log(url);
			req.pipe(request(url)).pipe(res);
		}
	);

	return router;
};
