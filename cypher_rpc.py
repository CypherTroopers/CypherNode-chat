from web3 import Web3
from web3.providers.ipc import IPCProvider
from typing import Any, Dict, Optional

class CypherRPC:
    def __init__(self, ipc_path: str):
        self.w3 = Web3(IPCProvider(ipc_path))

    def is_connected(self) -> bool:
        return bool(self.w3.is_connected())

    def block_number(self) -> int:
        return int(self.w3.eth.block_number)

    def get_block_full(self, n: int) -> Dict[str, Any]:
        b = self.w3.eth.get_block(n, full_transactions=True)
        return dict(b)

    def get_tx(self, txhash: str) -> Dict[str, Any]:
        tx = self.w3.eth.get_transaction(txhash)
        return dict(tx)

    def get_balance_cph(self, addr: str) -> float:
        wei = self.w3.eth.get_balance(addr)
        return float(self.w3.from_wei(wei, "ether"))

    def peer_count(self) -> int:
        # net_peerCount
        return int(self.w3.net.peer_count)

    def syncing(self) -> Any:
        return self.w3.eth.syncing

    def txpool_status(self) -> Optional[Dict[str, Any]]:
        try:
            return self.w3.geth.txpool.status()
        except Exception:
            return None

    def admin_peers(self) -> Optional[Any]:
        try:
            return self.w3.geth.admin.peers()
        except Exception:
            return None
