import { useState } from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, KeyOutlined, SwapOutlined, FileTextOutlined } from '@ant-design/icons';
import { SettingsHeader } from '@snapfzz/shared';
import ProvidersTab from './tabs/ProvidersTab';
import ApiKeysTab from './tabs/ApiKeysTab';
import RoutingTab from './tabs/RoutingTab';
import AuditLogTab from './tabs/AuditLogTab';

export default function LlmSettings() {
  const [activeKey, setActiveKey] = useState('providers');

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader
        title="LLM Providers"
        subtitle="Manage LLM providers, virtual keys with budgets, routing strategies, and view spend audit logs."
      />
      <div style={{ padding: '16px 32px' }}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            {
              key: 'providers',
              label: (
                <span>
                  <ApiOutlined />
                  Providers
                </span>
              ),
              children: <ProvidersTab />,
            },
            {
              key: 'keys',
              label: (
                <span>
                  <KeyOutlined />
                  API Keys
                </span>
              ),
              children: <ApiKeysTab />,
            },
            {
              key: 'routing',
              label: (
                <span>
                  <SwapOutlined />
                  Routing
                </span>
              ),
              children: <RoutingTab />,
            },
            {
              key: 'audit',
              label: (
                <span>
                  <FileTextOutlined />
                  Audit Log
                </span>
              ),
              children: <AuditLogTab />,
            },
          ]}
        />
      </div>
    </div>
  );
}