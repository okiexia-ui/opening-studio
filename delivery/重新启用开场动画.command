#!/bin/zsh
set -euo pipefail
TASK_BASE="$HOME/Library/Application Support/WelcomeTommy"
TASK_LABEL=local.tommy.welcome-companion
TASK_AGENT="$HOME/Library/LaunchAgents/$TASK_LABEL.plist"
if [[ -f "$TASK_BASE/disabled-launch-agent.plist" ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  mv "$TASK_BASE/disabled-launch-agent.plist" "$TASK_AGENT"
fi
if [[ ! -f "$TASK_AGENT" ]]; then
  print '请从项目 scripts/install.py 安装开场伴随程序。'
  exit 1
fi
launchctl bootstrap "gui/$(id -u)" "$TASK_AGENT" 2>/dev/null || true
launchctl kickstart "gui/$(id -u)/$TASK_LABEL"
print '已启用：下次完整退出 ChatGPT 后重新打开时播放。'
