"""
Modèles MongoDB avec MongoEngine
"""
from mongoengine import Document, EmbeddedDocument, fields
from datetime import datetime


class Product(Document):
    """Modèle Product pour MongoDB"""
    itemid = fields.StringField(required=True, unique=True, max_length=50)
    name = fields.StringField(required=True, max_length=500)
    image = fields.URLField()
    ratings = fields.FloatField(min_value=0, max_value=5, default=0)
    discount_price = fields.DecimalField(min_value=0, precision=2)
    actual_price = fields.DecimalField(min_value=0, precision=2)
    
    # Informations supplémentaires
    description = fields.StringField()
    category = fields.StringField(max_length=100)
    brand = fields.StringField(max_length=100)
    in_stock = fields.BooleanField(default=True)
    stock_quantity = fields.IntField(min_value=0, default=0)
    
    # Métadonnées
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'products',
        'indexes': [
            'itemid',
            'category',
            'brand',
            ('ratings', '-created_at'),
            [('name', 'text'), ('description', 'text')]
        ]
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.itemid} - {self.name}"


class CartItem(EmbeddedDocument):
    """Item du panier"""
    product_id = fields.StringField(required=True)
    quantity = fields.IntField(min_value=1, default=1)
    price = fields.DecimalField(min_value=0, precision=2)
    added_at = fields.DateTimeField(default=datetime.utcnow)


class Cart(Document):
    """Panier utilisateur"""
    user_id = fields.IntField(required=True)
    items = fields.ListField(fields.EmbeddedDocumentField(CartItem))
    total_amount = fields.DecimalField(min_value=0, precision=2, default=0)
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'carts',
        'indexes': ['user_id']
    }

    def calculate_total(self):
        """Calculer le montant total du panier"""
        total = sum(item.price * item.quantity for item in self.items)
        self.total_amount = total
        return total

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        self.calculate_total()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Panier utilisateur {self.user_id}"


class OrderItem(EmbeddedDocument):
    """Item de commande"""
    product_id = fields.StringField(required=True)
    product_name = fields.StringField(required=True)
    quantity = fields.IntField(min_value=1, required=True)
    unit_price = fields.DecimalField(min_value=0, precision=2, required=True)
    total_price = fields.DecimalField(min_value=0, precision=2, required=True)


class Order(Document):
    """Commande utilisateur"""
    order_id = fields.StringField(required=True, unique=True)
    user_id = fields.IntField(required=True)
    items = fields.ListField(fields.EmbeddedDocumentField(OrderItem))
    
    # Informations de livraison
    shipping_address = fields.DictField()
    billing_address = fields.DictField()
    
    # Montants
    subtotal = fields.DecimalField(min_value=0, precision=2, required=True)
    shipping_cost = fields.DecimalField(min_value=0, precision=2, default=0)
    tax_amount = fields.DecimalField(min_value=0, precision=2, default=0)
    total_amount = fields.DecimalField(min_value=0, precision=2, required=True)
    
    # Statut
    status = fields.StringField(
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
    
    # Métadonnées
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'orders',
        'indexes': [
            'order_id',
            'user_id',
            'status',
            '-created_at'
        ]
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Commande {self.order_id}"


class UserInteraction(Document):
    """Interactions utilisateur pour le système de recommandation"""
    user_id = fields.IntField(required=True)
    product_id = fields.StringField(required=True)
    interaction_type = fields.StringField(
        choices=[
            ('view', 'Vue'),
            ('like', 'Like'),
            ('add_to_cart', 'Ajout au panier'),
            ('purchase', 'Achat'),
            ('rating', 'Note')
        ],
        required=True
    )
    
    # Données spécifiques à l'interaction
    rating = fields.FloatField(min_value=1, max_value=5)  # Pour les notes
    quantity = fields.IntField(min_value=1)  # Pour les achats
    
    # Métadonnées
    timestamp = fields.DateTimeField(default=datetime.utcnow)
    session_id = fields.StringField()

    meta = {
        'collection': 'user_interactions',
        'indexes': [
            'user_id',
            'product_id',
            'interaction_type',
            '-timestamp',
            ('user_id', 'product_id', 'interaction_type')
        ]
    }

    def __str__(self):
        return f"Utilisateur {self.user_id} - {self.interaction_type} - Produit {self.product_id}"


class UserPreference(Document):
    """Préférences utilisateur pour onboarding/perso"""
    user_id = fields.IntField(required=True, unique=True)
    liked_categories = fields.ListField(fields.StringField(), default=list)
    liked_brands = fields.ListField(fields.StringField(), default=list)
    price_min = fields.FloatField()
    price_max = fields.FloatField()
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'user_preferences',
        'indexes': ['user_id']
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        super().save(*args, **kwargs)


class Event(Document):
    """Événements utilisateur pour le collaborative filtering"""
    visitorid = fields.StringField(required=True, max_length=100)
    itemid = fields.StringField(required=True, max_length=50)
    event = fields.StringField(
        required=True,
        choices=[
            ('view', 'Vue'),
            ('addtocart', 'Ajout au panier'),
            ('transaction', 'Transaction'),
            ('removefromcart', 'Retrait du panier')
        ]
    )
    # Timestamp optionnel pour le collaborative filtering
    timestamp = fields.DateTimeField(default=datetime.utcnow)
    
    # Métadonnées
    created_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'events',
        'indexes': [
            'visitorid',
            'itemid',
            'event',
            '-timestamp',
            ('visitorid', 'itemid'),
            ('visitorid', '-timestamp'),
            ('itemid', '-timestamp')
        ]
    }

    def __str__(self):
        return f"Event: {self.visitorid} - {self.event} - {self.itemid}"


