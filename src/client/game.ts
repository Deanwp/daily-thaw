// @ts-nocheck
import {fetchDaily, fetchSubmitScore, fetchLeaderboard, fetchPostComment, formatCountdown} from './fetch.ts'
import type {Board} from '../shared/api.ts'
import {ART} from './atlas.ts'
import {roundTime} from '../shared/board.ts'

// ---- asset atlas (base64) ----
const IMG:Record<string,HTMLImageElement>={}, NEED=Object.keys(ART)
let loaded=0, artReady=false
for(const k of NEED){const i=new Image();i.onload=()=>{if(++loaded===NEED.length)artReady=true};i.src=(ART as Record<string,string>)[k];IMG[k]=i}

const cv=document.getElementById('c') as HTMLCanvasElement
const ctx=cv.getContext('2d')!
ctx.imageSmoothingEnabled=false

// ---- board state, supplied by the server (never generated locally) ----
let barFric=1.0, iceLvl=3
let HOLES:(Board['holes'][number] & {plugged?:boolean})[]=[]
let TARGET_SEQ:number[]=[]
let curDay=''
let puzzleNo=0
let secsNext=0
let yourBest:{holesSunk:number,bankedMs:number}|undefined
let myRank:number|undefined
let lbRows:{rank:number,name:string,holesSunk:number,bankedMs:number}[]=[]
let lbYou:{rank:number,name:string,holesSunk:number,bankedMs:number}|undefined
let lbLoading=false
let shareBtn:{x:number,y:number,w:number,h:number}|null=null
let commentBtn:{x:number,y:number,w:number,h:number}|null=null
let shareToast=0
let commentState:'idle'|'posting'|'done'|'error'='idle'

"use strict";
let W=440,H=660,dpr=1;
function resize(){
  const vw=window.innerWidth||440,vh=window.innerHeight||660;
  W=Math.max(240,Math.min(vw-16,440));
  H=Math.max(340,Math.min(Math.round(W*1.5),Math.max(340,vh-16)));
  dpr=Math.min(window.devicePixelRatio||1,2);
  cv.style.width=W+"px";cv.style.height=H+"px";
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;layout();cvRect=cv.getBoundingClientRect();
}
let railX0,railX1,yTop,yBottom;
function layout(){railX0=W*0.17;railX1=W*0.83;yTop=H*0.12;yBottom=H*0.90;BALL_R=11;HOLE_R=BALL_R*0.82;CAP=HOLE_R;}

/* ---- tunables ---- */
const STEP=1/120,GRAV=2300,END_SPEED=120,ROUNDS=5;
const FOLLOW=0.22;   // touch smoothing: bar eases toward the finger, no snapping
let BALL_R=11,HOLE_R=9.0,CAP=9.0;
const ICE_TIERS=[1.65,1.45,1.25,1.00,0.70]; // tier 1..5; even tier 1 is 4x slicker than a normal bar
const REST=0.62,DMIN_FRAC=0.23,FLOOR=30,KICK_MAX=520; // decay + tilt-aware minimum bounce distance
const ROUND_TIME=30;                     // countdown per target
const IMMUNE=0.25;                       // short grace; plugged holes do the real work
const PENALTY=5;                         // seconds docked for a fire vent



function hX(h){return railX0+h.sx*(railX1-railX0);}
function hY(h){return yTop+h.hyN*(yBottom-yTop);}

/* ---- state ---- */
let yL=0,yR=0,s=0,v=0,left=0,bank=0,round=0,score=0,running=false,done=false,started=false,shake=0,flash=0,flashCol="ok",flick=0,immune=0,bump=0,rot=0,penFx=0;
let wrongHoles=0,runStart=0,submitted=false,doneAt=0;
let playBtn:{x:number,y:number,w:number,h:number}|null=null;
let startBtn:{x:number,y:number,w:number,h:number}|null=null;
function hit(b:{x:number,y:number,w:number,h:number},x:number,y:number):boolean{
  return x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h;
}
function toBottom(){
  yL=yBottom;yR=yBottom;s=0.5;v=0;immune=IMMUNE;
  anchorL=null;anchorR=null;velL=0;velR=0;   // release the stick on reset; must re-touch to steer
}
function reset(){if(HOLES)for(const h of HOLES)h.plugged=false;
  penFx=0;toBottom();bank=0;round=0;left=roundTime(0,iceLvl);score=0;running=false;done=false;started=false;shake=0;flash=0;bump=0;wrongHoles=0;submitted=false;runStart=performance.now();}
