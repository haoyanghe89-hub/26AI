/**
 * @typedef {'dog' | 'cat'} PetSpecies
 * @typedef {'low' | 'medium' | 'high'} ActivityLevel
 * @typedef {'low' | 'medium' | 'high' | 'none'} RiskLevel
 *
 * @typedef {Object} PetProfile
 * @property {string} id
 * @property {string} name
 * @property {PetSpecies} species
 * @property {string} breed
 * @property {number|null} age_months
 * @property {number|null} weight_kg
 * @property {string} sex
 * @property {boolean|null} neutered
 * @property {ActivityLevel} activity_level
 * @property {number|null} body_condition_score
 * @property {string[]} allergy_list
 * @property {string[]} disease_history
 * @property {string} current_food_id
 * @property {string} health_goal
 *
 * @typedef {Object} PetDailyLog
 * @property {string} pet_id
 * @property {string} date
 * @property {string} appetite
 * @property {string} stool_status
 * @property {string} water_intake
 * @property {number} activity_minutes
 * @property {number|null} weight_kg
 * @property {string[]} abnormal_symptoms
 * @property {string} note
 *
 * @typedef {Object} PetKnowledge
 * @property {string} id
 * @property {string} title
 * @property {string} content
 * @property {'dog' | 'cat' | 'both'} species
 * @property {'nutrition' | 'health' | 'training' | 'care' | 'breed' | 'emergency'} category
 * @property {string[]} tags
 * @property {RiskLevel} risk_level
 * @property {'manual' | 'official' | 'vet_reviewed'} source_type
 *
 * @typedef {Object} FoodProduct
 * @property {string} id
 * @property {string} brand
 * @property {string} product_name
 * @property {'dog' | 'cat'} species
 * @property {string} life_stage
 * @property {string} breed_size
 * @property {number} protein_percent
 * @property {number} fat_percent
 * @property {number} fiber_percent
 * @property {number} moisture_percent
 * @property {number} kcal_per_kg
 * @property {string[]} main_ingredients
 * @property {string[]} allergen_tags
 * @property {string[]} health_tags
 * @property {number} price_per_kg
 * @property {Record<string, string>} feeding_guide
 */

export function normalizePetProfile(value = {}) {
  const ageMonths = parseAgeMonths(value.age_months ?? value.ageMonths, value.ageLabel, value.birthday)
  return {
    id: stringValue(value.id),
    name: stringValue(value.name, '未命名宠物'),
    species: value.species === 'dog' ? 'dog' : 'cat',
    breed: stringValue(value.breed),
    age_months: ageMonths,
    weight_kg: numberOrNull(value.weight_kg ?? value.weightKg),
    sex: normalizeSex(value.sex ?? value.gender),
    neutered: normalizeNeutered(value.neutered ?? value.sterilizationStatus),
    activity_level: normalizeActivityLevel(value.activity_level ?? value.activityLevel),
    body_condition_score: numberOrNull(value.body_condition_score ?? value.bodyConditionScore),
    allergy_list: splitList(value.allergy_list ?? value.allergies),
    disease_history: splitList(value.disease_history ?? value.medicalHistory),
    current_food_id: stringValue(value.current_food_id ?? value.currentFoodId),
    health_goal: stringValue(value.health_goal ?? value.healthGoal ?? value.foodPreferences),
  }
}

export function normalizeDailyLog(value = {}) {
  return {
    pet_id: stringValue(value.pet_id ?? value.petId),
    date: stringValue(value.date ?? value.loggedAt).slice(0, 10),
    appetite: stringValue(value.appetite),
    stool_status: stringValue(value.stool_status ?? value.poop),
    water_intake: stringValue(value.water_intake ?? value.waterIntake),
    activity_minutes: Number(value.activity_minutes ?? value.activityMinutes ?? 0) || 0,
    weight_kg: numberOrNull(value.weight_kg ?? value.weightKg),
    abnormal_symptoms: splitList(
      value.abnormal_symptoms ?? [value.symptoms, value.vomiting, value.abnormalBehavior],
    ),
    note: stringValue(value.note ?? value.notes),
  }
}

export function normalizeRecentDailyLogs(logs = [], petId = '', limit = 7) {
  return (Array.isArray(logs) ? logs : [])
    .map(normalizeDailyLog)
    .filter((log) => !petId || log.pet_id === petId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
}

export function petProfileToText(profile) {
  if (!profile?.id) return '未选择宠物。'
  return [
    `id: ${profile.id}`,
    `name: ${profile.name}`,
    `species: ${profile.species}`,
    `breed: ${profile.breed || 'unknown'}`,
    `age_months: ${profile.age_months ?? 'unknown'}`,
    `weight_kg: ${profile.weight_kg ?? 'unknown'}`,
    `sex: ${profile.sex || 'unknown'}`,
    `neutered: ${profile.neutered === null ? 'unknown' : profile.neutered}`,
    `activity_level: ${profile.activity_level}`,
    `body_condition_score: ${profile.body_condition_score ?? 'unknown'}`,
    `allergy_list: ${profile.allergy_list.join(', ') || 'none'}`,
    `disease_history: ${profile.disease_history.join(', ') || 'none'}`,
    `current_food_id: ${profile.current_food_id || 'unknown'}`,
    `health_goal: ${profile.health_goal || 'none'}`,
  ].join('\n')
}

export function dailyLogsToText(logs = []) {
  if (!logs.length) return '暂无最近 7 天 daily logs。'
  return logs
    .map(
      (log) =>
        `- ${log.date || '未知日期'}：appetite=${log.appetite || 'unknown'}；stool=${log.stool_status || 'unknown'}；water=${log.water_intake || 'unknown'}；activity_minutes=${log.activity_minutes}; weight_kg=${log.weight_kg ?? 'unknown'}；symptoms=${log.abnormal_symptoms.join(', ') || 'none'}；note=${log.note || 'none'}`,
    )
    .join('\n')
}

function stringValue(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function splitList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[、,，;；\n]/)
  return source.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeSex(value) {
  if (value === 'female') return 'female'
  if (value === 'male') return 'male'
  return stringValue(value, 'unknown') || 'unknown'
}

function normalizeNeutered(value) {
  if (typeof value === 'boolean') return value
  if (value === 'sterilized' || value === '已绝育') return true
  if (value === 'not_sterilized' || value === '未绝育') return false
  return null
}

function normalizeActivityLevel(value) {
  return value === 'low' || value === 'high' ? value : 'medium'
}

function parseAgeMonths(ageMonths, ageLabel, birthday) {
  const direct = numberOrNull(ageMonths)
  if (direct) return Math.round(direct)

  const label = stringValue(ageLabel)
  const yearMatch = label.match(/(\d+(?:\.\d+)?)\s*(岁|year)/i)
  if (yearMatch) return Math.round(Number(yearMatch[1]) * 12)
  const monthMatch = label.match(/(\d+(?:\.\d+)?)\s*(个月|月|month)/i)
  if (monthMatch) return Math.round(Number(monthMatch[1]))

  const birth = Date.parse(stringValue(birthday))
  if (!Number.isNaN(birth)) {
    const months = (Date.now() - birth) / (1000 * 60 * 60 * 24 * 30.4375)
    return months > 0 ? Math.round(months) : null
  }
  return null
}
