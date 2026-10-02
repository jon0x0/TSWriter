# TSWriter desktop outline-font package 1.2

Install the TTF files in **Fonts**, then completely quit and restart LibreOffice.
New TSWriter cartridge/PC exports use these exact internal family names, so Writer
selects them automatically. Renaming a .ttf file is not enough: these files have
matching internal family and style records. All are real TrueType outlines.
Timex intentionally traces the original 8x8 pixels as vector squares; the other
families use smooth outlines. No font contains embedded bitmap strikes.

## Install

- **Windows:** extract the ZIP, open Fonts, select the .ttf files, right-click and
  choose Install (Show more options may be needed). Install for all users is optional.
- **macOS:** open Font Book, choose File > Add Fonts to Current User, select the
  .ttf files, validate and install. Restart LibreOffice.
- **Linux:** copy the .ttf files to ~/.local/share/fonts/TSWriter/ and run
  `fc-cache -f ~/.local/share/fonts/TSWriter`, then restart LibreOffice.

Open **font-sample.rtf** in LibreOffice. Its family names should begin with TSWriter,
except Sinclair, which uses the original **SirClive** font. The accompanying PDF
is a reference rendered by LibreOffice with the package fonts loaded.

## Existing RTF files

For an older TSWriter export, open **prepare-existing-rtf.html** in a desktop browser,
choose the RTF, and save the prepared copy. This runs offline. It accepts only the
known, ordered TSWriter 15/16-font table; it refuses edited or unrelated tables.
It does not change document text or embedded pictures. Install the fonts before
opening the resulting RTF. A generic Arial/Times/Courier file already re-saved by
another editor may have lost the TSWriter font IDs: re-export the native document.
Existing TSRT export TAP files can be extracted normally and then prepared here.

## Typeface matches and limits

These are practical outline equivalents, not exact reconstructed GEOS fonts.
Timex 8 is an exception: its desktop family TSWriter Timex reproduces the stock
TS2068 ROM pixels in fixed eight-pixel cells. It is separate from proportional
Original 8. It deliberately looks pixelized even when enlarged. The source ROM
glyph hash and legacy character mappings are recorded in timex-provenance.json.
Cory and Dwinelle in particular are approximations. Font metrics and page wrapping
can differ from the TS2068. Courier uses the same outline source as the native
strikes. Sinclair uses the actual archived SirClive source; it is intentionally
lowercase-shaped in both cases and has limited punctuation coverage.
Most families, including Cory/Twobit, include regular, bold, italic and bold italic
files; Dwinelle and SirClive have one face, so LibreOffice synthesizes other
styles. Native RTF import still uses its existing coarse family/size matching.

LW Greek maps legacy ASCII letter slots onto Greek outlines so existing TSWriter
text remains visible as Greek. It is a display-compatibility font: the underlying
text is still Latin, not semantically encoded Unicode Greek. Punctuation/special
symbols are approximations. greek-slots.json documents the mapping.

| Native font | Desktop family | Match |
|---|---|---|
| Original | TSWriter Original | General sans-serif approximation of the ROM-derived face. |
| BSW 9 | TSWriter BSW | Compact sans-serif approximation; not an exact Chicago/BSW reconstruction. |
| University 6 | TSWriter University | Proportional sans-serif, matching the actual University bitmap category. |
| University 12 | TSWriter University | Proportional sans-serif, matching the actual University bitmap category. |
| Courier 8 | TSWriter Courier | Same outline family used to generate the native Courier strikes. |
| Courier 12 | TSWriter Courier | Same outline family used to generate the native Courier strikes. |
| Sinclair 10 | SirClive | Exact outline source of native Sinclair; original limited punctuation coverage. LibreOffice may synthesize bold/italic. |
| California 12 | TSWriter California | Helvetica-like sans-serif approximation. |
| Cory 12 | TSWriter Cory | Twobit by Neale Davidson: close retro-computer outline approximation of Cory, not an exact reconstruction. |
| Dwinelle 9 | TSWriter Dwinelle | Blackletter approximation, preserving the decorative typeface category. |
| Roma 9 | TSWriter Roma | Times-like serif approximation. |
| LW Roma 9 | TSWriter LW Roma | Times-like serif approximation. |
| LW Cal 9 | TSWriter LW Cal | Helvetica-like sans-serif approximation. |
| LW Greek 9 | TSWriter LW Greek | Greek letter outlines in legacy Latin character slots; see mapping.json. |
| LW Barrows 9 | TSWriter LW Barrows | Courier-like monospaced slab-serif approximation. |
| Timex 8 | TSWriter Timex | Exact pixel-shaped outlines and fixed eight-pixel cells from the supplied ROM. Regular face; bold/italic synthesized. |

## Licensing and reproducibility

The TSWriter-named families are renamed derivatives of the sources named in
manifest.json, except the separately credited Timex ROM transcription.
Their source licenses/copyright notices remain applicable and
are included in Licenses and the font name tables. SirClive is supplied unchanged,
with Paul Reid's original ZIP and readme retained intact. Keep Licenses with the
package. Do not sell these fonts by themselves.

Sources: Liberation 2.1.4 (https://github.com/liberationfonts/liberation-fonts),
DejaVu 2.37 (https://dejavu-fonts.github.io/), Twobit by Neale Davidson
(https://www.pixelsagas.com/?download=twobit), UnifrakturMaguntia
(https://github.com/google/fonts/tree/main/ofl/unifrakturmaguntia).

Existing GEOS recreations: KreativeKorp's Berkelium 64 recreates BSW in TrueType,
but preserves the pixel-stepped outlines. This package uses smooth equivalents
instead. See https://www.kreativekorp.com/software/fonts/c64/ and
https://www.kreativekorp.com/software/fonts/retro/ .
Open **font-comparison.html** for side-by-side native and desktop samples,
including the updated Cory/Twobit. No font installation is needed for that page.

The included native-font-comparison.png shows the actual TSWriter bitmap faces;
font-sample.pdf shows the desktop counterparts. Compare these before relying on
matching page layout; these fonts do not promise identical line breaks.

Installation references:
https://support.microsoft.com/en-us/windows/experience/personalization/manage-fonts-in-windows
https://support.apple.com/guide/font-book/install-and-validate-fonts-fntbk1000/mac

Build sources/scripts live in the TSWriter project under fonts/desktop-sources
and tools/build_desktop_fonts.py. Then run tools/make_timex_desktop.py with the
path to your TS2068 HOME ROM, followed by tools/prepare_desktop_font_package.py.
FontTools 4.65.0 was used for this package. The ROM itself is not packaged.
Windows LibreOffice is verified; macOS/Linux installation instructions are
provided, but those operating systems were not exercised here.
