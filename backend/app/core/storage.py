"""
SwarmCourt IPFS Storage Helper

Uploads debate transcripts to IPFS via Pinata.
Falls back to SHA-256 hash if no Pinata JWT is configured.
"""

import json
import hashlib
import os

PINATA_BASE_URL = "https://pink-official-wildcat-326.mypinata.cloud/ipfs"


def upload_to_ipfs(transcript: dict, pinata_jwt: str = None) -> tuple[str, bool]:
    """
    Upload transcript JSON to IPFS via Pinata.

    Args:
        transcript: The debate transcript dict
        pinata_jwt: Pinata JWT token. If None, reads from PINATA_JWT env var.

    Returns:
        (cid_or_hash, is_real_ipfs) — the CID if uploaded, or SHA-256 hash as fallback
    """
    transcript_json = json.dumps(transcript, indent=2, default=str)
    jwt = pinata_jwt or os.getenv("PINATA_JWT")

    if jwt:
        try:
            import requests
            resp = requests.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={
                    "Authorization": f"Bearer {jwt}",
                    "Content-Type": "application/json",
                },
                json={
                    "pinataContent": transcript,
                    "pinataMetadata": {"name": f"swarmcourt_transcript_{transcript.get('case_id', 'unknown')}"},
                },
                timeout=30,
            )
            resp.raise_for_status()
            cid = resp.json()["IpfsHash"]
            return cid, True
        except Exception as e:
            print(f"IPFS upload failed ({e}), using local hash fallback")

    # Fallback: SHA-256 hash of the transcript
    sha = hashlib.sha256(transcript_json.encode()).hexdigest()
    return sha, False


def get_ipfs_url(cid: str) -> str:
    """Get a viewable IPFS gateway URL."""
    return f"{PINATA_BASE_URL}/{cid}"


async def fetch_ipfs_transcript(cid: str) -> dict | None:
    """Fetch a full transcript from IPFS using its CID."""
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{PINATA_BASE_URL}/{cid}"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        print(f"Error fetching from IPFS: {e}")
    return None
