$ErrorActionPreference = "Stop"
Write-Host "=== 琉璃记 (LexiGlass) Rust (Tauri v2) 构建脚本 ===" -ForegroundColor Cyan

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "[!] 当前环境未检测到 cargo，可通过 winget 安装 Rustup:" -ForegroundColor Yellow
    Write-Host "    winget install Rustlang.Rustup" -ForegroundColor Green
    exit 1
}

Push-Location "$PSScriptRoot\src-tauri"
try {
    Write-Host "[+] 正在编译 LexiGlass Rust 核心..." -ForegroundColor Cyan
    cargo build --release
    Write-Host "[✓] 编译完成：src-tauri\target\release\lexiglass.exe" -ForegroundColor Green
} finally {
    Pop-Location
}
