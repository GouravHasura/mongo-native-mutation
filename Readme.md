The script generates the native mutation
Pre:
1. DDN project
2. MongoDB connector is added
3. Introspection is successfull
4. Make sure the correct the `--schema-dir` and `--output-dir`

command used:

```
python3 -m scripts.mongo_mutations.mutations --schema-dir /ddn-project/app/connector/mongo/schema --output-dir /ddn-project/app/connector/mongo/native_mutations
```
