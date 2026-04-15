import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiErrorResponseError,
  createToastedBridge,
  getToastAPI,
  invokeWithToast,
  parseAndToastResponse,
  setToastAPI,
} from './toast';
import type { ApiResponse } from './api-response';
import type { TauriBridge } from './tauri-bridge';

describe('toast response helpers', () => {
  const success = vi.fn();
  const error = vi.fn();

  beforeEach(() => {
    success.mockReset();
    error.mockReset();
    setToastAPI({ success, error });
  });

  it('parseAndToastResponse returns data and emits success toast on success', async () => {
    const response: ApiResponse<string> = {
      success: true,
      data: 'ok',
    };

    await expect(
      parseAndToastResponse(response, { successMessage: 'Installed successfully' }),
    ).resolves.toBe('ok');
    expect(success).toHaveBeenCalledWith('Installed successfully');
    expect(error).not.toHaveBeenCalled();
  });

  it('parseAndToastResponse throws typed error and emits error toast on failure', async () => {
    const response: ApiResponse<string> = {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        message: 'Install failed',
      },
    };

    await expect(
      parseAndToastResponse(response, { errorMessage: 'Custom install failure' }),
    ).rejects.toMatchObject({
      name: 'ApiErrorResponseError',
      message: 'Install failed',
      error: response.error,
    });
    expect(error).toHaveBeenCalledWith('Custom install failure');
    expect(success).not.toHaveBeenCalled();
  });

  it('ApiErrorResponseError keeps the original api error payload', () => {
    const apiError = {
      code: 'NOT_FOUND',
      message: 'Missing thing',
      details: { id: 'abc' },
    };

    const wrapped = new ApiErrorResponseError(apiError);

    expect(wrapped.name).toBe('ApiErrorResponseError');
    expect(wrapped.message).toBe('Missing thing');
    expect(wrapped.error).toEqual(apiError);
  });

  it('getToastAPI returns the registered toast api', () => {
    expect(getToastAPI()).toEqual({ success, error });
  });

  it('parseAndToastResponse returns data without toast when showSuccessToast is false', async () => {
    const response: ApiResponse<number> = { success: true, data: 42 };
    await expect(
      parseAndToastResponse(response, { showSuccessToast: false }),
    ).resolves.toBe(42);
    expect(success).not.toHaveBeenCalled();
  });

  it('parseAndToastResponse throws without toast when showErrorToast is false', async () => {
    const response: ApiResponse<number> = {
      success: false,
      error: { code: 'ERR', message: 'boom' },
    };
    await expect(
      parseAndToastResponse(response, { showErrorToast: false }),
    ).rejects.toBeInstanceOf(ApiErrorResponseError);
    expect(error).not.toHaveBeenCalled();
  });

  it('parseAndToastResponse uses error.message when no custom errorMessage provided', async () => {
    const response: ApiResponse<number> = {
      success: false,
      error: { code: 'ERR', message: 'server error' },
    };
    await expect(parseAndToastResponse(response)).rejects.toThrow('server error');
    expect(error).toHaveBeenCalledWith('server error');
  });

  it('parseAndToastResponse uses fallback message when no error provided', async () => {
    const response: ApiResponse<number> = { success: false };
    await expect(parseAndToastResponse(response)).rejects.toThrow('An error occurred');
    expect(error).toHaveBeenCalledWith('An error occurred');
  });

  it('ApiErrorResponseError uses fallback message when no error provided', () => {
    const wrapped = new ApiErrorResponseError(undefined);
    expect(wrapped.message).toBe('An error occurred');
    expect(wrapped.error).toBeUndefined();
  });
});

describe('invokeWithToast', () => {
  const success = vi.fn();
  const errorFn = vi.fn();

  beforeEach(() => {
    success.mockReset();
    errorFn.mockReset();
    setToastAPI({ success, error: errorFn });
  });

  it('invokes bridge command and returns parsed data on success', async () => {
    const bridge: TauriBridge = {
      invoke: vi.fn().mockResolvedValue({ success: true, data: 'result' }),
      listen: vi.fn(),
      isAvailable: true,
    };

    const result = await invokeWithToast<string>(bridge, 'my_command', { id: 1 }, {
      successMessage: 'Done',
    });

    expect(result).toBe('result');
    expect(bridge.invoke).toHaveBeenCalledWith('my_command', { id: 1 });
    expect(success).toHaveBeenCalledWith('Done');
  });

  it('invokes bridge command and throws on failure', async () => {
    const bridge: TauriBridge = {
      invoke: vi.fn().mockResolvedValue({ success: false, error: { code: 'E', message: 'fail' } }),
      listen: vi.fn(),
      isAvailable: true,
    };

    await expect(invokeWithToast(bridge, 'cmd', undefined)).rejects.toBeInstanceOf(ApiErrorResponseError);
    expect(errorFn).toHaveBeenCalledWith('fail');
  });
});