flick=0;

/* ---- input ---- */
let keyL=0,keyR=0;
// Analog stick model: on touch, anchor the finger; drag up/down sets a proportional
// speed (like a real analog lever). Not absolute position — so no snapping to the finger.
let anchorL:number|null=null, anchorR:number|null=null;   // y where each thumb first touched
let anchorLX=0, anchorRX=0;                                // x of the anchor (for drawing)
let fingerLX=0, fingerLY=0, fingerRX=0, fingerRY=0;        // current finger pos (for drawing)
let velL=0, velR=0;                                        // -1..1 proportional lever output
const STICK_RANGE=65;   // px of drag for full-speed lever (smaller = more sensitive)
addEventListener("keydown",e=>{
  if(e.repeat)return;
  // keyboard controls the bar but NEVER starts the game — Start is button-only
  if(e.key==="w"||e.key==="W")keyL=-1;else if(e.key==="s"||e.key==="S")keyL=1;
  else if(e.key==="ArrowUp")keyR=-1;else if(e.key==="ArrowDown")keyR=1;
  else if(e.key==="r"||e.key==="R"){if(done)playAgain();return;}
  else return;
  e.preventDefault();   // note: no begin() — keys are inert until the run is running
},{passive:false});
addEventListener("keyup",e=>{
  if(e.key==="w"||e.key==="W"||e.key==="s"||e.key==="S")keyL=0;
  if(e.key==="ArrowUp"||e.key==="ArrowDown")keyR=0;
});
function begin(){
  if(done)return;            // on the score screen, taps do nothing — use the Play again button
  started=true;running=true;
}
function playAgain(){reset();started=true;running=true;}
function ptr(e,down){
  if(down)refreshRect();               // rect only changes on new touch, not every move
  const r=cvRect,ts=e.touches?e.touches:[e];

  // menu / start taps use the down event and the button rects (unchanged)
  if(done){
    if(down && performance.now()-doneAt>400){
      for(const t of ts){const x=t.clientX-r.left,y=t.clientY-r.top;
        if(shareBtn && hit(shareBtn,x,y)){ void doShare(); return; }
        if(commentBtn && hit(commentBtn,x,y)){ void doComment(); return; }
        if(playBtn && hit(playBtn,x,y)){ playAgain(); return; }
      }
    }
    return;
  }
  if(!started){
    if(down){for(const t of ts){const x=t.clientX-r.left,y=t.clientY-r.top;
      if(startBtn && hit(startBtn,x,y)){ begin(); return; }}}
    return;
  }

  // ---- analog sticks ----
  // Re-scan all active touches each event. A finger in the left half drives the left
  // lever, right half the right lever. Anchor is set the first time each side is seen.
  let seenL=false, seenR=false, ax=0, ay=0, bx=0, by=0;
  for(const t of ts){
    const x=t.clientX-r.left, y=t.clientY-r.top;
    if(x<W/2){ if(!seenL){seenL=true; ax=x; ay=y;} }
    else     { if(!seenR){seenR=true; bx=x; by=y;} }
  }
  // LEFT
  if(seenL){
    if(anchorL===null){ anchorL=ay; anchorLX=ax; }  // first contact: set the pivot
    fingerLX=ax; fingerLY=ay;
    velL = clampStick((ay - anchorL) / STICK_RANGE); // drag DOWN (y larger) -> positive -> lower end
  }else{ anchorL=null; velL=0; }
  // RIGHT
  if(seenR){
    if(anchorR===null){ anchorR=by; anchorRX=bx; }
    fingerRX=bx; fingerRY=by;
    velR = clampStick((by - anchorR) / STICK_RANGE);
  }else{ anchorR=null; velR=0; }
}

function clampStick(v:number):number{ return v<-1?-1 : v>1?1 : v; }
cv.addEventListener("touchstart",e=>{ptr(e,true);e.preventDefault();},{passive:false});
cv.addEventListener("touchmove",e=>{ptr(e,false);e.preventDefault();},{passive:false});
cv.addEventListener("touchend",e=>{ptr(e,false);},{passive:false});
let cvRect=cv.getBoundingClientRect();
function refreshRect(){cvRect=cv.getBoundingClientRect();}
addEventListener("scroll",refreshRect,{passive:true});
let md=false;
cv.addEventListener("mousedown",e=>{md=true;ptr(e,true);});
cv.addEventListener("mousemove",e=>{if(md)ptr(e,false);});
addEventListener("mouseup",()=>{md=false;anchorL=null;anchorR=null;velL=0;velR=0;});

