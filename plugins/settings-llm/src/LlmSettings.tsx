import { useState } from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, KeyOutlined, SwapOutlined, FileTextOutlined, BarChartOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { SettingsHeader } from '@snapfzz/shared';
import ProvidersTab from './tabs/ProvidersTab';
import ApiKeysTab from './tabs/ApiKeysTab';
import RoutingTab from './tabs/RoutingTab';
import AuditLogTab from './tabs/AuditLogTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import CacheTab from './tabs/CacheTab';

const iconStyle = { marginRight: 6 };

export default function LlmSettings() {
  const [activeKey, setActiveKey] = useState('providers');

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader
        title="LLM Providers"
        subtitle="Manage LLM providers, virtual keys with budgets, routing strategies, and view spend audit logs."
      />
      <div style={{ padding: '24px 32px', background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, margin: '16px 16px 24px' }}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            {
              key: 'providers',
              label: <span><ApiOutlined style={iconStyle} />Providers</span>,
              children: <ProvidersTab active={activeKey === 'providers'} />,
            },
            {
              key: 'keys',
              label: <span><KeyOutlined style={iconStyle} />API Keys</span>,
              children: <ApiKeysTab active={activeKey === 'keys'} />,
            },
            {
              key: 'routing',
              label: <span><SwapOutlined style={iconStyle} />Combos</span>,
              children: <RoutingTab active={activeKey === 'routing'} />,
            },
            {
              key: 'audit',
              label: <span><FileTextOutlined style={iconStyle} />Audit Log</span>,
              children: <AuditLogTab active={activeKey === 'audit'} />,
            },
            {
              key: 'analytics',
              label: <span><BarChartOutlined style={iconStyle} />Analytics</span>,
              children: <AnalyticsTab active={activeKey === 'analytics'} />,
            },
            {
              key: 'cache',
              label: <span><ThunderboltOutlined style={iconStyle} />Cache</span>,
              children: <CacheTab active={activeKey === 'cache'} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
