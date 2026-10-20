# Follow-up review at b89666c. Instruments only the served copy.
# python3 qa/followup_review.py [--html /path/to/index.html] [--case NAME]
import functools, http.server, json, os, shutil, sys, threading
sys.dont_write_bytecode = True
import features_review as f
from playwright.sync_api import sync_playwright

# Abrupt-termination probe: stop synchronously immediately after crediting money.
# This is not a normal UI reload; the persisted snapshot is inspected before replay.
assert f.html.count(b'S.money+=b;EDI=b;') == 1
f.html = f.html.replace(b'S.money+=b;EDI=b;', b'S.money+=b;if(window.__afterBonus)window.__afterBonus();EDI=b;')

def evaluate(page, script):
    return page.evaluate(script)

def update_safety(p):
    return evaluate(p, '''() => {
 const U=q.UPD;let reloads=0;U.reload=()=>reloads++;U.pending='0123456789ab';
 U.plan();if(!U.note)throw Error('notice missing');q.INTRIP=true;U.fire();
 if(reloads||U.note||U.scheduled||!U.pending)throw Error('trip safety failed');
 q.INTRIP=false;U.plan();document.getElementById('ov-edi').hidden=false;U.fire();
 if(reloads||U.note||U.scheduled)throw Error('overlay safety failed');
 document.getElementById('ov-edi').hidden=true;U.plan();q.S.money=424242;U.fire();
 if(reloads!==1||JSON.parse(localStorage.charicamp).money!==424242)throw Error('resume/save failed');
 return {reloads,persisted:424242};
}''')

def update_storage(p):
    return evaluate(p, '''() => {
 const U=q.UPD;let reloads=0;U.reload=()=>reloads++;U.pending='0123456789ab';
 const set=Storage.prototype.setItem,get=Storage.prototype.getItem;
 let writes=0;Storage.prototype.setItem=function(k,v){if(k==='charicamp'){writes++;throw new DOMException('test quota','QuotaExceededError');}return set.call(this,k,v)};
 q.S.money++;U.plan();if(U.note||reloads)throw Error('failed initial save allowed update');
 Storage.prototype.setItem=set;U.plan();if(!U.note)throw Error('notice missing');q.S.money++;
 Storage.prototype.setItem=function(k,v){if(k==='charicamp')throw new DOMException('test quota','QuotaExceededError');return set.call(this,k,v)};
 U.fire();if(reloads||U.note||U.scheduled)throw Error('failed final save allowed update');Storage.prototype.setItem=set;
 Storage.prototype.getItem=function(k){if(k==='charicamp')return 'wrong snapshot';return get.call(this,k)};
 U.plan();if(U.note||reloads)throw Error('readback mismatch allowed update');Storage.prototype.getItem=get;
 U.plan();U.fire();if(reloads!==1)throw Error('save recovery failed');return {writes,reloads};
}''')

def bonus_reload(p):
    results=[]
    for turn in [13,26,39,52,65,78,91,104]:
        for phase in ['after_credit_abrupt','after_credit_reload_request','popup','annual']:
            if phase=='annual' and turn%52: continue
            p.evaluate('''t=>{document.querySelectorAll('.overlay').forEach(e=>e.hidden=true);q.newGame(12);q.S.turn=t;q.S.fame=20000;q.save();q.snap();window.__oldMoney=q.S.money;window.__sp=q.sponsor()[1]}''',turn)
            if phase=='after_credit_abrupt':
                r=p.evaluate('''()=>{window.__afterBonus=()=>{throw Error('STOP_AFTER_CREDIT')};try{q.advance()}catch(e){if(e.message!=='STOP_AFTER_CREDIT')throw e}delete window.__afterBonus;
                 const disk=JSON.parse(localStorage.charicamp);const r={memory:q.S.money,stored:disk.money,turn:disk.turn};if(r.memory!==__oldMoney+__sp+40000||r.stored!==__oldMoney)throw Error('credit boundary');
                 // Emulate abrupt termination: pagehide must not persist the paused partial state.
                 q.INTRIP=true;return r}''')
                p.reload()
                assert p.evaluate('q.S.turn')==turn
                before=p.evaluate('q.S.money')
                p.evaluate("q.snap();q.advance()")
                assert p.evaluate("q.S.log.filter(x=>x.includes('編集長から賞与')).length")==1
                assert p.evaluate('q.S.money')==before+45000
                result={'sourceTurn':turn,'phase':phase,'initialPayments':0,'afterReplay':1,'creditSnapshot':r}
            elif phase=='after_credit_reload_request':
                with p.expect_navigation(wait_until='load'):
                    p.evaluate("window.__afterBonus=()=>location.reload();q.advance()")
                assert p.evaluate('q.S.turn')==turn+1
                assert p.evaluate('q.S.money')==75000
                assert p.evaluate("q.S.log.filter(x=>x.includes('編集長から賞与')).length")==1
                result={'sourceTurn':turn,'phase':phase,'paymentsAfterReload':1}
            else:
                p.evaluate('q.advance()')
                expected=p.evaluate('({money:q.S.money,turn:q.S.turn})')
                assert p.locator('#ov-edi').is_visible()
                if phase=='annual': assert p.locator('#ov-result').is_visible()
                p.reload()
                assert p.evaluate('({money:q.S.money,turn:q.S.turn})')==expected
                assert p.evaluate("q.S.log.filter(x=>x.includes('編集長から賞与')).length")==1
                result={'sourceTurn':turn,'phase':phase,'paymentsAfterReload':1,**expected}
            results.append(result)
    return results

