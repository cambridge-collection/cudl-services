var path = require("path");

var configEnvar = "CUDL_SERVICES_CONFIG";

var configModule;
if(configEnvar in process.env) {
    configModule = process.env[configEnvar];

    // If the specified module is a relative path, make it relative to the root
    // dir.
    if(/^\.{1,2}\//.test(configModule)) {
        configModule = path.join("../", configModule);
    }
}
else {
    configModule = "./default";
}

module.exports = require(configModule);
