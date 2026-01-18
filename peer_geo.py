import asyncio
import ipaddress
import json
import time
from typing import Any, Dict, Iterable, List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from cypher_rpc import CypherRPC
from storage import save_json

IP_API_BATCH_URL = "http://ip-api.com/batch"
IP_API_FIELDS = "status,message,country,countryCode,regionName,city,lat,lon,query"


def _extract_ip(remote_address: Optional[str]) -> Optional[str]:
    if not remote_address or not isinstance(remote_address, str):
        return None

    # IPv6 in [addr]:port
    if remote_address.startswith("[") and "]" in remote_address:
        candidate = remote_address.split("]")[0].lstrip("[")
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            return None

    # Plain IP
    try:
        return str(ipaddress.ip_address(remote_address))
    except ValueError:
        pass

    # IPv4:port
    if ":" in remote_address:
        host, _port = remote_address.rsplit(":", 1)
        try:
            return str(ipaddress.ip_address(host))
        except ValueError:
            return None

    return None


def _unique_sorted(items: Iterable[str]) -> List[str]:
    return sorted({item for item in items if item})


def _extract_peer_ips(peers: Any) -> List[str]:
    if not isinstance(peers, list):
        return []
    ips: List[str] = []
    for peer in peers:
        if not isinstance(peer, dict):
            continue
        network = peer.get("network", {})
        if not isinstance(network, dict):
            continue
        ip = _extract_ip(network.get("remoteAddress"))
        if ip:
            ips.append(ip)
    return _unique_sorted(ips)


def _ip_api_batch(ips: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    ip-api.com batch: POST JSON array
    returns list of results in same order
    """
    if not ips:
        return {}

    payload = [{"query": ip, "fields": IP_API_FIELDS} for ip in ips]
    body = json.dumps(payload).encode("utf-8")

    req = Request(
        IP_API_BATCH_URL,
        data=body,
        headers={
            "User-Agent": "CypherNode/peer-geo",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
    except (URLError, ValueError, TimeoutError):
        return {}

    if not isinstance(data, list):
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        ip = item.get("query")
        if not ip or not isinstance(ip, str):
            continue
        if item.get("status") != "success":
            out[ip] = {"ip": ip}
            continue
        out[ip] = {
            "ip": ip,
            "country": item.get("country"),
            "country_code": item.get("countryCode"),
            "region": item.get("regionName"),
            "city": item.get("city"),
            "latitude": item.get("lat"),
            "longitude": item.get("lon"),
        }
    return out


def _build_peer_geo_payload(peers: Any) -> Dict[str, Any]:
    ips = _extract_peer_ips(peers)

    batch_map = _ip_api_batch(ips)
    enriched = [batch_map.get(ip, {"ip": ip}) for ip in ips]

    return {
        "updated_at": time.time(),
        "ip_count": len(ips),
        "peers": enriched,
        "geoip_enabled": True,
        "provider": "ip-api.com/batch",
    }


async def peer_geo_loop(cfg: Dict[str, Any], rpc: CypherRPC) -> None:
    settings = cfg.get("peer_geo", {})
    if not settings.get("enabled", True):
        return

    output_path = settings.get("output_path", "peer_geo.json")
    interval = float(settings.get("update_interval_sec", 3600))
        while True:
        try:
            peers = rpc.admin_peers() or []
            payload = _build_peer_geo_payload(peers)
            save_json(output_path, payload)

        except Exception as exc:
            save_json(
                output_path,
                {
                    "updated_at": time.time(),
                    "ip_count": 0,
                    "peers": [],
                    "geoip_enabled": False,
                    "error": str(exc),
                },
            )

        await asyncio.sleep(interval)
