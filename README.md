# Worm Project

Worm is a full-stack application that includes both a frontend and a backend component. The frontend is built with Angular, and the backend is built with NestJS. This project aims to provide a secure and efficient platform for managing projects and user data.

## Project Setup

To set up the project, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/bobbyquantum/worm.git
   cd worm
   ```

2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Set up environment variables:
   - Copy the `.env.example` file to `.env` and update the values as needed.

## Development Server

To start the development server, run the following command:
```bash
npm start
```
This will start both the frontend and backend servers. The backend will listen on port 8333 and proxy the frontend. You can connect to this URL for both front and back end provided both servers are running.

## Build

To build the project, run the following command:
```bash
npm run build
```
The build artifacts for the frontend will be stored in the `frontend/dist/` directory, and the backend build will be stored in the `worm-server/dist/` directory.

## Running Tests

To run tests for both the frontend and backend, use the following command:
```bash
npm test
```
This will execute the unit tests for both the frontend and backend projects.
