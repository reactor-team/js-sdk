# Matrix-2 World Model Example

An interactive demo showcasing the Reactor JS SDK with the **matrix-2** world model for real-time AI-powered video control.

**Live Demo:** [https://js-sdk-example-matrix-2.vercel.app/](https://js-sdk-example-matrix-2.vercel.app/)

## What This Example Does

This Next.js app demonstrates how to:
- Connect to Reactor's matrix-2 world model for interactive video generation
- Control video generation in real-time using keyboard inputs
- Send control messages (WASD for player movement, IJKL for camera)
- Display AI-generated video with `ReactorView`
- Reset and restart the model as needed

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

### Keyboard Controls

The matrix-2 model responds to keyboard inputs in real-time:

**Player Movement (Blue keys):**
- **W** - Move forward
- **A** - Move left
- **S** - Move backward
- **D** - Move right
- **Q** - Neutral (no movement)

**Camera Control (Green keys):**
- **I** - Look up
- **J** - Look left
- **K** - Look down
- **L** - Look right
- **U** - Neutral (center view)

### Using the App

1. Wait for the model to connect (status indicator will show "Ready")
2. Use the keyboard controls to move and look around
3. Watch as the AI generates video in real-time based on your inputs
4. Press the "Reset Model" button to restart from the beginning
5. Visual feedback shows which keys are currently active

## About the Matrix-Game 2.0 Model

Matrix-Game 2.0 is an open-source, real-time, and streaming interactive world model that generates long videos on-the-fly via few-step auto-regressive diffusion.

Developed by Xianglong He, Chunli Peng, Zexiang Liu, Boyang Wang, Yifan Zhang, Qi Cui, Fei Kang, Biao Jiang, Mengyin An, Yangyang Ren, Baixin Xu, Hao-Xiang Guo, Kaixiong Gong, Cyrus Wu, Wei Li, Xuchen Song, Yang Liu, Eric Li, and Yahui Zhou (Skywork AI)

[Project Page](https://matrix-game-v2.github.io/) - [View on GitHub](https://github.com/SkyworkAI/Matrix-Game/tree/main/Matrix-Game-2)

## Learn More

- [Reactor Website](https://reactor.inc) - Learn more about Reactor and our platform
- [Reactor Documentation](https://docs.reactor.inc) - Learn about Reactor's AI models and SDK
- [Reactor JS SDK](https://github.com/reactor-team/js-sdk) - Explore the SDK repository

## Support

For questions or issues, contact our support team at [team@reactor.inc](mailto:team@reactor.inc).
