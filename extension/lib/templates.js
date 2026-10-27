import {blankProfile,groups,migrateProfile} from './profile.js';

export const templateIds = ['resume-1','resume-2','resume-3'];
export const templateKey = id => `template:${id}`;
export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('简历资料格式不正确。');
  value=migrateProfile(value);
  const clean=blankProfile();
  for (const group of groups) {
    const records=group.repeat?value[group.repeat]:[value];
    if (group.repeat === 'education' && Array.isArray(records)) {
      for (const item of records) if (item?.description != null && (typeof item.description !== 'string' || item.description.length > 50000)) throw new Error('备份字段无效或过长。');
    }
    if (!Array.isArray(records) || records.length>50) throw new Error('备份中的经历列表不正确。');
    const validated=records.map(item=>{
      if (!item || typeof item!=='object' || Array.isArray(item)) throw new Error('备份条目无效。');
      const record={};
      for (const [key] of group.fields) {
        if (item[key]!=null && (typeof item[key]!=='string' || item[key].length>50000)) throw new Error('备份字段无效或过长。');
        record[key]=item[key] || '';
      }
      return record;
    });
    if(group.repeat) clean[group.repeat]=validated; else Object.assign(clean,validated[0]);
  }
  return clean;
}
function validId(id) {if(!templateIds.includes(id))throw new Error('简历模板不存在。');return id;}
function cleanName(name,index) {
  if(typeof name!=='string' || name.length>40)throw new Error('模板名称应为 40 字以内的文字。');
  return name.trim() || `简历 ${index+1}`;
}
export async function loadTemplates(storage=chrome.storage.local) {
  const saved=await storage.get([...templateIds.map(templateKey),'activeTemplateId','profile','updatedAt']);
  // Migrate only when slot 1 is absent. Write first; remove legacy data only after success.
  if(!saved[templateKey(templateIds[0])] && saved.profile) {
    saved[templateKey(templateIds[0])]={name:'简历 1',profile:migrateProfile(saved.profile),updatedAt:saved.updatedAt || null};
    await storage.set({[templateKey(templateIds[0])]:saved[templateKey(templateIds[0])]});
    await storage.remove(['profile','updatedAt']);
  }
  return {activeTemplateId:templateIds.includes(saved.activeTemplateId)?saved.activeTemplateId:templateIds[0],
    templates:templateIds.map((id,index)=>({id,name:`简历 ${index+1}`,...saved[templateKey(id)],profile:migrateProfile(saved[templateKey(id)]?.profile)}))};
}
export async function saveTemplate(id,template,storage=chrome.storage.local) {
  validId(id);
  const record={name:cleanName(template.name,templateIds.indexOf(id)),profile:validateProfile(template.profile),updatedAt:new Date().toISOString()};
  await storage.set({[templateKey(id)]:record});
  return {id,...record};
}
export async function selectTemplate(id,storage=chrome.storage.local) {
  await storage.set({activeTemplateId:validId(id)});
}
export function parseBackup(data,currentId) {
  if(data?.version===1) return {legacyProfile:validateProfile(data.profile)};
  if(data?.version!==2 || !Array.isArray(data.templates) || data.templates.length!==3)throw new Error('备份格式不正确，需要三个简历模板。');
  const templates=templateIds.map((id,index)=>{
    const item=data.templates[index];
    if(!item || item.id!==id)throw new Error('备份模板编号不正确。');
    return {id,name:cleanName(item.name,index),profile:validateProfile(item.profile),updatedAt:item.updatedAt || null};
  });
  return {templates,activeTemplateId:templateIds.includes(data.activeTemplateId)?data.activeTemplateId:validId(currentId)};
}
export async function restoreTemplates(state,storage=chrome.storage.local) {
  const clean=parseBackup({version:2,...state},templateIds[0]);
  const values={activeTemplateId:clean.activeTemplateId};
  for(const template of clean.templates){const {id,...record}=template;values[templateKey(id)]=record;}
  await storage.set(values);
  await storage.remove(['profile','updatedAt']);
  return clean;
}
