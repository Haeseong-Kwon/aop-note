#!/usr/bin/env bash
#
# Signed release APK for installing on a phone: npm run android:release
# → android/app/build/outputs/apk/release/app-release.apk
#
# Signing key: ~/.android/aop-note-release.jks, its password in the macOS Keychain
# (service "aop-note-android-release"). Both are created on the first run. Back them up:
# a phone only accepts updates signed with the same key.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

KEYSTORE="$HOME/.android/aop-note-release.jks"
SERVICE="aop-note-android-release"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(mise where java@temurin-21.0.12+101.0.LTS)}"

if ! PASSWORD="$(security find-generic-password -s "$SERVICE" -a "$USER" -w 2>/dev/null)"; then
  if [ -f "$KEYSTORE" ]; then
    echo "ERROR: $KEYSTORE exists but its password is not in the Keychain (service $SERVICE)." >&2
    exit 1
  fi
  echo "==> Creating the release signing key (one time)"
  PASSWORD="$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-32)"
  mkdir -p "$(dirname "$KEYSTORE")"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEYSTORE" -alias aop-note -keyalg RSA -keysize 4096 \
    -validity 10000 -dname "CN=AOP Note, O=aop" -storepass "$PASSWORD" -keypass "$PASSWORD" >/dev/null
  chmod 600 "$KEYSTORE"
  security add-generic-password -s "$SERVICE" -a "$USER" -w "$PASSWORD" -l "AOP Note Android release key"
fi

echo "==> Building the web bundle and syncing it into the Android project"
npm run build:mobile

echo "==> Building the signed release APK"
(cd android && AOP_ANDROID_KEYSTORE="$KEYSTORE" AOP_ANDROID_KEYSTORE_PASSWORD="$PASSWORD" ./gradlew assembleRelease)

APK="android/app/build/outputs/apk/release/app-release.apk"
"$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner" verify "$APK"
echo "완료: $APK"
