export type CareExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type GuidancePreference = 'more_guidance' | 'balanced' | 'minimal'

export interface CareExperienceCard {
  id: string
  title: string
  description: string
  tags?: string[]
  prompt?: string
  route?: string
  icon: string
}

export interface CareExperienceHomeContent {
  title: string
  subtitle: string
  cards: CareExperienceCard[]
  primaryAction: {
    label: string
    route?: string
    prompt?: string
  }
  icon: string
  tone: 'gentle' | 'observant' | 'direct'
}

export const DEFAULT_CARE_EXPERIENCE_LEVEL: CareExperienceLevel = 'beginner'
export const DEFAULT_GUIDANCE_PREFERENCE: GuidancePreference = 'balanced'

export const careExperienceHomeContent: Record<CareExperienceLevel, CareExperienceHomeContent> = {
  beginner: {
    title: '新手养宠小帮手',
    subtitle: '我会多解释一点，把常见照看问题讲清楚，陪你慢慢熟悉它。',
    icon: 'sparkle',
    tone: 'gentle',
    primaryAction: {
      label: '问问今天怎么照看',
      prompt: '请用温柔、解释清楚的方式，结合当前宠物档案给我今天的照看建议。',
    },
    cards: [
      {
        id: 'social',
        title: '如何教狗狗正确社交？',
        description: '从短时间、低刺激的相处开始，慢慢建立安全感。',
        icon: 'walk',
        tags: ['新手知识', '社会化训练'],
        prompt: '如何教狗狗正确社交？请给我适合刚开始养宠家庭的温柔步骤。',
      },
      {
        id: 'home-appetite',
        title: '刚到家的狗狗不吃饭正常吗？',
        description: '先观察精神、饮水和环境变化，别急着频繁换粮。',
        icon: 'food',
        tags: ['喂养基础', '常见异常'],
        prompt: '刚到家的狗狗不吃饭正常吗？请告诉我需要观察什么、什么时候联系兽医。',
      },
      {
        id: 'vaccine',
        title: '第一次驱虫和疫苗怎么安排？',
        description: '按年龄、健康状态和兽医建议，把节奏排得更稳一点。',
        icon: 'reminder',
        tags: ['疫苗驱虫'],
        prompt: '第一次驱虫和疫苗怎么安排？请用入门方式说明注意事项。',
      },
      {
        id: 'stool',
        title: '怎么判断便便是否正常？',
        description: '颜色、形状、次数和精神状态一起看，更不容易误判。',
        icon: 'log',
        tags: ['常见异常'],
        prompt: '怎么判断宠物便便是否正常？请给我简单观察方法。',
      },
    ],
  },
  intermediate: {
    title: '今天的小发现',
    subtitle: '日常节奏已经熟悉了，我会帮你留意细节变化，给一点轻建议。',
    icon: 'heart',
    tone: 'observant',
    primaryAction: {
      label: '看看本周变化',
      prompt: '请结合当前宠物最近记录，总结本周值得留意的小变化和轻建议。',
    },
    cards: [
      {
        id: 'walk-trend',
        title: '最近两天散步记录少了一点',
        description: '天气合适的话，可以带它走走，顺便观察精神状态。',
        icon: 'walk',
        tags: ['行为习惯', '健康趋势'],
        prompt: '请根据最近记录观察散步和精神状态变化，给我轻建议。',
      },
      {
        id: 'diet-stable',
        title: '饮食记录比较稳定',
        description: '可以继续观察体重变化，先不急着调整口粮。',
        icon: 'food',
        tags: ['饮食优化'],
        prompt: '请结合饮食记录和体重，看看是否需要优化喂养。',
      },
      {
        id: 'training',
        title: '本周可以增加一次训练互动',
        description: '短一点也可以，重点是稳定、愉快、有回应。',
        icon: 'trophy',
        tags: ['训练进阶'],
        prompt: '请给当前宠物推荐一次适合本周的训练互动。',
      },
      {
        id: 'weekly-review',
        title: '顺手看一眼本周回顾',
        description: '把饮食、精神、便便和互动放在一起看。',
        icon: 'plan',
        tags: ['本周回顾'],
        prompt: '请生成当前宠物的本周照看回顾。',
      },
    ],
  },
  advanced: {
    title: '高级照看工具',
    subtitle: '少一点打扰，多一点关键工具；需要时我会把信息整理清楚。',
    icon: 'settings',
    tone: 'direct',
    primaryAction: {
      label: '打开高级分析',
      prompt: '请基于当前宠物档案和最近记录，给我一份简洁的高级照看分析。',
    },
    cards: [
      {
        id: 'food-compare',
        title: '狗粮猫粮成分对比',
        description: '按成分、热量、过敏源和适配目标快速比较。',
        icon: 'product',
        tags: ['粮食对比'],
        prompt: '请帮我做狗粮猫粮成分对比，重点看成分、热量、过敏源和适配目标。',
      },
      {
        id: 'report',
        title: '体检报告解读',
        description: '整理指标、异常项和复查问题。',
        icon: 'file',
        tags: ['报告解读'],
        prompt: '请帮我解读宠物体检报告，整理异常项、可能原因和复查问题。',
      },
      {
        id: 'export',
        title: '健康记录导出',
        description: '就医前快速整理近期状态。',
        icon: 'upload',
        tags: ['自定义记录'],
        route: 'records',
      },
      {
        id: 'hospital',
        title: '附近宠物医院',
        description: '查看常用医院、急诊电话和就医准备。',
        icon: 'hospital',
        tags: ['紧急工具'],
        prompt: '请帮我整理附近宠物医院选择和就医前准备，需要哪些信息、怎么判断急诊优先级。',
      },
    ],
  },
}

export function normalizeCareExperienceLevel(value: unknown): CareExperienceLevel {
  return value === 'intermediate' || value === 'advanced' || value === 'beginner'
    ? value
    : DEFAULT_CARE_EXPERIENCE_LEVEL
}

export function normalizeGuidancePreference(value: unknown): GuidancePreference {
  return value === 'more_guidance' || value === 'minimal' || value === 'balanced'
    ? value
    : DEFAULT_GUIDANCE_PREFERENCE
}
