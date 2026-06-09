const fs = require('fs');
const css = fs.readFileSync('mobile.css', 'utf8');

// remove comments
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

let inDoubleQuote = false;
let inSingleQuote = false;

for (let i = 0; i < noComments.length; i++) {
    const char = noComments[i];
    if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
}

console.log('inDoubleQuote:', inDoubleQuote);
console.log('inSingleQuote:', inSingleQuote);
