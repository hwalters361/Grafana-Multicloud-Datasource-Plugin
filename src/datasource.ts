import { getBackendSrv, isFetchError } from '@grafana/runtime';
import {
  CoreApp,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  createDataFrame,
  FieldType,
} from '@grafana/data';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, GraphiteEndpoint, GraphiteResponse } from './types';
import { lastValueFrom } from 'rxjs';

// Define the response type for the query API
interface QueryResponse {
  results: {
    A: {
      frames?: Array<{
        name?: string;
        fields: Array<{
          name: string;
          type: string;
          values: any[];
        }>;
      }>;
      error?: any;
    };
  };
}

// Define the frame type for better type safety
interface GraphiteFrame {
  name?: string;
  fields: Array<{
    name: string;
    type: string;
    values: any[];
  }>;
}

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  graphiteEndpoints: GraphiteEndpoint[];

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.graphiteEndpoints = instanceSettings.jsonData.graphiteEndpoints || [];
    console.log('DataSource initialized with endpoints:', this.graphiteEndpoints);
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  filterQuery(query: MyQuery): boolean {
    console.log('Filtering query:', query);
    const isValid = !!query.target;
    console.log('Query is valid:', isValid);
    return isValid;
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    console.log('Query method called with options:', options);
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();
    console.log('Time range:', { from, to });

    // Use only the configured endpoints
    const allGraphiteEndpoints = [...this.graphiteEndpoints];

    if (allGraphiteEndpoints.length === 0) {
      console.warn('No Graphite endpoints configured. Returning empty data frame.');
      return { data: [] };
    }

    console.log('Using configured Graphite endpoints:', allGraphiteEndpoints);

    // Create a list to hold all data frames
    const allDataFrames: any[] = [];

    // Process each target
    for (const target of options.targets) {
      console.log('Processing target:', target);

      // Query all Graphite endpoints
      const endpointPromises = allGraphiteEndpoints.map(async (endpoint) => {
        console.log(`Querying Graphite endpoint: ${endpoint.name} at ${endpoint.url}`);
        try {
          const response = await this.queryGraphite(endpoint, target, from, to);
          console.log(`Response from ${endpoint.name}:`, response);
          return { endpoint, response };
        } catch (error) {
          console.error(`Error querying Graphite endpoint ${endpoint.name}:`, error);
          return null;
        }
      });

      const results = await Promise.all(endpointPromises);
      console.log('All endpoint results:', results);

      // Process each result from each endpoint
      results.forEach((result) => {
        if (result) {
          const { endpoint, response } = result;

          // Process each series in the response
          response.forEach((graphiteResponse: GraphiteResponse) => {
            if (graphiteResponse.datapoints && graphiteResponse.datapoints.length > 0) {
              console.log(
                `Processing ${graphiteResponse.datapoints.length} datapoints from ${graphiteResponse.target}`
              );

              // Extract time and value arrays
              const timeValues: number[] = [];
              const valueValues: number[] = [];

              graphiteResponse.datapoints.forEach(([timestamp, value]: [number, number]) => {
                timeValues.push(timestamp * 1000); // Convert to milliseconds
                valueValues.push(value);
              });

              // Create a unique name for this series that includes the endpoint name
              const seriesName = `${endpoint.name}: ${graphiteResponse.target}`;

              // Create a DataFrame for this series
              const frame = createDataFrame({
                refId: target.refId,
                name: seriesName,
                fields: [
                  { name: 'Time', type: FieldType.time, values: timeValues },
                  { name: 'Value', type: FieldType.number, values: valueValues },
                ],
              });

              // Add this frame to our list
              allDataFrames.push(frame);
            }
          });
        }
      });
    }

    console.log(`Created ${allDataFrames.length} data frames`);
    return { data: allDataFrames };
  }

  private async queryGraphite(
    endpoint: GraphiteEndpoint,
    query: MyQuery,
    from: number,
    to: number
  ): Promise<GraphiteResponse[]> {
    console.log(`Building query for ${endpoint.name}:`, { target: query.target, from, to });

    // Convert timestamps from milliseconds to seconds for Graphite
    const fromSeconds = Math.floor(from / 1000);
    const toSeconds = Math.floor(to / 1000);
    console.log(`Converted timestamps: from=${fromSeconds}, to=${toSeconds}`);

    // Check if we have a datasource ID for proxy requests
    if (!endpoint.id) {
      console.warn(`No datasource ID for ${endpoint.name}, trying direct request`);

      // Fall back to direct request if no ID is available
      const params = new URLSearchParams({
        target: query.target,
        from: fromSeconds.toString(),
        until: toSeconds.toString(),
        format: query.format || 'json',
        maxDataPoints: (query.maxDataPoints || 1000).toString(),
      });

      const directUrl = `${endpoint.url}/render?${params.toString()}`;
      console.log(`Sending direct request to: ${directUrl}`);

      try {
        // Use our custom proxy implementation
        const response = await getBackendSrv().fetch<GraphiteResponse[]>({
          url: `/api/datasources/proxy/${this.id}/graphite/render`,
          method: 'GET',
          params: {
            target: query.target,
            from: fromSeconds.toString(),
            until: toSeconds.toString(),
            format: query.format || 'json',
            maxDataPoints: (query.maxDataPoints || 1000).toString(),
          },
          headers: {
            'X-Grafana-Graphite-Endpoint': endpoint.url,
          },
        });

        const result = await lastValueFrom(response);
        console.log(`Response from ${endpoint.name}:`, result);
        return result.data;
      } catch (error) {
        console.error(`Error querying Graphite endpoint ${endpoint.name} through proxy:`, error);

        // If proxy fails, try direct fetch as a fallback
        console.log(`Trying direct fetch to ${directUrl} as fallback`);
        try {
          const directResponse = await fetch(directUrl);
          if (!directResponse.ok) {
            throw new Error(`HTTP error! status: ${directResponse.status}`);
          }
          const data = await directResponse.json();
          console.log(`Direct fetch response from ${endpoint.name}:`, data);
          return data;
        } catch (directError) {
          console.error(`Error with direct fetch to ${endpoint.name}:`, directError);
          throw directError;
        }
      }
    }

    // Use our custom proxy implementation with the datasource ID
    const params = new URLSearchParams({
      target: query.target,
      from: fromSeconds.toString(),
      until: toSeconds.toString(),
      format: query.format || 'json',
      maxDataPoints: (query.maxDataPoints || 1000).toString(),
    });

    // Use our custom proxy URL format
    const proxyUrl = `/api/datasources/proxy/${this.id}/graphite/render`;
    console.log(`Sending proxy request to: ${proxyUrl}`);

    try {
      // Use our custom proxy implementation
      const response = await getBackendSrv().fetch<GraphiteResponse[]>({
        url: proxyUrl,
        method: 'GET',
        params: {
          target: query.target,
          from: fromSeconds.toString(),
          until: toSeconds.toString(),
          format: query.format || 'json',
          maxDataPoints: (query.maxDataPoints || 1000).toString(),
        },
        headers: {
          'X-Grafana-Graphite-Endpoint': endpoint.url,
        },
      });

      const result = await lastValueFrom(response);
      console.log(`Response from ${endpoint.name}:`, result);
      return result.data;
    } catch (error) {
      console.error(`Error querying Graphite endpoint ${endpoint.name} through proxy:`, error);

      // If proxy fails, try direct fetch as a fallback
      const directUrl = `${endpoint.url}/render?${params.toString()}`;
      console.log(`Trying direct fetch to ${directUrl} as fallback`);
      try {
        const directResponse = await fetch(directUrl);
        if (!directResponse.ok) {
          throw new Error(`HTTP error! status: ${directResponse.status}`);
        }
        const data = await directResponse.json();
        console.log(`Direct fetch response from ${endpoint.name}:`, data);
        return data;
      } catch (directError) {
        console.error(`Error with direct fetch to ${endpoint.name}:`, directError);
        throw directError;
      }
    }
  }

  async testDatasource() {
    console.log('Testing datasource connection');
    const defaultErrorMessage = 'Cannot connect to Graphite endpoints';

    if (this.graphiteEndpoints.length === 0) {
      console.warn('No Graphite endpoints configured');
      return {
        status: 'error',
        message: 'No Graphite endpoints configured. Please add at least one endpoint.',
      };
    }

    try {
      // Test connection to all configured endpoints
      const testPromises = this.graphiteEndpoints.map(async (endpoint) => {
        console.log(`Testing connection to ${endpoint.name} at ${endpoint.url}`);
        try {
          // Use our new fetchMetrics method to test the connection
          const metrics = await this.fetchMetrics(endpoint, '*');
          console.log(`Successfully connected to ${endpoint.name}, found ${metrics.length} metrics`);
          return true;
        } catch (error) {
          console.error(`Error testing Graphite endpoint ${endpoint.name}:`, error);

          // Provide more detailed error information
          let errorMessage = 'Unknown error';
          if (isFetchError(error)) {
            errorMessage = `HTTP ${error.status}: ${error.statusText}`;
            if (error.data && error.data.message) {
              errorMessage += ` - ${error.data.message}`;
            }
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }

          console.error(`Detailed error for ${endpoint.name}: ${errorMessage}`);
          return false;
        }
      });

      const results = await Promise.all(testPromises);
      console.log('Test results:', results);
      const allSuccessful = results.every((success: boolean) => success);

      if (allSuccessful) {
        console.log('All endpoints connected successfully');
        return {
          status: 'success',
          message: 'Successfully connected to all Graphite endpoints',
        };
      } else {
        console.warn('Some endpoints failed to connect');
        return {
          status: 'error',
          message: 'Failed to connect to one or more Graphite endpoints. Check the logs for details.',
        };
      }
    } catch (err) {
      console.error('Error testing datasource:', err);
      let message = '';
      if (typeof err === 'string') {
        message = err;
      } else if (isFetchError(err)) {
        message = 'Fetch error: ' + (err.statusText ? err.statusText : defaultErrorMessage);
        if (err.data && err.data.error && err.data.error.code) {
          message += ': ' + err.data.error.code + '. ' + err.data.error.message;
        }
      }
      return {
        status: 'error',
        message,
      };
    }
  }

  // Add a method to fetch metrics using the direct URL approach
  async fetchMetrics(endpoint: GraphiteEndpoint, query: string): Promise<any[]> {
    console.log(`Fetching metrics from ${endpoint.name} with query: ${query}`);

    // Try proxy first
    try {
      const proxyUrl = `/api/datasources/proxy/${this.id}/graphite/metrics/find`;
      console.log(`Sending proxy request to: ${proxyUrl}`);

      const response = await getBackendSrv().fetch<any[]>({
        url: proxyUrl,
        method: 'GET',
        params: {
          query: query,
        },
        headers: {
          'X-Grafana-Graphite-Endpoint': endpoint.url,
        },
      });

      const result = await lastValueFrom(response);
      console.log(`Response from ${endpoint.name}:`, result);
      return result.data;
    } catch (error) {
      console.error(`Error fetching metrics from ${endpoint.name} ${endpoint.url} through proxy:`, error);

      // If proxy fails, try direct fetch as a fallback
      const directUrl = `${endpoint.url}/metrics/find?query=${encodeURIComponent(query)}`;
      console.log(`Trying direct fetch to ${directUrl} as fallback`);

      try {
        const directResponse = await fetch(directUrl);
        if (!directResponse.ok) {
          throw new Error(`HTTP error! status: ${directResponse.status}`);
        }
        const data = await directResponse.json();
        console.log(`Direct fetch response from ${endpoint.name}:`, data);
        return data;
      } catch (directError) {
        console.error(`Error with direct fetch to ${endpoint.name}:`, directError);
        throw directError;
      }
    }
  }
}
