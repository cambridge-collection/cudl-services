#!/usr/bin/env sh
# Generate a config file under /etc/cudl-services from environment variables
confd -onetime -backend env || { echo "Error: Templating config files with environment variables failed" >&2 && exit 1; }

export NODE_CONFIG_MODULE=${NODE_CONFIG_MODULE:-cudl-services/lib/cudl-config}

# Execute the app as the node user
exec su-exec node "$@"
