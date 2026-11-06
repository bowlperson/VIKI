#!/usr/bin/env bash
# Build the shared web application into a Google-services-free Android APK.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
prepared_tools=/workspace/.android-tools
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/javac" ]]; then
    if [[ -x "$prepared_tools/jdk-21.0.9+10/bin/javac" ]]; then
        export JAVA_HOME="$prepared_tools/jdk-21.0.9+10"
    elif command -v javac >/dev/null 2>&1; then
        export JAVA_HOME="$(dirname -- "$(dirname -- "$(readlink -f -- "$(command -v javac)")")")"
    else
        echo 'A complete JDK 17 or newer is required; set JAVA_HOME to a JDK containing javac.' >&2
        exit 1
    fi
fi
if [[ -z "${ANDROID_HOME:-}" ]]; then
    export ANDROID_HOME="${ANDROID_SDK_ROOT:-$prepared_tools/sdk}"
fi
if [[ ! -d "$ANDROID_HOME/platforms/android-35" ]]; then
    echo 'Install Android SDK platform 35 and build-tools 35.0.0, then set ANDROID_HOME.' >&2
    exit 1
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [[ -z "${GRADLE_USER_HOME:-}" && -d "$prepared_tools/gradle-home" ]]; then
    export GRADLE_USER_HOME="$prepared_tools/gradle-home"
fi
# Java does not automatically use the environment's HTTPS_PROXY. Pass only the
# non-secret destination host/port; keep configured proxy authentication intact.
proxy_options=()
if command -v python3 >/dev/null 2>&1; then
    mapfile -t proxy_options < <(python3 - <<'PY'
import os
from urllib.parse import urlparse
for scheme in ('http','https'):
    value=os.environ.get(scheme.upper()+'_PROXY') or os.environ.get(scheme+'_proxy')
    if value:
        p=urlparse(value)
        if p.hostname:
            print(f'-D{scheme}.proxyHost={p.hostname}')
            print(f'-D{scheme}.proxyPort={p.port or (443 if p.scheme=="https" else 80)}')
PY
)
fi
trust_options=()
if [[ -f /etc/codex/network-policy.json && -f /etc/ssl/certs/java/cacerts ]]; then
    trust_options=(-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts)
fi
# Also supply these to the wrapper JVM if a fresh Gradle download is needed.
export JAVA_OPTS="${JAVA_OPTS:-} ${proxy_options[*]} ${trust_options[*]}"
cd -- "$repo_dir/android"
if [[ -x "$prepared_tools/gradle-8.11.1/bin/gradle" ]]; then
    gradle_command=("$prepared_tools/gradle-8.11.1/bin/gradle")
else
    gradle_command=(./gradlew)
fi
if [[ $# -eq 0 ]]; then
    set -- testDebugUnitTest assembleDebug lintDebug
fi
exec "${gradle_command[@]}" --no-daemon --max-workers=2 "${proxy_options[@]}" "${trust_options[@]}" "$@"
