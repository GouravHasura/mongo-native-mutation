"""
Functions for generating MongoDB insert mutation files.
"""
import os
from typing import Dict, Any, List

from scripts.mongo_mutations.utils.file_utils import save_json_file


def generate_insert_arguments(fields: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate arguments for an insert mutation based on collection fields.
    
    Args:
        fields: Fields dictionary from schema
        
    Returns:
        Dictionary of arguments for the mutation
    """
    arguments = {}
    
    for field_name, field_info in fields.items():
        # Skip _id field for insert mutations
        if field_name == "_id":
            continue
            
        # Extract the type information
        type_info = field_info["type"]
        scalar_type = _extract_scalar_type(type_info)
        
        if scalar_type:
            arguments[_camel_to_lower(field_name)] = {
                "type": {
                    "scalar": scalar_type
                }
            }
    
    return arguments


def _extract_scalar_type(type_info: Dict[str, Any]) -> str:
    """
    Extract the scalar type from a type dictionary.
    
    Args:
        type_info: Type information dictionary
        
    Returns:
        Scalar type as a string, or None if not a scalar type
    """
    if "scalar" in type_info:
        return type_info["scalar"]
    elif "nullable" in type_info and isinstance(type_info["nullable"], dict):
        if "scalar" in type_info["nullable"]:
            return type_info["nullable"]["scalar"]
    
    return None


def _camel_to_lower(s: str) -> str:
    """
    Convert a CamelCase string to lowercase.
    
    Args:
        s: CamelCase string
        
    Returns:
        Lowercase string
    """
    return s[0].lower() + s[1:]


def generate_document_template(fields: Dict[str, Any]) -> Dict[str, str]:
    """
    Generate a document template for an insert mutation.
    
    Args:
        fields: Fields dictionary from schema
        
    Returns:
        Dictionary with field names and template variables
    """
    document = {}
    
    for field_name, field_info in fields.items():
        # Skip _id field for insert mutations
        if field_name == "_id":
            continue
            
        # Create template variable
        var_name = _camel_to_lower(field_name)
        document[field_name] = f"{{{{ {var_name} }}}}"
    
    return document


def generate_insert_mutation(collection_info: Dict[str, Any], output_dir: str) -> str:
    """
    Generate an insert mutation file.
    
    Args:
        collection_info: Collection information dictionary
        output_dir: Directory to save the mutation file
        
    Returns:
        Path to the generated file
    """
    collection_name = collection_info["collection_name"]
    object_type = collection_info["object_type"]
    fields = collection_info["fields"]
    
    # Create a result type name
    result_type_name = f"Insert{collection_name}"
    
    # Generate arguments from fields (excluding _id)
    arguments = generate_insert_arguments(fields)
    
    # Generate document template
    document = generate_document_template(fields)
    
    # Create the mutation
    mutation = {
        "name": f"insert{collection_name}",
        "description": f"Insert a new {collection_name} document",
        "resultType": {
            "object": result_type_name
        },
        "arguments": arguments,
        "objectTypes": {
            result_type_name: {
                "fields": {
                    "ok": {
                        "type": {
                            "scalar": "int"
                        }
                    },
                    "n": {
                        "type": {
                            "scalar": "int"
                        }
                    }
                }
            }
        },
        "command": {
            "insert": collection_name,
            "documents": [document]
        }
    }
    
    filepath = os.path.join(output_dir, f"insert_{collection_name.lower()}.json")
    save_json_file(filepath, mutation)
    return filepath
