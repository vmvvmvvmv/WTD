# WeatherToDo

WeatherToDo mobile app and the Django backend endpoints used by the mobile app.

## Structure

- `mobile/`: React Native + Expo Android app.
- `backend/`: Django backend for weather, dust, notifications, and mobile map WebView.

## Pre-release hardening

- Secrets: `.env` was never tracked; history scanned for API keys, tokens and private keys (none found). Only `.env.example` with empty placeholders is committed.
- `DJANGO_DEBUG` now defaults to `False`; the app refuses to start without `DJANGO_SECRET_KEY` when debug is off.
- App test token is compared with `hmac.compare_digest`. It is a shared, temporary access gate, not real authentication.
- Release Android manifest disables cleartext traffic and app backup (debug manifests keep cleartext for local servers).
- Mobile map log strips newlines to prevent log forging.
- Dependencies pinned to tested versions (Python 3.10+; developed on 3.11); gunicorn upgraded 20.1.0 -> 23.0.0; unused `psycopg2-binary` and Dockerfile removed.
- Added MIT `LICENSE`.

Known limits: release builds are still signed with the debug key (separate key needed before store release); the shared test token is extractable from the app bundle.
