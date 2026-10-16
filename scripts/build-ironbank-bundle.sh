#!/usr/bin/env bash
# Build the web app and package it as the Iron Bank resource ironbank/vocab-library-dist.tar.gz,
# then print its sha256 for ironbank/hardening_manifest.yaml. See ironbank/README.md.
#
# The tarball is reproducible: fixed file order, owner and timestamps, so the same commit gives the
# same sha256 on any machine with the same npm lockfile.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
VITE_STARDOG_ENDPOINT=/stardog npx vite build

out=ironbank/vocab-library-dist.tar.gz
# Python's tarfile, not tar: the same flags work on macOS and Linux
python3 -I - "$out" <<'PY'
import gzip, os, sys, tarfile
out = sys.argv[1]
with open(out, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as gz, \
     tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tar:
    paths = []
    for root, dirs, files in os.walk('dist'):
        dirs.sort()
        paths += [os.path.join(root, f) for f in sorted(files)]
    for path in paths:
        info = tar.gettarinfo(path, arcname=os.path.relpath(path, 'dist'))
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        info.mtime = 946684800  # 2000-01-01
        info.mode = 0o644
        with open(path, 'rb') as f:
            tar.addfile(info, f)
PY
echo "$out"
shasum -a 256 "$out" | awk '{print "sha256: " $1}'
