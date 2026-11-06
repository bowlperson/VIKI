#!/usr/bin/env bash
# Copy only the public application and intended downloads into the Pages artifact.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
(cd downloads && sha256sum --check viki-beta.apk.sha256)
mkdir -p _site/downloads
cp index.html viki-personality.js viki-storage.js viki-notifications.js manifest.json sw.js mobile-ui.css mobile-ui.js viki-inbox.js viki-help.js viki-data.js viki-terminal.js _site/
cp downloads/index.html downloads/viki-beta.apk downloads/viki-beta.apk.sha256 _site/downloads/
