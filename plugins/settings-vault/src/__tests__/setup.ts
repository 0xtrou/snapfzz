import '@testing-library/jest-dom';

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
      setProperty: (prop: string, val: string) => {
        _props[prop] = val;
      },
      getPropertyValue: (prop: string) => _props[prop] ?? '',
      removeProperty: (prop: string) => {
        delete _props[prop];
        return '';
      },
    }),
  });
}
