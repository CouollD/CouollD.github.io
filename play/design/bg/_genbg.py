import random, math
import os; OUT=os.path.dirname(os.path.abspath(__file__))+'/'
W,H=360,560
def svg(body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin slice"><defs>{defs}</defs>{body}</svg>'
def lg(id,stops,x2=0,y2=1):
    s=''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o,c in stops)
    return f'<linearGradient id="{id}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'
def rg(id,c,a0=0.9,a1=0):
    return f'<radialGradient id="{id}"><stop offset="0" stop-color="{c}" stop-opacity="{a0}"/><stop offset="1" stop-color="{c}" stop-opacity="{a1}"/></radialGradient>'
def bokeh(rnd,n,colors,y0,y1,rmin=6,rmax=26,amin=.12,amax=.4):
    s=''
    for i in range(n):
        c=rnd.choice(colors); x=rnd.uniform(0,W); y=rnd.uniform(y0,y1); r=rnd.uniform(rmin,rmax); a=rnd.uniform(amin,amax)
        s+=f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}" opacity="{a:.2f}"/>'
    return s
def skyline(rnd,base,ymin,ymax,fill,win,wcol,seed_w=(18,40),lit=.35):
    s='';x=-10
    while x<W:
        w=rnd.uniform(*seed_w); h=rnd.uniform(ymin,ymax); y=base-h
        s+=f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h+2:.1f}" fill="{fill}"/>'
        if win:
            for wy in range(int(y+8),int(base-6),11):
                for wx in range(int(x+4),int(x+w-5),9):
                    if rnd.random()<lit:
                        s+=f'<rect x="{wx}" y="{wy}" width="4" height="5" fill="{rnd.choice(wcol)}" opacity="{rnd.uniform(.5,.95):.2f}"/>'
        x+=w+rnd.uniform(0,3)
    return s

