"""Live provider smoke test. Fetch only a small audio prefix, never a full song."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import requests
from app.services.providers import PROVIDERS, get_provider


def probe(name, query):
    provider = get_provider(name)
    result = {"provider": name, "query": query, "search_count": 0, "samples": []}
    try:
        items = provider.search(query, limit=5)
        result["search_count"] = len(items)
        for item in items[:2]:
            sample = {"title": item.title, "artist": item.artist}
            result["samples"].append(sample)
            try:
                info = provider.get_play_info(item.id, {**item.extra, "level": "exhigh"})
                sample["resolved_host"] = urlparse(info.url).hostname
                with requests.Session() as session:
                    session.trust_env = False
                    with session.get(info.url, headers={"User-Agent": "Mozilla/5.0", **info.headers, "Range": "bytes=0-4095"}, timeout=12, stream=True) as response:
                        sample["http_status"] = response.status_code
                        sample["content_type"] = response.headers.get("Content-Type", "")
                        response.raise_for_status()
                        data = next(response.iter_content(4096), b"")
                        audio = (data.startswith((b"ID3", b"fLaC", b"OggS", b"RIFF")) or data[4:8] == b"ftyp"
                                 or (len(data) > 1 and data[0] == 255 and data[1] & 0xE0 == 0xE0))
                        sample["audio_verified"] = bool(audio)
                        sample["prefix_hex"] = data[:16].hex()
            except Exception as error:
                sample["error"] = f"{type(error).__name__}: {error}"
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider")
    parser.add_argument("--query", default="晴天")
    parser.add_argument("--output", default="build/provider-probe.json")
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    if args.provider:
        print(json.dumps(probe(args.provider, args.query), ensure_ascii=False))
        return
    def run(name):
        try:
            command = [sys.executable, __file__, "--provider", name, "--query", args.query]
            process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=150,
                                     env={**os.environ, "PYTHONIOENCODING": "utf-8"})
            return json.loads(process.stdout.strip().splitlines()[-1])
        except Exception as error:
            return {"provider": name, "error": str(error)}
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in as_completed([pool.submit(run, name) for name in (args.only or PROVIDERS)]):
            result = future.result()
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
