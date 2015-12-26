require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var indexOf = require('indexof');

var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var defineProp = (function() {
    try {
        Object.defineProperty({}, '_', {});
        return function(obj, name, value) {
            Object.defineProperty(obj, name, {
                writable: true,
                enumerable: false,
                configurable: true,
                value: value
            })
        };
    } catch(e) {
        return function(obj, name, value) {
            obj[name] = value;
        };
    }
}());

var globals = ['Array', 'Boolean', 'Date', 'Error', 'EvalError', 'Function',
'Infinity', 'JSON', 'Math', 'NaN', 'Number', 'Object', 'RangeError',
'ReferenceError', 'RegExp', 'String', 'SyntaxError', 'TypeError', 'URIError',
'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape'];

function Context() {}
Context.prototype = {};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInContext = function (context) {
    if (!(context instanceof Context)) {
        throw new TypeError("needs a 'context' argument.");
    }
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    var wEval = win.eval, wExecScript = win.execScript;

    if (!wEval && wExecScript) {
        // win.eval() magically appears when this is called in IE:
        wExecScript.call(win, 'null');
        wEval = win.eval;
    }
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
    forEach(globals, function (key) {
        if (context[key]) {
            win[key] = context[key];
        }
    });
    
    var winKeys = Object_keys(win);

    var res = wEval.call(win, this.code);
    
    forEach(Object_keys(win), function (key) {
        // Avoid copying circular objects like `top` and `window` by only
        // updating existing context properties or new properties in the `win`
        // that was only introduced after the eval.
        if (key in context || indexOf(winKeys, key) === -1) {
            context[key] = win[key];
        }
    });

    forEach(globals, function (key) {
        if (!(key in context)) {
            defineProp(context, key, win[key]);
        }
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInNewContext = function (context) {
    var ctx = Script.createContext(context);
    var res = this.runInContext(ctx);

    forEach(Object_keys(ctx), function (key) {
        context[key] = ctx[key];
    });

    return res;
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    var copy = new Context();
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};

},{"indexof":2}],2:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],"fleau":[function(require,module,exports){
// Fleau Templating Language.
// Copyright © Thaddee Tyl. All rights reserved.
// Code covered by the LGPL license.

var vm = require ('vm');

function ControlZone () {
  this.from = 0;        // Index of starting character.
  this.to = 1;          // Index of character beyond the last.
  this.escapes = [];    // List of indices that go by 3: (start, end, type).
  // Types: '{{' 0, '}}' 1.
}

function TopLevel () {
  this.zone = null;     // List of ControlZone.
  this.escapes = [];    // List of indices that go by 3: (start, end, type).
  // Types: '{{' 0, '}}' 1.
}

// Return the boundaries of the next content to substitute,
// as a list containing alternatively
// (index of substitution start) and (index of substitution stop + 1).
function toplevel (text) {
  var state = 0;
  var bracecount = 0;
  var section = new TopLevel ();
  for (var i = 0;  i < text.length;  i++) {
    if (state === 0) {
      // Toplevel.
      if (text[i] === '{' && text[i+1] && text[i+1] === '{') {
        if (text[i+2] !== '[') {
          // The trigger matches; we enter a control zone.
          //
          //   outer {{ control zone }} outer
          //         ^-----------------^
          section.zone = new ControlZone ();
          section.zone.from = i;
          state = 1;
          i += 1;     // Counting the for loop, i will be just after the curly.
        } else {
          // This is an escape.
          // {{[ needs to be converted to {{.
          section.escapes.push (i, i + 3, 0);
          i += 2;     // Counting the for loop, i will be just after the [.
        }
      } else if (text[i] === ']' && text[i+1] && text[i+1] === '}'
          && text[i+2] && text[i+2] === '}') {
        // This is an escape.
        // ]}} needs to be converted to }}.
        section.escapes.push (i, i + 3, 1);
        i += 2;     // Counting the for loop, i will be just after the curly.
      }
    } else if (state === 1) {
      // Inside the control zone.
      if (text[i] === '}' && text[i+1] && text[i+1] === '}') {
        if (bracecount > 0) {
          bracecount -= 1;
          i += 1;
        } else {
          // We leave the control zone.
          section.zone.to = i + 2;
          return section;
        }
      } else if (text[i] === ']' && text[i+1] && text[i+1] == '}'
          && text[i+2] && text[i+2] === '}') {
        // This is an escape.
        // ]}} needs to be converted to }}.
        section.zone.escapes.push (i, i + 3, 1);
        i += 2;
      } else if (text[i] === '{' && text[i+1] && text[i+1] == '{') {
        // Opening a subsection.
        if (text[i+2] && text[i+2] !== '[') {
          bracecount += 1;
          i += 1;
        } else {
          // This is an escape.
          // {{[ needs to be converted to {{.
          section.zone.escapes.push (i, i + 3, 0);
          i += 2;
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
  for (var i = 0; i < escapes.length; i += 3) {
    var from = escapes[i];
    var to = escapes[i + 1];
    var type = escapes[i + 2];
    // Which escape do we have here?
    if (type === 0) {   newText += '{{';
    } else {            newText += '}}';
    }
    newText += text.slice (to, escapes[i+3]);
  }
  return newText;
}

var whitespace = /[ \t\n\r\v]+/;
function nonEmpty (s) { return s.length > 0; }

// Cuts a control zone into an Array of Strings.
// We have three components: space-separated identifiers and text.
function zoneParser (span) {
  if (whitespace.test (span[0])) { return ["", span]; }
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
    tokens.push (span.slice (zone.from + 2, zone.to - 2));
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

var format = function(input, output, literal, cb) {
  var text = '';
  input.on ('data', function gatherer (data) {
    text += '' + data;   // Converting to UTF-8 string.
  });
  input.on ('end', function writer () {
    try {
      var write = function(data) { output.write(data); };
      template(text)(write, literal);
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

var template = function(input) {
  var code = 'var $_isidentifier = ' + $_isidentifier.toString() + ';\n' +
    // FIXME: could we remove that eval?
    // By adding the scope as a parameter to this function, yes.
    'eval((' + literaltovar.toString() + ')($_scope));\n';
  code += 'var $_parsers = {\n';
  var parsernames = Object.keys(parsers);
  for (var i = 0; i < parsernames.length; i++) {
    code += '  ' + JSON.stringify(parsernames[i]) + ': ' +
      parsers[parsernames[i]].toString() + ',\n';
  };
  code += '}\n';
  return Function('$_write', '$_scope', '$_end',
      code + compile(input) + '\nif ($_end instanceof Function) {$_end();}');
};

// Like template, with a timeout and sandbox.
var sandboxTemplate = function(input) {
  var code = 'var $_isidentifier = ' + $_isidentifier.toString() + ';\n' +
    // FIXME: could we remove that eval?
    'eval((' + literaltovar.toString() + ')($_scope));\n';
  code += 'var $_parsers = {\n';
  var parsernames = Object.keys(parsers);
  for (var i = 0; i < parsernames.length; i++) {
    code += '  ' + JSON.stringify(parsernames[i]) + ': ' +
      parsers[parsernames[i]].toString() + ',\n';
  };
  code += '}\n';
  code += 'var $_written = "";\n' +
          'var $_write = function(data) { $_written += data; };\n';
  code += compile(input);
  code += '$_written\n';
  return function($_write, $_scope, timeout, cb) {
    var res;
    try {
      res = vm.runInNewContext(code, {$_scope: $_scope},
          {timeout: timeout || 1000});
    } catch(err) {
      console.error(err); $_write('');
      if (cb) { cb(err); }
      return;
    }
    $_write(res);
    if (cb) { cb(null); }
  };
};

// This used to be useful for localeval. It might be useful in the future,
// depending on the sandbox' implementation.
var clearChildren = function() {};

// Takes a string template, returns the code as string of the contents of a
// function that takes `$_write(data)` and `$_scope = {}`, and writes the
// cast, the result of the template filled in with the data from the literal
// (a JSON-serializable object).
var compile = function(input) {
  var code = '';

  var unparsedInput = input;
  var unparsedInputLength;
  var output;

  do {
    var section = toplevel(unparsedInput);
    unparsedInputLength = unparsedInput.length;
    if (section.zone === null) {
      output = unparsedInput;
      code += '$_write('
        + JSON.stringify(escapeCurly(output, section.escapes))
        + ');\n';
      break;
    }
    var span = unparsedInput.slice(section.zone.from + 2, section.zone.to - 2);
    var params = zoneParser(span);    // Fragment the parameters.
    var macro = params[0];

    output = unparsedInput.slice(0, section.zone.from);
    code += '$_write('
      + JSON.stringify(escapeCurly(output, section.escapes))
      + ');\n';

    // If the macro is not present, print the zone directly.
    if (macros[macro] === undefined) {
      output = unparsedInput.slice(section.zone.from, section.zone.to);
      code += '$_write('
        + JSON.stringify(escapeCurly(output, section.escapes))
        + ');\n';
      unparsedInput = unparsedInput.slice(section.zone.to);
      continue;
    }
    // If the macro is empty, this is code.
    if (macro === "") {
      code += params.slice(1).join('') + '\n';
      unparsedInput = unparsedInput.slice(section.zone.to);
      continue;
    }

    // Call the macro.
    var errmsg = JSON.stringify([
      'Template error: macro "MACRO" didn\'t work.',
      'Parameters: PARAMS',
      'Literal: LITERAL',
      'Message: MESSAGE'
    ].join('\n'))
     .replace('MACRO', '" + ' + JSON.stringify(macro) + ' + "')
     .replace('MESSAGE', '" + e.message + "')
     .replace('PARAMS', '" + ' + JSON.stringify(params.slice(1)) + ' + "')
     .replace('LITERAL', '" + JSON.stringify($_scope) + "');
    var macrocode = macros[macro](params.slice(1));
    code += [
      'try {',
      '  ' + macrocode,
      '} catch(e) {',
      '  throw Error (' + errmsg + ');',
      '}'
    ].join('\n');

    unparsedInput = unparsedInput.slice(section.zone.to);
  } while (section.zone.to < unparsedInputLength);

  return code;
};

var literaltovar = function(literal) {
  var code = 'var ';
  var keys = Object.keys(literal);
  for (var i = 0; i < keys.length; i++) {
    if ($_isidentifier(keys[i])) {
      code += keys[i] + ' = $_scope[' + JSON.stringify(keys[i]) + '], ';
    }
  }
  code += 'undefined;';
  return code;
};

var $_isidentifier = function(iden) {
  return /^[$_A-Za-z][$_A-Za-z0-9]*$/.test(iden);
};

var identifierincrement = 0;
var makeidentifier = function(name) {
  return '$_' + name + (identifierincrement++);
};

var macros = {
  '': function(params) {
    return params.join('');
  },
  '=': function(params) {
    // Displaying a variable.
    var parsercalls = params.slice(1)
                            .filter(function(a) {return a !== 'in';})
                            .map(function(c) {return c.split (whitespace);});
    var parsernames = parsercalls.map (function (el) {return el[0];});
    var parserparams = parsercalls.map(function(el) {return el.slice(1);});
    var fmtvar = params[0];
    var fmtparsers = JSON.stringify(parsernames);
    var fmtparams = JSON.stringify(parserparams);
    var parsedtextsym = makeidentifier('parsedtext');
    var parsernamessym = makeidentifier('parsernames');
    var parserparamssym = makeidentifier('parserparams');
    var isym = makeidentifier('i');
    var code = [
      'var ' + parsedtextsym + ' = (' + fmtvar + ');',
      'var ' + parsernamessym + ' = ' + fmtparsers + ';',
      'var ' + parserparamssym + ' = ' + fmtparams + ';',
      'for (var ' + isym + ' = 0; ' + isym + ' < ' + parsernamessym + '.length; ' + isym + '++) {',
      '  if ($_parsers[' + parsernamessym + '[' + isym + ']] === undefined) {',
      '    throw Error("Template error: parser " +',
      '                ' + parsernamessym + '[' + isym + '] + " is missing.");',
      '  }',
      '  ' + parsedtextsym + ' = $_parsers[' + parsernamessym + '[' + isym + ']](' + parsedtextsym + ', ' + parserparamssym + '[' + isym + ']);',
      '}',
      '$_write(""+' + parsedtextsym + ');',
      ''].join('\n');
    return code;
  },
  'if': function (params) {
    // If / then [ / else ].
    var cindex = 0;
    var code = '';

    while (true) {
      var condition = params[cindex];
      var output = params[cindex + 2];  // Skip "then".
      var fmtoutput = compile(output);
      code += [
        'if (' + condition + ') {',
        '  ' + fmtoutput,
        '}',
      ].join('\n');

      if (params[cindex + 3] === 'else') {
        if (params[cindex + 4] === 'if') {
          code += ' else ';
          cindex += 5;
        } else {
          var fmtoutput = compile(params[cindex + 4]);
          code += [
            ' else {',
            '  ' + fmtoutput,
            '}',
          ].join('\n');
          break;
        }
      } else { break; }
    }
    return code;
  },
  'for': function (params) {
    // Iterate through an object / an array / a string.
    // {{for key, value in array {{}} }}
    var iterindex = 2;   // We skip the "in".
    var valuesymbol = params[0];
    if (valuesymbol[valuesymbol.length - 1] === ',') {
      // That symbol was actually the key.
      var keysymbol = valuesymbol.slice(0, valuesymbol.length - 1);
      valuesymbol = params[1];
      iterindex = 3;  // We skip the "in". Again.
    }

    var code = '';
    var fmtiter = params[iterindex];
    var fmtkeysym = keysymbol? keysymbol: makeidentifier('iterablekey');
    var fmtkeysymstr = JSON.stringify(fmtkeysym);
    var fmtvaluesym = valuesymbol;
    var fmtvaluesymstr = JSON.stringify(fmtvaluesym);
    var fmtoutput = compile(params[iterindex + 1]);
    var iterablesym = makeidentifier('iterable');
    code += [
      'var ' + iterablesym + ' = (' + fmtiter + ');',
      'for (var ' + fmtkeysym + ' in ' + iterablesym + ') {',
      '  var ' + fmtvaluesym + ' = ' + iterablesym + '[' + fmtkeysym + '];',
      '  $_scope[' + fmtkeysymstr + '] = ' + fmtkeysym + ';',
      '  $_scope[' + fmtvaluesymstr + '] = ' + fmtvaluesym + ';',
      '  ' + fmtoutput,
      '}',
    ].join('\n');
    return code;
  },
  '#': function () {return '';},  // Comment.
};

var parsers = {
  'plain': function (text) { return ""+text; },
  'html': function (text) {
    return (""+text).replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xml': function (text) {
    return (""+text).replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xmlattr': function (text) {
    return (""+text).replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;').replace (/'/g,'&apos;')
               .replace (/"/g,'&quot;');
  },
  'uri': function (text) {
    // RFC5987-compliant.
    return encodeURIComponent(""+text).replace(/['()]/g, escape)
      .replace(/\*/g, '%2A').replace(/%(?:7C|60|5E)/g, unescape);
  },
  '!uri': function (text) {
    return decodeURIComponent(""+text);
  },
  'jsonstring': function (text) {
    // FIXME: does someone have an idea on how to handle unicode?
    return (""+text).replace (/\\/g,'\\\\').replace (/"/g,'\\"')
      .replace (/\n/g,'\\n').replace (/\f/g,'\\f')
      .replace (/\r/g,'\\r').replace (/\t/g,'\\t')
      .replace (RegExp('\b','g'),'\\b');
  },
  'json': function (json, indent) {
    return JSON.stringify(json, null, +indent[0]);
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
module.exports.macros = macros;
module.exports.parsers = parsers;
module.exports.compile = compile;
module.exports.template = template;
module.exports.sandboxTemplate = sandboxTemplate;
module.exports.clear = clearChildren;

},{"vm":1}]},{},[]);
