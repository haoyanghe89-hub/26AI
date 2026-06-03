const RED_FLAG_RULES = [
  {
    id: 'repeated_vomiting',
    label: '反复呕吐',
    patterns: [
      /反复.*呕吐/,
      /持续.*呕吐/,
      /一直.*吐/,
      /吐了.*(很多|多次|好几次)/,
      /repeated vomiting/i,
      /persistent vomiting/i,
    ],
  },
  {
    id: 'blood_in_stool',
    label: '便血',
    patterns: [/便血/, /血便/, /大便.*血/, /粪便.*血/, /blood.*stool/i, /bloody stool/i],
  },
  {
    id: 'blood_in_urine',
    label: '尿血',
    patterns: [/尿血/, /血尿/, /尿.*血/, /blood.*urine/i, /bloody urine/i],
  },
  {
    id: 'difficulty_breathing',
    label: '呼吸困难',
    patterns: [
      /呼吸困难/,
      /喘不上气/,
      /张口呼吸/,
      /呼吸.*急促/,
      /difficulty breathing/i,
      /labou?red breathing/i,
    ],
  },
  {
    id: 'seizure',
    label: '抽搐/癫痫样发作',
    patterns: [/抽搐/, /癫痫/, /口吐白沫/, /seizure/i, /convulsion/i],
  },
  {
    id: 'suspected_poisoning',
    label: '疑似中毒',
    patterns: [/中毒/, /误食.*(药|毒|巧克力|洋葱|葡萄|百合|清洁剂)/, /poison/i, /toxic/i],
  },
  {
    id: 'inability_to_urinate',
    label: '无法排尿',
    patterns: [/尿不出来/, /无法排尿/, /频繁蹲.*没尿/, /排不出尿/, /cannot urinate/i, /unable to urinate/i],
  },
  {
    id: 'extreme_lethargy',
    label: '极度精神沉郁',
    patterns: [/极度.*(嗜睡|虚弱|没精神)/, /精神.*很差/, /叫不醒/, /extreme lethargy/i],
  },
  { id: 'collapse', label: '倒地/虚脱', patterns: [/倒地/, /虚脱/, /昏迷/, /collapse/i, /collapsed/i] },
  {
    id: 'severe_trauma',
    label: '严重外伤',
    patterns: [/车撞/, /摔.*很重/, /严重外伤/, /大量出血/, /severe trauma/i, /hit by car/i],
  },
  {
    id: 'young_diarrhea',
    label: '幼龄宠物持续腹泻',
    patterns: [
      /(幼猫|幼犬|小猫|小狗).*(持续|一直|反复).*(腹泻|拉稀)/,
      /(puppy|kitten).*(persistent|repeated).*diarrhea/i,
    ],
  },
  {
    id: 'cat_not_eating',
    label: '猫长时间不进食',
    patterns: [
      /(猫|猫咪).*(不吃|拒食).*(一天|24\s*小时|很久|两天|48\s*小时)/,
      /cat.*not eating.*(24|long|day)/i,
    ],
  },
  {
    id: 'not_eating_or_drinking',
    label: '持续不吃不喝',
    patterns: [
      /持续.*(不吃不喝|不吃.*不喝)/,
      /(不吃不喝|拒食拒水).*(一天|24\s*小时|两天|48\s*小时|很久)/,
      /(几乎没喝|完全不喝).*(不吃|拒食|没胃口)/,
      /(not eating|refusing food).*(not drinking|refusing water|24|48|day)/i,
    ],
  },
]

export function evaluateSafetyRules({ userText = '', contextText = '' } = {}) {
  const text = `${userText}\n${contextText}`.trim()
  const matches = []

  for (const rule of RED_FLAG_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      matches.push({ id: rule.id, label: rule.label })
    }
  }

  return {
    enabled: true,
    hasRedFlags: matches.length > 0,
    riskLevel: matches.length > 0 ? 'high' : inferNonEmergencyRisk(text),
    matches,
    instruction: matches.length
      ? [
          '检测到急症警讯：' + matches.map((item) => item.label).join('、') + '。',
          '必须清晰建议联系执业兽医或急诊医院。',
          '不要给出诊断结论，不要建议处方药或剂量。',
          '仍需提供冷静、可执行的信息准备清单。',
        ].join('\n')
      : '',
  }
}

export function buildEmergencyStructuredResponse(safetyResult, sourcesUsed = []) {
  return {
    summary:
      '你描述的情况包含可能需要立即处理的急症警讯。请尽快联系执业兽医或附近宠物急诊医院，并在等待期间保持宠物安静、保暖、避免强行喂食或自行用药。',
    riskLevel: 'high',
    possibleConcerns: safetyResult.matches.map((item) => item.label),
    recommendedActions: [
      '立即联系兽医或急诊医院，说明宠物种类、年龄、体重、症状开始时间和变化。',
      '不要自行使用人用药、抗生素、止吐药、止泻药或其他处方药。',
      '如果怀疑误食或中毒，保留包装、照片或剩余物，不要自行催吐，先问兽医。',
      '若需要移动宠物，尽量减少刺激，使用航空箱、毛巾或硬板辅助固定。',
    ],
    observationChecklist: [
      '症状首次出现时间、频率、持续时长和是否加重。',
      '最近 24 小时食欲、饮水、排尿、排便和呕吐次数。',
      '精神状态、呼吸状态、牙龈颜色、体温或是否疼痛。',
      '近期饮食变化、药物/保健品、外出、接触毒物或外伤史。',
      '带上粪便/尿液/呕吐物照片、检查报告和疫苗/驱虫记录。',
    ],
    vetQuestions: [
      '现在是否需要立刻到院，还是可以先电话分诊？',
      '到院前是否需要禁食、保暖或携带样本？',
      '哪些指标提示病情加重，需要更快出发？',
    ],
    remindersToCreate: [],
    disclaimer: '以上不是诊断或处方。出现急症警讯时，请以执业兽医或急诊医院的现场判断为准。',
    sourcesUsed,
  }
}

function inferNonEmergencyRisk(text) {
  if (/呕吐|腹泻|拉稀|咳|疼|跛|尿频|拒食|精神差|symptom|vomit|diarrhea|pain/i.test(text)) {
    return 'medium'
  }
  return 'low'
}