/* ---- physics ---- */
function moveEnd(y,stick,key){
  // stick: -1..1 analog lever (touch). key: -1/0/1 keyboard. Both move at END_SPEED,
  // but the stick is proportional — a small drag moves slowly, a full drag at full speed.
  const drive = stick!==0 ? stick : key;
  if(drive!==0) y += drive*END_SPEED*STEP;
  return Math.max(yTop,Math.min(yBottom,y));
}
function nextRound(){
  round++;
  if(round>=ROUNDS){done=true;running=false;doneAt=performance.now();submitScore();return;}
  left=roundTime(round,iceLvl);immune=IMMUNE;
}
/** True if the swept path A->B passes within r of centre C (segment-circle test). */
function segHitsHole(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,r:number):boolean{
  const abx=bx-ax, aby=by-ay;
  const len2=abx*abx+aby*aby;
  let t = len2>0 ? ((cx-ax)*abx+(cy-ay)*aby)/len2 : 0;
  t = t<0?0 : t>1?1 : t;                 // clamp to the segment
  const px=ax+abx*t, py=ay+aby*t;        // closest point on the path
  const dx=cx-px, dy=cy-py;
  return dx*dx+dy*dy < r*r;
}

function update(){
  if(!running||done)return;
  left-=STEP; if(immune>0)immune-=STEP; if(bump>0)bump-=STEP; if(penFx>0)penFx-=STEP;
  if(left<=0){ left=0; toBottom(); nextRound(); return; }   // time up -> round lost

  yL=moveEnd(yL,velL,keyL);yR=moveEnd(yR,velR,keyR);
  const dx=railX1-railX0,dy=yR-yL,L=Math.hypot(dx,dy);
  v+=GRAV*(dy/L)*STEP;
  v*=Math.max(0,1-barFric*STEP);
  const sPrev=s;
  s+=(v*STEP)/L;
  rot+=(v*STEP)/BALL_R;              // cosmetic spin

  // spring bumpers: reverse toward centre, floor + ceiling, shed energy
  // spring bumper: decaying bounce, but always clears DMIN_FRAC of the bar even under steep tilt
  const aAlong=GRAV*(dy/L);                                     // + pushes right, - pushes left
  if(s<=0||s>=1){
    const atLeft=(s<=0);
    const pullBack=atLeft?Math.max(0,-aAlong):Math.max(0,aAlong); // gravity dragging ball back to the wall
    // guarantee the ball actually REACHES DMIN_FRAC of the bar, fighting gravity + ice friction.
    // v to travel distance d against decel a: u=sqrt(2*a*d); here a = pullBack + friction drag proxy.
    const decel=pullBack + barFric*Math.abs(v);                   // gravity pull-back + friction
    const need=Math.sqrt(2*Math.max(decel,GRAV*0.35)*DMIN_FRAC*L);// floor the decel so slick ice still kicks hard
    let out=Math.max(Math.abs(v)*REST,need,FLOOR);
    out=Math.min(KICK_MAX,out);
    s=atLeft?0:1; v=atLeft?out:-out;
    bump=0.18;shake=Math.min(7,out/70);
  }
  if(!Number.isFinite(s)||!Number.isFinite(v)){s=0.5;v=0;}

  const bx=railX0+s*dx,by=yL+s*dy-BALL_R;
  if(immune>0)return;
  // swept collision: the ball's path this frame is the segment prev->now.
  // Testing the whole segment (not just the endpoint) stops a fast ball from
  // tunnelling straight across a hole between frames.
  const bxPrev=railX0+sPrev*dx, byPrev=yL+sPrev*dy-BALL_R;
  for(let i=0;i<HOLES.length;i++){
    if(HOLES[i].plugged) continue;                 // sealed: the ball rolls straight over it
    if(segHitsHole(bxPrev,byPrev,bx,by,hX(HOLES[i]),hY(HOLES[i]),CAP)){
      if(i===TARGET_SEQ[round]){
        score++;bank+=left;flash=0.4;flashCol="ok";shake=8;
        HOLES[i].plugged=true;               // plug it: visible progress, safe on the way back up
        v=0;immune=IMMUNE;                 // carry over: keep altitude, keep position
        nextRound();
      }else{
        flash=0.4;flashCol="bad";shake=16;penFx=0.9;wrongHoles++;
        left-=PENALTY;                     // fire vent docks 5s
        if(left<=0){left=0;toBottom();nextRound();}   // nothing left -> round burns
        else toBottom();                   // drop to bottom, clock keeps running
      }
      break;
    }
  }
}

