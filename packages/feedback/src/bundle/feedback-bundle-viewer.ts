import { strToU8 } from 'fflate'

declare const __FEEDBACK_REPLAY_SCRIPT__: string

/** 查看器只使用 textContent 与受限图片，不执行原应用或用户附件脚本。 */
const VIEWER_SCRIPT = `
const messages = {
 zh: {title:'问题反馈',facts:'采集事实',user:'用户描述',evidence:'证据',attachments:'截图与附件',missing:'缺失材料',history:'处理记录',error:'问题包读取失败',all:'全部',next:'下一页',previous:'上一页',download:'下载',empty:'未填写',replay:'页面回放',play:'播放',pause:'暂停',unavailable:'回放不可用，已保留原始证据',boundary:'回放展示采集的页面快照与交互，不执行原应用脚本。未内嵌的外部图片、字体和样式被离线策略阻止；缺失记录见下方。'},
 en: {title:'Feedback report',facts:'Collected facts',user:'User description',evidence:'Evidence',attachments:'Screenshots and attachments',missing:'Missing evidence',history:'Processing history',error:'Unable to read the bundle',all:'All',next:'Next',previous:'Previous',download:'Download',empty:'Not provided',replay:'Page replay',play:'Play',pause:'Pause',unavailable:'Replay unavailable; original evidence is preserved',boundary:'Replay shows captured snapshots and interactions without running application scripts. External images, fonts and styles that were not embedded are blocked by offline policy. See missing evidence below.'},
 ja: {title:'問題フィードバック',facts:'収集した事実',user:'ユーザーの説明',evidence:'証拠',attachments:'スクリーンショットと添付',missing:'不足資料',history:'処理記録',error:'パッケージを読み込めません',all:'すべて',next:'次へ',previous:'前へ',download:'ダウンロード',empty:'未入力',replay:'ページ再生',play:'再生',pause:'一時停止',unavailable:'再生できません。元の証拠は保持されています',boundary:'収集したスナップショットと操作を再生し、元のアプリのスクリプトは実行しません。埋め込まれていない外部画像、フォント、スタイルはオフライン方針で遮断されます。不足資料も確認してください。'}
};
const language = navigator.language.startsWith('ja') ? 'ja' : navigator.language.startsWith('zh') ? 'zh' : 'en';
const m = messages[language];
function text(tag,value,parent){const node=document.createElement(tag);node.textContent=String(value??'');parent.append(node);return node;}
function section(title){const block=document.createElement('section');text('h2',title,block);document.querySelector('main').append(block);return block;}
function safeImage(file){return ['image/png','image/jpeg','image/webp'].includes(file.contentType);}
async function load(path){const response=await fetch('../'+path);if(!response.ok)throw Error('Missing file');return response.json();}
try {
 const [manifest,report,evidence,history]=await Promise.all([load('manifest.json'),load('report.json'),load('evidence/records.json'),load('evidence/history.json')]);
 text('h1',m.title+' '+(report.number||report.id),document.querySelector('header'));
 text('pre',JSON.stringify(report,null,2),section(m.facts));
 text('p',report.description||m.empty,section(m.user));
 const attachments=section(m.attachments);
 for(const file of manifest.files.filter(item=>item.kind==='attachment')){
  if(!/^attachments\\/[\\w-]+\\.(png|jpg|webp|webm|mp4|txt|json|bin)$/.test(file.path))continue;
  const figure=document.createElement('figure');attachments.append(figure);text('figcaption',file.name||file.attachmentId,figure);
  if(safeImage(file)){const image=document.createElement('img');image.src='../'+file.path;image.alt=file.name||'';image.loading='lazy';figure.append(image);}
  if(['video/webm','video/mp4'].includes(file.contentType)){const video=document.createElement('video');video.src='../'+file.path;video.controls=true;video.preload='metadata';video.style.maxWidth='100%';figure.append(video);}
  const link=text('a',m.download,figure);link.href='../'+file.path;link.download=file.name||file.path.split('/').pop();
 }
 const replayEvents=evidence.filter(item=>item.kind==='replay'&&item.data&&item.data.event).map(item=>item.data.event).sort((a,b)=>a.timestamp-b.timestamp);

 if(replayEvents.length){
  const replay=section(m.replay);text('p',m.boundary,replay);
  try{
   await import('./replay.js');
   if(typeof globalThis.__HAI_FEEDBACK_REPLAY__!=='function')throw Error('Replay unavailable');
   const fullSnapshot=replayEvents.find(event=>event.type===2);
   if(!fullSnapshot)throw Error('Replay full snapshot unavailable');
   const target=document.createElement('div');replay.append(target);
   let player;
   const origin=replayEvents[0].timestamp;
   const duration=Math.max(0,replayEvents.at(-1).timestamp-origin);
   const snapshotOffset=Math.max(0,fullSnapshot.timestamp-origin);
   const play=text('button',m.play,replay);const pause=text('button',m.pause,replay);
   const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max=String(Math.max(1,duration));slider.value='0';slider.setAttribute('aria-label',m.replay);replay.append(slider);
   let current=0;let playing=false;let frame=0;
   function position(value){return Math.max(0,Math.min(duration,Number.isFinite(value)?value:0));}
   function stop(){if(frame)cancelAnimationFrame(frame);frame=0;}
   // 每次定位重建实例，隔离旧回放末尾延迟到达的 finish，避免覆盖新的进度。
   function construct(){const instance=globalThis.__HAI_FEEDBACK_REPLAY__(replayEvents,target);player=instance;instance.on('finish',()=>{if(instance!==player||!playing)return;playing=false;stop();current=duration;slider.value=String(current);});}
   function update(){if(!playing)return;current=position(player.getCurrentTime());slider.value=String(current);frame=requestAnimationFrame(update);}
   // rrweb 仅同步应用严格早于偏移的事件；增加 1ms 使精确事件时间与首帧边界都包含在内。
   function seek(value){playing=false;stop();const requested=position(value);player?.destroy();construct();player.pause(Math.max(requested,snapshotOffset)+1);current=requested;slider.value=String(current);}

   play.onclick=()=>{stop();current=position(Number(slider.value));if(current>=duration)seek(0);playing=true;player.play(Math.max(current,snapshotOffset));update();};
   pause.onclick=()=>{player.pause();playing=false;stop();current=position(player.getCurrentTime());slider.value=String(current);};
   slider.oninput=()=>seek(Number(slider.value));
   window.addEventListener('pagehide',()=>{playing=false;stop();player.destroy();},{once:true});
   seek(0);
  }catch{text('p',m.unavailable,replay);}
 }
 const block=section(m.evidence);const filter=document.createElement('select');block.append(filter);const all=text('option',m.all,filter);all.value='';
 for(const kind of [...new Set(evidence.map(item=>item.kind))]){const option=text('option',kind,filter);option.value=kind;}
 const request=document.createElement('input');request.placeholder='requestId';request.setAttribute('aria-label','requestId');block.append(request);
 const output=text('pre','',block);const previous=text('button',m.previous,block);const next=text('button',m.next,block);const counter=text('span','',block);let page=1;
 function render(){const rows=evidence.filter(item=>(!filter.value||item.kind===filter.value)&&(!request.value||item.requestId===request.value));const pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages);output.textContent=JSON.stringify(rows.slice((page-1)*20,page*20),null,2);counter.textContent=' '+page+' / '+pages+' ('+rows.length+')';previous.disabled=page<=1;next.disabled=page>=pages;}
 filter.onchange=()=>{page=1;render();};request.oninput=()=>{page=1;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};render();
 text('pre',JSON.stringify(history,null,2),section(m.history));text('pre',manifest.missing.join('\\n')||'—',section(m.missing));
} catch {text('p',m.error,document.querySelector('main'));}
`

