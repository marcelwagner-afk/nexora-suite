"""Erzeugt die synthetische Werkstattzeichnung MR-1200 „Maschinenrahmen Antriebseinheit“ (DXF R12, mm).
Blatt 1 (A1, M 1:5): Draufsicht, Vorderansicht, Seitenansicht, Schnitt A-A, Details, Bemaßung,
Schweißangaben, Stückliste, Änderungsindex, Schriftfeld.
Blatt 2 (A1, M 1:1): Abwicklungen aller Blechteile auf Layer POS-n – daraus berechnet STEGARC die Schnittlängen.
Alle Angaben sind fiktiv."""
import math, pathlib
out=[]
def g(c,v): out.append(f"{c}\n{v}")
def ln(x1,y1,x2,y2,l): g(0,"LINE");g(8,l);g(10,f"{x1:.3f}");g(20,f"{y1:.3f}");g(11,f"{x2:.3f}");g(21,f"{y2:.3f}")
def ci(x,y,r,l): g(0,"CIRCLE");g(8,l);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,f"{r:.3f}")
def ar(x,y,r,a1,a2,l): g(0,"ARC");g(8,l);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,f"{r:.3f}");g(50,f"{a1:.3f}");g(51,f"{a2:.3f}")
def tx(x,y,h,s,l="TEXT"): g(0,"TEXT");g(8,l);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,h);g(1,s)
def rc(x,y,w,h,l):
    ln(x,y,x+w,y,l);ln(x+w,y,x+w,y+h,l);ln(x+w,y+h,x,y+h,l);ln(x,y+h,x,y,l)
def poly(pts,l,closed=True):
    P=pts+([pts[0]] if closed else [])
    for (a,b),(c,d) in zip(P,P[1:]): ln(a,b,c,d,l)
def slot(cx,cy,w,L,l,vertical=False):
    r=w/2; h=(L-w)/2
    if vertical:
        ar(cx,cy+h,r,0,180,l); ar(cx,cy-h,r,180,360,l); ln(cx-r,cy-h,cx-r,cy+h,l); ln(cx+r,cy-h,cx+r,cy+h,l)
    else:
        ar(cx+h,cy,r,270,90,l); ar(cx-h,cy,r,90,270,l); ln(cx-h,cy-r,cx+h,cy-r,l); ln(cx-h,cy+r,cx+h,cy+r,l)
def arrow(x,y,ang,l="BEMASSUNG",s=2.5):
    a=math.radians(ang); 
    for d in (20,-20): b=a+math.radians(180+d); ln(x,y,x+s*math.cos(b),y+s*math.sin(b),l)
def dim_h(x1,x2,y,yref,text,l="BEMASSUNG"):
    ln(x1,yref,x1,y+(1.5 if y>yref else -1.5),l); ln(x2,yref,x2,y+(1.5 if y>yref else -1.5),l); ln(x1,y,x2,y,l); arrow(x1,y,180,l); arrow(x2,y,0,l)
    tx((x1+x2)/2-len(text)*1.1,y+1.2,3.2,text,l)
def dim_v(y1,y2,x,xref,text,l="BEMASSUNG"):
    ln(xref,y1,x+(1.5 if x>xref else -1.5),y1,l); ln(xref,y2,x+(1.5 if x>xref else -1.5),y2,l); ln(x,y1,x,y2,l); arrow(x,y1,270,l); arrow(x,y2,90,l)
    tx(x+1.2,(y1+y2)/2,3.2,text,l)
def hatch(x,y,w,h,l="SCHRAFFUR",step=2.0):
    # 45°-Schraffur innerhalb eines Rechtecks
    k=-h
    while k<w:
        x1=x+max(k,0); y1=y+max(-k,0); t=min(w-max(k,0),h-max(-k,0)); 
        if t>0: ln(x1,y1,x1+t,y1+t,l)
        k+=step
def weld(x,y,a,l="SCHWEISS"):
    ln(x,y,x+14,y+8,l); ln(x+14,y+8,x+30,y+8,l); poly([(x+18,y+8),(x+22,y+8),(x+18,y+12)],l); tx(x+11,y+9.5,2.5,f"a{a}",l)