/* ---- render ---- */
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function rail(x,side){
  if(!Number.isFinite(x)||!Number.isFinite(yTop)||!Number.isFinite(yBottom))return; // pre-layout guard
  const w=13,g=ctx.createLinearGradient(x-w,0,x+w,0);
  g.addColorStop(0,"#14171c");g.addColorStop(.45,"#333a42");g.addColorStop(1,"#0e1114");
  ctx.fillStyle=g;rr(x-w/2,yTop-18,w,(yBottom-yTop)+36,5);ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,.45)";ctx.lineWidth=1;
  for(let y=yTop-12;y<yBottom+20;y+=13){ctx.beginPath();ctx.moveTo(x-w/2+1,y);ctx.lineTo(x+w/2-1,y+3);ctx.stroke();}
  const on=bump>0 && ((side==="L"&&s<=0.02)||(side==="R"&&s>=0.98));
  const by=(side==="L"?yL:yR);
  ctx.fillStyle=on?"rgba(215,245,255,.95)":"rgba(120,160,180,.30)";
  rr(x-4,by-15,8,30,3);ctx.fill();
  if(on){ctx.save();ctx.shadowColor="rgba(170,230,255,.95)";ctx.shadowBlur=20;rr(x-4,by-15,8,30,3);ctx.fill();ctx.restore();}
}
function bar(){
  const dx=railX1-railX0,dy=yR-yL,L=Math.hypot(dx,dy),ang=Math.atan2(dy,dx),th=9;
  const hi=iceLvl>=5?"#e8fbff":iceLvl>=3?"#c9f2ff":"#a8dcea";
  const mid=iceLvl>=5?"#8fdff5":iceLvl>=3?"#72cfe8":"#54b2cf";
  ctx.save();ctx.translate(railX0,yL);ctx.rotate(ang);
  const grd=ctx.createLinearGradient(0,-th/2,0,th/2);
  grd.addColorStop(0,hi);grd.addColorStop(.5,mid);grd.addColorStop(1,"#256e86");
  ctx.fillStyle=grd;rr(0,-th/2,L,th,4);ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.32)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(3,-th/2+1.5);ctx.lineTo(L-3,-th/2+1.5);ctx.stroke();
  ctx.restore();

  const bx=railX0+s*dx,by=yL+s*dy-BALL_R;
  const bd=BALL_R*2.1;
  if(artReady){
    ctx.save();ctx.translate(bx,by);ctx.rotate(rot*0.5);        // penguin + shell roll as one
    ctx.drawImage(IMG.penguin,-bd/2,-bd/2,bd,bd);
    ctx.drawImage(IMG.shell,-bd/2,-bd/2,bd,bd);
    ctx.restore();
  }else{
    ctx.fillStyle="#cfe6f2";ctx.beginPath();ctx.arc(bx,by,BALL_R,0,7);ctx.fill();
  }
}
function holesDraw(){
  const lit=done?-1:TARGET_SEQ[round], d=HOLE_R*2.4;
  for(let i=0;i<HOLES.length;i++){
    const x=hX(HOLES[i]),y=hY(HOLES[i]);
    if(!artReady){ctx.fillStyle=i===lit?"#bfe9ff":"#12181d";ctx.beginPath();ctx.arc(x,y,HOLE_R,0,7);ctx.fill();continue;}
    if(i===lit){
      const f=0.78+0.22*Math.sin(flick*6);
      ctx.save();ctx.shadowColor="rgba(150,225,255,"+(0.95*f)+")";ctx.shadowBlur=26;
      ctx.globalAlpha=0.85+0.15*f;
      ctx.drawImage(IMG.cave,x-d/2,y-d/2,d,d);
      ctx.restore();
    }else if(HOLES[i].plugged){
      ctx.drawImage(IMG.hatch,x-d/2,y-d/2,d,d);
    }else{
      const e=0.82+0.18*Math.sin(flick*2.1+i*1.7);   // slow ember pulse
      ctx.save();ctx.globalAlpha=e;
      ctx.drawImage(IMG.fire,x-d/2,y-d/2,d,d);
      ctx.restore();
    }
  }
}
function bgDraw(){
  ctx.fillStyle="#05080b";ctx.fillRect(0,0,W,H);          // outside the rails: solid dark frame
  const px=railX0, pw=railX1-railX0;
  if(artReady){
    ctx.save();
    ctx.beginPath();ctx.rect(px,0,pw,H);ctx.clip();
    const iw=IMG.bg.width, ih=IMG.bg.height;
    const sc=Math.max(pw/iw, H/ih);                        // cover, never stretch
    const dw=iw*sc, dh=ih*sc;
    ctx.drawImage(IMG.bg, px+(pw-dw)/2, (H-dh)/2, dw, dh);
    ctx.restore();
  }else{
    ctx.fillStyle="#0b131b";ctx.fillRect(px,0,pw,H);
  }
  const vg=ctx.createRadialGradient(W/2,H*0.45,Math.max(1,H*0.40),W/2,H*0.5,Math.max(2,H*0.98));
  vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.35)");
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
}
function fmt(t){return t.toFixed(2).padStart(5,"0");}
function startOverlay(){
  // dim the board behind the start card
  ctx.save();
  ctx.fillStyle="rgba(6,10,14,.72)";ctx.fillRect(0,0,W,H);

  ctx.textAlign="center";
  // title
  ctx.shadowColor="rgba(150,225,255,.55)";ctx.shadowBlur=18;
  ctx.fillStyle="#dff4ff";ctx.font="bold 30px 'Courier New',monospace";
  ctx.fillText("DAILY THAW",W/2,H*0.20);
  ctx.shadowBlur=0;
  ctx.fillStyle="rgba(160,195,215,.8)";ctx.font="13px 'Courier New',monospace";
  ctx.fillText("#"+String(puzzleNo).padStart(3,"0"),W/2,H*0.20+22);

  // penguin sprite, centred
  if(artReady){
    const d=Math.min(W,H)*0.16;
    ctx.drawImage(IMG.penguin,W/2-d/2,H*0.28,d,d);
  }

  // today's ice tier — the daily hook
  const names=["","STIFF","FIRM","GLASSY","SLICK","GREASED"];
  ctx.fillStyle="rgba(150,210,235,.9)";ctx.font="bold 14px 'Courier New',monospace";
  ctx.fillText("ICE  "+"\u2588".repeat(iceLvl)+"\u2591".repeat(5-iceLvl)+"   "+(names[iceLvl]||""),W/2,H*0.50);

  // one-line rule
  ctx.fillStyle="rgba(205,220,230,.85)";ctx.font="13px 'Courier New',monospace";
  ctx.fillText("Carry the penguin up to each glowing",W/2,H*0.56);
  ctx.fillText("ice cave. Dodge the fire vents.",W/2,H*0.56+18);

  // yesterday's best, if the player already played today
  if(yourBest){
    ctx.fillStyle="rgba(150,200,225,.75)";ctx.font="12px 'Courier New',monospace";
    ctx.fillText("your best today:  "+yourBest.holesSunk+" / "+ROUNDS+"   \u00b7   banked "+(yourBest.bankedMs/1000).toFixed(1)+"s",W/2,H*0.63);
  }

  // START button
  const bw=170,bh=46,bx=(W-bw)/2,by=H*0.70;
  startBtn={x:bx,y:by,w:bw,h:bh};
  ctx.fillStyle="rgba(150,225,255,.18)";rr(bx,by,bw,bh,10);ctx.fill();
  ctx.strokeStyle="rgba(150,225,255,.7)";ctx.lineWidth=2;rr(bx,by,bw,bh,10);ctx.stroke();
  ctx.fillStyle="#dff4ff";ctx.font="bold 18px 'Courier New',monospace";
  ctx.textBaseline="middle";ctx.fillText(yourBest?"PLAY AGAIN":"START",W/2,by+bh/2);ctx.textBaseline="alphabetic";

  // control legend under the button
  ctx.fillStyle="rgba(150,175,190,.6)";ctx.font="11px 'Courier New',monospace";
  ctx.fillText("tap & drag each half   \u00b7   or  W S  /  \u2191 \u2193",W/2,by+bh+22);
  ctx.restore();
}
function resultsPanel(){
  ctx.save();
  ctx.fillStyle="rgba(6,10,14,.82)";ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  ctx.shadowColor="rgba(150,225,255,.7)";ctx.shadowBlur=16;
  ctx.fillStyle="#dff4ff";ctx.font="bold 22px 'Courier New',monospace";
  ctx.fillText("THAW OVER",W/2,H*0.11);
  ctx.shadowBlur=0;
  ctx.font="bold 34px 'Courier New',monospace";ctx.fillStyle="#cdefff";
  ctx.fillText(score+" / "+ROUNDS,W/2,H*0.11+40);
  ctx.fillStyle="rgba(190,210,222,.85)";ctx.font="13px 'Courier New',monospace";
  ctx.fillText("banked "+bank.toFixed(1)+"s"+(myRank?"    \u00b7    rank #"+myRank:""),W/2,H*0.11+62);

  const lx=W*0.12, lw=W*0.76, top=H*0.28;
  ctx.textAlign="left";
  ctx.fillStyle="rgba(150,200,225,.7)";ctx.font="11px 'Courier New',monospace";
  ctx.fillText("TODAY'S TOP",lx,top-8);
  if(lbLoading){
    ctx.fillStyle="rgba(180,200,215,.6)";ctx.fillText("loading\u2026",lx,top+16);
  }else if(lbRows.length===0){
    ctx.fillStyle="rgba(180,200,215,.6)";ctx.fillText("be the first to finish today",lx,top+16);
  }else{
    let yy=top+14;
    for(const r of lbRows){
      const mine=lbYou&&r.rank===lbYou.rank&&r.name===lbYou.name;
      ctx.fillStyle=mine?"rgba(150,225,255,.95)":"rgba(200,215,225,.82)";
      ctx.font=(mine?"bold ":"")+"12px 'Courier New',monospace";
      ctx.textAlign="left";ctx.fillText("#"+r.rank+"  "+r.name.slice(0,12),lx,yy);
      ctx.textAlign="right";ctx.fillText(r.holesSunk+"/"+ROUNDS+"  "+(r.bankedMs/1000).toFixed(1)+"s",lx+lw,yy);
      yy+=19;
    }
    if(lbYou && !lbRows.some(r=>r.rank===lbYou.rank)){
      yy+=6;
      ctx.strokeStyle="rgba(150,200,225,.25)";ctx.beginPath();ctx.moveTo(lx,yy-14);ctx.lineTo(lx+lw,yy-14);ctx.stroke();
      ctx.fillStyle="rgba(150,225,255,.95)";ctx.font="bold 12px 'Courier New',monospace";
      ctx.textAlign="left";ctx.fillText("#"+lbYou.rank+"  you",lx,yy);
      ctx.textAlign="right";ctx.fillText(lbYou.holesSunk+"/"+ROUNDS+"  "+(lbYou.bankedMs/1000).toFixed(1)+"s",lx+lw,yy);
    }
  }

  ctx.textAlign="center";ctx.fillStyle="rgba(150,190,215,.7)";ctx.font="11px 'Courier New',monospace";
  const cd=Math.max(0,secsNext-Math.floor((performance.now()-doneAt)/1000));
  ctx.fillText("next thaw in  "+formatCountdown(cd),W/2,H*0.66);

  const sbw=W*0.76,sbh=38,sbx=(W-sbw)/2,sby=H*0.685;
  shareBtn={x:sbx,y:sby,w:sbw,h:sbh};
  ctx.fillStyle="rgba(120,180,210,.14)";rr(sbx,sby,sbw,sbh,9);ctx.fill();
  ctx.strokeStyle="rgba(150,205,230,.55)";ctx.lineWidth=1.5;rr(sbx,sby,sbw,sbh,9);ctx.stroke();
  ctx.fillStyle="#cfeaff";ctx.font="bold 13px 'Courier New',monospace";ctx.textBaseline="middle";
  ctx.fillText(shareToast&&performance.now()-shareToast<1600?"COPIED \u2713":"SHARE RESULT",W/2,sby+sbh/2);ctx.textBaseline="alphabetic";

  // POST TO COMMENTS — one per day, upserts on replay
  const cby=H*0.685+46;
  commentBtn={x:sbx,y:cby,w:sbw,h:sbh};
  const cLabel = commentState==='posting'?"POSTING\u2026"
    : commentState==='done'?"POSTED \u2713"
    : commentState==='error'?"TRY AGAIN"
    : "POST TO COMMENTS";
  ctx.fillStyle=commentState==='done'?"rgba(120,200,150,.16)":"rgba(120,180,210,.14)";rr(sbx,cby,sbw,sbh,9);ctx.fill();
  ctx.strokeStyle=commentState==='done'?"rgba(150,220,170,.6)":"rgba(150,205,230,.55)";ctx.lineWidth=1.5;rr(sbx,cby,sbw,sbh,9);ctx.stroke();
  ctx.fillStyle="#cfeaff";ctx.font="bold 13px 'Courier New',monospace";ctx.textBaseline="middle";
  ctx.fillText(cLabel,W/2,cby+sbh/2);ctx.textBaseline="alphabetic";

  const bw=sbw,bh=42,bx=(W-bw)/2,by=H*0.685+94;
  playBtn={x:bx,y:by,w:bw,h:bh};
  ctx.fillStyle="rgba(150,225,255,.18)";rr(bx,by,bw,bh,10);ctx.fill();
  ctx.strokeStyle="rgba(150,225,255,.7)";ctx.lineWidth=2;rr(bx,by,bw,bh,10);ctx.stroke();
  ctx.fillStyle="#dff4ff";ctx.font="bold 17px 'Courier New',monospace";ctx.textBaseline="middle";
  ctx.fillText("PLAY AGAIN",W/2,by+bh/2);ctx.textBaseline="alphabetic";
  ctx.restore();
}

