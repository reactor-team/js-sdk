# Longlive Example

A simple demo application showcasing the Reactor JS SDK with the **longlive** video generation model.

## What This Example Does

This Next.js app demonstrates how to:
- Connect to Reactor's longlive model for AI video generation
- Send prompts at specific timestamps to guide video creation
- Display real-time video output with `ReactorView`
- Track generation progress and manage model state

## Getting Started

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Set Up Your API Key

Copy the example environment file and add your Reactor API key:

```bash
cp .env.example .env.local
```

Edit `.env.local` and replace `<your-api-key-here>` with your actual Reactor API key.

### 3. Run the Development Server

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How to Use

1. Enter a prompt in the text field
2. Click "Send" to schedule the prompt
3. Watch as the longlive model generates video based on your prompts
4. Add additional prompts to guide the video generation in real-time
5. Track the current frame position to see where you are in the generation

## Learn More

- [Reactor Documentation](https://reactor-technologies.readme.io/docs/overview) - Learn about Reactor's AI models and SDK
- [Reactor JS SDK](https://github.com/reactor-team/js-sdk) - Explore the SDK repository