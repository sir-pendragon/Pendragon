const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const filename=path.resolve(process.argv[2]||path.join(__dirname,'..','index.html'));
const html=fs.readFileSync(filename,'utf8');
const expose=`window.qa={get sgPage(){return SGPG},set sgPage(v){SGPG=v},needV,isCourse,askGo,ENEMY,SPEC,SIGHTS,TACT,tlEnc,tlDec,newGame,render,renderMap,renderBattle,renderShop,renderForge,renderDetail,renderList,renderTrials,renderSights,load,save,pack,snap,advance,calendar,rollForecast,startTrip,stayWx,startBattle,cmd,endTrip,endTrip2,nextEncounter,tsuchinoko,tcRate,bikeStats,gearFx,travelInfo,restHome,yearEval,eventAt,stoveOn,plv,rkLv,PREF,ENEMY,GEAR_ITEMS,PARTS,BIKES,CLOTHES,WXL,TRIAL_KEYS,AUD,tcRate,playBGM,bgmApply,
get S(){return S},set S(v){S=v},get B(){return B},get trip(){return trip},set trip(v){trip=v},get TS(){return TS},get inTrip(){return INTRIP},get lastSave(){return LASTSAVE},
quiet(){render=()=>save();renderBattle=()=>{};playSE=()=>{};playBGM=()=>{};}};`;
const js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((x,y)=>y.length-x.length)[0];// 先頭の短い移動スクリプトではなく、本体（最長）を読む
const marked=js.replace(/\}\)\(\);\s*$/,expose+'\n})();');
function boot(saved,sound,url='https://example.test/'){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace(js,marked),{url,runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.matchMedia=()=>({matches:true});w.setInterval=()=>1;w.setTimeout=()=>1;w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLMediaElement.prototype.play=()=>Promise.resolve();w.HTMLMediaElement.prototype.pause=()=>{};
 if(saved!==undefined)w.localStorage.setItem('charicamp',JSON.stringify(saved));if(sound!==undefined)w.localStorage.setItem('cc_snd',JSON.stringify(sound));
 }});return {dom,w:dom.window,q:dom.window.qa,$:id=>dom.window.document.getElementById(id),errors};
}
const results=[];
function test(name,fn){let c;try{c=boot();assert.ok(c.q,'script must boot');c.q.newGame(12);c.w.Math.random=()=>.99;fn(c);assert.deepEqual(c.errors,[]);results.push({name,ok:true});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.message});console.log('FAIL',name,'—',e.message.slice(0,500));}finally{c?.dom.window.close();}}
function batt(c,kind='hill',enc=[kind],hp=100){const {q}=c;q.trip={p:q.PREF[12],enc,i:0,late:false,stay:false,sec:10,rk:1000};q.S.hp=hp;q.S.mp=100;q.snap();q.startBattle(kind);q.B.next='normal';return q.B;}
function clear(c){c.$('ov-result').hidden=true;c.$('ov-battle').hidden=true;c.$('ov-camp').hidden=true;c.$('ov-tc').hidden=true;}
test('normal start and preview-only debug funds',c=>{assert.equal(c.q.S.money,30000);for(const [url,money] of [['https://pendragon-2tf.pages.dev',30000],['https://abc.pendragon-2tf.pages.dev',10000000],['https://pendragon-2tf.pages.dev.evil.test',30000]]){const d=boot(undefined,undefined,url);try{d.q.newGame(12);assert.equal(d.q.S.money,money);}finally{d.dom.window.close();}}});
test('all 104 calendar weeks and year progress',c=>{for(let t=1;t<=104;t++){const a=c.q.calendar(t);assert.equal(a.year,Math.ceil(t/52));assert.ok(a.month>=1&&a.month<=12);}c.q.S.turn=53;c.q.render();assert.equal(c.$('d-wk').textContent,'（1/52）');});
test('every region, weather, year and transport generates valid encounters',c=>{const {q,w}=c;q.quiet();let n=0;for(const turn of [1,53,90])for(const wx of q.WXL)for(const p of q.PREF)for(const rinko of [false,true]){clear(c);q.newGame(12);q.S.turn=turn;q.S.money=1e8;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx}]));try{q.startTrip(p,rinko);if(!c.$('ov-storm').hidden){c.$('st-stay').click();c.$('ov-storm').hidden=true;}assert.ok(q.trip.enc.every(k=>!!q.ENEMY[k]),'unknown encounter');}catch(e){throw Error(p.name+' / '+wx+' / turn '+turn+' / rinko '+rinko+': '+e.message);}n++;}assert.equal(n,1974);});
test('next encounter does not act automatically',c=>{const b=batt(c,'hill',['hill','rough']);b.hp=1;c.q.cmd('push');c.$('bt-cmds').querySelector('button').click();assert.equal(c.q.B.kind,'rough');assert.equal(c.q.B.turn,1);assert.equal(c.q.S.hp,85);assert.equal(c.q.S.stats.wins,1);});
test('final victory opens camp once and counts once',c=>{batt(c).hp=1;c.q.cmd('push');c.$('bt-cmds').querySelector('button').click();assert.equal(c.q.S.stats.wins,1);assert.equal(c.$('ov-camp').hidden,false);assert.equal(c.q.S.stats.posts,0);});
test('all enemy statistics and tactics stay finite',c=>{const {q}=c;q.quiet();for(const kind of Object.keys(q.ENEMY)){q.newGame(12);q.S.gear={fire:'fire1',shelter:'sh3',tarp:'tp3'};batt(c,kind);q.cmd('tactic');for(const x of [q.S.hp,q.S.mp,q.B.hp,q.B.atk])assert.ok(Number.isFinite(x),kind);assert.equal(q.S.stats.en[kind][0],1);}});
test('rough capability and tire upgrades affect dirt trials',c=>{batt(c,'rough');const a=c.q.bikeStats().rough;c.q.S.parts=['tire'];c.q.S.plus.tire=2;assert.equal(c.q.bikeStats().rough,a+4);});
test('spray halves bear damage, oil halves road-enemy damage only',c=>{const {q}=c;q.quiet();for(const kind of ['bear','brownbear','car','bike','hill']){q.newGame(12);batt(c,kind);const a=q.B.atk;q.S.parts=['spray','oil'];q.startBattle(kind);assert.equal(q.B.atk,kind==='hill'?a:Math.round(q.ENEMY[kind].atk*.5));}});
test('walking is disabled at stamina eight',c=>{batt(c,'hill',['hill'],8);c.q.renderBattle();assert.equal(c.$('bt-cmds').querySelector('[data-cmd="walk"]').disabled,true);});
test('command model rejects insufficient stamina and unknown actions',c=>{batt(c,'hill',['hill'],8);const b=c.q.B,h=b.hp;for(const k of ['walk','push','no-such-command'])c.q.cmd(k);assert.equal(c.q.S.hp,8);assert.equal(b.hp,h);assert.equal(b.turn,1);});
test('finished battle cannot add another victory',c=>{batt(c).hp=1;c.q.cmd('push');const wins=c.q.S.stats.wins;c.q.cmd('push');assert.equal(c.q.S.stats.wins,wins);assert.equal(c.q.S.hp,85);});
test('rival rejects road-only commands',c=>{batt(c,'rival');const hp=c.q.B.hp;c.q.cmd('push');assert.equal(c.q.B.hp,hp);assert.equal(c.q.S.hp,100);});
test('food is consumed once and health remains capped',c=>{batt(c);c.q.S.hp=50;c.q.S.mp=40;c.q.S.food2=1;c.q.cmd('food2');assert.equal(c.q.S.food2,0);assert.ok(c.q.S.hp<=100);const turn=c.q.B.turn;c.q.cmd('food2');assert.equal(c.q.B.turn,turn);});
test('guard and bike tactic avoid expected enemy damage',c=>{batt(c,'bike');const hp=c.q.S.hp;c.q.cmd('tactic');assert.equal(c.q.S.hp,hp);assert.equal(c.q.S.mp,97);});
test('rain tactic requires shelter or tarp',c=>{batt(c,'rain');c.q.S.gear={fire:null,shelter:null,tarp:null};const turn=c.q.B.turn;c.q.cmd('tactic');assert.equal(c.q.B.turn,turn);});
test('failed trial is counted once',c=>{const b=batt(c,'hill',['hill'],1);c.q.cmd('guard');assert.equal(c.q.trip.late,true);assert.equal(c.q.S.stats.en.hill[2],1);c.q.cmd('guard');assert.equal(c.q.S.stats.en.hill[2],1);});
test('rinko cancellation and payment preserve counters',c=>{batt(c,'hill',['hill','rough']);const m=c.q.S.money;c.q.cmd('rinko');c.$('pay-no').click();assert.equal(c.q.S.money,m);c.q.cmd('rinko');c.$('pay-yes').click();assert.equal(c.q.S.money,m-1000);assert.equal(c.q.S.stats.en.hill[1],1);assert.equal(c.q.B.kind,'rough');});
test('tsuchinoko displayed probability matches pre-payment morale',c=>{const {q,w}=c;batt(c);q.S.mp=60;w.Math.random=()=>.35;q.tsuchinoko(()=>{});assert.ok(c.$('tc-btns').textContent.includes('40%'));c.$('tc-btns').querySelector('button').click();assert.equal(q.S.stats.tc,1);assert.equal(q.S.mp,50);assert.equal(q.S.fame,200000);});
test('tsuchinoko first and repeat rewards and continuation',c=>{const {q,w}=c;batt(c);q.S.mp=100;w.Math.random=()=>0;let continues=0;q.tsuchinoko(()=>continues++);c.$('tc-btns').querySelector('button').click();c.$('tc-btns').querySelector('button').click();assert.equal(continues,1);q.tsuchinoko(()=>{});c.$('tc-btns').querySelector('button').click();assert.equal(q.S.fame,250000);assert.equal(q.S.stats.tc,2);assert.equal(q.S.stats.en.tsuchi[1],2);});
test('tsuchinoko shortage disables photos and skip grants no reward',c=>{batt(c);c.q.S.mp=9;c.q.tsuchinoko(()=>{});const bs=c.$('tc-btns').querySelectorAll('button');assert.equal(bs[0].disabled,true);assert.equal(bs[1].disabled,true);bs[2].click();assert.equal(c.q.S.stats.tc,0);assert.equal(c.$('ov-tc').hidden,true);});
test('camp action costs and familiarity discount',c=>{const {q}=c;q.S.money=10000;q.S.fam[12]=true;q.trip={p:q.PREF[12],enc:[],i:0,late:false,stay:true};q.snap();q.endTrip();c.$('camp-btns').querySelector('button').click();assert.equal(q.TS.fee,1250);assert.equal(q.S.money,10000-1250-800+q.TS.inc);assert.equal(q.S.stats.posts,1);});
test('unaffordable camp meal is disabled',c=>{c.q.S.money=0;c.q.trip={p:c.q.PREF[12],enc:[],i:0,late:false,stay:true};c.q.endTrip();assert.equal(c.$('camp-btns').querySelector('button').disabled,true);});
test('stay: bad weather asks to go home or stay; staying starts only the weather trial',c=>{const {q,w}=c;q.quiet();const setup=(wx,rnd)=>{clear(c);c.$('ov-storm').hidden=true;q.newGame(12);q.S.money=1e8;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx}]));w.Math.random=()=>rnd;};
 for(const wx of ['sun','cloud']){setup(wx,0.5);q.startTrip(q.PREF[12],false);assert.equal(c.$('ov-storm').hidden,true,wx);assert.equal(JSON.stringify(q.trip.enc),'[]',wx);}
 for(const wx of ['rain','wind','snow','heat']){setup(wx,0.99);q.startTrip(q.PREF[12],false);assert.equal(c.$('ov-storm').hidden,true,wx+' not triggered');assert.equal(q.inTrip,true);
  setup(wx,0.5);const hp=q.S.hp;q.startTrip(q.PREF[12],false);assert.equal(c.$('ov-storm').hidden,false,wx);assert.equal(q.inTrip,false,'nothing happens before choosing');assert.equal(q.S.mp,100);c.$('st-stay').click();assert.equal(c.$('ov-storm').hidden,true);assert.equal(q.inTrip,true);assert.equal(JSON.stringify(q.trip.enc.filter(k=>k!=='rival')),JSON.stringify([wx]),wx);}
 setup('typhoon',0.99);q.startTrip(q.PREF[12],false);assert.equal(c.$('ov-storm').hidden,false);c.$('st-stay').click();assert.equal(JSON.stringify(q.trip.enc.filter(k=>k!=='rival')),'["typhoon"]');
 setup('rain',0.5);q.S.hp=40;q.S.mp=30;q.startTrip(q.PREF[12],false);c.$('st-home').click();assert.equal(c.$('ov-storm').hidden,true);assert.equal(q.S.hp,100);assert.equal(q.S.mp,100);assert.ok(q.S.log[0].includes('自宅で休養'));});
