import type { CapacitorConfig } from '@capacitor/cli'

const devServerUrl = process.env.CAPACITOR_SERVER_URL?.trim()

const config: CapacitorConfig = {
  appId: 'com.petai.manager',
  appName: '宠物 AI 管家',
  webDir: 'dist',
  server: devServerUrl
    ? {
        url: devServerUrl,
        cleartext: devServerUrl.startsWith('http://'),
      }
    : undefined,
  android: {
    allowMixedContent: true,
  },
}

export default config
