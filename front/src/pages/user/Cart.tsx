import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Cart as CartType } from '../../lib/userApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Toast from '../../components/Toast';
import { ShoppingCart, Trash2, ArrowRight, Plus, Minus } from 'lucide-react';
import ProtectedUserRoute from '../../components/ProtectedUserRoute';
import { useCartStore } from '../../store/cartStore';

function CartPage() {
  const [cart, setCart] = useState<CartType | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();
  const { setItemCount } = useCartStore();

  useEffect(() => {
    fetchCart();
  }, []);

  const fetchCart = async () => {
    try {
      setLoading(true);
      const response = await api.getCart();
      const cartData = response.data;
      setCart(cartData);
      
      // Mettre à jour le store avec le nombre total d'articles
      if (cartData && cartData.items) {
        const totalItems = cartData.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        setItemCount(totalItems);
      } else {
        setItemCount(0);
      }
      
      setLoading(false);
    } catch (error) {
      setToast({ message: 'Erreur lors du chargement du panier', type: 'error' });
      setItemCount(0);
      setLoading(false);
    }
  };

  const handleRemove = async (productId: string) => {
    try {
      // Trouver la quantité du produit avant suppression
      const itemToRemove = cart?.items.find(item => item.product_id === productId);
      const quantityToRemove = itemToRemove?.quantity || 0;
      
      await api.removeFromCart(productId);
      setToast({ message: 'Produit retiré du panier', type: 'success' });
      await fetchCart(); // Recharger le panier et mettre à jour le store
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de la suppression';
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Mon Panier</h1>

      {!cart || cart.items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <ShoppingCart size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Votre panier est vide</h2>
          <p className="text-gray-600 mb-6">Découvrez nos produits et ajoutez-les à votre panier</p>
          <Link
            to="/"
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span>Continuer les achats</span>
            <ArrowRight size={20} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cart.items.map((item) => (
              <div
                key={item.product_id}
                className="bg-white rounded-lg border border-gray-200 p-6 flex items-center space-x-6"
              >
                <Link to={`/products/${item.product_id}`}>
                  <img
                    src={item.product_image || '/placeholder.png'}
                    alt={item.product_name}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                </Link>
                <div className="flex-1">
                  <Link to={`/products/${item.product_id}`}>
                    <h3 className="font-semibold text-gray-900 mb-1 hover:text-blue-600">
                      {item.product_name}
                    </h3>
                  </Link>
                  <p className="text-gray-600 mb-2">
                    {item.price.toLocaleString('fr-FR')} € × {item.quantity}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {item.total_price.toLocaleString('fr-FR')} €
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(item.product_id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-24">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Résumé</h2>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total</span>
                  <span>{cart.total_amount.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Livraison</span>
                  <span>À calculer</span>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>Total</span>
                    <span>{cart.total_amount.toLocaleString('fr-FR')} €</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/checkout')}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <span>Passer la commande</span>
                <ArrowRight size={20} />
              </button>
              <Link
                to="/"
                className="block text-center text-blue-600 hover:text-blue-700 mt-4"
              >
                Continuer les achats
              </Link>
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

export default function Cart() {
  return (
    <ProtectedUserRoute>
      <CartPage />
    </ProtectedUserRoute>
  );
}

