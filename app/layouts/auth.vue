<template>
  <main class="auth-layout">
    <section class="auth-layout__brand" aria-label="Taskovia">
      <p class="eyebrow">Taskovia</p>
      <h1>Vận hành dự án, rõ ràng từng bước.</h1>
      <p>Không gian làm việc riêng cho đội ngũ của bạn.</p>
    </section>
    <section class="auth-layout__content">
      <slot />
    </section>
  </main>
</template>

<style scoped>
.auth-layout { display: grid; min-height: 100vh; background: var(--paper); grid-template-columns: minmax(280px, .9fr) minmax(0, 1.1fr); }
.auth-layout__brand { display: grid; align-content: center; gap: 16px; padding: clamp(32px, 8vw, 96px); background: var(--forest-deep); color: var(--paper); }.auth-layout__brand .eyebrow { color: var(--mint); }.auth-layout__brand h1 { color: var(--paper); font-size: clamp(2rem, 4vw, 4.2rem); line-height: 1.04; }.auth-layout__brand p:last-child { max-width: 32rem; color: #d9e6dc; line-height: 1.6; }
.auth-layout__content { display: grid; align-content: center; justify-items: center; padding: clamp(24px, 6vw, 72px); }
@media (max-width: 767px) { .auth-layout { grid-template-columns: 1fr; }.auth-layout__brand { min-height: auto; gap: 8px; padding: 28px 24px; }.auth-layout__brand h1 { font-size: 1.85rem; }.auth-layout__brand p:last-child { display: none; }.auth-layout__content { align-content: start; padding: 28px 18px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
