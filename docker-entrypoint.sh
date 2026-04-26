#!/bin/sh
set -e

# Start the Open WebUI proxy in the background. It injects
# {"features":{"web_search":true}} into every chat completion request so
# Open WebUI performs SearXNG lookups without relying on model tool calls.
node /usr/local/bin/webui-proxy.js &

# Substitute OPENWEBUI_API_KEY into the opencode config at container start so
# the secret is never baked into the image layer.
config_file="/home/opencode/.config/opencode/opencode.json"
template_file="/home/opencode/.config/opencode/opencode.json.template"
envsubst '${OPENWEBUI_API_KEY}' < "$template_file" > "${config_file}.tmp"
mv "${config_file}.tmp" "$config_file"

exec "$@"
