var fleau = require ('../fleau');
var Test = require ('./test');
var Stream = require ('stream');



// Helper functions.

var t = new Test ();

function test (template, literal, expected, cb) {
  var input = new Stream (),
      output = new Stream (),
      text = '';

  output.write = function (data) {
    text += '' + data;
  };
  output.end = function () { output.emit('end'); }
  output.on ('end', function () {
    t.eq (text, expected);
    if (cb) cb ();
  });

  fleau (input, output, literal);
  input.emit ('data', template);
  input.emit ('end');
}



// test 1 - 1 level of indentation, escaped {{.

test (
  'There is {{[ much ]]}} {{= a_man in plain}} can do.\n\n' +
  '{{# {dummy braces test} }}' +
  '{{= us in html}} we have many friends: \n' +
  '{{for friend in friends {{there is {{= friend in plain}}, }} }}…',
  {
    'a_man': 'Jan',
    us: 'My friend & I',
    friends: ['Thaddee', 'Serge', 'Marie']
  },
  'There is {{ much ]}} Jan can do.\n\n' +
  'My friend &amp; I we have many friends: \n' +
  'there is Thaddee, there is Serge, there is Marie, …');

test (
  'Try having {{= $_scope["back\\\\slash"] in plain}}.',
  { 'back\\slash': 'a \\' },
  'Try having a \\.');

test (
    'Trying to {{for word in sentence {{{{= word plain}} }} }}',
    {
      sentence: ['complete', 'the', 'sentence.']
    },
    'Trying to complete the sentence. ');

// test 2 - 2 levels of indentation.

test (
  'Your base belongs to {{for me in us {{\n' +
  '- {{for name in me {{{{= name in plain}} }} }};}} }}',
  {
    us: [['John', 'Connor'], ['Paul', 'Irish'], ['Ash', 'Williams']]
  },
  'Your base belongs to \n- John Connor ;\n- Paul Irish ;\n' +
  '- Ash Williams ;');

test (
  'Characters:\n{{for i, guy in protagonists {{' +
  '{{= i in plain}}. {{= guy in plain}}\n}} }}',
  {
    protagonists:['Blondie', 'Angel', 'Tuco']
  },
  'Characters:\n0. Blondie\n1. Angel\n2. Tuco\n');

// compound expressions
test (
  'Thaddee {{if {{apostles.indexOf(thaddee) != -1}} then was else wasn\'t}} ' +
  'an apostle',
  {
    thaddee: 'Thaddaeus',
    apostles:['Simon','Andrew','James','John','Philip','Bartholomew',
              'Matthew','Thomas','James','Simon','Judas','Judas']
  },
  'Thaddee wasn\'t an apostle');

// conditional macro tests.
test (
  '{{if present then {{I am here. Hello! }} }}Anyway, how do you do?',
  { present: true },
 'I am here. Hello! Anyway, how do you do?');

test (
  '{{if present then {{I am here. Hello! }} }}Anyway, how do you do?',
  { present: false },
 'Anyway, how do you do?');

test (
  'I am {{if present then {{here. Hello!}} else out.}} Anyway, how do you do?',
  { present: false },
  'I am out. Anyway, how do you do?');

test (
  'I am {{if here then {{here. Hello!}} else ' +
  'if atWork then {{at work…}} else out.}} Anyway, how do you do?',
  { here: false, atWork: true },
  'I am at work… Anyway, how do you do?');

// comment macro test.
test (
  'There should be{{# nothing!}}…',
  {},
  'There should be…');

// parser tests.
test ('Plain {{= data in plain}}.', {data:'text'}, 'Plain text.');
test ('Escaping {{= data in plain}}', {data:'{{= data in plain}}'},
      'Escaping {{= data in plain}}');
test ('Html {{= data in html}}.', {data:'<text & stuff>'},
      'Html &lt;text &amp; stuff&gt;.');
test ('Xml {{= data in xml}}.', {data:'<text & stuff>'},
      'Xml &lt;text &amp; stuff&gt;.');
test ('XmlAttr {{= data in xmlattr}}.', {data:'<\'text\' & "stuff">'},
      'XmlAttr &lt;&apos;text&apos; &amp; &quot;stuff&quot;&gt;.');
