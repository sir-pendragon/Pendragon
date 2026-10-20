# Quarterly bonuses, gifts and modal regressions. Requires Python Playwright + Chromium.
# python3 qa/features_review.py [--case NAME] [--html /path/to/mutated-index.html]
# Uses an in-memory instrumented copy and a loopback server. No source/assets are changed.
import argparse, functools, http.server, json, os, pathlib, shutil, sys, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--html', type=pathlib.Path, default=ROOT / 'index.html')
parser.add_argument('--case')
args = parser.parse_args()
source = args.html.read_text()
expose = '''window.q={EDITOR,editorBonus,MONTH_W,calendar,title,sponsor,finishAdvance,turnPopup,
save,newGame,pack,load,render,renderBattle,cmd,startBattle,startTrip,endTrip2,restHome,PREF,INF,giftYear,
feedItems,askGo,exportSave,showResult,UPD,APP_V,GUMMY,TEA,NAGANO,advance,snap,
get S(){return S},set S(v){S=v},get B(){return B},get trip(){return trip},set trip(v){trip=v},
get INTRIP(){return INTRIP},set INTRIP(v){INTRIP=v},get TS(){return TS},set TS(v){TS=v},get EDI(){return EDI}};'''
at = source.rfind('})();')
assert at >= 0
html = (source[:at] + expose + source[at:]).encode()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] in ['/', '/index.html']:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html)))
            self.end_headers()
            try:
                self.wfile.write(html)
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            super().do_GET()

    def log_message(self, *_):
        pass

