#!/usr/bin/env python3
"""
Test script for MongoDB mutation generator.
"""
import os
import json
import tempfile
import unittest
from pathlib import Path

from scripts.mongo_mutations.utils.file_utils import load_json_file
from scripts.mongo_mutations.utils.schema_utils import extract_collection_info
from scripts.mongo_mutations.utils.mutation_generator import generate_all_mutations_for_collection


class TestMutationGenerator(unittest.TestCase):
    """Test cases for the mutation generator."""

    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.output_dir = self.temp_dir.name
        
        # Sample schema
        self.sample_schema = {
            "name": "TestCollection",
            "collections": {
                "TestCollection": {
                    "type": "TestCollection"
                }
            },
            "objectTypes": {
                "TestCollection": {
                    "fields": {
                        "field1": {
                            "type": {
                                "scalar": "string"
                            }
                        },
                        "field2": {
                            "type": {
                                "nullable": {
                                    "scalar": "int"
                                }
                            }
                        },
                        "_id": {
                            "type": {
                                "scalar": "objectId"
                            }
                        }
                    }
                }
            }
        }

    def tearDown(self):
        """Clean up after tests."""
        self.temp_dir.cleanup()

    def test_extract_collection_info(self):
        """Test extracting collection info from schema."""
        collection_info = extract_collection_info(self.sample_schema)
        
        self.assertEqual(collection_info["collection_name"], "TestCollection")
        self.assertEqual(collection_info["object_type"], "TestCollection")
        self.assertIn("field1", collection_info["fields"])
        self.assertIn("field2", collection_info["fields"])
        self.assertIn("_id", collection_info["fields"])

    def test_generate_mutations(self):
        """Test generating all mutations for a collection."""
        collection_info = extract_collection_info(self.sample_schema)
        generated_files = generate_all_mutations_for_collection(collection_info, self.output_dir)
        
        # Check that all expected files were generated
        self.assertEqual(len(generated_files), 6)
        
        # Check that files exist
        for filepath in generated_files:
            self.assertTrue(os.path.exists(filepath))
        
        # Check content of one file
        insert_file = os.path.join(self.output_dir, "insert_one_testcollection.json")
        self.assertTrue(os.path.exists(insert_file))
        
        with open(insert_file, "r") as f:
            content = json.load(f)
            self.assertEqual(content["name"], "insert_one_testcollection")
            self.assertIn("insert", content["command"])
            self.assertIn("document", content["arguments"])


if __name__ == "__main__":
    unittest.main()
