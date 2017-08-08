assert = require("assert")
fs = require("fs")
path = require("path")
hl7grok = require("./../lib/hl7grok")

SPECS_ROOT = __dirname
MESSAGES_ROOT = "#{SPECS_ROOT}/messages"
RESULTS_ROOT = "#{SPECS_ROOT}/results"

REGEX_ISO_8601 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(([+-]\d\d:\d\d)|Z)?$/i

parseDates = (node) ->
  if node == null || typeof node == 'undefined'
    null
  else if typeof(node) == 'string'
    if node.match(REGEX_ISO_8601)
      new Date(Date.parse(node))
    else
      node
  else if Array.isArray(node)
    node.map parseDates
  else if typeof(node) == 'object'
    result = {}
    Object.keys(node).forEach((k) -> result[k] = parseDates(node[k]))
    result
  else
    node

describe "Example messages", () ->
  fs.readdirSync(MESSAGES_ROOT).forEach (fn) ->
    msg = fs.readFileSync(MESSAGES_ROOT + "/" + fn, 'utf8')
    msg = msg.replace(/\n/g, "\r")

    expected = fs.readFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", 'utf8')
    expected = parseDates(JSON.parse(expected))

    it fn, () ->
      parsedResult = hl7grok.grok(msg, {strict: false})

      structurizedResult = hl7grok.structurize(parsedResult[0], {strict: false, ignoredSegments: ['CON']})
      t =
        structurizedResult: structurizedResult
        parsedResult: parsedResult

      # console.log 'here'
      # fs.writeFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", JSON.stringify(t, null, 2), 'utf8')

      assert.notEqual(null, parsedResult[0])
      assert.deepEqual(expected.parsedResult, parsedResult)

      assert.notEqual(null, structurizedResult[0])
      assert.deepEqual(expected.structurizedResult, structurizedResult)

describe "Test", () ->
  msg = fs.readFileSync(MESSAGES_ROOT + "/adt-a04-2.hl7", 'utf8')
  msg = msg.replace(/\n/g, "\r")

  it "should parse message", () ->
    [result, errors] = hl7grok.grok(msg, {strict: false})
    assert.notEqual(null, result)

    [result, errors] = hl7grok.structurize(result, {strict: false, ignoredSegments: ['CON']})
    console.log(JSON.stringify({result, errors}, null, 2))
    assert.notEqual(null, result)
