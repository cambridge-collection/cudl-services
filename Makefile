SHELL = /bin/bash
.SHELLFLAGS=-o errexit -c
NPM_BIN = $(shell npm bin)
CUDL_SERVICES_VERSION = $(shell jq -r .version < package.json)
COMMIT_TAG = $(shell git describe --exact-match HEAD 2>/dev/null)
COMMIT_SHORT_HASH = $(shell git rev-parse --short=4 HEAD)
DOCKER_IMAGE_NAME=camdl/cudl-services

# When we're building in a CI environment, always re-install dependencies.
# Otherwise we only do so if the package*.json files are newer than
# node_modules.
ifeq ($(CI), true)
	NPM_CI_TARGET = npm-ci-unconditional
else
	NPM_CI_TARGET = npm-ci-conditional
endif

all: clean pack

compile-typescript: npm-ci
	$(NPM_BIN)/tsc --build tsconfig.build.json

copy-javascript: build/dist-root/lib
	cd src && find . -name '*.js' -exec \
		install -m 'u=rw,go=r' -D -T '{}' '../build/dist-root/lib/{}' ';'

copy-files: build/dist-root copy-javascript
	cp -a sql public transforms build/dist-root/

build/dist-root/package.json: FILTER = '\
	. as $$root | \
	.main |= "./lib/server.js" | \
	.types |= "./lib/server.d.ts" | \
	.["uk.ac.cam.lib.cudl.xslt-nailgun"].serverJarsPath |= "./jars" | \
	.scripts.prepack |= $$root.scripts._prepack | \
	del(.scripts._prepack)'
build/dist-root/package.json: package.json build/dist-root
	jq $(FILTER) $< > $@

build/dist-root/npm-shrinkwrap.json: package-lock.json build/dist-root
	cp $< $@

build/dist-root/README.md: README.md build/dist-root
	cp $< $@

build/dist-root:
	mkdir -p build/dist-root

build/dist-root/lib: build/dist-root
	mkdir -p $@

build/dist-root/bin: build/dist-root
	mkdir -p $@

build/dist-root/bin/cudl-services.js: bin/cudl-services.js build/dist-root/bin
	cp $< $@

build/dist-root/src: build/dist-root
	cp -a src build/dist-root/

ensure-clean-checkout:
# Refuse to build a package with local modifications, as the package may end up
# containing the modifications rather than the committed state.
	@DIRTY_FILES="$$(git status --porcelain)" ; \
	if [ "$$DIRTY_FILES" != "" ]; then \
		echo "Error: git repo has uncommitted changes, refusing to build as the result may not be reproducible" ; \
		echo "$$DIRTY_FILES" ; \
		exit 1 ; \
	fi

normalise-permissions:
# npm pack includes local file permissions in the .tgz, which can differ between
# local and CI environments, breaking reproducibility.
	find build -type f -exec chmod u=rw,g=r,o=r {} +

build: compile-typescript copy-files build/dist-root \
       build/dist-root/src build/dist-root/package.json \
       build/dist-root/npm-shrinkwrap.json build/dist-root/README.md \
       build/dist-root/bin/cudl-services.js normalise-permissions

lint:
	npm run check

pack: check build
	cd build && npm pack ./dist-root

pack-release: ensure-clean-checkout pack

npm-ci: $(NPM_CI_TARGET)

npm-ci-conditional: node_modules

node_modules: package-lock.json package.json
	npm ci

npm-ci-unconditional:
	npm ci

clean:
	rm -rf build

docker-image:
	docker image build \
		$(if $(COMMIT_TAG), --tag "$(DOCKER_IMAGE_NAME):$(COMMIT_TAG)") \
		--tag "$(DOCKER_IMAGE_NAME):$(COMMIT_SHORT_HASH)" \
		--target main \
		.

.PHONY: npm-ci-unconditional check clean build clean-java clean-build compile-typescript compile-java ensure-clean-checkout normalise-permissions
