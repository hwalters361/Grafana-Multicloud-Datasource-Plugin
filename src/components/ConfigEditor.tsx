import React, { useEffect, useState } from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions } from '../types';
import { Button, Input, Stack } from '@grafana/ui';
import { GraphiteEndpoint } from '../types';
import { getBackendSrv } from '@grafana/runtime';

type Props = DataSourcePluginOptionsEditorProps<MyDataSourceOptions>;

export const ConfigEditor: React.FC<Props> = ({ options, onOptionsChange }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Initialize endpoints from options or empty array
  const [endpoints, setEndpoints] = useState<GraphiteEndpoint[]>(
    options.jsonData.graphiteEndpoints || []
  );

  // Function to discover Graphite datasources from Grafana API
  const discoverGraphiteDatasources = async () => {
    setIsLoading(true);
    setDiscoveryError(null);
    
    try {
      // Get all datasources from Grafana API
      const datasources = await getBackendSrv().get('/api/datasources');
      console.log('All datasources:', datasources);
      
      // Filter for Graphite datasources
      const graphiteDatasources = datasources.filter((ds: any) => ds.type === 'graphite');
      console.log('Found Graphite datasources:', graphiteDatasources);
      
      // Create new endpoints from discovered datasources
      const newEndpoints: GraphiteEndpoint[] = graphiteDatasources.map((ds: any) => ({
        name: ds.name,
        url: ds.url,
      }));
      
      // Merge with existing endpoints, avoiding duplicates
      const existingUrls = new Set(endpoints.map(ep => ep.url));
      const uniqueNewEndpoints = newEndpoints.filter(ep => !existingUrls.has(ep.url));
      
      if (uniqueNewEndpoints.length > 0) {
        const updatedEndpoints = [...endpoints, ...uniqueNewEndpoints];
        setEndpoints(updatedEndpoints);
        
        // Update the options with the new endpoints
        onOptionsChange({
          ...options,
          jsonData: {
            ...options.jsonData,
            graphiteEndpoints: updatedEndpoints,
          },
        });
        
        console.log(`Added ${uniqueNewEndpoints.length} new Graphite datasources`);
      } else {
        console.log('No new Graphite datasources found');
      }
    } catch (error) {
      console.error('Error discovering Graphite datasources:', error);
      setDiscoveryError('Failed to discover Graphite datasources. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  // Run discovery on component mount
  useEffect(() => {
    discoverGraphiteDatasources();
  }, []);

  const onEndpointChange = (index: number, field: keyof GraphiteEndpoint, value: string) => {
    const updatedEndpoints = [...endpoints];
    updatedEndpoints[index] = {
      ...updatedEndpoints[index],
      [field]: value,
    };
    setEndpoints(updatedEndpoints);
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        graphiteEndpoints: updatedEndpoints,
      },
    });
  };

  const addEndpoint = () => {
    const updatedEndpoints = [
      ...endpoints,
      { name: 'New Endpoint', url: 'http://localhost:9080' },
    ];
    setEndpoints(updatedEndpoints);
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        graphiteEndpoints: updatedEndpoints,
      },
    });
  };

  const removeEndpoint = (index: number) => {
    const updatedEndpoints = [...endpoints];
    updatedEndpoints.splice(index, 1);
    setEndpoints(updatedEndpoints);
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        graphiteEndpoints: updatedEndpoints,
      },
    });
  };

  return (
    <Stack direction="column" gap={2}>
      <div>
        <h3>Graphite Endpoints</h3>
        <p>Configure the Graphite endpoints to query for metrics.</p>
        
        <Button 
          variant="secondary" 
          onClick={discoverGraphiteDatasources} 
          disabled={isLoading}
          style={{ marginBottom: '16px' }}
        >
          {isLoading ? 'Discovering...' : 'Discover Graphite Datasources'}
        </Button>
        
        {discoveryError && (
          <div style={{ color: 'red', marginBottom: '16px' }}>
            {discoveryError}
          </div>
        )}
        
        {endpoints.map((endpoint, index) => (
          <div key={index} style={{ marginBottom: '8px' }}>
            <Stack direction="row" gap={2} alignItems="center">
              <Input
                placeholder="Name"
                value={endpoint.name}
                onChange={(e) => onEndpointChange(index, 'name', e.currentTarget.value)}
                width={20}
              />
              <Input
                placeholder="URL"
                value={endpoint.url}
                onChange={(e) => onEndpointChange(index, 'url', e.currentTarget.value)}
                width={40}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removeEndpoint(index)}
                icon="trash-alt"
              />
            </Stack>
          </div>
        ))}
        
        <Button variant="secondary" onClick={addEndpoint} style={{ marginTop: '8px' }}>
          Add Endpoint
        </Button>
      </div>
    </Stack>
  );
};
