import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { MyQuery, MyDataSourceOptions } from './types';
import initBackend from './backend';

// Initialize the backend
initBackend(window);

// Export the plugin
export const plugin = new DataSourcePlugin<DataSource, MyQuery, MyDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
