#!/bin/zsh
set -euo pipefail
TASK_ROOT="${0:A:h}"
exec "$TASK_ROOT/Welcome Tommy.app/Contents/MacOS/WelcomeTommy" --preview
