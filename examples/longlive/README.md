# Longlive Example

A simple demo application showcasing the Reactor JS SDK with the **longlive** video generation model.

**Live Demo:** [https://js-sdk-example-longlive.vercel.app/](https://js-sdk-example-longlive.vercel.app/)

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

### 2. Set Up Your API Keys

Copy the example environment file and add your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add:
- `NEXT_PUBLIC_REACTOR_API_KEY` - Your Reactor API key
- `OPENAI_API_KEY` - Your OpenAI API key (required for voice input feature)

### 3. Run the Development Server

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How to Use

1. **Text Input**: Enter a prompt in the text field and click "Send"
2. **Voice Input**: Click the microphone button to record your prompt, click again to stop and transcribe
3. Watch as the longlive model generates video based on your prompts
4. Add additional prompts to guide the video generation in real-time
5. Track the current frame position to see where you are in the generation

## About the LongLive Model

LongLive is a frame-level autoregressive framework for real-time and interactive long video generation.

Developed by Shuai Yang, Wei Huang, Ruihang Chu, Yicheng Xiao, Yuyang Zhao, Xianbang Wang, Muyang Li, Enze Xie, Yingcong Chen, Yao Lu, Song Han, and Yukang Chen (NVIDIA Labs)

[Project Page](https://nvlabs.github.io/LongLive) - [View on GitHub](https://github.com/NVlabs/LongLive)

## Learn More

- [Reactor Website](https://reactor.inc) - Learn more about Reactor and our platform
- [Reactor Documentation](https://docs.reactor.inc) - Learn about Reactor's AI models and SDK
- [Reactor JS SDK](https://github.com/reactor-team/js-sdk) - Explore the SDK repository

## Support

For questions or issues, contact our support team at [team@reactor.inc](mailto:team@reactor.inc).
