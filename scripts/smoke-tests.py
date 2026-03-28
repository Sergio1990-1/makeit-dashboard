#!/usr/bin/env python3
"""
Smoke tests for all MakeIT services.
Checks /health and /health/ready endpoints.
Sends Telegram alert on failure.

Usage:
  python3 smoke-tests.py
  TG_TOKEN=... TG_CHAT_ID=... python3 smoke-tests.py
"""

import json
import os
import sys
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Optional

TG_TOKEN = os.environ.get("TG_TOKEN", "")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID", "153715371")
BASE_HOST = os.environ.get("SMOKE_HOST", "89.167.17.79")
TIMEOUT = int(os.environ.get("SMOKE_TIMEOUT", "10"))

@dataclass
class Service:
    name: str
    port: int
    health_path: str = "/health"
    ready_path: Optional[str] = "/health/ready"
    expected_status: int = 200

SERVICES = [
    Service("Sewing-ERP",   8001, ready_path="/health/ready"),
    Service("Uchet_bot",    8002, ready_path="/health/ready"),
    Service("Beer_bot",     8003, ready_path="/health/ready"),
    Service("mankassa-app", 8004, ready_path=None),
    Service("MyMoney",       3010, health_path="/", ready_path=None),
    Service("Business-News", 8000, ready_path=None),
    # moliyakg: не задеплоен на VPS
]

@dataclass
class CheckResult:
    service: str
    check: str
    ok: bool
    status_code: Optional[int] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


def http_get(url: str) -> tuple[int, str, int]:
    """Returns (status_code, body_snippet, duration_ms)."""
    import time
    start = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": "MakeIT-SmokeTest/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            duration_ms = int((time.monotonic() - start) * 1000)
            body = resp.read(500).decode("utf-8", errors="replace")
            return resp.status, body, duration_ms
    except urllib.error.HTTPError as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        return e.code, str(e.reason), duration_ms


def check_service(svc: Service) -> list[CheckResult]:
    results = []

    # Basic health check
    url = f"http://{BASE_HOST}:{svc.port}{svc.health_path}"
    try:
        code, body, ms = http_get(url)
        ok = code == svc.expected_status
        results.append(CheckResult(
            service=svc.name,
            check="health",
            ok=ok,
            status_code=code,
            error=None if ok else f"HTTP {code}",
            duration_ms=ms,
        ))
    except Exception as e:
        results.append(CheckResult(
            service=svc.name,
            check="health",
            ok=False,
            error=str(e)[:120],
        ))

    # Ready check (DB connectivity)
    if svc.ready_path:
        url = f"http://{BASE_HOST}:{svc.port}{svc.ready_path}"
        try:
            code, body, ms = http_get(url)
            ok = code == 200
            # Try parse JSON for more detail
            detail = ""
            try:
                data = json.loads(body)
                if isinstance(data, dict):
                    failing = [k for k, v in data.items() if v not in (True, "ok", "healthy", "up")]
                    if failing:
                        detail = f" (failing: {', '.join(failing)})"
            except Exception:
                pass

            results.append(CheckResult(
                service=svc.name,
                check="ready",
                ok=ok,
                status_code=code,
                error=(f"HTTP {code}{detail}") if not ok else None,
                duration_ms=ms,
            ))
        except Exception as e:
            results.append(CheckResult(
                service=svc.name,
                check="ready",
                ok=False,
                error=str(e)[:120],
            ))

    return results


def send_telegram(text: str) -> None:
    if not TG_TOKEN:
        print("[TG] No token set, skipping notification")
        return
    data = json.dumps({
        "chat_id": TG_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[TG] Error: {e}")


def main() -> int:
    all_results: list[CheckResult] = []
    for svc in SERVICES:
        results = check_service(svc)
        all_results.extend(results)
        for r in results:
            icon = "✅" if r.ok else "❌"
            dur = f" {r.duration_ms}ms" if r.duration_ms else ""
            err = f" — {r.error}" if r.error else ""
            print(f"{icon} {r.service} [{r.check}]{dur}{err}")

    failures = [r for r in all_results if not r.ok]

    if failures:
        lines = ["🚨 *Smoke tests FAILED*\n"]
        for r in failures:
            lines.append(f"❌ *{r.service}* [{r.check}]: {r.error or 'failed'}")
        send_telegram("\n".join(lines))
        print(f"\n{len(failures)} check(s) failed")
        return 1

    print(f"\nAll {len(all_results)} checks passed ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
