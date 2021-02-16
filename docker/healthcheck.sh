#!/usr/bin/env sh
PORT="${PORT:-3000}"
# cudl-services is up when the root path returns 404.
# TODO: we could implement a deeper healthcheck, e.g. an actual endpoint on
#  cudl-services to check for database connectivity, etc.
test "$(curl -o /dev/null -s -w "%{http_code}\n" "http://localhost:$PORT/")" == 404
