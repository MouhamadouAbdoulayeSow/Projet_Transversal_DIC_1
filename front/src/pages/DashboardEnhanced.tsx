import { useEffect, useState } from 'react';
import { Eye, Heart, ShoppingCart, DollarSign, Star, RefreshCw, TrendingUp, Percent, Users, Package, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { adminApi } from '../lib/api';
import { EnhancedDashboard, TemporalStats, TrainingRun } from '../types';
import KPICard from '../components/KPICard';
import AlertsPanel from '../components/AlertsPanel';
import SystemHealth from '../components/SystemHealth';
import ActionableRecommendations from '../components/ActionableRecommendations';
import TimeRangeSelector from '../components/TimeRangeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { useNavigate } from 'react-router-dom';

export default function DashboardEnhanced() {
  const [dashboardData, setDashboardData] = useState<EnhancedDashboard | null>(null);
  const [temporalStats, setTemporalStats] = useState<TemporalStats | null>(null);
  const [trainingHistory, setTrainingHistory] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [cfRetraining, setCfRetraining] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [days, setDays] = useState(30);
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      const response = await adminApi.getEnhancedDashboard(days);
      if (response.data) {
        setDashboardData(response.data);
      } else {
        setToast({ message: 'No data received from server', type: 'error' });
      }
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch dashboard:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || 'Failed to load dashboard';
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
    }
  };

  const fetchTrainingHistory = async () => {
    try {
      const response = await adminApi.getTrainingHistory(8);
      if (response.data?.history) {
        setTrainingHistory(response.data.history);
      }
    } catch (error) {
      // Ne bloque pas le dashboard si l'historique échoue
      console.error('Failed to fetch training history:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchTemporalStats();
    fetchTrainingHistory();
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchTemporalStats();
      fetchTrainingHistory();
    }, 60000);
    return () => clearInterval(interval);
  }, [days]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await adminApi.retrain();
      setToast({ message: 'Content-Based model retraining started successfully', type: 'success' });
      setTimeout(() => fetchDashboardData(), 2000);
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
      setTimeout(() => fetchDashboardData(), 2000);
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
  
  if (!dashboardData) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Dashboard</h2>
          <p className="text-red-700">Unable to fetch dashboard data. Please check your connection and try again.</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboardData();
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { kpis, trends, recommendation_metrics, system_health, alerts, actionable_recommendations, top_products } = dashboardData;

  const totalInteractions = kpis.totals ? Object.values(kpis.totals).reduce((a, b) => a + b, 0) : 0;

  const pieData = kpis.totals ? [
    { name: 'Views', value: kpis.totals.view || 0, color: '#3b82f6' },
    { name: 'Likes', value: kpis.totals.like || 0, color: '#ef4444' },
    { name: 'Add to Cart', value: kpis.totals.add_to_cart || 0, color: '#f59e0b' },
    { name: 'Purchases', value: kpis.totals.purchase || 0, color: '#10b981' },
    { name: 'Ratings', value: kpis.totals.rating || 0, color: '#8b5cf6' },
  ] : [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600 mt-1">Monitor recommendation system performance</p>
        </div>
        <div className="flex items-center space-x-4">
          <TimeRangeSelector days={days} onChange={setDays} />
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

      {/* System Health + Training Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <SystemHealth health={system_health} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="text-gray-700" size={18} />
            <h2 className="text-lg font-semibold text-gray-900">Historique des Réentraînements</h2>
          </div>
          {trainingHistory.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun réentraînement enregistré pour le moment.</p>
          ) : (
            <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {trainingHistory.map((run) => {
                const isSuccess = run.status === 'success';
                const isFailed = run.status === 'failed';
                const label =
                  run.model_name === 'content_based'
                    ? 'Content-Based'
                    : 'Collaborative Filtering';
                return (
                  <li key={run.id} className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {label}{' '}
                        <span className="text-xs text-gray-500">
                          {run.started_at
                            ? new Date(run.started_at).toLocaleString()
                            : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {run.duration_sec
                          ? `Durée: ${run.duration_sec.toFixed(1)}s`
                          : 'Durée inconnue'}
                      </div>
                      {run.status === 'started' && (
                        <div className="text-xs text-blue-600">En cours...</div>
                      )}
                      {isFailed && run.error_message && (
                        <div className="text-xs text-red-600 truncate">
                          Erreur: {run.error_message}
                        </div>
                      )}
                    </div>
                    <span
                      className={[
                        'px-2 py-1 rounded-full text-xs font-semibold',
                        isSuccess
                          ? 'bg-green-100 text-green-700'
                          : isFailed
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700',
                      ].join(' ')}
                    >
                      {run.status === 'started'
                        ? 'En cours'
                        : isSuccess
                        ? 'Succès'
                        : 'Échec'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-8">
          <AlertsPanel alerts={alerts} />
        </div>
      )}

      {/* KPIs avec tendances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Vues"
          value={kpis.totals?.view || 0}
          icon={Eye}
          color="blue"
          trend={trends?.day_over_day?.views}
        />
        <KPICard
          title="Revenus"
          value={kpis.revenue || 0}
          icon={DollarSign}
          color="green"
          format="currency"
          trend={trends?.day_over_day?.revenue}
        />
        <KPICard
          title="Taux de Conversion"
          value={kpis.conversion_rates?.purchase_to_view_percent || 0}
          icon={Percent}
          color="indigo"
          format="percent"
          trend={trends?.day_over_day?.conversion_rate}
          subtitle="View → Purchase"
        />
        <KPICard
          title="AOV"
          value={kpis.aov || 0}
          icon={DollarSign}
          color="purple"
          format="currency"
          subtitle="Average Order Value"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Achats"
          value={kpis.totals?.purchase || 0}
          icon={ShoppingCart}
          color="green"
          trend={trends?.day_over_day?.purchases}
        />
        <KPICard
          title="Likes"
          value={kpis.totals?.like || 0}
          icon={Heart}
          color="red"
        />
        <KPICard
          title="Utilisateurs Uniques"
          value={kpis.unique_users || 0}
          icon={Users}
          color="blue"
        />
        <KPICard
          title="Commandes"
          value={kpis.total_orders || 0}
          icon={Package}
          color="yellow"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Répartition des Interactions</h2>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Produits par Popularité</h2>
          {top_products && top_products.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top_products.slice(0, 10)}>
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
                          <p className="text-green-600 text-sm">Revenu: €{payload[0].payload.revenue}</p>
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

      {/* Métriques de Recommandation */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance du Système de Recommandation</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">CTR</p>
            <p className="text-2xl font-bold text-gray-900">{recommendation_metrics.click_through_rate}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Taux de Conversion</p>
            <p className="text-2xl font-bold text-gray-900">{recommendation_metrics.conversion_rate}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Couverture</p>
            <p className="text-2xl font-bold text-gray-900">{recommendation_metrics.coverage}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Temps de Réponse</p>
            <p className="text-2xl font-bold text-gray-900">{recommendation_metrics.avg_response_time_ms}ms</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>Recommandations générées:</strong> {recommendation_metrics.recommendations_generated.toLocaleString()} | 
            <strong> Produits uniques:</strong> {recommendation_metrics.unique_products_recommended} / {recommendation_metrics.total_products}
          </p>
        </div>
      </div>

      {/* Recommandations Actionnables */}
      {actionable_recommendations.length > 0 && (
        <div className="mb-8">
          <ActionableRecommendations recommendations={actionable_recommendations} />
        </div>
      )}

      {/* Top Products Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Produits (Enrichi)</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenu</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversion</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {top_products && top_products.length > 0 ? (
                top_products.slice(0, 10).map((product, index) => (
                  <tr key={product.itemid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.itemid}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                        {product.score}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      €{product.revenue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.conversion_rate.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {product.in_stock ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                          {product.stock_quantity} en stock
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                          Rupture
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No products available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

