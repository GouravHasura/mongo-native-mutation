"""
Functions for generating MongoDB mutation files.
"""
from typing import Dict, Any, List


def generate_all_mutations_for_collection(collection_info: Dict[str, Any], output_dir: str) -> List[str]:
    """
    Generate all mutation files for a collection.

    Args:
        collection_info: Collection information dictionary
        output_dir: Directory to save the mutation files

    Returns:
        List of paths to the generated files
    """
    generated_files = []

    # Generate insert mutations
    from scripts.mongo_mutations.utils.insert_mutation_generator import generate_insert_mutation
    generated_files.append(generate_insert_mutation(collection_info, output_dir))

    # Generate update_by_pk mutations
    from scripts.mongo_mutations.utils.update_mutation_generator import generate_update_by_pk_mutation
    generated_files.append(generate_update_by_pk_mutation(collection_info, output_dir))

    # Generate delete_by_id mutations
    from scripts.mongo_mutations.utils.delete_mutation_generator import generate_delete_by_id_mutation
    generated_files.append(generate_delete_by_id_mutation(collection_info, output_dir))

    return generated_files
