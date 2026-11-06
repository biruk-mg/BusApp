import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Database tests share one database, so run the files one after another
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