def balloon(x,y,tx_,px,py):
    ci(x,y,4.5,"POSNR"); tx(x-(1.5 if len(tx_)==1 else 2.8),y-1.6,3.5,tx_,"POSNR"); 
    d=math.hypot(px-x,py-y); ux,uy=(px-x)/d,(py-y)/d; ln(x+ux*4.5,y+uy*4.5,px,py,"POSNR"); ci(px,py,0.6,"POSNR")
def insert(block,x,y,attrs,layer):
    g(0,"INSERT");g(8,layer);g(66,1);g(2,block);g(10,f"{x:.3f}");g(20,f"{y:.3f}")
    for i,(k,v) in enumerate(attrs.items()):
        g(0,"ATTRIB");g(8,layer);g(10,f"{x:.3f}");g(20,f"{y-i*3:.3f}");g(40,1.8);g(1,v);g(2,k);g(70,1)
    g(0,"SEQEND");g(8,layer)

LAYERS=[("RAHMEN",7,"CONTINUOUS"),("ANSICHT",7,"CONTINUOUS"),("VERDECKT",8,"DASHED"),("MITTELLINIE",1,"CENTER"),("BEMASSUNG",3,"CONTINUOUS"),("SCHRAFFUR",8,"CONTINUOUS"),("SCHWEISS",6,"CONTINUOUS"),("TEXT",7,"CONTINUOUS"),("STUECKLISTE",7,"CONTINUOUS"),("POSNR",1,"CONTINUOUS")]+[(f"POS-{n}",3,"CONTINUOUS") for n in (4,5,6,7,8)]
g(0,"SECTION");g(2,"HEADER");g(9,"$ACADVER");g(1,"AC1009");g(9,"$INSUNITS");g(70,4);g(9,"$LTSCALE");g(40,5);g(0,"ENDSEC")
g(0,"SECTION");g(2,"TABLES")
g(0,"TABLE");g(2,"LTYPE");g(70,3)
for n,d,pat in (("CONTINUOUS","Solid",[]),("DASHED","__ __ __",[6,-3]),("CENTER","____ _ ____",[12,-3,3,-3])):
    g(0,"LTYPE");g(2,n);g(70,0);g(3,d);g(72,65);g(73,len(pat));g(40,sum(abs(p) for p in pat))
    for p in pat: g(49,p)
g(0,"ENDTAB")
g(0,"TABLE");g(2,"LAYER");g(70,len(LAYERS))
for n,c,lt in LAYERS: g(0,"LAYER");g(2,n);g(70,0);g(62,c);g(6,lt)
g(0,"ENDTAB");g(0,"ENDSEC")
TB=["ZEICHNUNGSNR","BENENNUNG","REVISION","MASSSTAB","ERSTELLT","GEPRUEFT","OBERFLAECHE","NAHTLAENGE","NAHTDICKE","TOLERANZ","GEWICHT"]
PT=["POS","BENENNUNG","MENGE","ART","WERKSTOFF","DICKE","LAENGE","BREITE","PROFIL","GEHRUNG","BIEGUNGEN","BOHRUNGEN","BOHR_D","GEWINDE","NORM","TEILENR"]
g(0,"SECTION");g(2,"BLOCKS")
for b,tags in (("SCHRIFTFELD",TB),("POSNR",PT)):
    g(0,"BLOCK");g(8,"0");g(2,b);g(70,2);g(10,0);g(20,0);g(3,b)
    for i,t in enumerate(tags): g(0,"ATTDEF");g(8,"0");g(10,0);g(20,-i*3);g(40,1.8);g(1,"");g(3,t);g(2,t);g(70,1)
    g(0,"ENDBLK");g(8,"0")
g(0,"ENDSEC")
g(0,"SECTION");g(2,"ENTITIES")

