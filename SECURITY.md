# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch.

## Reporting a Vulnerability

Please do not report security vulnerabilities via public GitHub issues.

Instead, report vulnerabilities through GitHub Security Advisories:

1. Open the repository Security tab.
2. Create a new private vulnerability report.
3. Include a clear description, impact, and reproduction steps.

If GitHub private reporting is unavailable, open an issue titled
`Security: private contact requested` with no sensitive details, and maintainers
will provide a private channel.

## Response Expectations

- Initial triage target: within 5 business days
- Status updates: at least weekly while active
- Coordinated disclosure after a fix is available and users have had time to update

## Deployment Hardening Notes

- Set `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD` in `.env`.
	If the password is unset, the opencode server runs without authentication.
- Keep Open WebUI bound to localhost (`127.0.0.1:3000`) and use SSH tunneling
	or a reverse proxy with TLS for remote access.
- Keep `searxng` and `ollama` unexposed (internal Docker network only).
- Do not commit `.env`, API tokens, or private credentials.
