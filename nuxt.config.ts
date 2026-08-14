export default defineNuxtConfig({
  compatibilityDate: "2026-08-13",
  ssr: false,
  modules: ["@nuxt/ui", "@nuxt/eslint"],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "vi" },
      title: "Nền tảng vận hành dự án",
      meta: [
        {
          name: "description",
          content: "Prototype quản trị hành trình dự án cho Việt Quốc Huy.",
        },
        { name: "theme-color", content: "#1A3C2B" },
      ],
    },
  },
});
