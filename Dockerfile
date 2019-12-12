FROM node:12-alpine

# Install a JVM - @lib.cam/xslt-nailgun requires on to run Saxon
RUN apk add --no-cache openjdk8-jre-base

WORKDIR /code

# First install the dependencies; this layer will be cached and reused unless
# the package files are modified
COPY package.json package-lock.json ./
RUN npm ci

# Then create a separate layer for the files
COPY . ./
