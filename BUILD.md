# Build and test

Use Python 3.10+ and Pasmo (release built with 0.5.5). The cartridge build uses
Python's standard library and committed font sources. It does not need system
ROMs; the running cartridge obtains system glyphs from the user's TS2068 ROM.

## Linux / WSL

```sh
PASMO=/path/to/pasmo bash tools/build_cartridge.sh
```

## Windows with WSL

Python runs on Windows; Pasmo runs inside WSL:

```powershell
.\tools\build_cartridge.ps1 -Pasmo /path/in/wsl/to/pasmo
```

Outputs: `build/writer.dck`, `build/writer-cartridge.bin`, generated assembly,
symbols and `build/cartridge-build.json`. The download in `docs/downloads/`
is the published snapshot and is not replaced automatically by a build.

## Tests

Install Pillow for the Python image tests (`python -m pip install Pillow`).
Node.js is required for the JavaScript tests.

```sh
python tests/rtf_export.py
node tests/rtf_import_browser.mjs
node tests/rtf_compatible.mjs
```

Native tests require a caller-supplied TSRun checkout with `roms/ts2068-0.rom`
and `roms/ts2068-1.rom`. Generate synthetic RTF fixtures with the Python test above.

```sh
node tests/cartridge_pool.mjs /path/to/TSRun
node tests/rtf_cartridge.mjs /path/to/TSRun
node tests/rtf_cartridge.mjs /path/to/TSRun --pulses
```

Some performance tests take a caller-supplied document TAP as an extra argument.
Private documents and test output are excluded. Validation is emulator-based;
it does not certify physical hardware.

## Website

GitHub Pages serves `docs/` from `main`. Preview locally with:

```sh
python -m http.server 8000 --directory docs
```

`docs/tools/` scripts must match their `desktop/` originals. Font ZIPs are
release assets, preserving the included notices.

## Homepage rich-text sample

The homepage includes a static HTML conversion of `docs/downloads/introexport.rtf`,
editable locally in the browser. It does not parse arbitrary RTF or save edits.
The original download and LibreOffice reference screenshot remain available.

To regenerate after replacing the RTF, export it with LibreOffice using
`--headless --convert-to "html:HTML (StarWriter)" --outdir build/rtf-web`, then run
`python tools/build_web_sample.py build/rtf-web/introexport.html /path/to/desktop/font-package`.
This requires FontTools. The script uses the desktop package manifest to preserve
font family names and generate WOFF files, and retains the applicable notices.
It adapts this sample's single left-floating PNG picture and uses 200% type sizes
for readable browser display. Check the live layout after regeneration.
