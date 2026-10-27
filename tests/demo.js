import {groups} from '../extension/lib/profile.js';
const container=document.getElementById('demo-sections');
for (const group of groups) {
  const section=document.createElement('section');section.className='card';
  const title=document.createElement('h2');title.textContent=group.title;section.append(title);
  const grid=document.createElement('div');grid.className='grid';
  for (const [key,label] of group.fields) {
    const wrapper=document.createElement('label');wrapper.className='field';wrapper.textContent=label;
    const multiline=['description','achievements','overseas','research','courses','studentLeadership','summary','skills','awards','languages'].includes(key);
    const input=document.createElement(multiline?'textarea':'input');input.name=group.repeat?`${group.repeat}.${key}`:key;
    if(multiline)wrapper.classList.add('wide');
    if(key==='position')input.value='这是已有内容，默认保留';
    if(key==='email')input.type='email';
    if(['birthday','start','end'].includes(key))input.type='date';
    wrapper.append(input);grid.append(wrapper);
  }
  section.append(grid);container.append(section);
}
const security=document.createElement('section');security.className='card';
security.innerHTML='<h2>其他字段</h2><label class="field">验证码<input name="captcha"></label><label class="field">密码<input type="password"></label><label class="field">不可编辑<input readonly value="不可修改"></label>';
container.append(security);
document.getElementById('application').addEventListener('submit',event=>{event.preventDefault();document.getElementById('submitted').hidden=false;});
