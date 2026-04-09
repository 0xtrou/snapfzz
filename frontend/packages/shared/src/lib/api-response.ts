export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  INSTALL_FAILED: 'INSTALL_FAILED',
  UNINSTALL_FAILED: 'UNINSTALL_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_READY: 'NOT_READY',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
