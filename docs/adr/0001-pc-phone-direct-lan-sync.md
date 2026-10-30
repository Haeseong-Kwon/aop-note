# ADR-0001: PC-phone direct LAN sync

Status: Proposed
Date: 2026-10-31

## Context
The Android app could only sync through a shared folder kept in step by Syncthing: two extra installs, a typed storage path and "all files access". The official Syncthing Android app has been discontinued. There is no account or server, and notes must stay on the user's devices.

## Decision
The desktop runs an opt-in HTTP server on `0.0.0.0:47321` (`src/main/lanSync.ts`). A phone pairs once with a 12-symbol one-time code (60 bits, 10 minutes, 5 tries; PBKDF2-SHA256 at 210k iterations, salted per phone) and receives its own 256-bit key. Every body is AES-256-GCM sealed, with AAD bound to the endpoint and direction. Requests carry a time and nonce: the desktop refuses stale (±5 min) or repeated ones and echoes the nonce back (`src/shared/lanProtocol.ts`). Each endpoint has its own size limit, connections are capped and requests time out. Rounds reuse the snapshot last-writer-wins merge and attachment copying from `src/main/sync.ts`. Android allows cleartext HTTP because the payloads are sealed.

## Alternatives Considered
- Syncthing only: rejected for the setup friction and the discontinued Android app. It stays available as an advanced option for syncing off the home network.
- A cloud backend: rejected because it needs accounts and servers, and the data would leave the user's devices.
- HTTPS with a self-signed certificate and pinning: rejected because it adds certificate lifecycle work on a LAN and WebView pinning for the same guarantee the sealing already gives.
- QR or camera pairing, mDNS discovery: deferred. Both need native plugins, and the address is typed only once.

## Consequences
- + Pairing takes one code, needs no third-party app, and the data is end-to-end encrypted.
- − The phone must re-enter the address if the desktop's LAN IP changes. Sync works only on the same network. The OS firewall asks for permission the first time the server is enabled.
- − The two devices' clocks must agree within 5 minutes; the phone says so when they don't.
- − Accepted risk: the device key travels under the code-derived key, so someone who recorded the pairing *and* later learns the code can read later syncs (ECDH inside pairing would close this).
- − Accepted risk: Android allows cleartext for every host, because `network_security_config` cannot name an address chosen at runtime. The app's other requests use HTTPS.

## Follow-up
- [ ] mDNS discovery or QR pairing if retyping the address becomes a chore.
- [ ] ECDH (P-256, WebCrypto) inside the code-sealed pairing for forward secrecy against a leaked code.
- [ ] Cancel a showing pairing code on the desktop when the card is closed (today it expires on its own).
