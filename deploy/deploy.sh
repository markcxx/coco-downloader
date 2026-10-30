#!/bin/sh
set -eu
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IMAGE=${1:?Usage: deploy.sh image}
case "$IMAGE" in ghcr.io/markcxx/coco-downloader:*) ;; *) echo 'Unexpected image repository' >&2; exit 1;; esac
compose() {
  COCO_IMAGE="$1" docker compose --project-name coco-downloader --file "$APP_DIR/compose.yaml" up -d --wait --wait-timeout 120
}
previous=$(docker inspect --format '{{.Image}}' coco-downloader 2>/dev/null || true)
docker pull "$IMAGE"
# Preserve the original standalone container during the first migration.
legacy=false
if [ -n "$previous" ]; then
  project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' coco-downloader)
  if [ "$project" != coco-downloader ]; then
    if docker container inspect coco-downloader-before-compose >/dev/null 2>&1; then
      echo 'Migration backup already exists; inspect it before retrying' >&2; exit 1
    fi
    docker rename coco-downloader coco-downloader-before-compose
    if ! docker stop coco-downloader-before-compose; then
      docker rename coco-downloader-before-compose coco-downloader
      exit 1
    fi
    legacy=true
  fi
fi
if compose "$IMAGE"; then
  if [ "$legacy" = true ]; then docker rm coco-downloader-before-compose; fi
  echo 'CoCo healthy on 127.0.0.1:3004'
else
  echo 'Deployment failed; restoring previous service' >&2
  if [ "$legacy" = true ]; then
    docker rm -f coco-downloader 2>/dev/null || true
    docker rename coco-downloader-before-compose coco-downloader
    docker start coco-downloader
  elif [ -n "$previous" ]; then
    compose "$previous"
  fi
  exit 1
fi
