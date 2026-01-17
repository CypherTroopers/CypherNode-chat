import json
import os
from typing import Any, Dict, List

def _atomic_write(path: str, data: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data)
    os.replace(tmp, path)

def load_json(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: str, obj: Any) -> None:
    _atomic_write(path, json.dumps(obj, ensure_ascii=False, indent=2))

def normalize_addr(a: str) -> str:
    a = a.strip()
    if a.startswith("0X"):
        a = "0x" + a[2:]
    return a.lower()

def add_watch_address(watchlist_path: str, addr: str) -> List[str]:
    wl = load_json(watchlist_path, {"addresses": []})
    addr = normalize_addr(addr)
    if addr not in wl["addresses"]:
        wl["addresses"].append(addr)
        save_json(watchlist_path, wl)
    return wl["addresses"]

def remove_watch_address(watchlist_path: str, addr: str) -> List[str]:
    wl = load_json(watchlist_path, {"addresses": []})
    addr = normalize_addr(addr)
    wl["addresses"] = [a for a in wl["addresses"] if a != addr]
    save_json(watchlist_path, wl)
    return wl["addresses"]
