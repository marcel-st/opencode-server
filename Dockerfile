FROM node:25-bookworm-slim

# Configure the opencode CLI version at build time. Using latest by default
# avoids older releases that can differ from current tool behavior docs.
ARG OPENCODE_VERSION=latest

# Install curl (used by the Docker health check) and create a non-root user
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gettext-base \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system opencode \
    && useradd --system --gid opencode --create-home --home-dir /home/opencode opencode

# Install opencode-ai globally.
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}" \
    && npm cache clean --force

# Pre-create XDG config and data directories and embed the provider / model
# configuration so no bind-mount from the Docker-host filesystem is required
# (the host running the Docker daemon may be a remote server with no access to
# the local build context at runtime).
RUN mkdir -p /home/opencode/.config/opencode \
             /home/opencode/.local/share/opencode \
    && chown -R opencode:opencode /home/opencode

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY config/webui-proxy.js /usr/local/bin/webui-proxy.js
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY --chown=opencode:opencode config/opencode.json /home/opencode/.config/opencode/opencode.json
COPY --chown=opencode:opencode config/package.json /home/opencode/.config/opencode/package.json
COPY --chown=opencode:opencode config/tools /home/opencode/.config/opencode/tools

# Install tool dependencies next to the tool sources so Node ESM can resolve
# imports like "@opencode-ai/plugin" from /home/opencode/.config/opencode/tools.
RUN npm install --prefix /home/opencode/.config/opencode --omit=dev \
    && chown -R opencode:opencode /home/opencode/.config/opencode

# Create the workspace directory and transfer ownership to the non-root user
WORKDIR /workspace
RUN chown opencode:opencode /workspace

# Drop root privileges
USER opencode

# Expose the default opencode server port
EXPOSE 4096

# Run opencode in headless server mode, listening on all interfaces
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["opencode", "serve"]
