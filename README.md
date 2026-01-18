# CypherNode-chat
## Quick start
＊＊This assumes you are in the directory
`/root/go/src/github.com/cypherium/cypher`.

If your directory structure is different, please update the paths below:

* In **app.py**, change the path on line 29:
  `CYPHER_REPO_BASE = "/root/your/path/cypher"`

* In **config.yaml**, change the path on line 6:
  `ipc_path: "/root/your/path/cypher.ipc"`

* The current setup uses a lightweight model that can just barely run on CPU.
If you have AI experience, you can customize it for your environment—switch to a different LLM, build a RAG pipeline to speed up search, or if you have a GPU, add LoRA and train your own LoRA to grow it into an AI that fits your style.
* This tool is strictly for monitoring your own node.
If you plan to make the page publicly accessible, please be mindful of security.

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
sudo systemctl enable --now ollama
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
pm2 start ./.venv/bin/uvicorn \
  --name CypherNode-chat \
  --cwd /root/go/src/github.com/cypherium/cypher/CypherNode-chat \
  --interpreter none \
  -- app:app --host 0.0.0.0 --port 9600
```

Then open: `http://yourIP:9600`
