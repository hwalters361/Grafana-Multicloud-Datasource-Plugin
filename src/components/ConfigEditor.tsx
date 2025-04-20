import React, { useState } from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, GraphiteEndpoint } from '../types';
import { Button, Input, Field, Stack } from '@grafana/ui';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions> {}

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const [newEndpoint, setNewEndpoint] = useState<GraphiteEndpoint>({ name: '', url: '' });

  const updateEndpoints = (endpoints: GraphiteEndpoint[]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        graphiteEndpoints: endpoints,
      },
    });
  };

  const addEndpoint = () => {
    if (newEndpoint.name && newEndpoint.url) {
      const endpoints = options.jsonData.graphiteEndpoints || [];
      updateEndpoints([...endpoints, newEndpoint]);
      setNewEndpoint({ name: '', url: '' });
    }
  };

  const removeEndpoint = (index: number) => {
    const endpoints = [...(options.jsonData.graphiteEndpoints || [])];
    endpoints.splice(index, 1);
    updateEndpoints(endpoints);
  };

  return (
    <div className="gf-form-group">
      <Stack direction="column" gap={2}>
        <h3>Graphite Endpoints</h3>
        
        {/* List of existing endpoints */}
        {(options.jsonData.graphiteEndpoints || []).map((endpoint, index) => (
          <Stack key={index} direction="row" gap={2} alignItems="center">
            <Field label="Name">
              <Input value={endpoint.name} disabled />
            </Field>
            <Field label="URL">
              <Input value={endpoint.url} disabled />
            </Field>
            <Button
              variant="destructive"
              size="sm"
              icon="trash-alt"
              onClick={() => removeEndpoint(index)}
            >
              Remove
            </Button>
          </Stack>
        ))}

        {/* Add new endpoint form */}
        <Stack direction="row" gap={2} alignItems="center">
          <Field label="Name">
            <Input
              value={newEndpoint.name}
              onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.currentTarget.value })}
              placeholder="Endpoint name"
            />
          </Field>
          <Field label="URL">
            <Input
              value={newEndpoint.url}
              onChange={(e) => setNewEndpoint({ ...newEndpoint, url: e.currentTarget.value })}
              placeholder="http://graphite:8080"
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            onClick={addEndpoint}
            disabled={!newEndpoint.name || !newEndpoint.url}
          >
            Add Endpoint
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}
