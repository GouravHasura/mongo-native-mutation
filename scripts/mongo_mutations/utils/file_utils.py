"""
Utility functions for file operations.
"""
import os
import json
from typing import Dict, Any, List


def ensure_directory_exists(directory_path: str) -> None:
    """
    Ensure that a directory exists, creating it if necessary.
    
    Args:
        directory_path: Path to the directory to ensure exists
    """
    os.makedirs(directory_path, exist_ok=True)


def load_json_file(filepath: str) -> Dict[str, Any]:
    """
    Load and parse a JSON file.
    
    Args:
        filepath: Path to the JSON file
        
    Returns:
        Parsed JSON content as a dictionary
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        json.JSONDecodeError: If the file contains invalid JSON
    """
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}")
        raise
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in file: {filepath}")
        raise


def save_json_file(filepath: str, data: Dict[str, Any], indent: int = 2) -> None:
    """
    Save data to a JSON file.
    
    Args:
        filepath: Path where to save the JSON file
        data: Data to save
        indent: Indentation level for the JSON file
    """
    ensure_directory_exists(os.path.dirname(filepath))
    with open(filepath, "w") as f:
        json.dump(data, f, indent=indent)


def list_json_files(directory: str) -> List[str]:
    """
    List all JSON files in a directory.
    
    Args:
        directory: Directory to search for JSON files
        
    Returns:
        List of paths to JSON files
    """
    if not os.path.exists(directory):
        print(f"Warning: Directory does not exist: {directory}")
        return []
        
    return [
        os.path.join(directory, filename)
        for filename in os.listdir(directory)
        if filename.endswith(".json")
    ]
