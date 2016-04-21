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
    msg = msg.replace(/\n/g, "\r")

    expected = fs.readFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", 'utf8')
    expected = JSON.parse(expected)

    it fn, () ->
      parsedResult = hl7grok.grok(msg, {strict: false})
      assert.notEqual(null, parsedResult[0])
      assert.deepEqual(expected.parsedResult, parsedResult)

      structurizedResult = hl7grok.structurize(parsedResult[0], {strict: false})
      assert.notEqual(null, structurizedResult[0])
      assert.deepEqual(expected.structurizedResult, structurizedResult)

describe "Test", () ->
  msg = fs.readFileSync(MESSAGES_ROOT + "/imaging-lung-01.hl7", 'utf8')
  msg = msg.replace(/\n/g, "\r")

  it "should parse message", () ->
    [result, errors] = hl7grok.grok(msg, {strict: false})
    assert.notEqual(null, result)

    [result, errors] = hl7grok.structurize(result, {strict: false})
    assert.notEqual(null, result)
