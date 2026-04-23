# Dream Diary

Windows 优先的 3D 桌面日记本原型，基于 `Tauri 2 + React + TypeScript`。首版采用“3D 外观 + 2D 编辑层”的混合方案：`react-three-fiber` 负责桌面、书本、灯光与翻页氛围，正文输入则通过 `Tiptap` 覆盖在纸页之上，优先保证桌面端长期使用时的可用性。

## 当前已落地

- 打开书本的主界面、梦幻氛围背景、最近日期轨道
- 左右双页布局与日期切换翻页动画
- Tiptap 正文编辑器与手写风字体主题
- 自动保存、标题编辑、标题/摘要搜索
- 心情 / 天气真实字段与本地恢复提示
- 加密草稿缓存与异常退出后的最近编辑恢复
- 搜索关键字高亮
- 内置字体资源，减少对系统字体回退的依赖
- 首次设密与再次解锁的前后端接口
- Rust 端 SQLite 表结构、Argon2id 密钥派生、AES-256-GCM 正文加密命令面

## 项目结构

- `src/`: React 前端与交互逻辑
- `src/components/BookScene.tsx`: 3D 书本与氛围场景
- `src/components/DiaryEditor.tsx`: Tiptap 纸页编辑器
- `src/hooks/useJournalApp.ts`: 日期切换、搜索、自动保存、解锁状态
- `src/lib/bridge.ts`: 前端到 Tauri 命令桥接；浏览器预览模式会回退到本地 `localStorage`
- `src-tauri/src/lib.rs`: SQLite / 加密 / 解锁命令实现

## 运行方式

### 1. 安装前端依赖

```powershell
npm install
```

### 2. 浏览器预览

```powershell
npm run dev
```

浏览器模式主要用于调试 UI，会进入预览存储分支，不代表最终的桌面安全能力。

### 3. Tauri 桌面运行

```powershell
npm run tauri dev
```

当前工作区已经补齐 Rust toolchain 与 Visual Studio Build Tools，并成功跑通过一次 `npm run tauri dev`。

## 下一步建议

1. 安装 Rust toolchain，并先跑通 `npm run tauri dev`
2. 把“心情 / 天气 / 最近编辑恢复”从占位改成真实字段
3. 继续压缩内置中文字体体积，降低安装包尺寸
4. 为搜索增加更多筛选维度，例如日期范围或心情筛选
