# Importing and recovering legacy deployment credentials

Ordinary deployment still stops when existing volumes have no managed-secrets.env. Never delete volumes, generate replacement passwords, truncate old values or copy random candidates from a new bundle.

Run matching installed CLI/deploy versions with supported Node on the target Linux server as its deployment owner or administrator. Ordinary offline deployment does not require server Node. Stop business writes, exclude old deployment processes, and back up the database, objects, volumes, original credentials, current and successful release before importing. Import does not stop services, rotate passwords, migrate databases or advance current.

Original services must remain running. Verification checks Compose project/service labels and actual volume mounts, then authenticates read-only: PostgreSQL/MySQL SELECT 1, LDAP bind, or S3 bucket HEAD. S3 uses the same project's running hai-<projectName>-app Node container on a shared network without installing tools or writing client configuration. Keep the application in maintenance mode. Missing tools, wrong credentials or mismatched identity are rejected.

PostgreSQL uses a non-loopback connection and explicitly requires require_auth=scram-sha-256,md5,password (psql/libpq 16+), rejecting trust or incomplete authentication. For both application and root accounts, MySQL must accept the supplied password and reject a random incorrect password with an authentication error; bypassed authorization cannot pass. See [libpq authentication requirements](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNECT-REQUIRE-AUTH).

Create an operator-approved, non-symlink JSON input with mode 0600. Its version is 1; projectName includes the environment suffix and excludes the automatic hai- prefix. Example structure:

```json
{
  "version": 1,
  "projectName": "shop-test",
  "credentials": { "DB_PASSWORD": "original-password-from-protected-source" },
  "services": [{
    "service": "db", "kind": "postgresql", "container": "hai-shop-test-db",
    "volumes": ["hai-shop-test_shop-test-db-data"], "username": "hai", "database": "hai"
  }]
}
```

Replace every example identifier and password placeholder with verified original values. List only managed services: db/vecdb share DB_PASSWORD, storage uses STORAGE_PASSWORD, ldap uses LDAP_PASSWORD. Supported kinds are postgresql/mysql/s3/ldap. S3 fields accessKeyId, bucket and region default to hai-storage, hai and us-east-1. LDAP bindDn defaults to cn=admin,dc=example,dc=org. Passwords preserve spaces, quotes, backslashes, dollar signs and Unicode; empty values, newlines, NUL and control characters are rejected. Every specified volume must belong to the verified service.

Managed sidecars currently require account/database hai, S3 hai-storage/bucket hai/us-east-1, and the default LDAP bindDn. MySQL additionally verifies that root and application passwords match. Custom identities are explicitly rejected rather than silently changed after import; retain their external middleware configuration or plan a separate identity migration.

```sh
chmod 600 /private/shop-import.json
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker
# Review the value-free receipt before committing.
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker --apply
```

SDK: importDeploymentSecrets({ directory, inputFile, runtime, dryRun: true }). Only dryRun:false commits. Preflight creates no lock or state file. Apply shares the fixed deployment flock, writes a private temporary file, fsyncs it, atomically publishes v2 state with mode 0600 and syncs the directory. It does not replace the lock file. Identical imports are repeatable; conflicting, damaged or symlink states are rejected. A failed receipt with error.ext.state=unknown requires checking state before retrying: a missing receipt does not prove that commit never happened.

V2 stores passwords as UTF-8 hexadecimal, which is **encoding, not encryption**. Protect state and backups as secrets. Project and verified volume bindings prevent reusing state for unrelated data. Runtime files correctly serialize dotenv, JSON and URL passwords. Existing new-project random-password state remains supported without mandatory conversion.

Regenerate a complete fixed bundle while retaining project, directory and volume identities. Verify old database records, S3 objects and hashes before resuming writes. Subsequent full/partial deployment, another packaging machine, and stop/recovery reuse server credentials. Restore a protected matching backup first if state is lost; otherwise reverify trusted original credentials against running original services and import again. Isolate damaged/symlink state for investigation. Interrupted .managed-secrets-*.next files are never treated as committed state. Only clean identified temporary files after checking that no import/deployment process remains. Failure does not advance current or delete volumes. Binary rollback uses a successful release and the same credentials; data recovery follows the backup plan. Password rotation is a separate controlled operation.
