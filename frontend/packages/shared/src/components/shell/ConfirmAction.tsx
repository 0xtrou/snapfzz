// Per U009/DesignSystem: shared confirmation popover with consistent dark mode styling.
// All confirm-before-destructive-action patterns use this instead of raw Popconfirm.
import type { ReactNode } from 'react';
import { Popconfirm } from 'antd';
import type { PopconfirmProps } from 'antd';

export interface ConfirmActionProps {
  title: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function ConfirmAction({
  title,
  description,
  onConfirm,
  okText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  disabled = false,
  children,
}: ConfirmActionProps) {
  const okButtonProps: PopconfirmProps['okButtonProps'] = {
    type: 'primary',
    ...(danger ? { danger: true } : {}),
  };

  return (
    <Popconfirm
      title={title}
      description={description}
      onConfirm={onConfirm}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={okButtonProps}
      disabled={disabled}
    >
      {children}
    </Popconfirm>
  );
}
