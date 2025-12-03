"""
Commande Django pour charger des données d'exemple dans MongoDB
"""
from django.core.management.base import BaseCommand
from api.models import Product
import json


class Command(BaseCommand):
    help = 'Charge des données d\'exemple dans MongoDB'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='sample_products.json',
            help='Fichier JSON contenant les données produits'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        
        # Données d'exemple par défaut
        sample_products = [
            {
                "itemid": "P001",
                "name": "Redmi 10 Power (Power Black, 8GB RAM, 128GB Storage)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.0,
                "discount_price": 10999,
                "actual_price": 18999,
                "description": "Smartphone Redmi avec une grande autonomie de batterie",
                "category": "Smartphones",
                "brand": "Redmi",
                "in_stock": True,
                "stock_quantity": 50
            },
            {
                "itemid": "P002",
                "name": "Samsung Galaxy A52 (Awesome Black, 6GB RAM, 128GB Storage)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.2,
                "discount_price": 25999,
                "actual_price": 32999,
                "description": "Smartphone Samsung avec appareil photo haute résolution",
                "category": "Smartphones",
                "brand": "Samsung",
                "in_stock": True,
                "stock_quantity": 30
            },
            {
                "itemid": "P003",
                "name": "iPhone 13 (Blue, 128GB)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.8,
                "discount_price": 69999,
                "actual_price": 79999,
                "description": "iPhone 13 avec puce A15 Bionic",
                "category": "Smartphones",
                "brand": "Apple",
                "in_stock": True,
                "stock_quantity": 20
            },
            {
                "itemid": "P004",
                "name": "Sony WH-1000XM4 Wireless Noise Cancelling Headphones",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.5,
                "discount_price": 29999,
                "actual_price": 34999,
                "description": "Casque audio sans fil avec réduction de bruit active",
                "category": "Audio",
                "brand": "Sony",
                "in_stock": True,
                "stock_quantity": 25
            },
            {
                "itemid": "P005",
                "name": "Dell XPS 13 Laptop (Intel i7, 16GB RAM, 512GB SSD)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.6,
                "discount_price": 134999,
                "actual_price": 149999,
                "description": "Ordinateur portable Dell ultra-portable pour professionnels",
                "category": "Laptops",
                "brand": "Dell",
                "in_stock": True,
                "stock_quantity": 15
            },
            {
                "itemid": "P006",
                "name": "Apple MacBook Air M1 (Silver, 8GB RAM, 256GB SSD)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.9,
                "discount_price": 89999,
                "actual_price": 99999,
                "description": "MacBook Air avec puce M1 pour une performance exceptionnelle",
                "category": "Laptops",
                "brand": "Apple",
                "in_stock": True,
                "stock_quantity": 12
            },
            {
                "itemid": "P007",
                "name": "Canon EOS R6 Mirrorless Camera (Body Only)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.7,
                "discount_price": 189999,
                "actual_price": 219999,
                "description": "Appareil photo mirrorless professionnel Canon",
                "category": "Cameras",
                "brand": "Canon",
                "in_stock": True,
                "stock_quantity": 8
            },
            {
                "itemid": "P008",
                "name": "Nintendo Switch OLED Model (White)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.4,
                "discount_price": 34999,
                "actual_price": 39999,
                "description": "Console de jeu Nintendo Switch avec écran OLED",
                "category": "Gaming",
                "brand": "Nintendo",
                "in_stock": True,
                "stock_quantity": 40
            },
            {
                "itemid": "P009",
                "name": "Samsung 55-Inch 4K Smart TV (Crystal UHD)",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.3,
                "discount_price": 49999,
                "actual_price": 59999,
                "description": "Téléviseur Samsung 4K avec technologie Crystal UHD",
                "category": "TV",
                "brand": "Samsung",
                "in_stock": True,
                "stock_quantity": 22
            },
            {
                "itemid": "P010",
                "name": "Fitbit Charge 5 Advanced Fitness Tracker",
                "image": "https://m.media-amazon.com/images/I/81eM15lVcJL._AC_UL320_.jpg",
                "ratings": 4.1,
                "discount_price": 14999,
                "actual_price": 19999,
                "description": "Tracker de fitness avancé avec GPS intégré",
                "category": "Wearables",
                "brand": "Fitbit",
                "in_stock": True,
                "stock_quantity": 35
            }
        ]

        try:
            # Charger depuis fichier si spécifié et existant
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    sample_products = json.load(f)
                self.stdout.write(f'Données chargées depuis {file_path}')
            except FileNotFoundError:
                self.stdout.write(f'Fichier {file_path} non trouvé, utilisation des données par défaut')

            # Supprimer les produits existants
            Product.objects.all().delete()
            self.stdout.write('Anciens produits supprimés')

            # Insérer les nouveaux produits
            for product_data in sample_products:
                Product.objects.create(**product_data)

            self.stdout.write(
                self.style.SUCCESS(f'{len(sample_products)} produits chargés avec succès dans MongoDB')
            )

            # Réinitialiser le système de recommandation
            from recommendations.engine import initialize_recommender
            initialize_recommender()
            self.stdout.write(
                self.style.SUCCESS('Système de recommandation réinitialisé')
            )

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Erreur lors du chargement des données: {e}')
            )