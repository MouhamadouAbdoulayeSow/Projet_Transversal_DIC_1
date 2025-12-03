// front/src/lib/userApi.ts
import axios from 'axios';
import { navigateTo } from './navigation';

const API_BASE_URL = 'http://127.0.0.1:8000';

const userApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

userApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('userToken');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// Intercepteur de réponse pour gérer les erreurs 401
userApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Sauvegarder l'URL actuelle pour rediriger après connexion
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.setItem('redirectAfterLogin', currentPath);
      }
      // Rediriger vers la page de connexion
      navigateTo('/login');
    }
    return Promise.reject(error);
  }
);

export interface Product {
  itemid: string;
  name: string;
  image: string;
  ratings: number;
  discount_price: number;
  actual_price: number;
  description?: string;
  category?: string;
  brand?: string;
  in_stock: boolean;
  stock_quantity: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductRecommendation {
  itemid: string;
  name: string;
  ratings: number;
  discount_price: number;
  actual_price: number;
  similarity_score?: number;
  popularity?: number;
  combined_score?: number;
  explanations?: string[];
  image?: string;
  category?: string;
  brand?: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  price: number;
  added_at: string;
  product_name: string;
  product_image: string;
  total_price: number;
}

export interface Cart {
  user_id: number;
  items: CartItem[];
  total_amount: number;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  order_id: string;
  user_id: number;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  shipping_address: {
    name: string;
    street: string;
    city: string;
    postal_code: string;
    country: string;
    phone: string;
  };
  billing_address?: {
    name: string;
    street: string;
    city: string;
    postal_code: string;
    country: string;
    phone: string;
  };
  subtotal: number;
  shipping_cost: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: number;
  liked_categories: string[];
  liked_brands: string[];
  price_min: number | null;
  price_max: number | null;
}

export const api = {
  // Auth
  register: (data: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    password_confirm: string;
  }) => userApi.post('/api/auth/register/', data),

  login: (data: { email: string; password: string }) =>
    userApi.post('/api/auth/login/', data),

  logout: () => userApi.post('/api/auth/logout/'),

  getProfile: () => userApi.get('/api/auth/profile/'),

  updateProfile: (data: Partial<{ first_name: string; last_name: string }>) =>
    userApi.put('/api/auth/profile/', data),

  // Products
  getProducts: (params?: {
    page?: number;
    page_size?: number;
    category?: string;
    brand?: string;
    min_price?: number;
    max_price?: number;
    ordering?: string;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.category) queryParams.append('category', params.category);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.min_price) queryParams.append('min_price', params.min_price.toString());
    if (params?.max_price) queryParams.append('max_price', params.max_price.toString());
    if (params?.ordering) queryParams.append('ordering', params.ordering);
    if (params?.search) queryParams.append('search', params.search);
    return userApi.get(`/api/products/?${queryParams.toString()}`);
  },

  getProduct: (itemid: string) => userApi.get(`/api/products/${itemid}/`),

  getProductRecommendations: (itemid: string, strategy: 'content' | 'collaborative' | 'hybrid' = 'content') =>
    userApi.get(`/api/products/${itemid}/recommendations/?strategy=${strategy}`),

  // Cart
  getCart: () => userApi.get('/api/cart/'),

  addToCart: (data: { product_id: string; quantity: number }) =>
    userApi.post('/api/cart/', data),

  removeFromCart: (product_id: string) =>
    userApi.delete(`/api/cart/remove/${product_id}/`),

  // Orders
  getOrders: () => userApi.get('/api/orders/'),

  createOrder: (data: {
    shipping_address: {
      name: string;
      street: string;
      city: string;
      postal_code: string;
      country: string;
      phone: string;
    };
    shipping_cost?: number;
    tax_amount?: number;
  }) => userApi.post('/api/orders/', data),

  // Recommendations
  getUserRecommendations: (strategy: 'content' | 'collaborative' | 'hybrid' = 'content') =>
    userApi.get(`/api/recommendations/user/?strategy=${strategy}`),

  getModelRecommendations: (params?: {
    model?: 'content' | 'collaborative' | 'hybrid';
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.model) queryParams.append('model', params.model);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const queryString = queryParams.toString();
    return userApi.get(`/api/recommendations/model/${queryString ? '?' + queryString : ''}`);
  },

  getRecommendationConfig: () =>
    userApi.get('/api/recommendations/config/'),

  getPopularProducts: () => userApi.get('/api/recommendations/popular/'),

  // Interactions
  recordInteraction: (data: {
    product_id: string;
    interaction_type: 'view' | 'like' | 'rating';
    rating?: number;
  }) => userApi.post('/api/interactions/', data),

  // Favoris
  getFavorites: () => userApi.get('/api/favorites/'),
  removeFavorite: (product_id: string) => userApi.delete(`/api/favorites/${product_id}/`),
  clearAllFavorites: () => userApi.delete('/api/favorites/clear/'),

  // Preferences
  getPreferences: () => userApi.get('/api/onboarding/preferences/'),

  updatePreferences: (data: {
    liked_categories?: string[];
    liked_brands?: string[];
    price_min?: number;
    price_max?: number;
  }) => userApi.post('/api/onboarding/preferences/', data),

  // Search
  search: (query: string) => userApi.get(`/api/search/?q=${encodeURIComponent(query)}`),

  // Metrics
  getMetrics: () => userApi.get('/api/metrics/'),
};

export default userApi;

