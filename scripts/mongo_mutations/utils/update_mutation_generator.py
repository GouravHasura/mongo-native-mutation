"""
Functions for generating MongoDB update mutation files.
"""
import os
from typing import Dict, Any, List

from scripts.mongo_mutations.utils.file_utils import save_json_file
from scripts.mongo_mutations.utils.insert_mutation_generator import _extract_scalar_type, _camel_to_lower


def generate_update_by_pk_mutation(collection_info: Dict[str, Any], output_dir: str) -> str:
    """
    Generate an update_by_pk mutation file.

    Args:
        collection_info: Collection information dictionary
        output_dir: Directory to save the mutation file

    Returns:
        Path to the generated file
    """
    collection_name = collection_info["collection_name"]
    fields = collection_info["fields"]

    # Create a result type name
    result_type_name = f"Update{collection_name}"

    # Generate arguments (id and fields to update)
    arguments = {
        "id": {
            "type": {
                "scalar": "objectId"
            }
        }
    }

    # Add all fields except _id as optional update fields
    for field_name, field_info in fields.items():
        if field_name == "_id":
            continue

        # Extract the type information
        type_info = field_info["type"]
        scalar_type = _extract_scalar_type(type_info)

        if scalar_type:
            arguments[_camel_to_lower(field_name)] = {
                "type": {
                    "nullable": {
                        "scalar": scalar_type
                    }
                }
            }

    # Generate document template for $set operation
    set_fields = {}
    for field_name, field_info in fields.items():
        if field_name == "_id":
            continue

        # Create template variable
        var_name = _camel_to_lower(field_name)
        set_fields[field_name] = f"{{{{ {var_name} }}}}"

    # Create the mutation
    mutation = {
        "name": f"update{collection_name}ById",
        "description": f"Update a {collection_name} document by ID",
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
            "update": collection_name,
            "updates": [
                {
                    "q": {
                        "_id": "{{ id }}"
                    },
                    "u": {
                        "$set": set_fields
                    }
                }
            ]
        }
    }

    filepath = os.path.join(output_dir, f"update_{collection_name.lower()}_by_id.json")
    save_json_file(filepath, mutation)
    return filepath