test ('JsonString "{{= data in jsonstring}}"',
      { data:'file "foo\\bar":\tok\nBody:\r\fdel=\b' },
      'JsonString "file \\"foo\\\\bar\\":\\tok\\nBody:\\r\\fdel=\\b"');
test ('Json "{{= data in json}}"',
      { data:{"foo\\bar": "ok\nBody:\r\fdel=\b"} },
      'Json \"{\"foo\\\\bar\":\"ok\\nBody:\\r\\fdel=\\b\"}\"');
test ('Json "{{= data in {{json 2}} }}"',
      { data:{"foo\\bar": "ok\nBody:\r\fdel=\b"} },
      'Json \"{\n  \"foo\\\\bar\": \"ok\\nBody:\\r\\fdel=\\b\"\n}\"');
test ('Uri {{= data in uri}}.', {data:'conversion done'},
      'Uri conversion%20done.');
test ('Non-Uri {{= data in !uri}}.', { data:'conversion%20done' },
      'Non-Uri conversion done.');
test ('Int {{= data in integer}}.', {data:73.6}, 'Int 74.');
test ('Radix {{= data in {{intradix 2}} }}.', {data:2}, 'Radix 10.');
test ('Float {{= data in {{float 2}} }}.', {data:73.6}, 'Float 73.60.');
test ('Exp {{= data in {{exp 2}} }}.', {data:73.6}, 'Exp 7.36e+1.');

test ('http://example.net/{{= data in exp in uri}}', {data:1234},
      'http://example.net/1e%2B3');
test ('Default number {{= data in html}}', {data:7}, 'Default number 7');
test ('It is {{= data in boolean}}', {data: "true"}, 'It is true');

// Added parser test
fleau.parsers['paren'] = function(s) { return '(' + s + ')'; };
test ("It's a trap {{= data in paren}}", {data:'unfortunately'},
      "It's a trap (unfortunately)");

// added macro test.
fleau.macros['join'] = function(params) {
  var list = params[0];
  var sep = params[2];  // Leave a param for `with`
  var code = '$_write($_scope[' + JSON.stringify(list) + ']' +
    '.join(' + JSON.stringify(sep) + '));\n';
  return code;
};

test ("I love {{join kids with {{, }}}}.", {kids:['Jack', 'Hugh', 'Hector']},
      "I love Jack, Hugh, Hector.");

// error test.
test ('Nonint {{= data in integer}}.', {data:'hi'}, 'Nonint .');

// .template()
var f = fleau.template('{{= intro}}, {{= object}}');
var cast = '';
var endHasRun = false;
function write(s) { cast += '' + s; }
function templateEnd() { endHasRun = true; }
f(write, {intro:'hello', object:'world'}, templateEnd);
t.eq (cast, 'hello, world');
t.eq (endHasRun, true);

// passing a function.
function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }
test ('{{= capitalize(data) in plain}}.', {data:'hi',capitalize:capitalize},
    'Hi.');

// … with a sandbox.
var f = fleau.sandboxTemplate('{{= players.length in plain}} players:{{for ' +
  'player in players {{\n- {{= capitalize(player) in plain}}}} }}\n');
var cast = '';
function write(s) { cast += '' + s; }
f(write, {players:['zadig','hector'], capitalize:capitalize})
t.eq (cast, '2 players:\n- Zadig\n- Hector\n');

// … with an event emitter.
var f = fleau.create('{{= players.length in plain}} players:{{for ' +
  'player in players {{\n- {{= capitalize(player) in plain}}}} }}\n');
var cast = '';
var stream = f({players:['zadig','hector'], capitalize:capitalize})
stream.on('data', function(data) { cast += data; });
var eventEmitterTest = new Promise(function(resolve, reject) {
  stream.on('end', function() {
    t.eq (cast, '2 players:\n- Zadig\n- Hector\n');
    resolve();
  });
});

// null literal.
test ('Hi.', null, 'Hi.');

// exit.
eventEmitterTest.then(function() {
  t.tldr ();
  t.exit ();
});
