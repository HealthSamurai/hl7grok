assert = require("assert")
fs = require("fs")
path = require("path")
hl7grok = require("./../lib/hl7grok")

SPECS_ROOT = __dirname
MESSAGES_ROOT = "#{SPECS_ROOT}/messages"
RESULTS_ROOT = "#{SPECS_ROOT}/results"

describe "Example messages", () ->
  fs.readdirSync(MESSAGES_ROOT).forEach (fn) ->
    msg = fs.readFileSync(MESSAGES_ROOT + "/" + fn, 'utf8')
    expected = fs.readFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", 'utf8')
    expected = JSON.parse(expected)

    it fn, () ->
      [result, errors] = hl7grok.grok(msg, {symbolicNames: true, strict: false})
      assert.deepEqual(expected, {result: result, errors: errors})
