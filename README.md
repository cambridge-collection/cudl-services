# CUDL Services

CUDL Services is an [Express](https://expressjs.com/)-powered JavaScript / Typescript middleware application that exposes an API
for accessing various CUDL-related resources.

CUDL Services routes requests made for data by the CUDL Viewer to a PostgreSQL database, metadata document stores
(hosted by us and externally hosted), XTF search instance and image server, and handles the responses back to the
viewer. It also handles one route for the Darwin Correspondence Project that is unrelated to the CUDL Viewer.

The API is publicly accessible and (for the most part) requires no authentication, but is designed to be used primarily
 by the CUDL viewer.

Currently, there are 3 independent instances of CUDL Services in deployment (dev, staging, live).

## Documentation

The main source of documentation for CUDL Services is this [`README.md`](README.md)
file. The diagrams are created using the  open-source, freely available editor [draw.io](https://www.draw.io/)
and stored in [`docs/diagrams/`](docs/diagrams/)
(compressed XML) with PNG versions to insert here in [`docs/images/`](docs/images/).
When making changes to the API, please update the documentation for a gold star :star:

There is also a [document on Confluence](https://cambridge-collections.atlassian.net/wiki/spaces/ULDevelopers/pages/78577721/Cudl-Services)
which may contain some more useful details.

## Running the application locally

For a quick start you can use the configuration in `config/example.json5` and run the following:

    npm install
    make docker-image

This will build the image that is used for running locally.  Note the id of this image. Then you can
run this build with (**but substitute your id for `camdl/cudl-services:xxxx`**):

    docker container run -v $PWD/config/example.json5:/etc/cudl-services/conf.d/3_my-config.json  -p 3000:3000 --name cudl-services-container   camdl/cudl-services:xxxx

This will start services on localhost port 3000. E.g. [http://localhost:3000/v1/transcription/tei/diplomatic/internal/MS-ADD-03958/i111](http://localhost:3000/v1/transcription/tei/diplomatic/internal/MS-ADD-03958/i111)

For full details on running with docker see [CUDL Services with Docker](docs/docker.md).

## Running Tests

You can run the tests locally by using the command:

     docker-compose run --rm test

You can also run lint with the command:

    npm run lint

and if you want to automatically fix any linting errors:

    npm run fix

## Configuration and Deployment

The configuration and deployment is handled by AWS CDK.  You can see the code here:
[https://github.com/cambridge-collection/cudl-cdk](https://github.com/cambridge-collection/cudl-cdk).

The README contains more details on updating the configuration and deploying services.
See [https://github.com/cambridge-collection/cudl-cdk/blob/main/src/main.ts](https://github.com/cambridge-collection/cudl-cdk/blob/main/src/main.ts)
for more details on the configuration including:

* Paths to mounted volumes that store metadata
* PostgreSQL configuration
* Image server host
* Darwin XTF host

The external hosts responsible for returning transcription data for the Newton Project, Darwin Manuscripts Project
and Quranic Palimpsests are configured within the [`transcription.js`](routes/transcription.js)
route file.

## Logging

You can find the CDK logs for the deployment in CloudWatch.  There are separate logs
for dev, staging and live deployments.

Looks for Log Groups with the names e.g. `CudlDev-CudlServicesCudlServicesTaskMainLogGroup...`
in the London (eu-west-2) region.

NOTE: Not everything is logged, and it will be helpful in the future to include more logging at
the application level for debugging.

## Routes and Responses

The routes in use are defined in [`app.js`](app.js#app.js-81):

![Routes and Responses](docs/images/services-api.png)

### Darwin Correspondence Project (DCP)
Route: `/v1/darwin/`

Definition: [`routes/darwin.js`](routes/darwin.js)

Returns: Search results on the public DCP XTF index.

Usage: By the Drupal public DCP portal at [www.darwinproject.ac.uk](https://www.darwinproject.ac.uk).

**NB**: This route is secured by an authentication token so that only the DCP Drupal instance can use it. For more on
the Darwin Correspondence Project see [DCP on the CUDL Wiki](https://wiki.cam.ac.uk/cudl-docs/Darwin_Correspondence_Project).

### IIIF
Route: `/v1/iiif/`

Definition: [`routes/iiif.js`](routes/iiif.js)

Returns: An image from an IIIF-compliant image server.

Example Usage: When displaying collection item images in the CUDL Viewer.

**NB:** The 'iiif' route is not currently in use as the IIIF implementation is still in development.

### Images
Route: `/v1/images/`

Definition: [`routes/images.js`](routes/images.js)

**NB:** The 'images' route is currently disused.

### Membership
Route: `/v1/rdb/membership/`

Definition: [`routes/membership.js`](routes/membership.js)

Returns: Title, collection id and collection order of the parent collection(s) of an item by item id.

Example Usage: By the CUDL and DCU XTF search instances.

### Metadata
Route: `/v1/metadata/`

Definition: [`routes/metadata.js`](routes/metadata.js)

Returns: Original metadata file in specified format, e.g. JSON, TEI-XML, EAD-XML.

Example Usage: When the 'Download metadata' button in the CUDL Viewer is clicked.

### Similarity
Route: `/v1/xtf/similarity/`

Definition: [`routes/similarity.js`](routes/similarity.js)

Returns: JSON file of a list of similar items in collections.

Example Usage: When loading the content for the 'Similar items' tab in the CUDL Viewer.

### Genizah Tags
Route: `/v1/tags/`

Definition: [`routes/tags.js`](routes/tags.js)

Returns: JSON file of a list of annotation tags and their weighting factors.

**NB**: The 'tags' route is not currently in use. CUDL Viewer (that is, CUDL-Viewer-Tagging-UI) uses routes defined in
the CUDL-Viewer code instead (see [CrowdsourcingController](https://bitbucket.org/CUDL/cudl-genizahtagging-server/src/HEAD/src/main/java/ulcambridge/foundations/viewer/crowdsourcing/CrowdsourcingController.java?at=master&fileviewer=file-view-default)).
For more on Genizah Annotation see [Genizah Annotation on the CUDL Wiki](https://wiki.cam.ac.uk/cudl-docs/Genizah_Annotation).

### Transcription
Route: `/v1/transcription/`

Definition: [`routes/transcription.js`](routes/transcription.js)

Returns: Transcription XML file of specified type (e.g. normalized, diplomatic) from internally hosted storage or an
external provider, transformed suitably for browser display.

Example Usage: When loading the content for the 'Transcription' tab in the CUDL Viewer.

### Translation
Route: `/v1/translation/`

Definition: [`routes/translation.js`](routes/translation.js)

Returns: Translation TEI-XML file from internally hosted storage, transformed suitably for browser display.

Example Usage: When loading the content for the 'Translation' tab in the CUDL Viewer.

### Download Images
Route: `/v1/images/download/`

Definition: [`routes/images.ts`](routes/images.ts)

Returns: Takes a IIIF image (with optional height and/or width params) and adds the 'watermark' rights text from JSON.

Example Usage: Downloading image in CUDL.

## Resources in Deployment

CUDL Services sends requests to a variety of resources in its current deployments.

There are 3 deployments (dev, staging, live) that run in two EC2 instances deployed using the
container service ECS on AWS.  These are automatically restarted if they fail, and are accessed through
and elastic load balancer using the route 53 cudl.link domain.  They access transcriptions stored on S3.

In addition, there is 1 VM running for the Darwin Correspondence Project XTF instance, 2 bare metal image servers and 3
servers external to CUDL provided by the originating projects.

![Resources](docs/images/services-resources.png)
(NOTE: Transcriptions now come from s3 rather than from EBS Volumes.)

The [document on Confluence](https://cambridge-collections.atlassian.net/wiki/spaces/ULDevelopers/pages/78577721/Cudl-Services)
contains more details on resources.

# Deploying Services

In order to deploy a new version of cudl-services you need to do the following:

- Run `npm install` to install the packages required.


- Run `make docker-image` to run through the tests and create a new docker image for services.


- Commit and Push changes to Git. NOTE: By default only the main branch will cause the CI to publish the docker image that is created.
You can edit the CI configuration by editing the file at `.github/workflows/workflow.yml` to remove the references to `if: github.ref == 'refs/heads/main'`
or alternatively you can manually create and push an image.


- Check Github CI ran successfully at: [https://github.com/cambridge-collection/cudl-services/actions](https://github.com/cambridge-collection/cudl-services/actions)


- Check that your new image exists on dockerhub at: [https://hub.docker.com/repository/docker/camdl/cudl-services](https://hub.docker.com/repository/docker/camdl/cudl-services)


- Update [cudl-cdk](https://github.com/cambridge-collection/cudl-cdk) `src/main.ts` to use the new image.
