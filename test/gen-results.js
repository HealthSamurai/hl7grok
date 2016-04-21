#!/usr/bin/env node

var fs = require("fs");
var path = require("path");
var hl7grok = require("./../lib/hl7grok");

fs.readdirSync(__dirname + "/messages").forEach(function(fileName) {
    var msg = fs.readFileSync(__dirname + "/messages/" + fileName, 'utf8');
    msg = msg.replace(/\n/g, "\r");
    var result = hl7grok.grok(msg, {symbolicNames: true, strict: false});
    result = {result: result[0], errors: result[1]};
    var outputFile = __dirname + "/results/" + path.basename(fileName, '.hl7') + ".json";
    var outputData = JSON.stringify(result, null, 2);
    fs.writeFile(outputFile, outputData);

    console.log(fileName + " => " + path.basename(fileName, '.hl7') + ".json");
});
