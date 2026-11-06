@echo off
chcp 65001 >nul
title 海南当代艺术文献 · 数字档案库

set "NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Users\Administrator\.trae-cn\binaries\node\versions\26.13.0\node.exe" (
    set "NODE=C:\Users\Administrator\.trae-cn\binaries\node\versions\26.13.0\node.exe"
  ) else (
    echo 未找到 Node.js，请先安装 Node.js 22 或更高版本。
    pause
    exit /b 1
  )
)

"%NODE%" "%~dp0server.js"
pause