test('consecutive stays raise the weather chance (75% / 90% / 100%) and the counter resets',c=>{const {q,w}=c;q.quiet();const setup=(n,rnd)=>{clear(c);c.$('ov-storm').hidden=true;q.newGame(12);q.S.money=1e8;q.S.stay=n;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx:'rain'}]));w.Math.random=()=>rnd;};
 const asks=(n,rnd)=>{setup(n,rnd);q.startTrip(q.PREF[12],false);return !c.$('ov-storm').hidden;};
 assert.equal(asks(0,0.8),false);assert.equal(asks(1,0.8),true);assert.equal(asks(1,0.95),false);assert.equal(asks(2,0.99),true);assert.equal(asks(7,0.99),true);
 setup(0,0.99);q.startTrip(q.PREF[12],false);assert.equal(q.S.stay,1,'first stay without weather still counts');
 setup(1,0.5);q.startTrip(q.PREF[12],false);assert.equal(q.S.stay,1,'unchanged until the choice');c.$('st-stay').click();assert.equal(q.S.stay,2);
 setup(2,0.5);q.startTrip(q.PREF[13],false);assert.equal(q.S.stay,0,'moving elsewhere resets');
 setup(2,0.5);q.restHome();assert.equal(q.S.stay,0,'resting at home resets');
 setup(2,0.5);q.save();const r=q.load();assert.equal(r.stay,2,'saved and loaded');});
