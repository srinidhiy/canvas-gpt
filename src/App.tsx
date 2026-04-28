import AuthGate from './components/auth/AuthGate';
import CanvasChatApp from './components/canvas/CanvasChatApp';
import { AuthProvider } from './contexts/AuthContext';

const App = () => {
  return (
    <AuthProvider>
      <AuthGate>
        <CanvasChatApp />
      </AuthGate>
    </AuthProvider>
  );
};

export default App;