# ================= BLATT 1 (A1 841 x 594), Ansichten M 1:5 =================
rc(0,0,841,594,"RAHMEN"); rc(20,10,811,574,"RAHMEN")
for i in range(1,8): x=20+i*811/8; ln(x,584,x,578,"RAHMEN"); tx(x-811/16-1,579.5,3,str(i),"RAHMEN")
for i,c in enumerate("ABCDEF"): y=584-(i+0.5)*574/6; tx(13,y,3,c,"RAHMEN")
S=0.2  # Maßstab 1:5
L,B,H,T,FP=1200,800,420,60,12
# --- Draufsicht (oben links) ---
ox,oy=60,330
rc(ox,oy,L*S,B*S,"ANSICHT"); rc(ox+T*S,oy+T*S,(L-2*T)*S,(B-2*T)*S,"ANSICHT")
for qx in (0,(L-T)/2,L-T):   # Querträger
    if qx not in (0,L-T): rc(ox+qx*S,oy+T*S,T*S,(B-2*T)*S,"ANSICHT")
mx,my,mw,mh=ox+(L/2-210)*S,oy+(B/2-150)*S,420*S,300*S
rc(mx,my,mw,mh,"ANSICHT")                    # Motorkonsole Pos 5
ci(mx+mw/2,my+mh/2,60*S,"ANSICHT")
for sx in (-160,160):
    for sy in (-110,110): slot(mx+mw/2+sx*S,my+mh/2+sy*S,18*S,40*S,"ANSICHT")
gx,gy=ox+(L*0.78-180)*S,oy+(B/2-130)*S; rc(gx,gy,360*S,260*S,"VERDECKT")   # Getriebeplatte Pos 7 (unter Querträger, verdeckt)
for (fx,fy) in ((0,0),(L-160,0),(0,B-160),(L-160,B-160)): rc(ox+fx*S,oy+fy*S,160*S,160*S,"VERDECKT")
ln(ox-8,oy+B*S/2,ox+L*S+8,oy+B*S/2,"MITTELLINIE"); ln(ox+L*S/2,oy-8,ox+L*S/2,oy+B*S+8,"MITTELLINIE")
dim_h(ox,ox+L*S,oy+B*S+14,oy+B*S,"1200"); dim_v(oy,oy+B*S,ox-14,ox,"800"); dim_h(mx,mx+mw,oy+B*S+6,my+mh,"420")
tx(ox,oy+B*S+26,4.5,"Draufsicht"); ln(ox+L*S*0.25,oy-4,ox+L*S*0.25,oy+B*S+4,"MITTELLINIE"); tx(ox+L*S*0.25-2,oy-9,4,"A"); tx(ox+L*S*0.25-2,oy+B*S+5,4,"A")
# --- Vorderansicht (unten links) ---
vx,vy=60,150
for fx in (0,L-160): rc(vx+fx*S,vy,160*S,FP*S,"ANSICHT")                       # Fußplatten
for sx in (50,L-110): rc(vx+sx*S,vy+FP*S,T*S,H*S,"ANSICHT")                   # Stützen
rc(vx,vy+(FP+H)*S,L*S,T*S,"ANSICHT")                                          # Längsträger
rc(vx+(L/2-210)*S,vy+(FP+H+T)*S,420*S,15*S,"ANSICHT")                         # Motorkonsole
for sx in (50,L-110):
    for side in (-1,1):
        bx=vx+(sx+(T if side>0 else 0))*S; poly([(bx,vy+(FP+H)*S),(bx+side*120*S,vy+(FP+H)*S),(bx,vy+(FP+H-120)*S)],"ANSICHT")   # Knotenbleche
