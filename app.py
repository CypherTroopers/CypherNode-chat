import asyncio
import os
import re
import time
import yaml
import shutil
import subprocess
from typing import Any, Dict, Optional, List, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

import psutil
from web3 import Web3

from cypher_rpc import CypherRPC
from storage import load_json, add_watch_address, remove_watch_address
from telegram_notify import TelegramNotifier
from watchers import wallet_watch_loop, pm2_log_watch_loop
from llm import OllamaLLM
from peer_geo import peer_geo_loop

CONFIG_PATH = "config.yaml"
WATCHLIST_PATH = "watchlist.json"
STATE_PATH = "state.json"

# ====== file read policy ======
CYPHER_REPO_BASE = "/root/go/src/github.com/cypherium/cypher"
DENY_PATTERNS = ["keystore", "nodekey", ".env", "secret", "private", "mnemonic", "jwt", "token"]

ALLOW_EXTS = {
    ".json", ".yaml", ".yml", ".toml", ".ini", ".conf",
    ".sh", ".service", ".md", ".txt",
    ".go",
}

MAX_CHARS_PER_FILE = 8000
MAX_FILES_PER_ASK = 40
SCAN_TIME_BUDGET_SEC = 1.5

_FILE_CACHE: Dict[str, Any] = {
    "ts": 0.0,
    "items": []
}
CACHE_TTL_SEC = 60.0

TX_HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
ADDR_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

app = FastAPI()
app.mount("/static", StaticFiles(directory="web"), name="web")

_cfg: Dict[str, Any] = {}
_rpc: Optional[CypherRPC] = None
_notifier: Optional[TelegramNotifier] = None
_llm: Optional[OllamaLLM] = None
_peer_geo_path: str = "peer_geo.json"


# ====== New: make tool result JSON-serializable ======
def _to_jsonable(obj: Any) -> Any:

    if obj is None:
        return None

    # primitive
    if isinstance(obj, (str, int, float, bool)):
        return obj

    # bytes / HexBytes
    if isinstance(obj, (bytes, bytearray)):
        return "0x" + bytes(obj).hex()

    if hasattr(obj, "hex") and callable(getattr(obj, "hex")):
        try:
            hx = obj.hex()
            if isinstance(hx, str):
                return hx if hx.startswith("0x") else "0x" + hx
        except Exception:
            pass

    # mapping-like
    if hasattr(obj, "items") and callable(getattr(obj, "items")):
        try:
            return {str(k): _to_jsonable(v) for k, v in obj.items()}
        except Exception:
            pass

    # list/tuple/set
    if isinstance(obj, (list, tuple, set)):
        return [_to_jsonable(x) for x in obj]

    # fallback: repr
    return repr(obj)


def _is_denied(path: str) -> bool:
    lp = path.lower()
    return any(p in lp for p in DENY_PATTERNS)


def _read_file_preview(path: str) -> str:
    try:
        with open(path, "rb") as bf:
            raw = bf.read(4096)
            if b"\x00" in raw:
                return ""
    except Exception:
        return ""

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read(MAX_CHARS_PER_FILE)
    except Exception:
        return ""


def _scan_repo_files() -> List[Tuple[str, float, str]]:
    start = time.time()
    items: List[Tuple[str, float, str]] = []
    count = 0

    for root, _, files in os.walk(CYPHER_REPO_BASE):
        if _is_denied(root):
            continue

        for fn in files:
            path = os.path.join(root, fn)
            if _is_denied(path):
                continue

            ext = os.path.splitext(fn)[1].lower()
            if ext not in ALLOW_EXTS and fn not in ("Makefile", "Dockerfile", "README", "README.md"):
                continue

            try:
                st = os.stat(path)
            except Exception:
                continue

            preview = _read_file_preview(path)
            if preview:
                short = path.replace(CYPHER_REPO_BASE, ".")
                items.append((short, st.st_mtime, preview))
                count += 1

            if count >= MAX_FILES_PER_ASK:
                return items
            if (time.time() - start) > SCAN_TIME_BUDGET_SEC:
                return items

    return items


def _get_repo_context() -> Dict[str, Any]:
    now = time.time()
    if (now - float(_FILE_CACHE["ts"])) < CACHE_TTL_SEC and _FILE_CACHE["items"]:
        items = _FILE_CACHE["items"]
    else:
        items = _scan_repo_files()
        _FILE_CACHE["ts"] = now
        _FILE_CACHE["items"] = items

    paths = [p for (p, _, _) in items]
    previews = {p: c[:1500] for (p, _, c) in items}
    return {"paths": paths, "previews": previews}


def _get_gpu_percent() -> Optional[float]:
    if not shutil.which("nvidia-smi"):
        return None

    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            text=True,
            timeout=1.5,
        )
        line = output.strip().splitlines()[0]
        return float(line)
    except Exception:
        return None


def _get_cpu_percent() -> float:
    return float(psutil.cpu_percent(interval=None))


async def _tool_status() -> Dict[str, Any]:
    assert _rpc is not None
    if not _rpc.is_connected():
        return {"connected": False}

    return {
        "connected": True,
        "block_number": _rpc.block_number(),
        "peer_count": _rpc.peer_count(),
        "syncing": _rpc.syncing(),
        "txpool": _rpc.txpool_status(),
        "mining_status": _rpc.miner_status(),
        "hashrate": _rpc.hashrate(),
    }


