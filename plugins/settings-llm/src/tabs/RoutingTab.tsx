import { Typography } from 'antd';

const { Text, Title } = Typography;

export default function RoutingTab() {
  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>
      <Text type="secondary">
        Configure model routing, aliases, and fallback strategies for the LLM gateway.
      </Text>
      <div
        style={{
          marginTop: 24,
          padding: 24,
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          background: 'var(--bg-default)',
        }}
      >
        <Title level={5}>Coming Soon</Title>
        <Text type="secondary">
          Routing configuration will be available in a future update. This includes:
        </Text>
        <ul style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          <li>Model group aliases (e.g., "fast" → your-preferred-model)</li>
          <li>Routing strategies (simple-shuffle, latency-based, least-busy)</li>
          <li>Fallback rules for failed requests</li>
          <li>Load balancing across multiple deployments</li>
        </ul>
      </div>
    </div>
  );
}