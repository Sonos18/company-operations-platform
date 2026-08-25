import { PRODUCT_BRAND } from './shared/constants/product-brand'

export default defineNuxtConfig({
  compatibilityDate: "2026-08-13",
  ssr: false,
  modules: ["@nuxt/ui", "@nuxt/eslint", '@pinia/nuxt'],
  pinia: {
    storesDirs: ['./app/stores/**'],
  },
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  runtimeConfig: {
    supabaseServiceRoleKey: '',
    taskoviaSupabaseServiceRoleKey: '',
    public: {
      appUrl: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
      taskoviaSupabaseUrl: '',
      taskoviaSupabaseAnonKey: '',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "vi" },
      title: `${PRODUCT_BRAND.name} — ${PRODUCT_BRAND.tagline}`,
      meta: [
        {
          name: "description",
          content: PRODUCT_BRAND.description,
        },
        { name: "theme-color", content: "#1A3C2B" },
      ],
    },
  },
});
