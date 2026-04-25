# Support

## Getting Help

- Read README.md first for setup, tuning, and troubleshooting guidance.
- Open a GitHub issue for bugs and feature requests using the provided templates.
- For security issues, follow SECURITY.md and use private reporting.

## What to Include in Support Requests

- Host OS and Docker version (`docker version`)
- Compose version (`docker compose version`)
- Whether Docker runs locally or via remote context
- Relevant service logs (`docker compose logs --tail=200 <service>`)
- Output of `docker compose ps`
- Steps to reproduce and expected behavior

## Scope

This project maintains infrastructure and documentation for running opencode,
ollama, Open WebUI, and SearXNG in a remote-host Docker setup. Application-level
bugs in upstream dependencies may need to be reported to their respective projects.
