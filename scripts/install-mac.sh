#!/usr/bin/env bash
#
# aop-note 를 빌드해서 /Applications 에 설치하는 스크립트.
# 미서명 빌드를 ad-hoc 서명 + quarantine 제거하여 Gatekeeper 차단 없이 실행 가능하게 만든다.
#
# 사용법:  npm run install:mac   (또는  bash scripts/install-mac.sh)

set -euo pipefail

# 프로젝트 루트로 이동 (스크립트 위치 기준)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="aop-note.app"
SRC_APP="dist/mac/${APP_NAME}"
DEST_APP="/Applications/${APP_NAME}"

echo "==> 1/4  빌드 및 패키징 (electron-vite + electron-builder)"
npm run package:mac

if [ ! -d "$SRC_APP" ]; then
  echo "ERROR: 빌드 산출물이 없습니다: $SRC_APP" >&2
  exit 1
fi

echo "==> 2/4  /Applications 에 설치"
# 실행 중이면 종료 (덮어쓰기 충돌 방지)
if pgrep -f "${APP_NAME}/Contents/MacOS" >/dev/null; then
  echo "    실행 중인 앱을 종료합니다."
  pkill -f "${APP_NAME}/Contents/MacOS" || true
  sleep 1
fi
rm -rf "$DEST_APP"
ditto "$SRC_APP" "$DEST_APP"

echo "==> 3/4  확장속성 제거 + ad-hoc 서명"
xattr -cr "$DEST_APP"
codesign --force --deep --sign - "$DEST_APP"

echo "==> 4/4  실행"
open -a "$DEST_APP"

echo ""
echo "완료: $DEST_APP 설치 및 실행됨. Launchpad/응용 프로그램에서 'aop-note' 로 언제든 실행하세요."
