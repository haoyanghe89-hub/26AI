<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string
    size?: number
  }>(),
  {
    size: 20,
  },
)

const paths: Record<string, string[]> = {
  home: ['M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z'],
  log: ['M7 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M9 8h6M9 12h7M9 16h4'],
  ai: [
    'M12 3l1.7 4.4L18 9.1l-4.3 1.7L12 15l-1.7-4.2L6 9.1l4.3-1.7L12 3Z',
    'M5 14.5A5.5 5.5 0 0 0 10.5 20H18a2 2 0 0 0 2-2v-1.2',
  ],
  plan: ['M7 3v4M17 3v4M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z'],
  profile: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M5 21a7 7 0 0 1 14 0'],
  pet: [
    'M8.4 10.8c1.1-1.2 2.1-1.8 3.6-1.8s2.5.6 3.6 1.8l1.6 1.8c1.8 2 .5 5.4-2.2 5.4H9c-2.7 0-4-3.4-2.2-5.4l1.6-1.8Z',
    'M7.5 8.2c1.1 0 2-1.2 2-2.6S8.6 3 7.5 3s-2 1.2-2 2.6.9 2.6 2 2.6ZM16.5 8.2c1.1 0 2-1.2 2-2.6S17.6 3 16.5 3s-2 1.2-2 2.6.9 2.6 2 2.6ZM4.6 12c.9-.3 1.2-1.7.7-3S3.6 7 2.7 7.3 1.5 9 2 10.3 3.7 12.4 4.6 12ZM19.4 12c.9.4 2.1-.4 2.6-1.7s.2-2.7-.7-3-2.1.4-2.6 1.7-.2 2.7.7 3Z',
  ],
  food: ['M7 4h10l1 5H6l1-5Z', 'M6 9h12l-1 11H7L6 9Z', 'M9 13h6'],
  reminder: ['M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z', 'M10 21h4'],
  vet: [
    'M12 3a7 7 0 0 0-7 7v3a4 4 0 0 0 4 4h1v-5H7v-2a5 5 0 1 1 10 0v2h-3v5h1a4 4 0 0 0 4-4v-3a7 7 0 0 0-7-7Z',
    'M12 9v6M9 12h6',
  ],
  file: ['M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M14 3v5h5M8 13h8M8 17h5'],
  memory: [
    'M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z',
    'M8 15l2.4-2.4 2.1 2.1L15.5 11 20 15.5',
    'M9 9h.01',
  ],
  camera: [
    'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z',
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  ],
  play: ['M8 5v14l11-7L8 5Z'],
  trophy: [
    'M8 4h8v4a4 4 0 0 1-8 0V4Z',
    'M6 5H4v2a4 4 0 0 0 4 4M18 5h2v2a4 4 0 0 1-4 4',
    'M12 12v5M9 20h6M10 17h4',
  ],
  heart: ['M20.8 8.6c0 5.1-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.6A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.8 1.8Z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  product: ['M6 7h12l-1.2 13H7.2L6 7Z', 'M9 7a3 3 0 0 1 6 0', 'M9 12h6'],
  hospital: ['M4 20h16V8l-8-5-8 5v12Z', 'M12 9v7M8.5 12.5h7'],
  settings: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M18.4 18.4 17 17M18.4 5.6 17 7M5.6 18.4 7 17',
  ],
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12.5l4 4L19 6.5'],
  upload: ['M12 16V5M8 9l4-4 4 4', 'M5 19h14'],
  water: ['M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z', 'M9 15a3 3 0 0 0 5 2.2'],
  walk: ['M13 5a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z', 'M10 8l-2 5 4 2 2 5M11 9l4 3 3-1M8 13l-3 6'],
  brush: ['M4 20l11-11M14 4l6 6-3 3-6-6 3-3Z', 'M6 18l-2 2M9 15l-2 2M12 12l-2 2'],
  sparkle: ['M12 3l1.7 4.4L18 9.1l-4.3 1.7L12 15l-1.7-4.2L6 9.1l4.3-1.7L12 3Z'],
  refresh: ['M20 11a8 8 0 0 0-14.7-4M4 7V3h4', 'M4 13a8 8 0 0 0 14.7 4M20 17v4h-4'],
  skip: ['M5 5l7 7-7 7M12 5l7 7-7 7'],
  edit: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M13.5 8.5l2 2'],
}
</script>

<template>
  <svg
    class="app-icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      v-for="path in paths[props.name] || paths.pet"
      :key="path"
      :d="path"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
