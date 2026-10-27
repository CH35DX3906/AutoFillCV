import {groups,blankProfile,parseResume,flattenProfile} from './lib/profile.js';
import {extractPdf} from './lib/pdf.js';
import {loadTemplates,saveTemplate,selectTemplate,parseBackup,restoreTemplates} from './lib/templates.js';
const $ = id => document.getElementById(id);
let profile = blankProfile(), busy=false, dirty=false;
let state, currentId, rawTexts={};
function lock(value) {busy=value;for(const el of document.querySelectorAll('button,input,textarea,select'))el.disabled=value;}
function renderTemplates() {
  $('template-select').replaceChildren();
  for(const item of state.templates){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;$('template-select').append(option);}
  $('template-select').value=currentId;
  $('template-name').value=state.templates.find(item=>item.id===currentId).name;
}
async function saveCurrent() {
  const saved=await saveTemplate(currentId,{name:$('template-name').value,profile:readForm()});
  state.templates[state.templates.findIndex(item=>item.id===currentId)]=saved;
  profile=saved.profile;dirty=false;renderTemplates();
  $('save-status').textContent=`已保存「${saved.name}」 · `+new Date().toLocaleTimeString('zh-CN');
}
$('template-name').addEventListener('input',()=>{markDirty();});
$('template-select').onchange=async event=>{
  const nextId=event.target.value;
  if(busy){event.target.value=currentId;return;}
  lock(true);
  try {
    if(dirty)await saveCurrent();
    const latest=await loadTemplates();
    await selectTemplate(nextId);
    rawTexts[currentId]=$('raw-text').value;
    state=latest;currentId=nextId;profile=state.templates.find(item=>item.id===currentId).profile;
    dirty=false;renderTemplates();render();$('raw-text').value=rawTexts[currentId] || '';
    status('import-status','');status('manage-status','');$('save-status').textContent='已切换到「'+$('template-name').value+'」';
  }catch(error){$('template-select').value=currentId;status('save-status','切换失败，当前资料已保留。'+error.message,true);}
  finally{lock(false);}
};
function status(id,text,error=false) {$(id).textContent=text; $(id).classList.toggle('error',error);}
function readForm() {
  const result=blankProfile();
  for (const group of groups) {
    if (group.repeat) result[group.repeat] = [];
    const section=$('section-'+groups.indexOf(group));
    for (const record of section.querySelectorAll('.record')) {
      const item={}; for (const input of record.querySelectorAll('[data-key]')) item[input.dataset.key]=input.value.trim();
      if (group.repeat) result[group.repeat].push(item); else Object.assign(result,item);
    }
  }
  return result;
}
function render() {
  $('sections').replaceChildren();
  groups.forEach((group,index) => {
    const section=document.createElement('section'); section.className='card'; section.id='section-'+index;
    const head=document.createElement('div'); head.className='card-head';
    const title=document.createElement('h2'); title.textContent=group.title; head.append(title);
    if (group.repeat) {
      const add=document.createElement('button'); add.type='button'; add.textContent='＋ 添加一条';
      add.onclick=()=>{profile=readForm(); profile[group.repeat].push({}); render(); markDirty();}; head.append(add);
    }
    section.append(head);
    const records=group.repeat ? profile[group.repeat] : [profile];
    records.forEach((item,recordIndex)=>{
      const record=document.createElement('div'); record.className='record';
      if (group.repeat) {
        const bar=document.createElement('div'); bar.className='record-header'; const name=document.createElement('span'); name.className='muted'; name.textContent=`第 ${recordIndex+1} 条`;
        const remove=document.createElement('button'); remove.type='button'; remove.textContent='删除'; remove.className='danger';
        remove.onclick=()=>{profile=readForm(); profile[group.repeat].splice(recordIndex,1); render(); markDirty();}; bar.append(name,remove); record.append(bar);
      }
      const grid=document.createElement('div'); grid.className='grid';
      group.fields.forEach(([key,label])=>{
        const wrapper=document.createElement('label'); wrapper.className='field'; wrapper.textContent=label;
        const multiline=['description','achievements','overseas','research','courses','studentLeadership','summary','skills','awards','languages'].includes(key);
        const input=document.createElement(multiline?'textarea':'input'); input.dataset.key=key; input.value=item[key] || '';
        if (multiline) {wrapper.classList.add('wide'); input.rows=4;}
        else {input.type='text'; input.autocomplete='off';}
        if (['birthday','start','end'].includes(key)) input.placeholder='例如 2026-07-01（年月也可手动填写）';
        wrapper.append(input); grid.append(wrapper);
      }); record.append(grid); section.append(record);
    }); $('sections').append(section);
  });
}
function markDirty(){dirty=true; $('save-status').textContent='有未保存的修改';}
$('profile-form').addEventListener('input',markDirty);
$('profile-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;lock(true);
  try {await saveCurrent();}
  catch {status('save-status','保存失败，请重试。',true);}
  finally{lock(false);}
};
function mergeParsed(text) {
  profile=readForm(); const parsed=parseResume(text); let added=0;
  for (const group of groups) {
    const target=group.repeat ? (profile[group.repeat][0] ||= {}) : profile;
    const source=group.repeat ? parsed[group.repeat][0] : parsed;
    for (const [key] of group.fields) if (!target[key] && source[key]) {target[key]=source[key]; added++;}
  }
  render(); markDirty();
  status('import-status',`已提取文字，补充 ${added} 个空白字段。请核对下方资料，并手动补充教育、实习、工作和项目经历后保存。`);
}
async function importPdf(file) {
  if (!file || busy) return;
  if (file.size>12*1024*1024) {status('import-status','请选择 12 MB 以内的 PDF。',true);return;}
  lock(true);
  status('import-status','正在本地读取 PDF，请稍候……');
  try {const text=await extractPdf(await file.arrayBuffer()); $('raw-text').value=text; mergeParsed(text);}
  catch(error) {status('import-status',error.message,true);}
  finally {lock(false); $('pdf').value='';}
}
$('pdf').onchange=event=>importPdf(event.target.files[0]);
$('drop').ondragover=event=>{event.preventDefault(); $('drop').classList.add('drag');};
$('drop').ondragleave=()=> $('drop').classList.remove('drag');
$('drop').ondrop=event=>{event.preventDefault(); $('drop').classList.remove('drag'); importPdf(event.dataTransfer.files[0]);};
$('parse-text').onclick=()=>{const text=$('raw-text').value.trim(); if(text.length<10) status('import-status','请先粘贴完整的简历文字。',true); else mergeParsed(text);};
$('export').onclick=async()=>{
  lock(true);
  try {
    const latest=await loadTemplates();
    const templates=latest.templates.map(item=>item.id===currentId?{...item,name:$('template-name').value.trim() || `简历 ${latest.templates.indexOf(item)+1}`,profile:readForm()}:item);
    const blob=new Blob([JSON.stringify({version:2,templates,activeTemplateId:currentId},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), anchor=document.createElement('a'); anchor.href=url;anchor.download='AutoFillCV-简历备份.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){status('manage-status','导出失败：'+error.message,true);}
  finally{lock(false);}
};
$('restore').onclick=()=> $('restore-file').click();
$('restore-file').onchange=async event=>{
  const file=event.target.files[0]; if(!file)return;
  lock(true);
  try {
    if(file.size>8*1024*1024)throw new Error('备份文件不能超过 8 MB。');
    const clean=parseBackup(JSON.parse(await file.text()),currentId);
    if(clean.legacyProfile){
      if(!confirm('这是旧版单份备份，将替换当前模板的编辑内容，是否继续？'))return;
      profile=clean.legacyProfile;render();markDirty();status('manage-status','已恢复到当前模板，请核对后保存。');
    }else{
      if(!confirm('恢复备份将替换全部三份简历及未保存内容，是否继续？'))return;
      state=await restoreTemplates(clean);currentId=state.activeTemplateId;profile=state.templates.find(item=>item.id===currentId).profile;
      dirty=false;rawTexts={};renderTemplates();render();status('manage-status','全部三份简历已恢复并保存。');$('save-status').textContent='已恢复备份';
    }
    $('raw-text').value='';status('import-status','');
  }catch(error){status('manage-status',error.message,true);}finally{event.target.value='';lock(false);}
};
$('clear').onclick=async()=>{
  if(!confirm('确定清空全部三份简历？此操作无法撤销。'))return;
  lock(true);
  try {await chrome.storage.local.clear();state=await loadTemplates();currentId=state.activeTemplateId;profile=blankProfile();rawTexts={};renderTemplates();render();$('raw-text').value='';dirty=false;status('import-status','');status('manage-status','全部三份简历已清空。');$('save-status').textContent='资料已清空';}
  catch{status('manage-status','清空失败，请重试。',true);}
  finally{lock(false);}
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
lock(true);
try {state=await loadTemplates();currentId=state.activeTemplateId;profile=state.templates.find(item=>item.id===currentId).profile;renderTemplates();render();lock(false);$('save-status').textContent=flattenProfile(profile).length?'已载入本地资料':'当前模板尚未保存资料';}
catch {render();status('import-status','读取本地资料失败，请刷新页面。',true);}
