"""Real LibreOffice import/roundtrip/render using a private headless profile.

Run with normal Python; pass --office for a different LibreOffice installation.
Produces ODT for semantic inspection and PDF solely for visual QA.
"""
import argparse
import io
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
NS={'office':'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'text':'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'draw':'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    'svg':'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'style':'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo':'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'xlink':'http://www.w3.org/1999/xlink'}


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        content=ET.fromstring(archive.read('content.xml'))
        body=content.find('office:body/office:text',NS)
        paragraphs=body.findall('text:p',NS)
        texts=[''.join(p.itertext()) for p in paragraphs]
        assert any('Escapes: {left} \\right 123' in t for t in texts),texts
        assert any('After color image' in t for t in texts),texts
        frames=body.findall('.//draw:frame',NS)
        assert len(frames)==2,len(frames)
        images=[]
        for frame in frames:
            width=frame.get('{'+NS['svg']+'}width');height=frame.get('{'+NS['svg']+'}height')
            # LO writes inches; the requested goals are 16 and 8 points.
            # Writer quantizes picture goals during RTF roundtrip (under 0.1 pt).
            assert abs(float(width[:-2])*72-16)<0.1,width
            assert abs(float(height[:-2])*72-8)<0.1,height
            image=frame.find('draw:image',NS)
            data=archive.read(image.get('{'+NS['xlink']+'}href'))
            pic=Image.open(io.BytesIO(data)).convert('RGB')
            assert pic.size==(16,8)
            assert pic.getpixel((0,0))==(255,0,0)
            assert pic.getpixel((15,0))==(0,205,0)
            images.append({'width':width,'height':height,'pixels':list(pic.size)})
        styles={s.get('{'+NS['style']+'}name'):s for s in content.findall('office:automatic-styles/style:style',NS)}
        properties={}
        for span in body.findall('.//text:span',NS):
            text=''.join(span.itertext())
            style=styles.get(span.get('{'+NS['text']+'}style-name'))
            if style is not None:
                props=style.find('style:text-properties',NS)
                if props is not None: properties[text]=props.attrib
        def find_property(needle,key,value):
            assert any(needle in text and props.get(key)==value for text,props in properties.items()),(needle,properties)
        find_property('Bold serif','{'+NS['fo']+'}font-weight','bold')
        find_property('italic mono','{'+NS['fo']+'}font-style','italic')
        find_property('underline','{'+NS['style']+'}text-underline-style','solid')
        centered=next(p for p in paragraphs if 'Centered paragraph' in ''.join(p.itertext()))
        paragraph_style=styles[centered.get('{'+NS['text']+'}style-name')]
        assert paragraph_style.find('style:paragraph-properties',NS).get('{'+NS['fo']+'}text-align')=='center'
        return {'paragraphs':texts,'images':images,'styles_checked':['bold','italic','underline','center']}


def inspect_colors(file):
    with zipfile.ZipFile(file) as archive:
        content=ET.fromstring(archive.read('content.xml'))
        styles={node.get('{'+NS['style']+'}name'):node for node in content.findall('office:automatic-styles/style:style',NS)}
        paragraphs=content.findall('.//text:p',NS)
        colors={}
        def walk(node,inherited='#000000'):
            style=styles.get(node.get('{'+NS['text']+'}style-name'))
            if style is not None:
                props=style.find('style:text-properties',NS)
                if props is not None:inherited=props.get('{'+NS['fo']+'}color',inherited)
            for char in node.text or '':colors[char]=inherited
            for child in node:
                walk(child,inherited)
                for char in child.tail or '':colors[char]=inherited
        for paragraph in paragraphs:walk(paragraph)
        expected=dict(zip('BCDEFGHI',['#000000','#0000cd','#cd0000','#cd00cd','#00cd00','#00cdcd','#cdcd00','#cdcdcd']))
        assert colors==expected,(colors,expected)
        return {'paragraphs':[''.join(p.itertext()) for p in paragraphs],'styles_checked':['eight text colors'],'colors':colors}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--office',type=Path,default=Path(r'C:\apps\office\LibreOffice\program\soffice.com'))
    args=parser.parse_args()
    folder=ROOT/'build/rtf/libreoffice';folder.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='profile-',dir=folder) as profile:
        def run(*arguments):
            result=subprocess.run([str(args.office),'-env:UserInstallation='+Path(profile).as_uri(),
                                   '--headless','--nologo','--nodefault','--norestore',*map(str,arguments)],
                                  capture_output=True,text=True,timeout=60)
            if result.returncode: raise RuntimeError(result.stdout+result.stderr)
            return result.stdout.strip()
        version=run('--version');results=[]
        for name in ['mixed','native-pulses','native-colors']:
            inspect_document=inspect_colors if name=='native-colors' else inspect
            source=ROOT/f'build/rtf/{name}.rtf'
            run('--convert-to','odt','--outdir',folder,source)
            first=inspect_document(folder/f'{name}.odt')
            roundtrip=folder/'roundtrip';roundtrip.mkdir(exist_ok=True)
            run('--convert-to','rtf:Rich Text Format','--outdir',roundtrip,folder/f'{name}.odt')
            reopened=folder/'reopened';reopened.mkdir(exist_ok=True)
            run('--convert-to','odt','--outdir',reopened,roundtrip/f'{name}.rtf')
            second=inspect_document(reopened/f'{name}.odt')
            assert first['paragraphs']==second['paragraphs'],(first,second)
            assert first['styles_checked']==second['styles_checked']
            run('--convert-to','pdf','--outdir',folder,source)
            assert (folder/f'{name}.pdf').is_file()
            results.append({'name':name,'roundtrip':True,'import':first,'reopened':second})
        (ROOT/'build/rtf/libreoffice-validation.json').write_text(json.dumps({'version':version,'results':results},indent=2)+'\n')
        print(f'PASS {version}: editable text, styles, alignment, PNG pixels/dimensions, RTF save/reopen; PDFs ready for visual QA')


if __name__=='__main__':main()