# ---------------- A: neon night ----------------
def A(scene):
    r=random.Random({'izakaya':1,'street':2,'out':3,'station':4}[scene])
    d=''; b=''
    if scene=='izakaya':
        d=lg('g',[(0,'#1B2058'),(.45,'#141A47'),(1,'#0A0D28')])+rg('rose','#FF5C93',.55)+rg('lem','#FFE45C',.6)+rg('cy','#4FD8FF',.4)
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        b+=f'<circle cx="300" cy="120" r="150" fill="url(#rose)" opacity=".5"/><circle cx="40" cy="260" r="140" fill="url(#cy)" opacity=".45"/>'
        b+=bokeh(r,34,['#FF6FA0','#FFE45C','#6FE0FF','#B79BFF'],20,330,5,22,.10,.35)
        # pendant lamps
        for x,c in ((118,"lem"),(178,"rose")):
            b+=f'<circle cx="{x}" cy="62" r="62" fill="url(#{c})" opacity=".55"/><line x1="{x}" y1="0" x2="{x}" y2="38" stroke="#0A0D28" stroke-width="2"/><path d="M{x-17} 56 Q{x} 28 {x+17} 56Z" fill="#0A0D28"/><ellipse cx="{x}" cy="57" rx="12" ry="4" fill="{"#FFE45C" if c=="lem" else "#FF86AE"}"/>'
        # shelf with bottles
        b+='<rect x="0" y="262" width="360" height="5" fill="#0A0D28"/><rect x="0" y="262" width="360" height="1.2" fill="#FF7FAE" opacity=".8"/>'
        x=6
        while x<W:
            bw=r.uniform(9,15); bh=r.uniform(26,46)
            b+=f'<rect x="{x:.1f}" y="{262-bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="3" fill="#0B0F2E" opacity=".92"/><rect x="{x+bw*0.35:.1f}" y="{262-bh-8:.1f}" width="{bw*0.3:.1f}" height="10" fill="#0B0F2E" opacity=".92"/><rect x="{x+1.5:.1f}" y="{262-bh+4:.1f}" width="1.6" height="{bh-8:.1f}" fill="#9FA8FF" opacity=".35"/>'
            x+=bw+r.uniform(3,9)
    elif scene=='street':
        d=lg('g',[(0,'#1D1A58'),(.5,'#6B2F80'),(.82,'#D9577A'),(1,'#F59B6B')])+rg('lem','#FFE45C',.7)+rg('rose','#FF5C93',.6)
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        b+=f'<circle cx="70" cy="380" r="120" fill="url(#lem)" opacity=".5"/><circle cx="310" cy="420" r="130" fill="url(#rose)" opacity=".45"/>'
        b+=bokeh(r,26,['#FFE45C','#FF8FB5','#8FE6FF'],80,430,6,24,.10,.30)
        b+=skyline(r,540,60,230,'#14153F',True,['#FFE45C','#FFB36B','#FF8FB5'],(22,46),.30)
        b+=f'<rect y="500" width="{W}" height="60" fill="#0C0E2C"/><rect y="500" width="{W}" height="2" fill="#FF8FB5" opacity=".6"/>'
    else:
        d=lg('g',[(0,'#070A22'),(.6,'#161C4C'),(1,'#2A2F6A')])+rg('rose','#FF5C93',.7)+rg('cy','#4FD8FF',.55)+rg('lem','#FFE45C',.6)
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        b+=bokeh(r,30,['#FF6FA0','#FFE45C','#6FE0FF','#B79BFF'],40,430,5,22,.10,.32)
        b+=skyline(r,470,70,250,'#0E1238',True,['#FFE45C','#FF8FB5','#8FE6FF'],(24,50),.28)
        # neon strips
        b+=f'<rect x="40" y="250" width="64" height="5" rx="2.5" fill="#FF5C93"/><circle cx="72" cy="252" r="55" fill="url(#rose)" opacity=".5"/>'
        b+=f'<rect x="250" y="190" width="5" height="70" rx="2.5" fill="#4FD8FF"/><circle cx="252" cy="225" r="60" fill="url(#cy)" opacity=".45"/>'
        b+=f'<rect x="150" y="300" width="70" height="5" rx="2.5" fill="#FFE45C"/><circle cx="185" cy="302" r="50" fill="url(#lem)" opacity=".4"/>'
        # wet ground
        b+=f'<rect y="470" width="{W}" height="90" fill="#0A0E2E"/><rect y="470" width="{W}" height="90" fill="url(#g2)" opacity=".5"/>'
        d+=lg('g2',[(0,'#FF5C93'),(1,'#0A0E2E')])
        b+=bokeh(r,12,['#FF6FA0','#6FE0FF','#FFE45C'],475,550,3,12,.12,.3)
    return svg(b,d)

# ---------------- B: wood + lantern ----------------
def lantern(x,y,rx,ry,glow='gl'):
    s=f'<circle cx="{x}" cy="{y}" r="{rx*2.3}" fill="url(#{glow})" opacity=".85"/>'
    s+=f'<line x1="{x}" y1="0" x2="{x}" y2="{y-ry}" stroke="#1A0F08" stroke-width="2"/>'
    s+=f'<rect x="{x-rx*.5}" y="{y-ry-5}" width="{rx}" height="7" rx="2" fill="#1A0F08"/>'
    s+=f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="url(#lan)"/>'
    for k in range(-3,4):
        yy=y+k*ry/3.6; ww=rx*math.sqrt(max(0,1-(k/3.6)**2))
        s+=f'<path d="M{x-ww:.1f} {yy:.1f} Q{x} {yy+3:.1f} {x+ww:.1f} {yy:.1f}" stroke="#7A1E10" stroke-width="1" fill="none" opacity=".55"/>'
    s+=f'<rect x="{x-rx*.5}" y="{y+ry-3}" width="{rx}" height="7" rx="2" fill="#1A0F08"/>'
    s+=f'<ellipse cx="{x-rx*.3}" cy="{y-ry*.3}" rx="{rx*.22}" ry="{ry*.35}" fill="#FFD27A" opacity=".5"/>'
    return s