test('three camps unlock familiarity and three sights',c=>{const {q}=c;const nid=q.PREF.findIndex(x=>!['群馬','福島','東京','岐阜','秋田'].includes(x.name));q.newGame(nid);for(let i=0;i<3;i++){q.startTrip(q.PREF[nid],false);c.$('camp-btns').querySelector('[data-i="3"]').click();c.$('res-ok').click();}assert.equal(q.S.fam[nid],true);q.renderSights();assert.equal(c.$('sightbook').querySelectorAll('.sg-c[data-sg]').length,3);});
test('weekly sponsor paid once and calendar advances once',c=>{const {q}=c;q.S.fame=2000;const m=q.S.money;q.snap();q.advance();assert.equal(q.S.money,m+3000);assert.equal(q.S.turn,2);});
test('completion refreshes forecast',c=>{c.q.S.fam.fill(true);c.q.snap();const f=c.q.S.forecast;c.q.advance();assert.notEqual(c.q.S.forecast,f);});
test('completion is not shown again on following weeks',c=>{c.q.S.fam.fill(true);c.q.snap();c.q.advance();assert.equal(c.$('ov-result').hidden,true);});
test('first completion and year-end can both be seen',c=>{const {q}=c;q.S.turn=52;q.S.fam.fill(true);q.S.fam[0]=false;q.snap();q.S.fam[0]=true;q.advance();assert.ok(c.$('result-box').textContent.includes('全国クリア'));c.$('res-ok').click();assert.ok(c.$('result-box').textContent.includes('決算'));assert.equal(c.$('ov-result').hidden,false);});
test('post-completion year-end still runs',c=>{c.q.S.turn=52;c.q.S.fam.fill(true);c.q.snap();c.q.advance();assert.ok(c.$('result-box').textContent.includes('決算'));});
test('new save roundtrip preserves all seven weather types',c=>{const {q}=c;q.S.forecast=Object.fromEntries(q.PREF.map((p,i)=>[p.id,{temp:i-15,wx:q.WXL[i%7]}]));q.save();const o=q.load();assert.equal(o.v,6);for(const p of q.PREF){assert.equal(o.forecast[p.id].temp,q.S.forecast[p.id].temp);assert.equal(o.forecast[p.id].wx,q.S.forecast[p.id].wx);}});
test('v4/v5 compact forecasts migrate with original weather radix',c=>{const {q,w}=c;for(const [v,M] of [[4,5],[5,6]]){const s=JSON.parse(q.pack());s.v=v;s.fc=Array.from({length:47},(_,i)=>(i+10)*M+i%M);w.localStorage.setItem('charicamp',JSON.stringify(s));const o=q.load();for(let i=0;i<47;i++){assert.equal(o.forecast[i].temp,i-20);assert.equal(o.forecast[i].wx,q.WXL[i%M]);}}});
test('malformed forecast keys regenerate instead of crashing',c=>{const {q,w}=c;const s=JSON.parse(q.pack());delete s.fc;s.forecast=Object.fromEntries(q.PREF.map(p=>['bad'+p.id,{temp:15,wx:'sun'}]));w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();if(!q.S.forecast)q.rollForecast();q.render();});
test('duplicate saved parts do not multiply bonuses',c=>{const {q,w}=c;const s=JSON.parse(q.pack());s.owned.parts=['cam','cam'];s.parts=['cam','cam','cam'];w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();assert.equal(q.S.parts.length,1);assert.equal(q.bikeStats().photo,15);});
test('timeline entries are normalized and invalid indices rejected',c=>{const {q,w}=c;const s=JSON.parse(q.pack());s.tl=[[1,12,50,'~a'],[1,99,30,'hill'],[1,'__proto__',30,'hill']];w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();q.render();assert.equal(q.S.tl.length,1);});
test('reset removes game save and cannot recreate it on pagehide',c=>{c.q.render();c.$('btn-cont').hidden=false;c.$('btn-reset').click();c.$('btn-reset').click();c.w.dispatchEvent(new c.w.Event('pagehide'));assert.equal(c.w.localStorage.getItem('charicamp'),null);assert.equal(c.$('btn-cont').hidden,true);});
test('new game clears stale weekly popup and transient snapshot',c=>{c.q.snap();c.$('pop').hidden=false;c.q.newGame(0);assert.equal(c.q.TS,null);assert.equal(c.$('pop').hidden,true);});
test('out-of-range and nonnumeric saved audio settings are safe',c=>{for(const [sound,vb,vs] of [[{vb:5,vs:-2},1,0],[{vb:'bad',vs:null},.5,.8]]){const d=boot(undefined,sound);try{assert.equal(d.q.AUD.vb,vb);assert.equal(d.q.AUD.vs,vs);d.q.playBGM('bgm_main');d.q.bgmApply();assert.deepEqual(d.errors,[]);}finally{d.dom.window.close();}}});
test('camp stove works only with matching tent in winter',c=>{const {q}=c;q.S.gear={fire:'fire4',shelter:'sh5',tarp:null};q.S.turn=1;assert.equal(q.stoveOn(),false);q.S.turn=36;assert.equal(q.calendar(36).month,12);assert.equal(q.stoveOn(),true);assert.equal(q.gearFx().mp,40);q.S.gear.shelter='sh4';q.render();assert.equal(q.S.gear.fire,null);});
test('DCF gear boosts climb and cruise',c=>{const {q}=c;const a=q.bikeStats();q.S.gear.shelter='sh4';q.S.gear.tarp='tp4';const b=q.bikeStats();assert.equal(b.climb,a.climb+2);assert.equal(b.cruise,a.cruise+2);});
test('folding customization changes cost without frame boost',c=>{const {q}=c;q.S.bike='fold';const a=q.travelInfo(q.PREF[13]).rinko;q.S.plus.fold=3;assert.ok(q.travelInfo(q.PREF[13]).rinko<a);assert.equal(q.plv('fold'),0);assert.equal(q.rkLv(),3);});
test('forging upgrade charges and raises ability once',c=>{const {q}=c;q.S.money=100000;q.renderForge();c.$('shop-forge').querySelector('[data-forge="bike:mama"]').click();c.$('pay-yes').click();assert.equal(q.S.plus.mama,1);assert.equal(q.S.money,70000);});
test('food purchase limit and cancellation',c=>{c.q.render();const b=()=>c.$('shop-food').querySelector('[data-food]');b().click();c.$('pay-no').click();assert.equal(c.q.S.food,0);b().click();c.$('pay-yes').click();assert.equal(c.q.S.food,1);assert.equal(c.q.S.money,29200);});
test('camp gear buy, equipment, and remove',c=>{c.q.renderShop();c.$('shop-fire').querySelector('[data-id="fire1"] button').click();c.$('pay-yes').click();assert.equal(c.q.S.gear.fire,'fire1');assert.equal(c.q.S.money,24000);c.$('eq-fire').querySelector('[data-none] button').click();assert.equal(c.q.S.gear.fire,null);});
test('trip reload rolls back until camp result closes',c=>{const {q,w}=c;q.save();const old=w.localStorage.getItem('charicamp');q.startTrip(q.PREF[12],false);assert.equal(q.inTrip,true);q.save();assert.equal(w.localStorage.getItem('charicamp'),old);c.$('camp-btns').querySelector('[data-i="3"]').click();c.$('res-ok').click();assert.equal(JSON.parse(w.localStorage.getItem('charicamp')).turn,2);});
test('home rest and empty balance do not create debt',c=>{c.q.S.loc=0;c.q.S.money=0;c.q.restHome();assert.equal(c.q.S.loc,12);assert.equal(c.q.S.hp,100);assert.equal(c.q.S.money,0);});
test('third consecutive stay brings one nuisance camper (any weather), replacing the weather trial',c=>{const {q,w}=c;q.quiet();const run=(n,wx,rnd)=>{clear(c);c.$('ov-storm').hidden=true;q.newGame(12);q.S.money=1e8;q.S.stay=n;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx}]));w.Math.random=()=>rnd;q.startTrip(q.PREF[12],false);};
 const seen=new Set();for(const r of [0.05,0.5,0.95]){run(2,'sun',r);assert.equal(c.$('ov-storm').hidden,false,'asks even on a sunny day');assert.ok(c.$('st-t').textContent.includes('騒がしい'));c.$('st-stay').click();const k=q.trip.enc.filter(x=>x!=='rival');assert.equal(k.length,1);assert.ok(q.ENEMY[k[0]].camper);seen.add(k[0]);}
 assert.equal(seen.size,3,'all three campers can appear');
 run(2,'typhoon',0.5);c.$('st-stay').click();assert.ok(q.ENEMY[q.trip.enc[0]].camper,'camper replaces even a typhoon');
 run(5,'rain',0.5);c.$('st-stay').click();assert.ok(q.ENEMY[q.trip.enc[0]].camper,'fourth stay too');
 run(1,'sun',0.5);assert.equal(c.$('ov-storm').hidden,true,'second stay on a sunny day has no trial');
 run(2,'sun',0.5);c.$('st-home').click();assert.equal(q.S.stay,0,'going home resets');});
