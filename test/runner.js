/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const hl7grok = require("./../lib/hl7grok");

const SPECS_ROOT = __dirname;
const MESSAGES_ROOT = `${SPECS_ROOT}/messages`;
const RESULTS_ROOT = `${SPECS_ROOT}/results`;

const REGEX_ISO_8601 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(([+-]\d\d:\d\d)|Z)?$/i;

var parseDates = function(node) {
  if ((node === null) || (typeof node === 'undefined')) {
    return null;
  } else if (typeof(node) === 'string') {
    if (node.match(REGEX_ISO_8601)) {
      return new Date(Date.parse(node));
    } else {
      return node;
    }
  } else if (Array.isArray(node)) {
    return node.map(parseDates);
  } else if (typeof(node) === 'object') {
    const result = {};
    Object.keys(node).forEach(k => result[k] = parseDates(node[k]));
    return result;
  } else {
    return node;
  }
};

describe("Example messages", () =>
  fs.readdirSync(MESSAGES_ROOT).forEach(function(fn) {
    let msg = fs.readFileSync(MESSAGES_ROOT + "/" + fn, 'utf8');
    msg = msg.replace(/\n/g, "\r");

    let expected = fs.readFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", 'utf8');
    expected = parseDates(JSON.parse(expected));

    return it(fn, function() {
      const parsedResult = hl7grok.grok(msg, {strict: false});

      const structurizedResult = hl7grok.structurize(parsedResult[0], {strict: false, ignoredSegments: ['CON']});
      const t = {
        structurizedResult,
        parsedResult
      };

      // console.log 'here'
      // fs.writeFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", JSON.stringify(t, null, 2), 'utf8')

      assert.notEqual(null, parsedResult[0]);
      assert.deepEqual(expected.parsedResult, parsedResult);

      assert.notEqual(null, structurizedResult[0]);
      return assert.deepEqual(expected.structurizedResult, structurizedResult);
    });
  })
);

describe("Test", function() {
  let msg = fs.readFileSync(MESSAGES_ROOT + "/adt-a04-2.hl7", 'utf8');
  msg = msg.replace(/\n/g, "\r");

  return it("should parse message", function() {
    let [result, errors] = Array.from(hl7grok.grok(msg, {strict: false}));
    assert.notEqual(null, result);

    [result, errors] = Array.from(hl7grok.structurize(result, {strict: false, ignoredSegments: ['CON']}));
    console.log(JSON.stringify({result, errors}, null, 2));
    return assert.notEqual(null, result);
  });
});
