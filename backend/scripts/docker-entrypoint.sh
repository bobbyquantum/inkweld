#!/bin/sh
# Inkweld's Docker entrypoint. It lets an install set up before 1.0.0-beta.5
# keep starting after an upgrade, when the image began to run with the
# production checks.
#
# The server needs a key of its own, DATABASE_KEY or SESSION_SECRET, to sign
# sessions and encrypt stored settings, and refuses to start without one.
# When neither is set, generate a key the first time and keep it in the data
# volume, next to the database it protects: the container then starts on its
# own and keeps the same key across restarts and upgrades. A server that ran
# without a key before signs everyone out once; its stored settings move to
# the new key automatically.
set -eu

if [ -z "${DATABASE_KEY:-}" ] && [ -z "${SESSION_SECRET:-}" ]; then
  key_file="${INKWELD_KEY_FILE:-/data/.inkweld-key}"
  if [ ! -s "$key_file" ]; then
    umask 077
    if ! head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$key_file.tmp" ||
      ! mv "$key_file.tmp" "$key_file"; then
      echo "Inkweld: no DATABASE_KEY or SESSION_SECRET is set, and $key_file could not be written. Mount a writable /data volume, or set DATABASE_KEY (openssl rand -hex 32)." >&2
      exit 1
    fi
    echo "Inkweld: no DATABASE_KEY or SESSION_SECRET is set, so a key was generated in $key_file. Keep the /data volume, or set DATABASE_KEY yourself." >&2
  fi
  DATABASE_KEY="$(cat "$key_file")"
  export DATABASE_KEY
fi

# The passkey RP ID is required in production. Without one, earlier images
# used the host name of the first ALLOWED_ORIGINS entry (or localhost);
# `localhost` tells the server to keep doing that (resolveRpId in
# utils/webauthn-utils.ts), so passkeys registered before keep working.
if [ -z "${WEBAUTHN_RP_ID:-}" ]; then
  echo "Inkweld: WEBAUTHN_RP_ID is not set, so passkeys use the host name of the first ALLOWED_ORIGINS entry. Set WEBAUTHN_RP_ID before anyone registers a passkey; it cannot be changed afterwards." >&2
  WEBAUTHN_RP_ID=localhost
  export WEBAUTHN_RP_ID
fi

# Run the image's command (the server, unless `docker run` names another).
if [ "$#" -eq 0 ]; then
  set -- ./inkweld-server
fi
exec "$@"
