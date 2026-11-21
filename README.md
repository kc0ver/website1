# kC0VER · 性格纠正所·锚点

复古 Windows 98 经典桌面风格的个人站点，窗口里嵌了一个纯浏览器运行的多 AI 辩论场。无构建、无后端，纯静态托管。

- 线上地址：https://www.070226.xyz
- 部署方式：GitHub Pages（`main` 分支 + `CNAME`）

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | Win98 桌面外壳：窗口、任务栏、开始菜单、右键菜单、显示属性、移动端今日屏；自定义样式内联 |
| `ada.html` | AI 辩论场页面（在 iframe 中打开） |
| `app.js` | 辩论场逻辑：Provider、流式请求、角色、辩论/讨论/合作、导出 |
| `styles.css` | 辩论场布局与 Win98 控件适配 |
| `dawn-pro2-filter.html` | DAWN PRO2 滤波器切换小工具（桌面图标 / 开始菜单打开） |
| `pattern-lock-demo.html` | 图案解锁 Demo（桌面图标 / 开始菜单打开） |
| `vendor/win95/` | 第三方 UI 库 win95.css / win95.js 及其 MIT 许可证 |
| `manifest.json` / `sw.js` / `icons/icon.svg` | PWA 清单、离线缓存与图标 |

## 本地运行

```bash
python -m http.server 8080
```

打开 http://localhost:8080 。直接双击 `index.html` 也能浏览桌面，但 Service Worker 只在 http(s) 下注册。

## 桌面外壳

- 桌面图标双击打开（触屏单击），也可以从开始菜单或任务栏进入。
- 窗口支持拖动、缩放、最大化、最小化；最小化后点任务栏按钮恢复。
- 开始菜单含「程序 / 设置 / 关于 / 关闭系统」，窗口内菜单栏和桌面右键菜单均可使用。
- 屏幕宽度 ≤768px 时切换为 Windows Mobile 今日屏，窗口全屏显示并在标题栏提供返回按钮。
- 在「显示属性」中可把界面缩放在 100%–200% 之间调整，保存在 `localStorage` 的 `kc0ver-zoom`。
- 缩放由外层 `html` 的 `zoom` 统一控制，内嵌的辩论场随窗口整体缩放，iframe 内不再单独设置缩放。

## AI 辩论场

- 模式：辩论、讨论、合作（合作模式最后一位成员负责总结）。
- Provider：OpenRouter、OpenAI 兼容、Google Gemini、Anthropic、DeepSeek、自定义。
- 支持流式输出、图片/文本附件、裁判总结、模型发现与能力补全、导出 Markdown/JSON。

## CORS 说明

这是纯浏览器应用，所有 API 请求都由浏览器直接发出。部分官方 API 或自定义网关不允许浏览器直连，表现为 `Failed to fetch`、403 或预检失败。推荐优先使用 OpenRouter、明确支持 CORS 的 OpenAI 兼容网关，或本地开启 CORS 的模型代理。

## 安全说明

API Key 与 Provider 配置默认保存在本机浏览器的 `localStorage` 中，明文存储。请只在可信设备和浏览器中使用；如需清除，删除该站点的本地存储即可。

## 第三方资源

- [win95.css](https://github.com/concirillo-41/win95.css) v0.1.0，MIT License，包含窗口、任务栏、开始菜单、菜单、对话框等组件，以及原创的 W95 Sans 像素字体和 16 个手绘图标。许可证见 `vendor/win95/LICENSE`。

## 维护约定

- 修改静态资源后，建议同时升级 `sw.js` 里的 `CACHE` 名称；当前策略为 HTML 网络优先、静态资源缓存优先并在后台更新。
- 根目录文件会被 GitHub Pages 原样发布，不要放入与站点无关的脚本、备份或草稿文件。
