#!/usr/bin/env bash
set -euo pipefail

IMAGE_REPO="${IMAGE_REPO:-docker.io/bandpassednoise/clipped}"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD)}"
PLATFORM="${PLATFORM:-linux/amd64}"
LATEST_TAG="${IMAGE_REPO}:latest"
SHA_TAG="${IMAGE_REPO}:${GIT_SHA}"

echo "Building and pushing ${LATEST_TAG} and ${SHA_TAG} for ${PLATFORM}"
docker buildx build \
  --platform "${PLATFORM}" \
  --tag "${LATEST_TAG}" \
  --tag "${SHA_TAG}" \
  --push \
  .

echo "Published:"
echo "  ${LATEST_TAG}"
echo "  ${SHA_TAG}"
