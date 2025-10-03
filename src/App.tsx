import AuthGate from './components/auth/AuthGate';
import CanvasChatApp from './components/canvas/CanvasChatApp';
import { SupabaseAuthProvider } from './contexts/SupabaseAuthContext';

const App = () => {
  return (
    <SupabaseAuthProvider>
      <AuthGate>
        <CanvasChatApp />
      </AuthGate>
    </SupabaseAuthProvider>
  );
};

export default App;