rc(vx+(L*0.5-100)*S,vy+(FP+H-60)*S,200*S,3*S,"ANSICHT")                        # Kabelhalter
for sx in (100,L-100): ln(vx+sx*S,vy-4,vx+sx*S,vy+FP*S+4,"MITTELLINIE")
dim_h(vx,vx+L*S,vy-14,vy,"1200"); dim_v(vy,vy+(FP+H+T)*S,vx-14,vx,"492"); dim_v(vy,vy+FP*S,vx+L*S+8,vx+L*S,"12")
tx(vx,vy-26,4.5,"Vorderansicht")
weld(vx+(50+T)*S+2,vy+(FP+H-30)*S,4); weld(vx+(L-110)*S-34,vy+(FP+H-30)*S,4)
# --- Seitenansicht (unten Mitte) ---
sx0,sy0=360,150
for fy in (0,B-160): rc(sx0+fy*S,sy0,160*S,FP*S,"ANSICHT")
for py in (50,B-110): rc(sx0+py*S,sy0+FP*S,T*S,H*S,"ANSICHT")
rc(sx0,sy0+(FP+H)*S,B*S,T*S,"ANSICHT"); ln(sx0+T*S,sy0+(FP+H)*S,sx0+T*S,sy0+(FP+H+T)*S,"VERDECKT"); ln(sx0+(B-T)*S,sy0+(FP+H)*S,sx0+(B-T)*S,sy0+(FP+H+T)*S,"VERDECKT")
rc(sx0+(B/2-150)*S,sy0+(FP+H+T)*S,300*S,15*S,"ANSICHT")
# Ringschrauben DIN 580 auf Längsträgern
for py in (40,B-40): ci(sx0+py*S,sy0+(FP+H+T+14)*S,10*S,"ANSICHT"); ln(sx0+py*S,sy0+(FP+H+T)*S,sx0+py*S,sy0+(FP+H+T+9)*S,"ANSICHT")
dim_h(sx0,sx0+B*S,sy0-14,sy0,"800"); tx(sx0,sy0-26,4.5,"Seitenansicht von links")
# --- Schnitt A-A (Rohrprofil) und Details ---
ax,ay=560,330
rc(ax,ay,60,60,"ANSICHT"); rc(ax+4,ay+4,52,52,"ANSICHT")
hatch(ax,ay,60,4); hatch(ax,ay+56,60,4); hatch(ax,ay+4,4,52); hatch(ax+56,ay+4,4,52)
dim_h(ax,ax+60,ay-10,ay,"60"); dim_v(ay,ay+60,ax+72,ax+60,"60"); tx(ax+20,ay+28,3,"t = 4")
tx(ax,ay+70,4.5,"Schnitt A-A  M 1:1   QR 60×60×4")
dx,dy=660,330
rc(dx,dy,84,60,"ANSICHT"); slot(dx+42,dy+30,18,40,"ANSICHT"); ln(dx+42,dy+4,dx+42,dy+56,"MITTELLINIE"); ln(dx+16,dy+30,dx+68,dy+30,"MITTELLINIE")
dim_h(dx+33,dx+51,dy+64,dy+40,"18"); dim_v(dy+11,dy+49,dx+92,dx+84,"40"); tx(dx,dy+76,4.5,"Detail X  Langloch M 1:1")
# Allgemeine Angaben
for i,s in enumerate(["Allgemeintoleranzen ISO 2768-mK","Schweißnähte ISO 5817 Bewertungsgruppe C, MAG 135","Nicht bemaßte Kehlnähte a4 umlaufend","Kanten gebrochen 0,5 × 45°","Oberfläche: pulverbeschichtet RAL 7035, 80 µm","Gewinde vor Beschichtung abdecken","Gesamtgewicht ca. 86 kg"]):
    tx(470,268-i*6,3,s)
