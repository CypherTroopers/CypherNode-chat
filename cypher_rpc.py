from __future__ import annotations

from typing import Any, Dict, Optional
from web3 import Web3

try:
    from web3.providers.ipc import IPCProvider  # type: ignore
except Exception:  # pragma: no cover
    IPCProvider = None  # type: ignore


class CypherRPC:
    def __init__(self, ipc_path: str):
        if IPCProvider is not None:
            self.w3 = Web3(IPCProvider(ipc_path))
        else:
            # fallback for some versions
            self.w3 = Web3(Web3.IPCProvider(ipc_path))  # type: ignore[attr-defined]

    def is_connected(self) -> bool:
        return bool(self.w3.is_connected())

    def block_number(self) -> int:
        return int(self.w3.eth.block_number)

    def get_block_full(self, n: int) -> Dict[str, Any]:
        b = self.w3.eth.get_block(n, full_transactions=True)
        return self._to_jsonable(b)

    def get_tx(self, txhash: str) -> Dict[str, Any]:
        tx = self.w3.eth.get_transaction(txhash)
        return self._to_jsonable(tx)

    def get_balance_cph(self, addr: str) -> float:
        wei = self.w3.eth.get_balance(addr)
        return float(self.w3.from_wei(wei, "ether"))

    def peer_count(self) -> int:
        return int(self.w3.net.peer_count)

    def syncing(self) -> Any:
        return self.w3.eth.syncing

    def txpool_status(self) -> Optional[Dict[str, Any]]:
        try:
            return self._to_jsonable(self.w3.geth.txpool.status())
        except Exception:
            return None

    def miner_status(self) -> Optional[Any]:
        try:
            return self.w3.manager.request_blocking("miner_status", [])
        except Exception:
            return None

    def admin_peers(self) -> Optional[Any]:
        try:
            return self._to_jsonable(self.w3.geth.admin.peers())
        except Exception:
            return None

    @staticmethod
    def _to_jsonable(obj: Any) -> Any:

        # AttributeDict-like
        if hasattr(obj, "items") and callable(getattr(obj, "items")):
            return {k: CypherRPC._to_jsonable(v) for k, v in obj.items()}

        # list/tuple
        if isinstance(obj, (list, tuple)):
            return [CypherRPC._to_jsonable(v) for v in obj]

        # bytes / HexBytes
        if isinstance(obj, (bytes, bytearray)):
            return "0x" + bytes(obj).hex()

        # int/str/bool/None/float etc.
        return obj