function stickIndicator(cx:number,anchorY:number|null,fx:number,fy:number,vel:number){
  if(anchorY===null)return;                 // only when this thumb is down
  const R=STICK_RANGE;                       // outer ring = full-speed boundary
  ctx.save();
  // outer boundary ring (how far = full speed)
  ctx.strokeStyle="rgba(150,210,235,.22)";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(cx,anchorY,R,0,Math.PI*2);ctx.stroke();
  // anchor dot (the pivot)
  ctx.fillStyle="rgba(150,210,235,.35)";
  ctx.beginPath();ctx.arc(cx,anchorY,6,0,Math.PI*2);ctx.fill();
  // line from anchor to finger (direction + magnitude)
  ctx.strokeStyle="rgba(180,230,255,.5)";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(cx,anchorY);ctx.lineTo(cx,fy);ctx.stroke();
  // finger knob — brightens as it nears full deflection
  const mag=Math.min(1,Math.abs(vel));
  ctx.fillStyle="rgba("+(150+80*mag)+","+(220-40*mag)+",255,"+(0.5+0.4*mag)+")";
  ctx.beginPath();ctx.arc(cx,fy,13,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function hud(){
  ctx.textBaseline="alphabetic";
  // ---- LEFT column ----
  ctx.font="10px 'Courier New',monospace";ctx.fillStyle="rgba(150,170,185,.5)";
  ctx.textAlign="left";ctx.fillText("DAILY THAW · #"+String(puzzleNo).padStart(3,"0"),14,18);
  ctx.fillStyle="rgba(215,235,245,.95)";ctx.font="bold 18px 'Courier New',monospace";
  ctx.fillText("RESCUED "+score+"/"+ROUNDS,14,42);
  ctx.fillStyle="rgba(150,200,220,.65)";ctx.font="10px 'Courier New',monospace";
  ctx.fillText("banked "+bank.toFixed(1)+"s",14,60);
  ctx.fillStyle="rgba(5,8,11,.6)";ctx.fillRect(10,H-46,120,18);
  ctx.fillStyle="rgba(150,200,220,.8)";
  ctx.fillText("ICE  "+"█".repeat(iceLvl)+"░".repeat(5-iceLvl),16,H-34);
  const danger=left<10;
  ctx.textAlign="right";ctx.fillStyle="rgba(150,175,190,.55)";ctx.font="9px 'Courier New',monospace";
  ctx.fillText("TIME",W-16,14);
  ctx.save();
  if(penFx>0.55){const j=(penFx-0.55)*14;ctx.translate((Math.random()-.5)*j,(Math.random()-.5)*j);}
  ctx.shadowColor=danger||penFx>0?"rgba(255,90,60,.85)":"rgba(150,225,255,.7)";ctx.shadowBlur=12;
  ctx.font="bold 25px 'Courier New',monospace";ctx.fillStyle=(danger||penFx>0.5)?"#ff6a4a":"#a9e6ff";
  ctx.textAlign="right";ctx.fillText(fmt(Math.max(0,left)),W-14,34);ctx.restore();
  if(penFx>0){                                   // floating "-5s"
    const t=1-penFx/0.9, a=Math.max(0,1-t*1.1);
    ctx.save();ctx.globalAlpha=a;ctx.shadowColor="rgba(255,90,60,.9)";ctx.shadowBlur=10;
    ctx.fillStyle="#ff7a52";ctx.font="bold 20px 'Courier New',monospace";ctx.textAlign="center";
    ctx.fillText("-"+PENALTY+"s",W/2,H*0.30-t*26);ctx.restore();
  }
  ctx.textAlign="right";ctx.fillStyle="rgba(150,170,185,.6)";ctx.font="10px 'Courier New',monospace";
  ctx.fillText("TARGET "+Math.min(round+1,ROUNDS)+"/"+ROUNDS+"  ·  "+roundTime(round,iceLvl)+"s",W-14,54);
  ctx.textAlign="center";ctx.font="11px 'Courier New',monospace";ctx.fillStyle="rgba(150,170,185,.5)";
  if(!started && !done){
    startOverlay();
  }else if(!done){
    // in-game control hint, bottom centre
    // dark band so the bottom hint never clashes with holes/the bar
    ctx.fillStyle="rgba(5,8,11,.72)";ctx.fillRect(0,H-26,W,26);
    ctx.textAlign="center";ctx.fillStyle="rgba(170,195,210,.7)";ctx.font="10px 'Courier New',monospace";
    ctx.fillText("drag each half  \u00b7  W S / \u2191 \u2193  \u2014  fire vents drop you",W/2,H-9);
  }
  if(done){
    resultsPanel();
  }
}
function render(){
  ctx.save();
  if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=0.86;if(shake<0.3)shake=0;}
  bgDraw();rail(railX0,"L");rail(railX1,"R");holesDraw();bar();
  if(flash>0){ctx.fillStyle=(flashCol==="ok"?"rgba(140,220,255,":"rgba(235,95,45,")+(flash*0.5)+")";ctx.fillRect(0,0,W,H);flash-=0.03;if(flash<0)flash=0;}
  ctx.restore();
  if(started && !done){ stickIndicator(anchorLX,anchorL,fingerLX,fingerLY,velL); stickIndicator(anchorRX,anchorR,fingerRX,fingerRY,velR); }
  hud();
}
let acc=0,last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;if(dt>0.25)dt=0.25;
  acc+=dt;flick+=dt;
  while(acc>=STEP){update();acc-=STEP;}
  render();
}
layout();                 // railX0/yTop must exist before frame 1 (init() is async)
addEventListener("resize",resize);
requestAnimationFrame(frame);

