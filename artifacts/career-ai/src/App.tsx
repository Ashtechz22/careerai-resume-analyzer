import { type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AnalyzePage,
  AssistantPage,
  DashboardPage,
  HistoryPage,
  LandingPage,
  MatcherPage,
  ProfilePage,
  RecommendationsPage,
  ResumesPage,
  ResumeDetailPage,
  SettingsPage,
} from '@/pages/app-pages';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

setBaseUrl(import.meta.env.VITE_API_URL);

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const Component = mode === 'sign-in' ? SignIn : SignUp;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-5">
      <Component
        routing="path"
        path={`/${mode}`}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: 'hsl(164 51% 39%)',
            colorText: 'hsl(228 25% 16%)',
            colorBackground: 'hsl(42 38% 98%)',
            borderRadius: '0.8rem',
          },
          elements: {
            card: 'border border-border shadow-md',
            headerTitle: 'font-display',
            formButtonPrimary: 'bg-primary hover:bg-primary/90',
          },
        }}
      />
    </div>
  );
}

function AuthLoading() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <div className="h-9 w-9 animate-pulse rounded-xl bg-primary/20" aria-label="Loading" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  setAuthTokenGetter(getToken);
  const [, setLocation] = useLocation();

  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) {
    setLocation('/sign-in');
    return <AuthLoading />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/sign-in">
          <AuthPage mode="sign-in" />
        </Route>
        <Route path="/sign-up">
          <AuthPage mode="sign-up" />
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        </Route>
        <Route path="/resumes">
          <ProtectedRoute><ResumesPage /></ProtectedRoute>
        </Route>
        <Route path="/resumes/:id">
          <ProtectedRoute><ResumeDetailPage /></ProtectedRoute>
        </Route>
        <Route path="/analyze">
          <ProtectedRoute><AnalyzePage /></ProtectedRoute>
        </Route>
        <Route path="/matcher">
          <ProtectedRoute><MatcherPage /></ProtectedRoute>
        </Route>
        <Route path="/history">
          <ProtectedRoute><HistoryPage /></ProtectedRoute>
        </Route>
        <Route path="/assistant">
          <ProtectedRoute><AssistantPage /></ProtectedRoute>
        </Route>
        <Route path="/recommendations">
          <ProtectedRoute><RecommendationsPage /></ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute><SettingsPage /></ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const routes = (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey}>{routes}</ClerkProvider>
        ) : (
          routes
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
