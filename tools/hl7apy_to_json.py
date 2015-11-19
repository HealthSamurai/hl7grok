#!/usr/bin/env python

import imp
import json
import os
from optparse import OptionParser

FILES = {
    "datatypes.py": "DATATYPES",
    "fields.py": "FIELDS",
    "groups.py": "GROUPS",
    "messages.py": "MESSAGES",
    "segments.py": "SEGMENTS",
    "tables.py": "TABLES"
}

def convertToJson(input_path, output_path):
    result = {}

    for fname, cname in FILES.iteritems():
        try:
            module = imp.load_source(fname, input_path + "/" + fname)
            value = getattr(module, cname)
            result[cname] = value
        except:
            result[cname] = None

        print "OK", fname

    f = open(output_path, "w")
    f.write(json.dumps(result, sort_keys=True, indent=2))
    f.close()

if __name__ == '__main__':
    usage = "%prog input_path output_path"
    example = "Example: python hl7apy_to_json.py /home/user/hl7apy/hl7apy/v2_6 /home/user/output_dir/"
    parser = OptionParser(usage=usage, epilog=example)
    (options, args) = parser.parse_args()
    try:
        input_path = args[0]
        output_path = args[1]

        print "Input:", input_path
        print "Output:", output_path
    except IndexError:
        parser.error("Please specify an input and output paths")
    else:
        if not os.path.isdir(input_path) and os.path.isdir(input_path):
            parser.error("Path %s not found." % input_path)

        if not os.path.isdir(output_path) and os.path.isdir(output_path):
            parser.error("Path %s not found." % output_path)

        convertToJson(input_path, output_path)
