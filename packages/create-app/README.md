# Create Reactor App

🧩 **Create Reactor App** is a CLI tool that helps you quickly bootstrap a new application using the Reactor SDK. Get started with interactive AI applications in seconds!

## Quick Start

```bash
npx create-reactor-app my-app
```

Or with pnpm:

```bash
pnpm dlx create-reactor-app my-app
```

## Usage

### Interactive Mode

Simply run the command without arguments to be prompted for project details:

```bash
npx create-reactor-app
```

You'll be asked to:

1. Enter your project name
2. Select a template from available options

### Command Line Arguments

You can also provide arguments directly:

```bash
npx create-reactor-app [project-name] [template]
```

**Examples:**

````bash
# Create a project with longlive template
npx create-reactor-app my-game longlive

# Create a project with matrix template
npx create-reactor-app my-matrix-app matrix-2


### Available Templates

The CLI automatically fetches the latest templates from the repository.

## Getting Started After Creation

After creating your project:

```bash
cd your-project-name
pnpm dev
````

Open [http://localhost:3000](http://localhost:3000) in your browser to see your application running. Make sure to setup your API keys first!

## Examples Repository

All templates are sourced from the official examples in the [Reactor SDK repository](https://github.com/reactor-team/js-sdk). You can browse the examples directory to see the full source code and understand how each template works.

## Documentation

For comprehensive guides, API references, and tutorials, visit the official Reactor documentation:

📚 **[Reactor Documentation](https://reactor-technologies.readme.io/docs/overview)**

## Requirements

- Node.js 16 or later
- pnpm (recommended) or npm

## License

ISC License - Copyright (c) Reactor Technologies, Inc.

## Support

- 📖 [Documentation](https://reactor-technologies.readme.io/docs/overview)
- 💻 [Examples Repository](https://github.com/reactor-team/js-sdk)
- 🐛 [Report Issues](https://github.com/reactor-team/js-sdk/issues)

---

**Happy building with Reactor! 🚀**
