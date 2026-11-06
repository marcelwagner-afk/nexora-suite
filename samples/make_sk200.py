"""Erzeugt die synthetische Beispielzeichnung SK-200 (DXF R12, mm).
Layer POS-n enthält die Abwicklung (Zuschnittkontur) des Blechteils n – daraus berechnet STEGARC die Schnittlänge.
Stücklistenattribute stehen an den Positionsnummern (Block POSNR), Kopfdaten im Schriftfeld (Block SCHRIFTFELD)."""
import math, pathlib
out=[]
def g(code,val): out.append(f"{code}\n{val}")
def line(x1,y1,x2,y2,layer): g(0,"LINE");g(8,layer);g(10,f"{x1:.3f}");g(20,f"{y1:.3f}");g(11,f"{x2:.3f}");g(21,f"{y2:.3f}")
def circle(x,y,r,layer): g(0,"CIRCLE");g(8,layer);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,f"{r:.3f}")
def arc(x,y,r,a1,a2,layer): g(0,"ARC");g(8,layer);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,f"{r:.3f}");g(50,a1);g(51,a2)
def rect(x,y,w,h,layer): line(x,y,x+w,y,layer);line(x+w,y,x+w,y+h,layer);line(x+w,y+h,x,y+h,layer);line(x,y+h,x,y,layer)
def text(x,y,h,s,layer="TEXT"): g(0,"TEXT");g(8,layer);g(10,f"{x:.3f}");g(20,f"{y:.3f}");g(40,h);g(1,s)
def insert(block,x,y,attrs,layer):
    g(0,"INSERT");g(8,layer);g(66,1);g(2,block);g(10,f"{x:.3f}");g(20,f"{y:.3f}")
    for i,(k,v) in enumerate(attrs.items()):
        g(0,"ATTRIB");g(8,layer);g(10,f"{x+4:.3f}");g(20,f"{y-4-i*4:.3f}");g(40,2.5);g(1,v);g(2,k);g(70,0)
    g(0,"SEQEND");g(8,layer)
# HEADER, TABLES
g(0,"SECTION");g(2,"HEADER");g(9,"$ACADVER");g(1,"AC1009");g(9,"$INSUNITS");g(70,4);g(0,"ENDSEC")
layers=["RAHMEN","ANSICHT","TEXT","POSNR","POS-1","POS-2","POS-3"]
g(0,"SECTION");g(2,"TABLES");g(0,"TABLE");g(2,"LAYER");g(70,len(layers))
for i,l in enumerate(layers): g(0,"LAYER");g(2,l);g(70,0);g(62,[7,7,7,1,3,5,6][i]);g(6,"CONTINUOUS")
g(0,"ENDTAB");g(0,"ENDSEC")
g(0,"SECTION");g(2,"BLOCKS")
for bname,tags in (("SCHRIFTFELD",["ZEICHNUNGSNR","BENENNUNG","REVISION","MASSSTAB","ERSTELLT","OBERFLAECHE","NAHTLAENGE","NAHTDICKE"]),("POSNR",["POS","BENENNUNG","MENGE","ART","WERKSTOFF","DICKE","LAENGE","BREITE","BIEGUNGEN","BOHRUNGEN","BOHR_D","NORM","TEILENR"])):
    g(0,"BLOCK");g(8,"0");g(2,bname);g(70,2);g(10,0);g(20,0);g(3,bname)
    for i,tg in enumerate(tags): g(0,"ATTDEF");g(8,"0");g(10,4);g(20,-4-i*4);g(40,2.5);g(1,"");g(3,tg);g(2,tg);g(70,1)
    g(0,"ENDBLK");g(8,"0")
