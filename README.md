# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Building a Windows executable (EXE / installer)

This project uses Tauri to bundle the web frontend into a native Windows app. Minimum requirements on Windows:

- Node.js and npm installed
- Rust toolchain (stable) with target `x86_64-pc-windows-msvc`
- Visual Studio Build Tools (MSVC) installed
- Optional: Windows SDK for MSIX/MSI targets

Quick build steps from project root (PowerShell):

```powershell
# Run once to install Rust target:
rustup target add x86_64-pc-windows-msvc;

# Then build (this runs Vite build then Tauri bundle):
npm run build:win:ps1
```

Or using npm script that runs tauri directly:

```powershell
npm run build:win
```

After a successful build, artifacts are in `src-tauri/target/release/bundle` (MSI/NSIS/App).
