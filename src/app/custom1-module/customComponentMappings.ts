import { SelfCollectionQrComponent } from '../self-collection-qr/self-collection-qr.component';

export const REQUESTS_TAB_SELECTORS = [
  'nde-requests',
  'nde-requests-after',
];

export const selectorComponentMap = new Map<string, any>([
  ...REQUESTS_TAB_SELECTORS.map(selector => [selector, SelfCollectionQrComponent] as [string, any]),
]);
