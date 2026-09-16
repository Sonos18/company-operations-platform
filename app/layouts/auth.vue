<template>
  <main class="auth-layout">
    <section class="auth-layout__brand" aria-label="Taskovia">
      <p class="eyebrow">Taskovia</p>
      <p class="auth-layout__statement">Vận hành dự án, rõ ràng từng bước.</p>
      <p>Không gian làm việc riêng cho đội ngũ của bạn.</p>
    </section>
    <section class="auth-layout__content">
      <slot />
    </section>
  </main>
</template>

<style scoped>
.auth-layout {
  display: grid;
  min-height: 100vh;
  background: var(--app-background);
  background-attachment: fixed;
  grid-template-columns: minmax(280px, .9fr) minmax(0, 1.1fr);
}

.auth-layout__brand {
  display: grid;
  align-content: center;
  gap: 16px;
  padding: clamp(32px, 8vw, 96px);
  background:
    radial-gradient(circle at 15% 20%, rgba(29, 78, 216, 0.28), transparent 45%),
    radial-gradient(circle at 85% 75%, rgba(14, 165, 165, 0.22), transparent 45%),
    #0f172a;
  color: #ffffff;
}

.auth-layout__brand .eyebrow {
  color: var(--color-accent);
  font-family: var(--font-mono);
  letter-spacing: 0.12em;
}

.auth-layout__statement {
  margin: 0;
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: clamp(2rem, 4vw, 4.2rem);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.03em;
}

.auth-layout__brand p:last-child {
  max-width: 32rem;
  color: #94a3b8;
  font-size: 1.05rem;
  line-height: 1.6;
}

.auth-layout__content {
  display: grid;
  align-content: center;
  justify-items: center;
  padding: clamp(24px, 6vw, 72px);
}

@media (max-width: 767px) {
  .auth-layout { grid-template-columns: 1fr; }
  .auth-layout__brand {
    min-height: auto;
    gap: 8px;
    padding: 28px 24px;
  }
  .auth-layout__statement { font-size: 1.85rem; }
  .auth-layout__brand p:last-child { display: none; }
  .auth-layout__content { align-content: start; padding: 28px 18px; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
</style>
