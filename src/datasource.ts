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

    // Get all Graphite datasources from Grafana
    let allGraphiteEndpoints = [...this.graphiteEndpoints];

    try {
      // Fetch all datasources from Grafana
      const datasources = await getBackendSrv().get('/api/datasources');
      console.log('All datasources:', datasources);

      // Filter for Graphite datasources
      const graphiteDatasources = datasources.filter((ds: any) => ds.type === 'graphite');
      console.log('Found Graphite datasources:', graphiteDatasources);

      // Add each Graphite datasource as an endpoint if not already included
      for (const ds of graphiteDatasources) {
        // Check if this datasource is already in our endpoints
        const exists = allGraphiteEndpoints.some((ep) => ep.url === ds.url);

        if (!exists) {
          // Add the datasource as a new endpoint
          allGraphiteEndpoints.push({
            name: ds.name,
            url: ds.url,
          });
          console.log(`Added Graphite datasource: ${ds.name} at ${ds.url}`);
        }
      }
    } catch (error) {
      console.error('Error fetching datasources:', error);
      // Continue with the configured endpoints if there's an error
    }

    if (allGraphiteEndpoints.length === 0) {
      console.warn('No Graphite endpoints configured. Returning empty data frame.');
      return { data: [] };
    }

    console.log('Using all Graphite endpoints:', allGraphiteEndpoints);

    const promises = options.targets.map(async (target) => {
      console.log('Processing target:', target);
      // Collect all data points from all endpoints
      const timeValues: number[] = [];
      const valueValues: number[] = [];

      // Query all Graphite endpoints
      const endpointPromises = allGraphiteEndpoints.map(async (endpoint) => {
        console.log(`Querying Graphite endpoint: ${endpoint.name} at ${endpoint.url}`);
        try {
          const response = await this.queryGraphite(endpoint, target, from, to);
          console.log(`Response from ${endpoint.name}:`, response);
          return response;
        } catch (error) {
          console.error(`Error querying Graphite endpoint ${endpoint.name}:`, error);
          return null;
        }
      });

      const results = await Promise.all(endpointPromises);
      console.log('All endpoint results:', results);

      // Combine results from all endpoints
      results.forEach((result) => {
        if (result) {
          result.forEach((graphiteResponse: GraphiteResponse) => {
            if (graphiteResponse.datapoints) {
              console.log(
                `Processing ${graphiteResponse.datapoints.length} datapoints from ${graphiteResponse.target}`
              );
              graphiteResponse.datapoints.forEach(([timestamp, value]: [number, number]) => {
                timeValues.push(timestamp * 1000); // Convert to milliseconds
                valueValues.push(value);
              });
            }
          });
        }
      });

      console.log(`Total datapoints collected: ${timeValues.length}`);

      // Create a DataFrame with the collected data
      const frame = createDataFrame({
        refId: target.refId,
        fields: [
          { name: 'Time', type: FieldType.time, values: timeValues },
          { name: 'Value', type: FieldType.number, values: valueValues },
        ],
      });

      return frame;
    });

    const data = await Promise.all(promises);
    console.log('Final data frames:', data);
    return { data };
  }

  private async queryGraphite(
    endpoint: GraphiteEndpoint,
    query: MyQuery,
    from: number,
    to: number
  ): Promise<GraphiteResponse[]> {
    console.log(`Building query for ${endpoint.name}:`, { target: query.target, from, to });
    const params = new URLSearchParams({
      target: query.target,
      from: from.toString(),
      until: to.toString(),
      format: query.format || 'json',
      maxDataPoints: (query.maxDataPoints || 1000).toString(),
    });

    const url = `${endpoint.url}/render?${params.toString()}`;
    console.log(`Sending request to: ${url}`);

    const response = await getBackendSrv().fetch<GraphiteResponse[]>({
      url,
      method: 'GET',
    });

    const result = await lastValueFrom(response);
    console.log(`Response from ${endpoint.name}:`, result);
    return result.data;
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
          const response = await getBackendSrv().fetch({
            url: `${endpoint.url}/metrics/find`,
            method: 'GET',
          });
          const result = await lastValueFrom(response);
          console.log(`Test result for ${endpoint.name}:`, result);
          return result.status === 200;
        } catch (error) {
          console.error(`Error testing Graphite endpoint ${endpoint.name}:`, error);
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
          message: 'Failed to connect to one or more Graphite endpoints',
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
}
