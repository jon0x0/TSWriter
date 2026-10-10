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

GitHub Actions builds the Pages artifact from `docs/` plus a checksum-verified
TSRun runtime. The emulator's files and system ROMs are generated under
`build/pages/play/tsrun/`, rather than stored in the TSWriter source tree.
Build and verify the complete site with:

```sh
git -c core.autocrlf=false clone https://github.com/josef-jelinek/TSRun build/tsrun
git -C build/tsrun checkout 41dbe3e41c692a1806f2cb900c5a0faa1549ae77
python tools/build_pages.py --tsrun build/tsrun
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node tests/browser_player.mjs
python -m http.server 8000 --directory build/pages
```

`docs/tools/` scripts must match their `desktop/` originals. Font ZIPs are
release assets, preserving the included notices.

The player uses the published `docs/downloads/writer.dck` snapshot, verified
against `SHA256SUMS.txt`; it does not represent a new cartridge build. The
browser regression checks cold boot, actual keyboard input into document RAM,
backspace, menus, paragraphs, tape insertion without a reset, and reset. It
blocks external runtime requests. Update the pinned revision and
`tools/tsrun-lock.json` together when intentionally upgrading TSRun.

Known limitation: loading the published `IntroDoc.tap` through File → Load
from tape fails after its metadata blocks in the pinned TSRun runtime. This
player supports editing a new document; use Fuse for document transfers.
TSRun also does not record tape output. These are browser limitations, not
claims about the cartridge's hardware or Fuse support.

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
