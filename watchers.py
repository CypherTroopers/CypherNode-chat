import asyncio
import os
from typing import Dict, Any, List, Optional, Set
import yaml

from storage import load_json, save_json, normalize_addr
from cypher_rpc import CypherRPC
from telegram_notify import TelegramNotifier

def wei_to_cph(wei: int) -> float:
    return wei / 10**18

async def wallet_watch_loop(
    cfg: Dict[str, Any],
    rpc: CypherRPC,
    notifier: TelegramNotifier,
    watchlist_path: str,
    state_path: str,
):
    poll = float(cfg["cypher"]["poll_interval_sec"])
    min_cph = float(cfg["wallet_watch"]["min_cph"])
    notify_in = bool(cfg["wallet_watch"]["notify_incoming"])
    notify_out = bool(cfg["wallet_watch"]["notify_outgoing"])

    state = load_json(state_path, {"last_block": None})
    last_block: Optional[int] = state.get("last_block")

    while True:
        try:
            if not rpc.is_connected():
                await notifier.send("⚠️ Cypher IPC not connected. Retrying...")
                await asyncio.sleep(3)
                continue

            bn = rpc.block_number()
            if last_block is None:
                last_block = bn
                save_json(state_path, {"last_block": last_block})
                await asyncio.sleep(poll)
                continue

            if bn <= last_block:
                await asyncio.sleep(poll)
                continue

            wl = load_json(watchlist_path, {"addresses": []})
            watch: Set[str] = set(normalize_addr(a) for a in wl.get("addresses", []))
            if not watch:
                last_block = bn
                save_json(state_path, {"last_block": last_block})
                await asyncio.sleep(poll)
                continue

            for n in range(last_block + 1, bn + 1):
                b = rpc.get_block_full(n)
                txs: List[Dict[str, Any]] = b.get("transactions", [])
                for tx in txs:
                    frm = (tx.get("from") or "").lower()
                    to = (tx.get("to") or "").lower() if tx.get("to") else ""
                    val_wei = int(tx.get("value", 0))
                    val_cph = wei_to_cph(val_wei)

                    hit_in = notify_in and (to in watch) and (val_cph >= min_cph)
                    hit_out = notify_out and (frm in watch) and (val_cph >= min_cph)
                    if not (hit_in or hit_out):
                        continue

                    direction = "IN" if hit_in else "OUT"
                    txh = tx.get("hash")
                    if hasattr(txh, "hex"):
                        txh = txh.hex()

                    msg = (
                        f"💸 Wallet Tx Alert ({direction})\n"
                        f"Block: {n}\n"
                        f"From: {frm}\n"
                        f"To: {to}\n"
                        f"Value: {val_cph:.6f} CPH (>= {min_cph})\n"
                        f"Tx: {txh}"
                    )
                    await notifier.send(msg)

                last_block = n
                save_json(state_path, {"last_block": last_block})

            await asyncio.sleep(poll)

        except Exception as e:
            await notifier.send(f"⚠️ wallet_watch_loop error: {e}")
            await asyncio.sleep(3)

async def pm2_log_watch_loop(cfg: Dict[str, Any], notifier: TelegramNotifier):
    logs_dir = cfg["pm2"]["logs_dir"]
    app = cfg["pm2"]["app_name"]
    out_path = os.path.join(logs_dir, f"{app}-out.log")
    err_path = os.path.join(logs_dir, f"{app}-error.log")

    keywords = ["FATAL", "fatal", "panic", "ERROR", "Error", "bad block", "consensus", "OOM", "out of memory"]

    async def tail_file(path: str, label: str):
        while not os.path.exists(path):
            await asyncio.sleep(2)

        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            f.seek(0, os.SEEK_END)
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5)
                    continue
                if any(k in line for k in keywords):
                    await notifier.send(f"🧾 PM2 {label} log hit:\n{line.strip()}")

    tasks = []
    if cfg["pm2"].get("watch_out", True):
        tasks.append(asyncio.create_task(tail_file(out_path, "OUT")))
    if cfg["pm2"].get("watch_err", True):
        tasks.append(asyncio.create_task(tail_file(err_path, "ERR")))

    if tasks:
        await asyncio.gather(*tasks)
