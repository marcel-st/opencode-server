## Summary

Describe what changed and why.

## Validation

- [ ] `docker compose build opencode`
- [ ] `docker compose up -d`
- [ ] `docker compose ps`
- [ ] Relevant logs checked (`docker compose logs --tail=200 <service>`)
- [ ] If web-search related: validated with `searxng` + `open-webui` running

## Documentation

- [ ] README updated (if behavior/config/commands changed)
- [ ] Community docs updated (if contribution/security/support behavior changed)

## Risk Assessment

- [ ] No secrets committed
- [ ] Backward-compatibility impact noted
- [ ] Operational impact on remote-host deployments considered

## Related Issues

Link issues here (e.g. `Closes #123`).