def B(scene):
    r=random.Random({'izakaya':11,'street':12,'out':13}[scene])
    d=rg('gl','#FFA83C',.55)+lg('lan',[(0,'#C8321C'),(.5,'#F0763A'),(1,'#C8321C')],1,0).replace('x2="1" y2="0"','x2="1" y2="0"')
    b=''
    if scene=='izakaya':
        b+=f'<rect width="{W}" height="{H}" fill="#3A2318"/>'
        x=0;i=0
        cols=['#3F271A','#47301F','#3A2318','#4C3322','#42291B']
        while x<W:
            w=r.choice([34,38,42,46]); b+=f'<rect x="{x}" y="0" width="{w}" height="{H}" fill="{cols[i%5]}"/><rect x="{x}" y="0" width="1.6" height="{H}" fill="#24120A"/>'
            # grain
            for _ in range(5):
                gx=x+r.uniform(5,w-5); gy=r.uniform(0,H); b+=f'<path d="M{gx:.1f} {gy:.1f} q2 25 0 {r.uniform(30,90):.1f}" stroke="#2A170D" stroke-width=".8" fill="none" opacity=".5"/>'
            x+=w;i+=1
        # upper shoji band
        b+=f'<rect x="0" y="0" width="{W}" height="26" fill="#1F120A"/><rect x="0" y="26" width="{W}" height="2" fill="#6B4328"/>'
        # shelf
        b+=f'<rect x="0" y="236" width="{W}" height="6" fill="#241309"/><rect x="0" y="236" width="{W}" height="1.5" fill="#B77A3C" opacity=".7"/>'
        x=8
        while x<W:
            bw=r.uniform(11,18);bh=r.uniform(30,52)
            col=r.choice(['#1B2A24','#23190F','#1A2438','#2B1B12'])
            b+=f'<rect x="{x:.1f}" y="{236-bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="4" fill="{col}"/><rect x="{x+bw*.38:.1f}" y="{236-bh-9:.1f}" width="{bw*.24:.1f}" height="11" fill="{col}"/><rect x="{x+bw*.2:.1f}" y="{236-bh*.6:.1f}" width="{bw*.6:.1f}" height="{bh*.28:.1f}" fill="#E2D2A8" opacity=".75"/><rect x="{x+1.5:.1f}" y="{236-bh+4:.1f}" width="1.4" height="{bh-10:.1f}" fill="#FFD9A0" opacity=".25"/>'
            x+=bw+r.uniform(4,10)
        # strips
        for sx in (118,246):
            b+=f'<rect x="{sx}" y="92" width="22" height="86" fill="#E4D6B2"/><rect x="{sx}" y="92" width="22" height="3" fill="#8F2D1E"/>'
            for k in range(4): b+=f'<rect x="{sx+8+r.uniform(-2,2):.1f}" y="{104+k*17}" width="5" height="{r.uniform(7,13):.1f}" rx="1.5" fill="#241309"/>'
        for lx,lry in ((48,40),(182,34),(312,42)):
            b+=lantern(lx,70,26,lry)
        b+=f'<rect width="{W}" height="{H}" fill="url(#vg)"/>'
        d+='<radialGradient id="vg" cx=".5" cy=".38" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0D0603" stop-opacity=".62"/></radialGradient>'
    elif scene=='street':
        d+=lg('sky',[(0,'#1B2440'),(.5,'#5A3F4E'),(.8,'#C77A44'),(1,'#F0B25E')])
        b+=f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
        b+=bokeh(r,14,['#FFC070','#FFA040'],120,380,6,20,.1,.25)
        b+=skyline(r,430,60,170,'#2A1A14',False,[],(30,64))
        # roofs
        for x in range(-10,W,64): b+=f'<path d="M{x} 300 L{x+32} 262 L{x+64} 300Z" fill="#1E120D" opacity=".55"/>'
        # string of lanterns
        b+='<path d="M-10 70 Q180 150 370 66" stroke="#1A0F08" stroke-width="2" fill="none"/>'
        for t in [i/9 for i in range(1,9)]:
            x=-10+380*t; y=70+ (4*(1-t)*t)*40*1.0 + 4*(t*(1-t))*0 
            y=(1-t)**2*70+2*(1-t)*t*150+t**2*66
            b+=f'<circle cx="{x:.1f}" cy="{y+14:.1f}" r="34" fill="url(#gl)" opacity=".7"/><ellipse cx="{x:.1f}" cy="{y+14:.1f}" rx="10" ry="13" fill="#E8512A"/><rect x="{x-5:.1f}" y="{y:.1f}" width="10" height="3" fill="#1A0F08"/><rect x="{x-5:.1f}" y="{y+25:.1f}" width="10" height="3" fill="#1A0F08"/>'
        b+=f'<rect y="430" width="{W}" height="130" fill="#241711"/><rect y="430" width="{W}" height="3" fill="#C78A4A" opacity=".45"/>'
        for x in range(0,W,46): b+=f'<rect x="{x}" y="470" width="30" height="3" fill="#3A281D"/>'
    else:
        d+=lg('sky',[(0,'#0B111C'),(1,'#1B2230')])
        b+=f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
        # shop facade
        b+=f'<rect x="0" y="150" width="{W}" height="330" fill="#2B1B13"/>'
        # lattice door glow
        b+=f'<rect x="70" y="210" width="220" height="230" fill="#E39A3E" opacity=".9"/><rect x="70" y="210" width="220" height="230" fill="url(#gl)" opacity=".6"/>'
        for k in range(0,221,22): b+=f'<rect x="{70+k}" y="210" width="3" height="230" fill="#2B1B13"/>'
        for k in range(0,231,38): b+=f'<rect x="70" y="{210+k}" width="220" height="3" fill="#2B1B13"/>'
        b+=f'<rect x="60" y="200" width="240" height="12" fill="#1A0F08"/>'
        # noren
        for k,x in enumerate((84,150,216)):
            b+=f'<rect x="{x}" y="150" width="60" height="78" fill="#1F3459"/><rect x="{x}" y="150" width="60" height="5" fill="#16243F"/><rect x="{x+20}" y="176" width="20" height="26" rx="10" fill="#EDE3C8" opacity=".92"/>'
        b+=f'<rect x="60" y="145" width="240" height="8" fill="#1A0F08"/>'
        # lanterns
        b+=lantern(30,92,22,32)+lantern(330,92,22,32)
        b+=f'<rect y="470" width="{W}" height="90" fill="#171B22"/>'
        for x in range(0,W,60): b+=f'<rect x="{x}" y="490" width="44" height="3" fill="#232933"/>'
        b+=f'<ellipse cx="180" cy="480" rx="170" ry="26" fill="url(#gl)" opacity=".55"/>'
    return svg(b,d)

