FROM node:14.15.0-alpine3.12 as node-base
FROM node-base as npm-base

# NPM seems to experience network issues when running in a docker build. Its
# requests occasionally hang for long periods of time.

# Retry timed out registry requests: after the initial failed request, retry
# after: 1s, then 10s (3 attempts total: 3 * 15 + 10 + 2 = 56s max).
RUN npm config set fetch-retry-mintimeout 1000 && \
  npm config set fetch-retry-maxtimeout 10000 && \
  npm config set fetch-retry-factor 10 && \
  npm config set fetch-retries 2


FROM npm-base as dev

# Install a JVM - @lib.cam/xslt-nailgun requires on to run Saxon
RUN apk add --no-cache openjdk11-jre

WORKDIR /code

# First install the dependencies; this layer will be cached and reused unless
# the package files are modified
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 3000
USER node

CMD ["npm", "start"]


# This image is used to run the Makefile on the project (from the `built` stage,
# and by docker-compose's `build` service). It needs to:
# - install NPM dependencies
# - build the project's package
# - build the project's docker image (the main Dockerfile in this dir)
FROM npm-base as build

ENV CI true
WORKDIR /code
RUN apk add --no-cache jq curl git make docker-cli bash


# This image builds the project's release .tgz package for use in the
# final main image.
FROM build as built

COPY . ./
# Create the release .tgz package
RUN make pack-release
# Put the release package at a fixed (version-independant) location
RUN mv build/cudl-services-*.tgz build/cudl-services.tgz


# This image contains confd for use in the final main image.
FROM curlimages/curl:7.73.0 as confd

ENV CONFD_URL 'https://github.com/kelseyhightower/confd/releases/download/v0.16.0/confd-0.16.0-linux-amd64'
ENV CONFD_URL_SHA512 '68c93fd6db55c7de94d49f596f2e3ce8b2a5de32940b455d40cb05ce832140ebcc79a266c1820da7c172969c72a6d7367b465f21bb16b53fa966892ee2b682f1'

RUN curl -fLS -o /tmp/confd "$CONFD_URL"
RUN echo "$CONFD_URL_SHA512  /tmp/confd" > /tmp/confd.sha512; sha512sum -c /tmp/confd.sha512
# Need to have root own the file used by subsequent stages to avoid this bug:
# https://github.com/moby/moby/issues/34645
USER root
RUN chown root:root /tmp/confd

# This image contains the installed .tgz package and its dependencies for use in
# the final main image.
FROM npm-base as node-modules

ARG CUDL_SERVICES_VERSION
COPY --from=built /code/build/cudl-services.tgz /tmp/cudl-services.tgz

RUN npm install -g /tmp/cudl-services.tgz


# This is the final image which contains the cudl-services app.
FROM node-base as main

# Install a JVM - @lib.cam/xslt-nailgun requires it to run Saxon
RUN apk add --no-cache openjdk11-jre su-exec tini

COPY --from=node-modules /usr/local/lib/node_modules/cudl-services/ /usr/local/lib/node_modules/cudl-services/
RUN ln -s ../lib/node_modules/cudl-services/bin/cudl-services.js /usr/local/bin/cudl-services

COPY --from=confd /tmp/confd /usr/local/bin/confd
COPY ./docker/docker-entrypoint.sh /opt/cudl-services/docker-entrypoint.sh
RUN chmod a=rx,u=+w /opt/cudl-services/docker-entrypoint.sh /usr/local/bin/confd
COPY ./docker/confd/ /etc/confd/
COPY ./docker/0_default-settings.json5 /etc/cudl-services/conf.d/0_default-settings.json5

EXPOSE 3000
# Run under the tini init process to handle reaping zombie processes (which can
# happen due to JVM processes forked to execute XSLT). Running tini ourselves
# avoids the need to pass --init when running the image.
ENTRYPOINT ["tini", "/opt/cudl-services/docker-entrypoint.sh"]
CMD ["cudl-services"]
