// Per U009/DesignSystem: shared button component enforcing Snapfzz outline style.
// All plugins use this instead of raw Ant Design <Button>. Prevents style drift.
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

export interface AppButtonProps extends Omit<ButtonProps, 'type' | 'ghost'> {
  variant?: 'default' | 'danger' | 'text' | 'link';
}

export function AppButton({ variant = 'default', ...props }: AppButtonProps) {
  if (variant === 'danger') {
    return <Button {...props} danger />;
  }
  if (variant === 'text') {
    return <Button {...props} type="text" />;
  }
  if (variant === 'link') {
    return <Button {...props} type="link" />;
  }
  return <Button {...props} />;
}
