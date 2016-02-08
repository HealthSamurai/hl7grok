assert = require("assert")
yaml = require("js-yaml")
fs = require("fs")
path = require("path")
hl7grok = require("./../lib/hl7grok")

SPECS_ROOT = __dirname
MESSAGES_ROOT = "#{SPECS_ROOT}/messages"
RESULTS_ROOT = "#{SPECS_ROOT}/results"
# MESSAGES = {}

# findYamls = (rootPath, cb) ->

# readMessage = (name) ->
#   if MESSAGES[name]
#     MESSAGES[name]
#   else
#     msg = fs.readFileSync(MESSAGES_ROOT + "/#{name}.hl7", 'utf8')
#     msg = msg.replace(/\r*\n/g, "\r")
#     MESSAGES[name] = msg

# getIn = (obj, path) ->
#   p = path.split(".")
#   cur = obj

#   for item in p when cur
#     if item == '$type'
#       cur = typeof(cur)
#     else
#       cur = cur[item]

#   cur

describe "Example messages", () ->
  fs.readdirSync(MESSAGES_ROOT).forEach (fn) ->
    msg = fs.readFileSync(MESSAGES_ROOT + "/" + fn, 'utf8')
    expected = fs.readFileSync(RESULTS_ROOT + "/" + path.basename(fn, ".hl7") + ".json", 'utf8')
    expected = JSON.parse(expected)

    it fn, () ->
      [result, errors] = hl7grok.grok(msg, {symbolicNames: true, strict: false})
      assert.deepEqual(expected, {result: result, errors: errors})



# findYamls SPECS_ROOT, (spec) ->

#     before () ->
#       msg = readMessage(spec.msg)
#       [@result, errors] =
#       # console.log "!!! RESULT: ", JSON.stringify(@result, null, 2)
#       # console.log "!!! ERRORS: ", JSON.stringify(errors, null, 2)

#     spec.tests.forEach (test) ->
#       it test.desc, () ->
#         for probe in test.probes
#           assert.deepEqual(probe.value, getIn(@result, probe.path))
