# This Dockerfile is used to run the Makefile on the project. It needs to:
# - install NPM dependencies
# - build the project's package
# - build the project's docker image (the main Dockerfile in this dir)
FROM node:12.14.1-stretch

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

# Install jq and docker-ce-cli.
RUN apt-get update && \
  apt-get install -y \
      jq \
      apt-transport-https \
      ca-certificates \
      curl \
      gnupg2 \
      software-properties-common && \
  curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add - && \
  add-apt-repository \
     "deb [arch=amd64] https://download.docker.com/linux/debian \
     $(lsb_release -cs) \
     stable" && \
  apt-get update && \
  apt-get install -y docker-ce-cli

CMD ["/bin/bash"]
WORKDIR /code
COPY . ./
