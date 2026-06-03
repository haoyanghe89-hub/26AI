<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    species?: 'cat' | 'dog' | 'other'
    avatarUrl?: string
    initial?: string
    success?: boolean
  }>(),
  {
    species: 'dog',
    avatarUrl: '',
    initial: '宠',
    success: false,
  },
)
</script>

<template>
  <div class="mascot-stage" :class="[{ success: props.success }, `species-${props.species}`]">
    <span class="halo halo-one"></span>
    <span class="halo halo-two"></span>
    <span class="particle particle-one"></span>
    <span class="particle particle-two"></span>
    <span class="particle particle-three"></span>
    <span class="particle particle-four"></span>

    <div class="pet-figure">
      <img v-if="props.avatarUrl" :src="props.avatarUrl" class="pet-avatar-img" alt="宠物头像" />
      <img
        v-else-if="props.species === 'cat'"
        src="/assets/images/cat-avatar.png"
        class="pet-avatar-img"
        alt="猫咪"
      />
      <img v-else src="/assets/images/dog-avatar.png" class="pet-avatar-img" alt="狗狗" />

      <div class="name-tag">
        <span>{{ props.initial.slice(0, 1) }}</span>
      </div>
    </div>

    <div class="success-burst" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>
</template>

<style scoped>
.mascot-stage {
  position: relative;
  display: grid;
  width: min(62vw, 260px);
  aspect-ratio: 1;
  place-items: center;
  margin: 0 auto;
  isolation: isolate;
}

.halo,
.particle {
  position: absolute;
  pointer-events: none;
}

.halo {
  border-radius: 999px;
  background: rgba(255, 241, 221, 0.82);
  box-shadow: 0 26px 66px rgba(177, 112, 55, 0.14);
}

.halo-one {
  inset: 11%;
  animation: halo-pulse 4s ease-in-out infinite;
}

.halo-two {
  inset: 25%;
  background: rgba(255, 252, 246, 0.9);
  animation: halo-pulse 4.8s ease-in-out 0.4s infinite;
}

.pet-figure {
  position: relative;
  z-index: 2;
  width: 70%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: mascot-breathe 2.9s ease-in-out infinite;
}

.pet-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  box-shadow: 0 12px 26px rgba(142, 86, 43, 0.16);
}

.name-tag {
  position: absolute;
  bottom: -10px;
  background: #fff8ef;
  border: 2px solid rgba(116, 67, 40, 0.16);
  color: #c96f3a;
  font-size: 18px;
  font-weight: 950;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 8px rgba(142, 86, 43, 0.1);
}

.particle {
  z-index: 1;
  width: 17px;
  height: 17px;
  border-radius: 999px;
  opacity: 0.34;
  animation: particle-float 3.8s ease-in-out infinite;
}

.particle::before,
.particle::after {
  position: absolute;
  content: '';
  border-radius: 999px;
  background: #d9824b;
}

.particle::before {
  inset: 6px 3px 2px;
}

.particle::after {
  inset: 1px 5px 10px;
  box-shadow:
    -5px 5px 0 #d9824b,
    5px 5px 0 #d9824b;
}

.particle-one {
  left: 19%;
  top: 20%;
}

.particle-two {
  right: 17%;
  top: 31%;
  animation-delay: 0.4s;
}

.particle-three {
  left: 25%;
  bottom: 18%;
  animation-delay: 0.9s;
}

.particle-four {
  right: 22%;
  bottom: 22%;
  animation-delay: 1.3s;
}

.success-burst {
  position: absolute;
  inset: 20%;
  z-index: 3;
  pointer-events: none;
}

.success-burst span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #d9824b;
  opacity: 0;
}

.success .success-burst span {
  animation: burst 660ms ease-out both;
}

.success .success-burst span:nth-child(1) {
  --x: -88px;
  --y: -46px;
}

.success .success-burst span:nth-child(2) {
  --x: 82px;
  --y: -62px;
  animation-delay: 50ms;
}

.success .success-burst span:nth-child(3) {
  --x: -72px;
  --y: 72px;
  animation-delay: 90ms;
}

.success .success-burst span:nth-child(4) {
  --x: 78px;
  --y: 62px;
  animation-delay: 120ms;
}

.success .success-burst span:nth-child(5) {
  --x: 0;
  --y: -96px;
  animation-delay: 150ms;
}

@keyframes mascot-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-8px) scale(1.018);
  }
}

@keyframes halo-pulse {
  50% {
    transform: scale(1.045);
    opacity: 0.72;
  }
}

@keyframes particle-float {
  50% {
    transform: translateY(-10px) rotate(8deg);
    opacity: 0.48;
  }
}

@keyframes burst {
  from {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(0.4);
  }
  to {
    opacity: 0;
    transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.12);
  }
}
</style>
