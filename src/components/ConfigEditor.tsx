import React, { ChangeEvent, useState } from 'react';
import { InlineField, Input, SecretInput, Button, Field, HorizontalGroup, VerticalGroup } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData, GraphiteEndpoint } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;
  const [newEndpoint, setNewEndpoint] = useState<GraphiteEndpoint>({ name: '', url: '' });

  const onPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        path: event.target.value,
      },
    });
  };

  // Secure field (only sent to the backend)
  const onAPIKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        apiKey: event.target.value,
      },
    });
  };

  const onResetAPIKey = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        apiKey: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        apiKey: '',
      },
    });
  };

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
    <>
      <InlineField label="Path" labelWidth={14} interactive tooltip={'Json field returned to frontend'}>
        <Input
          id="config-editor-path"
          onChange={onPathChange}
          value={jsonData.path}
          placeholder="Enter the path, e.g. /api/v1"
          width={40}
        />
      </InlineField>
      <InlineField label="API Key" labelWidth={14} interactive tooltip={'Secure json field (backend only)'}>
        <SecretInput
          required
          id="config-editor-api-key"
          isConfigured={secureJsonFields.apiKey}
          value={secureJsonData?.apiKey}
          placeholder="Enter your API key"
          width={40}
          onReset={onResetAPIKey}
          onChange={onAPIKeyChange}
        />
      </InlineField>
      <div className="gf-form-group">
        <VerticalGroup spacing="md">
          <h3>Graphite Endpoints</h3>
          
          {/* List of existing endpoints */}
          {(options.jsonData.graphiteEndpoints || []).map((endpoint, index) => (
            <HorizontalGroup key={index} spacing="md">
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
            </HorizontalGroup>
          ))}

          {/* Add new endpoint form */}
          <HorizontalGroup spacing="md">
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
          </HorizontalGroup>
        </VerticalGroup>
      </div>
    </>
  );
}