test('special prefecture (Gunma): 3 visits are not clear, the 4th is the forest-road course (3 sections + boss), then clear with +50k followers',c=>{const {q,w}=c;q.quiet();const g=q.PREF.findIndex(x=>x.name==='群馬'),other=q.PREF.findIndex(x=>x.name==='茨城');
 assert.ok(g>=0&&other>=0);assert.equal(q.needV(q.PREF[g]),4);assert.equal(q.needV(q.PREF[other]),3);
 clear(c);q.newGame(12);q.S.money=1e8;q.S.visits[g]=3;q.S.visits[other]=3;q.S.fam[g]=false;
 q.save();let r=q.load();assert.equal(r.fam[g],false,'3 visits do not make Gunma a familiar inn');assert.equal(r.fam[other],true);
 q.S.visits[g]=4;q.S.stats.en.collapse=[1,1,0];q.save();r=q.load();assert.equal(r.fam[g],true,'4 visits do (after meeting the boss)');
 q.newGame(12);q.S.money=1e8;q.S.visits[g]=2;assert.equal(q.isCourse(q.PREF[g],false),false);q.S.visits[g]=3;assert.equal(q.isCourse(q.PREF[g],false),true);assert.equal(q.isCourse(q.PREF[other],false),false);
 q.S.loc=other;q.askGo(q.PREF[g],false);assert.equal(c.$('ov-sp').hidden,false,'TOP表示');assert.ok(c.$('sp-tr').innerHTML.includes('？？？'));assert.equal(c.$('ov-go').hidden,true);c.$('sp-yes').click();assert.equal(c.$('ov-sp').hidden,true);assert.equal(c.$('ov-go').hidden,false);c.$('ov-go').hidden=true;q.S.visits[g]=2;c.$('ov-sp').hidden=true;q.askGo(q.PREF[g],false);assert.equal(c.$('ov-sp').hidden,true);c.$('ov-go').hidden=true;q.S.visits[g]=3;
 const pool=new Set(['rockfall','slide','ford','tree','rough','lost','pass']);
 for(let i=0;i<30;i++){clear(c);q.newGame(12);q.S.money=1e8;q.S.visits[g]=3;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx:'sun'}]));q.startTrip(q.PREF[g],false);assert.equal(q.trip.course,true);assert.equal(q.trip.enc.length,4);assert.equal(q.trip.enc[3],'collapse');assert.ok(q.trip.enc.slice(0,3).every(k=>pool.has(k)),q.trip.enc.join());}
 // 輪行（電車で区間を飛ばす）は林道コースでは使えない
 clear(c);q.newGame(12);q.S.money=1e6;batt(c,'collapse');q.trip.course=true;const m0=q.S.money;q.cmd('rinko');assert.equal(q.S.money,m0);assert.equal(q.B.hp>0,true);
 // クリア：馴染み宿になり、フォロワー+5万人以上
 clear(c);q.newGame(12);q.S.money=1e6;q.S.visits[g]=3;q.S.loc=g;q.trip={p:q.PREF[g],enc:[],i:0,late:false,stay:false,course:true};q.snap();const f0=q.S.fame;q.endTrip();c.$('camp-btns').querySelector('button').click();
 assert.equal(q.S.visits[g],4);assert.equal(q.S.fam[g],true);assert.ok(q.S.fame-f0>=50000,'bonus '+(q.S.fame-f0));
 // 名所図鑑：群馬だけ4枚
 q.sgPage=1;q.renderSights();assert.ok(c.$('sightbook').textContent.includes('スーパー御荷鉾林道'));});
