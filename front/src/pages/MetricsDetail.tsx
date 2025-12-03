import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { adminApi } from '../lib/api';
import { Metrics } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

export default function MetricsDetail() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
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
      } catch (error: any) {
        console.error('Failed to fetch metrics:', error);
        console.error('Error details:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || 'Failed to load metrics';
        setToast({ message: errorMessage, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const exportToJSON = () => {
    if (!metrics) return;

    const dataStr = JSON.stringify(metrics, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `metrics-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    setToast({ message: 'Metrics exported successfully', type: 'success' });
  };

  const exportToCSV = () => {
    if (!metrics) return;

    let csv = 'Category,Type,Value\n';

    if (metrics.totals) {
      Object.entries(metrics.totals).forEach(([key, value]) => {
        csv += `Interactions,${key},${value}\n`;
      });
    }

    if (metrics.top_products) {
      metrics.top_products.forEach((product, index) => {
        csv += `Top Products,${index + 1},${product.itemid}|${product.name}|${product.score}\n`;
      });
    }

    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const exportFileDefaultName = `metrics-${new Date().toISOString().split('T')[0]}.csv`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    setToast({ message: 'Metrics exported successfully', type: 'success' });
  };

  if (loading) return <LoadingSpinner />;
  
  if (!metrics) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Metrics</h2>
          <p className="text-red-700">Unable to fetch metrics data. Please check your connection and try again.</p>
          <button
            onClick={() => {
              setLoading(true);
              const fetchMetrics = async () => {
                try {
                  const response = await adminApi.getMetrics();
                  if (response.data) {
                    setMetrics(response.data);
                  }
                } catch (error: any) {
                  const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || 'Failed to load metrics';
                  setToast({ message: errorMessage, type: 'error' });
                } finally {
                  setLoading(false);
                }
              };
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

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Metrics Detail</h1>
          <p className="text-gray-600 mt-1">Detailed breakdown and export options</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportToJSON}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={20} />
            <span>Export JSON</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={20} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Interaction Breakdown</h2>
          <div className="space-y-4">
            {metrics.totals && Object.entries(metrics.totals).map(([key, value]) => {
              const percentage = (value / totalInteractions) * 100;
              const colors: Record<string, string> = {
                view: 'bg-blue-500',
                like: 'bg-red-500',
                add_to_cart: 'bg-yellow-500',
                purchase: 'bg-green-500',
                rating: 'bg-pink-500',
              };

              return (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {key.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {value.toLocaleString()} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${colors[key]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-blue-600">
                {totalInteractions.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Statistics</h2>
          <div className="space-y-4">
            {metrics.unique_users !== undefined && (
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-700 mb-1">Unique Users</div>
                <div className="text-2xl font-bold text-purple-900">
                  {metrics.unique_users.toLocaleString()}
                </div>
                <div className="text-sm text-purple-700 mt-1">
                  {metrics.avg_interactions_per_user !== undefined && (
                    <>Avg {metrics.avg_interactions_per_user.toFixed(1)} interactions per user</>
                  )}
                </div>
              </div>
            )}

            {metrics.totals && Object.keys(metrics.totals).length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-700 mb-1">Most Common Interaction</div>
                <div className="text-2xl font-bold text-blue-900 capitalize">
                  {Object.entries(metrics.totals).reduce((a, b) => a[1] > b[1] ? a : b)[0].replace('_', ' ')}
                </div>
                <div className="text-sm text-blue-700 mt-1">
                  {Object.entries(metrics.totals).reduce((a, b) => a[1] > b[1] ? a : b)[1].toLocaleString()} occurrences
                </div>
              </div>
            )}

            {metrics.conversion_rates && (
              <>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-700 mb-1">Purchase to View Rate</div>
                  <div className="text-2xl font-bold text-green-900">
                    {metrics.conversion_rates.purchase_to_view_percent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    Purchases / Views
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="text-sm text-yellow-700 mb-1">Add to Cart to View Rate</div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {metrics.conversion_rates.add_to_cart_to_view_percent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Cart Additions / Views
                  </div>
                </div>

                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-orange-700 mb-1">Purchase to Cart Rate</div>
                  <div className="text-2xl font-bold text-orange-900">
                    {metrics.conversion_rates.purchase_to_cart_percent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-orange-700 mt-1">
                    Purchases / Cart Additions
                  </div>
                </div>
              </>
            )}

            {!metrics.conversion_rates && metrics.totals && metrics.totals.view > 0 && (
              <>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-700 mb-1">Conversion Rate</div>
                  <div className="text-2xl font-bold text-green-900">
                    {((metrics.totals.purchase / metrics.totals.view) * 100).toFixed(2)}%
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    Purchases / Views
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="text-sm text-yellow-700 mb-1">Add to Cart Rate</div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {((metrics.totals.add_to_cart / metrics.totals.view) * 100).toFixed(2)}%
                  </div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Cart Additions / Views
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">All Products by Popularity</h2>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Relative Popularity
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.top_products && metrics.top_products.length > 0 ? (
                metrics.top_products.map((product, index) => {
                  const maxScore = metrics.top_products[0].score;
                  const relativePopularity = (product.score / maxScore) * 100;

                return (
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${relativePopularity}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{relativePopularity.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
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
