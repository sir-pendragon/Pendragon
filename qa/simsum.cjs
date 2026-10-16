// qa/sim.cjs の出力JSONを集計する: node qa/simsum.cjs out.json [比較用out.json]
const fs=require('fs');
function sum(f){const R=JSON.parse(fs.readFileSync(f));const n=R.length;const en={};let st=0,er=0;const fam=[],fame=[],money=[],y1=[],y2=[];
 for(const r of R){st+=r.stuck;er+=r.errors;fam.push(r.final.fam);fame.push(r.final.fame);money.push(r.final.money);if(r.years[0])y1.push(r.years[0].fam);if(r.years[1])y2.push(r.years[1].fam);
  for(const [k,v] of Object.entries(r.final.en||{})){const e=en[k]=en[k]||[0,0,0];e[0]+=v[0];e[1]+=v[1];e[2]+=v[2];}}
 const med=a=>{a=[...a].sort((x,y)=>x-y);return a.length?a[a.length>>1]:NaN};const avg=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
 return {n,stuck:st,errors:er,famMed:med(fam),famAvg:+avg(fam).toFixed(1),y1:med(y1),y2:med(y2),fameMed:med(fame),moneyMed:med(money),en};}
const A=sum(process.argv[2]),B=process.argv[3]&&sum(process.argv[3]);
const show=(t,s)=>{console.log(`== ${t}: ${s.n}ゲーム 停止${s.stuck} 例外${s.errors} / 104週後の制覇県 中央値${s.famMed} 平均${s.famAvg} / 1年目末${s.y1} 2年目末${s.y2} / フォロワー中央値${s.fameMed} 所持金中央値${s.moneyMed}`);
 for(const [k,v] of Object.entries(s.en).sort((a,b)=>b[1][0]-a[1][0]))console.log(`  ${k.padEnd(10)} 遭遇${String(v[0]).padStart(5)} 突破${(v[1]/v[0]*100).toFixed(0).padStart(3)}% 失敗${(v[2]/v[0]*100).toFixed(0).padStart(3)}%`);};
show(process.argv[2],A);if(B)show(process.argv[3],B);
