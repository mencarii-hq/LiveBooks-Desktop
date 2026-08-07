# Run LiveBooks Desktop on Linux (WSL)

Put the AppImage on your Desktop first, e.g.
`LiveBooks-Desktop-v1.0.3-linux-x86_64.AppImage`
(or `LiveBooks Desktop-v1.0.3-linux-x86_64.AppImage` — match the real filename).

## Steps

1. Open a terminal and start WSL:

```bash
wsl
```

2. Go to your Desktop (where the AppImage is):

```bash
cd /mnt/c/Users/<YourWindowsUser>/Desktop
```

3. Make it executable, extract, and run:

```bash
chmod +x "LiveBooks-Desktop-v1.0.3-linux-x86_64.AppImage"
./"LiveBooks-Desktop-v1.0.3-linux-x86_64.AppImage" --appimage-extract
cd squashfs-root
./livebooks-desktop --no-sandbox
```

If the filename has a space (`LiveBooks Desktop-v…`), keep the quotes and use that exact name.

GPU / `dri3` / `APPIMAGE env is not defined` lines are normal under WSL and can be ignored if the window opens.
