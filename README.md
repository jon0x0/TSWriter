# TSWriter for the Timex Sinclair 2068

By Jon Becker, with Codex, 2026. Uses GEOS and other fonts.

A native cartridge word processor with proportional fonts, ECM color, cropped
pictures and editable RTF interchange. This is a development release.

**[Downloads, features, keyboard reference and browser RTF tools](https://jon0x0.github.io/TSWriter/)**

- [Latest cartridge and desktop fonts](https://github.com/jon0x0/TSWriter/releases/latest)
- [Menu-by-menu guide](https://jon0x0.github.io/TSWriter/menus.html) · [Markdown version](docs/MENUS.md)
- [Keyboard commands](docs/KEYBOARD.md)
- [Build from source](BUILD.md)

## Features

- **Write and format:** Mix 16 font choices, bold, italic, underline and text colors. Align paragraphs left, center, right or justified.
- **Two display modes:** 512 × 192 high resolution and 256 × 192 ECM color. Choose wide or narrow pages; pan across a wide ECM page.
- **Edit and navigate:** Word wrapping, persistent selection, cut/copy/paste, Find, page movement and document start/end. Up to five undo states, space permitting.
- **Pictures beside text:** Import standard SCR or ECM screen images from tape, crop in 8-pixel steps, and align pictures with text flowing beside left- or right-aligned images.
- **Native documents and RTF:** Save and load native cassette documents. Export editable RTF with embedded pictures; import a supported RTF subset on the TS2068.
- **Desktop font companions:** Outline fonts for LibreOffice on Windows, macOS or Linux. The separate Timex face intentionally preserves the original pixel-shaped appearance.

Deferred `Free:` and cursor `Line:` display; interrupt-driven keyboard capture.
Text, formatting, images and undo share a 30 KB pool.

Use a TS2068-capable emulator such as Fuse with your own system ROMs. The latest
cartridge starts with an empty document. No complete system ROM is included.
The website provides downloads and conversion tools, not a browser emulator.
Printer output is not implemented. Complex RTF needs simplification; desktop
font metrics and line wrapping can differ.

## RTF tools

The browser tools run locally and do not upload selected documents:

- [Export TAP to RTF](https://jon0x0.github.io/TSWriter/tools/rtf-extractor.html)
- [Desktop RTF to import TAP](https://jon0x0.github.io/TSWriter/tools/rtf-import.html)

For offline use, keep all `desktop/rtf-*` HTML/JavaScript files together.
A normal native document save uses a different transport: convert it with
`python tools/rtf_export.py saved-document.tap document.rtf`.

Install the desktop font package before opening exports in LibreOffice. The ZIP
includes Windows/macOS/Linux instructions, comparison samples and notices.

## Source layout

`src/`: assembly; `tools/`: cartridge generation and conversion;
`fonts/`: pinned font sources; `tests/`: regression harnesses;
`docs/`: GitHub Pages site. Native tests require a caller-supplied TSRun checkout
and TS2068 ROMs. They are not browser-playable demos.

## Credits

See [third-party notices](THIRD_PARTY_NOTICES.md). No project-wide open-source
license has been selected. Third-party assets retain their original terms.
