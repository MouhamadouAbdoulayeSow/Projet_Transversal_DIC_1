import { useEffect, useState } from 'react';
import { Eye, Heart, ShoppingCart, DollarSign, Star, RefreshCw, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area } from 'recharts';
import { adminApi } from '../lib/api';
import { Metrics, TemporalStats } from '../types';
import MetricCard from '../components/MetricCard';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import RecommendedProducts from '../components/RecommendedProducts';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [temporalStats, setTemporalStats] = useState<TemporalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [cfRetraining, setCfRetraining] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'content' | 'collaborative' | 'hybrid' | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();

  const fetchMetrics = async () => {
    try {
      console.log('Fetching metrics...');
      const response = await adminApi.getMetrics();
      console.log('Metrics response:', response);
      console.log('Metrics data:', response.data);
      if (response.data) {
        setMetrics(response.data);
      } else {
        console.error('No data in response');
        setToast({ message: 'No data received from server', type: 'error' });
      }
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch metrics:', error);
      console.error('Error details:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || 'Failed to load metrics';
      setToast({ message: errorMessage, type: 'error' });
      setLoading(false);
    }
  };

  const fetchTemporalStats = async () => {
    try {
      const response = await adminApi.getTemporalStats({ period: 'day', days: 7 });
      setTemporalStats(response.data);
    } catch (error) {
      console.error('Failed to fetch temporal stats:', error);
      // Ne pas bloquer l'affichage si les stats temporelles échouent
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await adminApi.getConfig();
      if (response.data.default_strategy) {
        setSelectedModel(response.data.default_strategy as 'content' | 'collaborative' | 'hybrid');
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchTemporalStats();
    fetchConfig();
    const interval = setInterval(() => {
      fetchMetrics();
      fetchTemporalStats();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await adminApi.retrain();
      setToast({ message: 'Content-Based model retraining started successfully', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to start retraining', type: 'error' });
    } finally {
      setRetraining(false);
    }
  };

  const handleCFRetrain = async () => {
    setCfRetraining(true);
    try {
      await adminApi.retrainCF({ sample_ratio: 1.0, min_interactions: 2 });
      setToast({ message: 'Collaborative Filtering model retraining started successfully', type: 'success' });
    } catch (error: any) {
      setToast({ 
        message: error.response?.data?.error || 'Failed to start CF retraining', 
        type: 'error' 
      });
    } finally {
      setCfRetraining(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  
  if (!metrics) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Metrics</h2>
          <p className="text-red-700">Unable to fetch dashboard data. Please check your connection and try again.</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchMetrics();
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalInteractions = metrics.totals ? Object.values(metrics.totals).reduce((a, b) => a + b, 0) : 0;

  const pieData = metrics.totals ? [
    { name: 'Views', value: metrics.totals.view || 0, color: '#3b82f6' },
    { name: 'Likes', value: metrics.totals.like || 0, color: '#ef4444' },
    { name: 'Add to Cart', value: metrics.totals.add_to_cart || 0, color: '#f59e0b' },
    { name: 'Purchases', value: metrics.totals.purchase || 0, color: '#10b981' },
    { name: 'Ratings', value: metrics.totals.rating || 0, color: '#8b5cf6' },
  ] : [];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600 mt-1">Monitor recommendation system performance</p>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={handleRetrain}
            disabled={retraining || cfRetraining}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            title="Réentraîner le modèle Content-Based"
          >
            <RefreshCw size={20} className={retraining ? 'animate-spin' : ''} />
            <span>{retraining ? 'Retraining...' : 'Retrain Content'}</span>
          </button>
          <button
            onClick={handleCFRetrain}
            disabled={retraining || cfRetraining}
            className="flex items-center space-x-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
            title="Réentraîner le modèle Collaborative Filtering"
          >
            <RefreshCw size={20} className={cfRetraining ? 'animate-spin' : ''} />
            <span>{cfRetraining ? 'Retraining...' : 'Retrain CF'}</span>
          </button>
          <button
            onClick={() => navigate('/admin/config')}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Configuration
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <MetricCard
          title="Views"
          value={metrics.totals?.view || 0}
          icon={Eye}
          color="blue"
        />
        <MetricCard
          title="Likes"
          value={metrics.totals?.like || 0}
          icon={Heart}
          color="red"
        />
        <MetricCard
          title="Add to Cart"
          value={metrics.totals?.add_to_cart || 0}
          icon={ShoppingCart}
          color="yellow"
        />
        <MetricCard
          title="Purchases"
          value={metrics.totals?.purchase || 0}
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="Ratings"
          value={metrics.totals?.rating || 0}
          icon={Star}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Interactions Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalInteractions.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total Interactions</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Products by Popularity</h2>
          {metrics.top_products && metrics.top_products.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.top_products.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="itemid" />
                <YAxis />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
                          <p className="font-semibold">{payload[0].payload.itemid}</p>
                          <p className="text-sm text-gray-600">{payload[0].payload.name}</p>
                          <p className="text-blue-600 font-bold">Score: {payload[0].value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar dataKey="score" fill="#3b82f6" name="Popularity Score" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-gray-500">No product data available</div>
          )}
        </div>
      </div>

      {temporalStats && temporalStats.data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Interactions Over Time (Last 7 Days)</h2>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={temporalStats.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="views" stackId="1" stroke="#3b82f6" fill="#3b82f6" name="Views" />
                <Area type="monotone" dataKey="likes" stackId="1" stroke="#ef4444" fill="#ef4444" name="Likes" />
                <Area type="monotone" dataKey="add_to_cart" stackId="1" stroke="#f59e0b" fill="#f59e0b" name="Add to Cart" />
                <Area type="monotone" dataKey="purchases" stackId="1" stroke="#10b981" fill="#10b981" name="Purchases" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp size={20} className="text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Unique Users & Recommendations</h2>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={temporalStats.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="unique_users" stroke="#10b981" strokeWidth={2} name="Unique Users" />
                <Line yAxisId="right" type="monotone" dataKey="recommendations_generated" stroke="#8b5cf6" strokeWidth={2} name="Recommendations Generated" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Products</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Popularity Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.top_products && metrics.top_products.length > 0 ? (
                metrics.top_products.slice(0, 10).map((product, index) => (
                  <tr key={product.itemid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.itemid}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                        {product.score}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    No products available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produits recommandés selon le modèle choisi */}
      <div className="mt-8">
        <RecommendedProducts model={selectedModel} initialLimit={16} />
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
