'use strict';
/* Guard WebApp structure, links and the shared flightpath UI adapter. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'webapp.html'),'utf8');
const controller=fs.readFileSync(path.join(ROOT,'rtdt_ui_browser_20261118.js'),'utf8');

function check_unique_id(id) {

    const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matches=html.match(new RegExp('id="'+escaped+'"','g')) || [];
    assert.equal(matches.length,1,'Expected exactly one WebApp element: '+id);
}

function test_repo_links() {

    assert.match(html,/https:\/\/github\.com\/inventordave2\/RtDt-v3\.0/);
    assert.match(controller,/https:\/\/github\.com\/inventordave2\/RtDt-v3\.0\/issues\/new/);
    assert.doesNotMatch(html,/pragprog\.com\/titles\/jbtracer|Jamis Buck/);
    assert.doesNotMatch(html+controller,/github\.com\/inventordave2\/RTDT(?:[\/"'])/);
}

function test_camera_and_flightpath() {

    for(const id of ['cameraModal','cameraPreset','camX','camY','camZ',
        'lookX','lookY','lookZ','cameraFov','btnUpdateCamera',
        'btnOpenCamera','cameraPathPoints','cameraPathFps','cameraPathTime',
        'btnCreateCameraPath','btnSampleCameraPath','cameraPathStatus'])
        check_unique_id(id);
    assert.match(html,/id="cameraModal"[^>]*role="presentation"/);
    assert.match(html,/aria-labelledby="cameraSettingsTitle"/);
    assert.match(controller,/rtdt_flightpath\.create\(points/);
    assert.match(controller,/rtdt_flightpath\.sample_at\(cameraPath,time\)/);
    assert.match(controller,/bind\('btnCreateCameraPath','click',create_camera_path\)/);
    assert.match(controller,/bind\('btnSampleCameraPath','click',sample_camera_path\)/);
    assert.match(html,/Continuous camera playback and camera orientation tracks are not available yet/);
}

function test_light_and_theme() {

    for(const id of ['lightsModal','lightHex','lightColour',
        'lightRedChannel','lightGreenChannel','lightBlueChannel',
        'lightSettingsStatus','btnApplyLight'])
        check_unique_id(id);
    assert.match(html,/--rtdt-navy:#11243e/);
    assert.match(html,/--rtdt-cyan:#68e0e8/);
    assert.match(html,/rtdt-about-content/);
}

test_repo_links();
test_camera_and_flightpath();
test_light_and_theme();
console.log('WebApp layout, repository links and camera flightpath wiring passed');
