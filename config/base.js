var config = {}

//Application settings and paths
config.appDir = '/usr/local/cudl-services';
config.dataDir = '/mnt/cudl-data';
config.cacheDir = '/mnt/cache';

//MySQL settings for cudl database services 
config.mysqlHost = 'found-dom01.lib.cam.ac.uk';
config.mysqlUser = 'viewerdevuser';
config.mysqlPass = 'resuvedreweiv';
config.mysqlData = 'viewerdev';

//Image server
config.imageServer = 'http://172.22.83.199/iipsrv/iipsrv.fcgi?iiif=';
module.exports = config;
