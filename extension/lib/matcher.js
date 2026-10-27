// Shared by the popup and the injected, isolated-world content script.
(function () {
  const aliases = {
    name:['姓名','中文姓名','真实姓名','name','fullname','realname'], englishName:['英文名','英文姓名','englishname'],
    phone:['手机','手机号码','联系电话','手机号','mobile','phone','tel'], email:['电子邮箱','邮箱','email','mail'],
    city:['现居城市','现居住地','居住地','city'], hometown:['籍贯','hometown'], gender:['性别','gender','sex'],
    birthday:['出生日期','出生年月','birthday','birthdate'], ethnicity:['民族','ethnicity'], wechat:['微信号','微信','wechat','wechatid'],
    political:['政治面貌'], maritalStatus:['婚姻状况','婚姻状态','maritalstatus'],
    website:['个人主页','github','个人网站','website','portfolio'], position:['意向岗位','应聘岗位','求职意向','期望职位'],
    targetCity:['意向城市','期望城市'], availability:['到岗时间','可到岗日期'],
    school:['学校','学校名称','毕业院校','院校名称','school','university'], major:['专业','所学专业','major'],
    degree:['学历','最高学历','educationlevel'], academicDegree:['学位','最高学位','degree','academicdegree'],
    gpa:['gpa','绩点'], overseas:['海外经历','海外学习经历','留学经历','overseasexperience'], college:['学院','院系','学院名称','faculty','college'],
    research:['研究方向','researcharea'], schoolCity:['学校城市','学校所在城市','院校所在地','schoolcity'],
    courses:['主修课程','主要课程','课程','课程 / 荣誉','courses'], studentLeadership:['学生干部经历','学生工作经历','studentleadership'],
    company:['公司名称','实习单位','工作单位','company','employer'], role:['职位','职位名称','岗位名称','担任角色','项目角色','项目职责','职务','jobtitle','projectrole'],
    department:['所在部门','部门','department'], workType:['工作类型','任职类型','工作性质','employmenttype','worktype'],
    industry:['所属行业','行业','industry'], location:['工作地点','工作城市','工作所在地','worklocation'], salary:['薪资','薪酬','工资','月薪','salary'],
    skills:['专业技能','技术技能','个人技能','skills'], languages:['语言能力','外语水平','languages'], awards:['获奖情况','荣誉奖励','awards'],
    summary:['自我评价','个人总结','自我介绍','summary'], start:['开始日期','开始时间','入学时间','入学日期','startdate'],
    end:['结束日期','结束时间','结束（毕业）时间','毕业日期','毕业时间','enddate'],
    description:['描述','工作内容','工作描述','项目描述','职责','description'], achievements:['工作成果','项目成果','成果','业绩','achievements','accomplishments']
  };
  const sectionPatterns = {education:/教育|学历|education/i, internships:/实习|internship/i,
    experience:/工作经历|工作经验|任职经历|职业经历|work\s*(?:experience|history)|employment/i, projects:/项目|project/i};
  const clean = value => String(value).toLowerCase().replace(/[\s_*：:()（）\-\.\[\]]/g, '');
  function namesFor(key, section) {
    if (section === 'projects' && key === 'name') return ['项目名称','projectname'];
    if (key === 'role') return section === 'projects' ? ['项目角色','担任角色','项目职责','projectrole','role'] : ['职位','职位名称','岗位名称','职务','jobtitle','role'];
    if (key === 'achievements') return section === 'projects' ? ['项目成果','成果','achievements','accomplishments'] : ['工作成果','成果','业绩','achievements','accomplishments'];
    if (key === 'description') return section === 'projects' ? ['项目描述','描述','description'] : ['工作内容','工作描述','职责','描述','description'];
    return aliases[key] || [];
  }
  function matchField(label, candidates, context = '', occurrence = 0) {
    const normalized = clean(label);
    if (!normalized || /紧急|联系人姓名|父亲|母亲|推荐人|验证码|密码|身份证|证件号码|期望薪|期望月薪|预期薪|期待薪|emergency|password|captcha|expectedsalary|desiredsalary/.test(normalized)
      || /紧急联系|家庭成员|家庭信息|推荐人|emergency|family/i.test(context)) return '';
    // Reserve explicit labels even when the corresponding resume value is blank.
    const exactKeys = Object.entries(aliases).filter(([,names])=>names.some(name=>normalized === clean(name))).map(([key])=>key);
    if (normalized === '项目名称' || normalized === 'projectname') exactKeys.push('name');
    const sections = Object.keys(sectionPatterns).filter(section=>sectionPatterns[section].test(context));
    let best = '', bestScore = 0;
    for (const field of candidates) {
      const parts = field.key.split('.');
      const key = parts.at(-1), section = parts.length > 1 ? parts[0] : '';
      if (exactKeys.length && !exactKeys.includes(key)) continue;
      if (!section && key === 'name' && /项目|project/.test(normalized)) continue;
      const names = namesFor(key, section);
      const score = Math.max(0, ...names.map(name => normalized === clean(name) ? 100 : normalized.includes(clean(name)) && clean(name).length > 2 ? 65 : 0));
      if (!score) continue;
      let adjusted = score;
      if (section) {
        const rightSection = sections.includes(section);
        if (sections.length && !rightSection) continue;
        // A combined internship/work heading cannot identify which list to use.
        if (section === 'internships' || section === 'experience') {
          if (!rightSection || (sections.includes('internships') && sections.includes('experience'))) continue;
        }
        if (rightSection) adjusted += 12;
        if (Number(parts[1]) === occurrence) adjusted += 5;
        else adjusted -= 10;
        if (['start','end','description','role','achievements'].includes(key) && !rightSection) continue;
      }
      if (adjusted > bestScore) {bestScore = adjusted; best = field.key;}
    }
    return best;
  }
  globalThis.AutoFillMatcher = {matchField};
})();
