import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface GraphiteEndpoint {
  name: string;
  url: string;
  id?: string; // Optional ID for Grafana datasource
}

export interface MyQuery extends DataQuery {
  target: string; // The Graphite query target
  from?: string; // Optional from time
  until?: string; // Optional until time
  maxDataPoints?: number;
  format?: string;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  target: '',
  format: 'json',
  maxDataPoints: 1000,
};

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface GraphiteResponse {
  datapoints: [number, number][]; // [timestamp, value][]
  target: string;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  graphiteEndpoints: GraphiteEndpoint[];
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  graphiteEndpoints?: {
    [key: string]: {
      username?: string;
      password?: string;
    };
  };
}
