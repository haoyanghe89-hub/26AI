/**
 * @import { FoodProduct, PetProfile } from './domain.mjs'
 */

/** @type {FoodProduct[]} */
export const FOOD_PRODUCTS = [
  {
    id: 'cat-adult-chicken-sensitive',
    brand: 'PawBalance',
    product_name: '成猫鸡肉肠胃敏感配方',
    species: 'cat',
    life_stage: 'adult',
    breed_size: 'all',
    protein_percent: 34,
    fat_percent: 15,
    fiber_percent: 3,
    moisture_percent: 8,
    kcal_per_kg: 3820,
    main_ingredients: ['鸡肉粉', '糙米', '鸡脂肪', '甜菜粕', '鱼油'],
    allergen_tags: ['chicken', 'grain'],
    health_tags: ['digestive', 'skin_coat'],
    price_per_kg: 78,
    feeding_guide: {
      '3kg': '45-55g/day',
      '4kg': '55-68g/day',
      '5kg': '65-80g/day',
    },
  },
  {
    id: 'cat-adult-duck-hairball',
    brand: 'MiaoCare',
    product_name: '成猫鸭肉化毛配方',
    species: 'cat',
    life_stage: 'adult',
    breed_size: 'all',
    protein_percent: 32,
    fat_percent: 13,
    fiber_percent: 6,
    moisture_percent: 8,
    kcal_per_kg: 3650,
    main_ingredients: ['鸭肉粉', '豌豆', '马铃薯', '纤维素', '鲑鱼油'],
    allergen_tags: ['duck', 'pea', 'potato'],
    health_tags: ['hairball', 'weight_control'],
    price_per_kg: 88,
    feeding_guide: {
      '3kg': '48-58g/day',
      '4kg': '58-72g/day',
      '5kg': '70-85g/day',
    },
  },
  {
    id: 'dog-adult-lamb-weight',
    brand: 'CanineBase',
    product_name: '成犬羊肉体重管理配方',
    species: 'dog',
    life_stage: 'adult',
    breed_size: 'all',
    protein_percent: 27,
    fat_percent: 10,
    fiber_percent: 6,
    moisture_percent: 9,
    kcal_per_kg: 3350,
    main_ingredients: ['羊肉粉', '燕麦', '糙米', '甜菜粕', '亚麻籽'],
    allergen_tags: ['lamb', 'grain'],
    health_tags: ['weight_control', 'digestive'],
    price_per_kg: 62,
    feeding_guide: {
      '5kg': '85-105g/day',
      '10kg': '145-175g/day',
      '20kg': '245-295g/day',
    },
  },
  {
    id: 'dog-adult-salmon-skin',
    brand: 'PawBalance',
    product_name: '成犬三文鱼皮毛配方',
    species: 'dog',
    life_stage: 'adult',
    breed_size: 'medium',
    protein_percent: 29,
    fat_percent: 16,
    fiber_percent: 3.5,
    moisture_percent: 9,
    kcal_per_kg: 3920,
    main_ingredients: ['三文鱼粉', '豌豆', '鸡脂肪', '马铃薯', '鱼油'],
    allergen_tags: ['fish', 'chicken_fat', 'pea', 'potato'],
    health_tags: ['skin_coat', 'high_energy'],
    price_per_kg: 84,
    feeding_guide: {
      '5kg': '75-95g/day',
      '10kg': '130-160g/day',
      '20kg': '225-275g/day',
    },
  },
  {
    id: 'cat-kitten-growth',
    brand: 'MiaoCare',
    product_name: '幼猫高能成长配方',
    species: 'cat',
    life_stage: 'kitten',
    breed_size: 'all',
    protein_percent: 38,
    fat_percent: 20,
    fiber_percent: 2.5,
    moisture_percent: 8,
    kcal_per_kg: 4250,
    main_ingredients: ['鸡肉粉', '鱼粉', '鸡脂肪', '鸡蛋粉', '米'],
    allergen_tags: ['chicken', 'fish', 'egg', 'grain'],
    health_tags: ['growth', 'high_energy'],
    price_per_kg: 96,
    feeding_guide: {
      '1kg': '30-45g/day',
      '2kg': '45-65g/day',
      '3kg': '60-80g/day',
    },
  },
  {
    id: 'dog-puppy-growth',
    brand: 'CanineBase',
    product_name: '幼犬鸡肉成长配方',
    species: 'dog',
    life_stage: 'puppy',
    breed_size: 'all',
    protein_percent: 31,
    fat_percent: 18,
    fiber_percent: 3,
    moisture_percent: 9,
    kcal_per_kg: 4050,
    main_ingredients: ['鸡肉粉', '米', '鸡脂肪', '鱼粉', '甜菜粕'],
    allergen_tags: ['chicken', 'fish', 'grain'],
    health_tags: ['growth', 'high_energy'],
    price_per_kg: 68,
    feeding_guide: {
      '5kg': '110-155g/day',
      '10kg': '180-250g/day',
      '20kg': '300-420g/day',
    },
  },
]

export function getFoodById(id) {
  return FOOD_PRODUCTS.find((food) => food.id === id) || null
}

export function findFoodProductsForPet(profile, { limit = 6 } = {}) {
  const species = profile?.species === 'dog' ? 'dog' : 'cat'
  return FOOD_PRODUCTS.filter((food) => food.species === species)
    .sort((a, b) => scoreFoodForPet(profile, b) - scoreFoodForPet(profile, a))
    .slice(0, limit)
}

export function foodProductToText(food) {
  if (!food) return '未匹配到口粮。'
  return [
    `${food.brand} ${food.product_name} (${food.id})`,
    `species=${food.species}; life_stage=${food.life_stage}; breed_size=${food.breed_size}`,
    `protein=${food.protein_percent}%; fat=${food.fat_percent}%; fiber=${food.fiber_percent}%; moisture=${food.moisture_percent}%; kcal_per_kg=${food.kcal_per_kg}`,
    `main_ingredients=${food.main_ingredients.join(', ')}`,
    `allergen_tags=${food.allergen_tags.join(', ') || 'none'}`,
    `health_tags=${food.health_tags.join(', ') || 'none'}; price_per_kg=${food.price_per_kg}`,
    `feeding_guide=${Object.entries(food.feeding_guide)
      .map(([weight, amount]) => `${weight}: ${amount}`)
      .join('; ')}`,
  ].join('\n')
}

function scoreFoodForPet(profile, food) {
  let score = 0
  const age = Number(profile?.age_months || 0)
  const goal = String(profile?.health_goal || '').toLowerCase()
  const allergies = new Set((profile?.allergy_list || []).map((item) => String(item).toLowerCase()))

  if (food.life_stage === 'puppy' || food.life_stage === 'kitten') {
    score += age > 0 && age < 12 ? 4 : -2
  } else {
    score += age >= 12 || !age ? 2 : -1
  }
  for (const allergen of food.allergen_tags) {
    if (allergies.has(allergen.toLowerCase()) || goal.includes(allergen.toLowerCase())) score -= 8
  }
  if (/减重|控重|weight|胖|体重/.test(goal) && food.health_tags.includes('weight_control')) score += 5
  if (/肠胃|软便|digest|腹泻/.test(goal) && food.health_tags.includes('digestive')) score += 4
  if (/皮毛|毛发|skin/.test(goal) && food.health_tags.includes('skin_coat')) score += 3
  return score
}
