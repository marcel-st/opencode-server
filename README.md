# opencode-server

Run a self-hosted [opencode](https://opencode.ai) AI coding server on a
powerful remote machine (e.g. a Linux box with an NVIDIA GPU), and connect
to it from the `opencode` CLI on your laptop.

The stack is:

| Service | Purpose |
|---------|---------|
| **opencode** | Headless opencode server (basic-auth protected) |
| **ollama** | Local LLM runtime with NVIDIA GPU pass-through |
| **open-webui** | Browser UI for chatting with and managing ollama models |
| **searxng** | Private metasearch backend used for internet search in Open WebUI |

> **Architecture note:** `docker compose` is executed from your **local
> laptop**.  The Docker daemon (and therefore all containers) run on the
> **remote server**.  Only the `.env` file and this repository need to exist
> locally — no files are bind-mounted from the remote host's filesystem at
> runtime (the opencode configuration is baked into the Docker image at build
> time).

---

## Prerequisites

**Remote host**
- Docker ≥ 24 with the Docker daemon accessible over SSH or TCP
- NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed  
  *(remove the `deploy` block from `docker-compose.yaml` if no GPU is available)*

**Laptop**
- Docker CLI with Compose v2 (`docker compose`)
- [opencode CLI](https://opencode.ai) installed (`npm i -g opencode-ai` or see the [install docs](https://opencode.ai/docs))
- SSH access to the remote host (recommended transport for the Docker context)

---

## Quick Start

### 1 — Clone the repo on your laptop

```bash
git clone https://github.com/marcel-st/opencode-server.git
cd opencode-server
```

### 2 — Create a Docker context pointing to the remote host

This tells the Docker CLI to send all commands to the remote Docker daemon
instead of the local one.

```bash
# Replace user@<remote-host> with your actual SSH user and hostname/IP
docker context create remote \
  --docker "host=ssh://user@<remote-host>"

# Activate the context for the current shell session
docker context use remote
```

> **Tip:** Add `export DOCKER_CONTEXT=remote` to your shell profile so the
> context is always active, or prefix every `docker` command with
> `DOCKER_CONTEXT=remote docker …` if you want to keep the default context
> unchanged.

### 3 — Set credentials

Create your `.env` file from the provided template and set strong, unique
credentials:

```bash
cp .env.example .env
```

Then open `.env` in your editor and replace the placeholder values:

```dotenv
OPENCODE_SERVER_USERNAME=opencode          # ← change me
OPENCODE_SERVER_PASSWORD='changeme'        # ← change me (use a strong password!)
```

> **Quoting passwords with special characters:** Docker Compose parses `.env`
> values without a shell, but characters such as `$`, `#`, `=`, and `!` can
> still be mis-interpreted (e.g. `$VAR` triggers variable expansion, `#` starts
> an inline comment).  Wrap the password in **single quotes** to prevent any
> interpretation of special characters:
>
> ```dotenv
> OPENCODE_SERVER_PASSWORD='p@$$w0rd#42!'
> ```
>
> Single-quoted values are taken literally — no escaping needed.

> **Note:** `.env` is listed in `.gitignore` and will never be committed to
> version control.  It is read by `docker compose` on your laptop; the
> resolved values are passed as environment variables to the containers on
> the remote host — the file itself never leaves your machine.

### 4 — Choose a model

Edit `config/opencode.json` to set the model you want to use (the default is
`llama3.1:8b`).

Once you have settled on a model, build the image (which bakes the
configuration in) and start the ollama service so you can pull the model
before bringing up the rest of the stack:

```bash
# Build the opencode image on the remote host
docker compose build

# Start only the ollama service (the other services are not started yet)
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.1:8b   # default
```

Popular coding models available on [ollama.com/library](https://ollama.com/library):

| Model | VRAM | Notes |
|-------|------|-------|
| `llama3.1:8b` | ~5 GB | Default — strong general-purpose model |
| `mistral:7b` | ~4 GB | Strong general-purpose model |
| `ministral-3:8b` | ~5 GB | Compact Mistral variant |
| `codellama:7b` | ~4 GB | Coding-focused |
| `qwen2.5-coder:7b` | ~8 GB | Coding-focused |
| `gemma4:e4b` | ~8 GB | Google model |
| `deepseek-coder-v2:16b` | ~20 GB | Strong coding + reasoning |

> **Web search in opencode sessions:** Local Ollama models have inconsistent
> structured tool-calling support when used via the OpenAI-compatible API.
> For reliable web-augmented conversations, use **Open WebUI** — it is
> pre-configured in this stack with SearXNG RAG and works out of the box.

### 5 — Start the full stack

```bash
docker compose up -d
```

Services and their default ports (on the **remote host**):

| Service | Port | Binding | Notes |
|---------|------|---------|-------|
| opencode server | `4096` | `0.0.0.0` | Authenticated via basic-auth |
| open-webui | `3000` | `127.0.0.1` | Access via SSH tunnel (see below) |
| searxng | *(internal)* | Docker network only | Used by Open WebUI for web search |
| ollama API | *(internal)* | Docker network only | Not published to the host |

After startup, confirm all services are healthy/up:

```bash
docker compose ps
```

### 6 — Connect from your laptop

#### Direct connection (no reverse proxy)

```bash
opencode attach http://<username>:<password>@<remote-host>:4096
```

Replace `<username>`, `<password>`, and `<remote-host>` with the values you
set in `.env` and the IP/hostname of the remote machine.

Example:
```bash
opencode attach http://opencode:s3cr3t@192.168.1.100:4096
```

#### Connection through an HTTPS reverse proxy (e.g. Nginx Proxy Manager)

If you front the opencode server with an HTTPS reverse proxy, two things are
required:

**1. Use the `https://` URL — omit the port (443 is the HTTPS default):**

```bash
opencode attach https://<username>:<password>@<your-domain>
```

Example:
```bash
opencode attach https://opencode:s3cr3t@opencode.example.com
```

If URL-embedded credentials are rejected by your proxy/TLS setup, set
credentials through environment variables instead (recommended fallback):

```bash
OPENCODE_SERVER_USERNAME=<username> \
OPENCODE_SERVER_PASSWORD=<password> \
opencode attach https://<your-domain>
```

Example:
```bash
OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=s3cr3t \
opencode attach https://opencode.example.com
```

**2. Configure your proxy for SSE (Server-Sent Events).**

`opencode attach` drives the TUI through a long-lived SSE stream
(`/event`). Nginx buffers responses by default, which breaks this
connection. In **Nginx Proxy Manager**, open the proxy host for opencode,
go to the **Advanced** tab, and add the following to the *Custom Nginx
Configuration* field:

```nginx
proxy_buffering         off;
proxy_cache             off;
proxy_read_timeout      86400s;
proxy_send_timeout      86400s;
proxy_set_header        Connection '';
proxy_http_version      1.1;
```

> Also enable the **WebSockets Support** toggle on the Details tab —
> some opencode IDE plugins communicate over WebSockets in addition to SSE.

Once connected, you drive opencode exactly as you would locally — it runs on
the remote host and uses the GPU-backed ollama instance for inference.

### 7 — Access Open WebUI (optional)

Open WebUI is bound to `127.0.0.1` on the **remote host** for security. To
open it in your local browser, forward the port over SSH:

```bash
ssh -L 3000:localhost:3000 user@<remote-host>
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser and
create an admin account on first visit.

---

## Configuration

### Credentials

Credentials are read from the `.env` file on your laptop (see `.env.example`).
Copy the example file and set `OPENCODE_SERVER_USERNAME` and
`OPENCODE_SERVER_PASSWORD` before starting the stack. If
`OPENCODE_SERVER_PASSWORD` is not set the server starts **without
authentication** (a warning is printed to the logs).

### Provider / model

`config/opencode.json` configures the opencode server. The file is copied into
the Docker image at build time, so **rebuild the image after any change**:

```bash
docker compose build opencode
docker compose up -d opencode
```

The relevant fields are:

```jsonc
{
  "provider": {
    "open-webui": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Open WebUI",
      "options": {
        "baseURL": "http://localhost:8090/api",
        "apiKey": "${OPENWEBUI_API_KEY}"
      }
    }
  },
  "model": "open-webui/qwen2.5-coder:7b"
}
```

The `baseURL` points to the local proxy started inside the `opencode`
container. That proxy forwards requests to Open WebUI, enables
`features.web_search`, and filters Open WebUI's UI-only RAG/search stream
events so opencode receives a normal OpenAI-compatible stream.

Set `OPENWEBUI_API_KEY` in `.env` to an API key generated in Open WebUI
(`Settings` -> `Account` -> `API Keys`). You can change `model` to any model
Open WebUI exposes and that you have pulled in ollama.

### Internet search (SearXNG)

**Open WebUI** is the RAG/search layer for both browser chats and opencode
sessions. It is pre-configured to use the internal `searxng` service for RAG
web search out of the box. Browser users can still toggle web search
per-message with the globe icon next to the chat input.

For opencode sessions, the server routes LLM calls through Open WebUI via the
local `webui-proxy.js` process. The proxy injects
`{"features":{"web_search":true}}` into chat completion requests, removes
OpenCode tool schemas from the request, and drops
Open WebUI status/citation/search metadata events from the streamed response.
For prompts that explicitly ask for web/current/latest information, the proxy
also queries the internal SearXNG service directly and appends the top search
results to the latest user message. This makes search grounding deterministic
even when Open WebUI's API-side web-search trigger does not fire for a local
model.

That split is intentional: Open WebUI owns RAG before generation, while this
Open WebUI provider path is treated as non-tool-calling. The proxy also adds a
short guard instruction telling the model not to print tool-call JSON. Local
Ollama models often print JSON-shaped tool calls such as
`{"name":"todowrite","arguments":{...}}` or
`{"name":"websearch","arguments":{...}}` when shown OpenCode tool schemas
through OpenAI-compatible providers. Stripping tool schemas avoids that failure
mode and lets Open WebUI return a normal assistant answer.

This repository still includes local SearXNG-backed `websearch` and `webfetch`
tool definitions for experimentation with models that have reliable structured
tool calling. In the default Open WebUI setup, native websearch is disabled and
the proxy strips all tool schemas before forwarding requests to Open WebUI.

Defaults are configured in `docker-compose.yaml`:

- `ENABLE_RAG_WEB_SEARCH=true`
- `OPENCODE_ENABLE_EXA=false`
- `RAG_WEB_SEARCH_ENGINE=searxng`
- `SEARXNG_QUERY_URL=http://searxng:8080/search?q=<query>&format=json`

You can tune result fan-out in `.env` (see `.env.example`):

- `OPENCODE_VERSION` (default `latest`) controls which `opencode-ai` version is
  installed in the server image
- `OPENWEBUI_API_KEY` must be set to a valid Open WebUI API key for the
  OpenAI-compatible provider path
- `OPENCODE_ENABLE_EXA` (default `false`) keeps native model-level websearch
  disabled so Open WebUI can handle RAG before generation
- `OPENCODE_SEARXNG_URL` (default `http://searxng:8080`) is used by the custom
  `websearch` and `webfetch` tools, and by the Open WebUI proxy for direct
  search-result injection
- `RAG_WEB_SEARCH_RESULT_COUNT` (default `5`)
- `RAG_WEB_SEARCH_CONCURRENT_REQUESTS` (default `10`)

If attached sessions still expose stale web-tool behavior after changing this
configuration, rebuild with the latest opencode release:

```bash
docker compose build --no-cache opencode
docker compose up -d --force-recreate --no-deps opencode
```

The rebuild is required whenever you change `config/opencode.json`,
`config/package.json`, `config/webui-proxy.js`, `docker-entrypoint.sh`, or
files in `config/tools/` because they are baked into the `opencode` image.

Then verify inside the running container:

```bash
docker compose exec opencode sh -lc 'opencode --version; echo OPENCODE_ENABLE_EXA=$OPENCODE_ENABLE_EXA'
docker compose exec opencode sh -lc 'node -e "import(\"@opencode-ai/plugin\").then(()=>console.log(\"plugin ok\"))"'
```

If the server process starts but the web UI shows an empty response and
`opencode attach` fails to connect, run a clean opencode-only recreate and then
check logs:

```bash
docker compose up -d --build --no-deps opencode
docker compose logs --tail=200 opencode
```

### No GPU / CPU-only

Remove the `deploy` block from the `ollama` service in `docker-compose.yaml`:

```yaml
# ollama:
#   deploy:               ← delete these lines
#     resources:
#       reservations:
#         devices:
#           - driver: nvidia
#             count: all
#             capabilities: [gpu]
```

Inference will be slower, but it will work.

---

## Useful Commands

All commands are run from your laptop with the remote Docker context active.

```bash
# View live logs
docker compose logs -f

# Check service status / health
docker compose ps

# List models pulled into ollama
docker compose exec ollama ollama list

# Pull an additional model
docker compose exec ollama ollama pull <model>

# Rebuild the opencode image after a config change
docker compose build opencode
docker compose up -d opencode

# Rebuild/restart web search components after SearXNG config changes
docker compose build searxng
docker compose up -d searxng open-webui

# Restart the opencode server
docker compose restart opencode

# Stop everything
docker compose down

# Stop and delete all persistent data on the remote host (DESTRUCTIVE)
docker compose down -v
```

---

## Troubleshooting

### opencode restart loop with ENOENT for `.opencode`

If logs show an error like `spawnSync .../bin/.opencode ENOENT`, rebuild and
restart the opencode service so the latest Debian-based image is used:

```bash
docker compose build opencode
docker compose up -d --no-deps opencode
docker compose logs --tail=120 opencode
```

### Web search not returning results

Verify `searxng` and `open-webui` are running and inspect logs:

```bash
docker compose ps searxng open-webui
docker compose logs --tail=120 searxng open-webui
```

Some SearXNG engine warnings (for optional engines) are expected and usually
non-fatal as long as the `searxng` container is up.

If the opencode proxy logs `SearXNG request failed: 403 Forbidden`, rebuild
and recreate the `searxng` service. The custom SearXNG image bakes in
`config/searxng/settings.yml`, which enables JSON output via
`search.formats: [html, json]`:

```bash
docker compose build searxng
docker compose up -d --no-deps searxng
```

For opencode sessions, also inspect the `opencode` logs. On startup the proxy
logs its version and SearXNG URL. For search-grounded prompts it should log
`injected N SearXNG results`; if it cannot search, it logs
`SearXNG search failed`:

```bash
docker compose logs --tail=120 opencode
```

### opencode prints JSON-shaped tool calls

Rebuild and restart the `opencode` image so the Open WebUI stream-normalizing
proxy and tool-schema stripping are baked into the container:

```bash
docker compose build opencode
docker compose up -d --no-deps opencode
```

Then confirm `OPENWEBUI_API_KEY` is set in `.env` and
`OPENCODE_ENABLE_EXA=false`. A blank key means opencode can attach to the
server but Open WebUI-backed completions may fail or bypass the intended RAG
path.

### ERR_EMPTY_RESPONSE after rebuilding the opencode container

If you front the opencode server with a reverse proxy configured as a **TCP
stream** (e.g. Nginx Proxy Manager stream host), the proxy caches the backend
container's IP address. When the opencode container is recreated (e.g. after a
`docker compose up -d --build`), it gets a new internal IP and the proxy still
points at the old one, causing `ERR_EMPTY_RESPONSE` in the browser.

Fix: restart the proxy container after rebuilding opencode so it picks up the
new IP.

### Build warning: "Docker Compose requires buildx plugin"

This warning can appear on some hosts using the classic builder path. If image
builds still complete successfully, the stack can run normally. Installing
Docker buildx is still recommended.

---

## Performance Tuning

The following environment variables control the most impactful ollama and Open
WebUI performance knobs.  They are pre-configured with sensible defaults in
`docker-compose.yaml`; the ones marked *(tunable)* can be overridden in your
`.env` file.

### Ollama

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_FLASH_ATTENTION` | `1` | Enables Flash Attention — reduces VRAM usage and speeds up token generation. |
| `OLLAMA_KEEP_ALIVE` | `-1` | Keeps the model loaded in VRAM indefinitely. Set to e.g. `10m` to unload after ten minutes of idle time. |
| `OLLAMA_NUM_PARALLEL` *(tunable)* | `4` | Number of requests processed simultaneously. Each extra slot uses additional VRAM — lower to `1`–`2` on GPUs with less than ~12 GB. |
| `OLLAMA_KV_CACHE_TYPE` | `q8_0` | Quantizes the KV cache to 8-bit, cutting its VRAM footprint by ~50 % with negligible quality loss. Use `q4_0` for even tighter memory budgets. |

The `ollama` service also sets:

- **`shm_size: 512m`** — increases shared memory available to CUDA kernels,
  which can reduce stalls on large batch operations.
- **`ulimits: memlock: -1`** — allows the CUDA runtime to lock GPU memory
  pages, which improves sustained throughput.

### Open WebUI

| Variable | Default | Description |
|---|---|---|
| `AIOHTTP_CLIENT_TIMEOUT` | `300` | HTTP client timeout (seconds) for requests to ollama. Prevents premature timeouts when running larger models. |
| `ENABLE_RAG_WEB_SEARCH` | `true` | Enables Open WebUI's RAG web-search pipeline. opencode requests are routed through Open WebUI and have this feature enabled by the local proxy. |
| `RAG_WEB_SEARCH_ENGINE` | `searxng` | Uses the internal SearXNG container as Open WebUI's search backend. |
| `SEARXNG_QUERY_URL` | `http://searxng:8080/search?q=<query>&format=json` | Internal SearXNG query URL used by Open WebUI. |
| `ENABLE_COMMUNITY_SHARING` | `False` | Disables outbound calls to the Open WebUI community hub, keeping all traffic on the local network. |
| `ENABLE_TELEMETRY` | `false` | Disables telemetry to avoid unnecessary latency on outbound connections. |

### Tips

- **Choose the right model size.** Fitting the model entirely in VRAM is the
  single biggest performance lever — a model that overflows to system RAM can
  be 10–50× slower.  See the model table in [Choose a model](#4--choose-a-model).
- **Increase `OLLAMA_NUM_PARALLEL` only if you have spare VRAM.**  Each slot
  holds an active KV cache in addition to the model weights.
- **Flash Attention (`OLLAMA_FLASH_ATTENTION=1`)** requires a GPU with compute
  capability ≥ 8.0 (Ampere / RTX 30-series or newer).  On older GPUs it is a
  no-op.

---

## Security Notes

- **Credentials** are stored in `.env` on your laptop (gitignored). Never
  commit `.env` to version control. Use a strong, unique password for
  `OPENCODE_SERVER_PASSWORD` and wrap it in **single quotes** to prevent
  special characters (`$`, `#`, `=`, `!`, …) from being mis-parsed by Docker
  Compose (see [Set credentials](#3--set-credentials)).
- **Docker context transport:** Using SSH (`host=ssh://…`) encrypts all Docker
  API traffic between your laptop and the remote host. Avoid exposing the
  Docker daemon TCP port without TLS.
- **Ollama API** (port `11434`) is deliberately not published to the host — it
  is reachable only by other containers on the internal Docker network.
- **Open WebUI** (port `3000`) is bound to `127.0.0.1` on the remote host and
  only accessible via an SSH tunnel or a TLS reverse proxy. Create an admin
  account on first visit.
- **opencode** runs as a non-root user inside its container, limiting the blast
  radius of any potential compromise.
- The **opencode port** (`4096`) should still be protected by a firewall or VPN
  if you do not want it exposed to the internet.
- For production deployments, put the opencode server behind a reverse proxy
  with TLS (e.g. nginx + Let's Encrypt / Caddy) to encrypt traffic.

---

## Community and Governance

This repository includes the standard GitHub community health documents:

- **License:** [LICENSE](LICENSE)
- **Code of Conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Contributing Guide:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security Policy:** [SECURITY.md](SECURITY.md)
- **Support:** [SUPPORT.md](SUPPORT.md)

GitHub templates and ownership metadata:

- **Issue templates:** `.github/ISSUE_TEMPLATE/`
- **Pull request template:** `.github/pull_request_template.md`
- **Code owners:** `.github/CODEOWNERS`
