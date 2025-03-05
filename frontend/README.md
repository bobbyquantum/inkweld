# Inkweld Frontend

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.1.3.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Docker

### Building Docker Image

To build the Docker image for the backend application, run the following command:

```bash
docker build -t server:prod -f server/Dockerfile .
```

### Running Docker Containers

To run the Docker containers using Docker Compose, use the following command:

```bash
docker-compose -f compose.prod.yaml up
```

This will start the `server` and `postgres` services defined in the `compose.prod.yaml` file.

### Pushing Docker Image to GitHub Container Registry

To push the Docker image to GitHub Container Registry, you can use the provided GitHub Action workflow. The workflow is defined in the `.github/workflows/docker-publish.yml` file and will automatically build and push the Docker image when changes are pushed to the `main` branch.
