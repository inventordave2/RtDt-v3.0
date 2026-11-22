'use strict';
/* Node filesystem adapter for the shared JSON v1 scene/asset contract. */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

function decode_rgba(rgba, width, height) {

    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width * height > 4000000)
        throw new Error('Invalid image dimensions');
    const data = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4) {

        const alpha = rgba[i + 3] / 255;
        data[j++] = Math.round(rgba[i] * alpha + 255 * (1 - alpha));
        data[j++] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha));
        data[j++] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha));
    }
    return {width:width, height:height, data:data, profile:'RGB'};
}

function decode_bmp(buffer) {

    if (buffer.length < 54 || buffer.toString('ascii',0,2) !== 'BM')
        throw new Error('Invalid BMP header');
    const offset = buffer.readUInt32LE(10);
    const dibSize = buffer.readUInt32LE(14);
    const width = buffer.readInt32LE(18);
    const rawHeight = buffer.readInt32LE(22);
    const height = Math.abs(rawHeight);
    const bits = buffer.readUInt16LE(28);
    const compression = buffer.readUInt32LE(30);
    if (dibSize < 40 || width < 1 || height < 1 || width * height > 4000000 ||
        ![4,8,24,32].includes(bits) || compression !== 0)
        throw new Error('Unsupported BMP layout');
    const stride = Math.floor((width * bits + 31) / 32) * 4;
    if (offset + stride * height > buffer.length)
        throw new Error('Truncated BMP image');
    const paletteLength = bits <= 8 ? (buffer.readUInt32LE(46) || 2 ** bits) : 0;
    const paletteOffset = 14 + dibSize;
    if (bits <= 8 && paletteOffset + paletteLength * 4 > buffer.length)
        throw new Error('Truncated BMP palette');
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {

        const sourceY = rawHeight > 0 ? height - y - 1 : y;
        for (let x = 0; x < width; x++) {

            const source = offset + sourceY * stride;
            const index = bits === 4 ? ((x & 1) ? buffer[source + (x >> 1)] & 15 :
                buffer[source + (x >> 1)] >> 4) :
                bits === 8 ? buffer[source + x] : -1;
            const pos = index >= 0 ? paletteOffset + index * 4 : source + x * (bits / 8);
            const dest = (y * width + x) * 4;
            if (pos + 3 > buffer.length) throw new Error('Invalid BMP pixel index');
            pixels[dest] = buffer[pos + 2];
            pixels[dest + 1] = buffer[pos + 1];
            pixels[dest + 2] = buffer[pos];
            pixels[dest + 3] = bits === 32 ? buffer[pos + 3] : 255;
        }
    }
    return decode_rgba(pixels, width, height);
}

function decode_image(filename, imageIO) {

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.ppm')
        return imageIO.parse_ppm(fs.readFileSync(filename,'utf8'));
    const buffer = fs.readFileSync(filename);
    if (ext === '.png') {

        const image = PNG.sync.read(buffer);
        return decode_rgba(image.data, image.width, image.height);
    }
    if (ext === '.jpg' || ext === '.jpeg') {

        const image = jpeg.decode(buffer,{useTArray:true});
        return decode_rgba(image.data, image.width, image.height);
    }
    if (ext === '.bmp') return decode_bmp(buffer);
    throw new Error('Unsupported texture format: ' + ext);
}

function resolve(model, sceneFile, repoRoot, assetLibrary, imageIO) {

    const entries = assetLibrary.definitions(model);
    const available = {};
    const records = [];
    const cache = new Map();
    const sceneAbsolute = path.resolve(sceneFile);
    const rootAbsolute = path.resolve(repoRoot);
    const relativeScene = path.relative(rootAbsolute, sceneAbsolute);
    const withinRepo = relativeScene && !relativeScene.startsWith('..') &&
        !path.isAbsolute(relativeScene);
    const base = withinRepo ? rootAbsolute : path.dirname(sceneAbsolute);
    const scenePath = withinRepo ? relativeScene.replace(/\\/g,'/') : path.basename(sceneAbsolute);
    for (const entry of entries) {

        const key = entry.kind + ':' + entry.path;
        try {

            if (!cache.has(key)) {

                const relativeAsset = assetLibrary.repo_path(entry.path,scenePath);
                const absolute = path.resolve(base,relativeAsset);
                const relative = path.relative(base,absolute);
                if (relative.startsWith('..') || path.isAbsolute(relative))
                    throw new Error('Asset escapes scene root: ' + entry.path);
                const data = entry.kind === 'image' ? decode_image(absolute,imageIO) :
                    fs.readFileSync(absolute,'utf8');
                cache.set(key,entry.kind === 'obj' ? assetLibrary.parse_obj(data) : data);
            }
            available[key] = cache.get(key);
            records.push({path:entry.path,kind:entry.kind,required:entry.required,
                status:'loaded',target:entry.target});
        } catch (error) {

            records.push({path:entry.path,kind:entry.kind,required:entry.required,
                status:'missing',error:error.message,target:entry.target});
            if (entry.required)
                throw new Error('Required ' + entry.kind + ' asset ' + entry.path +
                    ': ' + error.message);
        }
    }
    return {files:available,records:records,entries:entries};
}

module.exports = {resolve:resolve, decode_image:decode_image, decode_bmp:decode_bmp};
