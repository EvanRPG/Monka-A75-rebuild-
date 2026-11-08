# 参与贡献 / Contributing

## 反馈问题

不需要会写代码。到 [Issues](https://github.com/EvanRPG/Monka-A75-rebuild-/issues) 新建一个「问题反馈」，写清楚：

- 你做了什么，键盘或软件实际怎样；
- 用的是数据线还是 2.4G 接收器；
- 软件版本（设置 → 关于）；
- 找不到键盘时，页面上「生成诊断信息」的结果。

能附截图更好。

灯效预览和真键盘对不上时，写灯效名字和真键盘的样子就行。

## 开发

需要 Node.js 22 和 Rust（stable）。

```sh
cd app
npm ci
npm run tauri dev                      # 运行软件
npx vite build --config vite.preview.config.ts   # 不连键盘的网页演示版
npx tsc --noEmit && npx vitest run     # 前端检查

cd src-tauri
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --lib
```

Windows 安装包：仓库根目录的 `build-windows.bat`，或推送 `v*` 标签让 GitHub Actions 自动构建并发布。

### 代码结构

| 位置 | 内容 |
|---|---|
| `app/src` | 界面（React + TypeScript） |
| `app/src/lib/i18n-en.ts` | 英文翻译，键是中文原文；新文字用 `t("中文")` 包起来再补英文 |
| `app/src/lib/preview.ts` | 灯效页的动画预览 |
| `app/src-tauri/src/a75.rs` | A75 专用功能：律动、屏幕光影、仪表、按程序切换、打字统计、回报率 |
| `app/src-tauri/src` 其他文件 | 来自 sharkfin 的键盘通信后端 |
| `docs/PROTOCOL.md` | 通信协议说明（来自 sharkfin） |

### 安全规则

键盘是真实硬件，写错的命令会落到键盘上。

- 不刷固件，不发原版驱动不会发的写命令。
- 新的写入路径必须先有证据：原版驱动代码、抓包，或真机写入后回读一致。
- 落到闪存的写入要限速，限速放在后端，不放在界面。
- 发送出错不能忽略。
- 测试说明里每一项都要写清恢复方法：拔插数据线，或用原版驱动「恢复默认」。

## English

Bug reports: open an issue with what happened, cable or 2.4G, the app version (Settings → About) and, if the keyboard is not found, the diagnostic report from the app.

Development: Node.js 22 and stable Rust. `cd app && npm ci && npm run tauri dev`. Checks: `npx tsc --noEmit && npx vitest run`, then `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --lib` in `app/src-tauri`. Interface strings are Chinese wrapped in `t()`, with English in `app/src/lib/i18n-en.ts`.

The keyboard is real hardware. Never flash firmware, never send a write the vendor driver does not send, rate-limit flash writes in the backend, and never ignore a send error.
