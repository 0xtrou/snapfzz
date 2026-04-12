import '@testing-library/jest-dom';

// Mock navigator.clipboard for SubPackCard copy-path button
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: {
      writeText: () => Promise.resolve(),
      readText: () => Promise.resolve(''),
    },
  });
}

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
