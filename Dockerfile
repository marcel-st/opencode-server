FROM node:22-alpine

# Install curl (used by the Docker health check) and create a non-root user
RUN apk add --no-cache curl \
    && addgroup -S opencode \
    && adduser -S -G opencode opencode

# Install opencode-ai globally (pinned for reproducibility) and clean the npm cache
RUN npm install -g opencode-ai@1.14.24 && npm cache clean --force

# Pre-create XDG config and data directories so volume mounts land with correct ownership
RUN mkdir -p /home/opencode/.config/opencode \
             /home/opencode/.local/share/opencode \
    && chown -R opencode:opencode /home/opencode

# Create the workspace directory and transfer ownership to the non-root user
WORKDIR /workspace
RUN chown opencode:opencode /workspace

# Drop root privileges
USER opencode

# Expose the default opencode server port
EXPOSE 4096

# Run opencode in headless server mode, listening on all interfaces
CMD ["opencode", "serve"]
