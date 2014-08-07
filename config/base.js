var config = {}

//Application settings and paths
config.appDir = '/home/cudl/node/cudl-services2';
config.dataDir = '/mnt/cudl-data';
config.cacheDir = '/mnt/cache';

//MySQL settings for cudl database services 
config.mysqlPool = 10;
config.mysqlHost = 'found-dom01.lib.cam.ac.uk';
config.mysqlUser = 'viewerdevuser';
config.mysqlPass = 'resuvedreweiv';
config.mysqlData = 'viewerdev';

//Image server
config.imageServer = 'http://172.22.83.199/iipsrv/iipsrv.fcgi?iiif=';
module.exports = config;
