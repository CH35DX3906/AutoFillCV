import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {parseResume,flattenProfile} from '../extension/lib/profile.js';
import {extractPdf} from '../extension/lib/pdf.js';
import './templates.test.js';
import './schema.test.js';
await import('../extension/lib/matcher.js');
const {matchField}=globalThis.AutoFillMatcher;
test('中文简历提取联系信息，不编造经历',()=>{
  const p=parseResume('张三\n手机：138 1234 5678\n邮箱：test@example.com\n现居城市：上海\n上海交通大学 本科\n专业技能\nJavaScript、Python\n自我评价\n善于合作');
  assert.equal(p.name,'张三');assert.equal(p.phone,'13812345678');assert.equal(p.email,'test@example.com');
  assert.equal(p.city,'上海');assert.equal(p.education[0].school,'上海交通大学');assert.equal(p.education[0].degree,'本科');
  assert.equal(p.skills,'JavaScript、Python');assert.equal(p.summary,'善于合作');assert.deepEqual(p.experience,[{}]);
});
test('多条经历有稳定键，空白资料被排除',()=>{
  const fields=flattenProfile({name:'张三',education:[{school:'A'},{school:'B'}],projects:[{name:'项目一'}]});
  assert.equal(fields.length,4);assert.equal(fields[2].key,'education.1.school');
  assert.equal(matchField('项目名称',fields,'项目经历'),'projects.0.name');
  assert.equal(matchField('学校名称',fields,'教育背景',1),'education.1.school');
  assert.equal(matchField('紧急联系人姓名',fields),'');assert.equal(matchField('验证码',fields),'');
  assert.equal(matchField('姓名',fields,'紧急联系人'),'');
});
test('相似日期和描述只在明确的经历分组中自动匹配',()=>{
  const fields=flattenProfile({education:[{start:'2022-09-01',description:'课程'}],internships:[{start:'2025-07-01',description:'实习'}]});
  assert.equal(matchField('开始日期',fields,'实习经历'),'internships.0.start');
  assert.equal(matchField('开始日期',fields,''),'');assert.equal(matchField('工作内容',fields,'实习经历'),'internships.0.description');
});
const object=(id,body)=>`${id} 0 obj\n${body}\nendobj\n`;
function stream(body,compress=false,dict=''){
  const data=compress?deflateSync(Buffer.from(body,'latin1')):Buffer.from(body,'latin1');
  return `<< /Length ${data.length} ${compress?'/Filter /FlateDecode':''} ${dict} >>\nstream\n${data.toString('latin1')}\nendstream`;
}
function pdf(content,extra='',compressed=false){
  return Buffer.from('%PDF-1.7\n'+object(1,'<< /Type /Page /Resources << /Font << /F1 3 0 R >> >> /Contents 2 0 R >>')+object(2,stream(content,compressed))+object(3,'<< /Type /Font /Subtype /Type0 /ToUnicode 4 0 R >>')+object(4,stream(extra))+'%%EOF','latin1');
}
const buffer=value=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
test('提取普通 PDF、转义字符与压缩文字流',async()=>{
  const data=pdf('BT /F2 12 Tf (Hello \\(resume\\) test@example.com) Tj ET','',true);
  assert.equal(await extractPdf(buffer(data)),'Hello (resume) test@example.com');
});
test('中文 ToUnicode 的 bfchar、bfrange 与 TJ 数组',async()=>{
  const map='2 beginbfchar\n<0001> <5F20>\n<0002> <4E09>\nendbfchar\n1 beginbfrange\n<0003> <0005> [<7B80> <5386> <8868>]\nendbfrange';
  const data=pdf('BT /F1 12 Tf [<00010002> -20 <000300040005>] TJ /F2 10 Tf ( test@example.com) Tj ET',map,true);
  assert.equal(await extractPdf(buffer(data)),'张三简历表 test@example.com');
});
test('拒绝非 PDF、加密 PDF、图片型 PDF',async()=>{
  await assert.rejects(()=>extractPdf(buffer(Buffer.from('not pdf'))),/有效/);
  await assert.rejects(()=>extractPdf(buffer(Buffer.from('%PDF-1.7 /Encrypt 1 0 R'))),/加密/);
  await assert.rejects(()=>extractPdf(buffer(pdf(''))),/OCR/);
});
test('字体资源与字体字典支持间接引用和父级继承',async()=>{
  const data=Buffer.from('%PDF-1.7\n'+object(1,'<< /Type /Page /Parent 5 0 R /Contents 2 0 R >>')+object(2,stream('BT /F1 12 Tf <0001> Tj /F2 12 Tf ( test@example.com) Tj ET'))+object(3,'<< /ToUnicode 4 0 R >>')+object(4,stream('1 beginbfchar <0001> <4F60> endbfchar'))+object(5,'<< /Type /Pages /Resources 6 0 R >>')+object(6,'<< /Font 7 0 R >>')+object(7,'<< /F1 3 0 R >>'),'latin1');
  assert.equal(await extractPdf(buffer(data)),'你 test@example.com');
});
test('从压缩对象流读取字体资源',async()=>{
  const dictionary='<< /Font << /F1 3 0 R >> >>';
  const data=Buffer.from('%PDF-1.7\n'+object(1,'<< /Type /Page /Resources 6 0 R /Contents 2 0 R >>')+object(2,stream('BT /F1 12 Tf <0001> Tj /F2 12 Tf ( test@example.com) Tj ET',true))+object(3,'<< /ToUnicode 4 0 R >>')+object(4,stream('1 beginbfchar <0001> <4F60> endbfchar'))+object(5,stream('6 0 '+dictionary,true,'/Type /ObjStm /N 1 /First 4')),'latin1');
  assert.equal(await extractPdf(buffer(data)),'你 test@example.com');
});
test('填写保留已有值、触发事件，撤销保留用户后续修改',()=>{
  class Input {
    constructor(label,value='',type='text'){this.label=label;this._value=value;this.type=type;this.tagName='INPUT';this.isConnected=true;this.labels=[{textContent:label}];this.events=[];this.maxLength=-1;}
    get value(){return this._value;}set value(v){this._value=v;}
    getRootNode(){return {getElementById:()=>null};}getAttribute(){return null;}closest(){return null;}getClientRects(){return [1];}
    dispatchEvent(event){this.events.push(event.type);}
  }
  const inputs=[new Input('姓名'),new Input('手机号码','13800000000'),new Input('密码','','password'),new Input('验证码')];
  const context={HTMLInputElement:Input,HTMLSelectElement:Input,HTMLTextAreaElement:Input,Event:class {constructor(type){this.type=type;}},AutoFillMatcher:globalThis.AutoFillMatcher,getComputedStyle:()=>({visibility:'visible'}),
    document:{querySelectorAll:selector=>selector==='*'?[]:inputs}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../extension/content.js',import.meta.url),'utf8'),context);
  const api=context.AutoFillCV;const candidates=flattenProfile({name:'张三',phone:'13911111111'});
  const rows=api.scan(candidates);assert.equal(rows.length,3);assert.equal(rows[2].key,'');
  const assignments=rows.filter(x=>x.key).map(x=>({...x,value:candidates.find(c=>c.key===x.key).value}));
  const result=api.fill(assignments,false);assert.equal(result.filled,1);assert.equal(result.skipped,1);assert.deepEqual(inputs[0].events,['input','change']);
  assert.equal(inputs[0].value,'张三');assert.equal(inputs[1].value,'13800000000');assert.equal(api.undo().restored,1);assert.equal(inputs[0].value,'');
  api.fill(assignments,true);inputs[0].value='手动修改';const undo=api.undo();assert.equal(undo.restored,1);assert.equal(undo.skipped,1);assert.equal(inputs[0].value,'手动修改');assert.equal(inputs[1].value,'13800000000');
});