tx(470,276,3.5,"Hinweise")
# --- Stückliste (Tabelle) ---
P=[("1","Längsträger","2","Profil",{"WERKSTOFF":"S235JR","PROFIL":"60x60x4","LAENGE":"1200","BOHRUNGEN":"4","BOHR_D":"17","GEWINDE":"2"}),
   ("2","Querträger","3","Profil",{"WERKSTOFF":"S235JR","PROFIL":"60x60x4","LAENGE":"680"}),
   ("3","Stütze","4","Profil",{"WERKSTOFF":"S235JR","PROFIL":"60x60x4","LAENGE":"420","GEHRUNG":"0"}),
   ("4","Fußplatte","4","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"12","LAENGE":"160","BREITE":"160","BOHRUNGEN":"4","BOHR_D":"18"}),
   ("5","Motorkonsole","1","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"15","LAENGE":"420","BREITE":"300","BOHRUNGEN":"5","BOHR_D":"18"}),
   ("6","Knotenblech","8","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"8","LAENGE":"120","BREITE":"120"}),
   ("7","Getriebeplatte","1","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"10","LAENGE":"360","BREITE":"260","BOHRUNGEN":"6","BOHR_D":"22"}),
   ("8","Kabelhalter","2","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"3","LAENGE":"200","BREITE":"60","BIEGUNGEN":"2","BOHRUNGEN":"3","BOHR_D":"9"}),
   ("9","Abdeckleiste","2","Profil",{"WERKSTOFF":"S235JR","PROFIL":"40x8","LAENGE":"760","BOHRUNGEN":"4","BOHR_D":"9"}),
   ("10","Ringschraube","2","Normteil",{"NORM":"DIN 580 M16"}),
   ("11","Sechskantschraube","8","Normteil",{"NORM":"DIN 933 M16x60"}),
   ("12","Sechskantmutter","8","Normteil",{"NORM":"DIN 934 M16"}),
   ("13","Scheibe","16","Normteil",{"NORM":"DIN 125 A17"}),
   ("14","Schwingungsdämpfer","4","Zukaufteil",{"TEILENR":"SD-80"}),
   ("15","Kabelverschraubung M25, Satz","2","Zukaufteil",{"TEILENR":"KV-25"})]
tx0,ty0=581,96; cols=[0,10,62,74,106,140,250]; heads=["Pos","Benennung","Menge","Art","Werkstoff / Halbzeug","Norm / Teile-Nr."]
rh=5.2; rows=len(P)+1
rc(tx0,ty0,250,rows*rh,"STUECKLISTE")
for i in range(1,rows): ln(tx0,ty0+i*rh,tx0+250,ty0+i*rh,"STUECKLISTE")
for c in cols[1:-1]: ln(tx0+c,ty0,tx0+c,ty0+rows*rh,"STUECKLISTE")
for j,hd in enumerate(heads): tx(tx0+cols[j]+1,ty0+(rows-1)*rh+1.3,2.6,hd,"STUECKLISTE")
for i,(pos,name,qty,art,ex) in enumerate(P):
    y=ty0+(rows-2-i)*rh+1.3
    mat=" ".join(filter(None,[ex.get("WERKSTOFF"),("Bl "+ex["DICKE"]+" × "+ex["LAENGE"]+" × "+ex["BREITE"]) if "DICKE" in ex else None,("QR "+ex["PROFIL"]+" L="+ex["LAENGE"]) if ex.get("PROFIL","").count("x")==2 else (("Fl "+ex["PROFIL"]+" L="+ex["LAENGE"]) if "PROFIL" in ex else None)]))
    for j,v in enumerate([pos,name,qty,art,mat,ex.get("NORM") or ex.get("TEILENR") or ""]): tx(tx0+cols[j]+1,y,2.4,v,"STUECKLISTE")
tx(tx0,ty0+rows*rh+2,3.5,"Stückliste","STUECKLISTE")
# --- Änderungsindex und Schriftfeld ---
rx,ry=581,62
rc(rx,ry,250,24,"RAHMEN"); 
for i in (6,12,18): ln(rx,ry+i,rx+250,ry+i,"RAHMEN")
for c in (12,40,200): ln(rx+c,ry,rx+c,ry+24,"RAHMEN")
for i,(r,d,t,n) in enumerate([("C","28.10.2026","Motorkonsole 15 mm statt 12 mm, Langlöcher 18×40","S. Kaya"),("B","14.10.2026","Knotenbleche ergänzt, Nahtdicke a4","F. Amann"),("A","02.10.2026","Erstausgabe","F. Amann")]):
    y=ry+12-i*6+1.6; tx(rx+3,y,2.6,r); tx(rx+14,y,2.6,d); tx(rx+42,y,2.6,t); tx(rx+202,y,2.6,n)
tx(rx+3,ry+19.6,2.6,"Ind."); tx(rx+14,ry+19.6,2.6,"Datum"); tx(rx+42,ry+19.6,2.6,"Änderung"); tx(rx+202,ry+19.6,2.6,"Name")
sx,sy=581,10
rc(sx,sy,250,50,"RAHMEN"); ln(sx,sy+16,sx+250,sy+16,"RAHMEN"); ln(sx,sy+34,sx+250,sy+34,"RAHMEN"); ln(sx+150,sy,sx+150,sy+50,"RAHMEN"); ln(sx+200,sy,sx+200,sy+34,"RAHMEN")
tx(sx+4,sy+40,6,"ELEVON INDUSTRIES"); tx(sx+154,sy+42,3,"Werk Stuttgart · Konstruktion")
tx(sx+4,sy+23,5,"Maschinenrahmen Antriebseinheit"); tx(sx+4,sy+18,2.6,"Benennung")
tx(sx+4,sy+5,6,"MR-1200"); tx(sx+90,sy+5,4,"Index C"); tx(sx+154,sy+22,3,"Maßstab 1:5 / 1:1"); tx(sx+154,sy+17,2.6,"Blatt 1 von 2")
tx(sx+204,sy+22,3,"A1"); tx(sx+154,sy+5,2.6,"Erstellt F. Amann 02.10.2026"); tx(sx+154,sy+10,2.6,"Geprüft S. Kaya 28.10.2026"); tx(sx+204,sy+5,2.6,"≈ 86 kg")
insert("SCHRIFTFELD",sx+1,sy+1,{"ZEICHNUNGSNR":"MR-1200","BENENNUNG":"Maschinenrahmen Antriebseinheit","REVISION":"C","MASSSTAB":"1:5","ERSTELLT":"F. Amann","GEPRUEFT":"S. Kaya","OBERFLAECHE":"Pulverbeschichtet","NAHTLAENGE":"9600","NAHTDICKE":"4","TOLERANZ":"ISO 2768-mK","GEWICHT":"86"},"TEXT")
# Positionsnummern an den Ansichten
targets={"1":(ox+30,oy+B*S-6),"2":(ox+L*S/2+6,oy+40),"3":(vx+(50+30)*S,vy+40),"4":(vx+20,vy+1),"5":(mx+10,my+mh-4),"6":(vx+(L-110-60)*S,vy+(FP+H-30)*S),"7":(gx+10,gy+8),"8":(vx+L*S/2,vy+(FP+H-59)*S),
         "9":(ox+L*S-20,oy+B*S/2+2),"10":(sx0+40*S,sy0+(FP+H+T+14)*S),"11":(mx+mw/2+160*S,my+mh/2+110*S),"12":(mx+mw/2-160*S,my+mh/2+110*S),"13":(mx+mw/2+160*S,my+mh/2-110*S),"14":(vx+(L-100)*S,vy+2),"15":(vx+(L*0.5+60)*S,vy+(FP+H-59)*S)}
bpos={"1":(80,538),"2":(118,538),"5":(156,538),"11":(194,538),"12":(232,538),"13":(270,538),"9":(325,505),"7":(325,455),"3":(40,215),"4":(40,140),"6":(330,240),"8":(200,278),"15":(250,278),"14":(330,140),"10":(420,282)}
for (pos,name,qty,art,ex) in P:
    bx,by=bpos[pos]; px,py=targets[pos]; balloon(bx,by,pos,px,py)
    a={"POS":pos,"BENENNUNG":name,"MENGE":qty,"ART":art}; a.update(ex); insert("POSNR",bx+6,by+3,a,"POSNR")

# ================= BLATT 2 (A1), Abwicklungen M 1:1 =================
X=900
rc(X,0,841,594,"RAHMEN"); rc(X+20,10,811,574,"RAHMEN"); tx(X+30,570,6,"MR-1200 Blatt 2 von 2 · Abwicklungen / Zuschnitte M 1:1")
def plate(x,y,w,h,holes,d,l):
    rc(x,y,w,h,l)
    for (hx,hy) in holes: ci(x+hx,y+hy,d/2,l)
# Pos 5 Motorkonsole 420x300, 4 Langlöcher 18x40, Mittenbohrung Ø120 (5. Bohrung = Durchbruch)
x5,y5=X+40,250; rc(x5,y5,420,300,"POS-5"); ci(x5+210,y5+150,60,"POS-5")
for sx_ in (-160,160):
    for sy_ in (-110,110): slot(x5+210+sx_,y5+150+sy_,18,40,"POS-5")
ln(x5+210,y5-8,x5+210,y5+308,"MITTELLINIE"); ln(x5-8,y5+150,x5+428,y5+150,"MITTELLINIE")
dim_h(x5,x5+420,y5-14,y5,"420"); dim_v(y5,y5+300,x5-14,x5,"300"); tx(x5,y5+308,4,"Pos. 5 Motorkonsole  Bl 15  S235JR  1×")
# Pos 7 Getriebeplatte 360x260, 6 x Ø22, Ecken R20
x7,y7=X+500,290; r=20
ln(x7+r,y7,x7+360-r,y7,"POS-7"); ln(x7+360,y7+r,x7+360,y7+260-r,"POS-7"); ln(x7+360-r,y7+260,x7+r,y7+260,"POS-7"); ln(x7,y7+260-r,x7,y7+r,"POS-7")
ar(x7+r,y7+r,r,180,270,"POS-7"); ar(x7+360-r,y7+r,r,270,360,"POS-7"); ar(x7+360-r,y7+260-r,r,0,90,"POS-7"); ar(x7+r,y7+260-r,r,90,180,"POS-7")
for hx in (40,180,320):
    for hy in (40,220): ci(x7+hx,y7+hy,11,"POS-7")
dim_h(x7,x7+360,y7-14,y7,"360"); dim_v(y7,y7+260,x7+374,x7+360,"260"); tx(x7,y7+268,4,"Pos. 7 Getriebeplatte  Bl 10  S235JR  1×  Ecken R20")
# Pos 4 Fußplatte 160x160, 4 x Ø18
x4,y4=X+40,40; plate(x4,y4,160,160,[(25,25),(135,25),(25,135),(135,135)],18,"POS-4"); dim_h(x4,x4+160,y4-12,y4,"160"); tx(x4,y4+168,4,"Pos. 4 Fußplatte  Bl 12  4×")
# Pos 6 Knotenblech 120x120 Dreieck mit Fase 20 und Ausklinkung R15
x6,y6=X+240,60; poly([(0,0),(120,0),(120,20),(20,120),(0,120)],"POS-6",closed=False) if False else None
pts=[(x6+15,y6),(x6+120,y6),(x6+120,y6+20),(x6+20,y6+120),(x6,y6+120),(x6,y6+15)]
for (a,b),(c,d) in zip(pts,pts[1:]): ln(a,b,c,d,"POS-6")
ar(x6,y6,15,0,90,"POS-6"); tx(x6,y6+128,4,"Pos. 6 Knotenblech  Bl 8  8×")
# Pos 8 Kabelhalter Abwicklung 200x60, 3 x Ø9, 2 Biegelinien
x8,y8=X+400,60; plate(x8,y8,200,60,[(40,30),(100,30),(160,30)],9,"POS-8"); ln(x8,y8+18,x8+200,y8+18,"MITTELLINIE"); ln(x8,y8+42,x8+200,y8+42,"MITTELLINIE")
tx(x8+204,y8+16,2.5,"Biegelinie 90° ↑",'TEXT'); tx(x8+204,y8+40,2.5,"Biegelinie 90° ↑",'TEXT'); tx(x8,y8+68,4,"Pos. 8 Kabelhalter  Bl 3  2×")
g(0,"ENDSEC"); g(0,"EOF")
pathlib.Path(__file__).with_name("MR-1200.dxf").write_text("\n".join(out)+"\n",encoding="utf-8")
print("ok",len(out))
