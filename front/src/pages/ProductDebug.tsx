import { useState } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { adminApi } from '../lib/api';
import { RecoDebug } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

export default function ProductDebug() {
  const [itemId, setItemId] = useState('');
  const [data, setData] = useState<RecoDebug | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = async () => {
    if (!itemId.trim()) {
      setToast({ message: 'Please enter a product ID', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.getRecoDebug(itemId);
      setData(response.data);
    } catch (error) {
      setToast({ message: 'Failed to load product debug data', type: 'error' });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600 bg-green-100';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getSimilarityLabel = (score: number) => {
    if (score >= 0.7) return 'High';
    if (score >= 0.4) return 'Medium';
    return 'Low';
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Product Recommendations Debug</h1>
        <p className="text-gray-600 mt-1">Analyze similarity scores and recommendation logic</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product ID
            </label>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="e.g., 1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              <Search size={20} />
              <span>{loading ? 'Searching...' : 'Search'}</span>
            </button>
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="text-blue-600 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-blue-900">Source Product: {data.itemid}</h3>
              <p className="text-sm text-blue-700 mt-1">
                Showing {data.debug.length} similar products based on content similarity
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Similarity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rating
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.debug.map((item) => (
                    <tr key={item.itemid} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.itemid}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate">{item.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                item.similarity_score >= 0.7
                                  ? 'bg-green-500'
                                  : item.similarity_score >= 0.4
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${item.similarity_score * 100}%` }}
                            />
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getSimilarityColor(item.similarity_score)}`}>
                            {(item.similarity_score * 100).toFixed(1)}%
                          </span>
                          <span className="text-xs text-gray-500">
                            ({getSimilarityLabel(item.similarity_score)})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="text-green-600 font-semibold">
                          ₹{item.discount_price.toLocaleString()}
                        </div>
                        {item.actual_price > item.discount_price && (
                          <div className="text-gray-500 text-xs line-through">
                            ₹{item.actual_price.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1 text-sm">
                          <span className="text-yellow-500">★</span>
                          <span className="font-semibold text-gray-900">{item.ratings.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-600">Name overlap:</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">
                              {item.name_overlap} words
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-600">Same category:</span>
                            <span className={`px-2 py-0.5 rounded font-semibold ${
                              item.same_category ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {item.same_category ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-600">Same brand:</span>
                            <span className={`px-2 py-0.5 rounded font-semibold ${
                              item.same_brand ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {item.same_brand ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-600">Price Δ:</span>
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-semibold">
                              ₹{Math.abs(item.price_delta).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Understanding Similarity Scores</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold text-green-600 mb-2">High Similarity (≥70%)</h4>
                <p className="text-gray-600">Strong match. Products share significant attributes like brand, category, or multiple name words.</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold text-yellow-600 mb-2">Medium Similarity (40-70%)</h4>
                <p className="text-gray-600">Moderate match. Some shared attributes but notable differences in features or specifications.</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold text-red-600 mb-2">Low Similarity (&lt;40%)</h4>
                <p className="text-gray-600">Weak match. Products differ significantly but may share some basic characteristics.</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
