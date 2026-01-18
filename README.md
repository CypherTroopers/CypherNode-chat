# CypherNode-chat
## Quick start

### 1) Clone the repo&install tools

```bash
git clone https://github.com/CypherTroopers/CypherNode-chat.git

cd CypherNode-chat

sudo apt-get update && sudo apt-get install -y nodejs npm && sudo npm install -g n && sudo n stable && sudo apt purge -y nodejs npm && sudo apt autoremove -y && hash -r && sudo npm install -g pm2 && sudo apt-get install -y python3 python3-venv python3-pip

```
### 2) Install Python dependencies
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
### 3) Install Ollama + Qwen
The default AI provider is Ollama with model `qwen2.5:3b`. You can change it in `config.yaml`. 【F:config.yaml†L23-L30】

**Install Ollama (Linux):**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Start Ollama & pull the model:**
```bash
ollama serve
ollama pull qwen2.5:3b
```

> If you want a different model, update `config.yaml`:
### 4) Configure Telegram (optional)

To enable Telegram alerts, set:

```yaml
telegram:
  enabled: true
  bot_token: "<your_bot_token>"
  chat_id: "<your_chat_id>"
```
### 5) Run the server

```bash
pm2 start bash --name chainchat-agent -- -lc "source .venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 9600"
```

Then open: `http://localhost:9600`

