import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProfile,flattenProfile,parseResume} from '../extension/lib/profile.js';
import {loadTemplates,saveTemplate,parseBackup,restoreTemplates,templateKey} from '../extension/lib/templates.js';
await import('../extension/lib/matcher.js');
const {matchField}=globalThis.AutoFillMatcher;

test('实习与工作按分组和条目分别匹配，工作描述兼容工作内容',()=>{
  const fields=flattenProfile({...blankProfile(),internships:[{company:'实习公司',description:'实习内容',salary:'200/天'},{company:'第二家实习公司'}],experience:[{company:'工作公司',description:'工作内容',salary:'10000'}]});
  assert.equal(matchField('公司名称',fields,'实习经历'),'internships.0.company');
  assert.equal(matchField('公司名称',fields,'实习经历',1),'internships.1.company');
  assert.equal(matchField('公司名称',fields,'工作经历'),'experience.0.company');
  assert.equal(matchField('工作描述',fields,'实习经历'),'internships.0.description');
  assert.equal(matchField('工作描述',fields,'工作经历'),'experience.0.description');
  assert.equal(matchField('薪资',fields,'实习经历'),'internships.0.salary');
  assert.equal(matchField('薪资',fields,'工作经历'),'experience.0.salary');
  assert.equal(matchField('薪资',fields,''),'');
  assert.equal(matchField('期望薪资',fields,'工作经历'),'');
  assert.equal(matchField('公司名称',fields,'实习 / 工作经历'),'');
  assert.equal(matchField('工作内容',fields,'项目经历'),'');
});
test('学历与学位、个人与学校城市、英文名均独立匹配',()=>{
  const fields=flattenProfile({name:'张三',englishName:'Sam',city:'上海',targetCity:'深圳',education:[{degree:'本科',academicDegree:'学士',school:'北京大学',schoolCity:'北京'}],experience:[{location:'杭州'}]});
  for (const [label,context,key] of [['英文名','基本信息','englishName'],['学历','教育背景','education.0.degree'],['学位','教育背景','education.0.academicDegree'],['degree','教育背景','education.0.academicDegree'],['学校城市','教育背景','education.0.schoolCity'],['现居城市','基本信息','city'],['意向城市','求职意向','targetCity'],['工作地点','工作经历','experience.0.location']]) assert.equal(matchField(label,fields,context),key);
  const partial=flattenProfile({name:'张三',education:[{degree:'本科',school:'北京大学'}]});
  assert.equal(matchField('学位',partial,'教育背景'),'');
  assert.equal(matchField('英文名',partial,'基本信息'),'');
  assert.equal(matchField('学校城市',partial,'教育背景'),'');
  assert.equal(matchField('项目名称',partial,'项目经历'),'');
});
test('新增教育与联系字段、独立成果支持自动匹配',()=>{
  const fields=flattenProfile({ethnicity:'汉族',wechat:'sam123',maritalStatus:'未婚',education:[{overseas:'交换一学期',college:'计算机学院',research:'机器学习',courses:'算法',studentLeadership:'班长'}],internships:[{role:'开发',department:'研发',workType:'实习',industry:'互联网',achievements:'上线系统'}],experience:[{achievements:'提升效率'}],projects:[{role:'负责人',achievements:'交付项目'}],summary:'认真负责'});
  for (const [label,context,key] of [['民族','基本信息','ethnicity'],['微信号','基本信息','wechat'],['婚姻状况','基本信息','maritalStatus'],['海外经历','教育背景','education.0.overseas'],['学院','教育背景','education.0.college'],['研究方向','教育背景','education.0.research'],['主修课程','教育背景','education.0.courses'],['学生干部经历','教育背景','education.0.studentLeadership'],['职位','实习经历','internships.0.role'],['所在部门','实习经历','internships.0.department'],['工作类型','实习经历','internships.0.workType'],['所属行业','实习经历','internships.0.industry'],['工作成果','实习经历','internships.0.achievements'],['工作成果','工作经历','experience.0.achievements'],['项目角色','项目经历','projects.0.role'],['项目成果','项目经历','projects.0.achievements'],['自我评价','自我评价','summary']]) assert.equal(matchField(label,fields,context),key);
  assert.equal(matchField('工作成果',fields,'项目经历'),'');
  assert.equal(matchField('项目成果',fields,'工作经历'),'');
});
test('明确标注的新增个人信息可从原文提取',()=>{
  const parsed=parseResume('张三\n英文名：Sam Zhang\n性别：男\n民族：汉族\n微信号：sam123\n婚姻状况：未婚');
  const education=parseResume('张三\n北京大学 本科 工学学士');
  assert.equal(education.education[0].degree,'本科');assert.equal(education.education[0].academicDegree,'学士');
  assert.equal(parsed.englishName,'Sam Zhang');assert.equal(parsed.gender,'男');assert.equal(parsed.ethnicity,'汉族');assert.equal(parsed.wechat,'sam123');assert.equal(parsed.maritalStatus,'未婚');
});
function memoryStorage(initial={}) {
  const data=structuredClone(initial);
  return {data,async get(keys){return structuredClone(Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,data[key]])));},async set(values){Object.assign(data,structuredClone(values));},async remove(keys){for(const key of keys)delete data[key];}};
}
test('已保存旧模板及旧备份补齐实习列表并保留原有经历与课程',async()=>{
  const old={name:'张三',education:[{degree:'本科',description:'课程及荣誉原文'}],experience:[{company:'原公司',description:'原内容'}],projects:[{}]};
  const db=memoryStorage({[templateKey('resume-1')]:{name:'旧模板',profile:old}});
  const state=await loadTemplates(db), p=state.templates[0].profile;
  assert.deepEqual(p.internships,[{}]);assert.equal(p.education[0].courses,'课程及荣誉原文');assert.deepEqual(p.experience,old.experience);
  await saveTemplate('resume-1',{name:'旧模板',profile:p},db);
  const restored=parseBackup({version:1,profile:old},'resume-1').legacyProfile;
  assert.equal(restored.education[0].courses,'课程及荣誉原文');assert.equal(restored.experience[0].company,'原公司');assert.equal(restored.experience[0].description,'原内容');assert.equal(restored.internships.length,1);
  assert.equal((await loadTemplates(db)).templates[0].profile.education[0].courses,'课程及荣誉原文');
});
test('新字段和独立经历通过保存及三模板备份往返保留',async()=>{
  const p={...blankProfile(),englishName:'Sam',wechat:'sam123',summary:'评价',education:[{degree:'本科',academicDegree:'学士',courses:'算法',studentLeadership:'班长'}],internships:[{company:'实习公司',salary:'200',achievements:'成果一'},{company:'第二家实习'}],experience:[{company:'工作公司',department:'研发',achievements:'成果二'}],projects:[{name:'项目',achievements:'成果三'}]};
  const db=memoryStorage();await saveTemplate('resume-2',{name:'新版',profile:p},db);
  const state=await loadTemplates(db), target=memoryStorage();
  await restoreTemplates(parseBackup(JSON.parse(JSON.stringify({version:2,...state})),'resume-1'),target);
  assert.deepEqual(flattenProfile((await loadTemplates(target)).templates[1].profile),flattenProfile(p));
  const invalid={...p,internships:'bad'};
  await assert.rejects(()=>saveTemplate('resume-2',{name:'错误',profile:invalid},db),/列表/);
  assert.equal((await loadTemplates(db)).templates[1].name,'新版');
});
