const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\ABDUL WAHID\\OneDrive\\Desktop\\registration';

function processHtmlFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // 1. Add Google Fonts
    const fontStrToAdd = '&family=Aref+Ruqaa:wght@400;700&family=Amiri:ital,wght@0,400;0,700;1,400;1,700';
    if (!content.includes('Aref+Ruqaa')) {
        if (content.includes('family=Playfair+Display')) {
            content = content.replace(/family=Playfair\+Display[^&"']*/, match => match + fontStrToAdd);
        } else if (content.includes('family=Inter')) {
            content = content.replace(/family=Inter[^&"']*/, match => match + fontStrToAdd);
        }
    }

    // 2. Text node replacement
    let inTitle = false;
    let inScript = false;
    let inStyle = false;

    // split by tags
    const parts = content.split(/(<[^>]+>)/g);
    for (let i = 0; i < parts.length; i++) {
        let p = parts[i];
        if (p.startsWith('<')) {
            const tag = p.toLowerCase();
            if (tag.startsWith('<title')) inTitle = true;
            else if (tag.startsWith('</title>')) inTitle = false;
            else if (tag.startsWith('<script')) inScript = true;
            else if (tag.startsWith('</script>')) inScript = false;
            else if (tag.startsWith('<style')) inStyle = true;
            else if (tag.startsWith('</style>')) inStyle = false;
        } else {
            if (!inTitle && !inScript && !inStyle && p.trim() !== '') {
                // Let's use a function replacer
                p = p.replace(/Muhyissunnah Dars Ukkuda|Muhyissunnah Dars|Muhyissunnah/gi, (match) => {
                    if (match.toLowerCase() === 'muhyissunnah dars ukkuda') {
                        return '<span class="arabic-brand-text" dir="rtl">محيي السنة درس عكودا</span>';
                    } else if (match.toLowerCase() === 'muhyissunnah dars') {
                        return '<span class="arabic-brand-text" dir="rtl">محيي السنة درس</span>';
                    } else {
                        return '<span class="arabic-brand-text" dir="rtl">محيي السنة</span>';
                    }
                });
                parts[i] = p;
            }
        }
    }

    const newContent = parts.join('');
    if (newContent !== originalContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

const files = fs.readdirSync(dir);
let updatedCount = 0;
files.forEach(file => {
    if (file.endsWith('.html')) {
        processHtmlFile(path.join(dir, file));
        updatedCount++;
    }
});
console.log(`Processed ${updatedCount} HTML files.`);
