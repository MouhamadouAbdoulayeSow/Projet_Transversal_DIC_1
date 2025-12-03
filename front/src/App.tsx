import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import UserLayout from './components/UserLayout';
import Dashboard from './pages/Dashboard';
import DashboardEnhanced from './pages/DashboardEnhanced';
import UserAnalysis from './pages/UserAnalysis';
import UsersList from './pages/UsersList';
import InteractionsTimeline from './pages/InteractionsTimeline';
import ProductDebug from './pages/ProductDebug';
import Configuration from './pages/Configuration';
import MetricsDetail from './pages/MetricsDetail';
import CFProductDebug from './pages/CFProductDebug';
import CFUserAnalysis from './pages/CFUserAnalysis';
import { setNavigate } from './lib/navigation';

// User pages
import UserLogin from './pages/user/Login';
import UserRegister from './pages/user/Register';
import Home from './pages/user/Home';
import ProductDetail from './pages/user/ProductDetail';
import Cart from './pages/user/Cart';
import Checkout from './pages/user/Checkout';
import Orders from './pages/user/Orders';
import Recommendations from './pages/user/Recommendations';
import Profile from './pages/user/Profile';
import Search from './pages/user/Search';
import Favorites from './pages/user/Favorites';

// Composant pour initialiser la navigation
function NavigationSetup() {
  const navigate = useNavigate();
  
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);
  
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <NavigationSetup />
      <Routes>
        {/* Admin Routes */}
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardEnhanced />} />
          <Route path="dashboard/legacy" element={<Dashboard />} />
          <Route path="users/list" element={<UsersList />} />
          <Route path="users" element={<UserAnalysis />} />
          <Route path="users/:userId" element={<UserAnalysis />} />
          <Route path="interactions" element={<InteractionsTimeline />} />
          <Route path="products" element={<ProductDebug />} />
          <Route path="products/cf" element={<CFProductDebug />} />
          <Route path="users/cf" element={<CFUserAnalysis />} />
          <Route path="metrics" element={<MetricsDetail />} />
          <Route path="config" element={<Configuration />} />
        </Route>

        {/* User Routes */}
        <Route path="/" element={<UserLayout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<UserLogin />} />
          <Route path="register" element={<UserRegister />} />
          <Route path="products/:itemid" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:orderId" element={<Orders />} />
          <Route path="recommendations" element={<Recommendations />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="profile" element={<Profile />} />
          <Route path="search" element={<Search />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