# ---------------- C: pastel airy ----------------
def cloud(x,y,s,op=.85):
    return f'<g opacity="{op}" fill="#fff"><ellipse cx="{x}" cy="{y}" rx="{34*s}" ry="{13*s}"/><ellipse cx="{x-22*s}" cy="{y+4*s}" rx="{22*s}" ry="{10*s}"/><ellipse cx="{x+24*s}" cy="{y+3*s}" rx="{24*s}" ry="{11*s}"/><ellipse cx="{x+4*s}" cy="{y-8*s}" rx="{20*s}" ry="{11*s}"/></g>'
def C(scene):
    r=random.Random({'izakaya':21,'street':22,'out':23}[scene])
    d='';b=''
    if scene=='izakaya':
        d=lg('g',[(0,'#E9F7F3'),(.55,'#F1F3FC'),(1,'#F9EEF6')])
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        for x,y,rr,c,a in ((300,90,120,'#BFEBDD',.55),(30,200,110,'#FFD9E4',.5),(190,330,150,'#D9DCFF',.45),(340,330,90,'#FFEFC2',.55)):
            b+=f'<circle cx="{x}" cy="{y}" r="{rr}" fill="{c}" opacity="{a}"/>'
        # string lights
        b+='<path d="M-10 26 Q90 78 180 36 T370 30" stroke="#B9C2D6" stroke-width="1.5" fill="none"/>'
        pts=[]
        for t in [i/13 for i in range(1,13)]:
            x=-10+380*t; y=26+ 40*math.sin(t*math.pi*2.0)*0.9+ 28*(1-abs(2*t-1))*0.0+ 24*math.sin(t*math.pi)
            col=r.choice(['#FFD36B','#FF9BB8','#7FE0CB','#A9B8FF'])
            b+=f'<circle cx="{x:.1f}" cy="{y+5:.1f}" r="13" fill="{col}" opacity=".25"/><circle cx="{x:.1f}" cy="{y+5:.1f}" r="4.2" fill="{col}"/>'
        # leaves
        for x,y,rot in ((14,300,-20),(346,290,20)):
            for k in range(5): b+=f'<ellipse cx="{x+(k-2)*7}" cy="{y-k*5}" rx="7" ry="22" fill="#9ED9C5" opacity=".7" transform="rotate({rot+(k-2)*18} {x} {y+30})"/>'
        b+=bokeh(r,10,['#fff'],60,300,3,10,.5,.8)
    elif scene=='street':
        d=lg('g',[(0,'#BFE7F8'),(.55,'#E6EFFA'),(1,'#FFE2D2')])+rg('sun','#FFF1B8',.95)
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/><circle cx="290" cy="110" r="90" fill="url(#sun)"/><circle cx="290" cy="110" r="26" fill="#FFF4C4"/>'
        b+=cloud(70,90,1.1)+cloud(200,60,.8,.9)+cloud(300,190,.9,.7)+cloud(40,240,.8,.7)
        # school building
        b+='<rect x="0" y="330" width="360" height="160" fill="#D5DDF3"/><rect x="0" y="330" width="360" height="6" fill="#C2CCEA"/>'
        for x in range(14,350,46):
            for y in (348,392): b+=f'<rect x="{x}" y="{y}" width="30" height="26" rx="4" fill="#F4F8FF"/><rect x="{x+14}" y="{y}" width="2" height="26" fill="#D5DDF3"/>'
        b+='<rect x="150" y="268" width="60" height="64" fill="#C8D3EF"/><circle cx="180" cy="290" r="11" fill="#fff"/><rect x="179" y="283" width="2" height="8" fill="#8E9BC4"/><rect x="179" y="290" width="6" height="2" fill="#8E9BC4"/>'
        # trees
        for x,y,rr in ((24,430,44),(100,440,36),(262,436,40),(336,426,46)):
            b+=f'<circle cx="{x}" cy="{y}" r="{rr}" fill="#BFE6CE"/><circle cx="{x-10}" cy="{y-8}" r="{rr*.6}" fill="#D2F0DC" opacity=".8"/>'
        b+='<rect y="478" width="360" height="90" fill="#EDEFF7"/><rect y="478" width="360" height="3" fill="#DDE2F2"/>'
        for x in range(0,360,52): b+=f'<rect x="{x}" y="520" width="30" height="4" rx="2" fill="#fff"/>'
    else:
        d=lg('g',[(0,'#BFC8FA'),(.5,'#F2CDEB'),(1,'#FFE3C9')])
        b+=f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        b+=bokeh(r,16,['#fff'],20,200,1.5,3.5,.6,.95)
        b+=cloud(80,120,1.0,.55)+cloud(280,170,.9,.45)
        b+=skyline(r,470,60,200,'#B9AEE0',True,['#FFF3C2','#FFFFFF'],(24,46),.35)
        b+=skyline(r,500,30,110,'#A397D3',False,[],(30,60))
        b+='<rect y="490" width="360" height="80" fill="#8D82C4" opacity=".55"/>'
        for x,y,c in ((50,300,'#FF9BB8'),(300,260,'#7FE0CB'),(190,330,'#FFD36B')):
            b+=f'<rect x="{x-24}" y="{y}" width="48" height="5" rx="2.5" fill="{c}"/><circle cx="{x}" cy="{y+2}" r="34" fill="{c}" opacity=".22"/>'
    return svg(b,d)

for th,fn in (('A',A),('B',B),('C',C)):
    for sc in (['izakaya','street','out'] + (['station'] if th=='A' else [])):
        if th!='A' and sc=='station': continue
        open(f'{OUT}{th}_{sc}.svg','w').write(fn(sc))
print('ok')
