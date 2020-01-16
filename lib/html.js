const jsdom = require('jsdom');

function rewriteResourceUrls(doc, rewriter) {
    const baseURL = doc.URL;
    for(const el of doc.querySelectorAll(['head [href]', 'head [src]'])) {
        for(const attrName of ['src', 'href']) {
            const rawURL = el.getAttribute(attrName);
            if(typeof rawURL === 'string') {
                const newValue = rewriter({rawURL, resolvedURL: el[attrName], baseURL});
                if(newValue !== undefined && newValue !== rawURL) {
                    el.setAttribute(attrName, newValue);
                    changed = true;
                }
            }
        }
    }
}
module.exports.rewriteResourceUrls = rewriteResourceUrls;
