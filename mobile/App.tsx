import { AppContent } from './src/app/AppContent';
import { AppProviders } from './src/app/AppProviders';

export default function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
