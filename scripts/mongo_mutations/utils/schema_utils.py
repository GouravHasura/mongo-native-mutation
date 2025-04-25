"""
Utility functions for schema operations.
"""
from typing import Dict, Any, List, Optional


def extract_collection_info(schema_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract collection information from a schema JSON.

    Args:
        schema_json: The schema JSON

    Returns:
        Dictionary with collection name and object type

    Raises:
        KeyError: If the schema doesn't have the expected structure
        IndexError: If there are no collections in the schema
    """
    try:
        collection_name = list(schema_json["collections"].keys())[0]
        object_type = schema_json["collections"][collection_name]["type"]
        fields = schema_json["objectTypes"][object_type]["fields"]

        return {
            "collection_name": collection_name,
            "object_type": object_type,
            "fields": fields
        }
    except (KeyError, IndexError) as e:
        print(f"Error extracting collection info: {e}")
        raise


def get_field_types(fields: Dict[str, Any]) -> Dict[str, str]:
    """
    Extract field types from schema fields.

    Args:
        fields: Fields dictionary from schema

    Returns:
        Dictionary mapping field names to their types
    """
    field_types = {}
    for field_name, field_info in fields.items():
        if "type" in field_info:
            type_info = field_info["type"]
            field_types[field_name] = _extract_type_info(type_info)

    return field_types


def _extract_type_info(type_info: Dict[str, Any]) -> str:
    """
    Extract type information from a type dictionary.

    Args:
        type_info: Type information dictionary

    Returns:
        String representation of the type
    """
    if "scalar" in type_info:
        return type_info["scalar"]
    elif "object" in type_info:
        return f"object:{type_info['object']}"
    elif "array" in type_info:
        array_type = type_info["array"]
        if isinstance(array_type, dict):
            return f"array:{_extract_type_info(array_type)}"
        else:
            return f"array:{array_type}"
    elif "nullable" in type_info:
        nullable_type = type_info["nullable"]
        if isinstance(nullable_type, dict):
            return f"nullable:{_extract_type_info(nullable_type)}"
        else:
            return f"nullable:{nullable_type}"
    else:
        return "unknown"


def get_primary_key_field(fields: Dict[str, Any]) -> Optional[str]:
    """
    Find the primary key field in the schema.

    Args:
        fields: Fields dictionary from schema

    Returns:
        Name of the primary key field, or None if not found
    """
    for field_name, field_info in fields.items():
        if field_info.get("primary", False):
            return field_name

    # Default to "_id" if no primary key is explicitly defined
    if "_id" in fields:
        return "_id"

    return None
