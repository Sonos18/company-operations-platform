import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
    materialQuotationOpenaiApiKey: '',
    supabaseServiceRoleKey: '',
    public: {
      appUrl: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
  nitro: {
    hooks: {
      async compiled(nitro) {
        const destination = join(nitro.options.output.serverDir, 'cost-ocr')
        await mkdir(destination, { recursive: true })
        for (const name of ['azure-f0-image-worker.mjs', 'azure-f0-image-decoder.mjs', 'azure-f0-image-execution.mjs']) {
          await copyFile(fileURLToPath(new URL('./server/features/costs/extraction/' + name, import.meta.url)), join(destination, name))
        }
      },
    },
    // Dynamic createRequire decoders must survive detached server deployment.
    externals: {
      traceInclude: [
        require.resolve('pngjs'), require.resolve('jpeg-js'),
        require.resolve('pngjs/LICENSE'), require.resolve('jpeg-js/LICENSE'),
      ],
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
        { name: "theme-color", content: "#1d4ed8" },
      ],
    },
  },
});