test('trial collection hides undiscovered legend and names it after success',c=>{c.q.renderTrials();assert.equal(c.q.TRIAL_KEYS.length,40);assert.ok(c.$('p-ach').textContent.includes('伝説の生き物'));c.q.S.stats.en.tsuchi=[1,1,0];c.q.renderTrials();assert.ok(c.$('p-ach').textContent.includes('ツチノコ'));});
test('all tent and tarp combinations render finite SVG positions',c=>{const {q}=c;for(const t of [1,36])for(const sh of [null,'sh1','sh2','sh3','sh4','sh5','sh6','sh7'])for(const tp of [null,'tp1','tp2','tp3','tp4']){q.S.turn=t;q.S.gear={fire:sh==='sh5'?'fire4':'fire1',shelter:sh,tarp:tp};q.renderMap();assert.equal(/NaN|Infinity/.test(c.$('map').innerHTML),false,sh+' / '+tp);}});
test('event camp registers festival and uses event image',c=>{const {q}=c;q.S.turn=2;q.S.loc=1;q.S.sel=1;const p=q.PREF[1];q.trip={p,enc:[],ev:q.eventAt(2,1),i:0,late:false,stay:true};assert.ok(q.trip.ev);q.snap();q.endTrip2({});assert.equal(q.S.stats.ev,1);assert.ok(c.$('result-box').querySelector('img').src.includes('ev_aomori_sakura'));});
test('all enemies expose the expected command set',c=>{for(const kind of Object.keys(c.q.ENEMY)){batt(c,kind);const commands=Array.from(c.$('bt-cmds').querySelectorAll('[data-cmd]'),b=>b.dataset.cmd);assert.ok(commands.includes('tactic'));assert.ok(commands.includes(kind==='rival'?'post':'push'));assert.equal(commands.includes('rinko'),kind!=='rival');assert.equal(commands.includes('escape'),kind==='rival');}});
test('quota fallback caches exactly the reduced saved content',c=>{const {q,w}=c;q.S.log=Array.from({length:80},(_,i)=>'1|entry '+i);const original=w.Storage.prototype.setItem;let calls=0;w.Storage.prototype.setItem=function(k,v){calls++;if(calls===1)throw new w.DOMException('quota','QuotaExceededError');return original.call(this,k,v);};q.save();assert.equal(q.S.log.length,20);assert.equal(q.lastSave,w.localStorage.getItem('charicamp'));q.save();assert.equal(calls,2);});
test('special prefectures (Fukushima, Tokyo, Gifu, Akita): course, boss, art, sights and tactics are wired',c=>{const {q}=c;
 const names={'福島':['gas','volcstorm','hill','boss_fukushima'],'東京':['curves','gate','hill','boss_tokyo'],'岐阜':['hill','slide','snow','boss_gifu'],'秋田':['hill','gate','snow','boss_akita'],'徳島':['rough','lost','pass','slide','rockfall','boss_tokushima'],'青森':['rough','pass','ford','tree','hill','boss_aomori'],'兵庫':['rough','lost','slide','tree','rockfall','boss_hyogo'],'大阪':['hill','pass','curves','boss_osaka'],'栃木':['curves','hill','car','boss_tochigi'],'宮城':['wind','snow','pass','boss_miyagi']};
 for(const [nm,spec] of Object.entries(names)){const p=q.PREF.find(x=>x.name===nm);assert.equal(q.needV(p),4,nm);
  for(let i=0;i<20;i++){clear(c);q.newGame(q.PREF.find(x=>!names[x.name]&&x.name!=='群馬').id);q.S.money=1e8;q.S.visits[p.id]=3;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx:'sun'}]));q.startTrip(p,false);assert.equal(q.trip.course,true,nm);assert.equal(q.trip.enc.length,4);assert.equal(q.trip.enc[3],spec[spec.length-1]);assert.ok(q.trip.enc.slice(0,3).every(k=>spec.slice(0,-1).includes(k)),nm+q.trip.enc.join());}
  for(const k of spec){const e=q.ENEMY[k];assert.ok(e,k);assert.ok(fs.existsSync(path.join(__dirname,'..',e.img)),e.img);}
  assert.ok(fs.existsSync(path.join(__dirname,'..','img','sights',q.SPEC[nm].img+'.webp')),nm);
  const sg=q.SIGHTS[p.id];assert.equal(sg.length,4,nm);assert.equal(sg[3][0],q.SPEC[nm].img);assert.ok(sg[3][1]&&sg[3][2],nm);}
 // 作戦アイコンは既存の絵を共用する（新しい敵にも必ず画像がある）
 for(const k of ['gas','volcstorm','curves','gate','boss_fukushima','boss_tokyo','boss_gifu','boss_akita','boss_tokushima','boss_aomori','boss_hyogo','boss_osaka','boss_tochigi','boss_miyagi'])assert.ok(q.TACT[k],k);
 const enc=q.tlDec(q.tlEnc(['gas','boss_akita','boss_gifu','tree','boss_tokushima','boss_aomori','boss_hyogo','boss_osaka','boss_tochigi','boss_miyagi']));assert.equal(enc.join(),'gas,boss_akita,boss_gifu,tree,boss_tokushima,boss_aomori,boss_hyogo,boss_osaka,boss_tochigi,boss_miyagi');});
