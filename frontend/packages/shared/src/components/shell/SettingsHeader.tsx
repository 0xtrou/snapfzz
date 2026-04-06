import type { ReactNode } from 'react';

interface SettingsHeaderProps {
  title: string;
  isDirty?: boolean;
  saving?: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  onSave?: () => void;
  onDiscard?: () => void;
  children?: ReactNode;
}

export function SettingsHeader({
  title,
  isDirty = false,
  saving = false,
  saveSuccess = false,
  saveError = null,
  onSave,
  onDiscard,
  children,
}: SettingsHeaderProps) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {saveSuccess && (
          <span style={{ color: 'var(--color-success)', fontSize: 12 }}>Saved</span>
        )}
        {saveError && (
          <span style={{ color: 'var(--color-error)', fontSize: 12 }}>{saveError}</span>
        )}
        {children}
        {onSave && (
          <>
            {isDirty && onDiscard && (
              <button
                type="button"
                onClick={onDiscard}
                style={{
                  padding: '4px 12px',
                  background: 'none',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !isDirty}
              style={{
                padding: '4px 12px',
                background: isDirty ? 'var(--accent)' : 'var(--bg-subtle)',
                color: isDirty ? 'var(--bg-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                cursor: isDirty && !saving ? 'pointer' : 'default',
                opacity: isDirty ? 1 : 0.5,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