CASES = [
('quarter_calendar', '''() => {
 const paid=[];for(let t=1;t<=104;t++){
  q.newGame(12);q.S.turn=t;q.S.fame=20000;q.snap();
  const before=q.S.money,sp=q.sponsor()[1];document.getElementById('ov-edi').hidden=true;q.advance();
  const got=q.S.money-before-sp,want=t%13===0?40000:0;
  if(got!==want)throw Error('turn '+t+': '+got+' != '+want);
  if(got){paid.push(t);if(document.getElementById('pop').textContent.includes('輪行費・治療費など'))throw Error('bonus counted as other income');}
 }
 const first=q.calendar(1);if(first.month!==4||first.week!==1)throw Error('spec v2 starts in April');
 for(const [f,want] of [[0,0],[1999,0],[2000,15000],[19999,15000],[20000,40000],[199999,40000],[200000,75000],[999999,75000],[1000000,75000],[1999999,75000],[2000000,75000]]){
  if(q.editorBonus(f)!==want)throw Error('threshold '+f);
 }
 return {paid,annualTotal:40000*4};
}'''),
('editor_focus', None),
('editor_completion', '''() => {
 q.S.turn=52;q.S.fame=20000;q.S.fam.fill(true);q.S.fam[0]=false;q.snap();q.S.fam[0]=true;q.advance();
 if(q.EDI!==40000||!document.getElementById('result-box').textContent.includes('全国クリア'))throw Error('completion pending bonus');
 const money=q.S.money;document.getElementById('res-ok').click();
 if(q.EDI!==0||document.getElementById('ov-edi').hidden||!document.getElementById('result-box').textContent.includes('決算'))throw Error('annual/editor order');
 if(document.activeElement.id!=='edi-ok')throw Error('annual stole focus');
 document.getElementById('edi-ok').click();if(!document.getElementById('ov-result').contains(document.activeElement))throw Error('annual focus return');
 document.getElementById('res-ok').click();if(q.S.money!==money||q.EDI!==0)throw Error('duplicate payment');
 return {money,turn:q.S.turn};
}'''),
('editor_sponsor', '''() => {
 q.S.turn=13;q.S.fame=1999;q.snap();q.S.fame=2000;q.advance();
 if(document.getElementById('ov-spon').hidden||document.getElementById('ov-edi').hidden)throw Error('overlap setup');
 if(document.activeElement.id!=='edi-ok')throw Error('sponsor stole focus');
 document.getElementById('edi-ok').click();if(document.activeElement.id!=='sp-ok')throw Error('sponsor focus return');
 return {amount:document.getElementById('edi-amt').textContent};
}'''),
('update_keyboard', None),
('update_scroll', None),
('update_blocked', '''async () => {
 const U=q.UPD;let reloads=0;U.reload=()=>reloads++;U.pending='0123456789ab';
 for(const id of ['ov-edi','ov-spon','ov-result','ov-tut','ov-prof','ov-set','ov-sns']){
  const el=document.getElementById(id);el.hidden=false;U.plan();
  if(document.getElementById('upd-pop'))throw Error('update covered '+id);el.hidden=true;
 }
 document.getElementById('ov-title').hidden=false;U.plan();
 if(!document.getElementById('upd-pop'))throw Error('title must allow update');
 document.getElementById('ov-title').hidden=true;document.getElementById('ov-edi').hidden=false;
 document.getElementById('upd-ok').click();if(reloads||U.scheduled||document.getElementById('upd-pop'))throw Error('new modal must postpone fire');
 document.getElementById('ov-edi').hidden=true;await U.check(true);document.getElementById('upd-ok').click();
 if(reloads!==1)throw Error('update never resumed');return {reloads};
}'''),
('update_failures', '''async () => {
 const U=q.UPD;let reloads=0;U.reload=()=>reloads++;U.pending='0123456789ab';
 const original=Storage.prototype.setItem;q.S.money=12345;Storage.prototype.setItem=()=>{throw Error('quota')};U.plan();
 if(document.getElementById('upd-pop'))throw Error('shown despite save failure');
 Storage.prototype.setItem=original;U.plan();q.S.money++;Storage.prototype.setItem=()=>{throw Error('quota')};document.getElementById('upd-ok').click();
 if(reloads||U.scheduled||sessionStorage.getItem('cc_upd'))throw Error('reload/cooldown on save failure');
 Storage.prototype.setItem=original;U.plan();document.getElementById('upd-ok').click();U.notice(false);U.scheduled=false;await U.check(true);
 if(reloads!==1||document.getElementById('upd-pop'))throw Error('cooldown failed');return {reloads};
}'''),
('gift_save_file', '''async () => {
 const base=JSON.parse(q.pack());delete base.gummy;delete base.tea;localStorage.charicamp=JSON.stringify(base);q.S=q.load();
 if(q.S.gummy!==0||q.S.tea!==0)throw Error('old save defaults');
 for(const [v,want] of [[null,0],[-1,0],[99,3],[1.5,2],['2',2],['bad',0],[[],0],[[2],2],[{},0]]){
  localStorage.charicamp=JSON.stringify({...base,gummy:v,tea:v});const s=q.load();if(s.gummy!==want||s.tea!==want)throw Error('clamp '+JSON.stringify(v));
 }
 q.newGame(12);q.S.gummy=2;q.S.tea=2;for(const id of ['cammy','harold'])q.S.inf[id]={w:3,e:3,g:0};
 q.giftYear();if(q.S.gummy!==3||q.S.tea!==3||q.giftYear()!=='')throw Error('gift cap/once');q.save();
 const round=q.load();if(round.inf.cammy.g!==1||round.inf.harold.g!==1)throw Error('gift flags');
 let exported;const make=URL.createObjectURL;URL.createObjectURL=b=>{exported=b;return make(b)};
 if(!q.exportSave())throw Error('export');const payload=JSON.parse(await exported.text());
 if(payload.data.gummy!==3||payload.data.tea!==3)throw Error('export quantities');
 payload.data.gummy=1;payload.data.tea=2;window.confirm=()=>true;document.getElementById('sv-in').click();
 const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(payload)],'gift.json',{type:'application/json'}));
 const input=document.getElementById('sv-file');input.files=dt.files;input.onchange();
 for(let i=0;i<50&&q.S.gummy!==1;i++)await new Promise(r=>setTimeout(r,20));
 if(q.S.gummy!==1||q.S.tea!==2||JSON.parse(localStorage.charicamp).tea!==2)throw Error('file import');
 return {gummy:q.S.gummy,tea:q.S.tea};
}'''),
('gift_commands', '''() => {
 let n=0;for(const kind of ['hill','rival','collapse']){
  const states=[];for(const item of ['food2','gummy','tea']){
   q.newGame(12);q.S[item]=1;q.S.hp=30;q.S.mp=30;q.trip={p:q.PREF[12],enc:[kind],i:0,late:false,sec:10,rk:1000,course:kind==='collapse',rinko:true};
   Math.random=()=>.5;q.startBattle(kind);q.B.next='normal';q.B.hp=99999;
   if(!document.querySelector('[data-cmd="'+item+'"]'))throw Error('missing command '+kind+item);
   q.cmd(item);states.push([q.S.hp,q.S.mp]);if(q.S[item]!==0)throw Error('quantity');
   const turn=q.B.turn;q.cmd(item);if(q.B.turn!==turn||document.querySelector('[data-cmd="'+item+'"]'))throw Error('zero stock command');n++;
  }
  if(JSON.stringify(states[0])!==JSON.stringify(states[1])||JSON.stringify(states[0])!==JSON.stringify(states[2]))throw Error('effect differs from Nagano');
 }
 return {cases:n};
}'''),
('editor_null_and_loss', '''() => {
 q.S.turn=13;q.S.fame=20000;q.TS=null;q.advance();if(q.S.money!==75000)throw Error('null TS bonus');document.getElementById('edi-ok').click();
 q.newGame(12);q.S.turn=13;q.S.fame=2000;q.restHome();document.getElementById('res-ok').click();
 if(q.S.fame>=2000||!document.getElementById('ov-edi').hidden)throw Error('rest must use post-loss title');
 return {fame:q.S.fame};
}'''),
('editor_late_and_cure', '''() => {
 q.S.turn=39;q.S.fame=20000;q.S.hp=1;q.S.mp=1;q.S.forecast[12]={temp:-10,wx:'snow'};q.snap();q.INTRIP=true;
 q.trip={p:q.PREF[12],enc:[],i:0,late:true,stay:false,ev:null};q.endTrip2({});
 if(!document.getElementById('result-box').textContent.includes('治療費'))throw Error('cure setup');
 const fame=q.S.fame,b=q.editorBonus(fame),before=q.S.money,sp=q.sponsor()[1];
 document.getElementById('res-ok').click();if(q.S.fame!==fame||q.S.money-before!==b+sp)throw Error('post-loss payment');
 if(document.getElementById('ov-edi').hidden||q.EDI!==0)throw Error('late/cure editor missing');
 if(!document.getElementById('pop').textContent.includes('輪行費・治療費など'))throw Error('cure accounting missing');
 return {fame,bonus:b,hp:q.S.hp,turn:q.S.turn};
}'''),
('editor_forced_home', '''() => {
 q.S.turn=13;q.S.fame=20000;q.S.loc=0;q.S.money=0;q.restHome();
 const fame=q.S.fame,b=q.editorBonus(fame),sp=q.sponsor()[1],before=q.S.money;
 document.getElementById('res-ok').click();if(q.S.loc!==q.S.home||q.S.fame!==fame||q.S.money-before!==b+sp)throw Error('forced home bonus');
 if(document.getElementById('ov-edi').hidden)throw Error('forced home editor missing');
 return {fame,bonus:b,turn:q.S.turn};
}'''),
('asset_failures', '''async () => {
 const logo=document.querySelector('#ov-sns .snshd img');
 await new Promise(resolve=>{logo.onload=logo.onerror=resolve;logo.src='/missing-logo.webp'});
 if(logo.alt!=='ヒヨッター')throw Error('logo has no alternative text');
 q.S.gummy=1;q.S.tea=1;q.trip={p:q.PREF[12],enc:['rival'],i:0,late:false,sec:10,rk:1000};q.startBattle('rival');
 for(const item of ['gummy','tea']){
  const im=document.querySelector('[data-cmd="'+item+'"] img');
  im.src='/missing-'+item+'.webp';for(let i=0;i<50&&(!im.complete||!im.naturalWidth);i++)await new Promise(r=>setTimeout(r,20));
  if(!im.getAttribute('src').endsWith('icon_food.webp')||!im.naturalWidth)throw Error('icon fallback '+item);
 }
 return {logoAlt:logo.alt,icons:'fallback loaded'};
}'''),
('mobile_layout', '''async () => {
 q.S.turn=13;q.S.fame=200000;q.S.money=1e12;q.snap();q.advance();
 await document.fonts.ready;
 const modal=document.querySelector('#ov-edi .modal'),button=document.getElementById('edi-ok').getBoundingClientRect();
 if(modal.scrollWidth>modal.clientWidth||button.top<0||button.bottom>innerHeight)throw Error('editor overflow');
 document.getElementById('edi-ok').click();document.getElementById('btn-sns').click();
 const header=document.querySelector('#ov-sns .snshd'),share=document.getElementById('btn-share').getBoundingClientRect(),close=document.getElementById('sns-close').getBoundingClientRect();
 if(header.scrollWidth>header.clientWidth||Math.abs(share.top-close.top)>10)throw Error('hiyotter header wrapped');
 return {width:innerWidth,editorFits:true,headerFits:true};
}'''),
]

