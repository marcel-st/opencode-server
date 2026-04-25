FROM node:22-alpine

# Install opencode-ai globally
RUN npm install -g opencode-ai@latest

# Create the workspace directory that opencode operates in
WORKDIR /workspace

# Expose the default opencode server port
EXPOSE 4096

# Run opencode in headless server mode, listening on all interfaces
CMD ["opencode", "serve"]
