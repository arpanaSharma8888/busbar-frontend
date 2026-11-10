import { useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Maximize2, Search } from 'lucide-react';
import VoltageChart from '../components/charts/VoltageChart';

export default function HistoricalGraph() {
  const [expanded, setExpanded] = useState(false);
  return (
    <Stack gap="lg">
      <Group justify="space-between"><div><Title order={2}>Historical Graph</Title><Text size="sm" c="dimmed">Review controller voltage over a selected time range</Text></div><Badge variant="light">UI preview</Badge></Group>
      <Alert title="Historical view overview" color="blue">Select a controller and period to review voltage trends. Historical loading is not connected in this preview.</Alert>
      <Paper withBorder p="lg" radius="md">
        <Group align="end">
          <Select label="Controller / Section ID" data={['Controller 1', 'Controller 2', 'Controller 3']} defaultValue="Controller 1" allowDeselect={false} />
          <TextInput label="From" type="datetime-local" />
          <TextInput label="To" type="datetime-local" />
          <Button disabled leftSection={<Search size={16} />}>Load history</Button>
          <Button variant="default" leftSection={<Maximize2 size={16} />} onClick={() => setExpanded(!expanded)}>{expanded ? 'Compact view' : 'Expand chart'}</Button>
        </Group>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md"><Title order={4}>Voltage over time</Title><Badge variant="dot">Voltage (V)</Badge></Group>
        <VoltageChart readings={[]} height={expanded ? 560 : 320} />
        <Text ta="center" c="dimmed" size="sm">Historical readings will appear here. Drag across the chart to zoom when data is available.</Text>
      </Paper>
    </Stack>
  );
}
