# 🫧 琉璃记 · LexiGlass

> **Modern Frosted-Glass Vocabulary & Everything Memory Studio with Floating Corner Quick-Jot Bubble**  
> 基于 **Rust (Tauri v2 + window-vibrancy)** 架构设计的现代毛玻璃全能记忆与大屏角落「随手记」气泡软件。设计风格融合 **网易云音乐桌面端（极光流光毛玻璃 + 桌面歌词胶囊）** 与 **OpenAI Codex / Raycast（极夜暗黑玻璃面板 + 全键盘流交互）**。

---

## ✨ 核心特性

1. **🎓 记单词 + ⚡ 记万物（Multi-Deck Memory Engine）**
   - **内置完整四六级真题词库（1,534 张卡片开箱即用）**：
     - 《CET-6 六级核心必考 1,000 词（50组完整版，含真题搭配与 `★` 亮点词）》
     - 《CET-4 四级核心词汇（27组共 528 词）》
     - 《嵌入式 Linux / C语言指针 / Rust 所有权 / 运维规则记忆卡》
   - **支持新建任意记忆卡片**：既可以背单词，也可以记 Linux 命令、C 语言指针考点、代码片段或日常知识问答。
   - **与本地 Obsidian 知识库双向联动**：Rust 后端原生支持解析本机 `Obsidian_Knowledge_Vault\04-系统知识\英语\六级单词.md` 与 `四级单词.md`。

2. **🫧 大屏角落「随手记」悬浮气泡窗（Corner Quick-Jot Bubble）**
   - 专为大显示器多任务场景打造，在屏幕右下角常驻精致的**毛玻璃悬浮胶囊/小窗**：
     - **角落漫游背词胶囊**：平时不遮挡工作视线，每 8～10 秒安静轮播一个六级重点词，鼠标点按即发音并切换下一词（如网易云音乐桌面歌词体验）。
     - **随手记极速录入**：遇到生词或突发灵感，直接在气泡框输入英文单词（**自动匹配内置 1,500+ 四六级词库并自动补全中文释义！**）或任意笔记/命令，回车即存，并可一键转为正式记忆闪卡。

3. **⌨️ 三大记忆模式 & 全键盘流快捷键**
   - **🎴 3D 琉璃闪卡模式**：支持 180° 翻转、Web Speech TTS 美音朗读、SM-2 艾宾浩斯四档反馈（`1-忘了 Again` / `2-模糊 Hard` / `3-认识 Good` / `4-秒答 Easy`）。
   - **⌨️ 沉浸听写拼写模式**：看释义听发音盲打拼写单词，攻克六级听力与写作拼写。
   - **📋 词表速刷与遮挡自测模式**：一键模糊遮盖中文列或英文列，鼠标悬停即显。
   - **全局检索面板（`Ctrl + K`）**：毫秒级检索 1,500+ 四六级词汇与随手记。

---

## 🚀 快速启动与构建方式

### 方式一：零等待即刻启动（Windows 桌面应用窗口模式）
无需等待 Rust 编译，直接双击项目根目录下的启动脚本即可使用完整功能：
- 双击 **`启动-琉璃记主界面.bat`**：以无地址栏独立桌面窗口启动「琉璃记 · LexiGlass」主工作台。
- 双击 **`启动-大屏角落随手记气泡窗.bat`**：直接在大屏幕右下角弹出 **360×440 独立毛玻璃「随手记」气泡窗口**。

### 方式二：编译原生 Rust (Tauri v2) 桌面可执行文件
```powershell
# 自动检查/安装 Rust 工具链并编译 Release 版原生程序
pwsh -ExecutionPolicy Bypass -File .\build-rust.ps1
```
或者手动进入 `src-tauri` 编译：
```powershell
cd src-tauri
cargo build --release
```

---

## 📂 目录结构

```text
LexiGlass/
├── PROMPT.md                         # 深度优化版全栈产品与架构提示词 (Master Prompt)
├── README.md                         # 项目说明文档
├── 启动-琉璃记主界面.bat             # 一键启动主工作台独立窗口
├── 启动-大屏角落随手记气泡窗.bat     # 一键在大屏右下角弹出「随手记」毛玻璃气泡窗
├── build-rust.ps1                    # Rust (Tauri v2) 环境检查与一键编译脚本
├── src-tauri/                        # Rust 后端核心源码
│   ├── Cargo.toml                    # Rust 依赖配置 (tauri v2, window-vibrancy, serde...)
│   ├── tauri.conf.json               # 双窗口配置 (main 主窗口 + bubble 角落置顶透明窗)
│   └── src/
│       ├── main.rs                   # Windows 子系统入口
│       ├── lib.rs                    # Tauri IPC 命令与 Windows 原生 Acrylic 毛玻璃挂载
│       ├── models.rs                 # 单词卡 / 万物记忆卡 / 随手记 / SM-2 数据结构
│       ├── storage.rs                # 本地状态持久化与 SM-2 艾宾浩斯算法实现
│       └── obsidian_sync.rs          # Obsidian 知识库 Markdown 词表解析与双向同步
└── ui/                               # 现代毛玻璃前端视图层
    ├── index.html                    # 主工作台视图 (含右下角内嵌随手记气泡坞)
    ├── bubble.html                   # 独立大屏角落「随手记」悬浮气泡窗视图
    ├── styles.css                    # 网易云流光 × Codex 深空毛玻璃样式表
    ├── app.js                        # 双模运行引擎 (Tauri IPC + BroadcastChannel 多窗同步)
    └── data/
        └── builtin_decks.js          # 内置 1,534 张四六级核心词与技术记忆卡数据
```
