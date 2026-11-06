import { mergeConfig } from 'vite';
import baseConfig from './vite.config';

export default mergeConfig(baseConfig, {
  server: {
    allowedHosts: ['3000-ic7c3rk1o4fuv7b5osrm6-98b88ca1.sg2.manus.computer'],
  },
});
