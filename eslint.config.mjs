import { globalIgnores } from 'eslint/config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  globalIgnores(['supabase/.temp/'], 'Ignore Supabase local generated files'),
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
)
