#!/bin/sh
set -e

# Substitute OPENWEBUI_API_KEY into the opencode config at container start so
# the secret is never baked into the image layer.
config_file="/home/opencode/.config/opencode/opencode.json"
envsubst '${OPENWEBUI_API_KEY}' < "$config_file" > "${config_file}.tmp"
mv "${config_file}.tmp" "$config_file"

exec "$@"
