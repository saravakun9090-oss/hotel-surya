param(
    [string]$mode = "release"
)

Write-Host "[build-win] Building frontend (Vite)..."
npm run build; if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit $LASTEXITCODE }

Write-Host "[build-win] Running 'tauri build' for Windows ($mode). Ensure Rust toolchain (stable) and Visual Studio Build Tools are installed."
tauri build --target x86_64-pc-windows-msvc; if ($LASTEXITCODE -ne 0) { Write-Error "Tauri build failed"; exit $LASTEXITCODE }

Write-Host "[build-win] Done. Output: src-tauri/target/release/bundle."
