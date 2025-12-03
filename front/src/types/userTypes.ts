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

export interface Metrics {
  interactions_total: {
    view: number;
    like: number;
    add_to_cart: number;
    purchase: number;
    rating: number;
  };
  interactions_last_24h: {
    view: number;
    like: number;
    add_to_cart: number;
    purchase: number;
    rating: number;
  };
}

