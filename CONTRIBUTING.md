# Contributing

Thanks for your interest in improving this project.

## Before You Start

- Read README.md for architecture, setup, and operational details.
- Use a remote Docker context (`docker context use <name>`) when testing, as
  this project is designed for local CLI plus remote Docker daemon workflows.
- Keep secrets out of version control. Never commit `.env`.

## Development Workflow

1. Fork the repository and create a feature branch.
2. Make focused changes with clear commit messages.
3. Validate locally:
   - `docker compose build opencode`
   - `docker compose up -d`
   - `docker compose ps`
4. Update docs when behavior, defaults, or commands change.
5. Open a pull request with context, testing notes, and risks.

## Pull Request Checklist

- [ ] Change is scoped and explained
- [ ] Related docs updated (README and/or community docs)
- [ ] No secrets or credentials committed
- [ ] Compose build/start path validated
- [ ] Backward-compatibility impact noted

## Commit Message Guidance

Use imperative mood and keep the first line short.

Examples:
- `docs: clarify remote docker context setup`
- `fix: include config file in docker build context`

## Reporting Issues

Use the issue templates for bug reports and feature requests.
For security-sensitive reports, do not open a public issue. Follow SECURITY.md.
