# CUDL Services with Docker

This repo contains a Docker image definition for cudl-services. The image isn't yet published to a registry, so you need to build it yourself before use.

## Building the image

The `Makefile` at the root of this repo has a goal to build and correctly tag the image.

To build the image, run:

```commandline
$ make docker-image
[...]
Successfully built f8c4403b68df
Successfully tagged camdl/cudl-services:9f263
```

This will build the image and tag it with a version determined by the git revision it was built from.

## How to use the image

Configuration options need to be provided for the app to start.

### Configuration

There are two ways to provide configuration: config files and environment variables. One or both of these can be used simultaneously.

#### Config file(s)

The app reads loads all configuration files that exist at `/etc/cudl-services/conf.d/*.json5?`. See [`config/example.json5`](../config/example.json5) for an example.

Files loaded in filename order and merged over each other. Two config files will be present in containers by default:

* [`0_default-settings.json5`](../docker/0_default-settings.json5)
* `5_docker_confd.json5` — Containing options specified via environment variables (see below)

To specify a config file, use a volume mount to map it into this directory in the container:

```
$ docker container run \
    -v $PWD/my-config.json:/etc/cudl-services/conf.d/3_my-config.json \
    camdl/cudl-services:xxxx
```

#### Environment variables

`/etc/cudl-services/conf.d/5_docker_confd.json5` is generated from environment variables listed in the following table:

| JSON config property | environment variable                          |
| -------------------------- | --------------------------------------- |
| `dataLocation`             | `CUDL_SERVICES_DATA_LOCATION`           |
| `darwinXTF`                | `CUDL_SERVICES_DARWIN_XTF_URL`          |
| `zacynthiusServiceURL`     | `CUDL_SERVICES_ZACYNTHIUS_HTML_URL`     |
| `xtfBase`                  | `CUDL_SERVICES_XTF_URL`                 |
| `xtfIndexPath`             | `CUDL_SERVICES_XTF_INDEX_PATH`          |
| `postHost`                 | `CUDL_SERVICES_DB_HOST`                 |
| `postDatabase`             | `CUDL_SERVICES_DB_NAME`                 |
| `postUser`                 | `CUDL_SERVICES_DB_USERNAME`             |
| `postPass`                 | `CUDL_SERVICES_DB_PASSWORD`             |
| `users.<api-key>`          | `CUDL_SERVICES_USER_*_KEY`              |
| `users.<api-key>.username` | `CUDL_SERVICES_USER_*_USERNAME`         |
| `users.<api-key>.password` | `CUDL_SERVICES_USER_*_PASSWORD`         |
| `users.<api-key>.email`    | `CUDL_SERVICES_USER_*_EMAIL`            |

For example:

```commandline
$ cat vars.env
CUDL_SERVICES_XTF_URL=http://cudl-xtf/

CUDL_SERVICES_USER_A_KEY=0-1-2-3
CUDL_SERVICES_USER_A_USERNAME=hal
CUDL_SERVICES_USER_A_PASSWORD=secret
CUDL_SERVICES_USER_A_EMAIL=hwtb2@cam.ac.uk
CUDL_SERVICES_USER_B_KEY=4-5-6-7
CUDL_SERVICES_USER_B_USERNAME=bob
$ docker container run --rm \
    --env-file vars.env \
    camdl/cudl-services:xxxx \
    cat /etc/cudl-services/conf.d/5_docker_confd.json5 \
    | npx json5 -s 2
2020-11-03T09:12:21Z 5298359a3717 confd[8]: INFO Backend set to env
2020-11-03T09:12:21Z 5298359a3717 confd[8]: INFO Starting confd
2020-11-03T09:12:21Z 5298359a3717 confd[8]: INFO Backend source(s) set to
2020-11-03T09:12:21Z 5298359a3717 confd[8]: INFO Target config /etc/cudl-services/conf.d/5_docker_confd.json5 out of sync
2020-11-03T09:12:21Z 5298359a3717 confd[8]: INFO Target config /etc/cudl-services/conf.d/5_docker_confd.json5 has been updated
{
  "xtfBase": "http://cudl-xtf/",
  "users": {
    "0-1-2-3": {
      "username": "hal",
      "password": "secret",
      "email": "hwtb2@cam.ac.uk"
    },
    "4-5-6-7": {
      "username": "bob"
    }
  }
}
```