describe('fetchWithToast', () => {
  const success = vi.fn();
  const errorFn = vi.fn();

  beforeEach(async () => {
    success.mockReset();
    errorFn.mockReset();
    setToastAPI({ success, error: errorFn });
  });

  it('returns data on successful fn', async () => {
    const { fetchWithToast } = await import('./toast');
    const result = await fetchWithToast(() => Promise.resolve('value'));
    expect(result).toEqual({ data: 'value' });
  });

  it('returns error on thrown fn', async () => {
    const { fetchWithToast } = await import('./toast');
    const result = await fetchWithToast(() => Promise.reject(new Error('boom')));
    expect(result).toMatchObject({ error: expect.objectContaining({ message: 'boom' }) });
    expect(result.data).toBeUndefined();
  });

  it('shows success toast when successMessage is provided', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.resolve(42), { successMessage: 'All good' });
    expect(success).toHaveBeenCalledWith('All good');
  });

  it('does not show success toast when showSuccessToast is false', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.resolve(42), {
      successMessage: 'All good',
      showSuccessToast: false,
    });
    expect(success).not.toHaveBeenCalled();
  });

  it('does not show success toast when no successMessage', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.resolve(42), { showSuccessToast: true });
    expect(success).not.toHaveBeenCalled();
  });

  it('shows error toast with errorMessage on failure', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.reject(new Error('orig')), {
      errorMessage: 'Custom error',
    });
    expect(errorFn).toHaveBeenCalledWith('Custom error');
  });

  it('shows error toast with error.message when no errorMessage provided', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.reject(new Error('orig error')));
    expect(errorFn).toHaveBeenCalledWith('orig error');
  });

  it('does not show error toast when showErrorToast is false', async () => {
    const { fetchWithToast } = await import('./toast');
    await fetchWithToast(() => Promise.reject(new Error('boom')), { showErrorToast: false });
    expect(errorFn).not.toHaveBeenCalled();
  });

  it('wraps non-Error thrown values into an Error', async () => {
    const { fetchWithToast } = await import('./toast');
    const result = await fetchWithToast(() => Promise.reject('string error'));
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('string error');
  });

  it('shows no toast when toastAPI is null', async () => {
    const { fetchWithToast, setToastAPI: set } = await import('./toast');
    set(null);
    const result = await fetchWithToast(() => Promise.resolve(1), { successMessage: 'hi' });
    expect(result).toEqual({ data: 1 });
    expect(success).not.toHaveBeenCalled();
  });
});

describe('createToastedBridge', () => {
  const success = vi.fn();
  const errorFn = vi.fn();

  beforeEach(() => {
    success.mockReset();
    errorFn.mockReset();
    setToastAPI({ success, error: errorFn });
  });

  it('invoke delegates to invokeWithToast and returns data', async () => {
    const bridge: TauriBridge = {
      invoke: vi.fn().mockResolvedValue({ success: true, data: 'hello' }),
      listen: vi.fn(),
      isAvailable: true,
    };
    const toasted = createToastedBridge(bridge);

    const result = await toasted.invoke<string>('greet', undefined, { successMessage: 'Hi' });

    expect(result).toBe('hello');
    expect(success).toHaveBeenCalledWith('Hi');
  });

  it('listen delegates to the underlying bridge', async () => {
    const unlisten = vi.fn();
    const bridge: TauriBridge = {
      invoke: vi.fn(),
      listen: vi.fn().mockResolvedValue(unlisten),
      isAvailable: true,
    };
    const toasted = createToastedBridge(bridge);

    const handler = vi.fn();
    const result = await toasted.listen('event', handler);

    expect(bridge.listen).toHaveBeenCalledWith('event', handler);
    expect(result).toBe(unlisten);
  });

  it('isAvailable reflects the underlying bridge', () => {
    const bridge: TauriBridge = {
      invoke: vi.fn(),
      listen: vi.fn(),
      isAvailable: false,
    };
    const toasted = createToastedBridge(bridge);

    expect(toasted.isAvailable).toBe(false);
  });
});
