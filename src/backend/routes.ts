import { handleProxyRequest } from './proxy';

// This function sets up the routes for the backend
export function setupRoutes(app: any) {
  // Register the proxy route for all Graphite API endpoints
  app.all('/api/datasources/proxy/:id/graphite/*', handleProxyRequest);

  // Add a specific route for the metrics/find endpoint
  app.get('/api/datasources/proxy/:id/graphite/metrics/find', handleProxyRequest);

  // Add more routes here as needed
}
