---
"@tallyui/storage-sqlite": minor
---

Added `tallyui-build-sqlite-worker`, a bin script that prebuilds the web-worker entry (with esbuild) and copies `sqlite3.wasm` next to it, for Metro/Expo web apps that can't bundle a module worker at runtime.
