# Prove focused regressions detect broken behavior. All mutants are temporary files.
# python3 qa/mutation_review.py
import pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
source = (ROOT / 'index.html').read_text()
MUTANTS = [
    ('editor_focus', 'tutShow(4,tt);autoExport();focusEditor();}', 'tutShow(4,tt);autoExport();}'),
    ('editor_completion', 'autoExport();},true);render();focusEditor();return;}', 'autoExport();},true);render();return;}'),
    ('update_keyboard', "if(e.key==='Tab'){e.preventDefault();bt.focus();}", "if(false){e.preventDefault();bt.focus();}"),
    # 背景スクロールは2段で防ぐ（CSS と wheel/touchmove）。両方を外したときだけ検出される
    ('update_scroll', ("padding:16px;overflow:auto;overscroll-behavior:contain'", "const noChain=e=>{if(o.scrollHeight<=o.clientHeight)e.preventDefault();};"), ("padding:16px'", "const noChain=e=>{};")),
    ('update_blocked', '||this.blocked()', ''),
    ('gift_commands', 'S.hp+GUMMY.hp', 'S.hp+1'),
    ('quarter_calendar', '[20000,40000]', '[20000,1]'),
]

def main():
    rejected = 0
    with tempfile.TemporaryDirectory(prefix='pendragon-mutants-') as d:
        for i, (case, old, new) in enumerate(MUTANTS):
            olds = old if isinstance(old, tuple) else (old,)
            news = new if isinstance(new, tuple) else (new,)
            mutated = source
            for o, n in zip(olds, news):
                count = source.count(o)
                expected = 2 if case == 'update_blocked' else 1
                if count != expected:
                    raise AssertionError((case, 'mutation no longer matches', count))
                mutated = mutated.replace(o, n)
            path = pathlib.Path(d) / (str(i) + '.html')
            path.write_text(mutated)
            result = subprocess.run([sys.executable, str(ROOT / 'qa/features_review.py'), '--case', case, '--html', str(path)], cwd=ROOT, capture_output=True, text=True, timeout=90)
            # An infrastructure error does not count as a detected mutation.
            if result.returncode != 1 or 'FAIL ' + case not in result.stdout or '"failed": 1' not in result.stdout:
                print('FAIL mutant survived or infrastructure failed:', case, result.stdout, result.stderr)
                return 1
            rejected += 1
            print('PASS mutant rejected:', case, flush=True)
            print(result.stdout.strip(), flush=True)
    print('PASS mutation review:', rejected, '/', len(MUTANTS))
    return 0

if __name__ == '__main__':
    sys.exit(main())
