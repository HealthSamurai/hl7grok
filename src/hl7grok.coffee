# There will be HL7_META_BASE64 variable after building single JS file

HL7_META = null;

META_CACHE = {}
getMeta = (hl7version) ->
  if META_CACHE[hl7version]
    META_CACHE[hl7version]
  else
    if HL7_META == null
      HL7_META = JSON.parse(LZString.decompressFromBase64(HL7_META_BASE64))

    meta = HL7_META["v" + hl7version.replace('.', '_')]

    if !meta
      throw new Error("No metainformation for HL7 v #{String(hl7version)}")

    parsed = JSON.parse(meta)
    META_CACHE[hl7version] = parsed
    parsed

replaceBlanksWithNulls = (v) ->
  if Array.isArray(v)
    v.map (b) -> replaceBlanksWithNulls(b)
  else if v instanceof Date
    v
  else if typeof(v) == 'object'
    res = {}
    for a, b of v
      res[a] = replaceBlanksWithNulls(b)
    res
  else if typeof(v) == 'string' && v.trim().length <= 0
    null
  else
    v

deprefixGroupName = (name) ->
  name.replace(/^..._.\d\d_/, '')

coerce = (value, typeId) ->
  if typeId == 'TS' || typeId == 'DT'
    v = if typeof value == 'string' then value else value['1']

    if v.match(/^\d{4}/)
      year = v[0...4]
      month = v[4...6]
      day = v[6...8]
      hour = v[8...10]
      minute = v[10...12]
      second = v[12...14]

      timestamp = Date.UTC(year, parseInt(month) - 1, day, hour, minute, second)

      if isNaN(timestamp)
        value
      else
        new Date(timestamp)
    else
      value

  else
    value

_structurize = (meta, struct, message, segIdx) ->
  if struct[0] != 'sequence'
    throw new Error("struct[0] != sequence, don't know what to do :/")

  result = {}
  structIdx = 0
  subErrors = []

  while true
    # Expected segment name and cardinality
    expSegName = struct[1][structIdx][0]
    [expSegMin, expSegMax] = struct[1][structIdx][1]

    # Trying to collect expSegMax occurences of expected segment
    # within loop above. This loop won't collect multiple segments if
    # expSegMax == 1
    collectedSegments = []
    thisSegName = null

    while true
      # console.log "iterating #{segIdx} #{expSegName} #{JSON.stringify(message, null, 2)}"
      if segIdx >= message.length
        break

      thisSegName = message[segIdx][0]
      # console.log "Expecting #{expSegName}[#{expSegMin}..#{expSegMax}] at #{segIdx}, seeing #{thisSegName}"

      if collectedSegments.length == expSegMax && expSegMax == 1
        # we wanted just one segment and we got it
        break

      # check if expected segment is a group
      if meta.GROUPS[expSegName]
        # if it's a group, we go to recursion
        [subResult, newSegIdx, errs] = _structurize(meta, meta.GROUPS[expSegName], message, segIdx)
        # console.log "it's a group! recursion result: #{JSON.stringify(subResult, null, 4)}"

        subErrors = subErrors.concat(errs)

        if subResult != null
          segIdx = newSegIdx
          collectedSegments.push(subResult)
        else
          break
      else
        # it's not a group, it's a regular segment
        if thisSegName == expSegName
          collectedSegments.push message[segIdx]
          # console.log "got #{collectedSegments.length} #{expSegName} at #{segIdx}"

          segIdx = segIdx + 1
        else
          # no segments with expected name left,
          # we'll figure out if it's an error or not
          # right after this loop
          break

    # now we have collectedSegments, and we're going to check
    # expected cardinality
    if collectedSegments.length == 0
      # no collected segments at all, check if expected segment
      # is optional
      if expSegMin == 1 # expected segment is required
        error = "Expected segment/group #{expSegName}, got #{thisSegName} at segment ##{segIdx}"
        return [null, segIdx, subErrors.concat([error])]
    else
      resultKey = deprefixGroupName(expSegName)

      # if max cardinality = -1 then push collectedSegments as array
      resultValue = if expSegMax == 1 then collectedSegments[0] else collectedSegments
      result[resultKey] = resultValue

    structIdx += 1

    # if we reached the end of struct then break
    if structIdx >= struct[1].length
      break

  # if we didn't collected anything, we return null instead of
  # empty object
  if Object.keys(result).length == 0
    return [null, segIdx, subErrors]
  else
    return [result, segIdx, subErrors]

structurize = (parsedMessage, options) ->
  msh = parsedMessage[0]

  hl7version = options && options.version

  if !hl7version
    hl7version = if typeof(msh[12]) == 'string' then msh[12] else msh[12][1]

  messageType = msh[9][1] + "_" + msh[9][2]

  meta = getMeta(hl7version)

  struct = meta.MESSAGES[messageType.replace("^", "_")]

  if !struct
    return [parsedMessage, ["No structure defined for message type #{messageType}"]]
  else
    [result, lastSegIdx, errors] = _structurize(meta, struct, parsedMessage, 0)
    return [result, errors]

VALID_OPTION_KEYS = ["strict", "symbolicNames", "version"]
validateOptions = (options) ->
  errors = []

  for k, v of options
    if VALID_OPTION_KEYS.indexOf(k) < 0
      errors.push k

  if errors.length > 0
    throw new Error("Unknown options key(s): #{errors.join(', ')}")

