#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
python3 scripts/install.py
print 'Opening Studio 已安装，可从菜单栏打开开屏样式。'
