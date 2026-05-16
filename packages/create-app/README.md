# Create Reactor App

🧩 **Create Reactor App** is a CLI tool that helps you quickly bootstrap a new application using the Reactor SDK. Get started with interactive AI applications in seconds!

## Quick Start

```bash
npx create-reactor-app my-app --model=helios
```

Or with pnpm:

```bash
pnpm dlx create-reactor-app my-app --model=helios
```

## Usage

```bash
npx create-reactor-app [project-name] --model=<name> [options]
```

The model argument is required. If you omit the project name, you will be prompted for it interactively.

**Arguments:**

| Argument       | Description                                         |
| -------------- | --------------------------------------------------- |
| `project-name` | Name of the project to create (prompted if omitted) |

**Options:**

| Option          | Description                                           |
| --------------- | ----------------------------------------------------- |
| `--model`, `-m` | Model to scaffold a project for (required)            |
| `--token`, `-t` | GitHub token for private repository access (optional) |
| `--help`, `-h`  | Show help message                                     |

**Examples:**

```bash
# Project name first, model flag after
npx create-reactor-app my-app --model=helios

# Flag first, project name after
npx create-reactor-app --model=lingbot my-app

# Project name omitted — you will be prompted for it
npx create-reactor-app --model=helios

# With a GitHub token (only needed if the template repo is private)
npx create-reactor-app my-app --model=helios --token ghp_xxxxxxxxxxxx
```

### Available Models

Templates live in the [`reactor-team/reactor-experiments`](https://github.com/reactor-team/reactor-experiments) repository. By default the model name maps 1:1 to a top-level folder of the same name (e.g. `--model=helios` clones the `helios/` folder).

The CLI also supports an optional alias map (`MODEL_MAP` in `bin/create-reactor-app.ts`) for cases where the public model name needs to differ from the folder name. It is empty by default — add an entry only when you want a name → folder rename.

Run the CLI without `--model` to see the list of available models in the templates repo. The output lists explicit aliases first (with the resolved folder shown after `→`) and then any remaining unmapped folders.

### Private Repository Access

If the templates repository is private, you will be prompted for a GitHub token when fetching the template list or cloning fails. You can also pass `--token` (or `-t`) directly to skip the prompt.

## Getting Started After Creation

After creating your project:

```bash
cd your-project-name
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see your application running. Make sure to setup your API keys first!

## Examples Repository

All templates are sourced from the official examples in the [Reactor SDK repository](https://github.com/reactor-team/js-sdk). You can browse the examples directory to see the full source code and understand how each template works.

## Documentation

For comprehensive guides, API references, and tutorials, visit the official Reactor documentation:

📚 **[Reactor Documentation](https://docs.reactor.inc)**

## Requirements

- Node.js 16 or later
- pnpm (recommended) or npm

## Local Development

To test or develop the CLI locally:

```bash
# Navigate to the create-app package
cd packages/create-app

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Link it globally
pnpm link --global
```

Now you can use `create-reactor-app` anywhere on your system:

```bash
create-reactor-app my-app
```

To unlink when you're done:

```bash
pnpm unlink --global
```

## License

ISC License - Copyright (c) Reactor Technologies, Inc.

## Support

- 📖 [Documentation](https://docs.reactor.inc)
- 💻 [Examples Repository](https://github.com/reactor-team/js-sdk)
- 🐛 [Report Issues](https://github.com/reactor-team/js-sdk/issues)

---

**Happy building with Reactor! 🚀**
