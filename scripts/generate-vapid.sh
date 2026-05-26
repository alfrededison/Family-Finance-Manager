#!/usr/bin/env bash
# Generate VAPID keys (ECDH P-256) for Web Push Notifications.
# Prints base64url-encoded public and private keys.
#
# Usage:
#   bash scripts/generate-vapid.sh
#
# Then set the printed values as secrets on the Worker AND on Pages:
#   wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.toml
#   wrangler secret put VAPID_PUBLIC_KEY  --config worker/wrangler.toml
#   wrangler secret put VAPID_SUBJECT     --config worker/wrangler.toml   # e.g. mailto:you@example.com
#   wrangler pages secret put VAPID_PRIVATE_KEY
#   wrangler pages secret put VAPID_PUBLIC_KEY
#   wrangler pages secret put VAPID_SUBJECT
#
# Also insert the public key into D1 so the frontend can read it:
#   wrangler d1 execute finance-db --command \
#     "INSERT OR REPLACE INTO settings (key, value) VALUES ('notify.vapid_public_key', '\"<PUB>\"');"

set -e

node -e '
const { generateKeyPairSync, createPublicKey } = require("crypto");
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const pubJwk  = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });

const b64urlEncode = (b64) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Reassemble uncompressed pubkey: 0x04 || x(32) || y(32)
const x = Buffer.from(pubJwk.x, "base64");
const y = Buffer.from(pubJwk.y, "base64");
const pubRaw = Buffer.concat([Buffer.from([0x04]), x, y]);
const pubB64u = b64urlEncode(pubRaw.toString("base64"));

const dRaw = Buffer.from(privJwk.d, "base64");
const privB64u = b64urlEncode(dRaw.toString("base64"));

console.log("VAPID_PUBLIC_KEY=" + pubB64u);
console.log("VAPID_PRIVATE_KEY=" + privB64u);
'
