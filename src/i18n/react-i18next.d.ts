import 'i18next';

import { defaultNamespace } from '@/i18n/config';
import { resources } from '@/i18n/resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    resources: (typeof resources)['sv'];
  }
}
