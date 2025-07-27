# Ollama Setup for Basefly

Basefly now uses Ollama as the primary AI model provider for local, privacy-focused flight booking assistance.

## Prerequisites

1. **Install Ollama**: Download and install from [ollama.ai](https://ollama.ai)
2. **Start Ollama**: Run `ollama serve` in your terminal
3. **Pull a Model**: Download a model like `llama3.2` or `llama3.1`

## Quick Setup

### 1. Install Ollama
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

### 2. Start Ollama Service
```bash
ollama serve
```

### 3. Pull a Model
```bash
# Recommended model for Basefly
ollama pull llama3.2

# Alternative models
ollama pull llama3.1
ollama pull mistral
ollama pull codellama
```

### 4. Configure Environment
Create a `.env` file in your project root:

```bash
# Ollama Configuration (Primary)
OLLAMA_API_ENDPOINT=http://localhost:11434

# Flight Booking API
DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here

# Optional: Fallback AI providers
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
```

### 5. Start Basefly
```bash
# Development mode
bun run dev

# Production mode
bun run start
```

## Model Recommendations

### For Flight Booking (Recommended)
- **llama3.2**: Best balance of performance and reasoning
- **llama3.1**: Good performance, smaller size
- **mistral**: Fast and efficient

### For Development/Testing
- **llama3.1**: Faster responses, good for testing
- **codellama**: Good for code-related tasks

## Troubleshooting

### Ollama Not Starting
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve
```

### Model Not Found
```bash
# List available models
ollama list

# Pull specific model
ollama pull llama3.2
```

### Performance Issues
- Use smaller models for faster responses
- Ensure adequate RAM (8GB+ recommended)
- Close other resource-intensive applications

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_API_ENDPOINT` | Ollama API endpoint | `http://localhost:11434` |
| `DUFFEL_ACCESS_TOKEN` | Duffel API for flight data | Required |
| `OPENAI_API_KEY` | OpenAI fallback | Optional |
| `ANTHROPIC_API_KEY` | Anthropic fallback | Optional |

## Benefits of Using Ollama

- **Privacy**: All processing happens locally
- **Cost**: No API costs for model usage
- **Speed**: No network latency for model calls
- **Customization**: Can fine-tune models for specific use cases
- **Offline**: Works without internet connection (except for flight data)

## Next Steps

1. Test the setup with a simple flight search
2. Customize the model if needed
3. Set up additional fallback providers if desired
4. Configure your Duffel API token for flight data access 