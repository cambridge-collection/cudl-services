FROM node:12.14.1-alpine3.11

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

# Install a JVM - @lib.cam/xslt-nailgun requires on to run Saxon
RUN apk add --no-cache openjdk8-jre-base

COPY --from=0 /usr/local/lib/node_modules/cudl-services/ /usr/local/lib/node_modules/cudl-services/
RUN ln -s ../lib/node_modules/cudl-services/bin/cudl-services.js /usr/local/bin/cudl-services

USER node
EXPOSE 3000
CMD ["cudl-services"]
