'use strict';
/* Keep current RtDt docs internally linked, without superseded documentation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname,'..');
const GUIDE_DIR = path.join(ROOT,'Guide');
const sources = ['README.md','LICENSING.md'].concat(
    fs.readdirSync(GUIDE_DIR).filter(function (filename) {

        return /\.md$/i.test(filename);
    }).map(function (filename) {

        return 'Guide/'+filename;
    })
);
const missing = [];
const obsolete = ['docs/archive','Guides','config.rdt'];
for(const relative of obsolete) {

    assert.equal(fs.existsSync(path.join(ROOT,relative)),false,
        'Obsolete documentation remains: '+relative);
}

for (const sourceName of sources) {

    const sourcePath = path.join(ROOT,sourceName);
    const text = fs.readFileSync(sourcePath,'utf8');
    assert.doesNotMatch(text,/docs\/archive\/|Guides\/RDT-pack-format\.md/,
        'Documentation still references a removed directory: '+sourceName);
    const links = /!?\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match=links.exec(text))!==null) {

        const reference = match[1].trim().replace(/^<|>$/g,'');
        const location = reference.split('#')[0].split('?')[0];
        if (!location || /^(?:https?:|mailto:|data:)/i.test(location))
            continue;
        const dest = path.resolve(path.dirname(sourcePath),decodeURIComponent(location));
        const withinRepo = path.relative(ROOT,dest);
        if (withinRepo.startsWith('..'+path.sep)||path.isAbsolute(withinRepo)) {

            missing.push(sourceName+': external relative link '+reference);
            continue;
        }
        if (!fs.existsSync(dest))
            missing.push(sourceName+': '+reference);
    }
}
assert.deepEqual(missing,[],'Broken internal documentation links: '+missing.join('\n'));
console.log('Current documentation links and obsolete-content checks passed ('+
    sources.length+' files)');
