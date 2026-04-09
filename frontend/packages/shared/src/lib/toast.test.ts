import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiErrorResponseError,
  getToastAPI,
  parseAndToastResponse,
  setToastAPI,
} from './toast';
import type { ApiResponse } from './api-response';

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
});