def scroll_variants(p):
    results=[]
    for mode in ['both','css_only','events_only','neither']:
        p.evaluate("document.querySelectorAll('.overlay').forEach(e=>e.hidden=true);q.UPD.notice(false);q.UPD.scheduled=false;sessionStorage.clear();document.body.style.minHeight='1600px';scrollTo(0,0);q.UPD.pending='0123456789ab';q.UPD.plan()")
        p.evaluate('''mode=>{let o=q.UPD.note;if(mode==='css_only'||mode==='neither'){const n=o.cloneNode(true);o.replaceWith(n);q.UPD.note=n;o=n}if(mode==='events_only'||mode==='neither'){o.style.overflow='visible';o.style.overscrollBehavior='auto'}}''',mode)
        p.mouse.move(10,10);p.mouse.wheel(0,500);p.wait_for_timeout(300)
        y=p.evaluate('scrollY');results.append({'mode':mode,'scrollY':y})
        if mode=='both': assert y==0
        if mode=='neither': assert y>0
    return results

def other_dialogs(p):
    results=[]
    for dialog in ['ov-edi','ov-spon','ov-prof','ov-set','ov-sns']:
        p.evaluate("id=>{q.UPD.notice(false);document.querySelectorAll('.overlay').forEach(e=>e.hidden=true);document.body.style.minHeight='1600px';scrollTo(0,0);document.getElementById(id).hidden=false}",dialog)
        p.mouse.move(10,10);p.mouse.wheel(0,500);p.wait_for_timeout(300)
        results.append({'dialog':dialog,'scrollY':p.evaluate('scrollY')})
        assert results[-1]['scrollY']==0,('background scrolled behind '+dialog,results)
    return results

def long_update(p):
    p.evaluate("document.body.style.minHeight='1600px';scrollTo(0,0);q.UPD.pending='0123456789ab';q.UPD.plan();const t=document.createElement('div');t.style.height='1500px';t.textContent='LONG START';q.UPD.note.firstElementChild.prepend(t);q.UPD.note.scrollTop=0")
    geo=p.evaluate("()=>{const o=q.UPD.note,r=o.firstElementChild.getBoundingClientRect();return {top:r.top,height:r.height,scrollHeight:o.scrollHeight,clientHeight:o.clientHeight}}")
    assert geo['top']>=0, 'long notification start unreachable: '+json.dumps(geo)
    p.mouse.move(160,100);p.mouse.wheel(0,500);p.wait_for_timeout(300)
    r=p.evaluate('({inside:q.UPD.note.scrollTop,background:scrollY})')
    assert r['inside']>0 and r['background']==0,r
    p.evaluate('q.UPD.note.scrollTop=q.UPD.note.scrollHeight')
    p.mouse.wheel(0,500);p.wait_for_timeout(300)
    assert p.evaluate('scrollY')==0
    touch=p.evaluate("()=>{const e=new Event('touchmove',{bubbles:true,cancelable:true});q.UPD.note.dispatchEvent(e);return {defaultPrevented:e.defaultPrevented}}")
    assert not touch['defaultPrevented'],touch
    return {'geometry':geo,**r,'syntheticTouch':touch}

def short_update(p):
    p.set_viewport_size({'width':320,'height':160})
    p.evaluate("q.UPD.pending='0123456789ab';q.UPD.plan();q.UPD.note.scrollTop=0")
    r=p.evaluate("()=>{const o=q.UPD.note,b=o.firstElementChild.getBoundingClientRect();return {top:b.top,scrollHeight:o.scrollHeight,clientHeight:o.clientHeight}}")
    assert r['top']>=0,'short viewport clips notification start: '+json.dumps(r)
    return r

CASES={'update_safety':update_safety,'update_storage':update_storage,'bonus_reload':bonus_reload,'scroll_variants':scroll_variants,'other_dialogs':other_dialogs,'long_update':long_update,'short_update':short_update}
def main():
    if f.args.case and f.args.case not in CASES:
        raise ValueError('Unknown case: '+f.args.case)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(f.Handler,directory=str(f.ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();failed=0
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
            print('BROWSER',browser.version,'headless=True --no-sandbox',flush=True)
            for name,fn in CASES.items():
                if f.args.case and f.args.case!=name:continue
                ctx=browser.new_context(viewport={'width':320,'height':600},reduced_motion='reduce')
                ctx.add_init_script("localStorage.setItem('cc_tut','1');localStorage.setItem('cc_tutb','1')")
                p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    p.goto('http://127.0.0.1:'+str(server.server_port));p.evaluate("localStorage.removeItem('charicamp');sessionStorage.clear();q.newGame(12);document.getElementById('ov-title').hidden=true;q.render()")
                    result=fn(p);assert not errors,errors;print('PASS',name,json.dumps(result,ensure_ascii=False),flush=True)
                except Exception as e:failed+=1;print('FAIL',name,str(e),flush=True)
                finally:ctx.close()
            browser.close()
    finally:server.shutdown();server.server_close()
    print(json.dumps({'failed':failed}));return bool(failed)
if __name__=='__main__':raise SystemExit(main())