parse = (msg, options) ->
  errors = []

  if msg.substr(0, 3) != "MSH"
    errors.push "Message should start with MSH segment"

  if msg.length < 8
    errors.push "Message is too short (MSH truncated)"

  options ?=
    strict: false
    symbolicNames: true

  validateOptions(options)

  if errors.length == 0
    separators =
      segment: "\r" # TODO: should be \r
      field: msg[3]
      component: msg[4]
      subcomponent: msg[7]
      repetition: msg[5]
      escape: msg[6]

    segments = msg.split(separators.segment).map (s) -> s.trim()
    segments = segments.filter (s) -> s.length > 0
    msh = segments[0].split(separators.field)

    # fix MSH indexes (insert field separator at MSH.1)
    msh.splice(1, 0, separators.field)

    messageType = msh[9].split(separators.component)
    hl7version = options.version || msh[12]
    meta = getMeta(hl7version)

    [message, errors] = parseSegments(segments, meta, separators, options)

  if options.strict && errors.length > 0
    throw new Error("Errors during parsing an HL7 message:\n\n" + structErrors.join("\n"))

  return [message, errors]

parseSegments = (segments, meta, separators, options) ->
  result = []
  errors = []

  for segment in segments
    rawFields = segment.split(separators.field)

    # Thanks to HL7 committee for such amazing standard!
    if rawFields[0] == 'MSH'
      rawFields.splice(1, 0, separators.field)

    segmentName = rawFields.shift()

    [s, e] = parseFields(rawFields, segmentName, meta, separators, options)
    result.push s
    errors = errors.concat e

  [result, errors]

parseFields = (fields, segmentName, meta, separators, options) ->
  segmentMeta = meta.SEGMENTS[segmentName]
  result = { "0": segmentName }
  errors = []

  if !segmentMeta && segmentName[0] != 'Z'
    errors.push "No segment meta found for segment #{segmentName}"

  if segmentMeta && segmentMeta[0] != "sequence"
    throw new Error("Bang! Unknown case: #{segmentMeta[0]}")

  for fieldValue, fieldIndex in fields
    fieldMeta = segmentMeta && segmentMeta[1][fieldIndex]

    if segmentName == 'MSH' && fieldIndex == 1
      result[fieldIndex + 1] = fieldValue
    else
      if fieldMeta
        fieldId = fieldMeta[0]
        [fieldMin, fieldMax] = fieldMeta[1]
        otherFieldMeta = meta.FIELDS[fieldMeta[0]]
        fieldSymbolicName = otherFieldMeta[2]

        if fieldMin == 1 && (!fieldValue || fieldValue == '')
          errorMsg = "Missing value for required field #{fieldId}"
          errors.push errorMsg

        splitRegexp = new RegExp("(?!\\#{separators.escape})#{separators.repetition}")
        fieldValues = fieldValue.split(splitRegexp).map (v) ->
          if v == null || v == ""
            v
          else
            [f, e] = parseComponents(v, fieldId, meta, separators, options)
            errors = errors.concat(e)
            f

        if fieldMax == 1
          # result.push fieldValues[0]
          result[fieldIndex + 1] = fieldValues[0]
        else if fieldMax == -1
          # result.push fieldValues
          if fieldValues.length == 1 && fieldValues[0] == ''
            result[fieldIndex + 1] = []
          else
            result[fieldIndex + 1] = fieldValues
        else
          throw new Error("Bang! Unknown case for fieldMax: #{fieldMax}")
      else
        # result.push fieldValue
        result[fieldIndex + 1] = fieldValue

   # if options.symbolicNames && fieldSymbolicName
   #   # MSH is always a special case, you know
   #   if segmentName == 'MSH'
   #     result[fieldSymbolicName] = result[fieldIndex]
   #   else
   #     result[fieldSymbolicName] = result[fieldIndex + 1]

   [replaceBlanksWithNulls(result), errors]

parseComponents = (value, fieldId, meta, separators, options) ->
  fieldMeta = meta.FIELDS[fieldId]

  if fieldMeta[0] != 'leaf'
    throw new Error("Bang! Unknown case for fieldMeta[0]: #{fieldMeta[0]}")

  fieldType = fieldMeta[1]
  typeMeta = meta.DATATYPES[fieldType]
  errors = []

  if typeMeta
    # it's a complex type
    splitRegexp = new RegExp("(?!\\#{separators.escape})\\#{separators.component}")
    fieldMeta = "^"
    # result = [fieldMeta]
    result = {"0": fieldMeta}

    value.split(splitRegexp).forEach (c, index) ->
      componentId = typeMeta[1][index] && typeMeta[1][index][0]

      if componentId
        [componentMin, componentMax] = typeMeta[1][index][1]
        componentMeta = meta.DATATYPES[componentId]

        if componentMeta[0] != 'leaf'
          throw new Error("Bang! Unknown case for componentMeta[0]: #{componentMeta[0]}")

        if componentMin == 1 && (!c || c == '')
          errorMsg = "Missing value for required component #{componentId}"
          errors.push errorMsg

        if componentMax == -1
          throw new Error("Bang! Unlimited cardinality for component #{componentId}, don't know what to do :/")

        if componentMeta
          componentValue = coerce(c, componentMeta[1])
        else
          componentValue = c

        result[index + 1] = componentValue
      else
        result[index + 1] = c

      # result.push componentValue

      # if options.symbolicNames
      #   result[componentMeta[2]] = componentValue

    [coerce(result, fieldType), errors]
  else
    [coerce(value, fieldType), []]

exports =
  grok: parse
  structurize: structurize
  getMeta: getMeta

if typeof(module) != 'undefined'
  module.exports = exports
else if typeof(window) != 'undefined'
  window.hl7grok = exports
else
  this.hl7grok = exports
