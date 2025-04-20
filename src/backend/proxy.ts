import { getBackendSrv } from '@grafana/runtime';
import { GraphiteEndpoint } from '../types';
import { lastValueFrom } from 'rxjs';

// Define the datasource response type
interface DatasourceResponse {
  data: {
    jsonData: {
      graphiteEndpoints: GraphiteEndpoint[];
    };
  };
}

// This function handles proxy requests to Graphite endpoints
export async function proxyGraphiteRequest(
  endpoint: GraphiteEndpoint,
  path: string,
  method: string = 'GET',
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  try {
    // Construct the URL with query parameters
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    const url = `${endpoint.url}${path}${queryString ? `?${queryString}` : ''}`;

    console.log(`Proxying request to: ${url}`);

    // Make the request to the Graphite endpoint using getBackendSrv().fetch
    const response = await getBackendSrv().fetch({
      url,
      method,
      headers: {
        ...headers,
        Accept: 'application/json',
      },
    });

    // Get the response data
    const result = await lastValueFrom(response);
    console.log(`Response from ${endpoint.url}:`, result);

    // Return the response data
    return result.data;
  } catch (error) {
    console.error(`Error proxying request to ${endpoint.url}:`, error);
    throw error;
  }
}

// This function is called by the backend to handle proxy requests
export async function handleProxyRequest(req: any, res: any) {
  try {
    console.log('Handling proxy request:', {
      path: req.path,
      method: req.method,
      query: req.query,
      headers: req.headers,
    });

    // Get the endpoint URL from the custom header
    const endpointUrl = req.headers['x-grafana-graphite-endpoint'];

    if (!endpointUrl) {
      console.error('Missing X-Grafana-Graphite-Endpoint header');
      return res.status(400).json({ error: 'Missing X-Grafana-Graphite-Endpoint header' });
    }

    console.log(`Using Graphite endpoint: ${endpointUrl}`);

    // Find the endpoint in the datasource configuration
    const datasourceResponse = await getBackendSrv().fetch<DatasourceResponse>({
      url: `/api/datasources/${req.params.id}`,
      method: 'GET',
    });

    const datasource = await lastValueFrom(datasourceResponse);
    console.log('Datasource configuration:', datasource.data);

    // Type assertion to handle the response structure
    const datasourceData = datasource.data as unknown as { jsonData: { graphiteEndpoints: GraphiteEndpoint[] } };
    const endpoints = datasourceData.jsonData.graphiteEndpoints || [];
    const endpoint = endpoints.find((ep: GraphiteEndpoint) => ep.url === endpointUrl);

    if (!endpoint) {
      console.error(`Endpoint ${endpointUrl} not found in datasource configuration`);
      return res.status(404).json({ error: `Endpoint ${endpointUrl} not found` });
    }

    // Extract the path and query parameters from the request
    const path = req.path.replace(`/api/datasources/proxy/${req.params.id}/graphite`, '');
    const params = req.query;

    console.log(`Proxying request to ${endpoint.url}${path} with params:`, params);

    // Proxy the request to the Graphite endpoint
    const data = await proxyGraphiteRequest(endpoint, path, req.method, params, req.headers);

    // Return the response
    return res.json(data);
  } catch (error: any) {
    console.error('Error handling proxy request:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error?.message || 'Unknown error',
      stack: error?.stack || '',
    });
  }
}
