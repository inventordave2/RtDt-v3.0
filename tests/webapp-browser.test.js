'use strict';
/* Real Chromium smoke test for hosted scenes, .phy import and ZIP animation export.
 * Install Playwright only for this optional target:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {PNG} = require('pngjs');

let playwright;
try {

    playwright = require('playwright');
} catch (error) {

    if (error.code === 'MODULE_NOT_FOUND')
        throw new Error('Install the optional browser test dependency: '+
            'npm install --no-save playwright && npx playwright install chromium');
    throw error;
}
const ROOT = path.resolve(__dirname,'..');
const TYPES = {'.html':'text/html','.js':'text/javascript','.css':'text/css',
    '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
    '.scene':'application/json','.phy':'text/plain','.obj':'text/plain',
    '.yaml':'text/plain','.yml':'text/plain'};

function serve_file(request,response) {

    const pathname = decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    const filename = path.resolve(ROOT,'.'+pathname);
    const relative = path.relative(ROOT,filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {

        response.writeHead(403).end();
        return;
    }
    fs.readFile(filename,function (error,bytes) {

        if (error) {

            response.writeHead(404).end('Missing file');
            return;
        }
        response.writeHead(200,{'Content-Type':TYPES[path.extname(filename)] ||
            'application/octet-stream','Cache-Control':'no-store'});
        response.end(bytes);
    });
}

function zip_files(buffer) {

    const entries = {};
    let offset = 0;
    while (buffer.readUInt32LE(offset) === 0x04034b50) {

        const size = buffer.readUInt32LE(offset+18);
        const filenameLength = buffer.readUInt16LE(offset+26);
        const extraLength = buffer.readUInt16LE(offset+28);
        const filename = buffer.subarray(offset+30,offset+30+filenameLength)
            .toString('utf8');
        const start = offset+30+filenameLength+extraLength;
        entries[filename] = buffer.subarray(start,start+size);
        offset = start+size;
    }
    assert.equal(buffer.readUInt32LE(offset),0x02014b50,
        'Missing ZIP central directory');
    return entries;
}

async function main() {

    const server = http.createServer(serve_file);
    await new Promise(function (resolve) {

        server.listen(0,'127.0.0.1',resolve);
    });
    const base = 'http://127.0.0.1:'+server.address().port;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-web-smoke-'));
    let browser;
    const pageErrors = [];
    try {

        browser = await playwright.chromium.launch({headless:true});
        const context = await browser.newContext({acceptDownloads:true});
        const page = await context.newPage();
        page.on('pageerror',function (error) {

            pageErrors.push(error.message);
        });
        await page.goto(base+'/webapp.html',{waitUntil:'domcontentloaded'});
        await page.locator('#mainStatus').waitFor({state:'visible'});
        assert.match(await page.locator('#mainStatus').innerText(),/RtDt ready/);
        await page.selectOption('#sceneSource','repo');
        await page.selectOption('#sceneRepoSelect','scene');
        await page.locator('#btnLoadScene').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#sceneStatus');
            return status && (/Scene loaded|Scene not loaded|Scene failed/.test(
                status.textContent));
        },null,{timeout:60000});
        assert.match(await page.locator('#sceneStatus').innerText(),/Scene loaded/);
        assert.match(await page.locator('#mainStatus').innerText(),
            /Scene and assets loaded/);
        await page.locator('#phyImportIndicator').waitFor();
        assert.match(await page.locator('#phyImportIndicator').innerText(),
            /AetherOre animation loaded/);

        // Open the actual disclosure panels before editing their inputs.
        await page.locator('details.rtdt-render-settings > summary').click();
        await page.locator('details.rtdt-animation-tools > summary').click();
        await page.locator('#phyBatchTools > summary').click();
        await page.fill('#renderWidth','12');
        await page.fill('#renderHeight','10');
        await page.fill('#phyExportStart','0');
        await page.fill('#phyExportEnd','1');
        await page.selectOption('#phyExportDestination','zip');
        const downloadPromise = page.waitForEvent('download',{timeout:60000});
        await page.locator('#btnExportPhy').click();
        const download = await downloadPromise;
        const downloadFile = path.join(temp,'animation.zip');
        await download.saveAs(downloadFile);
        const zip = zip_files(fs.readFileSync(downloadFile));
        assert.deepEqual(Object.keys(zip).sort(),[
            'frame-0000.png','frame-0001.png','manifest.json'
        ]);
        const manifest = JSON.parse(zip['manifest.json'].toString('utf8'));
        assert.equal(manifest.frames.length,2);
        assert.equal(manifest.width,12);
        assert.equal(manifest.height,10);
        for (const name of ['frame-0000.png','frame-0001.png']) {

            const frame = PNG.sync.read(zip[name],{checkCRC:true});
            assert.equal(frame.width,12);
            assert.equal(frame.height,10);
        }
        await page.waitForFunction(function () {

            const status = document.querySelector('#phyExportStatus');
            return status && /Export complete/.test(status.textContent);
        });

        // A cloud destination must not proceed without explicit account login.
        await page.selectOption('#phyExportDestination','dropbox');
        assert.equal(await page.locator('#phyCloudSettings').evaluate(function (node) {

            return getComputedStyle(node).display;
        }),'block');
        await page.locator('#btnExportPhy').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#phyExportStatus');
            return status && /Connect your dropbox account/.test(status.textContent);
        });
        assert.deepEqual(pageErrors,[],'Browser runtime errors: '+pageErrors.join('; '));
        await context.close();
        console.log('Chromium: repository scene + AetherOre + PNG ZIP and cloud login gate passed');
    } finally {

        if (browser) await browser.close();
        await new Promise(function (resolve) {

            server.close(resolve);
        });
        fs.rmSync(temp,{recursive:true,force:true});
    }
}

main().catch(function (error) {

    console.error(error);
    process.exitCode = 1;
});
