/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * DS208: Avoid top-level this
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// There will be HL7_META_BASE64 variable after building single JS file

let HL7_META = null;

const META_CACHE = {};
const getMeta = function(hl7version) {
  if (META_CACHE[hl7version]) {
    return META_CACHE[hl7version];
  } else {
    if (HL7_META === null) {
      HL7_META = JSON.parse(LZString.decompressFromBase64(HL7_META_BASE64));
    }

    const meta = HL7_META[`v${hl7version.replace('.', '_')}`];

    if (!meta) {
      throw new Error(`No metainformation for HL7 v ${String(hl7version)}`);
    }

    const parsed = JSON.parse(meta);
    META_CACHE[hl7version] = parsed;
    return parsed;
  }
};

var replaceBlanksWithNulls = function(v) {
  if (Array.isArray(v)) {
    return v.map(b => replaceBlanksWithNulls(b));
  } else if (v instanceof Date) {
    return v;
  } else if (typeof(v) === 'object') {
    const res = {};
    for (let a in v) {
      const b = v[a];
      res[a] = replaceBlanksWithNulls(b);
    }
    return res;
  } else if ((typeof(v) === 'string') && (v.trim().length <= 0)) {
    return null;
  } else {
    return v;
  }
};

const deprefixGroupName = name => name.replace(/^..._.\d\d_/, '');

const coerce = function(value, typeId) {
  if ((typeId === 'TS') || (typeId === 'DT')) {
    const v = typeof value === 'string' ? value : value['1'];

    if (v.match(/^\d{4}/)) {
      const year = v.slice(0, 4);
      const month = v.slice(4, 6);
      const day = v.slice(6, 8);
      const hour = v.slice(8, 10);
      const minute = v.slice(10, 12);
      const second = v.slice(12, 14);

      const timestamp = Date.UTC(year, parseInt(month) - 1, day, hour, minute, second);

      if (isNaN(timestamp)) {
        return value;
      } else {
        return new Date(timestamp);
      }
    } else {
      return value;
    }

  } else {
    return value;
  }
};

var _structurize = function(meta, struct, message, segIdx, options) {
  const structType = struct[0];

  if ((structType !== 'sequence') && (structType !== 'choice')) {
    throw new Error("struct[0] != sequence or choice, don't know what to do :/");
  }

  const result = {};
  let structIdx = 0;
  let subErrors = [];
  let ignoredSegments = [];

  while (true) {
    // Expected segment name and cardinality
    const expSegName = struct[1][structIdx][0];
    const [expSegMin, expSegMax] = Array.from(struct[1][structIdx][1]);

    if ((expSegMin !== 1) && (structType === 'choice')) {
      throw new Error("Expected minimum cardinality is not 1 for choice struct, don't know how to handle");
    }

    // Trying to collect expSegMax occurences of expected segment
    // within loop above. This loop won't collect multiple segments if
    // expSegMax == 1
    const collectedSegments = [];
    let thisSegName = null;

    while (true) {
      // console.log "iterating #{segIdx} #{expSegName}"
      if (segIdx >= message.length) {
        break;
      }

      thisSegName = message[segIdx][0];

      // console.log "Expecting #{expSegName}[#{expSegMin}..#{expSegMax}] at #{segIdx}, seeing #{thisSegName}"

      if ((collectedSegments.length === expSegMax) && (expSegMax === 1)) {
        // we wanted just one segment and we got it
        break;
      }

      // check if expected segment is a group
      if (meta.GROUPS[expSegName]) {
        // if it's a group, we go to recursion
        // console.log "recurse! group name is #{expSegName}"
        const [subResult, newSegIdx, errs, subIgnSgmnts] = Array.from(_structurize(meta, meta.GROUPS[expSegName], message, segIdx, options));
        // console.log "group #{expSegName} ended! recursion result:", subResult

        if (subResult !== null) {
          segIdx = newSegIdx;
          ignoredSegments = ignoredSegments.concat(subIgnSgmnts);
          collectedSegments.push(subResult);
          subErrors = subErrors.concat(errs);
        } else {
          break;
        }
      } else {
        // it's not a group, it's a regular segment
        if (thisSegName === expSegName) {
          collectedSegments.push(message[segIdx]);
          // console.log "got #{collectedSegments.length} #{expSegName} at #{segIdx}"

          segIdx = segIdx + 1;
        } else if ((thisSegName[0] === 'Z') || (options.ignoredSegments && (options.ignoredSegments.indexOf(thisSegName) >= 0))) {
          // console.log "Skipping ignored segment: #{thisSegName}"
          ignoredSegments.push(message[segIdx]);
          segIdx = segIdx + 1;
        } else {
          // no segments with expected name left,
          // we'll figure out if it's an error or not
          // right after this loop
          break;
        }
      }
    }

    // now we have collectedSegments, and we're going to check
    // expected cardinality
    if (collectedSegments.length === 0) { // no collected segments at all
      // if our struct is choice, we just move to next struct element
      // if it's a sequence and segment is required, we fail
      if ((structType === 'sequence') && (expSegMin === 1)) { // expected segment is required
        const error = `Expected segment/group ${expSegName}, got ${thisSegName} at segment #${segIdx}`;
        return [null, segIdx, subErrors.concat([error]), ignoredSegments];
      }
    } else {
      const resultKey = deprefixGroupName(expSegName);

      // if max cardinality = -1 then push collectedSegments as array
      const resultValue = expSegMax === 1 ? collectedSegments[0] : collectedSegments;
      result[resultKey] = resultValue;

      // if struct is a choice, break at the first match
      if (structType === 'choice') {
        break;
      }
    }

    structIdx += 1;

    // if we reached the end of struct then break
    if (structIdx >= struct[1].length) {
      break;
    }
  }

  // if we didn't collected anything, we return null instead of
  // empty object
  if (Object.keys(result).length === 0) {
    return [null, segIdx, subErrors, ignoredSegments];
  } else {
    return [result, segIdx, subErrors, ignoredSegments];
  }
};

