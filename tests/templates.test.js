import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProfile,flattenProfile} from '../extension/lib/profile.js';
import {loadTemplates,saveTemplate,selectTemplate,parseBackup,restoreTemplates,templateKey} from '../extension/lib/templates.js';

function storage(initial={}) {
  const data=structuredClone(initial);
  return {data,async get(keys){return structuredClone(Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,data[key]])));},
    async set(values){Object.assign(data,structuredClone(values));},async remove(keys){for(const key of keys)delete data[key];}};
}
test('初次打开固定提供三个互相独立的空白模板',async()=>{
  const state=await loadTemplates(storage());
  assert.equal(state.templates.length,3);assert.equal(state.activeTemplateId,'resume-1');
  state.templates[0].profile.education[0].school='学校一';
  assert.equal(state.templates[1].profile.education[0].school,undefined);
  assert.equal(state.templates[2].name,'简历 3');
});
test('旧版简历完整迁移到模板一，重复读取不覆盖新版本',async()=>{
  const legacy={...blankProfile(),name:'张三',skills:'Java',projects:[{name:'项目 A'}]};
  const db=storage({profile:legacy,updatedAt:'2026-10-27'});
  const state=await loadTemplates(db);
  assert.deepEqual(state.templates[0].profile,legacy);assert.equal(state.templates[0].updatedAt,'2026-10-27');
  assert.equal(db.data.profile,undefined);assert.equal(flattenProfile(state.templates[1].profile).length,0);
  await saveTemplate('resume-1',{name:'前端版',profile:{...legacy,skills:'TypeScript'}},db);
  db.data.profile=legacy;
  assert.equal((await loadTemplates(db)).templates[0].profile.skills,'TypeScript');
});
test('迁移写入失败时仍保留旧资料',async()=>{
  const db=storage({profile:{...blankProfile(),name:'张三'}});db.set=async()=>{throw new Error('quota');};
  await assert.rejects(()=>loadTemplates(db),/quota/);assert.equal(db.data.profile.name,'张三');
});
test('分别保存三份简历并持久化选择，不互相覆盖',async()=>{
  const db=storage();
  for(const [i,name] of ['前端版','后端版','产品版'].entries())await saveTemplate(`resume-${i+1}`,{name,profile:{...blankProfile(),position:name,experience:[{company:'公司 '+i}]}},db);
  await selectTemplate('resume-3',db);
  await saveTemplate('resume-1',{name:'前端进阶版',profile:{...blankProfile(),position:'高级前端'}},db);
  const state=await loadTemplates(db);
  assert.equal(state.activeTemplateId,'resume-3');assert.equal(state.templates[1].profile.position,'后端版');assert.equal(state.templates[2].profile.experience[0].company,'公司 2');
  assert.equal(state.templates[0].name,'前端进阶版');
  await assert.rejects(()=>selectTemplate('resume-4',db),/不存在/);
});
test('三份模板备份恢复后保留名称、资料与当前选择',async()=>{
  const source=storage();
  await saveTemplate('resume-2',{name:'算法岗',profile:{...blankProfile(),skills:'Python'}},source);await selectTemplate('resume-2',source);
  const backup=JSON.parse(JSON.stringify({version:2,...await loadTemplates(source)}));
  const target=storage({profile:{name:'旧资料'}});
  await restoreTemplates(parseBackup(backup,'resume-1'),target);
  const restored=await loadTemplates(target);
  assert.equal(restored.activeTemplateId,'resume-2');assert.equal(restored.templates[1].name,'算法岗');assert.equal(restored.templates[1].profile.skills,'Python');assert.equal(target.data.profile,undefined);
  assert.equal(target.data[templateKey('resume-3')].name,'简历 3');
});
test('旧备份只解析一份；畸形备份在写入前拒绝',async()=>{
  const legacy=parseBackup({version:1,profile:{...blankProfile(),name:'旧简历'}},'resume-2');
  assert.equal(legacy.legacyProfile.name,'旧简历');assert.equal(legacy.templates,undefined);
  assert.throws(()=>parseBackup({version:2,templates:[]},'resume-1'),/三个/);
  const state=await loadTemplates(storage());state.templates[2].profile.projects='bad';
  const db=storage();await assert.rejects(()=>restoreTemplates(state,db),/列表/);assert.deepEqual(db.data,{});
  state.templates[2].profile=blankProfile();state.templates[1].id='resume-1';
  assert.throws(()=>parseBackup({version:2,...state},'resume-1'),/编号/);
});
test('空名称使用默认名称，非法资料不会影响已保存内容',async()=>{
  const db=storage();await saveTemplate('resume-2',{name:' ',profile:blankProfile()},db);
  assert.equal((await loadTemplates(db)).templates[1].name,'简历 2');
  await assert.rejects(()=>saveTemplate('resume-2',{name:'x'.repeat(41),profile:blankProfile()},db),/40/);
  assert.equal((await loadTemplates(db)).templates[1].name,'简历 2');
});
