#!/usr/bin/env bash
# Copy only the public application and intended downloads into the Pages artifact.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
(cd downloads && sha256sum --check viki-debug.apk.sha256)
mkdir -p _site/downloads
cp index.html viki-personality.js viki-storage.js viki-notifications.js manifest.json sw.js _site/
cp downloads/index.html downloads/viki-debug.apk downloads/viki-debug.apk.sha256 _site/downloads/
