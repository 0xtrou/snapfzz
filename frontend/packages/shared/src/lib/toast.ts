import type { ApiResponse, ApiError } from './api-response';
import type { TauriBridge } from './tauri-bridge';

export interface ToastOptions {
  successMessage?: string;
  errorMessage?: string;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
}

export interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
}

let _toastAPI: ToastAPI | null = null;

export function setToastAPI(api: ToastAPI | null): void {
  _toastAPI = api;
}

export function getToastAPI(): ToastAPI | null {
  return _toastAPI;
}

export async function parseAndToastResponse<T>(
  response: ApiResponse<T>,
  options: ToastOptions = {},
): Promise<T> {
  const {
    successMessage,
    errorMessage,
    showSuccessToast = true,
    showErrorToast = true,
  } = options;

  if (response.success) {
    if (showSuccessToast && successMessage && _toastAPI) {
      _toastAPI.success(successMessage);
    }
    return response.data as T;
  }

  const error = response.error;
  const message = errorMessage || error?.message || 'An error occurred';

  if (showErrorToast && _toastAPI) {
    _toastAPI.error(message);
  }

  throw new ApiErrorResponseError(error);
}

export class ApiErrorResponseError extends Error {
  public readonly error?: ApiError;

  constructor(error?: ApiError) {
    super(error?.message || 'An error occurred');
    this.name = 'ApiErrorResponseError';
    this.error = error;
  }
}

export async function invokeWithToast<T>(
  bridge: TauriBridge,
  command: string,
  args: Record<string, unknown> | undefined,
  options: ToastOptions = {},
): Promise<T> {
  const response = await bridge.invoke<ApiResponse<T>>(command, args);
  return parseAndToastResponse(response, options);
}

export function createToastedBridge(bridge: TauriBridge) {
  return {
    invoke: <T>(
      command: string,
      args?: Record<string, unknown>,
      options?: ToastOptions,
    ): Promise<T> => invokeWithToast<T>(bridge, command, args, options),
    
    listen: bridge.listen.bind(bridge),
    
    get isAvailable() {
      return bridge.isAvailable;
    },
  };
}