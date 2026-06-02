import { computed, ref } from 'vue'

export type DailyCheckInMode = 'relaxed' | 'care' | 'training' | 'memory'

export interface DailyCheckIn {
  id: string
  petId: string
  date: string
  checkedIn: boolean
  checkedInAt: string
  companionDayCount: number
  streakCount: number
  selectedMode: DailyCheckInMode
  message: string
  createdAt: string
}

export interface DailyCheckInSummary {
  checkedIn: boolean
  companionDayCount: number
  streakCount: number
  selectedMode: DailyCheckInMode | null
  message: string
}

const STORAGE_KEY = 'twentys1x:daily-check-ins'

const checkIns = ref<Record<string, DailyCheckIn>>(loadRecord<DailyCheckIn>(STORAGE_KEY))
const todayKey = computed(() => localDateKey(new Date()))

export function useDailyCheckIn() {
  function getTodayCheckIn(petId: string) {
    return checkIns.value[recordKey(petId, todayKey.value)] || null
  }

  function getSummary(petId: string, companionDayCount: number): DailyCheckInSummary {
    const today = getTodayCheckIn(petId)
    return {
      checkedIn: Boolean(today?.checkedIn),
      companionDayCount,
      streakCount: today?.streakCount || estimateStreakCount(petId),
      selectedMode: today?.selectedMode || null,
      message: today?.message || '',
    }
  }

  function completeCheckIn(petId: string, companionDayCount: number, selectedMode: DailyCheckInMode) {
    const now = new Date().toISOString()
    const date = todayKey.value
    const key = recordKey(petId, date)
    const next: DailyCheckIn = {
      id: `check-in-${petId}-${date}`,
      petId,
      date,
      checkedIn: true,
      checkedInAt: now,
      companionDayCount,
      streakCount: estimateStreakCount(petId) + 1,
      selectedMode,
      message: modeMessage(selectedMode),
      createdAt: now,
    }
    checkIns.value = { ...checkIns.value, [key]: next }
    persist()
    return next
  }

  function resetToday(petId: string) {
    const key = recordKey(petId, todayKey.value)
    const nextCheckIns = { ...checkIns.value }
    delete nextCheckIns[key]
    checkIns.value = nextCheckIns
    persist()
  }

  return {
    todayKey,
    getTodayCheckIn,
    getSummary,
    completeCheckIn,
    resetToday,
  }
}

function estimateStreakCount(petId: string) {
  let streak = 0
  const cursor = new Date()
  while (streak < 365) {
    const key = recordKey(petId, localDateKey(cursor))
    if (!checkIns.value[key]?.checkedIn) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function modeMessage(mode: DailyCheckInMode) {
  const map: Record<DailyCheckInMode, string> = {
    relaxed: '轻松陪伴也很珍贵',
    care: '今天认真照顾它的小日常',
    training: '用几分钟练出一点默契',
    memory: '把可爱瞬间留下来',
  }
  return map[mode]
}

function recordKey(petId: string, date: string) {
  return `${petId}:${date}`
}

function localDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function loadRecord<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    localStorage.removeItem(key)
    return {}
  }
}

function persist() {
  // TODO: Replace localStorage persistence with backend daily check-in APIs when they are available.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checkIns.value))
}
