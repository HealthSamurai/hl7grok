#!/usr/bin/env node

var fs = require("fs");
var path = require("path");
var lz = require('lz-string');

var result = {};

fs.readdirSync(__dirname).forEach(function (fn) {
    if (fn.match(/\.json$/)) {
        var ver = path.basename(fn, ".json");
        var m = JSON.parse(fs.readFileSync(__dirname + "/" + fn, 'utf8'));
        // delete m["TABLES"];

        result[ver] = JSON.stringify(m);
    }
});

var concat = JSON.stringify(result);
var compressed = lz.compressToBase64(concat);

var a = new Date().getTime();
var decompressed = lz.decompressFromBase64(compressed);
var b = new Date().getTime();


fs.writeFile(__dirname + "/meta.base64", compressed);
console.log("Compressed meta size = " + (compressed.length / 1024) + " kb");
console.log("Decompressed in " + (b - a) + " ms");
