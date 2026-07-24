import type { CapacitorConfig } from '@capacitor/cli';

// 开发模式：设为 true 时从 Vite dev server 加载（需先运行 pnpm dev:web）
// 生产模式：设为 false 时从打包的 H5 文件加载（需先运行 pnpm build:web）
const DEV_MODE = process.env.CAP_DEV === 'true';
const DEV_SERVER_URL = process.env.CAP_DEV_URL || 'http://10.0.2.2:5000';

const config: CapacitorConfig = {
  appId: 'com.goodcopbadcop.app',
  appName: '无间疑云',
  webDir: 'dist-web',
  server: {
    androidScheme: 'http',
    ...(DEV_MODE ? { url: DEV_SERVER_URL } : {}),
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
