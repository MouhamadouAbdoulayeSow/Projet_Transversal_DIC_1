import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Order } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { Package, CheckCircle, Clock, Truck, XCircle } from 'lucide-react';
import ProtectedUserRoute from '../../components/ProtectedUserRoute';

function OrdersPage() {
  const { orderId } = useParams<{ orderId?: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (orderId) {
      fetchOrder(orderId);
    } else {
      fetchOrders();
    }
  }, [orderId]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await api.getOrders();
      setOrders(response.data);
      setLoading(false);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement des commandes', type: 'error' });
      setLoading(false);
    }
  };

  const fetchOrder = async (id: string) => {
    try {
      setLoading(true);
      const response = await api.getOrders();
      const foundOrder = response.data.find((o: Order) => o.order_id === id);
      if (foundOrder) {
        setOrder(foundOrder);
      } else {
        setToast({ message: 'Commande introuvable', type: 'error' });
      }
      setLoading(false);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement de la commande', type: 'error' });
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="text-green-600" size={20} />;
      case 'shipped':
        return <Truck className="text-blue-600" size={20} />;
      case 'processing':
      case 'confirmed':
        return <Clock className="text-yellow-600" size={20} />;
      case 'cancelled':
        return <XCircle className="text-red-600" size={20} />;
      default:
        return <Package className="text-gray-600" size={20} />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      confirmed: 'Confirmée',
      processing: 'En traitement',
      shipped: 'Expédiée',
      delivered: 'Livrée',
      cancelled: 'Annulée',
    };
    return labels[status] || status;
  };

  if (loading) return <LoadingSpinner />;

  if (orderId && order) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <div className="flex items-center space-x-3">
            <CheckCircle className="text-green-600" size={32} />
            <div>
              <h1 className="text-2xl font-bold text-green-900">Commande confirmée !</h1>
              <p className="text-green-700">Votre commande {order.order_id} a été enregistrée avec succès.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Commande {order.order_id}</h2>
              <p className="text-gray-600">Passée le {new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusIcon(order.status)}
              <span className="font-medium text-gray-900">{getStatusLabel(order.status)}</span>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center py-4 border-b border-gray-200 last:border-0">
                <div>
                  <h3 className="font-semibold text-gray-900">{item.product_name}</h3>
                  <p className="text-sm text-gray-600">Quantité: {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{item.total_price.toLocaleString('fr-FR')} €</p>
                  <p className="text-sm text-gray-600">{item.unit_price.toLocaleString('fr-FR')} € / unité</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Sous-total</span>
              <span>{order.subtotal.toLocaleString('fr-FR')} €</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Livraison</span>
              <span>{order.shipping_cost.toLocaleString('fr-FR')} €</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Taxes</span>
              <span>{order.tax_amount.toLocaleString('fr-FR')} €</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-2">
              <span>Total</span>
              <span>{order.total_amount.toLocaleString('fr-FR')} €</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">Adresse de livraison</h3>
            <p className="text-gray-600">
              {order.shipping_address.name}<br />
              {order.shipping_address.street}<br />
              {order.shipping_address.postal_code} {order.shipping_address.city}<br />
              {order.shipping_address.country}
            </p>
          </div>
        </div>

        <Link
          to="/orders"
          className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700"
        >
          <span>← Retour aux commandes</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Mes Commandes</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Package size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucune commande</h2>
          <p className="text-gray-600 mb-6">Vous n'avez pas encore passé de commande</p>
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Découvrir nos produits
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.order_id}
              to={`/orders/${order.order_id}`}
              className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Commande {order.order_id}</h2>
                  <p className="text-gray-600 text-sm">
                    {order.items.length} article{order.items.length > 1 ? 's' : ''} • {new Date(order.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-2 mb-2">
                    {getStatusIcon(order.status)}
                    <span className="font-medium text-gray-900">{getStatusLabel(order.status)}</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{order.total_amount.toLocaleString('fr-FR')} €</p>
                </div>
              </div>
            </Link>
          ))}
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

export default function Orders() {
  return (
    <ProtectedUserRoute>
      <OrdersPage />
    </ProtectedUserRoute>
  );
}

