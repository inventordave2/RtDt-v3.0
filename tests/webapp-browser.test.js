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
        // Scene import may have opened the timeline automatically; do not toggle it shut.
        await page.locator('details.rtdt-animation-tools').evaluate(function (node) {

            node.open = true;
        });
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
        // Hosted .rdt manifest uses the same scene and animation pipeline.
        await page.selectOption('#sceneSource','pack');
        await page.selectOption('#packSource','repo');
        await page.locator('#btnLoadScene').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#packStatus');
            return status && /pack loaded|Pack failed/i.test(status.textContent);
        },null,{timeout:60000});
        assert.match(await page.locator('#packStatus').innerText(),/pack loaded/i);
        assert.equal(await page.inputValue('#renderWidth'),'160');
        assert.equal(await page.inputValue('#renderHeight'),'90');
        assert.equal(await page.inputValue('#phyExportStart'),'0');
        assert.equal(await page.inputValue('#phyExportEnd'),'191');
        assert.equal(await page.inputValue('#phyExportDestination'),'zip');
        await page.fill('#renderWidth','12');
        await page.fill('#renderHeight','10');
        await page.fill('#phyExportEnd','1');
        const packDownload = page.waitForEvent('download',{timeout:60000});
        await page.locator('#btnExportPhy').click();
        const packZip = await packDownload;
        assert.equal(packZip.suggestedFilename(),'orbit-animation.zip');
        const packZipPath = path.join(temp,'hosted-pack.zip');
        await packZip.saveAs(packZipPath);
        assert.equal(Object.keys(zip_files(fs.readFileSync(packZipPath))).length,3);
        await page.waitForFunction(function () {

            return /Export complete/.test(
                document.querySelector('#phyExportStatus').textContent);
        });

        // A local directory grants access to the pack and its dependencies.
        const folder = path.join(temp,'local-rtd-pack');
        fs.mkdirSync(path.join(folder,'orbit'),{recursive:true});
        fs.copyFileSync(path.join(ROOT,'samples','orbit.scene'),
            path.join(folder,'orbit.scene'));
        fs.copyFileSync(path.join(ROOT,'samples','orbit','orbit-formula.phy'),
            path.join(folder,'orbit','orbit-formula.phy'));
        const localPack = {
            version:1,name:'Local directory pack',
            scene:'orbit.scene',phy:'orbit/orbit-formula.phy',
            render:{width:12,height:10,quality:1,fps:12,
                frames:{start:1,end:2}},
            output:{destination:'zip',path:'local-pack.zip',format:'png'}
        };
        fs.writeFileSync(path.join(folder,'project.rdt'),
            JSON.stringify(localPack,null,2));
        await page.selectOption('#packSource','local');
        await page.locator('#packLocalFiles').setInputFiles(folder);
        await page.locator('#btnLoadScene').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#packStatus');
            return status && /Local directory pack|Pack failed/.test(
                status.textContent);
        },null,{timeout:60000});
        assert.match(await page.locator('#packStatus').innerText(),
            /Local directory pack/);
        assert.equal(await page.inputValue('#phyExportStart'),'1');
        assert.equal(await page.inputValue('#phyExportEnd'),'2');
        const localDownload = page.waitForEvent('download',{timeout:60000});
        await page.locator('#btnExportPhy').click();
        const localZip = await localDownload;
        assert.equal(localZip.suggestedFilename(),'local-pack.zip');
        const localPath = path.join(temp,'local-pack.zip');
        await localZip.saveAs(localPath);
        const localEntries = zip_files(fs.readFileSync(localPath));
        assert.deepEqual(Object.keys(localEntries).sort(),[
            'frame-0001.png','frame-0002.png','manifest.json'
        ]);
        assert.equal(JSON.parse(localEntries['manifest.json']).fps,12);
        await page.waitForFunction(function () {

            return /Export complete/.test(
                document.querySelector('#phyExportStatus').textContent);
        });

        // A still-image .rdt job uses its requested filename and canonical PNG bytes.
        localPack.render = {width:12,height:10,quality:1};
        localPack.output = {destination:'file',path:'out/still-from-pack.png',
            format:'png'};
        fs.writeFileSync(path.join(folder,'project.rdt'),
            JSON.stringify(localPack,null,2));
        await page.locator('#packLocalFiles').setInputFiles(folder);
        await page.locator('#btnLoadScene').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#packStatus');
            return status && /single-image render ready|Pack failed/.test(
                status.textContent);
        },null,{timeout:60000});
        assert.match(await page.locator('#packStatus').innerText(),
            /single-image render ready/);
        await page.locator('#btnRender').click();
        await page.waitForFunction(function () {

            const status = document.querySelector('#renderStatus');
            return status && /Render complete|Render failed/.test(status.textContent);
        },null,{timeout:60000});
        assert.match(await page.locator('#renderStatus').innerText(),/Render complete/);
        await page.locator('details.section-files').evaluate(function (node) {

            node.open = true;
        });
        const stillDownload = page.waitForEvent('download',{timeout:60000});
        await page.locator('#btnDownload').click();
        const browserStill = await stillDownload;
        assert.equal(browserStill.suggestedFilename(),'still-from-pack.png');
        const browserStillPath = path.join(temp,'browser-still.png');
        await browserStill.saveAs(browserStillPath);
        const {spawnSync} = require('node:child_process');
        const nodeStill = spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',path.join(folder,'project.rdt')],{
                cwd:ROOT,encoding:'utf8',timeout:60000
            });
        assert.equal(nodeStill.status,0,nodeStill.stdout+'\\n'+nodeStill.stderr);
        assert.deepEqual(fs.readFileSync(browserStillPath),
            fs.readFileSync(path.join(folder,'out','still-from-pack.png')),
            'CLI and WebApp pack still PNGs must match byte-for-byte');

        // Exercise the camera dialogue against the shared flightpath sampler.
        await page.locator('#btnOpenCamera').click();
        await page.locator('#cameraModal').waitFor({state:'visible'});
        await page.fill('#cameraPathPoints','[[0,2,-8],[5,2,-4],[5,3,4]]');
        await page.fill('#cameraPathFps','12');
        await page.locator('#btnCreateCameraPath').click();
        assert.match(await page.locator('#cameraPathStatus').innerText(),/Flightpath ready/);
        await page.fill('#cameraPathTime','0');
        await page.locator('#btnSampleCameraPath').click();
        assert.equal(await page.locator('#camX').inputValue(),'0');
        assert.equal(await page.locator('#camY').inputValue(),'2');
        assert.equal(await page.locator('#camZ').inputValue(),'-8');
        assert.match(await page.locator('#mainStatus').innerText(),/Camera updated/);
        await page.locator('#btnOpenCamera').click();
        await page.fill('#cameraPathPoints','invalid JSON');
        await page.locator('#btnCreateCameraPath').click();
        assert.match(await page.locator('#cameraPathStatus').innerText(),/Invalid flightpath/);
        assert.equal(await page.locator('#btnSampleCameraPath').isDisabled(),true);
        await page.locator('#cameraModal [data-close-dialog="cameraModal"]').last().click();

        // Colour editing works independently of the camera and render controls.
        await page.locator('details.section-light').evaluate(function (node) {

            node.open=true;
        });
        await page.locator('#btnOpenLights').click();
        await page.locator('#lightsModal').waitFor({state:'visible'});
        await page.fill('#lightHex','#F0D0A0');
        await page.locator('#lightHex').press('Tab');
        await page.locator('#btnApplyLight').click();
        assert.match(await page.locator('#mainStatus').innerText(),/Point-light colour updated/);

        assert.deepEqual(pageErrors,[],'Browser runtime errors: '+pageErrors.join('; '));
        await context.close();
        console.log('Chromium: scene + hosted/local RDT packs + AetherOre ZIP and cloud gate passed');
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
