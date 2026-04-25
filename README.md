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

---

## Prerequisites

**Remote host**
- Docker ≥ 24 and Docker Compose v2
- NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed  
  *(remove the `deploy` block from `docker-compose.yaml` if no GPU is available)*

**Laptop**
- [opencode CLI](https://opencode.ai) installed (`npm i -g opencode-ai` or see the [install docs](https://opencode.ai/docs))

---

## Quick Start

### 1 — Clone the repo on the remote host

```bash
git clone https://github.com/marcel-st/opencode-server.git
cd opencode-server
```

### 2 — Set credentials

Create your `.env` file from the provided template and set strong, unique credentials:

```bash
cp .env.example .env
```

Then open `.env` in your editor and replace the placeholder values:

```dotenv
OPENCODE_SERVER_USERNAME=opencode   # ← change me
OPENCODE_SERVER_PASSWORD=changeme   # ← change me (use a strong password!)
```

> **Note:** `.env` is listed in `.gitignore` and will never be committed to version control.

### 3 — Choose a model

Pull a model suitable for coding. `qwen2.5-coder:7b` is a good default for
machines with ≥8 GB VRAM; larger variants perform better on more powerful GPUs.

```bash
# Start only ollama first so you can pull models before the full stack starts
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

Update `OPENCODE_DEFAULT_MODEL` in `docker-compose.yaml` and `model` in
`config/opencode.json` to match the tag you pulled, e.g.
`ollama/qwen2.5-coder:7b`.

Popular coding models available on [ollama.com/library](https://ollama.com/library):

| Model | VRAM | Notes |
|-------|------|-------|
| `qwen2.5-coder:7b` | ~8 GB | Balanced quality / speed |
| `qwen2.5-coder:14b` | ~16 GB | Better quality |
| `codellama:13b` | ~16 GB | Good code completion |
| `deepseek-coder-v2:16b` | ~20 GB | Strong reasoning |

### 4 — Start the full stack

```bash
docker compose up -d
```

Services and their default ports:

| Service | Port | Binding | Notes |
|---------|------|---------|-------|
| opencode server | `4096` | `0.0.0.0` | Authenticated via basic-auth |
| open-webui | `3000` | `127.0.0.1` | Access via SSH tunnel (see below) |
| ollama API | *(internal)* | Docker network only | Not published to the host |

### 5 — Connect from your laptop

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

### 6 — Access Open WebUI (optional)

Open WebUI is bound to `127.0.0.1` on the remote host for security. To open
it in your local browser, forward the port over SSH:

```bash
ssh -L 3000:localhost:3000 user@<remote-host>
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser and
create an admin account on first visit.

---

## Configuration

### Credentials

Credentials are read from the `.env` file (see `.env.example`). Copy the
example file and set `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`
before starting the stack. If `OPENCODE_SERVER_PASSWORD` is not set the server
starts **without authentication** (a warning is printed to the logs).

### Provider / model

`config/opencode.json` configures the opencode server. The relevant fields are:

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

```bash
# View live logs
docker compose logs -f

# List models pulled into ollama
docker compose exec ollama ollama list

# Pull an additional model
docker compose exec ollama ollama pull <model>

# Restart the opencode server (e.g. after a config change)
docker compose restart opencode

# Stop everything
docker compose down

# Stop and delete all persistent data (DESTRUCTIVE)
docker compose down -v
```

---

## Security Notes

- **Credentials** are stored in `.env` (gitignored). Never commit `.env` to version control.
  Use a strong, unique password for `OPENCODE_SERVER_PASSWORD`.
- **Ollama API** (port `11434`) is deliberately not published to the host — it is
  reachable only by other containers on the internal Docker network.
- **Open WebUI** (port `3000`) is bound to `127.0.0.1` and only accessible via an
  SSH tunnel or a TLS reverse proxy. Create an admin account on first visit.
- **opencode** runs as a non-root user inside its container, limiting the blast radius
  of any potential compromise.
- The **opencode port** (`4096`) should still be protected by a firewall or VPN if
  you do not want it exposed to the internet.
- For production deployments, put the opencode server behind a reverse proxy with TLS
  (e.g. nginx + Let's Encrypt / Caddy) to encrypt traffic.

