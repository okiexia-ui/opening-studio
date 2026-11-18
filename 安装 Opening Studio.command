#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
zsh scripts/install.sh
print 'Opening Studio 已安装，可从菜单栏圆点环图标打开“应用与开屏…”。'
