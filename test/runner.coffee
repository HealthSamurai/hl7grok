assert = require("assert")
yaml = require("js-yaml")
fs = require("fs")
hl7groker = require("./../lib/hl7grok")

SPECS_ROOT = __dirname
MESSAGES_ROOT = "#{SPECS_ROOT}/messages"
MESSAGES = {}

findYamls = (rootPath, cb) ->
  fs.readdirSync(rootPath).forEach (fn) ->
    if fn.match /\.yml$/
      absPath = rootPath + "/" + fn
      spec = yaml.safeLoad(fs.readFileSync(absPath, 'utf8'))
      cb(spec)

readMessage = (name) ->
  if MESSAGES[name]
    MESSAGES[name]
  else
    msg = fs.readFileSync(MESSAGES_ROOT + "/#{name}.hl7", 'utf8')
    msg = msg.replace(/\r*\n/g, "\r")
    MESSAGES[name] = msg

getIn = (obj, path) ->
  p = path.split(".")
  cur = obj

  for item in p when cur
    if item == '$type'
      cur = typeof(cur)
    else
      cur = cur[item]

  cur

findYamls SPECS_ROOT, (spec) ->
  describe spec.suite, () ->
    before () ->
      msg = readMessage(spec.msg)
      @result = hl7groker.grok(msg)
      console.log "!!! RESULT: ", JSON.stringify(@result, null, 2)

    spec.tests.forEach (test) ->
      it test.desc, () ->
        for probe in test.probes
          assert.deepEqual(probe.value, getIn(@result, probe.path))
