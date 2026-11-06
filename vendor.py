#!/usr/bin/env python3
"""Vendor destination (stand-in) with injectable failures.

Stdlib only. Run:  python3 vendor.py [--port 9000]

Endpoints
  POST /events         one event per request  (the real-time vendor shape)
  POST /events/batch   {"events": [...]}      (the batch shape, max 50)
  POST /_control       change behaviour at runtime
  GET  /_stats         what the vendor has seen
  GET  /_order         per-user arrival order of messageIds
  POST /_reset         clear stats and rate window; preserve configuration

Control body (all fields optional):
  {"mode": "ok" | "500" | "429" | "timeout" | "reject",
   "latency_ms": 0,
   "fail_ratio": 0.0,        # fraction of requests that fail regardless of mode
   "rate_limit_rps": null,   # 429 once exceeded in the current second
   "strict": true}           # enforce the vendor payload contract (422 when violated)

Vendor payload contract (enforced when strict):
  required  event_name        str
            event_time        int, epoch MILLIseconds
  optional  customer_user_id  str      (the join key back to YOUR warehouse)
            device_id         str      (the install-scoped id the vendor attributes on)
            event_value       object   (revenue, currency, ...)
            app_version       str
            platform          str
            messageId         str
  Unknown fields are rejected.

`reject` returns 400 — a permanent failure that must NOT be retried.
`timeout` sleeps 30s so the client's own timeout fires.
"""
import argparse, json, math, random, threading, time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
CFG = {"mode": "ok", "latency_ms": 0, "fail_ratio": 0.0, "rate_limit_rps": None,
       "strict": True}

# The vendor's payload contract. Enforced when CFG["strict"] (the default):
# a payload that doesn't match gets 422 — a permanent failure, not a retryable one.
REQUIRED = {"event_name": str, "event_time": int}
# customer_user_id is OPTIONAL, matching real attribution vendors: they attribute on
# device identifiers, and this field is the join key back to your own warehouse. An
# event without it still attributes; it just can't be linked to a known person.
OPTIONAL = {"customer_user_id": str, "device_id": str, "event_value": dict,
            "app_version": str, "platform": str, "messageId": str}


def validate(ev):
    """Return a list of human-readable problems with one vendor payload."""
    if not isinstance(ev, dict):
        return ["payload must be a JSON object"]
    problems = []
    for field, typ in REQUIRED.items():
        if field not in ev:
            problems.append(f"missing required field '{field}'")
        elif not isinstance(ev[field], typ) or isinstance(ev[field], bool):
            problems.append(
                f"'{field}' must be {typ.__name__}, got {type(ev[field]).__name__}")
    if isinstance(ev.get("event_time"), int) and not 1e12 < ev["event_time"] < 1e13:
        problems.append("'event_time' must be epoch MILLIseconds")
    for field, typ in OPTIONAL.items():
        if field in ev and not isinstance(ev[field], typ):
            problems.append(f"'{field}' must be {typ.__name__} when present")
    unknown = set(ev) - set(REQUIRED) - set(OPTIONAL)
    if unknown:
        problems.append(f"unknown field(s): {', '.join(sorted(unknown))}")
    return problems
STATS = {"requests": 0, "events": 0, "by_status": Counter(), "message_ids": set(),
         "duplicates": 0, "first_seen": None, "last_seen": None,
         "schema_rejected": 0, "last_schema_errors": [], "without_cuid": 0,
         "without_any_id": 0,
         "arrival": {}}   # customer_user_id -> [messageId, ...] in arrival order
_WINDOW = {"sec": 0, "count": 0}


def validate_control(body):
    """Reject invalid controls before changing any configuration."""
    if not isinstance(body, dict):
        return ["control body must be a JSON object"]
    problems = [f"unknown control: {key}" for key in body if key not in CFG]
    for key, value in body.items():
        if key == "mode" and value not in ("ok", "500", "429", "timeout", "reject"):
            problems.append("invalid mode")
        elif key == "strict" and not isinstance(value, bool):
            problems.append("strict must be a boolean")
        elif key in ("latency_ms", "fail_ratio"):
            if (type(value) not in (int, float) or not (abs(value) <= 1e308 and math.isfinite(value))
                    or value < 0 or (key == "fail_ratio" and value > 1)):
                problems.append(f"{key} must be finite and nonnegative"
                                + (" and at most 1" if key == "fail_ratio" else ""))
        elif key == "rate_limit_rps" and value is not None:
            if type(value) is not int or value <= 0:
                problems.append("rate_limit_rps must be a positive integer or null")
    return problems


def _rate_limited():
    if not CFG["rate_limit_rps"]:
        return False
    now = int(time.time())
    if _WINDOW["sec"] != now:
        _WINDOW["sec"], _WINDOW["count"] = now, 0
    _WINDOW["count"] += 1
    return _WINDOW["count"] > CFG["rate_limit_rps"]


