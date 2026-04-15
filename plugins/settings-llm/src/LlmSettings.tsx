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
      <div style={{ padding: '24px 32px', background: 'var(--bg-subtle)', borderRadius: 8, margin: '0 32px 24px' }}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            {
              key: 'providers',
              label: <span><ApiOutlined style={iconStyle} />Providers</span>,
              children: <ProvidersTab />,
            },
            {
              key: 'keys',
              label: <span><KeyOutlined style={iconStyle} />API Keys</span>,
              children: <ApiKeysTab />,
            },
            {
              key: 'routing',
              label: <span><SwapOutlined style={iconStyle} />Combos</span>,
              children: <RoutingTab />,
            },
            {
              key: 'audit',
              label: <span><FileTextOutlined style={iconStyle} />Audit Log</span>,
              children: <AuditLogTab />,
            },
            {
              key: 'analytics',
              label: <span><BarChartOutlined style={iconStyle} />Analytics</span>,
              children: <AnalyticsTab />,
            },
            {
              key: 'cache',
              label: <span><ThunderboltOutlined style={iconStyle} />Cache</span>,
              children: <CacheTab />,
            },
          ]}
        />
      </div>
    </div>
  );
}