const indexSegments = function(segs) {
  const obj = {};

  segs.forEach(function(seg) {
    // Yehal Greka cherez reku
    if (obj[seg['0']]) {
      if (!Array.isArray(obj[seg['0']])) {
        return obj[seg['0']] = [obj[seg['0']], seg];
      } else {
        return obj[seg['0']].push(seg);
      }
    } else {
      return obj[seg['0']] = seg;
    }
  });

  return obj;
};

const structurize = function(parsedMessage, options) {
  if (options == null) { options = {}; }
  const msh = parsedMessage[0];

  let hl7version = options && options.version;

  if (!hl7version) {
    hl7version = typeof(msh[12]) === 'string' ? msh[12] : msh[12][1];
  }

  let messageType = msh[9][1] + "_" + msh[9][2];

  const meta = getMeta(hl7version);

  messageType = (meta.EVENTMAP && meta.EVENTMAP[messageType]) || messageType;

  const struct = meta.MESSAGES[messageType.replace("^", "_")];

  if (!struct) {
    return [parsedMessage, [`No structure defined for message type ${messageType}`]];
  } else {
    const [result, lastSegIdx, errors, ignoredSgmnts] = Array.from(_structurize(meta, struct, parsedMessage, 0, options));

    if (result) {
      result['IGNORED'] = indexSegments(ignoredSgmnts);
    }

    return [result, errors];
  }
};

