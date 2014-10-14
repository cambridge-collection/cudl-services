var config = {}

//Application settings and paths
config.appDir = '/usr/local/cudl-node-services';
config.dataDir = '/mnt/cudl-data';
config.cacheDir = '/mnt/cache';
config.user = 'digilib';
config.froup = 'digilib';

//MySQL settings for cudl database services 
config.mysqlPool = 10;
config.mysqlHost = '10.0.0.15';
config.mysqlUser = 'viewerdevuser';
config.mysqlPass = 'resuvedreweiv';
config.mysqlData = 'viewerdev';

//Image server
config.imageServer = 'http://172.22.83.199/iipsrv/iipsrv.fcgi?iiif=';
module.exports = config;
