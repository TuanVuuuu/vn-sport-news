#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
OWNER="${DATA_REPO_OWNER:-TuanVuuuu}"
REPO="${DATA_REPO_NAME:-vn-sport-news-data}"
BRANCH="${DATA_REPO_BRANCH:-main}"
DATA_REPO_URL="https://github.com/${OWNER}/${REPO}.git"

echo "==> Data repo: ${DATA_REPO_URL}"

if [ -d "$DATA_DIR/.git" ]; then
    echo "==> data/ đã là git repo, đang pull..."
    git -C "$DATA_DIR" pull origin "$BRANCH"
    exit 0
fi

if [ -d "$DATA_DIR" ] && [ "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    echo "==> data/ đã có dữ liệu local, bỏ qua clone."
    echo "    Để migrate lên repo mới, chạy:"
    echo "    cd data && git init && git remote add origin ${DATA_REPO_URL}"
    echo "    git add . && git commit -m 'Initial data' && git push -u origin ${BRANCH}"
    exit 0
fi

echo "==> Clone data repo vào data/"
git clone --branch "$BRANCH" "$DATA_REPO_URL" "$DATA_DIR"
echo "==> Xong."
