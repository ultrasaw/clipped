#!/usr/bin/env bash
set -euo pipefail

IMAGE_REPO="${IMAGE_REPO:-docker.io/bandpassednoise/clipped}"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD)}"
LATEST_TAG="${IMAGE_REPO}:latest"
SHA_TAG="${IMAGE_REPO}:${GIT_SHA}"

echo "Building ${LATEST_TAG} and ${SHA_TAG}"
docker build -t "${LATEST_TAG}" -t "${SHA_TAG}" .

echo "Pushing ${LATEST_TAG}"
docker push "${LATEST_TAG}"

echo "Pushing ${SHA_TAG}"
docker push "${SHA_TAG}"

echo "Published:"
echo "  ${LATEST_TAG}"
echo "  ${SHA_TAG}"
