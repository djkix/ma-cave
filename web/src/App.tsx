import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { UpdateBanner } from './components/UpdateBanner';
import { router } from './router';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Monté une seule fois dans la coque : il flotte au-dessus de tous les écrans. */}
      <UpdateBanner />
    </QueryClientProvider>
  );
}
