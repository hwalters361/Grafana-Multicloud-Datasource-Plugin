import { setupRoutes } from './routes';

// This is the main entry point for the backend
export default function initBackend(app: any) {
  // Set up the routes
  setupRoutes(app);

  // Add more initialization code here as needed
}
