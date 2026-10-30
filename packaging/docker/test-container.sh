#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: test-container.sh IMAGE}
mkdir -p release-artifacts/docker-evidence
container=$(docker run -d --network none --shm-size=256m "$image")
trap 'docker logs "$container" > release-artifacts/docker-evidence/runtime.log 2>&1; docker rm -f "$container" >/dev/null' EXIT
for attempt in {1..90}; do
  if docker exec "$container" curl -fsS http://127.0.0.1:3000/gezond; then break; fi
  test "$(docker inspect --format '{{.State.Running}}' "$container")" = true
  sleep 2
done
docker exec "$container" curl -fsS http://127.0.0.1:3000/gezond
docker exec "$container" curl -fsS http://127.0.0.1:3000/vnc.html > /dev/null
test "$(docker exec "$container" id -u)" != 0
docker exec "$container" test -d /openaec
docker exec "$container" test -f /config/data/com.opencalcstudio.app/settings.json
docker exec "$container" sh -c 'test -s /run/ocs/mcp.pid && kill -0 "$(cat /run/ocs/mcp.pid)"'
docker exec "$container" curl -fsS http://127.0.0.1:9742/api/v1/health > release-artifacts/docker-evidence/app-health.json
docker exec "$container" import -display :99 -window root /tmp/app.png
docker cp "$container:/tmp/app.png" release-artifacts/docker-evidence/app.png
docker stats --no-stream --format '{{.MemUsage}}' "$container" > release-artifacts/docker-evidence/memory-idle.txt
# Health must stop succeeding when the graphical application dies.
docker exec "$container" sh -c 'kill "$(cat /run/ocs/app.pid)"'
for attempt in {1..20}; do
  if test "$(docker inspect --format '{{.State.Running}}' "$container")" = false; then break; fi
  sleep 1
done
test "$(docker inspect --format '{{.State.Running}}' "$container")" = false
