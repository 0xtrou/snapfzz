import '@testing-library/jest-dom';

// PretextGrid → useContainerWidth uses ResizeObserver. jsdom doesn't provide
// one, so we stub it. The callback fires synchronously on observe() with a
// fake contentRect.width matching the element's clientWidth (defaults to 800
// when jsdom doesn't compute layout).
class ResizeObserverStub {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    const width = (target as HTMLElement).clientWidth || 800;
    this.cb(
      [{ contentRect: { width, height: 0 } } as unknown as ResizeObserverEntry],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
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