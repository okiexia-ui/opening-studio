#!/bin/zsh
set -euo pipefail
TASK_INSTALLED="$HOME/Library/Application Support/WelcomeTommy/Welcome Tommy.app/Contents/MacOS/WelcomeTommy"
if [[ -x "$TASK_INSTALLED" ]]; then exec "$TASK_INSTALLED" --settings; fi
exec "${0:A:h}/Welcome Tommy.app/Contents/MacOS/WelcomeTommy" --settings
