import json
import base58
from pathlib import Path

def convert(path):
    with open(path) as f:
        data = json.load(f)
        return base58.b58encode(bytes(data)).decode()

p = f"path/to/agent_wallet.json"
print(f"AGENT_SECRET={convert(p)}")
