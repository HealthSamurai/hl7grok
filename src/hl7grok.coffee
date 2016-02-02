fs = require("fs")

replaceBlanksWithNulls = (array) ->
  array.map (v) -> if v && v.trim().length > 0 then v else null

getMeta = (hl7version) ->
  JSON.parse(fs.readFileSync(__dirname + "/../meta/v#{hl7version.replace('.', '_')}.json"))

coerce = (value, typeId) ->
  # TODO
  value

parse = (msg) ->
  if msg.substr(0, 4) != "MSH|"
    throw new Error("Message should start with MSH segment")

  if msg.length < 8
    throw new Error("Message is too short (MSH truncated)")

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

  messageType = msh[8]
  hl7version = msh[11]
  meta = getMeta(hl7version)

  parseSegments(segments, meta, separators)

parseSegments = (segments, meta, separators) ->
  result = {}

  for segment in segments
    rawFields = segment.split(separators.field)
    segmentName = rawFields.shift()

    result[segmentName] = parseFields(rawFields, segmentName, meta, separators)

  result

parseFields = (fields, segmentName, meta, separators) ->
  segmentMeta = meta.SEGMENTS[segmentName]
  result = [segmentName]

  if segmentMeta[0] != "sequence"
    throw new Error("Bang! Unknown case: #{segmentMeta[0]}")

  for fieldValue, fieldIndex in fields
    fieldMeta = segmentMeta[1][fieldIndex]

    if fieldMeta
      fieldId = fieldMeta[0]
      [fieldMin, fieldMax] = fieldMeta[1]

      if fieldMin == 1 && (!fieldValue || fieldValue == '')
        throw new Error("Missing value for required field: #{fieldId}")
        # console.log "!!!! FIELD IS REQUIRED BUT EMPTY:", fieldId

      splitRegexp = new RegExp("(?!\\#{separators.escape})#{separators.repetition}")
      fieldValues = fieldValue.split(splitRegexp).map (v) ->
        parseComponents(v, fieldId, meta, separators)

      if fieldMax == 1
        result.push(fieldValues[0])
      else if fieldMax == -1
        result.push(fieldValues)
      else
        throw new Error("Bang! Unknown case for fieldMax: #{fieldMax}")

      # console.log "FIELD:", fieldId, fieldMin, fieldMax, JSON.stringify(fieldValues)
    else
      # console.log "NO FIELD META:", segmentName, fieldIndex + 1
      result.push(fieldValue)

  return result

parseComponents = (value, fieldId, meta, separators) ->
  fieldMeta = meta.FIELDS[fieldId]

  if fieldMeta[0] != 'leaf'
    throw new Error("Bang! Unknown case for fieldMeta[0]: #{fieldMeta[0]}")

  fieldType = fieldMeta[1]
  typeMeta = meta.DATATYPES[fieldType]

  # if fieldId == "PID_7"
  #   console.log "!!", JSON.stringify(fieldMeta), JSON.stringify(typeMeta)

  if typeMeta
    # it's a complex type
    splitRegexp = new RegExp("(?!\\#{separators.escape})\\#{separators.component}")
    value.split(splitRegexp).map (c, index) ->
      componentId = typeMeta[1][index][0]
      [componentMin, componentMax] = typeMeta[1][index][1]

      if componentMin == 1 && (!c || c == '')
        throw new Error("Missing value for required component #{componentId}")
      if componentMax == -1
        throw new Error("Bang! Unlimited cardinality for component #{componentId}")

      parseSubComponents(c, componentId, meta, separators)
  else
    # it's a basic type! no components at all
    # TODO: process escape sequences
    value

parseSubComponents = (v, scId, meta, separators) ->
  scMeta = meta.DATATYPES[scId]

  if scMeta
    if scMeta[0] != 'leaf'
      throw new Error("Bang! Unknown case for scMeta[0]: #{scMeta[0]}")

    coerce(v, scMeta[1])
  else
    v

# console.log "RESULT", JSON.stringify(parse(msg), null, 2)

# m = getMeta("2.3")
# for k, v of m.DATATYPES
#   if v && v[0] == 'sequence'
#     for i in v[1]
#       if i[1][1] == -1
#         console.log k, JSON.stringify(v, null, 2)
#       else
#         console.log i[1][1]

module.exports =
  grok: parse