/**
 * 包内可信查看器资源，CLI 从内置资源提供代码，绝不执行导入包自带的任意脚本。
 * @example 模块内部上下文
 * ```ts
 * const html = feedbackViewerFiles()['viewer/index.html']
 * const source: string = new TextDecoder().decode(html)
 * ```
 */
export function feedbackViewerFiles(): Record<string, Uint8Array> {
  return {
    'viewer/index.html': strToU8(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-src 'self' about: blob:; font-src 'self' data:; base-uri 'none'; form-action 'none'"><title>Feedback</title><link rel="stylesheet" href="style.css"></head><body><header></header><main></main><script type="module" src="app.js"></script></body></html>`),
    'viewer/style.css': strToU8('body{font:15px system-ui,sans-serif;line-height:1.6;margin:0;background:#f5f6f8;color:#172033}header,main{max-width:1080px;margin:auto;padding:24px}section{background:white;padding:24px;margin-bottom:20px;border:1px solid #dce1e8;border-radius:12px}h1{font-size:26px}h2{font-size:19px;margin-top:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,monospace}img{max-width:100%;height:auto;border:1px solid #dce1e8}figure{margin:16px 0}input,select,button{font:inherit;padding:8px;margin:4px;border:1px solid #ccd2dc;border-radius:6px}button{cursor:pointer}a{display:block;color:#215dc0}'),
    'viewer/app.js': strToU8(VIEWER_SCRIPT),
    'viewer/replay.js': strToU8(typeof __FEEDBACK_REPLAY_SCRIPT__ === 'string' ? __FEEDBACK_REPLAY_SCRIPT__ : '/* Replay is available in built package artifacts. */'),
  }
}
