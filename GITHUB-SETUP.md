# Jastrow publishing setup

Repository: `dakulefsky/jastrow`.

The repository root contains `plugin/`, the lookup tests, and
`.github/workflows/release.yml`.

## Store credentials

In GitHub, open Settings → Secrets and variables → Actions and create:

- `OTZARIA_USER`: the username or email of the existing plugin's store owner.
- `OTZARIA_PASSWORD`: the password for that store account.

Enter the values directly into GitHub's secret fields.

## Publish an update

Keep the plugin ID `com.kulefsky.jastrow`. Version `1.1.0` must be greater
than the version currently in the store; increase it if necessary.

Push to `main`, or choose Actions → Validate and publish Jastrow → Run workflow
after adding the secrets. Pull requests run validation without publication.
Without store secrets, the workflow validates and builds the plugin only.
The resulting package is available in the run's Jastrow-plugin artifact.

This workflow is for updating the existing store listing. A first-ever store
submission also requires screenshots and consent to receive bug reports.