test('special prefectures: the 4th-visit course also starts when staying at the same place (no 連泊 bypass)',c=>{const {q}=c;
 for(const nm of ['群馬','福島','東京','岐阜','秋田','徳島','青森','兵庫','大阪','栃木','宮城']){const p=q.PREF.find(x=>x.name===nm);
  for(const wx of ['sun','rain','typhoon']){clear(c);q.newGame(p.id);q.S.money=1e8;q.S.visits[p.id]=3;q.S.fam[p.id]=false;q.S.loc=p.id;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx}]));
   q.startTrip(p,false);assert.equal(q.trip.course,true,nm+wx);assert.equal(q.trip.enc.length,4,nm+wx);assert.equal(q.trip.enc[3],q.SPEC[nm].boss,nm+wx);}
  // 3回目までの連泊は従来どおり（コースにならない）
  clear(c);q.newGame(p.id);q.S.visits[p.id]=2;q.S.loc=p.id;assert.equal(q.isCourse(p,true),false,nm);}});
test('rescue: a special prefecture cleared without ever meeting its boss goes back to 3/4 on load; a real clear stays',c=>{const {q,w}=c;
 const T=q.PREF.findIndex(x=>x.name==='東京'),F=q.PREF.findIndex(x=>x.name==='福島'),N=q.PREF.findIndex(x=>x.name==='北海道');
 const s=JSON.parse(q.pack());s.visits[T]=4;s.visits[F]=4;s.visits[N]=3;s.stats.en=s.stats.en||{};s.stats.en.boss_fukushima=[1,1,0];delete s.stats.en.boss_tokyo;
 w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();
 assert.equal(q.S.fam[T],false,'Tokyo rescued');assert.equal(q.S.visits[T],3);assert.equal(q.isCourse(q.PREF[T],true),true,'course opens');
 assert.equal(q.S.fam[F],true,'Fukushima had its boss, stays cleared');assert.equal(q.S.visits[F],4);assert.equal(q.S.fam[N],true,'ordinary prefecture untouched');
 w.localStorage.setItem('charicamp',q.pack());q.S=q.load();assert.equal(q.S.fam[T],false,'idempotent');});
