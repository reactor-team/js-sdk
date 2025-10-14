# StreamDiffusionV2 Example

A real-time video-to-video AI transformation demo showcasing the Reactor JS SDK with the **StreamDiffusionV2** model.

**Live Demo:** [https://js-sdk-stream-diffusion-v2.vercel.app/](https://js-sdk-stream-diffusion-v2.vercel.app/)

## What This Example Does

This Next.js app demonstrates how to:
- Transform webcam video in real-time using AI
- Control video styling with text prompts
- Configure denoising steps for quality/speed balance
- Display side-by-side input and output with `WebcamStream` and `ReactorView`
- Reset and restart the transformation pipeline

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

1. Allow webcam access when prompted
2. Enter a descriptive prompt (e.g., "A cyberpunk cityscape at night with neon lights")
3. Click "Start" to begin the transformation
4. Optionally adjust denoising steps for different quality levels:
   - Fast: `500`
   - Balanced: `700, 500, 200`
   - High Quality: `800, 600, 400, 100`
5. Watch your webcam feed transform in real-time
6. Click "Reset" to start over with a new prompt

## About the StreamDiffusionV2 Model

StreamDiffusionV2 is an open-source interactive diffusion pipeline for real-time streaming applications. 

Developed by Tianrui Feng, Zhi Li, Haocheng Xi, Muyang Li, Shuo Yang, Xiuyu Li, Lvmin Zhang, Kelly Peng, Song Han, Maneesh Agrawala, Kurt Keutzer, Akio Kodaira, and Chenfeng Xu (UC Berkeley, MIT, Stanford University, First Intelligence, UT Austin)

[Project Page](https://streamdiffusionv2.github.io/) - [View on GitHub](https://github.com/chenfengxu714/StreamDiffusionV2)

## Learn More

- [Reactor Website](https://reactor.inc) - Learn more about Reactor and our platform
- [Reactor Documentation](https://docs.reactor.inc) - Learn about Reactor's AI models and SDK
- [Reactor JS SDK](https://github.com/reactor-team/js-sdk) - Explore the SDK repository

## Support

For questions or issues, contact our support team at [team@reactor.inc](mailto:team@reactor.inc).