const VALID_OPTION_KEYS = ["strict", "symbolicNames", "version"];
const validateOptions = function(options) {
  const errors = [];

  for (let k in options) {
    const v = options[k];
    if (VALID_OPTION_KEYS.indexOf(k) < 0) {
      errors.push(k);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Unknown options key(s): ${errors.join(', ')}`);
  }
};

const parse = function(msg, options) {
  let message;
  let errors = [];

  if (msg.substr(0, 3) !== "MSH") {
    errors.push("Message should start with MSH segment");
  }

  if (msg.length < 8) {
    errors.push("Message is too short (MSH truncated)");
  }

  if (options == null) { options = {
    strict: false,
    symbolicNames: true
  }; }

  validateOptions(options);

  if (errors.length === 0) {
    const separators = {
      segment: "\r", // TODO: should be \r
      field: msg[3],
      component: msg[4],
      subcomponent: msg[7],
      repetition: msg[5],
      escape: msg[6]
    };

    let segments = msg.split(separators.segment).map(s => s.trim());
    segments = segments.filter(s => s.length > 0);
    const msh = segments[0].split(separators.field);

    // fix MSH indexes (insert field separator at MSH.1)
    msh.splice(1, 0, separators.field);

    const messageType = msh[9].split(separators.component);
    const hl7version = options.version || msh[12];
    const meta = getMeta(hl7version);

    [message, errors] = Array.from(parseSegments(segments, meta, separators, options));
  }

  if (options.strict && (errors.length > 0)) {
    throw new Error(`Errors during parsing an HL7 message:\n\n${structErrors.join("\n")}`);
  }

  return [message, errors];
};

const parseComponentsNoMeta = function(f, separators) {
  if (f.indexOf(separators.component) >= 0) {
    return [separators.component].concat(f.split(separators.component));
  } else {
    return f;
  }
};

const parseSegmentWithoutMeta = (s, separators) =>
  s.split(separators.field).map(function(f, i) {
    if (f.indexOf(separators.repetition) >= 0) {
      return [separators.repetition].concat(f.split(separators.repetition).map(fr => parseComponentsNoMeta(fr, separators))
      );
    } else {
      if (i !== 0) { return parseComponentsNoMeta(f, separators); } else { return f; }
    }
  })
;

var parseSegments = function(segments, meta, separators, options) {
  const result = [];
  let errors = [];

  for (let segment of Array.from(segments)) {
    if (segment[0] === 'Z') {
      result.push(parseSegmentWithoutMeta(segment, separators));
    } else {
      const rawFields = segment.split(separators.field);

      // Thanks to HL7 committee for such amazing standard!
      if (rawFields[0] === 'MSH') {
        rawFields.splice(1, 0, separators.field);
      }

      const segmentName = rawFields.shift();

      const [s, e] = Array.from(parseFields(rawFields, segmentName, meta, separators, options));
      result.push(s);
      errors = errors.concat(e);
    }
  }

  return [result, errors];
};

var parseFields = function(fields, segmentName, meta, separators, options) {
  const segmentMeta = meta.SEGMENTS[segmentName];
  const result = { "0": segmentName };
  let errors = [];

  if (!segmentMeta && (segmentName[0] !== 'Z')) {
    errors.push(`No segment meta found for segment ${segmentName}`);
  }

  if (segmentMeta && (segmentMeta[0] !== "sequence")) {
    throw new Error(`Bang! Unknown case: ${segmentMeta[0]}`);
  }

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    const fieldValue = fields[fieldIndex];
    const fieldMeta = segmentMeta && segmentMeta[1][fieldIndex];

    if ((segmentName === 'MSH') && (fieldIndex === 1)) {
      result[fieldIndex + 1] = fieldValue;
    } else {
      if (fieldMeta) {
        var fieldId = fieldMeta[0];
        const [fieldMin, fieldMax] = Array.from(fieldMeta[1]);
        const otherFieldMeta = meta.FIELDS[fieldMeta[0]];
        const fieldSymbolicName = otherFieldMeta[2];

        if ((fieldMin === 1) && (!fieldValue || (fieldValue === ''))) {
          const errorMsg = `Missing value for required field ${fieldId}`;
          errors.push(errorMsg);
        }

        const splitRegexp = new RegExp(`(?!\\${separators.escape})${separators.repetition}`);
        const fieldValues = fieldValue.split(splitRegexp).map(function(v) {
          if ((v === null) || (v === "")) {
            return v;
          } else {
            const [f, e] = Array.from(parseComponents(v, fieldId, meta, separators, options));
            errors = errors.concat(e);
            return f;
          }
        });

        if (fieldMax === 1) {
          // result.push fieldValues[0]
          result[fieldIndex + 1] = fieldValues[0];
        } else if (fieldMax === -1) {
          // result.push fieldValues
          if ((fieldValues.length === 1) && (fieldValues[0] === '')) {
            result[fieldIndex + 1] = [];
          } else {
            result[fieldIndex + 1] = fieldValues;
          }
        } else {
          throw new Error(`Bang! Unknown case for fieldMax: ${fieldMax}`);
        }
      } else {
        // result.push fieldValue
        result[fieldIndex + 1] = fieldValue;
      }
    }
  }

   // if options.symbolicNames && fieldSymbolicName
   //   # MSH is always a special case, you know
   //   if segmentName == 'MSH'
   //     result[fieldSymbolicName] = result[fieldIndex]
   //   else
   //     result[fieldSymbolicName] = result[fieldIndex + 1]

  return [replaceBlanksWithNulls(result), errors];
};

var parseComponents = function(value, fieldId, meta, separators, options) {
  let fieldMeta = meta.FIELDS[fieldId];

  if (fieldMeta[0] !== 'leaf') {
    throw new Error(`Bang! Unknown case for fieldMeta[0]: ${fieldMeta[0]}`);
  }

  const fieldType = fieldMeta[1];
  const typeMeta = meta.DATATYPES[fieldType];
  const errors = [];

  if (typeMeta) {
    // it's a complex type
    const splitRegexp = new RegExp(`(?!\\${separators.escape})\\${separators.component}`);
    fieldMeta = "^";
    // result = [fieldMeta]
    const result = {"0": fieldMeta};

    value.split(splitRegexp).forEach(function(c, index) {
      const componentId = typeMeta[1][index] && typeMeta[1][index][0];

      if (componentId) {
        let componentValue;
        const [componentMin, componentMax] = Array.from(typeMeta[1][index][1]);
        const componentMeta = meta.DATATYPES[componentId];

        if (componentMeta[0] !== 'leaf') {
          throw new Error(`Bang! Unknown case for componentMeta[0]: ${componentMeta[0]}`);
        }

        if ((componentMin === 1) && (!c || (c === ''))) {
          const errorMsg = `Missing value for required component ${componentId}`;
          errors.push(errorMsg);
        }

        if (componentMax === -1) {
          throw new Error(`Bang! Unlimited cardinality for component ${componentId}, don't know what to do :/`);
        }

        if (componentMeta) {
          componentValue = coerce(c, componentMeta[1]);
        } else {
          componentValue = c;
        }

        return result[index + 1] = componentValue;
      } else {
        return result[index + 1] = c;
      }
    });

      // result.push componentValue

      // if options.symbolicNames
      //   result[componentMeta[2]] = componentValue

    return [coerce(result, fieldType), errors];
  } else {
    return [coerce(value, fieldType), []];
  }
};

const exports = {
  grok: parse,
  structurize,
  getMeta
};

if (typeof(module) !== 'undefined') {
  module.exports = exports;
} else if (typeof(window) !== 'undefined') {
  window.hl7grok = exports;
} else {
  this.hl7grok = exports;
}
