"""Preserve all four official Twobit outlines while aliasing the RTF family."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/font-tools'))
from fontTools.ttLib import TTFont
for style,suffix in {'Regular':'','Bold':' Bold','Italic':' Italic','BoldItalic':' Bold Italic'}.items():
 a=TTFont(ROOT/'fonts/desktop-sources'/('Twobit'+suffix+'.otf'))
 b=TTFont(ROOT/'desktop/font-package/Fonts'/('TSWriterCory-'+style+'.ttf'))
 assert a.getGlyphOrder()==b.getGlyphOrder()
 assert a['glyf'].compile(a)==b['glyf'].compile(b),style
 assert a['hmtx'].metrics==b['hmtx'].metrics,style
 assert b['name'].getDebugName(1)=='TSWriter Cory'
 assert b['OS/2'].fsType==0
print('PASS: four Twobit faces retain source outlines and advances; correct Cory family')
