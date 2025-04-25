#!/usr/bin/env python3
"""
MongoDB Mutation Generator

This script generates mutation files for MongoDB collections based on schema definitions.
"""
import sys
import argparse
from typing import List

from scripts.mongo_mutations.utils.file_utils import load_json_file, list_json_files, ensure_directory_exists
from scripts.mongo_mutations.utils.schema_utils import extract_collection_info
from scripts.mongo_mutations.utils.mutation_generator import generate_all_mutations_for_collection

# Default directories
DEFAULT_SCHEMA_DIR = "app/connector/mongo/schema"
DEFAULT_OUTPUT_DIR = "app/connector/mongo/native_mutations"


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Generate MongoDB mutation files from schema definitions")
    parser.add_argument(
        "--schema-dir",
        default=DEFAULT_SCHEMA_DIR,
        help=f"Directory containing schema JSON files (default: {DEFAULT_SCHEMA_DIR})"
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory to save generated mutation files (default: {DEFAULT_OUTPUT_DIR})"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    return parser.parse_args()


def process_schema_file(schema_filepath: str, output_dir: str, verbose: bool = False) -> List[str]:
    """
    Process a single schema file and generate mutation files.

    Args:
        schema_filepath: Path to the schema JSON file
        output_dir: Directory to save the mutation files
        verbose: Whether to print verbose output

    Returns:
        List of paths to the generated files
    """
    if verbose:
        print(f"Processing schema file: {schema_filepath}")

    try:
        schema_json = load_json_file(schema_filepath)
        collection_info = extract_collection_info(schema_json)

        if verbose:
            print(f"  Collection: {collection_info['collection_name']}")
            print(f"  Object type: {collection_info['object_type']}")

        generated_files = generate_all_mutations_for_collection(collection_info, output_dir)

        if verbose:
            print(f"  Generated {len(generated_files)} mutation files")

        return generated_files

    except Exception as e:
        print(f"Error processing schema file {schema_filepath}: {e}")
        return []


def generate_all_mutations(schema_dir: str, output_dir: str, verbose: bool = False) -> int:
    """
    Generate mutations for all JSON files in the schema folder.

    Args:
        schema_dir: Directory containing schema JSON files
        output_dir: Directory to save generated mutation files
        verbose: Whether to print verbose output

    Returns:
        Number of generated mutation files
    """
    ensure_directory_exists(output_dir)

    schema_files = list_json_files(schema_dir)

    if not schema_files:
        print(f"No schema files found in {schema_dir}")
        return 0

    if verbose:
        print(f"Found {len(schema_files)} schema files")

    total_generated = 0
    for schema_filepath in schema_files:
        generated_files = process_schema_file(schema_filepath, output_dir, verbose)
        total_generated += len(generated_files)

    return total_generated


def main():
    """Main entry point."""
    args = parse_arguments()

    if args.verbose:
        print(f"Schema directory: {args.schema_dir}")
        print(f"Output directory: {args.output_dir}")

    try:
        num_generated = generate_all_mutations(args.schema_dir, args.output_dir, args.verbose)
        print(f"Successfully generated {num_generated} mutation files")
        return 0
    except Exception as e:
        print(f"Error generating mutations: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())