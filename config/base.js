var config = {};

//Application settings and paths
config.appDir = '/home/cms93/cudl-services';
config.dataDir = '/mnt/cudl-data';
config.cacheDir = '/mnt/cache';
config.dcpdataDir = '/mnt/dcp-data';
config.user = 'digilib';
config.group = 'digilib';

//MySQL settings for cudl database services
config.mysqlPool = 10;
config.mysqlHost = 'cudl.cmzjzpssbgnq.eu-west-1.rds.amazonaws.com';
config.mysqlUser = 'viewerdevuser';
config.mysqlPass = 'resuvedreweiv';
config.mysqlData = 'viewerdev';

//Image server
config.imageServer = 'http://172.22.83.199/iipsrv/iipsrv.fcgi?iiif=';
module.exports = config;
