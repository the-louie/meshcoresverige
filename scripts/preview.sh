#!/bin/sh
# Local preview against the template checked out beside this repository (../meshcore-regional-template),
# instead of the tag in go.mod. Usage: scripts/preview.sh [hugo args], e.g. scripts/preview.sh server
set -eu
cd "$(dirname "$0")/.."
HUGO_MODULE_REPLACEMENTS="github.com/sweden-mesh/meshcore-regional-template -> $(cd ../meshcore-regional-template && pwd)" exec hugo "$@"