def _record(events):
    now = time.time()
    STATS["events"] += len(events)
    STATS["first_seen"] = STATS["first_seen"] or now
    STATS["last_seen"] = now
    for e in events:
        if not e.get("customer_user_id"):
            STATS["without_cuid"] += 1
            if not e.get("device_id"):
                STATS["without_any_id"] += 1
        mid = e.get("messageId")
        if mid is None:
            continue
        if mid in STATS["message_ids"]:
            STATS["duplicates"] += 1
        else:
            STATS["message_ids"].add(mid)
        uid = e.get("customer_user_id")
        if uid:
            STATS["arrival"].setdefault(uid, []).append(mid)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # quiet; the candidate's own logs matter more
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # Expected when the client times out before the delayed response.
            self.close_connection = True

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0:
                return None
            return json.loads(self.rfile.read(n))
        except (ValueError, UnicodeDecodeError):
            self.close_connection = True
            return None

    def do_GET(self):
        if self.path == "/_order":
            with LOCK:
                return self._send(200, {"arrival": STATS["arrival"]})
        if self.path != "/_stats":
            return self._send(404, {"error": "not found"})
        with LOCK:
            span = (STATS["last_seen"] - STATS["first_seen"]) if STATS["first_seen"] else 0
            self._send(200, {
                "config": CFG,
                "requests": STATS["requests"],
                "events_received": STATS["events"],
                "unique_message_ids": len(STATS["message_ids"]),
                "duplicates": STATS["duplicates"],
                "schema_rejected": STATS["schema_rejected"],
                "accepted_without_customer_user_id": STATS["without_cuid"],
                "accepted_with_no_identifier_at_all": STATS["without_any_id"],
                "last_schema_errors": STATS["last_schema_errors"],
                "by_status": dict(STATS["by_status"]),
                "wall_seconds": round(span, 2),
                "events_per_sec": round(STATS["events"] / span, 1) if span > 0.5 else None,
            })

    def do_POST(self):
        body = self._read_json()

        if self.path == "/_control":
            problems = validate_control(body)
            if problems:
                return self._send(400, {"error": "invalid controls", "problems": problems})
            with LOCK:
                CFG.update(body)
                if "rate_limit_rps" in body:
                    _WINDOW.update(sec=0, count=0)
                return self._send(200, {"config": CFG})

        if self.path == "/_reset":
            with LOCK:
                STATS.update(requests=0, events=0, by_status=Counter(),
                             message_ids=set(), duplicates=0,
                             first_seen=None, last_seen=None,
                             schema_rejected=0, last_schema_errors=[],
                             without_cuid=0, without_any_id=0, arrival={})
                _WINDOW.update(sec=0, count=0)
            return self._send(200, {"reset": True})

        if self.path not in ("/events", "/events/batch"):
            return self._send(404, {"error": "not found"})

        if body is None:
            return self._status(400, {"error": "malformed json"})

        if self.path.endswith("/batch") and not isinstance(body, dict):
            return self._status(400, {"error": "batch body must be a JSON object"})
        events = body.get("events") if self.path.endswith("/batch") else [body]
        if not isinstance(events, list):
            return self._status(400, {"error": "batch requires an events array"})
        if self.path.endswith("/batch") and len(events) > 50:
            return self._status(413, {"error": "batch too large", "max": 50})
        if not events:
            return self._status(400, {"error": "batch must not be empty"})

        with LOCK:
            mode, latency, ratio = CFG["mode"], CFG["latency_ms"], CFG["fail_ratio"]
            strict = CFG["strict"]
            limited = _rate_limited()

        # Even diagnostic non-strict mode must be safe for stats collection.
        if not strict and any(
            not isinstance(ev, dict)
            or any(key in ev and ev[key] is not None and not isinstance(ev[key], str)
                   for key in ("messageId", "customer_user_id"))
            for ev in events
        ):
            return self._status(400, {"error": "events must be objects with string identifiers"})

        if strict:
            problems = []
            for i, ev in enumerate(events):
                for msg in validate(ev):
                    problems.append(f"event[{i}]: {msg}")
            if problems:
                with LOCK:
                    STATS["schema_rejected"] += len(events)
                    STATS["last_schema_errors"] = problems[:8]
                return self._status(422, {"error": "payload does not match the vendor contract",
                                          "problems": problems[:8],
                                          "hint": "422 is permanent. Retrying this payload will not help."})

        if latency:
            time.sleep(latency / 1000.0)

        if limited:
            return self._status(429, {"error": "rate limited", "retry_after": 1})
        if mode == "timeout":
            time.sleep(30)
            return self._status(504, {"error": "gateway timeout"})
        if ratio and random.random() < ratio:
            return self._status(500, {"error": "injected failure"})
        if mode == "500":
            return self._status(500, {"error": "internal server error"})
        if mode == "429":
            return self._status(429, {"error": "rate limited", "retry_after": 1})
        if mode == "reject":
            return self._status(400, {"error": "invalid event; do not retry"})

        with LOCK:
            _record(events)
        return self._status(200, {"accepted": len(events)})

    def _status(self, code, payload):
        with LOCK:
            STATS["requests"] += 1
            STATS["by_status"][str(code)] += 1
        self._send(code, payload)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9000)
    args = ap.parse_args()
    print(f"vendor on http://127.0.0.1:{args.port}")
    print("  POST /events  ·  POST /_control  ·  GET /_stats  ·  POST /_reset")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
