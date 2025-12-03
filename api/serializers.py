"""
Sérialiseurs pour les modèles MongoDB
"""
from rest_framework import serializers
from .models import Product, Cart, CartItem, Order, OrderItem, UserInteraction
from .utils import fetch_product_by_itemid
import uuid


class ProductSerializer(serializers.Serializer):
    """Sérialiseur pour les produits"""
    itemid = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=500)
    image = serializers.URLField(required=False, allow_blank=True)
    ratings = serializers.FloatField(min_value=0, max_value=5, default=0)
    discount_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    actual_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    description = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(max_length=100, required=False, allow_blank=True)
    brand = serializers.CharField(max_length=100, required=False, allow_blank=True)
    in_stock = serializers.BooleanField(default=True)
    stock_quantity = serializers.IntegerField(min_value=0, default=0)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        return Product.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class CartItemSerializer(serializers.Serializer):
    """Sérialiseur pour les items du panier"""
    product_id = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    added_at = serializers.DateTimeField(read_only=True)
    
    # Champs calculés
    product_name = serializers.CharField(read_only=True)
    product_image = serializers.URLField(read_only=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)


class CartSerializer(serializers.Serializer):
    """Sérialiseur pour le panier"""
    user_id = serializers.IntegerField()
    items = CartItemSerializer(many=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        cart = Cart.objects.create(**validated_data)
        
        for item_data in items_data:
            cart.items.append(CartItem(**item_data))
        
        cart.save()
        return cart

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', [])
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        if items_data:
            instance.items = [CartItem(**item_data) for item_data in items_data]
        
        instance.save()
        return instance


class OrderItemSerializer(serializers.Serializer):
    """Sérialiseur pour les items de commande"""
    product_id = serializers.CharField()
    product_name = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class OrderSerializer(serializers.Serializer):
    """Sérialiseur pour les commandes"""
    order_id = serializers.CharField(read_only=True)
    user_id = serializers.IntegerField()
    items = OrderItemSerializer(many=True)
    shipping_address = serializers.DictField()
    billing_address = serializers.DictField(required=False)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    shipping_cost = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_amount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    status = serializers.ChoiceField(
        choices=[
            ('pending', 'En attente'),
            ('confirmed', 'Confirmée'),
            ('processing', 'En traitement'),
            ('shipped', 'Expédiée'),
            ('delivered', 'Livrée'),
            ('cancelled', 'Annulée')
        ],
        default='pending'
    )
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Générer un ID de commande unique
        validated_data['order_id'] = f"ORD-{uuid.uuid4().hex[:8].upper()}"
        
        # Créer explicitement le document puis ajouter les items
        order = Order(**validated_data)
        order.items = [OrderItem(**item_data) for item_data in items_data]
        order.save()
        return order


class UserInteractionSerializer(serializers.Serializer):
    """Sérialiseur pour les interactions utilisateur"""
    user_id = serializers.IntegerField(required=False)  # Sera ajouté automatiquement dans la vue
    product_id = serializers.CharField()
    interaction_type = serializers.ChoiceField(
        choices=[
            ('view', 'Vue'),
            ('like', 'Like'),
            ('add_to_cart', 'Ajout au panier'),
            ('purchase', 'Achat'),
            ('rating', 'Note')
        ]
    )
    rating = serializers.FloatField(min_value=1, max_value=5, required=False)
    quantity = serializers.IntegerField(min_value=1, required=False)
    session_id = serializers.CharField(required=False)
    timestamp = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        # Normaliser product_id en string
        if 'product_id' in validated_data:
            validated_data['product_id'] = str(validated_data['product_id']).strip()
        return UserInteraction.objects.create(**validated_data)


class AddToCartSerializer(serializers.Serializer):
    """Sérialiseur pour ajouter un produit au panier"""
    product_id = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1, default=1)

    def validate_product_id(self, value):
        try:
            product = fetch_product_by_itemid(value)
        except Product.DoesNotExist:
            raise serializers.ValidationError("Produit introuvable.")

        # Vérification du stock désactivée - permettre l'ajout même si produit non en stock
        # if not product.in_stock:
        #     raise serializers.ValidationError("Ce produit n'est pas en stock.")

        # Normaliser avec l'identifiant exact du document
        return str(product.itemid)


class CreateOrderSerializer(serializers.Serializer):
    """Sérialiseur pour créer une commande"""
    shipping_address = serializers.DictField()
    billing_address = serializers.DictField(required=False)
    shipping_cost = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_amount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)