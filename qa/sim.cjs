// 自動プレイ(ボット)によるバランス測定。jsdom上で実コードを動かし、描画待ちなしで何百週も回す。
// 使い方: node qa/sim.cjs [ゲーム数=10] [ホーム県id=12] [HTMLパス=index.html] [出力json]
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const GAMES=+(process.argv[2]||10),HOME=+(process.argv[3]||12);
const file=path.resolve(process.argv[4]||path.join(__dirname,'..','index.html')),OUT=process.argv[5];
const html=fs.readFileSync(file,'utf8');
const expose=`window.qa={newGame,render,renderShop,restHome,startTrip,travelInfo,famCount,calendar,
get S(){return S},get B(){return B},get trip(){return trip},PREF,ENEMY,TRIAL_KEYS,
quiet(){render=()=>save();playSE=()=>{};playBGM=()=>{};}};`;
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const marked=js.replace(/\}\)\(\);\s*$/,expose+'\n})();');
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const CL={plain:[12,26],summer:[20,38],mid:[6,22],winter:[-10,10],all:[-5,32]};
const BUY=[['cloth','mid',12000],['tarp','tp1',5000],['shelter','sh2',15000],['cloth','summer',8000],['fire','fire1',6000],['cloth','winter',25000],['bike','cross',60000],['part','spray',12000],['part','oil',8000],['part','tripod',10000],['tarp','tp2',18000],['part','cam',80000],['bike','gravel',200000],['cloth','all',60000],['shelter','sh3',55000]];
function play(seed){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace(js,marked),{url:'https://example.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:true});w.setInterval=()=>1;w.setTimeout=()=>1;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLMediaElement.prototype.play=()=>Promise.resolve();w.HTMLMediaElement.prototype.pause=()=>{};w.Math.random=mulberry(seed);}});
 const w=dom.window,q=w.qa,$=id=>w.document.getElementById(id),vis=id=>!$(id).hidden;
 q.quiet();q.newGame(HOME);const S=()=>q.S;
 const R={seed,stuck:0,errors:0,rinko:0,stay:0,ride:0,rest:0,years:[],cmd:{},traj:[]};
 const click=el=>el&&!el.disabled&&(el.click(),true);
 function buy(){const s=S();for(const [sub,id,pr] of BUY){if(s.money<pr+15000)break;const kind=sub==='cloth'?'cloth':sub==='bike'?'bikes':sub==='part'?'parts':'gear';if(s.owned[kind].includes(id))continue;
   q.renderShop();const bt=$('shop-'+sub)&&$('shop-'+sub).querySelector(`[data-id="${id}"] button[data-act="buy"]`);if(!bt||bt.disabled)break;bt.click();if(vis('ov-pay'))$('pay-yes').click();}
  if(s.food<2&&s.money>20000){q.renderShop();const fb=$('shop-food').querySelector('[data-food]');if(fb&&!fb.disabled){fb.click();if(vis('ov-pay'))$('pay-yes').click();}}}
 function dress(temp){const s=S();const fit=Object.keys(CL).filter(k=>s.owned.cloth.includes(k)&&CL[k][0]<=temp&&temp<=CL[k][1]);if(fit.length&&!fit.includes(s.cloth)){s.cloth=fit[0];}}
 function pick(){const s=S();const f=s.forecast;const c=[];
  for(const p of q.PREF){if(s.fam[p.id]&&p.id!==s.loc)continue;if(s.fam[p.id])continue;const ti=q.travelInfo(p),stay=p.id===s.loc;const fc=f[p.id];const v=s.visits[p.id];
   let sc=v*2-(p.diff||0)*.3;if(fc.wx==='typhoon')sc-=8;if(fc.wx==='rain')sc-=2;if(fc.wx==='wind')sc-=1;
   if(stay){if(s.mp<55)continue;c.push({p,sc:sc-1,rinko:false,temp:fc.temp});}
   else if(ti.ride&&ti.enc<=3)c.push({p,sc:sc-ti.enc*1.6,rinko:false,temp:fc.temp});
   else if(s.money>ti.rinko+20000)c.push({p,sc:sc-3-ti.rinko/5000,rinko:true,temp:fc.temp});}
  c.sort((a,b)=>b.sc-a.sc);return c[0];}
 function drive(){let g=0;
  while(g++<400){
   if(vis('ov-pay')){$('pay-yes').click();continue;}
   if(vis('ov-tc')){const bs=[...$('tc-btns').querySelectorAll('button')];const b=bs.find(x=>!x.disabled&&!x.classList.contains('primary'))||bs[bs.length-1];b.click();const nx=$('tc-btns').querySelector('button.primary');if(nx)nx.click();continue;}
   if(vis('ov-battle')){const s=S(),B=q.B;const all=[...$('bt-cmds').querySelectorAll('button')].filter(b=>!b.disabled);
     if(all.length===1&&!all[0].dataset.cmd){R.fail=(R.fail||0)+1;all[0].click();continue;}// 敗北後の「とぼとぼ向かう」(data-cmdなし)
     const bs=all.filter(b=>b.dataset.cmd);const names=bs.map(b=>b.dataset.cmd);if(!names.length)return false;
     const heavy=$('bt-nx').textContent.includes('激しい');let k;
     if(names.includes('next'))k='next';else if(s.hp<=35&&names.includes('food'))k='food';
     else if(names.includes('tactic')&&(heavy||(s.mp>=40&&s.hp<80)))k='tactic';else if(heavy&&names.includes('guard')&&s.hp<60)k='guard';
     else if(s.hp<=20&&names.includes('rest'))k='rest';else k=names.includes('push')?'push':names.includes('post')?'post':names[0];
     R.cmd[k]=(R.cmd[k]||0)+1;bs[names.indexOf(k)].click();continue;}
   if(vis('ov-camp')){const s=S();const bs=[...$('camp-btns').querySelectorAll('button')];const en=bs.map(x=>!x.disabled);
     const i=s.hp<50?(en[0]?0:3):s.mp<45?3:s.hp>75&&s.mp>55?2:1;(en[i]?bs[i]:bs[3]).click();continue;}
   if(vis('ov-result')){const tx=$('result-box').textContent;if(tx.includes('決算'))R.years.push({fam:q.famCount(),fame:S().fame,money:S().money,rank:(tx.match(/（[\d,]+pt）/)||[''])[0],txt:(tx.match(/年間評価.{0,12}/)||[''])[0]});$('res-ok').click();continue;}
   if(vis('ov-go')){$('go-yes').click();continue;}
   if(!$('pop').hidden){$('pop').hidden=true;continue;}
   return true;}
  return false;}
 for(let t=0;t<104;t++){
  try{buy();const s=S();let a;
   if(s.hp<45||s.mp<35){R.rest++;q.restHome();if(vis('ov-pay'))$('pay-yes').click();}
   else{a=pick();if(!a){R.rest++;q.restHome();if(vis('ov-pay'))$('pay-yes').click();}
    else{if(a.rinko)R.rinko++;else if(a.p.id===s.loc)R.stay++;else R.ride++;dress(a.temp);q.startTrip(a.p,a.rinko);}}
   if(!drive()){R.stuck++;R.dbg=['drive-false',['ov-pay','ov-tc','ov-battle','ov-camp','ov-result','ov-go'].filter(vis),$('bt-cmds').textContent.slice(0,80)];break;}
   if(vis('ov-result')||vis('ov-camp')||vis('ov-battle')){R.stuck++;R.dbg=['overlay-left',['ov-pay','ov-tc','ov-battle','ov-camp','ov-result','ov-go'].filter(vis)];break;}
   R.traj.push([S().turn,q.famCount(),S().fame,S().money]);
  }catch(e){R.errors++;R.lastErr=String(e.stack||e.message).split('\n').slice(0,3).join(' | ');break;}
 }
 const s=S();R.final={turn:s.turn,fam:q.famCount(),visited:s.visits.filter(v=>v>0).length,fame:s.fame,money:s.money,wins:s.stats.wins,bike:s.bike,en:s.stats.en,tc:s.stats.tc};R.jsErrors=errors.slice(0,3);
 w.close();return R;}
const runs=[];for(let i=0;i<GAMES;i++){const r=play(1000+i);runs.push(r);console.log(`game${i} turn${r.final.turn} 県${r.final.fam} 訪問${r.final.visited} fame${r.final.fame} ¥${r.final.money} stuck${r.stuck} err${r.errors} ${JSON.stringify(r.dbg||'')}${r.lastErr?' '+r.lastErr:''}`);}
if(OUT)fs.writeFileSync(OUT,JSON.stringify(runs));
