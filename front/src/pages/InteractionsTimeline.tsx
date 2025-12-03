import { useEffect, useState } from 'react';
import { Filter, Download, Eye, Heart, ShoppingCart, DollarSign, Star } from 'lucide-react';
import { adminApi } from '../lib/api';
import { InteractionsTimeline as InteractionsTimelineType, Interaction } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { format } from 'date-fns';

export default function InteractionsTimeline() {
  const [data, setData] = useState<InteractionsTimelineType | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  
  // Filtres
  const [filters, setFilters] = useState({
    type: '',
    user_id: '',
    product_id: '',
    start_date: '',
    end_date: '',
  });
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchInteractions = async (page: number = 1) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };
      
      if (filters.type) params.type = filters.type;
      if (filters.user_id) params.user_id = parseInt(filters.user_id);
      if (filters.product_id) params.product_id = filters.product_id;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      
      const response = await adminApi.getInteractionsTimeline(params);
      setData(response.data);
    } catch (error) {
      setToast({ message: 'Failed to load interactions', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInteractions(currentPage);
  }, [currentPage]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchInteractions(1);
  };

  const handleClearFilters = () => {
    setFilters({
      type: '',
      user_id: '',
      product_id: '',
      start_date: '',
      end_date: '',
    });
    setCurrentPage(1);
    setTimeout(() => fetchInteractions(1), 100);
  };

  const exportToCSV = () => {
    if (!data) return;
    
    let csv = 'User ID,Product ID,Product Name,Type,Timestamp,Rating,Quantity\n';
    data.interactions.forEach((interaction) => {
      csv += `${interaction.user_id},${interaction.product_id},"${interaction.product_name}",${interaction.interaction_type},${interaction.timestamp},${interaction.rating || ''},${interaction.quantity || ''}\n`;
    });
    
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const exportFileDefaultName = `interactions-${new Date().toISOString().split('T')[0]}.csv`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    setToast({ message: 'Interactions exported successfully', type: 'success' });
  };

  const getInteractionColor = (type: string) => {
    switch (type) {
      case 'view': return 'bg-blue-100 text-blue-800';
      case 'like': return 'bg-red-100 text-red-800';
      case 'add_to_cart': return 'bg-yellow-100 text-yellow-800';
      case 'purchase': return 'bg-green-100 text-green-800';
      case 'rating': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'view': return Eye;
      case 'like': return Heart;
      case 'add_to_cart': return ShoppingCart;
      case 'purchase': return DollarSign;
      case 'rating': return Star;
      default: return Eye;
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  if (loading && !data) return <LoadingSpinner />;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Interactions Timeline</h1>
          <p className="text-gray-600 mt-1">Monitor all user interactions in real-time</p>
        </div>
        {data && (
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={20} />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter size={20} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All</option>
              <option value="view">View</option>
              <option value="like">Like</option>
              <option value="add_to_cart">Add to Cart</option>
              <option value="purchase">Purchase</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
            <input
              type="number"
              value={filters.user_id}
              onChange={(e) => handleFilterChange('user_id', e.target.value)}
              placeholder="User ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product ID</label>
            <input
              type="text"
              value={filters.product_id}
              onChange={(e) => handleFilterChange('product_id', e.target.value)}
              placeholder="e.g., 1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="datetime-local"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-4">
          <button
            onClick={handleApplyFilters}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearFilters}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Interactions ({data.total} total)
              </h2>
              <div className="text-sm text-gray-600">
                Page {data.page} of {totalPages}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.interactions.map((interaction, idx) => {
                    const Icon = getInteractionIcon(interaction.interaction_type);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {interaction.user_id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{interaction.product_id}</div>
                          <div className="text-sm text-gray-500">{interaction.product_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center space-x-1 w-fit ${getInteractionColor(interaction.interaction_type)}`}>
                            <Icon size={14} />
                            <span className="capitalize">{interaction.interaction_type.replace('_', ' ')}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(interaction.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {interaction.rating && (
                            <div className="flex items-center space-x-1">
                              <Star size={14} className="text-yellow-500" />
                              <span>{interaction.rating}</span>
                            </div>
                          )}
                          {interaction.quantity && (
                            <div>Qty: {interaction.quantity}</div>
                          )}
                          {!interaction.rating && !interaction.quantity && (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex justify-center items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
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

