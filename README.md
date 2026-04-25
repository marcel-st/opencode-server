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

Edit `config/opencode.json` and the `OPENCODE_DEFAULT_MODEL` value in
`docker-compose.yaml` to set the model you want to use (the default is
`qwen2.5-coder:7b`).

Once you have settled on a model, build the image (which bakes the
configuration in) and start the ollama service so you can pull the model
before bringing up the rest of the stack:

```bash
# Build the opencode image on the remote host
docker compose build

# Start only the ollama service (the other services are not started yet)
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

Popular coding models available on [ollama.com/library](https://ollama.com/library):

| Model | VRAM | Notes |
|-------|------|-------|
| `qwen2.5-coder:7b` | ~8 GB | Balanced quality / speed |
| `qwen2.5-coder:14b` | ~16 GB | Better quality |
| `codellama:13b` | ~16 GB | Good code completion |
| `deepseek-coder-v2:16b` | ~20 GB | Strong reasoning |

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

```bash
opencode attach http://<username>:<password>@<remote-host>:4096
```

Replace `<username>`, `<password>`, and `<remote-host>` with the values you
set in `.env` and the IP/hostname of the remote machine.

Example:
```bash
opencode attach http://opencode:s3cr3t@192.168.1.100:4096
```

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
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",   // use the bundled OpenAI-compat SDK
      "options": {
        "name": "ollama",
        "baseURL": "http://ollama:11434/v1" // service name from docker-compose
      }
    }
  },
  "model": "ollama/qwen2.5-coder:7b"        // default model (provider/model-tag)
}
```

The `baseURL` points to the `ollama` service inside the Docker network. You
can change `model` to any tag you have pulled in ollama.

### Internet search (SearXNG)

Open WebUI is pre-configured to use an internal `searxng` service for web
search out of the box. After `docker compose up -d`, internet search is
available in Open WebUI chat when web search is enabled in the UI for a
conversation.

Defaults are configured in `docker-compose.yaml`:

- `ENABLE_RAG_WEB_SEARCH=true`
- `RAG_WEB_SEARCH_ENGINE=searxng`
- `SEARXNG_QUERY_URL=http://searxng:8080/search?q=<query>&format=json`

You can tune result fan-out in `.env` (see `.env.example`):

- `RAG_WEB_SEARCH_RESULT_COUNT` (default `5`)
- `RAG_WEB_SEARCH_CONCURRENT_REQUESTS` (default `10`)

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

# Restart web search components (Open WebUI + SearXNG)
docker compose restart searxng open-webui

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

