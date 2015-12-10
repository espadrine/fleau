# Dev Helper Operations.
# Copyright © Thaddee Tyl. All rights reserved.
# Code covered by the LGPL license.

all: browser-fleau.js

test:
	node test/test-fleau.js

browser-fleau.js: fleau.js
	browserify -r ./fleau.js:fleau > browser-fleau.js

.PHONY: test all