test('sight book pages by region: prev/next buttons, ends disabled, every prefecture shown once, tap still opens',c=>{const {q}=c;clear(c);q.newGame(q.PREF.find(x=>x.name==='大阪').id);q.sgPage=-1;q.renderSights();
 assert.ok(c.$('sightbook').textContent.includes('近畿'),'opens on the current region');
 const seen=new Set();q.sgPage=0;q.renderSights();
 for(let i=0;i<6;i++){for(const b of c.$('sightbook').querySelectorAll('.sg-h b'))seen.add(b.textContent);const nx=c.$('sightbook').querySelector('[data-pg="1"]');assert.equal(nx.disabled,i===5);if(i<5)nx.click();}
 assert.equal(seen.size,47);assert.ok(fs.existsSync(path.join(__dirname,'..','audio','se_page.mp3')));const pv=c.$('sightbook').querySelector('[data-pg="-1"]');assert.equal(pv.disabled,false);q.sgPage=0;q.renderSights();assert.equal(c.$('sightbook').querySelector('[data-pg="-1"]').disabled,true);});
test('rinko never skips every trial: every prefecture reached by rinko has at least 1 non-rival encounter (all weathers)',c=>{const {q}=c;q.quiet();let zero=0,n=0;
 for(const wx of q.WXL)for(const p of q.PREF)for(let k=0;k<12;k++){clear(c);q.newGame(12);q.S.turn=53;q.S.money=1e8;q.S.forecast=Object.fromEntries(q.PREF.map(x=>[x.id,{temp:15,wx}]));
  if(p.id===q.S.loc)continue;q.startTrip(p,true);if(!c.$('ov-storm').hidden){c.$('st-stay').click();c.$('ov-storm').hidden=true;}n++;if(q.trip.enc.filter(e=>e!=='rival').length<1)zero++;}
 assert.ok(n>1000);assert.equal(zero,0);});
