import { useState, useMemo } from 'react';
import { formatTokens, formatCost, formatPercent, SHARE_COLORS } from './shared';

export interface BreakdownRow {
  name: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  share: number; // 0-100 percentage
}

export interface BreakdownTableProps {
  title: string;
  rows: BreakdownRow[];
  nameHeader?: string;
  filterPlaceholder?: string;
}

type SortKey = keyof Omit<BreakdownRow, 'name'>;

const COL_WIDTHS = {
  name: '1fr',
  requests: '80px',
  inputTokens: '80px',
  outputTokens: '80px',
  totalTokens: '90px',
  cost: '80px',
  share: '110px',
};

const GRID_TEMPLATE = `${COL_WIDTHS.name} ${COL_WIDTHS.requests} ${COL_WIDTHS.inputTokens} ${COL_WIDTHS.outputTokens} ${COL_WIDTHS.totalTokens} ${COL_WIDTHS.cost} ${COL_WIDTHS.share}`;

const headerCellStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  padding: '0 8px 8px 0',
  cursor: 'pointer',
  userSelect: 'none',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 8px 6px 0',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  textAlign: 'right',
  lineHeight: 1.4,
};

function SortArrow({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        marginLeft: 3,
        opacity: active ? 1 : 0.3,
        fontSize: 9,
        verticalAlign: 'middle',
      }}
    >
      {active && !asc ? '▲' : '▼'}
    </span>
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <div
        style={{
          flex: 1,
          maxWidth: 56,
          height: 4,
          background: 'var(--bg-subtle)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(share, 100)}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right' }}>
        {formatPercent(share)}
      </span>
    </div>
  );
}

export function BreakdownTable({ title, rows, nameHeader = 'NAME', filterPlaceholder }: BreakdownTableProps) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalTokens');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedRows = useMemo(() => {
    const filtered = filter
      ? rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
      : rows;
    return [...filtered].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    }).slice(0, 10);
  }, [rows, filter, sortKey, sortAsc]);

  const colHeader = (label: string, key: SortKey) => (
    <div
      style={{ ...headerCellStyle }}
      onClick={() => handleSort(key)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleSort(key)}
    >
      {label}
      <SortArrow active={sortKey === key} asc={sortAsc} />
    </div>
  );

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '16px 20px',
      }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span
          style={{
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {title}
        </span>
        {filterPlaceholder !== undefined && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={filterPlaceholder}
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '3px 8px',
              outline: 'none',
              width: 160,
            }}
          />
        )}
      </div>

      {/* Grid wrapper */}
      <div style={{ overflowX: 'auto' }}>
        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID_TEMPLATE,
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: 2,
          }}
        >
          <div style={{ ...headerCellStyle, textAlign: 'left', cursor: 'default' }}>{nameHeader}</div>
          {colHeader('REQUESTS', 'requests')}
          {colHeader('INPUT', 'inputTokens')}
          {colHeader('OUTPUT', 'outputTokens')}
          {colHeader('TOTAL', 'totalTokens')}
          {colHeader('COST', 'cost')}
          {colHeader('SHARE', 'share')}
        </div>

        {/* Rows */}
        {sortedRows.length === 0 ? (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No data
          </div>
        ) : (
          sortedRows.map((row, i) => {
            const color = SHARE_COLORS[i % SHARE_COLORS.length];
            const costColor = row.cost === 0 ? 'var(--color-success)' : 'var(--color-gold)';
            return (
              <div
                key={row.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_TEMPLATE,
                  borderBottom: i < sortedRows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                }}
              >
                {/* Name cell */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name}
                  </span>
                </div>

                {/* Requests */}
                <div style={{ ...cellStyle, color: 'var(--text-secondary)' }}>
                  {row.requests.toLocaleString()}
                </div>

                {/* Input tokens */}
                <div style={{ ...cellStyle, color: 'var(--color-success)' }}>
                  {formatTokens(row.inputTokens)}
                </div>

                {/* Output tokens */}
                <div style={{ ...cellStyle, color: 'var(--color-cyan)' }}>
                  {formatTokens(row.outputTokens)}
                </div>

                {/* Total tokens */}
                <div style={{ ...cellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatTokens(row.totalTokens)}
                </div>

                {/* Cost */}
                <div style={{ ...cellStyle, color: costColor }}>
                  {formatCost(row.cost)}
                </div>

                {/* Share */}
                <div style={{ ...cellStyle, padding: '6px 0' }}>
                  <ShareBar share={row.share} color={color} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
