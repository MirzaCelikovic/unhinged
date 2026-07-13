#!/usr/bin/env bash
#
# Print the RevenueCat offerings exactly as the shipped iOS app sees them.
#
# Reads the PUBLIC SDK key from .env and calls the same endpoint the RevenueCat
# SDK calls (GET /v1/subscribers/{id}/offerings). Read-only: no dashboard seat
# and no secret key required, and it changes nothing.
#
# Use it to check what users are ACTUALLY being served — the dashboard shows
# what you configured, this shows what shipped. Re-run after any offering or
# paywall change to confirm it landed.
#
#   ./scripts/rc-offerings.sh          # summary
#   ./scripts/rc-offerings.sh --raw    # full JSON (paywall config, exit offers)
#
# Prices are deliberately absent from the payload: RevenueCat returns product
# IDs and the App Store resolves the price on-device, per territory. Our product
# IDs happen to embed the USD price (so.unhinged.sub.yearly_39.99), which is why
# the summary is readable — but never assume a user in Berlin pays that.
set -euo pipefail

cd "$(dirname "$0")/.."

KEY=$(grep -E '^EXPO_PUBLIC_REVENUECAT_API_KEY_APPL=' .env | cut -d= -f2- | tr -d '"'\''' | tr -d '\r' | xargs)
[ -n "$KEY" ] || { echo "EXPO_PUBLIC_REVENUECAT_API_KEY_APPL not found in .env" >&2; exit 1; }

# Anonymous probe user. Fetching offerings has no side effect on pricing.
PROBE='%24RCAnonymousID%3Arcofferingsprobe000000000000000'
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

curl -sS --fail \
  -H "Authorization: Bearer $KEY" \
  -H "X-Platform: ios" \
  -H "Accept: application/json" \
  "https://api.revenuecat.com/v1/subscribers/$PROBE/offerings" -o "$TMP"

if [ "${1:-}" = "--raw" ]; then
  python3 -m json.tool "$TMP"
  exit 0
fi

python3 - "$TMP" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

cur = d.get("current_offering_id")
print(f"current offering = {cur}")
print("(the app passes no explicit offering, so every user lands here)\n")


def find_exit(node):
    """Locate the exit-offer target offering id anywhere in the paywall blob."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("exit_offers", "exitOffers") and isinstance(v, dict):
                dismiss = v.get("dismiss") or {}
                target = dismiss.get("offering_id") or dismiss.get("offeringId")
                if target:
                    return target
            found = find_exit(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = find_exit(v)
            if found:
                return found
    return None


exits = []
for off in d.get("offerings", []):
    ident = off["identifier"]
    paywall = off.get("paywall_components") or off.get("paywall")
    tags = [t for t in ("CURRENT" if ident == cur else "", "paywall" if paywall else "NO PAYWALL") if t]
    print(f"{ident}  [{' | '.join(tags)}]")
    for p in off.get("packages", []) or [None]:
        print(f"    {p['identifier']:<13} -> {p['platform_product_identifier']}" if p else "    (no packages)")
    print()
    target = find_exit(paywall) if paywall else None
    if target:
        exits.append((ident, target))

print("exit offers (where tapping X sends the user):")
for src, dst in exits:
    print(f"    {src}  --dismiss-->  {dst}")
if not exits:
    print("    none")
PY
