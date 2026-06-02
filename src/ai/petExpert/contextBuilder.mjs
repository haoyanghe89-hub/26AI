export function buildPetExpertContext({ state = {}, requestContext = {}, messages = [] } = {}) {
  const pets = chooseArray(requestContext.pets, state.pets)
  const healthLogs = chooseArray(requestContext.healthLogs, state.healthLogs)
  const careReminders = chooseArray(requestContext.careReminders, state.careReminders)
  const carePlans = chooseArray(requestContext.carePlans, state.carePlans)
  const selectedPetId =
    String(
      requestContext.activePetId || requestContext.selectedPetId || state.settings?.activePet || '',
    ).trim() ||
    pets[0]?.id ||
    ''
  const selectedPet = pets.find((pet) => pet.id === selectedPetId) || pets[0] || null
  const petId = selectedPet?.id || ''
  const recentHealthLogs = healthLogs
    .filter((log) => !petId || log.petId === petId)
    .sort((a, b) => String(b.loggedAt || '').localeCompare(String(a.loggedAt || '')))
    .slice(0, 8)
  const activeReminders = careReminders
    .filter((item) => (!petId || item.petId === petId) && item.status !== 'done')
    .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')))
    .slice(0, 8)
  const activeCarePlan =
    carePlans
      .filter((plan) => !petId || plan.petId === petId)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null
  const uploadedFiles = collectUploadedFiles(requestContext.uploadedFiles, messages)

  return {
    selectedPet,
    recentHealthLogs,
    activeReminders,
    activeCarePlan,
    uploadedFiles,
    text: renderPetContext({
      selectedPet,
      recentHealthLogs,
      activeReminders,
      activeCarePlan,
      uploadedFiles,
    }),
  }
}

export function getLatestUserMessageText(messages = []) {
  const latest = [...messages].reverse().find((message) => message?.role === 'user')
  return messageContentToText(latest?.content)
}

export function messageContentToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text || ''))
    .join('\n')
}

function chooseArray(primary, fallback) {
  if (Array.isArray(primary)) return primary
  if (Array.isArray(fallback)) return fallback
  return []
}

function collectUploadedFiles(requestFiles, messages) {
  const files = Array.isArray(requestFiles) ? [...requestFiles] : []
  for (const message of messages) {
    if (!Array.isArray(message?.attachments)) continue
    files.push(...message.attachments)
  }
  const byId = new Map()
  for (const file of files) {
    if (!file) continue
    const id = String(file.id || file.name || byId.size)
    byId.set(id, {
      id,
      name: String(file.name || '未命名资料'),
      kind: String(file.kind || 'document'),
      type: String(file.type || ''),
      text: String(file.text || '').slice(0, 12000),
    })
  }
  return Array.from(byId.values()).slice(0, 6)
}

function renderPetContext({ selectedPet, recentHealthLogs, activeReminders, activeCarePlan, uploadedFiles }) {
  const sections = []
  sections.push('【选中宠物档案】')
  sections.push(selectedPet ? renderPet(selectedPet) : '未选择宠物。请先引导用户创建或选择宠物档案。')

  sections.push('\n【近期健康日志】')
  sections.push(
    recentHealthLogs.length
      ? recentHealthLogs
          .map(
            (log) =>
              `- ${String(log.loggedAt || '').slice(0, 10) || '未知日期'}：食欲 ${log.appetite || '未填'}；饮水 ${log.waterIntake || '未填'}；便便 ${log.poop || '未填'}；呕吐 ${log.vomiting || '未填'}；精神 ${log.energyLevel || '未填'}/5；症状 ${log.symptoms || '无'}；用药 ${log.medication || '无'}；备注 ${log.notes || '无'}`,
          )
          .join('\n')
      : '暂无健康日志。',
  )

  sections.push('\n【护理计划与提醒】')
  sections.push(activeCarePlan ? renderCarePlan(activeCarePlan) : '暂无护理计划。')
  sections.push(
    activeReminders.length
      ? activeReminders
          .map(
            (item) =>
              `- ${item.title || '未命名提醒'}：${String(item.dueAt || '').slice(0, 16)}；${item.repeat || '一次'}；${item.notes || '无备注'}`,
          )
          .join('\n')
      : '暂无未完成提醒。',
  )

  sections.push('\n【上传资料】')
  sections.push(
    uploadedFiles.length
      ? uploadedFiles
          .map(
            (file) =>
              `- ${file.name}（${file.kind}/${file.type || 'unknown'}）${file.text ? `\n${file.text.slice(0, 4000)}` : ''}`,
          )
          .join('\n')
      : '本轮没有可用上传资料。',
  )

  return sections.join('\n')
}

function renderPet(pet) {
  return [
    `名字：${pet.name || '待补充'}`,
    `物种：${speciesLabel(pet.species)}`,
    `品种：${pet.breed || '待补充'}`,
    `性别：${genderLabel(pet.gender)}`,
    `年龄/生日：${pet.ageLabel || pet.birthday || '待补充'}`,
    `体重：${pet.weightKg ? `${pet.weightKg}kg` : '待补充'}`,
    `绝育：${sterilizationLabel(pet.sterilizationStatus)}`,
    `过敏：${pet.allergies || '待补充'}`,
    `病史：${pet.medicalHistory || '待补充'}`,
    `疫苗：${pet.vaccinationStatus || '待补充'}`,
    `驱虫：${pet.dewormingStatus || '待补充'}`,
    `食物偏好：${pet.foodPreferences || '待补充'}`,
  ].join('\n')
}

function renderCarePlan(plan) {
  return [
    `${plan.title || '护理计划'}：${plan.summary || '无摘要'}`,
    `喂养：${Array.isArray(plan.feeding) ? plan.feeding.join('；') : '无'}`,
    `护理：${Array.isArray(plan.care) ? plan.care.join('；') : '无'}`,
    `警讯：${Array.isArray(plan.warnings) ? plan.warnings.join('；') : '无'}`,
  ].join('\n')
}

function speciesLabel(value) {
  if (value === 'dog') return '狗'
  if (value === 'cat') return '猫'
  return '其他'
}

function genderLabel(value) {
  if (value === 'female') return '母'
  if (value === 'male') return '公'
  return '待补充'
}

function sterilizationLabel(value) {
  if (value === 'sterilized') return '已绝育'
  if (value === 'not_sterilized') return '未绝育'
  return '待补充'
}
