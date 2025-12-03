import pandas as pd
from pymongo import MongoClient

# 1. Charger le CSV
products = pd.read_csv('./products.csv')

# 3. Connexion MongoDB
client = MongoClient("mongodb://127.0.0.1:27017/")
db = client["recommendation-sys-db"]
collection = db["products"]

# 4. Supprimer les anciennes données si besoin
collection.drop()  # facultatif, si tu veux écraser

# 5. Insérer avec les bons IDv
collection.insert_many(products.to_dict("records"))

print("✅ itemid mis à jour et inséré dans MongoDB")