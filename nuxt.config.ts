import { createRequire } from 'node:module'
import { PRODUCT_BRAND } from './shared/constants/product-brand'

const require = createRequire(import.meta.url)

export default defineNuxtConfig({
  compatibilityDate: "2026-08-13",
  ssr: false,
  modules: ["@nuxt/ui", "@nuxt/eslint", '@pinia/nuxt'],
  pinia: {
    storesDirs: ['./app/stores/**'],
  },
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  runtimeConfig: {
    supabaseServiceRoleKey: '',
    public: {
      appUrl: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
  nitro: {
    // Dynamic createRequire decoders must survive detached server deployment.
    externals: { traceInclude: [require.resolve('pngjs'), require.resolve('jpeg-js')] },
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
        { name: "theme-color", content: "#1d4ed8" },
      ],
    },
  },
});
