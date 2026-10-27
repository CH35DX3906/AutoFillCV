(() => {
  if (globalThis.AutoFillCV) return;
  let fields = new Map(), lastFill = [];
  function elements(root = document) {
    const result = [...root.querySelectorAll('input,textarea,select')];
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) result.push(...elements(node.shadowRoot));
    return result;
  }
  function labelFor(el) {
    const root = el.getRootNode();
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => root.getElementById?.(id)?.textContent || '').join(' ').trim();
    const labels = [...(el.labels || [])].map(x => x.textContent).join(' ');
    const direct = el.getAttribute('aria-label') || labelledBy || labels;
    const parent = el.closest('.form-item,.form-group,.el-form-item,.ant-form-item,.field');
    const contextual = parent?.querySelector('label,.el-form-item__label,.ant-form-item-label')?.textContent;
    return (direct || contextual || el.placeholder || el.name || el.id || '').replace(/[*：:\s]+/g,' ').trim().slice(0,160);
  }
  function contextFor(el) {
    let result = '', parent = el.parentElement;
    for (let i=0; parent && i<6; i++,parent=parent.parentElement) {
      if (parent === document.body) break;
      const title = parent.querySelector('legend,h2,h3,h4,[class*="section-title"]');
      if (title) {result = title.textContent.trim().slice(0,120); break;}
    }
    return result;
  }
  function eligible(el) {
    return !el.disabled && !el.readOnly && !['hidden','password','file','submit','button','reset','checkbox','radio','range','color'].includes(el.type)
      && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
  }
  function setValue(el,value) {
    const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
    el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  }
  function normalize(value) {return String(value).trim().toLowerCase().replace(/\s+/g,'');}
  globalThis.AutoFillCV = {
    scan(candidates) {
      fields = new Map(); const seen = new Map();
      return elements().filter(eligible).slice(0,250).map((el,index) => {
        const id = String(index), label = labelFor(el), context = contextFor(el);
        fields.set(id,el);
        const signature = label + '|' + context, occurrence = seen.get(signature) || 0;
        seen.set(signature,occurrence+1);
        return {id,label:label || '未命名字段',context,type:el.type,hasValue:!!el.value,
          key:AutoFillMatcher.matchField(label,candidates,context,occurrence)};
      });
    },
    fill(assignments, overwrite) {
      const result = {filled:0, skipped:0, failed:[], unchanged:0}; const changes = [];
      for (const item of assignments) {
        const el = fields.get(item.id);
        if (!el?.isConnected || !eligible(el)) {result.failed.push(`${item.label}：页面已变化，请重新扫描`); continue;}
        if (el.value && !overwrite) {result.skipped++; continue;}
        let value = item.value;
        if (el.tagName === 'SELECT') {
          const option = [...el.options].find(x => !x.disabled && x.value && (normalize(x.text) === normalize(value) || normalize(x.value) === normalize(value)));
          if (!option) {result.failed.push(`${item.label}：没有完全匹配的下拉选项`); continue;}
          value = option.value;
        }
        if (el.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {result.failed.push(`${item.label}：需要 YYYY-MM-DD 日期`); continue;}
        if (el.type === 'month') value = value.replace(/[./年]/g,'-').replace(/月$/,'').slice(0,7);
        if (['date','month','number','email','url'].includes(el.type)) {
          const probe = document.createElement('input'); probe.type = el.type; probe.value = value;
          if (!probe.value || !probe.checkValidity()) {result.failed.push(`${item.label}：格式不符合网页要求`); continue;}
        }
        if (el.maxLength > 0 && value.length > el.maxLength) {result.failed.push(`${item.label}：超过网页字数限制`); continue;}
        const before = el.value;
        if (before === value) {result.unchanged++; continue;}
        setValue(el,value);
        if (el.value !== value) {setValue(el,before); result.failed.push(`${item.label}：网页拒绝了该值`); continue;}
        changes.push({el,before,after:value}); result.filled++;
      }
      if (changes.length) lastFill = changes;
      return result;
    },
    undo() {
      let restored=0, skipped=0;
      for (const change of lastFill) {
        if (!change.el.isConnected || change.el.value !== change.after) {skipped++; continue;}
        setValue(change.el,change.before); restored++;
      }
      lastFill = []; return {restored,skipped};
    }
  };
})();
