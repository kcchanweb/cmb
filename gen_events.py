#!/usr/bin/env python3
"""Generate a realistic mobile-analytics event stream as JSONL.

Stdlib only.  python3 gen_events.py --count 10000 --out events.jsonl

Shape follows the common SDK contract (track/screen) so the data looks
like something a real mobile SDK emits: heavy tail of event names, a mix of
numeric and UUID user ids, some anonymous-only sessions, out-of-order
timestamps, and a small fraction of deliberately malformed lines.
"""
import argparse, json, random, uuid
from datetime import datetime, timedelta, timezone

EVENTS = [  # (name, weight, is_revenue)
    ("app_open", 30, False), ("screen_view", 25, False), ("swipe_right", 12, False),
    ("swipe_left", 11, False), ("match_created", 5, False), ("message_sent", 6, False),
    ("profile_updated", 3, False), ("purchase", 2, True), ("subscription_started", 1, True),
    ("complete_registration", 2, False), ("push_opened", 2, False), ("credits_spent", 1, True),
]
NAMES, WEIGHTS = [e[0] for e in EVENTS], [e[1] for e in EVENTS]
REVENUE = {e[0] for e in EVENTS if e[2]}
SCREENS = ["Discover", "Matches", "Chat", "Profile", "Settings", "Purchase"]
PLATFORMS = [("iOS", ["17.4", "18.1", "18.2"]), ("Android", ["13", "14", "15"])]


def make_user(rng, rng_dev):
    """Every user gets a deviceId; userId is present ~90% of the time.

    The SDK mints `deviceId` at install and sends it on every event for that install; `userId`
    only appears once the user is signed in.

    `rng_dev` is a separate stream so that adding deviceId did not perturb the main
    sequence — every userId, event name and timestamp is unchanged, and so is every
    published ground-truth figure.
    """
    r = rng.random()
    if r < 0.55:
        uid = str(rng.randint(100000, 999999))          # ~55% numeric, no lookup needed
    elif r < 0.90:
        uid = str(uuid.UUID(int=rng.getrandbits(128), version=4))   # ~35% needs a lookup
    else:
        uid = None                                       # ~10% not signed in
        rng.getrandbits(128)                             # keep the draw sequence intact
    return uid, str(uuid.UUID(int=rng_dev.getrandbits(128), version=4))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=10000)
    ap.add_argument("--out", default="events.jsonl")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--malformed", type=float, default=0.002)
    ap.add_argument("--profiles", default="profiles.json")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rng_dev = random.Random(args.seed + 1000)   # separate stream; see make_user
    base = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)
    users = [make_user(rng, rng_dev) for _ in range(max(200, args.count // 25))]

    written = malformed = 0
    with open(args.out, "w") as fh:
        for i in range(args.count):
            if rng.random() < args.malformed:
                fh.write('{"type":"track","event":"app_open",,"userId":"1"}\n')
                malformed += 1
                continue

            uid, dev = rng.choice(users)
            name = rng.choices(NAMES, WEIGHTS)[0]
            plat, versions = rng.choice(PLATFORMS)
            # clients buffer offline, so timestamps arrive out of order
            ts = base + timedelta(seconds=i * 0.3) - timedelta(seconds=rng.randint(0, 900))
            received = base + timedelta(seconds=i * 0.3)

            props = {}
            if name == "screen_view":
                props["screen_name"] = rng.choice(SCREENS)
            if name in REVENUE:
                props |= {"revenue": round(rng.uniform(2.99, 99.99), 2),
                          "currency": "USD",
                          "sku": f"credits_{rng.choice([50, 100, 500, 1000])}"}
            if name in ("swipe_right", "swipe_left"):
                props["target_profile_id"] = str(rng.randint(100000, 999999))

            ev = {
                "type": "screen" if name == "screen_view" else "track",
                "event": name,
                "messageId": str(uuid.UUID(int=rng.getrandbits(128), version=4)),
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "receivedAt": received.isoformat().replace("+00:00", "Z"),
                "properties": props,
                "context": {
                    "app": {"version": rng.choice(["6.14.0", "6.15.1", "6.16.0"])},
                    "device": {"type": plat.lower(),
                               "advertisingId": str(uuid.UUID(int=rng.getrandbits(128), version=4))},
                    "os": {"name": plat, "version": rng.choice(versions)},
                    "locale": rng.choice(["en-US", "en-GB", "ja-JP", "ko-KR"]),
                },
            }
            ev["deviceId"] = dev            # always present: minted at install
            if uid:
                ev["userId"] = uid          # only once the user is signed in
            if name == "complete_registration":
                ev["traits"] = {"email": f"user{rng.randint(1, 99999)}@example.com",
                                "phone": f"+1555{rng.randint(1000000, 9999999)}"}

            fh.write(json.dumps(ev) + "\n")
            written += 1

    # Lookup table: UUID user ids → internal numeric profile ids.
    # ~10% of UUIDs are deliberately absent, so "unresolvable user" is a real case.
    uuids = sorted({u for u, _ in users if u and "-" in u})
    rng.shuffle(uuids)
    keep = uuids[: int(len(uuids) * 0.9)]
    profiles = {u: str(rng.randint(100000, 999999)) for u in sorted(keep)}
    with open(args.profiles, "w") as fh:
        json.dump(profiles, fh, indent=1)

    print(f"{written} events + {malformed} malformed lines → {args.out}")
    print(f"{len(profiles)} of {len(uuids)} uuid users resolvable → {args.profiles}")


if __name__ == "__main__":
    main()
