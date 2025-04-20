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
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  filterQuery(query: MyQuery): boolean {
    return !!query.target;
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    const promises = options.targets.map(async (target) => {
      // Collect all data points from all endpoints
      const timeValues: number[] = [];
      const valueValues: number[] = [];

      // Query all Graphite endpoints
      const endpointPromises = this.graphiteEndpoints.map(async (endpoint) => {
        try {
          const response = await this.queryGraphite(endpoint, target, from, to);
          return response;
        } catch (error) {
          console.error(`Error querying Graphite endpoint ${endpoint.name}:`, error);
          return null;
        }
      });

      const results = await Promise.all(endpointPromises);

      // Combine results from all endpoints
      results.forEach((result) => {
        if (result) {
          result.forEach((graphiteResponse: GraphiteResponse) => {
            if (graphiteResponse.datapoints) {
              graphiteResponse.datapoints.forEach(([timestamp, value]: [number, number]) => {
                timeValues.push(timestamp * 1000); // Convert to milliseconds
                valueValues.push(value);
              });
            }
          });
        }
      });

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
    return { data };
  }

  private async queryGraphite(
    endpoint: GraphiteEndpoint,
    query: MyQuery,
    from: number,
    to: number
  ): Promise<GraphiteResponse[]> {
    const params = new URLSearchParams({
      target: query.target,
      from: from.toString(),
      until: to.toString(),
      format: query.format || 'json',
      maxDataPoints: (query.maxDataPoints || 1000).toString(),
    });

    const response = await getBackendSrv().fetch<GraphiteResponse[]>({
      url: `${endpoint.url}/render?${params.toString()}`,
      method: 'GET',
    });

    const result = await lastValueFrom(response);
    return result.data;
  }

  async testDatasource() {
    const defaultErrorMessage = 'Cannot connect to Graphite endpoints';

    try {
      // Test connection to all configured endpoints
      const testPromises = this.graphiteEndpoints.map(async (endpoint) => {
        try {
          const response = await getBackendSrv().fetch({
            url: `${endpoint.url}/metrics/find`,
            method: 'GET',
          });
          const result = await lastValueFrom(response);
          return result.status === 200;
        } catch (error) {
          console.error(`Error testing Graphite endpoint ${endpoint.name}:`, error);
          return false;
        }
      });

      const results = await Promise.all(testPromises);
      const allSuccessful = results.every((success: boolean) => success);

      if (allSuccessful) {
        return {
          status: 'success',
          message: 'Successfully connected to all Graphite endpoints',
        };
      } else {
        return {
          status: 'error',
          message: 'Failed to connect to one or more Graphite endpoints',
        };
      }
    } catch (err) {
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
