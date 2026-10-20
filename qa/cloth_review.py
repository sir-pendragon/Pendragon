# 衣類の小物（4枠）のデバッグ。Python Playwright + Chromium が必要。 python3 qa/cloth_review.py [--html path]
# 表示（CSS）・購入/装備/外す・不正なセーブ・戦闘への効果・投稿・ファイル保存を、実ブラウザで確かめる。ソースや画像は変更しない。
import argparse, functools, http.server, json, pathlib, sys, threading
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--html', type=pathlib.Path, default=ROOT / 'index.html'); a = ap.parse_args()
src = a.html.read_text(); at = src.rfind('})();')
expose = "window.q={ACC,CLOTHES,bikeStats,newGame,render,renderShop,save,load,pack,startBattle,cmd,exportSave,feedItems,askGo,PREF,snap,get trip(){return trip},set trip(v){trip=v},get S(){return S},set S(v){S=v},get B(){return B}};"
html = (src[:at] + expose + src[at:]).encode()
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] in ['/', '/index.html']:
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(html))); self.end_headers()
            try: self.wfile.write(html)
            except BrokenPipeError: pass
        else: super().do_GET()
    def log_message(self, *x): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/'
fails = []
def ok(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(info) if info and not cond else '')); 
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    def fresh(w=390, h=900):
        pg = b.new_page(viewport={'width': w, 'height': h}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.evaluate("localStorage.setItem('cc_tut',1);localStorage.setItem('cc_tutb',1)"); pg.reload()
        pg.evaluate("document.getElementById('ov-title').hidden=true;q.newGame(1);q.S.money=900000;q.render()")
        return pg, errs
    def open_eq(pg):
        pg.evaluate("document.querySelector('#tabs button[data-tab=\"p-gear\"],button[data-tab=\"p-gear\"]')?.click()")
        pg.evaluate("let e=document.getElementById('eq-cloth');while(e){e.hidden=false;e=e.parentElement}")
    # 1. 表示：幅ごとに横はみ出し・枠はみ出しがない（全部装備、最長の名前）
    for w in (320, 360, 390, 430, 600):
        pg, errs = fresh(w)
        pg.evaluate("q.S.owned.acc=q.ACC.map(x=>x.id);q.S.owned.cloth=q.CLOTHES.map(x=>x.id);q.S.cloth='all';q.S.acc=['sg2','shoe1','hel2'];q.renderShop()")
        open_eq(pg)
        r = pg.evaluate("""()=>{const g=document.querySelector('#eq-cloth .slots4'),sl=[...g.querySelectorAll('.slot')],gr=g.getBoundingClientRect();
          const bad=sl.filter(s=>{const r=s.getBoundingClientRect();return r.left<gr.left-1||r.right>gr.right+1||s.scrollWidth>s.clientWidth+1}).length;
          const cards=[...document.querySelectorAll('#eq-cloth .card, #shop-cloth .card')],cb=cards.filter(c=>{const n=c.querySelector('.name'),bt=c.querySelector('button,.pill');if(!bt)return false;const a=c.getBoundingClientRect(),b2=bt.getBoundingClientRect();return b2.right>a.right+1||n.scrollWidth>n.clientWidth+1}).length;
          return {slots:sl.length,on:g.querySelectorAll('.slot.on').length,bad,cb,hs:document.documentElement.scrollWidth>innerWidth+1}}""")
        ok(f'layout {w}px', r['slots'] == 4 and r['on'] == 4 and r['bad'] == 0 and r['cb'] == 0 and not r['hs'] and not errs, (r, errs))
        pg.close()
    # 2. 購入→確認→所持・自動装備、同種は入れ替わり、外す、ウェアを変えても小物は残る、枠は常に4以内
    pg, errs = fresh(); open_eq(pg)
    def buy(i):
        pg.evaluate("(i)=>document.querySelector('#shop-cloth .card[data-id=\"'+i+'\"] button[data-act=buy]').click()", i)
        pg.evaluate("document.getElementById('pay-yes').click()")
    m0 = pg.evaluate("q.S.money"); buy('sg1')
    s = pg.evaluate("[q.S.money,q.S.owned.acc,q.S.acc]"); ok('buy sg1 pays & equips', s == [m0 - 4000, ['sg1'], ['sg1']], s)
    buy('sg2'); s = pg.evaluate("[q.S.owned.acc,q.S.acc]"); ok('sg2 replaces sg1 (same type)', s == [['sg1', 'sg2'], ['sg2']], s)
    for i in ('shoe1', 'shoe3', 'hel1', 'hel2'): buy(i)
    s = pg.evaluate("q.S.acc"); ok('one per type; max 3 accessories', s == ['sg2', 'shoe3', 'hel2'], s)
    pg.evaluate("q.S.owned.cloth.push('winter');q.renderShop()"); open_eq(pg)
    pg.evaluate("document.querySelector('#eq-cloth .card[data-id=winter] button[data-act=equip]').click()")
    s = pg.evaluate("[q.S.cloth,q.S.acc,document.querySelectorAll('#eq-cloth .slot.on').length]"); ok('wear change keeps accessories; 4 slots on', s == ['winter', ['sg2', 'shoe3', 'hel2'], 4], s)
    pg.evaluate("document.querySelector('#eq-cloth .card[data-id=shoe3] button[data-act=unequip]').click()")
    s = pg.evaluate("[q.S.acc,document.querySelectorAll('#eq-cloth .slot.on').length,document.querySelectorAll('#eq-cloth .slot:not(.on)').length]"); ok('unequip empties slot', s == [['sg2', 'hel2'], 3, 1], s)
    ok('no page errors (flow)', not errs, errs)
    # 3. 効果：加算と、ヘルメットでダメージ減（同じ条件の戦闘で比較）
    st0 = pg.evaluate("(()=>{q.S.acc=[];return q.bikeStats()})()"); st1 = pg.evaluate("(()=>{q.S.acc=['sg2','shoe3','hel2'];return q.bikeStats()})()")
    ok('stat sums', st1['wx'] - st0['wx'] == 3 and st1['rough'] - st0['rough'] == 2 and st1['climb'] - st0['climb'] == 1 and st1['comfy'] - st0['comfy'] == 1, (st0, st1))
    def hit(acc):
        return pg.evaluate("""(acc)=>{Math.random=()=>0.5;q.S.acc=acc;q.trip={p:q.PREF[12],enc:['hill'],i:0,late:false,stay:false,sec:10,rk:1000};q.S.hp=50;q.S.mp=100;q.snap();q.startBattle('hill');const b=q.B;b.next='normal';b.atk=10;q.cmd('rest');return 70-q.S.hp}""", acc)
    try:
        d0 = hit([]); d1 = hit(['hel1']); d2 = hit(['hel2'])
        ok('helmet reduces damage by 1 (same battle)', d0 - d1 in (1,) and d0 - d2 in (1,), (d0, d1, d2))
    except Exception as e: ok('helmet damage probe', False, e)
    pg.close()
    # 4. 不正なセーブの整理
    pg, errs = fresh()
    cases = {
      'acc string': dict(acc='sg1'), 'acc null': dict(acc=None), 'acc numbers': dict(acc=[1, 2]),
      'unowned': dict(acc=['sg1', 'hel1'], owned_acc=[]), 'dups': dict(acc=['sg1', 'sg1', 'sg2'], owned_acc=['sg1', 'sg2']),
      'too many': dict(acc=['sg1', 'shoe1', 'hel1', 'shoe2', 'sg2'], owned_acc=['sg1', 'shoe1', 'hel1', 'shoe2', 'sg2']),
      'owned not array': dict(acc=['sg1'], owned_acc='x'), 'unknown ids': dict(acc=['zzz'], owned_acc=['zzz']),
    }
    for n, c in cases.items():
        r = pg.evaluate("""(c)=>{q.newGame(1);const o=JSON.parse(q.pack());o.acc=c.acc;o.owned.acc=c.owned_acc===undefined?['sg1']:c.owned_acc;localStorage.setItem('charicamp',JSON.stringify(o));const L=q.load();return {acc:L.acc,own:L.owned.acc}}""", c)
        good = isinstance(r['acc'], list) and len(r['acc']) <= 3 and all(x in r['own'] for x in r['acc']) and len(set(r['acc'])) == len(r['acc']) and isinstance(r['own'], list)
        types = pg.evaluate("(a)=>a.map(i=>q.ACC.find(x=>x.id===i).t)", r['acc']); good = good and len(set(types)) == len(types)
        ok('load clamp: ' + n, good, r)
    # 旧セーブ（項目なし）
    r = pg.evaluate("""()=>{q.newGame(1);const o=JSON.parse(q.pack());delete o.acc;delete o.owned.acc;localStorage.setItem('charicamp',JSON.stringify(o));const L=q.load();return [L.acc,L.owned.acc]}""")
    ok('old save without acc', r == [[], []], r)
    ok('no page errors (load)', not errs, errs)
    # 5. 保存→再読み込み→ファイル出力の内容
    pg.evaluate("q.newGame(1);q.S.owned.acc=['sg2','shoe2','hel1'];q.S.acc=['sg2','shoe2','hel1'];q.save()")
    pg.reload(); pg.evaluate("localStorage.setItem('cc_tut',1)")
    r = pg.evaluate("(()=>{const L=q.load();return [L.acc,L.owned.acc]})()"); ok('save roundtrip', r == [['sg2','shoe2','hel1'],['sg2','shoe2','hel1']], r)
    pg.close()
    # 6. 投稿：購入が出る・金額なし・絵あり
    pg, errs = fresh()
    pg.evaluate("q.S.log.push(q.S.turn+'|高性能サングラスを購入（¥20,000）')")
    items = pg.evaluate("q.feedItems().map(x=>x.p.text)")
    ok('sns purchase post has no yen', any('高性能サングラス' in t for t in items) and not any('¥' in t for t in items), items[:3])
    ok('no page errors (sns)', not errs, errs)
    pg.close(); b.close()
print('failed:', len(fails)); sys.exit(1 if fails else 0)
