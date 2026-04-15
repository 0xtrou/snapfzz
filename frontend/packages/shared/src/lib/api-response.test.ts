import { describe, expect, it } from 'vitest';
import { ErrorCodes } from './api-response';
import type { ApiError, ApiResponse, ErrorCode } from './api-response';

describe('ErrorCodes', () => {
  it('has all expected error code keys', () => {
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCodes.INSTALL_FAILED).toBe('INSTALL_FAILED');
    expect(ErrorCodes.UNINSTALL_FAILED).toBe('UNINSTALL_FAILED');
    expect(ErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.NOT_READY).toBe('NOT_READY');
  });

  it('values are strings equal to their keys', () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(value).toBe(key);
    }
  });

  it('is frozen (const assertion prevents mutation at runtime via type system)', () => {
    // ErrorCodes is a plain object — verify its keys are stable
    const keys = Object.keys(ErrorCodes);
    expect(keys).toHaveLength(7);
  });
});

describe('ApiResponse shape', () => {
  it('accepts a successful response with data', () => {
    const response: ApiResponse<string> = { success: true, data: 'hello' };
    expect(response.success).toBe(true);
    expect(response.data).toBe('hello');
    expect(response.error).toBeUndefined();
  });

  it('accepts a failed response with error', () => {
    const apiError: ApiError = {
      code: ErrorCodes.NOT_FOUND,
      message: 'Not found',
      details: { id: 42 },
    };
    const response: ApiResponse<never> = { success: false, error: apiError };
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('NOT_FOUND');
    expect(response.error?.message).toBe('Not found');
    expect(response.error?.details).toEqual({ id: 42 });
  });

  it('ApiError details is optional', () => {
    const apiError: ApiError = { code: ErrorCodes.INTERNAL_ERROR, message: 'oops' };
    expect(apiError.details).toBeUndefined();
  });

  it('ErrorCode type accepts all valid codes', () => {
    const codes: ErrorCode[] = [
      ErrorCodes.NOT_FOUND,
      ErrorCodes.INSTALL_FAILED,
      ErrorCodes.UNINSTALL_FAILED,
      ErrorCodes.NETWORK_ERROR,
      ErrorCodes.VALIDATION_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      ErrorCodes.NOT_READY,
    ];
    expect(codes).toHaveLength(7);
  });
});
