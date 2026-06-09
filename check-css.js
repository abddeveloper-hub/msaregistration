const fs = require('fs');
const css = fs.readFileSync('mobile.css', 'utf8');

let depth = 0;
for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
        depth--;
        if (depth < 0) {
            console.log('Extra closing bracket at index ' + i);
        }
    }
}
console.log('Final depth: ' + depth);
