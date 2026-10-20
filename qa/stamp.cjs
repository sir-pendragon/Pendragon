// index.html の版の識別子 APP_V を、ファイルの内容から計算して書き込む。
//   node qa/stamp.cjs          ... 更新する（index.html を変えたら、公開の前に必ず実行する）
//   node qa/stamp.cjs --check  ... 古ければ失敗終了（何も書き換えない）
// 識別子は「APP_V の値だけを固定の文字列に置き換えた index.html」の SHA-256 の先頭12文字。
// 自動更新（実行中の APP_V と、配信中の index.html の APP_V を比べる）がこの値を使うので、ここを忘れると更新が検知されない。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const RE=/const APP_V='[0-9a-f]{12}';/,ZERO="const APP_V='000000000000';";
function compute(html){if(!RE.test(html))throw new Error("APP_V の定義（const APP_V='<12桁の16進>';）が見つかりません");
 return crypto.createHash('sha256').update(html.replace(RE,ZERO)).digest('hex').slice(0,12);}
function current(html){const m=/const APP_V='([0-9a-f]{12})';/.exec(html);return m?m[1]:null;}
module.exports={compute,current};
if(require.main===module){
 const file=path.resolve(__dirname,'..','index.html'),html=fs.readFileSync(file,'utf8'),want=compute(html),have=current(html);
 if(process.argv.includes('--check')){if(have!==want){console.error(`APP_V が古い: ${have} (正しくは ${want})。node qa/stamp.cjs を実行してください`);process.exit(1);}console.log('APP_V ok',have);}
 else{if(have===want){console.log('APP_V は最新',have);}else{fs.writeFileSync(file,html.replace(RE,`const APP_V='${want}';`));console.log('APP_V を更新',have,'->',want);}}
}
