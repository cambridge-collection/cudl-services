FROM curlimages/curl:7.73.0 as confd

ENV CONFD_URL 'https://github.com/kelseyhightower/confd/releases/download/v0.16.0/confd-0.16.0-linux-amd64'
ENV CONFD_URL_SHA512 '68c93fd6db55c7de94d49f596f2e3ce8b2a5de32940b455d40cb05ce832140ebcc79a266c1820da7c172969c72a6d7367b465f21bb16b53fa966892ee2b682f1'

RUN curl -fLS -o /tmp/confd "$CONFD_URL"
RUN echo "$CONFD_URL_SHA512  /tmp/confd" > /tmp/confd.sha512; sha512sum -c /tmp/confd.sha512
# Need to have root own the file used by subsequent stages to avoid this bug:
# https://github.com/moby/moby/issues/34645
USER root
RUN chown root:root /tmp/confd

FROM node:12.14.1-alpine3.11 as node-modules

# NPM seems to experience network issues when running in a docker build. Its
# requests occasionally hang for long periods of time.

# Set the request timeout to 15 seconds (default should be 30 seconds according
# to docs, but is actually not set, so probably relies on default OS socket
# timeouts, which can be very large).
RUN npm config set timeout 15000

# Retry timed out registry requests: after the initial failed request, retry
# after: 1s, then 10s (3 attempts total: 3 * 15 + 10 + 2 = 56s max).
RUN npm config set fetch-retry-mintimeout 1000 && \
  npm config set fetch-retry-maxtimeout 10000 && \
  npm config set fetch-retry-factor 10 && \
  npm config set fetch-retries 2

ARG CUDL_SERVICES_VERSION
COPY build/cudl-services-${CUDL_SERVICES_VERSION}.tgz /tmp/cudl-services.tgz

RUN npm install -g /tmp/cudl-services.tgz

FROM node:12.14.1-alpine3.11

# Install a JVM - @lib.cam/xslt-nailgun requires it to run Saxon
RUN apk add --no-cache openjdk8-jre-base su-exec

COPY --from=node-modules /usr/local/lib/node_modules/cudl-services/ /usr/local/lib/node_modules/cudl-services/
RUN ln -s ../lib/node_modules/cudl-services/bin/cudl-services.js /usr/local/bin/cudl-services

COPY --from=confd /tmp/confd /usr/local/bin/confd
COPY ./docker/docker-entrypoint.sh /opt/cudl-services/docker-entrypoint.sh
RUN chmod a=rx,u=+w /opt/cudl-services/docker-entrypoint.sh /usr/local/bin/confd
COPY ./docker/confd/ /etc/confd/
COPY ./docker/0_default-settings.json5 /etc/cudl-services/conf.d/0_default-settings.json5

EXPOSE 3000
ENTRYPOINT ["/opt/cudl-services/docker-entrypoint.sh"]
CMD ["cudl-services"]
