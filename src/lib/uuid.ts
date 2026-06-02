export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const randomValues =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(16))
      : fallbackRandomValues()

  randomValues[6] = (randomValues[6] & 0x0f) | 0x40
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80

  const hex = Array.from(randomValues, (value) => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

function fallbackRandomValues() {
  const values = new Uint8Array(16)
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 256)
  }
  return values
}