class AnalyticsUser(Document):
    """Collection unifiée des utilisateurs/visiteurs (MongoDB)"""
    SOURCE_CHOICES = (
        ('visitor', 'Visitor (events)'),
        ('registered', 'Registered Django user'),
    )

    visitorid = fields.StringField(required=True, unique=True, max_length=200)
    user_id = fields.IntField()
    source = fields.StringField(choices=[c[0] for c in SOURCE_CHOICES], default='visitor')
    email = fields.EmailField()
    username = fields.StringField(max_length=255)
    first_name = fields.StringField(max_length=150)
    last_name = fields.StringField(max_length=150)
    first_seen_at = fields.DateTimeField()
    last_seen_at = fields.DateTimeField()
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'users',
        'indexes': [
            'visitorid',
            'user_id',
            '-last_seen_at',
            '-updated_at',
        ]
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        super().save(*args, **kwargs)


class RecommendationConfig(Document):
    """Configuration du moteur de reco (poids, stratégie par défaut)"""
    config_name = fields.StringField(required=True, unique=True, default='default')
    popularity_weight = fields.FloatField(default=0.05)  # poids pour hybrid
    preference_bonus_category = fields.FloatField(default=0.05)
    preference_bonus_brand = fields.FloatField(default=0.05)
    preference_bonus_price = fields.FloatField(default=0.05)
    default_strategy = fields.StringField(choices=['content', 'collaborative', 'hybrid'], default='content')
    
    selected_model = fields.StringField(
        choices=['hybrid', 'content-based', 'collaborative-filtering'],
        default='hybrid'
    )
    created_at = fields.DateTimeField(default=datetime.utcnow)
    updated_at = fields.DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'recommendation_config',
        'indexes': ['config_name']
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        super().save(*args, **kwargs)


class ModelTrainingHistory(Document):
    """
    Historique des réentraînements de modèles de recommandation
    (Content-Based, Collaborative Filtering, etc.)
    """
    MODEL_CHOICES = (
        ('content_based', 'Content-Based'),
        ('collaborative_filtering', 'Collaborative Filtering'),
    )

    STATUS_CHOICES = (
        ('started', 'Started'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    )

    model_name = fields.StringField(required=True, choices=[c[0] for c in MODEL_CHOICES])
    status = fields.StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default='started')
    started_at = fields.DateTimeField(default=datetime.utcnow)
    finished_at = fields.DateTimeField()
    duration_sec = fields.FloatField()

    # Paramètres utilisés pour l'entraînement (sample_ratio, min_interactions, etc.)
    params = fields.DictField()

    # Statistiques d'entraînement (snapshot)
    training_stats = fields.DictField()

    # Message d'erreur éventuel
    error_message = fields.StringField()

    meta = {
        'collection': 'model_training_history',
        'indexes': [
            '-started_at',
            'model_name',
            'status',
        ],
    }

    def __str__(self):
        return f"{self.model_name} - {self.status} - {self.started_at.isoformat()}"