def run():
    selected = [(name, js) for name, js in CASES if not args.case or args.case == name]
    if not selected:
        raise ValueError('Unknown case: ' + args.case)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    failed = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            for name, js in selected:
                ctx = browser.new_context(viewport={'width':1000,'height':800}, reduced_motion='reduce')
                ctx.add_init_script("localStorage.setItem('cc_tut','1');localStorage.setItem('cc_tutb','1');")
                page = ctx.new_page()
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                try:
                    page.goto('http://127.0.0.1:' + str(server.server_port))
                    page.evaluate("localStorage.removeItem('charicamp');sessionStorage.clear();q.newGame(12);document.getElementById('ov-title').hidden=true;q.render();")
                    if name == 'editor_focus':
                        # Real keyboard events (not only synthetic keydown).
                        page.evaluate("q.S.turn=13;q.S.fame=2000;q.snap();q.advance()")
                        assert page.evaluate('document.activeElement.id') == 'edi-ok', 'focus remained behind editor'
                        page.keyboard.press('Tab');page.keyboard.press('Shift+Tab')
                        assert page.evaluate('document.activeElement.id') == 'edi-ok', 'Tab escaped editor'
                        old = page.evaluate('({turn:q.S.turn,money:q.S.money})')
                        page.keyboard.press('Escape')
                        assert page.locator('#ov-edi').is_hidden()
                        assert page.evaluate('document.activeElement.id') == 'pop-x'
                        page.reload()
                        assert page.evaluate('({turn:q.S.turn,money:q.S.money})') == old
                        result = old
                    elif name == 'update_keyboard':
                        page.evaluate("window.reloads=0;q.UPD.reload=()=>reloads++;document.getElementById('btn-sns').focus();q.UPD.pending='0123456789ab';q.UPD.plan()")
                        page.wait_for_timeout(30)
                        assert page.evaluate('reloads') == 0
                        page.keyboard.press('Tab')
                        assert page.evaluate('document.activeElement.id') == 'upd-ok', 'Tab escaped update'
                        page.keyboard.press('Shift+Tab')
                        assert page.evaluate('document.activeElement.id') == 'upd-ok'
                        page.keyboard.press('Escape')
                        assert page.locator('#upd-pop').count() == 0, 'Escape did not postpone update'
                        assert page.evaluate("!q.UPD.scheduled && !!q.UPD.pending && reloads===0 && document.activeElement.id==='btn-sns'")
                        result = page.evaluate("async()=>{await q.UPD.check(true);q.S.money=424242;document.getElementById('upd-ok').click();document.getElementById('upd-ok').click();if(reloads!==1||JSON.parse(localStorage.charicamp).money!==424242)throw Error('duplicate reload/persist');return {reloads}}")
                    elif name == 'update_scroll':
                        page.set_viewport_size({'width':320,'height':600})
                        page.evaluate("document.body.style.minHeight='1200px';scrollTo(0,0);q.UPD.pending='0123456789ab';q.UPD.plan()")
                        old = page.evaluate('scrollY')
                        page.mouse.move(10,10);page.mouse.wheel(0,500);page.wait_for_timeout(300)
                        assert page.evaluate('scrollY') == old, 'background scrolled behind update modal'
                        result = {'scrollBefore':old,'scrollAfter':page.evaluate('scrollY')}
                    elif name == 'mobile_layout':
                        result = []
                        for width in [320,390]:
                            page.set_viewport_size({'width':width,'height':844})
                            page.evaluate("document.getElementById('ov-sns').hidden=true;q.newGame(12);q.render()")
                            result.append(page.evaluate(js))
                    else:
                        result = page.evaluate(js)
                    assert not errors, errors
                    print('PASS', name, json.dumps(result, ensure_ascii=False), flush=True)
                except Exception as e:
                    failed += 1
                    print('FAIL', name, str(e), flush=True)
                finally:
                    ctx.close()
            browser.close()
    finally:
        server.shutdown();server.server_close()
    print(json.dumps({'passed':len(selected)-failed,'failed':failed}))
    return bool(failed)

if __name__ == '__main__':
    sys.exit(run())
