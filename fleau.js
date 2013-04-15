// Fleau Templating Language.
// Copyright © Thaddee Tyl. All rights reserved.
// Code covered by the LGPL license.

var localeval = require ('localeval');

var options = {
  trigger: '#',  // Can be multiple characters. Can be silly.
};

// True if the text starts with the same characters as in pattern.
function startswith (text, pattern, at) {
  for (var i = 0; i < pattern.length; i++) {
    if (text[at + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

function ControlZone () {
  this.from = 0;        // Index of starting character.
  this.to = 1;          // Index of character beyond the last.
  this.escapes = [];    // List of indices that go by pairs.
}

function TopLevel () {
  this.zone = null;     // List of ControlZone.
  this.escapes = [];    // List of indices that go by pairs.
}

// Return the boundaries of the next content to substitute,
// as a list containing alternatively
// (index of substitution start) and (index of substitution stop + 1).
function toplevel (text) {
  var state = 0;
  var section = new TopLevel ();
  var bracecount = 0;
  var skipTrigger = options.trigger.length;
  for (var i = 0;  i < text.length;  i++) {
    if (state === 0) {
      // Toplevel.
      if (startswith (text, options.trigger, i)) {
        // The trigger matches; we enter a control zone.
        // We are at position i (where the start of the trigger is);
        // we may have a { after the trigger.
        // We must compensate for the i++ that occurs at the end of the loop.
        i += skipTrigger - 1;
        state = 1;
      }
    } else if (state === 1) {
      // Toplevel, had a trigger.
      if (text[i] === '{') {
        if (text[i+1] && text[i+1] === '{') {
          // This is an escape.
          // #{{ needs to be converted to #{.
          section.escapes.push (i - skipTrigger, i + 2);
          i += 1;
          state = 0;
        } else {
          // The control zone starts after this character.
          section.zone = new ControlZone ();
          section.zone.from = i - skipTrigger;
          state = 2;
        }
      }
    } else if (state === 2) {
      // Inside the control zone.
      if (text[i] === '}') {
        if (text[i+1] && text[i+1] == '}') {
          // This is an escape.
          // }} needs to be converted to }.
          section.zone.escapes.push (i, i + 2);
          i += 1;
        } else if (bracecount > 0) {
          // We are in a matched brace.
          bracecount -= 1;
        } else {
          // We leave the control zone.
          section.zone.to = i + 1;
          return section;
        }
      } else if (text[i] === '{') {
        if (text[i+1] && text[i+1] === '{') {
          // This is an escape.
          // {{ needs to be converted to {.
          section.zone.escapes.push (i, i + 2);
          i += 1;
        } else {
          // We are starting a matched brace.
          bracecount += 1;
        }
      }
    }
  }
  return section;
}

// Return a text where all escapes as defined in the toplevel function
// are indeed escaped.
function escapeCurly (text, escapes) {
  var newText = text.slice (0, escapes[0]);
  var cursor = escapes[1];
  for (var i = 0; i < escapes.length; i += 2) {
    var from = escapes[i];
    var to = escapes[i + 1];
    // Which escape do we have here?
    if (to - from === 2) {
      if (text[from] === '{') {
        newText += '{';
      } else if (text[from] === '}') {
        newText += '}';
      }
    } else {
      // This is a #{{ → #{ escape.
      newText += options.trigger + '{';
    }
    newText += text.slice (cursor, escapes[i+2]);
    cursor = to;
  }
  return newText;
}

var whitespace = /[ \t\n\r\v]+/;
function nonEmpty (s) { return s.length > 0; }

// Cuts a control zone into an Array of Strings.
// We have three components: space-separated identifiers and text.
function zoneParser (span) {
  var tokens = [];
  var sep = [];     // Separation indices.
  var section = toplevel (span);   // textual zones.
  while (section.zone !== null) {
    var zone = section.zone;
    // Add tokens before the zone.
    tokens = tokens.concat (span.slice (0, zone.from)
                                .split (whitespace)
                                .filter (nonEmpty));
    // Add the zone.
    tokens.push (span.slice (zone.from + options.trigger.length + 1,
                             zone.to - 1));
    // Prepare for next iteration.
    span = span.slice (zone.to);
    section = toplevel (span);
  }
  tokens = tokens.concat (span.slice (0)
                              .split (whitespace)
                              .filter (nonEmpty));
  return tokens;
}


// Main entry point.
//
// input and output are two streams, one readable, the other writable.

function format (input, output, literal, cb) {
  var text = '';
  input.on ('data', function (data) {
    text += '' + data;   // Converting to UTF-8 string.
  });
  input.on ('end', function template () {
    try {
      formatString (text, function write (text) {
        output.write (text);
      }, literal);
    } catch (e) {
      if (cb) { cb (e); }
    } finally {
      // There are streams you cannot end.
      try {
        output.end ();
      } catch (e) {} finally {
        if (cb) { cb (null); }
      }
    }
  });
};

function formatString (input, write, literal) {
  var section = toplevel (input);
  if (section.zone !== null) {
    var span = input.slice (section.zone.from + options.trigger.length + 1,
                           section.zone.to - 1);
    var params = zoneParser (span);    // Fragment the parameters.
    var macro = params[0];
  }

  // If the macro is invalid, print the zone directly.
  if (!macro) {
    write (escapeCurly (input, section.escapes));
    return;
  }

  write (escapeCurly (input.slice (0, section.zone.from), section.escapes));
  try {   // Call the macro.
    macros[macro] (write, literal, params.slice (1));
  } catch (e) {
    throw Error ('Template error: macro "' + macro + '" didn\'t work.\n' +
                 '"' + e.message + '"' +
                 'Parameters given to macro:', params.slice (1) +
                 'Literal:', literal);
  }
  if (section.zone.to < input.length) {
    formatString (input.slice (section.zone.to), write, literal);
  }
};

// Helper function to parse simple expressions.
// Can throw pretty easily if the template is too complex.
// Also, using variables is a lot faster.
function evValue (literal, strval) {
  try {
    // Special-case faster, single variable access lookups.
    if (/^[a-zA-Z_\$]+$/.test(strval)) {
      return literal[strval];
    } else {
      // Putting literal in the current scope.
      return localeval (strval, literal);
    }
  } catch(e) {
    throw Error ('Template error: literal ' + JSON.stringify (strval) +
                 ' is missing.\n', e);
    return '';
  }
  return strval;
};

var macros = {
  '=': function (write, literal, params) {
    // Displaying a variable.
    var parsedtext = evValue (literal, params[0]);
    var parsercalls = params.slice (1)
                            .filter (function (a) {return a !== 'in';})
                            .map (function (c) {return c.split (whitespace);});
    var parserNames = parsercalls.map (function (el) {return el[0];});
    var parserNamesparams = parsercalls.map(function(el) {return el.slice(1);});
    for (var i = 0; i < parserNames.length; i++) {
      if (parsers[parserNames[i]] === undefined) {
        throw Error ('Template error: parser ' +
                     parserNames[i] + ' is missing.');
      }
      parsedtext = parsers[parserNames[i]] (parsedtext, parserNamesparams[i]);
    }
    write (parsedtext);
  },
  'if': function (write, literal, params) {
    // If / then [ / else ].
    var cindex = 0;   // Index of evaluated condition.
    var result;
    while (true) {
      if (evValue (literal, params[cindex])) {
        // We skip "then", so the result is at index +2.
        result = params[cindex + 2];
        break;
      } else if (params[cindex + 4]) {
        // We skip "else", so the result is at index +4.
        if (params[cindex + 4] === 'if') {
          cindex += 5;
        } else {
          result = params[cindex + 4];
          break;
        }
      }
    }
    formatString (result, write, literal);
  },
  'for': function (write, literal, params) {
    // Iterate through an object / an array / a string.
    var iterIndex = 2;   // We skip the "in".
    var valSymbol = params[0];
    if (valSymbol[valSymbol.length - 1] === ',') {
      // That symbol was actually the key.
      var keySymbol = valSymbol.slice (0, valSymbol.length - 1);
      valSymbol = params[1];
      iterIndex = 3;
    }
    var iter = evValue (literal, params[iterIndex]);
    if (iter === undefined) {
      throw Error ('Template error: literal ' + JSON.stringify (params[0]) +
                   ' is missing.');
    }
    var newliteral = literal;
    for (var i in iter) {
      newliteral[keySymbol] = i;
      newliteral[valSymbol] = iter[i];
      formatString (params[iterIndex + 1], write, literal);
    }
  },
  '#': function () {},  // Comment.
  '!': function (write, literal, params) {
    // Add a macro from inside a template.
    macros[params[0]] = Function ('write','literal','params', params[1]);
  },
};

var parsers = {
  'plain': function (text) { return text; },
  'html': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xml': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xmlattr': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;').replace (/'/g,'&apos;')
               .replace (/"/g,'&quot;');
  },
  'uri': function (text) {
    return encodeURI (text);
  },
  '!uri': function (text) {
    return decodeURI (text);
  },
  'jsonstring': function (text) {
    // FIXME: does someone have an idea on how to handle unicode?
    return text.replace (/\\/g,'\\\\').replace (/"/g,'\\"')
               .replace (/\n/g,'\\n').replace (/\f/g,'\\f')
               .replace (/\r/g,'\\r').replace (/\t/g,'\\t')
               .replace (RegExp('\b','g'),'\\b');
  },
  'json': function (text, indent) {
    return JSON.stringify (text, null, +indent[0]);
  },
  'integer': function (integer) {
    return typeof integer == 'number'? integer.toFixed (0): '';
  },
  'intradix': function (intradix, radix) {
    return typeof intradix == 'number'?
      intradix.toString (parseInt (radix[0])):'';
  },
  'float': function (floating, fractionDigits) {
    return typeof floating == 'number'?
        floating.toFixed (parseInt (fractionDigits[0])): '';
  },
  'exp': function (exp, fractionDigits) {
    return typeof exp == 'number'?
        exp.toExponential (parseInt (fractionDigits[0])): '';
  }
};


// Exportation World!
//

module.exports = format;
exports.options = options;
exports.macros = macros;
exports.parsers = parsers;
exports.formatString = formatString;
exports.eval = evValue;
