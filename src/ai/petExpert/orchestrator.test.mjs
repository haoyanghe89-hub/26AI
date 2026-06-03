import { describe, expect, it } from 'vitest'
import { orchestratePetAiRequest } from './orchestrator.mjs'
import { retrievePetCareKnowledge } from './retriever.mjs'

const catProfile = {
  id: 'pet-cat-1',
  name: '奶糖',
  species: 'cat',
  breed: '英短',
  ageLabel: '2岁',
  weightKg: 4.2,
  gender: 'female',
  sterilizationStatus: 'sterilized',
  allergies: 'chicken',
  medicalHistory: '泌尿敏感',
  foodPreferences: '控重、饮水少',
}

describe('Pet AI RAG orchestrator', () => {
  it('filters RAG knowledge by pet species and category', async () => {
    const hits = await retrievePetCareKnowledge('猫咪饮水少，想提高湿粮比例', {
      petProfile: { species: 'cat' },
      categoryFilters: ['nutrition'],
      limit: 5,
    })

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.species === 'cat' || hit.species === 'both')).toBe(true)
    expect(hits.every((hit) => hit.category === 'nutrition')).toBe(true)
    expect(hits[0]).toMatchObject({
      title: expect.any(String),
      content: expect.any(String),
      tags: expect.any(Array),
      risk_level: expect.any(String),
    })
  })

  it('runs meal planning with normalized profile, logs, food database and tools', async () => {
    const result = await orchestratePetAiRequest({
      userText: '请给奶糖做 AI 配餐，最近便便略软',
      petContext: {
        selectedPet: catProfile,
        recentHealthLogs: [
          {
            petId: 'pet-cat-1',
            loggedAt: '2026-06-01T08:00:00.000Z',
            appetite: '正常',
            waterIntake: '偏少',
            poop: '略软',
            weightKg: 4.2,
            symptoms: '',
            notes: '换粮第 2 天',
          },
        ],
      },
      enableRag: true,
    })

    expect(result.intent).toBe('meal_plan')
    expect(result.petProfile).toMatchObject({
      id: 'pet-cat-1',
      species: 'cat',
      weight_kg: 4.2,
      allergy_list: ['chicken'],
    })
    expect(result.recentLogs).toHaveLength(1)
    expect(result.foodCandidates.every((food) => food.species === 'cat')).toBe(true)
    expect(result.toolResults.some((tool) => tool.tool === 'generateMealPlan')).toBe(true)
    expect(result.promptContextText).toContain('【Tool Calling 结果】')
  })

  it('classifies high risk health questions through tool calling', async () => {
    const result = await orchestratePetAiRequest({
      userText: '它今天持续呕吐，还不吃不喝，怎么办？',
      petContext: {
        selectedPet: catProfile,
        recentHealthLogs: [
          {
            petId: 'pet-cat-1',
            loggedAt: '2026-06-02T08:00:00.000Z',
            appetite: '不吃不喝',
            waterIntake: '几乎没喝',
            poop: '未排便',
            symptoms: '持续呕吐',
          },
        ],
      },
      enableRag: true,
    })

    const riskTool = result.toolResults.find((tool) => tool.tool === 'classifyHealthRisk')
    expect(result.intent).toBe('health')
    expect(riskTool?.risk_level).toBe('high')
    expect(riskTool?.recommended_boundary).toContain('兽医')
  })
})
