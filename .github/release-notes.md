## Download

| System | File |
|---|---|
| **Windows** 10 / 11 | `Audia_…_x64-setup.exe` |
| **macOS**, Apple Silicon (M1 and later) | `Audia_…_aarch64.dmg` |
| **macOS**, Intel | `Audia_…_x64.dmg` |
| **Linux** (any distribution) | `Audia_…_amd64.AppImage` |
| **Linux**, Debian / Ubuntu | `Audia_…_amd64.deb` |
| **Linux**, Fedora / openSUSE | `Audia-…-1.x86_64.rpm` |

If Audia is already installed, it offers this update itself (Windows, macOS and the AppImage); your library and settings are kept.

**First launch:** the app isn't code-signed yet.

- **Windows:** SmartScreen may warn you. Choose **More info → Run anyway**.
- **macOS:** after dragging Audia to Applications, right-click it and choose **Open**, then **Open** again. If macOS says the app "is damaged", run `xattr -cr /Applications/Audia.app` in Terminal and try again.
- **Linux AppImage:** make it executable first (`chmod +x Audia_*.AppImage`).

The `.sig` files and `latest.json` are used by Audia's built-in updater; you don't need them.
