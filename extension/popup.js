import {flattenProfile} from './lib/profile.js';
import {loadTemplates,selectTemplate} from './lib/templates.js';
const $=id=>document.getElementById(id);
let candidates=[], tabId=null, rows=[];
let state, snapshot='';
function renderTemplates() {
  $('template-select').replaceChildren();
  for(const item of state.templates){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;$('template-select').append(option);}
  $('template-select').value=state.activeTemplateId;
  const item=state.templates.find(item=>item.id===state.activeTemplateId);
  candidates=flattenProfile(item.profile);$('count').textContent=candidates.length;
  $('profile-name').textContent=item.profile.name?`${item.profile.name} · ${item.name}`:item.name;
  return item;
}
const fingerprint=state=>JSON.stringify({id:state.activeTemplateId,profile:state.templates.find(item=>item.id===state.activeTemplateId).profile});
function resetPreview() {snapshot='';rows=[];$('preview').hidden=true;$('matches').replaceChildren();}
$('template-select').onchange=async event=>{
  const id=event.target.value;busy(true);resetPreview();
  try{await selectTemplate(id);state=await loadTemplates();const item=renderTemplates();status(`已切换到「${item.name}」，请重新扫描页面。`);}
  catch(error){$('template-select').value=state.activeTemplateId;status('切换失败：'+error.message,true);}
  finally{busy(false);}
};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function busy(value){for(const id of ['scan','fill','undo','template-select'])$(id).disabled=value;}
async function inject(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !/^https?:\/\//.test(tab.url || ''))throw new Error('请先打开 http 或 https 招聘页面。浏览器内部页面、PDF 阅读器及插件自身页面无法填写。');
  tabId=tab.id;
  await chrome.scripting.executeScript({target:{tabId},files:['lib/matcher.js','content.js']});
}
async function invoke(action,args=[]){
  const [result]=await chrome.scripting.executeScript({target:{tabId},func:(name,args)=>globalThis.AutoFillCV[name](...args),args:[action,args]});
  return result.result;
}
$('edit').onclick=()=>chrome.runtime.openOptionsPage();
$('demo').onclick=()=>chrome.tabs.create({url:'http://localhost:8765/tests/demo.html'});
$('scan').onclick=async()=>{
  busy(true);resetPreview();
  try{
    state=await loadTemplates();const item=renderTemplates();snapshot=fingerprint(state);
    if(!candidates.length)throw new Error(`「${item.name}」还没有资料，请先导入 PDF 或编辑并保存。`);
    await inject();rows=await invoke('scan',[candidates]);$('matches').replaceChildren();
    if(!rows.length)throw new Error('当前页面未发现可填写字段。请进入申请表单或下一步后重新扫描；嵌入式表单暂需手动填写。');
    for(const row of rows){
      const wrapper=document.createElement('div');wrapper.className='match-row';
      const label=document.createElement('label');label.htmlFor='map-'+row.id;label.textContent=row.label+(row.hasValue?' · 已有内容':'');wrapper.append(label);
      const select=document.createElement('select');select.id='map-'+row.id;select.dataset.id=row.id;
      const skip=document.createElement('option');skip.value='';skip.textContent='跳过此字段';select.append(skip);
      for(const field of candidates){const option=document.createElement('option');option.value=field.key;option.textContent=field.label;select.append(option);}
      select.value=row.key;const value=document.createElement('small');
      const update=()=>{value.textContent=candidates.find(x=>x.key===select.value)?.value || (row.context?`分组：${row.context}`:'暂未匹配');};select.onchange=update;update();wrapper.append(select,value);$('matches').append(wrapper);
    }
    $('preview').hidden=false;$('match-title').textContent=`发现 ${rows.length} 个字段 · 自动匹配 ${rows.filter(x=>x.key).length} 项`;
    status(`当前使用「${item.name}」，请检查匹配关系后点击填写。`);
  }catch(error){status(error.message?.includes('Cannot access')?'此页面禁止插件访问，请在普通招聘网页重试。':error.message,true);}finally{busy(false);}
};
$('fill').onclick=async()=>{
  busy(true);
  try{
    const latest=await loadTemplates();
    if(!snapshot || fingerprint(latest)!==snapshot){state=latest;renderTemplates();resetPreview();throw new Error('当前简历或资料已变化，请重新扫描后填写。');}
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});if(current?.id!==tabId)throw new Error('当前标签页已变化，请重新扫描。');
    const assignments=[...$('matches').querySelectorAll('select')].filter(x=>x.value).map(select=>({id:select.dataset.id,label:rows.find(x=>x.id===select.dataset.id).label,value:candidates.find(x=>x.key===select.value).value}));
    if(!assignments.length)throw new Error('请至少匹配一个字段。');
    const result=await invoke('fill',[assignments,$('overwrite').checked]);
    status(`已填写 ${result.filled} 项，保留已有内容 ${result.skipped} 项，未变化 ${result.unchanged} 项。${result.failed.length?'\n需手动处理：\n'+result.failed.join('\n'):''}\n请在网页核对后自行提交。`);
  }catch(error){status(error.message || '填写失败，页面可能已刷新。请重新扫描后重试。',true);}finally{busy(false);}
};
$('undo').onclick=async()=>{busy(true);try{await inject();const result=await invoke('undo');status(`已恢复 ${result.restored} 项，跳过 ${result.skipped} 项。你手动修改过的内容会保留。`);}catch(error){status(error.message,true);}finally{busy(false);}};
busy(true);
try{state=await loadTemplates();renderTemplates();busy(false);}catch{status('本地资料读取失败，请重新打开插件。',true);}
