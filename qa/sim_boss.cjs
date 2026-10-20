// 特別コース（3区間＋ボス）の強さを、自動プレイで測る道具。本物の index.html のコードをそのまま動かす。
// 使い方: node qa/sim_boss.cjs [試行数]   （既定 200）
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const expose=fs.readFileSync(path.join(__dirname,'audit.cjs'),'utf8').match(/const expose=`([\s\S]*?)`;/)[1].replace('get B(){return B},','get B(){return B},set B(v){B=v},');
const js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((x,y)=>y.length-x.length)[0];
const marked=js.replace(/\}\)\(\);\s*$/,expose+'\n})();');
const vc=new VirtualConsole();
const dom=new JSDOM(html.replace(js,marked),{url:'https://example.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:true});w.setInterval=()=>1;w.setTimeout=()=>1;w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLMediaElement.prototype.play=()=>Promise.resolve();w.HTMLMediaElement.prototype.pause=()=>{};}});
const w=dom.window,q=w.qa,$=id=>w.document.getElementById(id);q.quiet();
const N=+process.argv[2]||200;

const CONFIGS_ALL={
 'ママチャリ(¥0)':{bike:'mama',parts:[]},
 'クロスバイク(6万)':{bike:'cross',parts:[]},
 'グラベル(20万)':{bike:'gravel',parts:[]},
 'グラベル+部品(約27万)':{bike:'gravel',parts:'best'},
 'チタン分割グラベル(80万)':{bike:'tigrav',parts:[]},
 'グラベル+4枠':{bike:'gravel',parts:'full4'},
 'MTB+4枠':{bike:'mtb',parts:'full4'},
 'MTB+5枠':{bike:'mtb',parts:'full5'},
 'ランドナー+5枠':{bike:'rando',parts:'full5'},
 'チタン分割+5枠':{bike:'tigrav',parts:'full5'},
};
const PARTBY={climb:'wheelc2',rough:'tire',cruise:'aero',wx:'fender'};// ホイールは1つだけ装備：登坂・巡航は最上位のカーボン製軽量、悪路はMTB用

function smart(){const S=q.S,B=q.B,left=B.limit-B.turn+1;
 if(S.hp<=15)return S.food>0?'food':S.food2>0?'food2':'rest';
 if(S.hp<=30&&S.food>0)return 'food';
 const pp=q.bikeStats()[B.e.stat]*4+4;
 if(B.charge)return 'push';
 if(S.mp>=20&&left>=3&&B.hp>pp*1.5)return 'kiai';
 return 'push';}
function naive(){const S=q.S;if(S.hp<=15)return S.food>0?'food':'rest';return 'push';}
function smartT(){const S=q.S,B=q.B;if(B.next==='heavy'&&S.hp<=55&&!B.charge&&q.cmd&&true){try{}catch(e){}}return smart();}


// 先読み（モンテカルロ）で各手を評価する「上手いプレイヤー」。現在の戦闘が終わるまでを K 回ずつ試し、勝ちの割合＋残り体力で選ぶ
const K=+process.env.K||8;
const clone=o=>JSON.parse(JSON.stringify(o));
function snap(){return {S:clone(q.S),B:Object.assign({},q.B),tripI:q.trip.i,tripLate:q.trip.late};}
function restore(sn){const S=clone(sn.S);q.S=S;q.B=Object.assign({},sn.B);q.trip.i=sn.tripI;q.trip.late=sn.tripLate;$('ov-battle').hidden=false;}
function legal(){const S=q.S,B=q.B,a=[];if(S.hp>15)a.push('push');if(S.hp>8)a.push('walk');if(S.mp>=20)a.push('kiai');a.push('rest','guard');if(q.S.food>0)a.push('food');
 try{const t=q.TACT[B.kind];if(t)a.push('tactic');}catch(e){}return a;}
function rollout(first){// 現在の戦闘が終わるまで、まず first、あとは smart で進める
 const B0=q.B;let k=first,g=0;
 while(g++<30){const B=q.B;if(!B||q.trip.late||$('ov-battle').hidden&&B.hp>0)break;if(B.hp<=0)return {win:true,hp:q.S.hp,mp:q.S.mp};
  const before=q.S.hp+'/'+q.S.mp+'/'+B.hp+'/'+B.turn;q.cmd(k||smart());k=null;
  if(q.B.hp<=0)return {win:true,hp:q.S.hp,mp:q.S.mp};if(q.trip.late)return {win:false,hp:q.S.hp,mp:q.S.mp};
  if(before===q.S.hp+'/'+q.S.mp+'/'+q.B.hp+'/'+q.B.turn&&!k){k='rest';}}
 return {win:q.B.hp<=0,hp:q.S.hp,mp:q.S.mp};}
function planner(){const sn=snap();let best=null,bv=-1;
 for(const a of legal()){let v=0;for(let i=0;i<K;i++){restore(sn);const r=rollout(a);v+=(r.win?1+.004*r.hp+.002*r.mp:0);}
  if(v>bv){bv=v;best=a;}}
 restore(sn);return best||'rest';}

function runCourse(prefName,cfg,year,policy,hp0,mp0){
 const p=q.PREF.find(x=>x.name===prefName),start=q.PREF.find(x=>x.name==='茨城').id;
 for(const id of ['ov-result','ov-battle','ov-camp','ov-tc','ov-pay','ov-storm','pop'])if($(id))$(id).hidden=true;
 q.newGame(start);const S=q.S;S.money=1e8;S.turn=year===1?1:53;S.bike=cfg.bike;
 let parts=cfg.parts,full=false;if(parts==='full4'||parts==='full5'){full=true;const sp=q.ENEMY[q.SPEC[prefName].boss].stat,n=parts==='full4'?4:5;const base=parts==='full4'?['comph','rack2']:['compi','rack4'];const pool=[PARTBY[sp],'aero','fender'].filter((x,i,a)=>a.indexOf(x)===i);parts=[...base,...pool].slice(0,n);}else if(parts==='best'){const sp=q.ENEMY[q.SPEC[prefName].boss].stat;parts=[PARTBY[sp],'fender'===PARTBY[sp]?'tire':'fender'];}
 S.parts=parts.slice();S.food=full?q.foodMax():3;if(process.env.SMALLS){const st=q.ENEMY[q.SPEC[prefName].boss].stat;S.acc=process.env.SMALLS==='max'?['sg2',st==='rough'?'shoe3':'shoe1','hel2']:process.env.SMALLS==='basic'?['sg1','shoe1','hel1']:process.env.SMALLS.split(',');S.owned.acc=S.acc.slice();}S.hp=hp0;S.mp=mp0;S.visits[p.id]=3;S.fam[p.id]=false;
 S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx:'sun'}]));
 q.startTrip(p,false);
 let bossHp=null,bossMp=null,guard=0;
 while(!q.trip.late&&q.trip.i<q.trip.enc.length&&guard++<400){
  if(!$('ov-tc').hidden)return null;// ツチノコ（まれ）で中断した試行は数えない
  const B=q.B;if(!B||$('ov-battle').hidden)break;
  if(q.trip.i===q.trip.enc.length-1&&bossHp===null){bossHp=q.S.hp;bossMp=q.S.mp;}
  if(B.hp<=0){const b=$('bt-cmds').querySelector('button');b.click();continue;}
  q.cmd(policy());
 }
 const reached=q.trip.i>=q.trip.enc.length-1&&bossHp!==null;
 return {win:!q.trip.late&&q.trip.i>=q.trip.enc.length,reached,bossHp,bossMp,failAt:q.trip.late?q.trip.i:-1};
}
const bosses=Object.keys(q.SPEC).map(n=>({n,b:q.SPEC[n].boss,st:q.ENEMY[q.SPEC[n].boss].stat,d:q.PREF.find(x=>x.name===n).diff}));
const CONFIGS=process.env.NEWCFG?Object.fromEntries(Object.entries(CONFIGS_ALL).filter(([k])=>/MTB/.test(k)||(process.env.MTBONLY?false:/枠|ママ|グラベル\(/.test(k)||k.startsWith('クロス')))):CONFIGS_ALL;
if(process.env.CFGS){const k=process.env.CFGS.split(',');for(const n of Object.keys(CONFIGS))if(!k.some(x=>n.includes(x)))delete CONFIGS[n];}
const out=[];
const POLS=process.env.PLAN?[['先読み(上手い人)',planner]]:process.env.SMART?[['賢め',smart]]:[['賢め',smart],['ただ踏む',naive]];
for(const [pname,policy] of POLS)
 for(const year of (process.env.YEARS||'1,2').split(',').map(Number))
  for(const [hp0,mp0,lab] of (process.env.FULL?[[100,100,'満タン出発']]:[[100,100,'満タン出発'],[80,60,'やや消耗(80/60)']])){
   console.log(`\n### ${pname}／${year}年目／${lab}   勝率%（4戦全部）  [ボス到着時の体力/気力 平均]`);
   console.log(['県(難度,ボス能力)'.padEnd(16),...Object.keys(CONFIGS).map(s=>s.padEnd(22))].join(' '));
   for(const b of bosses.filter(x=>!process.env.ONLY||process.env.ONLY.split(',').includes(x.n))){
    const row=[`${b.n}(${b.d},${b.st})`.padEnd(16)];
    for(const [cn,cfg] of Object.entries(CONFIGS)){
     let n=0,win=0,hpS=0,mpS=0,rc=0;
     for(let i=0;i<N;i++){const r=runCourse(b.n,cfg,year,policy,hp0,mp0);if(!r)continue;n++;if(r.win)win++;if(r.bossHp!==null){rc++;hpS+=r.bossHp;mpS+=r.bossMp;}}
     row.push(`${(win/n*100).toFixed(0).padStart(3)}% [${rc?Math.round(hpS/rc):'-'}/${rc?Math.round(mpS/rc):'-'}]`.padEnd(22));
    }
    console.log(row.join(' '));
   }
  }
w.close();
