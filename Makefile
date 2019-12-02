SHELL = /bin/bash
.SHELLFLAGS=-o errexit -c
NPM_BIN = $(shell npm bin)

all: clean pack

compile-typescript: install
	$(NPM_BIN)/tsc --build tsconfig.build.json

copy-javascript: build/dist-root/lib
	cd src && find . -name '*.js' -exec \
		install -m 'u=rw,go=r' -D -T '{}' '../build/dist-root/lib/{}' ';'

copy-files: build/dist-root copy-javascript
	cp -a sql public views build/dist-root/

build/dist-root/package.json: FILTER = '\
	. as $$root | \
	.main |= "./lib/server.js" | \
	.types |= "./lib/server.d.ts" | \
	.["uk.ac.cam.lib.cudl.xslt-nailgun"].serverJarsPath |= "./jars" | \
	.scripts.prepack |= $$root.scripts._prepack | \
	del(.scripts._prepack)'
build/dist-root/package.json: package.json build/dist-root
	jq $(FILTER) $< > $@

build/dist-root/README.md: README.md build/dist-root
	cp $< $@

build/dist-root:
	mkdir -p build/dist-root

build/dist-root/lib:
	mkdir -p build/dist-root

build/dist-root/src: build/dist-root
	cp -a src build/dist-root/

ensure-clean-checkout:
# Refuse to build a package with local modifications, as the package may end up
# containing the modifications rather than the committed state.
	@DIRTY_FILES="$$(git status --porcelain)" ; \
	if [ "$$DIRTY_FILES" != "" ]; then \
		echo "Error: git repo has uncommitted changes, refusing to generate package as the contents may not be reproducible:" ; \
		echo "$$DIRTY_FILES" ; \
		exit 1 ; \
	fi

normalise-permissions:
# npm pack includes local file permissions in the .tgz, which can differ between
# local and CI environments, breaking reproducibility.
	find build -type f -exec chmod u=rw,g=r,o=r {} +

build: compile-typescript copy-files build/dist-root \
       build/dist-root/src build/dist-root/package.json build/dist-root/README.md \
       normalise-permissions

lint:
	npm run check

pack: ensure-clean-checkout check build
	cd build && npm pack ./dist-root

install: node_modules

node_modules: package-lock.json package.json
	npm ci

clean:
	rm -rf build

.PHONY: check clean build clean-java clean-build compile-typescript compile-java ensure-clean-checkout normalise-permissions
