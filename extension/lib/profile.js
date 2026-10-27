const employmentFields = [['company','公司名称'],['role','职位'],['department','所在部门'],['workType','工作类型'],['industry','所属行业'],['location','工作地点'],['salary','薪资'],['start','开始时间'],['end','结束时间'],['description','工作内容'],['achievements','工作成果']];
export const groups = [
  {title: '基本信息', fields: [['name','姓名'],['englishName','英文名'],['gender','性别'],['birthday','出生日期'],['ethnicity','民族'],['phone','手机号'],['email','邮箱'],['wechat','微信号'],['hometown','籍贯'],['political','政治面貌'],['maritalStatus','婚姻状况'],['city','现居城市'],['website','个人主页 / GitHub']]},
  {title: '求职意向', fields: [['position','意向岗位'],['targetCity','意向城市'],['availability','可到岗时间']]},
  {title: '教育背景', repeat: 'education', fields: [['school','学校名称'],['major','专业'],['degree','学历'],['academicDegree','学位'],['start','开始时间'],['end','结束（毕业）时间'],['gpa','GPA'],['overseas','海外经历'],['college','学院'],['research','研究方向'],['schoolCity','学校城市'],['courses','主修课程'],['studentLeadership','学生干部经历']]},
  {title: '实习经历', repeat: 'internships', fields: employmentFields},
  {title: '工作经历', repeat: 'experience', fields: employmentFields},
  {title: '项目经历', repeat: 'projects', fields: [['name','项目名称'],['role','项目角色'],['start','开始时间'],['end','结束时间'],['description','项目描述'],['achievements','项目成果']]},
  {title: '自我评价', fields: [['summary','自我评价']]},
  {title: '补充信息', fields: [['skills','专业技能'],['languages','语言能力'],['awards','获奖情况']]}
];
export const blankProfile = () => ({education: [{}], internships: [{}], experience: [{}], projects: [{}]});
// The former combined experience list remains under work history; no category is guessed.
export function migrateProfile(profile) {
  const result = {...blankProfile(), ...profile};
  if (Array.isArray(result.education)) result.education = result.education.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    if (item.description && !item.courses) return {...item, courses:item.description};
    return item;
  });
  return result;
}
export function flattenProfile(profile) {
  profile = migrateProfile(profile);
  const result = [];
  for (const group of groups) {
    const records = group.repeat ? (profile[group.repeat] || []) : [profile];
    records.forEach((record, index) => group.fields.forEach(([key, label]) => {
      const value = String(record[key] || '').trim();
      if (value) result.push({key: group.repeat ? `${group.repeat}.${index}.${key}` : key,
        label: group.repeat ? `${group.title} ${index + 1} · ${label}` : label, value});
    }));
  }
  return result;
}
export function parseResume(text) {
  const profile = blankProfile();
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  profile.email = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
  profile.phone = text.match(/(?<!\d)(?:\+?86[ -]?)?(1[3-9]\d[ -]?\d{4}[ -]?\d{4})(?!\d)/)?.[1].replace(/[ -]/g, '') || '';
  const labeledName = text.match(/姓\s*名\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8})/);
  const firstName = lines.slice(0, 4).find(x => /^[\u4e00-\u9fa5·]{2,5}$/.test(x) && !/简历|教育|经历|信息|求职|技能|背景/.test(x));
  profile.name = labeledName?.[1] || firstName || '';
  profile.website = text.match(/https?:\/\/(?:github\.com|gitee\.com)\/[^\s|｜]+/i)?.[0] || '';
  const labelFields = {city:'现居(?:住地|城市)?|居住地', hometown:'籍贯', political:'政治面貌', position:'意向岗位|求职意向|应聘岗位', targetCity:'意向城市|期望城市', birthday:'出生日期|出生年月', englishName:'英文名(?:称)?|English Name', gender:'性别', ethnicity:'民族', wechat:'微信号|微信', maritalStatus:'婚姻状况'};
  for (const [key, labels] of Object.entries(labelFields)) {
    profile[key] = text.match(new RegExp(`(?:${labels})\\s*[:：]\\s*([^\\n|｜;；]+)`))?.[1].trim() || '';
  }
  const education = lines.find(x => /大学|学院|University|College/i.test(x) && !/大学生|学院奖/.test(x));
  if (education) {
    profile.education[0].school = education.match(/[\u4e00-\u9fa5A-Za-z ·]+?(?:大学|学院|University|College)/i)?.[0].trim() || '';
    profile.education[0].degree = education.match(/博士|硕士|本科|大专/i)?.[0] || '';
    profile.education[0].academicDegree = education.match(/博士学位|硕士学位|学士(?:学位)?|Bachelor|Master|PhD/i)?.[0] || '';
  }
  // Section text is retained verbatim for review; no experiences or qualifications are invented.
  const sections = {skills:/^(?:专业技能|技术技能|技能清单|个人技能|Skills)\s*[:：]?/i, languages:/^(?:语言能力|语言水平)\s*[:：]?/, awards:/^(?:获奖情况|荣誉奖励|荣誉奖项)\s*[:：]?/, summary:/^(?:自我评价|个人总结|个人优势)\s*[:：]?/};
  const heading = /^(?:教育背景|教育经历|实习经历|工作经历|项目经历|校园经历|专业技能|技术技能|技能清单|个人技能|语言能力|语言水平|获奖情况|荣誉奖励|荣誉奖项|自我评价|个人总结|个人优势|Skills)\s*[:：]?$/i;
  for (const [key, pattern] of Object.entries(sections)) {
    const start = lines.findIndex(line => pattern.test(line));
    if (start < 0) continue;
    const selected = [lines[start].replace(pattern, '').trim()];
    for (let i = start + 1; i < lines.length && !heading.test(lines[i]); i++) selected.push(lines[i]);
    profile[key] = selected.filter(Boolean).join('\n');
  }
  return profile;
}
