var xslt = require('xslt4node');
var transform = xslt.transform;
xslt.addLibrary('/home/cudl/node/metadata-api/saxon/saxon9he.jar');
var ORDER = '<order><book ISBN="10-861003-324"><title>The Handmaid\'s Tale</title><price>19.95</price></book><cd ISBN="2-3631-4"><title>Americana</title><price>16.95</price></cd></order>';
var DISCOUNT = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:param name="discount"/><xsl:template match="/"><order><xsl:variable name="sub-total" select="sum(//price)"/><total><xsl:value-of select="$sub-total"/></total>15% discount if paid by: <xsl:value-of select="$discount"/></order></xsl:template></xsl:stylesheet>';

var config = {
    xslt: DISCOUNT,
    source: ORDER,
    result: String,
    params : {
    hmmm: 'laaa',
    foo: 'bar',
    daa: 'hmmm',
    },
};

transform(config, function(err, res) {
    if (err) {
        console.log(err);
    } else {
        console.log(res);
    }
});
