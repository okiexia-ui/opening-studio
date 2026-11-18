# Opening Studio v0.3.0 — Claude & app profiles

为 ChatGPT、Claude 和其他 macOS 应用提供四种开场动画，每个软件独立保存样式和开关。

- 新增 Claude 适配：官网星芒图形，默认朱砂·启卷。
- 可自定义问候：问候语、名字、政务标题、印章；连笔类样式按文字当场生成单线笔迹，中文名字也可以。
- 新增四种开屏：长城·通行（政务风，宣纸长城、身份认证、准予通行印章）、星烛·咒语、星际·远航、霓虹·雨夜，共八种样式。
- 新增 ChatGPT Classic、VS Code、Obsidian、OpenCode、Slack 预设。
- 通过“添加应用”适配其他普通 `.app`，使用本机图标与环形入口。
- 保留现有 ChatGPT 连笔版和设置，仅在进程冷启动时播放。
- 单个应用关闭、切回、恢复窗口均不影响其他配置。
- 多应用接连启动时只显示一层开屏，修正异步配置取消竞态。

## 附件

- `OpeningStudio-v0.3.0-macos-universal.zip`：macOS 13+，Apple Silicon / Intel 通用应用与安装脚本。
- `OpeningStudio-v0.3.0-source.zip`：完整源码、字体、测试、构建和 CI 配置。
- `OpeningStudio-v0.3.0-demos.zip`：原有四版与 Claude 示例，1080p / 60 fps MP4。
- `SHA256SUMS.txt`：附件校验值。

安装脚本只使用 macOS 自带工具，无需 Python。应用为 ad-hoc 签名，尚未进行 Developer ID 公证；
首次打开如被拦截，见 README 的 Gatekeeper 说明。菜单栏新增“退出”，`delivery/` 中新增卸载脚本。
Intel 为交叉编译，实际运行测试在 Apple Silicon 上完成。

测试覆盖三种标志、四主题、横竖窗口、每应用设置协议、取消竞态，
以及两个独立测试应用的生命周期和并发接替。真实第三方应用未被强制
退出逐个做冷启动测试；多屏、Spaces、全屏组合仍需更多验证。

问候语、名字、政务标题和印章文字都可以在“应用与开屏…”中修改，对所有样式生效；默认为 Welcome Tommy。本项目独立开发，不代表各厂商官方功能。
此版本保留为草稿，等待维护者发布。
