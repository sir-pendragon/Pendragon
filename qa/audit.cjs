const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const html = fs.readFileSync(filename,'utf8');
const exposed = `window.qa={newGame,load,save,render,calendar,travelInfo,rollForecast,startTrip,startBattle,cmd,endTrip,advance,restHome,snap,bikeStats,gearFx,renderSights,renderBattle,renderList,renderDetail,renderShop,playBGM,bgmApply,renderSet,PREF,BIKES,PARTS,CLOTHES,GEAR_ITEMS,ENEMY,AUD,
get S(){return S},set S(v){S=v},get B(){return B},get trip(){return trip},set trip(v){trip=v},get TS(){return TS},get inTrip(){return INTRIP}};`;
function boot(saved,sound){
  const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const marked=js.replace(/\}\)\(\);\s*$/,exposed+'\n})();');
  return new JSDOM(html.replace(js,marked),{url:'http://localhost',runScripts:'dangerously',beforeParse(w){
    w.matchMedia=()=>({matches:true});w.setInterval=()=>1;w.setTimeout=()=>1;
    w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.HTMLMediaElement.prototype.play=()=>Promise.resolve();w.HTMLMediaElement.prototype.pause=()=>{};
    if(saved!==undefined)w.localStorage.setItem('charicamp',JSON.stringify(saved));
    if(sound!==undefined)w.localStorage.setItem('cc_snd',JSON.stringify(sound));
  }});
}
let passed=0,failed=0;
function test(name,fn){let dom;try{dom=boot();const w=dom.window,q=w.qa,$=id=>w.document.getElementById(id);q.newGame(12);q.render();fn({w,q,$});console.log('PASS',name);passed++;}catch(e){console.log('FAIL',name,'—',e.message);failed++;}finally{dom?.window.close();}}
function battle(q,enc=['hill','hill']){q.S.hp=100;q.S.mp=100;q.S.stats.wins=0;q.trip={p:q.PREF[12],enc,i:0,late:false,sec:10,rk:1000,stay:false};q.snap();q.startBattle(enc[0]);q.B.hp=1;q.cmd('push');}
test('new game / 47 destinations / initial save',({q,w})=>{assert.equal(q.S.money,30000);assert.equal(q.PREF.length,47);assert.equal(q.S.forecast[46].wx!==undefined,true);assert.equal(JSON.parse(w.localStorage.getItem('charicamp')).turn,1);});
test('calendar: 104 weeks and four seasons',({q})=>{for(let i=1;i<=104;i++){const c=q.calendar(i);assert.ok(c.month>=1&&c.month<=12);assert.ok(c.week>=1&&c.week<=5);assert.equal(c.year,Math.ceil(i/52));}assert.equal(q.calendar(1).month,4);assert.equal(q.calendar(53).month,4);});
test('second-year week display stays within 52',({q,$})=>{q.S.turn=53;q.render();assert.ok($('d-date').textContent.includes('（1/52）'));});
test('next encounter waits for first player command',({q,$})=>{battle(q);$('bt-cmds').querySelector('button').click();assert.equal(q.B.turn,1);assert.equal(q.S.hp,85);assert.equal(q.S.stats.wins,1);assert.equal(q.trip.i,1);});
test('final encounter counts one victory and one result',({q,$})=>{battle(q,['hill']);$('bt-cmds').querySelector('button').click();assert.equal(q.S.stats.wins,1);assert.equal(q.S.stats.posts,1);assert.equal($('ov-result').hidden,false);});
test('low stamina cannot walk below zero',({q,$})=>{battle(q);q.startBattle('hill');q.S.hp=8;q.renderBattle();assert.equal($('bt-cmds').querySelector('[data-cmd="walk"]').disabled,true);});
test('commands reject insufficient stamina at the model boundary',({q})=>{battle(q);q.startBattle('hill');q.S.hp=8;const hp=q.B.hp;q.cmd('walk');assert.equal(q.S.hp,8);assert.equal(q.B.hp,hp);});
test('battle rest and charge are bounded',({q})=>{battle(q);q.startBattle('hill');q.S.hp=90;q.S.mp=30;q.cmd('rest');assert.ok(q.S.hp<=100);q.cmd('kiai');assert.equal(q.B.charge,true);assert.ok(q.S.mp>=0);});
test('rinko cancel does not charge, confirm charges once',({q,$})=>{battle(q);q.startBattle('hill');const money=q.S.money;q.cmd('rinko');$('pay-no').click();assert.equal(q.S.money,money);q.cmd('rinko');$('pay-yes').click();assert.equal(q.S.money,money-1000);assert.equal(q.trip.i,1);});
test('trip save is unchanged until result is closed',({q,w,$})=>{const before=w.localStorage.getItem('charicamp');q.startTrip(q.PREF[12],false);assert.equal(q.inTrip,true);q.save();assert.equal(w.localStorage.getItem('charicamp'),before);$('res-ok').click();assert.equal(q.S.turn,2);assert.equal(JSON.parse(w.localStorage.getItem('charicamp')).turn,2);});
test('camp fee and treatment never create debt',({q})=>{q.S.money=0;q.S.hp=-100;q.trip={p:q.PREF[12],enc:[],i:0,late:true,stay:true};q.snap();q.endTrip();assert.equal(q.S.money,0);assert.equal(q.S.hp,30);});
test('three successful stays unlock familiarity and sights',({q,$})=>{for(let i=0;i<3;i++){q.startTrip(q.PREF[12],false);$('res-ok').click();}assert.equal(q.S.fam[12],true);assert.equal(q.S.stats.posts,3);q.renderSights();assert.equal($('sightbook').querySelectorAll('button').length,3);});
test('visit detail caps at three',({q,$})=>{q.S.visits[12]=9999;q.render();assert.equal($('info').textContent.includes('9999/3'),false);});
test('visit list caps markers at three',({q,$})=>{q.S.visits[12]=9999;q.renderList();assert.equal(($('sitelist').querySelector('[data-id="12"]').textContent.match(/✔/g)||[]).length,3);});
test('first completion shows celebration',({q,$})=>{q.S.fam.fill(true);q.S.fam[0]=false;q.snap();q.S.fam[0]=true;q.advance();assert.ok($('result-box').textContent.includes('全国制覇'));});
test('completion forecast is refreshed',({q})=>{q.S.fam.fill(true);q.snap();const forecast=q.S.forecast;q.advance();assert.notEqual(q.S.forecast,forecast);});
test('completion celebration is not repeated every week',({q,$})=>{q.S.fam.fill(true);q.snap();q.advance();assert.equal($('ov-result').hidden,true);assert.equal(q.S.turn,2);});
test('completion still runs year-end accounts',({q,$})=>{q.S.turn=52;q.S.fam.fill(true);q.snap();q.advance();assert.ok($('result-box').textContent.includes('決算'));});
test('normal year-end refreshes forecast and saves',({q,w,$})=>{q.S.turn=52;q.snap();const f=q.S.forecast;q.advance();assert.ok($('result-box').textContent.includes('決算'));assert.notEqual(q.S.forecast,f);assert.equal(JSON.parse(w.localStorage.getItem('charicamp')).turn,53);});
test('save roundtrip keeps purchased gear and equipment',({q,w})=>{q.S.owned.parts=['cam'];q.S.parts=['cam'];q.S.owned.gear=['sh2'];q.S.gear.shelter='sh2';q.save();const d=boot(JSON.parse(w.localStorage.getItem('charicamp')));try{assert.equal(d.window.qa.S.parts[0],'cam');assert.equal(d.window.qa.S.gear.shelter,'sh2');}finally{d.window.close();}});
test('malformed JSON falls back to new game',({q,w})=>{w.localStorage.setItem('charicamp','{');assert.equal(q.load(),null);});
test('invalid forecast keys cannot crash render on resume',({q,w})=>{const s=JSON.parse(w.localStorage.getItem('charicamp'));s.forecast=Object.fromEntries(Array.from({length:47},(_,i)=>['bad'+i,{temp:15,wx:'sun'}]));w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();if(!q.S.forecast)q.rollForecast();q.render();});
test('duplicate saved parts cannot multiply bonuses',({q,w})=>{const s=JSON.parse(w.localStorage.getItem('charicamp'));s.owned.parts=['cam','cam'];s.parts=['cam','cam','cam'];w.localStorage.setItem('charicamp',JSON.stringify(s));q.S=q.load();assert.equal(q.S.parts.length,1);assert.equal(q.bikeStats().photo,15);});
test('sound volumes load as safe finite values',({})=>{const d=boot(undefined,{vb:5,vs:-2});try{assert.equal(d.window.qa.AUD.vb,1);assert.equal(d.window.qa.AUD.vs,0);d.window.qa.playBGM('bgm_main');d.window.qa.bgmApply();}finally{d.window.close();}});
test('reset really clears the saved game and continue button',({w,$})=>{$('btn-cont').hidden=false;$('btn-reset').click();$('btn-reset').click();assert.equal(w.localStorage.getItem('charicamp'),null);assert.equal($('btn-cont').hidden,true);assert.equal($('ov-title').hidden,false);w.qa.save();assert.equal(w.localStorage.getItem('charicamp'),null);});
test('new game clears previous weekly popup',({q,$})=>{q.snap();$('pop').hidden=false;q.newGame(3);assert.equal(q.TS,null);assert.equal($('pop').hidden,true);});
test('shop purchase cancel, buy and equip',({q,$})=>{const root=$('shop-fire');root.querySelector('button').click();$('pay-no').click();assert.equal(q.S.money,30000);root.querySelector('button').click();$('pay-yes').click();assert.equal(q.S.money,24000);assert.equal(q.S.gear.fire,'fire1');assert.equal(q.S.owned.gear.includes('fire1'),true);$('eq-fire').querySelector('[data-none] button').click();assert.equal(q.S.gear.fire,null);});
test('three-part limit and unequip',({q,$})=>{q.S.owned.parts=['wheel','tire','aero','fender'];q.S.parts=['wheel','tire','aero'];q.renderShop();const c=$('eq-part').querySelector('[data-id="fender"] button');assert.equal(c.disabled,true);$('eq-part').querySelector('[data-id="tire"] button').click();assert.equal(q.S.parts.length,2);$('eq-part').querySelector('[data-id="fender"] button').click();assert.equal(q.S.parts.length,3);});
test('home rest and forced return keep balances nonnegative',({q,$})=>{q.S.loc=0;q.S.money=0;q.S.hp=5;q.restHome();assert.equal(q.S.loc,12);assert.equal(q.S.hp,100);assert.equal(q.S.money,0);$('res-ok').click();assert.equal(q.S.turn,2);});
test('travel: same location, distance cutoff, Okinawa surcharge, folding discount',({q})=>{assert.equal(q.travelInfo(q.PREF[12]).enc,0);const distant=q.travelInfo(q.PREF[0]);assert.equal(distant.ride,false);assert.equal(q.travelInfo(q.PREF[46]).ride,false);const normal=q.travelInfo(q.PREF[13]).rinko;q.S.owned.bikes.push('fold');q.S.bike='fold';assert.ok(q.travelInfo(q.PREF[13]).rinko<normal);});
test('rain guard combines tarp and tent',({q})=>{q.S.gear={fire:'fire3',shelter:'sh3',tarp:'tp3'};const g=q.gearFx();assert.ok(Math.abs(g.guard-.94)<1e-9);assert.equal(g.hp,20);assert.equal(g.mp,32);});
test('all region/enemy/item rendered assets exist',({q,w})=>{const missing=new Set();const scan=()=>{for(const n of w.document.querySelectorAll('img,image')){const s=n.getAttribute('src')||n.getAttribute('href');if(s&&!s.includes('${')&&/^img\//.test(s)&&!fs.existsSync(path.join(path.dirname(filename),s)))missing.add(s);}};for(let i=0;i<47;i++){q.S.sel=i;q.render();scan();}q.S.owned.bikes=q.BIKES.map(x=>x.id);q.S.owned.cloth=q.CLOTHES.map(x=>x.id);q.S.owned.parts=q.PARTS.map(x=>x.id);q.S.owned.gear=q.GEAR_ITEMS.map(x=>x.id);q.S.visits.fill(3);q.renderShop();q.renderSights();scan();q.trip={p:q.PREF[12],enc:[],i:0,sec:10,rk:1000};for(const k of Object.keys(q.ENEMY)){q.startBattle(k);scan();}assert.deepEqual([...missing],[]);});
console.log(JSON.stringify({file:filename,passed,failed}));
process.exitCode=failed?1:0;
