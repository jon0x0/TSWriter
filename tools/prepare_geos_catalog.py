"""Extract compact original GEOS strikes; derive Dwinelle 9 from its sole 18.

Original CVTs stay unchanged. Their last sector may omit unused padding.
"""
from pathlib import Path
import hashlib, json, struct
from geos_font import cvt_strike, decode

root=Path(__file__).resolve().parents[1]
choices=[('California','CALIF',12),('Cory','CORY',12),('Dwinelle','DWIN',18),
         ('Roma','ROMA',9),('LW Roma','LWROMA',9),('LW Cal','LWCAL',9),
         ('LW Greek','LWGREEK',9),('LW Barrows','LWBarrows',9)]
catalog=[]
for name,source,size in choices:
    cvt=(root/f'fonts/sources/{source}.cvt').read_bytes()
    raw=cvt_strike(cvt+bytes((-len(cvt))%254),size)
    derived=False
    if name=='Dwinelle':
        font=decode(raw);indices=[0];glyphs=[]
        for g in font['glyphs']:
            width=(g['advance']+1)//2;rows=[]
            for y in range(9):
                row=0
                for x in range(width):
                    ink=sum((g['rows'][yy]>>(g['advance']-1-xx))&1 for yy in range(y*2,y*2+2) for xx in range(x*2,min(x*2+2,g['advance'])))
                    row=(row<<1)|(ink>=2)
                rows.append(row)
            glyphs.append((width,rows));indices.append(indices[-1]+width)
        stride=(indices[-1]+7)//8;bitmap=bytearray(stride*9)
        for (width,rows),start in zip(glyphs,indices):
            for y,row in enumerate(rows):
                for x in range(width):
                    if row&(1<<(width-x-1)):bitmap[y*stride+(start+x)//8]|=128>>((start+x)%8)
        raw=struct.pack('<BHBHH',7,stride,9,8,202)+struct.pack('<97H',*indices)+bitmap
        size=9;derived=True
    filename=name.replace(' ','')+str(size)+'.raw'
    font=decode(raw)
    assert max(g['advance'] for g in font['glyphs'])<=13
    assert 10-font['baseline']+font['height']<=14
    (root/'fonts/sources'/filename).write_bytes(raw)
    (root/'fonts/packs'/(Path(filename).stem+'.json')).write_text(json.dumps(font,indent=2)+'\n')
    catalog.append(dict(name=f'{name} {size}',file=filename,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),source=source+'.cvt',derived=derived))
(root/'fonts/geos-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
print('Additional GEOS fonts:',sum(f['bytes'] for f in catalog),'ROM bytes')