async function submitScore():Promise<void>{
  if(submitted)return; submitted=true
  lbLoading=true
  const elapsedMs=Math.round(performance.now()-runStart)
  const rsp=await fetchSubmitScore({
    day:curDay, holesSunk:score, bankedMs:Math.round(bank*1000),
    wrongHoles, elapsedMs,
  })
  if(rsp){myRank=rsp.rank; yourBest=rsp.best}
  const lb=await fetchLeaderboard()
  if(lb){lbRows=lb.entries.slice(0,5); lbYou=lb.you}
  lbLoading=false
}

function shareText():string{
  const mins=Math.floor(secsNext/3600)  // not used but keeps countdown fresh
  return "\uD83E\uDDCA Daily Thaw #"+String(puzzleNo).padStart(3,"0")+"  "+score+"/"+ROUNDS+
    "  \u00b7  banked "+bank.toFixed(1)+"s"+(myRank?"  \u00b7  rank #"+myRank:"")
}

async function doComment():Promise<void>{
  if(commentState==='posting'||commentState==='done')return
  commentState='posting'
  const r=await fetchPostComment(curDay)
  commentState = r&&(r.posted||r.updated) ? 'done' : 'error'
}

async function doShare():Promise<void>{
  const txt=shareText()+"\n\nplay: r/daily_thaw_dev"
  try{
    if(navigator.share){await navigator.share({text:txt})}
    else{await navigator.clipboard.writeText(txt); shareToast=performance.now()}
  }catch{/* user dismissed */}
}

async function init():Promise<void>{
  const rsp=await fetchDaily()
  if(rsp){
    barFric=rsp.board.barFric; iceLvl=rsp.board.iceLvl
    HOLES=rsp.board.holes.map(h=>({...h})); TARGET_SEQ=rsp.board.targetSeq
    curDay=rsp.board.day; puzzleNo=rsp.puzzle; secsNext=rsp.secondsUntilNext; yourBest=rsp.yourBest
  }
  resize(); reset()
}
void init()