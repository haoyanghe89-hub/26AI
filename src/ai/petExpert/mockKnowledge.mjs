/**
 * @import { PetKnowledge } from './domain.mjs'
 */

/** @type {PetKnowledge[]} */
export const PET_KNOWLEDGE_BASE = [
  {
    id: 'nutrition-transition-001',
    title: '换粮需要渐进过渡',
    content:
      '猫狗换粮通常建议用 7 到 10 天逐步过渡：旧粮比例从高到低，新粮比例从低到高。若出现持续软便、呕吐、明显拒食，应暂停加量并观察，必要时咨询兽医。幼龄、老年、慢病或肠胃敏感宠物更需要谨慎。',
    species: 'both',
    category: 'nutrition',
    tags: ['换粮', '软便', '肠胃敏感', '喂养'],
    risk_level: 'medium',
    source_type: 'vet_reviewed',
  },
  {
    id: 'nutrition-cat-water-001',
    title: '猫咪饮水与湿粮',
    content:
      '猫对饮水变化较敏感。若长期饮水少、尿团变小或排尿异常，可考虑在兽医建议下提高湿粮比例、增加饮水点，并观察尿量。若频繁蹲猫砂盆但尿不出，属于急症警讯，应尽快就医。',
    species: 'cat',
    category: 'nutrition',
    tags: ['猫', '饮水', '湿粮', '泌尿'],
    risk_level: 'medium',
    source_type: 'vet_reviewed',
  },
  {
    id: 'nutrition-dog-weight-001',
    title: '犬只体重管理',
    content:
      '犬只减重或控重应基于体况评分、当前体重、活动量和零食占比。通常先记录 1 到 2 周摄入与体重趋势，再小幅调整总热量，避免突然大幅减食。有关处方减重粮或疾病相关饮食，应由兽医评估。',
    species: 'dog',
    category: 'nutrition',
    tags: ['狗', '体重管理', '热量', '零食'],
    risk_level: 'low',
    source_type: 'vet_reviewed',
  },
  {
    id: 'health-red-flags-001',
    title: '需要尽快就医的高风险症状',
    content:
      '持续呕吐、便血、抽搐、呼吸困难、疑似中毒、无法排尿、明显外伤出血、幼犬幼猫严重腹泻、持续不吃不喝或精神快速变差，都不适合仅靠居家观察，应尽快联系执业兽医或急诊医院。',
    species: 'both',
    category: 'emergency',
    tags: ['急症', '便血', '抽搐', '呼吸困难', '呕吐', '腹泻', '拒食'],
    risk_level: 'high',
    source_type: 'vet_reviewed',
  },
  {
    id: 'health-stool-001',
    title: '便便状态观察',
    content:
      '偶发略软便可先记录饮食变化、零食、精神、食欲、呕吐和排便次数。若软便持续超过 24 到 48 小时、伴随精神差、呕吐、血液、黑便、幼龄宠物腹泻或脱水迹象，应咨询兽医。',
    species: 'both',
    category: 'health',
    tags: ['便便', '软便', '腹泻', '观察'],
    risk_level: 'medium',
    source_type: 'vet_reviewed',
  },
  {
    id: 'training-dog-wait-001',
    title: '等待训练的低压力步骤',
    content:
      '训练“等待”时应从 1 到 2 秒开始，使用清晰口令、及时奖励和短时多次练习。不要在宠物过度兴奋、饥饿或害怕时强行延长时间。训练目标是稳定行为，而不是压制宠物。',
    species: 'dog',
    category: 'training',
    tags: ['训练', '等待', '奖励', '行为'],
    risk_level: 'low',
    source_type: 'manual',
  },
  {
    id: 'training-cat-play-001',
    title: '猫咪互动与行为消耗',
    content:
      '猫咪互动建议模拟捕猎链：观察、追逐、扑抓、获得奖励。每天多次短互动通常比一次长时间互动更稳定。若出现攻击、躲藏或过度舔毛，应记录触发场景并排除疼痛或压力源。',
    species: 'cat',
    category: 'training',
    tags: ['猫', '互动', '行为', '压力'],
    risk_level: 'low',
    source_type: 'manual',
  },
  {
    id: 'care-vaccine-deworm-001',
    title: '疫苗与驱虫提醒',
    content:
      '疫苗、驱虫、体检和复诊提醒应结合年龄、生活方式、地区寄生虫风险和兽医建议设置。若档案缺少疫苗或驱虫状态，应先补充日期和产品类型，再生成提醒。',
    species: 'both',
    category: 'care',
    tags: ['疫苗', '驱虫', '提醒', '护理计划'],
    risk_level: 'none',
    source_type: 'official',
  },
  {
    id: 'breed-brachycephalic-001',
    title: '短鼻犬猫的运动与呼吸观察',
    content:
      '短鼻品种在高温、潮湿、剧烈运动或兴奋时更容易出现呼吸压力。若出现张口呼吸、舌色异常、明显喘不上气或虚脱，应立即降温、减少刺激并尽快就医。',
    species: 'both',
    category: 'breed',
    tags: ['短鼻', '呼吸', '运动', '高温'],
    risk_level: 'high',
    source_type: 'vet_reviewed',
  },
]

export const PET_KNOWLEDGE_CATEGORIES = ['nutrition', 'health', 'training', 'care', 'breed', 'emergency']