g(0,"ENDSEC")
g(0,"SECTION");g(2,"ENTITIES")
# Rahmen A2 (594 x 420) und Schriftfeld
rect(0,0,594,420,"RAHMEN"); rect(10,10,574,400,"RAHMEN"); rect(404,10,180,56,"RAHMEN")
for y in (24,38,52): line(404,y,584,y,"RAHMEN")
text(408,56,5,"Schachtkonsole Führungsschiene"); text(408,42,3.5,"Zeichnungs-Nr. SK-200   Rev. B"); text(408,28,3,"Werkstoff S235JR · Oberfläche feuerverzinkt"); text(408,14,3,"Maßstab 1:2 · erstellt F. Amann · ELEVON INDUSTRIES")
insert("SCHRIFTFELD",404,10,{"ZEICHNUNGSNR":"SK-200","BENENNUNG":"Schachtkonsole Führungsschiene","REVISION":"B","MASSSTAB":"1:2","ERSTELLT":"F. Amann","OBERFLAECHE":"Feuerverzinkt","NAHTLAENGE":"640","NAHTDICKE":"4"},"TEXT")
# Zusammenbau-Ansicht (Seitenansicht, Maßstab 1:2)
ox,oy=40,250
rect(ox,oy,150,4,"ANSICHT")                     # Grundplatte 300 x 8
rect(ox+10,oy+4,2.5,75,"ANSICHT"); rect(ox+137.5,oy+4,2.5,75,"ANSICHT")  # Winkel stehend
line(ox+12.5,oy+4,ox+12.5+40,oy+4,"ANSICHT"); line(ox+12.5,oy+44,ox+52.5,oy+4,"ANSICHT")   # Rippe
line(ox+137.5,oy+4,ox+97.5,oy+4,"ANSICHT"); line(ox+137.5,oy+44,ox+97.5,oy+4,"ANSICHT")
rect(ox+55,oy+60,40,12,"ANSICHT")                # Schienenklammer
text(ox,oy-12,3.5,"Zusammenbau SK-200  M 1:2")
# Abwicklungen (Zuschnittkonturen) M 1:2 – Geometrie in Originalmaß, Darstellung skaliert die SVG-Ansicht
def flat_plate(x,y):   # Pos 1: 300 x 200, 4 x Ø14
    rect(x,y,300,200,"POS-1")
    for cx,cy in ((25,25),(275,25),(25,175),(275,175)): circle(x+cx,y+cy,7,"POS-1")
def flat_angle(x,y):   # Pos 2: Abwicklung 250 x 150, 2 x Ø18
    rect(x,y,250,150,"POS-2"); circle(x+60,y+40,9,"POS-2"); circle(x+190,y+40,9,"POS-2")
    line(x,y+90,x+250,y+90,"ANSICHT")   # Biegelinie (nicht geschnitten)
def flat_rib(x,y):     # Pos 3: Rippe 120 x 80, Fase 15 x 15
    pts=[(0,0),(120,0),(120,15),(15,80),(0,80),(0,0)]
    for (a,b),(c,d) in zip(pts,pts[1:]): line(x+a,y+b,x+c,y+d,"POS-3")
flat_plate(240,240); flat_angle(240,40); flat_rib(40,60)
text(240,446-0,3,""); text(240,232,3,"Pos. 1 Abwicklung"); text(240,32,3,"Pos. 2 Abwicklung (1 Biegung 90°)"); text(40,52,3,"Pos. 3 Abwicklung")
# Positionsnummern mit Stücklistenattributen
P=[("1","Grundplatte","1","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"8","LAENGE":"300","BREITE":"200","BOHRUNGEN":"4","BOHR_D":"14"}),
   ("2","Winkel","2","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"5","LAENGE":"250","BREITE":"150","BIEGUNGEN":"1","BOHRUNGEN":"2","BOHR_D":"18"}),
   ("3","Rippe","2","Blechteil",{"WERKSTOFF":"S235JR","DICKE":"5","LAENGE":"120","BREITE":"80"}),
   ("4","Schienenklammer","2","Zukaufteil",{"TEILENR":"SK-16"}),
   ("5","Sechskantschraube","4","Normteil",{"NORM":"DIN 933 M12x40"}),
   ("6","Sechskantmutter","4","Normteil",{"NORM":"DIN 934 M12"}),
   ("7","Scheibe","8","Normteil",{"NORM":"DIN 125 A13"}),
   ("8","Bolzenanker","4","Normteil",{"NORM":"ANKER M12x110"}),
   ("9","Elastomerlager","2","Zukaufteil",{"TEILENR":"EL-40"})]
for i,(pos,name,qty,art,extra) in enumerate(P):
    x,y=200+i*14,395
    circle(x,y,5,"POSNR"); text(x-1.5,y-1.5,3.5,pos,"POSNR")
    a={"POS":pos,"BENENNUNG":name,"MENGE":qty,"ART":art}; a.update(extra)
    insert("POSNR",x,y,a,"POSNR")
g(0,"ENDSEC"); g(0,"EOF")
pathlib.Path(__file__).with_name("SK-200.dxf").write_text("\n".join(out)+"\n",encoding="utf-8")
print("ok", len(out))
