# Reactor JS SDK Examples

This repository contains example applications demonstrating how to use the [Reactor JS SDK](https://www.npmjs.com/package/@reactor-team/js-sdk) to build interactive AI-powered video experiences.

## About Reactor

[Reactor](https://reactor.inc) is a platform for real-time AI video generation and interaction. Our SDK allows developers to integrate cutting-edge generative AI models into web applications, enabling experiences like relatime text-to-video generation, interactive video control, and more.

## What's Included

This repository provides practical examples showing how to:

- Connect to Reactor's AI models through a simple React interface
- Send real-time prompts and controls to guide realtime video generation
- Display AI-generated video streams in your applications
- Handle model state and connection management
- Build interactive video experiences with keyboard and text inputs

## Available Examples

### LongLive Realtime Video Generation

**Location:** `examples/longlive/`

A Next.js application demonstrating real-time AI video generation with the **longlive** model. Users can:
- Submit text prompts at specific timestamps
- Guide video generation dynamically as it runs
- Track frame position and generation progress
- See results in real-time through the `ReactorView` component

Perfect for understanding prompt-based realtime video generation and how to schedule inputs during generation.

### Matrix-2 World Model

**Location:** `examples/matrix-2/`

A keyboard-controlled interface for the **matrix-2** model, showcasing interactive relatime world models. Features include:
- WASD controls for player movement
- IJKL controls for camera positioning
- Real-time control message sending
- Visual feedback for active inputs
- Model reset functionality

Ideal for learning how to implement interactive control systems for AI realtime world models.

## Quick Start

1. **Choose an example** and navigate to its directory:
   ```bash
   cd examples/longlive
   # or
   cd examples/matrix-2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Set up your API key:**
   ```bash
   cp .env.example .env.local
   ```
   
   Then edit `.env.local` and add your Reactor API key. You can obtain an API key from the [Reactor Dashboard](https://reactor-technologies.readme.io/docs/getting-started).

4. **Run the development server:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

5. **Open your browser** at [http://localhost:3000](http://localhost:3000) and start experimenting!

## Documentation & Resources

- **[Reactor Website](https://reactor.inc)** - Learn more about Reactor and our platform
- **[Getting Started Guide](https://reactor-technologies.readme.io/docs/getting-started)** - Complete setup instructions and tutorials
- **[SDK Documentation](https://reactor-technologies.readme.io/docs/overview)** - Detailed API reference and model information
- **[NPM Package](https://www.npmjs.com/package/@reactor-team/js-sdk)** - Install the SDK in your own projects

## Support

For questions, issues, or feature requests, please visit our [documentation](https://reactor-technologies.readme.io) or contact our support team at [team@reactor.inc](mailto:team@reactor.inc).

---

Built with Reactor - Real-time AI video generation
