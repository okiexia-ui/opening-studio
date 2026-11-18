#!/bin/zsh
# Per-user macOS installer. The paths are arguments so an isolated installation
# can exercise the same upgrade and rollback code as a real login item.
install_companion() (
  set -euo pipefail
  local source_app=$1 library=$2 domain=$3
  local label=local.tommy.welcome-companion exe=Contents/MacOS/WelcomeTommy
  local base="$library/Application Support/WelcomeTommy" logs="$library/Logs/WelcomeTommy"
  local agent="$library/LaunchAgents/$label.plist" service="$domain/$label"
  local dest="$base/Welcome Tommy.app" backup="$base/Welcome Tommy.previous.app"
  local plist="$agent" enable=1
  if [[ ! -e "$agent" && -f "$base/disabled-launch-agent.plist" ]]; then
    plist="$base/disabled-launch-agent.plist"
    enable=0
  fi
  if [[ ! -x "$source_app/$exe" ]]; then
    print -u2 "找不到开屏应用，请保持解压目录完整，或从源码构建通用应用。"
    return 1
  fi
  codesign --verify --deep --strict "$source_app"
  [[ "$(plutil -extract CFBundleIdentifier raw "$source_app/Contents/Info.plist")" == "$label" ]] || {
    print -u2 "应用标识与安装包不符。"; return 1
  }
  mkdir -p "$base" "${agent:h}" "$logs"
  zmodload zsh/system
  local lock_fd
  : >> "$base/.install.lock"
  zsystem flock -t 0 -f lock_fd "$base/.install.lock" || { print -u2 '另一个安装程序正在运行。'; return 1; }

  local stage
  stage=$(mktemp -d "$base/.install.XXXXXXXX")
  local stopped=0 old_app=0 old_plist=0 new_app=0 new_plist=0 registering=0 committed=0
  finish_install() {
    local result=$1 restored=1
    trap - EXIT HUP INT TERM
    set +e
    if (( !committed )); then
      if (( registering )) && launchctl print "$service" >/dev/null 2>&1; then
        launchctl bootout "$service" || restored=0
      fi
      if (( new_app )); then mv "$dest" "$stage/rejected.app" || restored=0; fi
      if (( old_app )); then mv "$stage/original.app" "$dest" || restored=0; fi
      if (( new_plist )); then mv "$plist" "$stage/rejected.plist" || restored=0; fi
      if (( old_plist )); then mv "$stage/original.plist" "$plist" || restored=0; fi
      if [[ -e "$stage/older.app" ]]; then mv "$stage/older.app" "$backup" || restored=0; fi
      if (( stopped )); then launchctl bootstrap "$domain" "$agent" || restored=0; fi
    fi
    if (( restored )); then
      rm -rf -- "$stage"
    else
      print -u2 "未能完整恢复，原文件保存在 $stage"
      result=1
    fi
    exit "$result"
  }
  trap 'finish_install $?' EXIT
  trap 'exit 1' HUP INT TERM

  # Verify the staged copy before interrupting the existing installation.
  # Preserve the downloaded app's provenance and macOS launch checks.
  ditto --extattr --qtn "$source_app" "$stage/candidate.app"
  codesign --verify --deep --strict "$stage/candidate.app"
  "$stage/candidate.app/$exe" --self-test
  local candidate_plist="$stage/candidate.plist"
  plutil -create xml1 "$candidate_plist"
  plutil -insert Label -string "$label" "$candidate_plist"
  plutil -insert ProgramArguments -json '[]' "$candidate_plist"
  plutil -insert ProgramArguments.0 -string "$dest/$exe" "$candidate_plist"
  plutil -insert RunAtLoad -bool true "$candidate_plist"
  plutil -insert KeepAlive -json '{"SuccessfulExit":false}' "$candidate_plist"
  plutil -insert ThrottleInterval -integer 10 "$candidate_plist"
  plutil -insert ProcessType -string Interactive "$candidate_plist"
  plutil -insert StandardOutPath -string "$logs/stdout.log" "$candidate_plist"
  plutil -insert StandardErrorPath -string "$logs/stderr.log" "$candidate_plist"
  plutil -lint -s "$candidate_plist"
  chmod 644 "$candidate_plist"

  if launchctl print "$service" >/dev/null 2>&1; then
    [[ -f "$agent" ]] || { print -u2 '已加载的登录项缺少原配置，无法安全更新。'; return 1; }
    launchctl bootout "$service"
    stopped=1
  fi
  if [[ -e "$dest" ]]; then mv "$dest" "$stage/original.app"; old_app=1; fi
  if [[ -e "$plist" ]]; then mv "$plist" "$stage/original.plist"; old_plist=1; fi
  mv "$stage/candidate.app" "$dest"; new_app=1
  mv "$candidate_plist" "$plist"; new_plist=1
  if (( enable )); then
    registering=1
    launchctl bootstrap "$domain" "$plist"
    # RunAtLoad starts the service. Require the same live PID on consecutive
    # observations so an immediately exiting process cannot pass the check.
    local pid='' previous='' healthy=0 attempt
    for attempt in {1..30}; do
      sleep 0.2
      pid=$(launchctl print "$service" | awk '$1=="pid" && $2=="=" && $3+0>0 {print $3; exit}') || pid=''
      if [[ -n "$pid" && "$pid" == "$previous" ]]; then healthy=1; break; fi
      previous="$pid"
    done
    (( healthy )) || { print -u2 '登录项未能保持运行，正在恢复更新前的安装。'; return 1; }
  fi
  if (( old_app )); then
    if [[ -e "$backup" ]]; then mv "$backup" "$stage/older.app"; fi
    mv "$stage/original.app" "$backup"
  fi
  committed=1
  print -r -- "已安装到 $dest"
  if (( !enable )); then print '开屏保持关闭，可运行“重新启用开场动画”恢复。'; fi
)

if [[ "${ZSH_EVAL_CONTEXT}" == toplevel ]]; then
  install_companion "${0:A:h:h}/delivery/Welcome Tommy.app" "$HOME/Library" "gui/$(id -u)"
fi
