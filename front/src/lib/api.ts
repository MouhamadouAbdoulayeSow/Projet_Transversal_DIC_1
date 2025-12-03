import axios from 'axios';
import { Config } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  // Essayer d'abord adminToken, puis userToken si l'utilisateur est admin
  let token = localStorage.getItem('adminToken');
  if (!token) {
    const userToken = localStorage.getItem('userToken');
    // Vérifier si l'utilisateur est admin via le store
    try {
      const userAuthData = localStorage.getItem('user-auth');
      if (userAuthData) {
        const parsed = JSON.parse(userAuthData);
        if (parsed?.state?.user?.is_staff && userToken) {
          token = userToken;
        }
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
  }
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

export const adminApi = {
  getMetrics: () => api.get('/api/admin/metrics/'),

  getConfig: () => api.get('/api/admin/config/'),

  updateConfig: (config: Config) => api.post('/api/admin/config/', config),

  retrain: () => api.post('/api/admin/retrain/'),

  getRecoDebug: (itemid: string) =>
    api.get(`/api/admin/reco-debug/?itemid=${itemid}`),

  getUserRecommendations: (userId: number, strategy: string = 'hybrid') =>
    api.get(`/api/admin/user-recommendations/?user_id=${userId}&strategy=${strategy}`),

  getUsersList: (params?: {
    page?: number;
    page_size?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.search) queryParams.append('search', params.search);
    return api.get(`/api/admin/users/?${queryParams.toString()}`);
  },

  getInteractionsTimeline: (params?: {
    page?: number;
    page_size?: number;
    type?: string;
    user_id?: number;
    product_id?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.type) queryParams.append('type', params.type);
    if (params?.user_id) queryParams.append('user_id', params.user_id.toString());
    if (params?.product_id) queryParams.append('product_id', params.product_id);
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    return api.get(`/api/admin/interactions/?${queryParams.toString()}`);
  },

  getTemporalStats: (params?: {
    period?: 'day' | 'week' | 'month';
    days?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.append('period', params.period);
    if (params?.days) queryParams.append('days', params.days.toString());
    return api.get(`/api/admin/stats/temporal/?${queryParams.toString()}`);
  },

  // Collaborative Filtering APIs
  getCFProductRecommendations: (itemid: string, top_n: number = 10) =>
    api.get(`/api/admin/cf/product-recommendations/?itemid=${itemid}&top_n=${top_n}`),

  getCFUserRecommendations: (params: {
    visitorid?: string;
    user_id?: number;
    top_n?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.visitorid) queryParams.append('visitorid', params.visitorid);
    if (params.user_id) queryParams.append('user_id', params.user_id.toString());
    if (params.top_n) queryParams.append('top_n', params.top_n.toString());
    return api.get(`/api/admin/cf/user-recommendations/?${queryParams.toString()}`);
  },

  getCFDebug: (params: {
    itemid?: string;
    visitorid?: string;
    top_n?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.itemid) queryParams.append('itemid', params.itemid);
    if (params.visitorid) queryParams.append('visitorid', params.visitorid);
    if (params.top_n) queryParams.append('top_n', params.top_n.toString());
    return api.get(`/api/admin/cf/debug/?${queryParams.toString()}`);
  },

  getCFStats: () => api.get('/api/admin/cf/stats/'),

  retrainCF: (params?: {
    sample_ratio?: number;
    min_interactions?: number;
    max_events?: number;
  }) => api.post('/api/admin/cf/retrain/', params || {}),

  // Dashboard enrichi
  getEnhancedDashboard: (days?: number) => {
    const queryParams = new URLSearchParams();
    if (days) queryParams.append('days', days.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/dashboard/enhanced${query ? '?' + query : ''}`);
  },

  getBusinessKPIs: (days?: number) => {
    const queryParams = new URLSearchParams();
    if (days) queryParams.append('days', days.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/kpis/business${query ? '?' + query : ''}`);
  },

  getRecommendationPerformance: (days?: number) => {
    const queryParams = new URLSearchParams();
    if (days) queryParams.append('days', days.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/metrics/recommendation-performance${query ? '?' + query : ''}`);
  },

  getSystemHealth: () => api.get('/api/admin/system/health/'),

  getAlerts: () => api.get('/api/admin/alerts/'),

  getActionableRecommendations: () => api.get('/api/admin/recommendations/actionable/'),

  getTopProductsEnhanced: (limit?: number) => {
    const queryParams = new URLSearchParams();
    if (limit) queryParams.append('limit', limit.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/products/top-enhanced${query ? '?' + query : ''}`);
  },

  getCategoryAnalysis: () => api.get('/api/admin/analysis/category/'),

  getMetricsComparison: (days1?: number, days2?: number) => {
    const queryParams = new URLSearchParams();
    if (days1) queryParams.append('days1', days1.toString());
    if (days2) queryParams.append('days2', days2.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/metrics/comparison${query ? '?' + query : ''}`);
  },

  getTrainingHistory: (limit?: number) => {
    const queryParams = new URLSearchParams();
    if (limit) queryParams.append('limit', limit.toString());
    const query = queryParams.toString();
    return api.get(`/api/admin/models/training-history/${query ? '?' + query : ''}`);
  },

  // Produits recommandés selon le modèle choisi
  getRecommendedProducts: (params?: {
    model?: 'content' | 'collaborative' | 'hybrid';
    limit?: number;
    source_itemid?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.model) queryParams.append('model', params.model);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.source_itemid) queryParams.append('source_itemid', params.source_itemid);
    const query = queryParams.toString();
    return api.get(`/api/admin/recommendations/products/${query ? '?' + query : ''}`);
  },
};

export default api;
