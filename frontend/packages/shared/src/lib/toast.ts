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

export function setToastAPI(api: ToastAPI): void {
  _toastAPI = api;
}

export function getToastAPI(): ToastAPI | null {
  return _toastAPI;
}

export async function invokeWithToast<T>(
  bridge: TauriBridge,
  command: string,
  args: Record<string, unknown> | undefined,
  options: ToastOptions = {},
): Promise<T> {
  const {
    successMessage,
    errorMessage,
    showSuccessToast = true,
    showErrorToast = true,
  } = options;

  try {
    const result = await bridge.invoke<T>(command, args);

    if (showSuccessToast && successMessage && _toastAPI) {
      _toastAPI.success(successMessage);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (showErrorToast && _toastAPI) {
      _toastAPI.error(errorMessage || message);
    }

    throw error;
  }
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