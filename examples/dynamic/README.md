# Dynamic UI Example (LOCAL)

## IMPORTANT - This is a LOCAL example! It will only work if you are running the model backend locally!

A simple demo application showcasing the Reactor JS SDK with the **dynamic UI**, that works for **any** video generation model ran locally.

The UI of this example is dynamically generated based on the JSON schema emitted by the model. It is built using the <ReactorController /> component, which automatically requires from the model the capabalities, which the model sends back as a JSON schema.

This UI is specifically built for **local** development. It's the best demo UI to start from when developing your own model, in order to try the model's functionality and debug it without needing to completely develop a website demo.

To learn how to build your own model and use this UI, check out the runtime docs: https://docs.reactor.inc/runtime

## What This Example Does

This Next.js app demonstrates how to:
- Connect to Reactor's local model
- see the UI dynamically appear with no custom code
- Send commands using parameters and buttons dynamically generated

## Getting Started

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Run the Development Server

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Learn More

- [Reactor Website](https://reactor.inc) - Learn more about Reactor and our platform
- [Reactor Documentation](https://docs.reactor.inc) - Learn about Reactor's AI models and SDK
- [Reactor Model Development](https://docs.reactor.inc/runtime) - Learn how to run a model locally and deploy it to the reactor ecosystem
- [Reactor JS SDK](https://github.com/reactor-team/js-sdk) - Explore the SDK repository

## Support

For questions or issues, contact our support team at [team@reactor.inc](mailto:team@reactor.inc).
