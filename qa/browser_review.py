# Independent Chromium regressions. Requires Python Playwright and Chromium.
# Run: python3 qa/browser_review.py (optional CHROMIUM=/path/to/chromium).
# Instruments an in-memory copy; never changes index.html or contacts X.
import pathlib,json,threading,http.server,shutil,os
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
source=(ROOT/'index.html').read_text()
expose='window.qa={APP_V,UPD,AVS,INF,PREF,HFR,heroSrc,heroPreload,HERO,drawHero,renderMap,render,renderProf,renderTrials,newGame,load,save,pack,shareText,shareCard,doShareImg,infPool,infRp,rollInf,infSt,infD,giftYear,feedItems,startTrip,startBattle,cmd,snap,advance,endTrip2,get S(){return S},set S(v){S=v},get B(){return B},get trip(){return trip},set trip(v){trip=v},get inTrip(){return INTRIP},set inTrip(v){INTRIP=v},setTS(v){TS=v},setShareCard(f){shareCard=f},showResult};'
at=source.rfind('})();');html=source[:at]+expose+source[at:]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  path=self.path.split('?')[0]
  if path in ['/','/index.html']:b=html.encode();mime='text/html; charset=utf-8'
  else:
   f=ROOT/path.lstrip('/')
   if not f.is_file():self.send_response(404);self.end_headers();return
   b=f.read_bytes();mime='image/webp' if path.endswith('.webp') else 'application/octet-stream'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(b)));self.end_headers();
  try:self.wfile.write(b)
  except (BrokenPipeError,ConnectionResetError):pass
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)+'/'
results=[]
def rec(name,result):
 if name=='pageerror':raise AssertionError(result)
 if name=='map_switch':assert all(x['href']==x['want'] for x in result),result
 elif name=='map_geometry':assert result['passed']==48
 elif name.startswith('load_map_'):assert result['href']==('img/hero_'+{'av_ninja':'ninja_','av_gal':'gal_'}.get(result['avId'],'')+'w1.webp'),result
 elif name=='viewer_open_focus':assert not result['hidden'] and result['focus']=='inf-close'
 elif name=='viewer_tab_focus':assert result['inDialog']
 elif name=='viewer_escape':assert result['hidden'] and result['focus']=='cammy'
 elif name=='viewer_close_focus':assert result=='cammy'
 elif name=='viewer_all_click_and_enemy':assert result=={'rivals':6,'enemyOpened':True,'infHidden':True}
 elif name=='rivals_all_regions':assert result['regions']==47 and set(result['selected'])=={'tomy','lcc','takechan','mino','cammy','harold'}
 elif name=='rival_gifts_roundtrip':assert not result['twice'] and result['noItems'] and result['flags']==[1,1] and len(result['feed'])==2 and all('undefined' not in x and '🎁' in x for x in result['feed'])
 elif name.startswith('clipboard_'):assert result['shares']==1 and not result['unhandled'],result
 elif name=='double_click':assert result['shares']==1
 elif name=='share_snapshot':assert result['same']
 elif name=='stale_note':assert result=={'before':'','after':''}
 elif name=='privacy':assert not result['hasPrivate']
 elif name=='full_trip_reload':assert result['turn']==2 and not result['inTrip'] and result['safe'] and result['avId']=='av_gal'
 elif name=='full_trip_reloaded':assert result=={'turn':2,'avId':'av_gal','href':'img/hero_gal_w1.webp'}
 elif name=='update_pending_after_trip':assert result['before']==0 and result['reloads']==1 and result['persist']
 elif name=='real_share_card':assert result['type']=='image/png' and result['width']==1200 and result['height']==630 and result['size']>0
 results.append(name);print('PASS',name,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 rec('browser',browser.version)
 ctx=browser.new_context(viewport={'width':1000,'height':800},reduced_motion='reduce')
 ctx.add_init_script("localStorage.setItem('cc_tut','1');localStorage.setItem('cc_tutb','1');")
 page=None
 def boot():
  global page
  if page:page.close()
  page=ctx.new_page();page.on('pageerror',lambda e:rec('pageerror',str(e)))
  page.add_init_script("window.unhandled=[];addEventListener('unhandledrejection',e=>unhandled.push(String(e.reason)))")
  page.goto(BASE);page.evaluate("localStorage.removeItem('charicamp');sessionStorage.clear();qa.newGame(12);document.getElementById('ov-title').hidden=true;qa.render();")
 boot()
 rec('map_switch',page.evaluate('''()=>{const out=[];const $=id=>document.getElementById(id);for(const a of qa.AVS){$('tab-log').click();$('btn-prof').click();document.querySelector('#av-list [data-av="'+a.id+'"]').click();$('prof-close').click();$('tab-map').click();out.push({id:a.id,href:$('hi_w1').getAttribute('href'),want:qa.heroSrc('w1')})}return out}'''))
 rec('map_geometry',page.evaluate('''()=>{const out=[];for(const a of qa.AVS){qa.S.avId=a.id;qa.renderMap();for(const mode of ['walk','sit','sleep'])for(const dir of [-1,1]){Object.assign(qa.HERO,{x:260,y:426,mode,dir,f:0,ham:false,tent:false});qa.drawHero();const k=mode==='walk'?'w1':mode==='sit'?'s1':'z1',im=document.getElementById('hi_'+k),d={id:a.id,mode,dir,x:+im.getAttribute('x'),bottom:+im.getAttribute('y') + +im.getAttribute('height'),transform:im.getAttribute('transform')};if(d.bottom!==426)throw Error('bottom');if((d.transform==='scale(-1 1)')!==(mode==='walk'&&dir<0))throw Error('flip');out.push(d)}}return {passed:out.length}}'''))
 for fields in [{'avId':'av_ninja'},{'av':1},{'av':3},{}]:
  page.evaluate("fields=>{const b=JSON.parse(qa.pack());delete b.avId;delete b.av;localStorage.charicamp=JSON.stringify({...b,...fields})}",fields);page.reload()
  rec('load_map_'+json.dumps(fields),page.evaluate("({avId:qa.S.avId,href:document.getElementById('hi_w1').getAttribute('href')})"))
 boot()
 page.evaluate("document.getElementById('tab-log').click();document.querySelector('[data-sub=ach]').click();document.querySelector('[data-trs=rv]').click()")
 icon=page.locator('img[data-inf=cammy]');icon.focus();page.keyboard.press('Enter')
 rec('viewer_open_focus',page.evaluate("({hidden:document.getElementById('inf-view').hidden,focus:document.activeElement.id||document.activeElement.dataset.inf,z:getComputedStyle(document.getElementById('inf-view')).zIndex})"))
 page.keyboard.press('Tab');rec('viewer_tab_focus',page.evaluate("({focus:document.activeElement.id||document.activeElement.dataset.inf,inDialog:document.getElementById('inf-view').contains(document.activeElement)})"))
 page.keyboard.press('Escape');rec('viewer_escape',page.evaluate("({hidden:document.getElementById('inf-view').hidden,focus:document.activeElement.id||document.activeElement.dataset.inf})"))
 page.evaluate("if(document.getElementById('inf-view').hidden)document.querySelector('img[data-inf=cammy]').click()");page.locator('#inf-close').click();rec('viewer_close_focus',page.evaluate("document.activeElement.id||document.activeElement.dataset.inf||document.activeElement.tagName"))
 rec('viewer_all_click_and_enemy',page.evaluate('''()=>{const $=id=>document.getElementById(id);let n=0;for(const d of qa.INF){document.querySelector('img[data-inf="'+d.id+'"]').click();if($('inf-img').getAttribute('src')!==d.img)throw Error('image');$('inf-view').click();if(!$('inf-view').hidden)throw Error('close');n++}document.querySelector('[data-trs=old]').click();const en=document.querySelector('#achlist .n[data-en]');en.click();return {rivals:n,enemyOpened:!$('ov-sight').hidden,infHidden:$('inf-view').hidden}}'''))
 boot()
 rec('rivals_all_regions',page.evaluate('''()=>{const seen=new Set;for(const p of qa.PREF){const pool=qa.infPool(p);for(const d of qa.INF){const should=(!d.reg||d.reg===p.region)&&(!d.pref||d.pref===p.name);if(pool.includes(d)!==should)throw Error(p.name+d.id)}for(let i=0;i<pool.length;i++){qa.trip={p,enc:['rival'],i:0,late:false,sec:10,rk:1000};Math.random=()=>((i+.1)/pool.length);qa.startBattle('rival');seen.add(qa.B.inf)}}return {regions:qa.PREF.length,selected:[...seen]}}'''))
 rec('rival_gifts_roundtrip',page.evaluate('''()=>{qa.newGame(12);const before=JSON.stringify(qa.S.owned),dango=qa.S.dango;for(const id of ['cammy','harold'])qa.infSt(id).w=3;const once=qa.giftYear(),twice=qa.giftYear();qa.save();const L=qa.load();return {once,twice,noItems:before===JSON.stringify(qa.S.owned)&&dango===qa.S.dango,flags:[L.inf.cammy.g,L.inf.harold.g],feed:qa.feedItems().filter(x=>['cammy_mtb','arthur_minivelo'].includes(x.p.id)).map(x=>x.p.text)}}'''))
 rec('old_four_rivals_and_replies',page.evaluate('''()=>{qa.newGame(12);const raw=JSON.parse(qa.pack());raw.inf=Object.fromEntries(qa.INF.slice(0,4).map(d=>[d.id,{w:2,e:4,g:1}]));localStorage.charicamp=JSON.stringify(raw);qa.S=qa.load();for(const d of qa.INF.slice(0,4))if(qa.infSt(d.id).w!==2||qa.infSt(d.id).g!==1)throw Error('old rival');for(const id of ['cammy','harold'])if(qa.infSt(id).w!==0||qa.infSt(id).g!==0)throw Error('new rival default');qa.save();const L=qa.load();if(Object.keys(L.inf).length!==6)throw Error('roundtrip');const seen=new Set();for(const band of ['hi','mid','lo','late'])for(let h=0;h<4096;h++){const rp=qa.infRp(h,band,100),d=qa.INF.find(d=>d.handle===rp[1]);if(!d||!d.rep[band].includes(rp[2]))throw Error('reply');seen.add(d.id)}if(seen.size!==6)throw Error('reply coverage');let events=0;for(const p of qa.PREF){qa.S.loc=p.id;const pool=qa.infPool(p);for(let i=0;i<pool.length;i++){let n=0;Math.random=()=>[0,(i+.1)/pool.length,0][n++%3];qa.setTS({});qa.rollInf();if(!qa.S.log[0].endsWith('INFEV@'+pool[i].id+'@0'))throw Error('event');events++}}return {replies:seen.size,events}}'''))
 boot()
 for mode in ['missing','reject','pending','throw']:
  boot()
  page.evaluate('''mode=>{qa.setShareCard(async()=>new Blob(['png'],{type:'image/png'}));window.shared=[];window.opened=[];window.open=(...a)=>opened.push(a);navigator.canShare=()=>true;navigator.share=async data=>shared.push({text:data.text,files:data.files.length});Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='missing'?undefined:{writeText(){if(mode==='throw')throw Error('sync');if(mode==='reject')return Promise.reject(Error('denied'));if(mode==='pending')return new Promise(()=>{});return Promise.resolve()}}});document.getElementById('btn-sns').click();document.getElementById('btn-share').click()}''',mode)
  page.wait_for_timeout(1300)
  rec('clipboard_'+mode,page.evaluate("({shares:shared.length,note:document.getElementById('share-note').textContent,unhandled})"))
 boot()
 rec('double_click',page.evaluate('''async()=>{qa.setShareCard(async()=>new Blob(['png'],{type:'image/png'}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});navigator.canShare=()=>true;window.shared=0;navigator.share=async()=>{shared++};document.getElementById('btn-sns').click();document.getElementById('btn-share').click();document.getElementById('btn-share').click();await new Promise(r=>setTimeout(r,50));return {shares:shared,note:document.getElementById('share-note').textContent}}'''))
 boot()
 rec('share_snapshot',page.evaluate('''async()=>{window.release=null;qa.setShareCard(()=>new Promise(r=>release=r));window.copied=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{copied=t}}});navigator.canShare=()=>true;window.sent=null;navigator.share=async d=>sent=d.text;document.getElementById('btn-sns').click();document.getElementById('btn-share').click();qa.S.turn++;release(new Blob(['png'],{type:'image/png'}));await new Promise(r=>setTimeout(r,50));return {same:copied===sent,copied,sent}}'''))
 boot()
 rec('stale_note',page.evaluate('''async()=>{qa.setShareCard(async()=>new Blob(['png'],{type:'image/png'}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});navigator.canShare=()=>true;window.releaseShare=null;navigator.share=()=>new Promise(r=>releaseShare=r);document.getElementById('btn-sns').click();document.getElementById('btn-share').click();await new Promise(r=>setTimeout(r,10));document.getElementById('sns-close').click();document.getElementById('btn-sns').click();const before=document.getElementById('share-note').textContent;releaseShare();await new Promise(r=>setTimeout(r,10));return {before,after:document.getElementById('share-note').textContent}}'''))
 rec('privacy',page.evaluate('''()=>{localStorage.setItem('outside_email','private@example.test');history.replaceState(null,'','/?token=secret#private');qa.S.privateName='Outside Name';const t=qa.shareText();return {text:t,hasPrivate:/private@example|secret|Outside Name/.test(t)}}'''))
 for mode in ['fallback','reject','cancel','late_reject']:
  boot()
  page.evaluate('''mode=>{qa.setShareCard(async()=>new Blob(['png'],{type:'image/png'}));window.copied=null;window.opened=[];window.nativeCalls=0;window.rejectCopy=null;window.open=(...args)=>opened.push(args);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:t=>{copied=t;return mode==='late_reject'?new Promise((r,j)=>rejectCopy=j):Promise.resolve()}}});navigator.canShare=()=>mode!=='fallback';navigator.share=async()=>{nativeCalls++;if(mode==='reject')throw Error('not supported');if(mode==='cancel')throw new DOMException('cancel','AbortError')};qa.showResult('result',()=>{},true);document.getElementById('res-share').click()}''',mode)
  page.wait_for_timeout(1300 if mode=='late_reject' else 50)
  if mode=='late_reject':page.evaluate("rejectCopy(Error('late rejection'))");page.wait_for_timeout(20)
  result=page.evaluate("({opened:opened.length,nativeCalls,note:document.getElementById('res-note').textContent,copied,unhandled,disabled:document.getElementById('res-share').disabled})")
  assert result['opened']==(1 if mode in ['fallback','reject'] else 0),result
  assert result['nativeCalls']==(0 if mode=='fallback' else 1),result
  assert not result['unhandled'] and not result['disabled'],result
  if mode in ['fallback','reject']:assert 'コピーしました' in result['note'],result
  rec('result_share_'+mode,result)
 boot()
 rec('result_note_detached',page.evaluate('''async()=>{qa.setShareCard(async()=>new Blob(['png'],{type:'image/png'}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});navigator.canShare=()=>true;window.finish=null;navigator.share=()=>new Promise(r=>finish=r);qa.showResult('old',()=>{},true);document.getElementById('res-share').click();await new Promise(r=>setTimeout(r,10));qa.showResult('new',()=>{},true);finish();await new Promise(r=>setTimeout(r,10));const note=document.getElementById('res-note').textContent;if(note)throw Error('stale result note');return {note}}'''))
 boot()
 rec('cross_button_double_click',page.evaluate('''async()=>{window.release=null;qa.setShareCard(()=>new Promise(r=>release=r));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});window.n=0;navigator.canShare=()=>true;navigator.share=async()=>n++;qa.showResult('result',()=>{},true);document.getElementById('res-share').click();document.getElementById('btn-sns').click();document.getElementById('btn-share').click();release(new Blob(['png'],{type:'image/png'}));await new Promise(r=>setTimeout(r,20));if(n!==1)throw Error('duplicate cross-dialog shares');return {shares:n}}'''))
 boot()
 for key in [' ','Enter']:
  page.evaluate("document.getElementById('tab-log').click();document.querySelector('[data-sub=ach]').click();document.querySelector('[data-trs=rv]').click()")
  page.locator('img[data-inf=harold]').focus();page.keyboard.press(key)
  assert page.locator('#inf-view').is_visible()
  page.keyboard.press('Shift+Tab');assert page.evaluate("document.activeElement.id")=='inf-close'
  page.keyboard.press('Escape');assert page.evaluate("document.activeElement.dataset.inf")=='harold'
 rec('viewer_keyboard_both_keys',True)
 page.set_viewport_size({'width':390,'height':844})
 page.locator('img[data-inf=cammy]').click()
 rec('viewer_mobile_layout',page.evaluate('''()=>{const view=document.getElementById('inf-view'),im=document.getElementById('inf-img'),close=document.getElementById('inf-close'),r=close.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)throw Error('close outside viewport');if(!view.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('covered close');return {closeVisible:true,z:getComputedStyle(view).zIndex}}'''))
 page.locator('#inf-close').click();page.set_viewport_size({'width':1000,'height':800})
 boot()
 rec('full_trip_reload',page.evaluate('''()=>{Math.random=()=>.99;qa.S.forecast[12]={temp:20,wx:'sun'};qa.S.avId='av_gal';qa.startTrip(qa.PREF[12],false);document.querySelector('#camp-btns button:not([disabled])').click();document.getElementById('res-ok').click();return {turn:qa.S.turn,inTrip:qa.inTrip,safe:qa.UPD.safe(),money:qa.S.money,avId:qa.S.avId}}'''))
 page.reload();rec('full_trip_reloaded',page.evaluate("({turn:qa.S.turn,avId:qa.S.avId,href:document.getElementById('hi_w1').getAttribute('href')})"))
 rec('update_pending_after_trip',page.evaluate('''async()=>{const U=qa.UPD;window.reloads=0;U.reload=()=>reloads++;U.pending='0123456789ab';U.plan();await new Promise(r=>setTimeout(r,30));const before=reloads;document.getElementById('upd-ok').click();return {before,reloads,scheduled:U.scheduled,persist:U.persist()}}'''))
 boot()
 rec('real_share_card',page.evaluate('''async()=>{const b=await qa.shareCard(),im=await createImageBitmap(b);return {type:b.type,size:b.size,width:im.width,height:im.height}}'''))
 browser.close()
server.shutdown();server.server_close()
print('PASS browser regressions:',len(results),'checks')
