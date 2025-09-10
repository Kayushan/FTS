@echo off
echo 🚀 Building FTS for production...

echo 📦 Installing dependencies...
call npm ci

echo 🔍 Running TypeScript check...
call npm run build

if %errorlevel% equ 0 (
    echo ✅ Build successful!
    echo 📁 Build output: dist/
    echo 🌐 Ready for Netlify deployment!
) else (
    echo ❌ Build failed!
    exit /b 1
)