test('used road bike sits between cross and road: price/stat order, art exists, buyable and usable in battle',c=>{const {q}=c;const ids=q.BIKES.map(b=>b.id);const u=q.BIKES.find(b=>b.id==='uroad'),r=q.BIKES.find(b=>b.id==='road'),x=q.BIKES.find(b=>b.id==='cross');
 assert.ok(u&&ids.indexOf('uroad')===ids.indexOf('road')-1);assert.ok(x.price<u.price&&u.price<r.price);for(const k of ['climb','rough','cruise','wx'])assert.ok(u[k]>=x[k]-3&&u[k]<=r[k],k);
 for(const f of ['img/bike_uroad.webp','img/icon_bike_uroad.webp'])assert.ok(fs.existsSync(path.join(__dirname,'..',f)),f);
 q.S.money=1e8;q.S.bike='uroad';assert.equal(q.bikeStats().cruise,7);q.renderShop();assert.ok(c.$('shop-bike')?c.$('shop-bike').textContent.includes('中古ロードバイク'):true);});
test('used cross bike sits between mama and cross: order, art exists, usable',c=>{const {q}=c;const ids=q.BIKES.map(b=>b.id),u=q.BIKES.find(b=>b.id==='ucross'),m=q.BIKES.find(b=>b.id==='mama'),x=q.BIKES.find(b=>b.id==='cross');
 assert.equal(ids.indexOf('ucross'),ids.indexOf('cross')-1);assert.ok(m.price<u.price&&u.price<x.price);for(const k of ['climb','rough','cruise','wx'])assert.ok(u[k]>=m[k]&&u[k]<=x[k],k);
 for(const f of ['img/bike_ucross.webp','img/icon_bike_ucross.webp'])assert.ok(fs.existsSync(path.join(__dirname,'..',f)),f);
 q.S.bike='ucross';assert.equal(q.bikeStats().cruise,4);q.renderShop();});
test('randonneur sits between fold and tigrav: order, art exists, customizable, not foldable',c=>{const {q}=c;const ids=q.BIKES.map(b=>b.id),u=q.BIKES.find(b=>b.id==='rando'),f=q.BIKES.find(b=>b.id==='fold'),t=q.BIKES.find(b=>b.id==='tigrav');
 assert.equal(ids.indexOf('rando'),ids.indexOf('tigrav')-1);assert.ok(f.price<u.price&&u.price<t.price);assert.ok(!u.fold);for(const k of ['climb','rough','cruise','wx'])assert.ok(u[k]<=t[k],k);
 for(const f2 of ['img/bike_rando.webp','img/icon_bike_rando.webp'])assert.ok(fs.existsSync(path.join(__dirname,'..',f2)),f2);
 q.S.bike='rando';assert.equal(q.bikeStats().wx,8);q.renderShop();q.renderForge();});
const summary={file:filename,passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(summary,null,2));
console.log(JSON.stringify({passed:summary.passed,failed:summary.failed}));process.exitCode=summary.failed?1:0;
