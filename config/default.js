var config = {};

//Application settings and paths
config.appDir = '/home/cms93/cudl-services';
config.dataDir = '/mnt/cudl-data';
config.cacheDir = '/mnt/cache';
config.dcpdataDir = '/mnt/dcp-data';
config.user = 'chris';
config.group = 'chris';

//Postgres settings for cudl database services
config.postHost = 'cudl-postgres.cmzjzpssbgnq.eu-west-1.rds.amazonaws.com';
config.postUser = 'cudldev';
config.postPass = 'anwqxJcONu1NjUl';
config.postDatabase = 'viewerdev';

config.users = {};
config.users["1a1c31e8-0c04-11e4-b6a8-bf55e15d8c9d"] = { username: 'cudl-dev', password: 'secret', email: 'cudl-admin@lib.cam.ac.uk' };
config.users["385784fa-0c04-11e4-b5cc-a3745fee5631"] = { username: 'cudl-live', password: 'secret', email: 'cudl-admin@lib.cam.ac.uk' };
config.users["436b3396-0c04-11e4-b7ed-0308c2efa56c"] = { username: 'genizah', password: 'secret', email: 'genizah@lib.cam.ac.uk' };
config.users["51ce1fb4-0d91-11e4-ad30-77b11da19985"] = { username: 'huw', password: 'secret', email: 'cudl-admin@lib.cam.ac.uk' };

//Image server
config.imageServer = 'http://172.22.83.199/iipsrv/iipsrv.fcgi?iiif=';
config.darwinXTF = 'http://dcp-dev.lib.cam.ac.uk';

module.exports = config;

// Tagging
config.defaultRemoveRatio = 1/5;
