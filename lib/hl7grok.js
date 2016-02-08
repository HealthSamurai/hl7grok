// Generated by CoffeeScript 1.10.0
(function() {
  var META_CACHE, VALID_OPTION_KEYS, _structurize, coerce, deprefixGroupName, fs, getMeta, meta, parse, parseComponents, parseFields, parseSegments, replaceBlanksWithNulls, structurize, validateOptions;

  fs = require("fs");

  meta = require("./meta");

  META_CACHE = {};

  replaceBlanksWithNulls = function(v) {
    var a, b, res;
    if (Array.isArray(v)) {
      return v.map(function(b) {
        return replaceBlanksWithNulls(b);
      });
    } else if (typeof v === 'object') {
      res = {};
      for (a in v) {
        b = v[a];
        res[a] = replaceBlanksWithNulls(b);
      }
      return res;
    } else if (typeof v === 'string' && v.trim().length <= 0) {
      return null;
    } else {
      return v;
    }
  };

  getMeta = function(hl7version) {
    var parsed;
    if (META_CACHE[hl7version]) {
      return META_CACHE[hl7version];
    } else {
      parsed = JSON.parse(meta["v" + hl7version.replace('.', '_')]);
      META_CACHE[hl7version] = parsed;
      return parsed;
    }
  };

  deprefixGroupName = function(name) {
    return name.replace(/^..._.\d\d_/, '');
  };

  coerce = function(value, typeId) {
    return value;
  };

  _structurize = function(meta, struct, message, segIdx) {
    var collectedSegments, error, errs, expSegMax, expSegMin, expSegName, newSegIdx, ref, ref1, result, resultKey, resultValue, structIdx, subErrors, subResult, thisSegName;
    if (struct[0] !== 'sequence') {
      throw new Error("struct[0] != sequence, don't know what to do :/");
    }
    result = {};
    structIdx = 0;
    subErrors = [];
    while (true) {
      expSegName = struct[1][structIdx][0];
      ref = struct[1][structIdx][1], expSegMin = ref[0], expSegMax = ref[1];
      collectedSegments = [];
      thisSegName = null;
      while (true) {
        if (segIdx >= message.length) {
          break;
        }
        thisSegName = message[segIdx][0];
        if (collectedSegments.length === expSegMax && expSegMax === 1) {
          break;
        }
        if (meta.GROUPS[expSegName]) {
          ref1 = _structurize(meta, meta.GROUPS[expSegName], message, segIdx), subResult = ref1[0], newSegIdx = ref1[1], errs = ref1[2];
          subErrors = subErrors.concat(errs);
          if (subResult !== null) {
            segIdx = newSegIdx;
            collectedSegments.push(subResult);
          } else {
            break;
          }
        } else {
          if (thisSegName === expSegName) {
            collectedSegments.push(message[segIdx]);
            segIdx = segIdx + 1;
          } else {
            break;
          }
        }
      }
      if (collectedSegments.length === 0) {
        if (expSegMin === 1) {
          error = "Expected segment/group " + expSegName + ", got " + thisSegName + " at segment #" + segIdx;
          return [null, segIdx, subErrors.concat([error])];
        }
      } else {
        resultKey = deprefixGroupName(expSegName);
        resultValue = expSegMax === 1 ? collectedSegments[0] : collectedSegments;
        result[resultKey] = resultValue;
      }
      structIdx += 1;
      if (structIdx >= struct[1].length) {
        break;
      }
    }
    if (Object.keys(result).length === 0) {
      return [null, segIdx, subErrors];
    } else {
      return [result, segIdx, subErrors];
    }
  };

  structurize = function(meta, message, messageType, options) {
    var errors, lastSegIdx, ref, result;
    ref = _structurize(meta, meta.MESSAGES[messageType.join("_")], message, 0), result = ref[0], lastSegIdx = ref[1], errors = ref[2];
    return [result, errors];
  };

  VALID_OPTION_KEYS = ["strict", "symbolicNames"];

  validateOptions = function(options) {
    var errors, k, v;
    errors = [];
    for (k in options) {
      v = options[k];
      if (VALID_OPTION_KEYS.indexOf(k) < 0) {
        errors.push(k);
      }
    }
    if (errors.length > 0) {
      throw new Error("Unknown options key(s): " + (errors.join(', ')));
    }
  };

  parse = function(msg, options) {
    var errors, hl7version, message, messageType, msh, parseErrors, ref, ref1, segments, separators, structErrors;
    if (msg.substr(0, 3) !== "MSH") {
      throw new Error("Message should start with MSH segment");
    }
    if (msg.length < 8) {
      throw new Error("Message is too short (MSH truncated)");
    }
    if (options == null) {
      options = {
        strict: false,
        symbolicNames: true
      };
    }
    validateOptions(options);
    separators = {
      segment: "\r",
      field: msg[3],
      component: msg[4],
      subcomponent: msg[7],
      repetition: msg[5],
      escape: msg[6]
    };
    errors = [];
    segments = msg.split(separators.segment).map(function(s) {
      return s.trim();
    });
    segments = segments.filter(function(s) {
      return s.length > 0;
    });
    msh = segments[0].split(separators.field);
    messageType = msh[8].split(separators.component);
    hl7version = msh[11];
    meta = getMeta(hl7version);
    ref = parseSegments(segments, meta, separators, options), message = ref[0], parseErrors = ref[1];
    ref1 = structurize(meta, message, messageType, options), message = ref1[0], structErrors = ref1[1];
    errors = errors.concat(structErrors).concat(parseErrors);
    if (options.strict && errors.length > 0) {
      throw new Error("Errors during parsing an HL7 message:\n\n" + structErrors.join("\n"));
    }
    return [message, errors];
  };

  parseSegments = function(segments, meta, separators, options) {
    var e, errors, i, len, rawFields, ref, result, s, segment, segmentName;
    result = [];
    errors = [];
    for (i = 0, len = segments.length; i < len; i++) {
      segment = segments[i];
      rawFields = segment.split(separators.field);
      segmentName = rawFields.shift();
      ref = parseFields(rawFields, segmentName, meta, separators, options), s = ref[0], e = ref[1];
      result.push(s);
      errors = errors.concat(e);
    }
    return [result, errors];
  };

  parseFields = function(fields, segmentName, meta, separators, options) {
    var errorMsg, errors, fieldId, fieldIndex, fieldMax, fieldMeta, fieldMin, fieldSymbolicName, fieldValue, fieldValues, i, len, otherFieldMeta, ref, result, segmentMeta, splitRegexp;
    segmentMeta = meta.SEGMENTS[segmentName];
    result = {
      "0": segmentName
    };
    errors = [];
    if (segmentMeta[0] !== "sequence") {
      throw new Error("Bang! Unknown case: " + segmentMeta[0]);
    }
    for (fieldIndex = i = 0, len = fields.length; i < len; fieldIndex = ++i) {
      fieldValue = fields[fieldIndex];
      fieldMeta = segmentMeta[1][fieldIndex];
      if (fieldMeta) {
        fieldId = fieldMeta[0];
        ref = fieldMeta[1], fieldMin = ref[0], fieldMax = ref[1];
        otherFieldMeta = meta.FIELDS[fieldMeta[0]];
        fieldSymbolicName = otherFieldMeta[2];
        if (fieldMin === 1 && (!fieldValue || fieldValue === '')) {
          errorMsg = "Missing value for required field " + fieldId;
          errors.push(errorMsg);
        }
        splitRegexp = new RegExp("(?!\\" + separators.escape + ")" + separators.repetition);
        fieldValues = fieldValue.split(splitRegexp).map(function(v) {
          var e, f, ref1;
          ref1 = parseComponents(v, fieldId, meta, separators, options), f = ref1[0], e = ref1[1];
          errors = errors.concat(e);
          return f;
        });
        if (fieldMax === 1) {
          result[fieldIndex + 1] = fieldValues[0];
        } else if (fieldMax === -1) {
          result[fieldIndex + 1] = fieldValues;
        } else {
          throw new Error("Bang! Unknown case for fieldMax: " + fieldMax);
        }
      } else {
        result[fieldIndex + 1] = fieldValue;
      }
      if (options.symbolicNames && fieldSymbolicName) {
        if (segmentName === 'MSH') {
          result[fieldSymbolicName] = result[fieldIndex];
        } else {
          result[fieldSymbolicName] = result[fieldIndex + 1];
        }
      }
    }
    return [replaceBlanksWithNulls(result), errors];
  };

  parseComponents = function(value, fieldId, meta, separators, options) {
    var errors, fieldMeta, fieldType, result, splitRegexp, typeMeta;
    fieldMeta = meta.FIELDS[fieldId];
    if (fieldMeta[0] !== 'leaf') {
      throw new Error("Bang! Unknown case for fieldMeta[0]: " + fieldMeta[0]);
    }
    fieldType = fieldMeta[1];
    typeMeta = meta.DATATYPES[fieldType];
    errors = [];
    if (typeMeta) {
      splitRegexp = new RegExp("(?!\\" + separators.escape + ")\\" + separators.component);
      fieldMeta = "^";
      result = {
        "0": fieldMeta
      };
      value.split(splitRegexp).forEach(function(c, index) {
        var componentId, componentMax, componentMeta, componentMin, componentValue, errorMsg, ref;
        componentId = typeMeta[1][index][0];
        ref = typeMeta[1][index][1], componentMin = ref[0], componentMax = ref[1];
        componentMeta = meta.DATATYPES[componentId];
        if (componentMeta[0] !== 'leaf') {
          throw new Error("Bang! Unknown case for componentMeta[0]: " + componentMeta[0]);
        }
        if (componentMin === 1 && (!c || c === '')) {
          errorMsg = "Missing value for required component " + componentId;
          errors.push(errorMsg);
        }
        if (componentMax === -1) {
          throw new Error("Bang! Unlimited cardinality for component " + componentId + ", don't know what to do :/");
        }
        if (componentMeta) {
          componentValue = coerce(c, componentMeta[1]);
        } else {
          componentValue = c;
        }
        result[index + 1] = componentValue;
        if (options.symbolicNames) {
          return result[componentMeta[2]] = componentValue;
        }
      });
      return [result, errors];
    } else {
      return [coerce(value, fieldType), []];
    }
  };

  module.exports = {
    grok: parse
  };

}).call(this);