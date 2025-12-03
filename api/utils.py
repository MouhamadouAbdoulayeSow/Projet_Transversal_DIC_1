from __future__ import annotations

from typing import Any

from .models import Product


def fetch_product_by_itemid(item_identifier: Any) -> Product:
    """
    Retrieve a product regardless of whether the stored itemid in MongoDB
    is a string or a numeric type.
    Raises Product.DoesNotExist if no matching document is found.
    """
    candidates = []
    value_str = str(item_identifier)

    # Prioritise the raw value (useful when already the correct type)
    candidates.append(item_identifier)

    # Always try the string representation
    if value_str not in candidates:
        candidates.append(value_str)

    # If the string is numeric, also try the integer form
    if value_str.isdigit():
        numeric_value = int(value_str)
        if numeric_value not in candidates:
            candidates.append(numeric_value)

    tried = set()
    for candidate in candidates:
        key = (type(candidate), candidate)
        if key in tried:
            continue
        tried.add(key)
        try:
            return Product.objects.get(itemid=candidate)
        except Product.DoesNotExist:
            continue

    raise Product.DoesNotExist