def _tool_tx(txhash: str) -> Dict[str, Any]:
    assert _rpc is not None
    tx = _rpc.get_tx(txhash)
    h = tx.get("hash")
    if hasattr(h, "hex"):
        tx["hash"] = h.hex() if str(h.hex()).startswith("0x") else "0x" + h.hex()
    return {"type": "tx", "tx": tx}


def _tool_address(addr: str) -> Dict[str, Any]:
    assert _rpc is not None
    try:
        checksum_addr = Web3.to_checksum_address(addr)
    except Exception as e:
        return {
            "type": "address",
            "error": f"invalid address: {e}",
            "address": addr,
        }

    bal = _rpc.get_balance_cph(checksum_addr)
    return {
        "type": "address",
        "address": checksum_addr,
        "balance_cph": bal,
    }


def _route(q: str) -> Dict[str, Any]:
    s = q.strip()

    if TX_HASH_RE.match(s):
        return {"route": "tx", "arg": s}

    if ADDR_RE.match(s):
        return {"route": "address", "arg": s}

    ql = s.lower()
    if any(k in ql for k in ["status", "peer", "sync", "block", "txpool", "ipc", "node", "genesis"]):
        return {"route": "status", "arg": None}

    return {"route": "question", "arg": s}


@app.on_event("startup")
async def startup():
    global _cfg, _rpc, _notifier, _llm, _peer_geo_path
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _cfg = yaml.safe_load(f)

    _rpc = CypherRPC(_cfg["cypher"]["ipc_path"])

    tg = _cfg["telegram"]
    _notifier = TelegramNotifier(
        bot_token=tg["bot_token"],
        chat_id=str(tg["chat_id"]),
        enabled=bool(tg.get("enabled", True)),
    )

    ai = _cfg["ai"]
    if ai.get("provider") == "ollama":
        _llm = OllamaLLM(
            base_url=ai["ollama_base_url"],
            model=ai["model"],
            system_prompt=ai["system_prompt"],
        )

    asyncio.create_task(wallet_watch_loop(_cfg, _rpc, _notifier, WATCHLIST_PATH, STATE_PATH))
    asyncio.create_task(pm2_log_watch_loop(_cfg, _notifier))
    _peer_geo_path = _cfg.get("peer_geo", {}).get("output_path", "peer_geo.json")
    asyncio.create_task(peer_geo_loop(_cfg, _rpc))


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("web/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/mining-power", response_class=HTMLResponse)
async def mining_power():
    with open("web/mining.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api/watchlist")
async def get_watchlist():
    return load_json(WATCHLIST_PATH, {"addresses": []})


@app.post("/api/watchlist/add")
async def watch_add(payload: Dict[str, Any]):
    addr = payload.get("address", "")
    if not isinstance(addr, str) or not addr.startswith("0x") or len(addr) < 10:
        raise HTTPException(400, "invalid address")
    addrs = add_watch_address(WATCHLIST_PATH, addr)
    return {"addresses": addrs}


@app.post("/api/watchlist/del")
async def watch_del(payload: Dict[str, Any]):
    addr = payload.get("address", "")
    if not isinstance(addr, str):
        raise HTTPException(400, "invalid address")
    addrs = remove_watch_address(WATCHLIST_PATH, addr)
    return {"addresses": addrs}


@app.get("/api/status")
async def status():
    return _to_jsonable(await _tool_status())


@app.get("/api/peer-geo")
async def peer_geo():
    return load_json(
        _peer_geo_path,
        {"updated_at": None, "ip_count": 0, "peers": [], "provider": "ip-api.com/batch"},
    )


@app.get("/api/mining-power")
async def mining_power_status():
    cpu_percent = _get_cpu_percent()
    gpu_percent = _get_gpu_percent()
    mode = "GPU" if gpu_percent is not None else "CPU"
    percent = gpu_percent if gpu_percent is not None else cpu_percent
    return {
        "cpu_percent": cpu_percent,
        "gpu_percent": gpu_percent,
        "mode": mode,
        "percent": percent,
        "timestamp": time.time(),
    }


@app.post("/api/ask")
async def ask(payload: Dict[str, Any]):

    q = payload.get("q", "")
    if not isinstance(q, str) or not q.strip():
        raise HTTPException(400, "empty question")

    assert _rpc is not None

    r = _route(q)
    route = r["route"]
    arg = r["arg"]

    tool: Dict[str, Any] = {"route": route}

    if route == "tx":
        tool["result"] = _tool_tx(arg)
    elif route == "address":
        tool["result"] = _tool_address(arg)
    elif route == "status":
        tool["result"] = await _tool_status()
        tool["repo"] = _get_repo_context()
    else:
        tool["status"] = await _tool_status()
        tool["repo"] = _get_repo_context()
        tool["question"] = arg

    tool_jsonable = _to_jsonable(tool)

    if _llm is None:
        return {"answer": "AI is disabled. Returning tool output.", "tool": tool_jsonable}

    ans = _llm.chat(q, tool_result=tool_jsonable)
    return {"answer": ans, "tool": tool_jsonable}
