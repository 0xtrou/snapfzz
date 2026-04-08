import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

window.getComputedStyle = () => ({
  getPropertyValue: () => '',
  setProperty: () => {},
  removeProperty: () => '',
  length: 0,
  item: () => '',
} as unknown as CSSStyleDeclaration);

if (!document.documentElement.style.setProperty) {
  const _props: Record<string, string> = {};
  Object.defineProperty(document.documentElement, 'style', {
    configurable: true,
    get: () => ({
      setProperty: (prop: string, val: string) => { _props[prop] = val; },
      getPropertyValue: (prop: string) => _props[prop] ?? '',
      removeProperty: (prop: string) => { delete _props[prop]; return ''; },
    }),
  });
}

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: MockResizeObserver,
});

if (!HTMLElement.prototype.scrollTo) {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}
