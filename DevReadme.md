# Developer Reference Guide (DevReadme)

This document serves as a comprehensive technical reference for developers working on the **SecureChat** application. It outlines the complete technology stack, all dependencies, development tools, and third-party services used across the frontend and backend.

---

## 🏗️ Architecture Overview

SecureChat is a Full-Stack MERN application (MongoDB, Express, React, Node.js) augmented with WebSockets for real-time communication and Redis for performance caching and state management.

---

## 🎨 Frontend Technologies (Client-Side)

The frontend is a single-page application (SPA) built for speed, responsiveness, and a premium user experience.

### Core Dependencies (`dependencies`)

- **`react` (v19+)**: The core UI library for building reactive, component-based user interfaces.
- **`react-dom` (v19+)**: Serves as the entry point to the DOM and server renderers for React.
- **`react-router-dom` (v7+)**: Handles client-side routing for seamless navigation without page reloads.
- **`socket.io-client` (v4+)**: The client-side library for establishing WebSocket connections to enable real-time messaging, typing indicators, and presence tracking.

### Development Tools (`devDependencies`)

- **`vite` (v8+)**: Next-generation frontend tooling used as the bundler and development server. Provides lightning-fast HMR (Hot Module Replacement) and optimized production builds.
- **`@vitejs/plugin-react`**: Provides Fast Refresh support for React in Vite.
- **`@vitejs/plugin-basic-ssl`**: Used to generate self-signed certificates so the local development server can run over HTTPS (critical for certain browser APIs like Push Notifications or Clipboard).
- **`eslint` & Plugins (`@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`)**: Enforces code quality, syntax consistency, and React best practices (like the Rules of Hooks).
- **`@types/react` & `@types/react-dom`**: TypeScript type definitions for React, enabling better code-completion and IntelliSense in editors like VSCode even in a standard JS project.

### Styling & UI

- **Vanilla CSS**: Custom, highly-optimized CSS leveraging CSS Variables for dynamic Dark/Light theming, complex animations, and Glassmorphism effects without the bloat of external UI frameworks.

---

## ⚙️ Backend Technologies (Server-Side)

The backend is a robust REST API coupled with a WebSocket server, designed to handle authentication, file uploads, and high-concurrency messaging.

### Core Dependencies (`dependencies`)

- **`express` (v5+)**: Fast, unopinionated web framework for building the REST API routes and handling HTTP requests.
- **`mongoose` (v9+)**: Elegant MongoDB object modeling (ODM) for Node.js, providing schema validation, querying, and business logic hooks.
- **`socket.io` (v4+)**: Manages bidirectional, event-based communication for the real-time chat infrastructure.
- **`dotenv`**: Loads environment variables from a `.env` file into `process.env`.
- **`cors`**: Express middleware to enable secure Cross-Origin Resource Sharing between the frontend and backend.

### Authentication & Security

- **`jsonwebtoken`**: Used for secure, stateless user authentication and session management via JWTs.
- **`bcryptjs`**: Safely hashes user passwords before storing them in the database to protect against data breaches.
- **`ua-parser-js`**: Parses the `User-Agent` string to extract detailed device, OS, and browser information for security logs and active session tracking.

### Media & File Management

- **`multer`**: Node.js middleware for handling `multipart/form-data`, primarily used for parsing file uploads from the client.
- **`cloudinary`**: The Cloudinary SDK for Node.js. Interfaces with the Cloudinary API to manage and serve media.
- **`multer-storage-cloudinary`**: A Multer storage engine that streams uploaded files directly to Cloudinary, avoiding the need to temporarily store files on the local server disk.

### Caching & Notifications

- **`redis` (v4+)**: The official Node.js Redis client. Used to connect to the Upstash Redis database for high-performance data caching.
- **`web-push`**: Implements the VAPID protocol to send native push notifications to browsers even when the app is closed or backgrounded.

---

## ☁️ Third-Party Services & Integrations

- **MongoDB Atlas**: Fully-managed cloud database service hosting the primary application data (users, messages, settings).
- **Upstash (Redis)**: Serverless Redis database used for real-time caching mechanisms to reduce MongoDB load (e.g., tracking online users, caching active chat lists).
- **Cloudinary**: Acts as the central "Image DB" and CDN. Automatically processes, optimizes, and hosts all user-uploaded images, files, and profile pictures.

---

## 🚀 Future Development Notes

- **Environment Variables**: Ensure you have configured the `.env` files for both frontend and backend appropriately (Vite requires `VITE_` prefix for frontend variables). This includes MongoDB URIs, Upstash Redis credentials, Cloudinary API keys, VAPID keys for web-push, and JWT secrets.
- **Caching Strategy**: Redis is heavily utilized. If you encounter stale data issues in the UI, verify that cache invalidation rules (specifically around active chats and friend lists) are triggering correctly on backend state mutations.
- **Socket Lifecycle**: The application relies on a single persistent socket connection per client. Always handle disconnections, reconnections, and race conditions gracefully, especially when managing online/offline states.
