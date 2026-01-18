import asyncio
import ipaddress
import json
import os
import time
from typing import Any, Dict, Iterable, List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from cypher_rpc import CypherRPC
from storage import save_json

try:
    import geoip2.database  # type: ignore
except Exception:  # optional dependency
    geoip2 = None  # type: ignore


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


def _lookup_geo(reader: Optional[Any], ip: str) -> Dict[str, Any]:
    if reader is None:
        return _lookup_geo_api(ip)

    try:
        record = reader.city(ip)
    except Exception:
        return {"ip": ip}

    return {
        "ip": ip,
        "country": record.country.name,
        "country_code": record.country.iso_code,
        "region": record.subdivisions.most_specific.name,
        "city": record.city.name,
        "latitude": record.location.latitude,
        "longitude": record.location.longitude,
    }


def _lookup_geo_api(ip: str) -> Dict[str, Any]:
    url = f"https://ipapi.co/{ip}/json/"
    request = Request(url, headers={"User-Agent": "CypherNode/peer-geo"})

    try:
        with urlopen(request, timeout=4) as response:
            if response.status != 200:
                return {"ip": ip}
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, ValueError, TimeoutError):
        return {"ip": ip}

    if not isinstance(payload, dict) or payload.get("error"):
        return {"ip": ip}

    return {
        "ip": ip,
        "country": payload.get("country_name"),
        "country_code": payload.get("country_code"),
        "region": payload.get("region"),
        "city": payload.get("city"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
    }


def _load_geo_reader(db_path: str) -> Optional[Any]:
    if not db_path or not os.path.exists(db_path) or geoip2 is None:
        return None
    try:
        return geoip2.database.Reader(db_path)
    except Exception:
        return None


def _build_peer_geo_payload(
    peers: Any, geo_reader: Optional[Any]
) -> Dict[str, Any]:
    ips = _extract_peer_ips(peers)
    enriched = [_lookup_geo(geo_reader, ip) for ip in ips]

    return {
        "updated_at": time.time(),
        "ip_count": len(ips),
        "peers": enriched,
        "geoip_enabled": geo_reader is not None,
    }


async def peer_geo_loop(cfg: Dict[str, Any], rpc: CypherRPC) -> None:
    settings = cfg.get("peer_geo", {})
    if not settings.get("enabled", True):
        return

    output_path = settings.get("output_path", "peer_geo.json")
    interval = float(settings.get("update_interval_sec", 3600))
    geoip_db_path = settings.get("geoip_db_path", "")

    while True:
        try:
            peers = rpc.admin_peers() or []
            reader = _load_geo_reader(geoip_db_path)

            if reader is None:
                payload = _build_peer_geo_payload(peers, None)
            else:
                with reader:
                    payload = _build_peer_geo_payload(peers, reader)

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
