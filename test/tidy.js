var tidy = require('htmltidy').tidy;
var text = '<table><tr><td>badly formatted html</tr>';

// setup options
tidy(text, function(err, html) {
    if (err) 
      return console.log('ERROR: ' + err);
    console.log(html);
});

