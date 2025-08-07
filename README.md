# Easeflyt - AI Flight Booking Assistant

Easeflyt is an intelligent flight booking assistant built with ElizaOS. It helps users find and book flights by understanding natural language requests and providing personalized flight recommendations.

## Features

- **Natural Language Flight Search**: Ask for flights in plain English
- **Smart Flight Planning**: Automatically extracts flight details from user requests
- **Real-time Flight Data**: Integrates with Duffel API for live flight information
- **Intelligent Recommendations**: AI-powered flight suggestions based on preferences
- **Round-trip Support**: Handles both one-way and round-trip bookings
- **Flexible Time Preferences**: Supports departure time ranges and cabin class preferences
- **Airport Code Recognition**: Automatically converts city names to IATA airport codes

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- ElizaOS CLI
- Ollama (for local AI models)
- Duffel API access token

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd easeflyt

# Install dependencies
npm install

# Set up environment variables
# Create .env file with your API keys:
# OLLAMA_API_ENDPOINT=http://localhost:11434
# DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here
```

### Development

```bash
# Start development with hot-reloading (recommended)
elizaos dev

# OR start without hot-reloading
elizaos start
# Note: When using 'start', you need to rebuild after changes:
# npm run build

# Test the project
elizaos test
```

## Usage Examples

Easeflyt understands natural language requests like:

- "I need a flight from New York to London next week for 2 people in business class"
- "Find me the cheapest flights from LAX to JFK in March"
- "I want to fly from San Francisco to Tokyo on Friday, returning the following Sunday"
- "Show me economy flights from Chicago to Miami with departure after 2 PM"

## API Integration

### Duffel API
Easeflyt integrates with the Duffel API to provide real-time flight data:
- Live pricing and availability
- Multiple airline options
- Flexible date and time preferences
- Cabin class selection

### AI Integration
Uses local Ollama models to:
- Parse natural language flight requests
- Generate human-readable flight summaries
- Provide intelligent recommendations

For setup instructions, see [OLLAMA_SETUP.md](OLLAMA_SETUP.md)

## Project Structure

```
easeflyt/
├── src/
│   ├── index.ts          # Main entry point
│   ├── character.ts      # AI character definition
│   └── plugin.ts         # Plugin configuration
├── file.ts               # Flight booking action implementation
├── types.ts              # Flight plan schema and types
├── templates.ts          # AI prompt templates
└── README.md            # This file
```

## Testing

ElizaOS provides a comprehensive testing structure for Easeflyt:

### Test Structure

- **Component Tests** (`__tests__/` directory):
  - **Unit Tests**: Test individual functions and components in isolation
  - **Integration Tests**: Test how components work together
  - Run with: `elizaos test component`

- **End-to-End Tests** (`e2e/` directory):
  - Test the flight booking system within a full ElizaOS runtime
  - Run with: `elizaos test e2e`

- **Running All Tests**:
  - `elizaos test` runs both component and e2e tests

### Writing Tests

Component tests use Vitest:

```typescript
// Unit test example (__tests__/flight-booking.test.ts)
describe('Flight Booking', () => {
  it('should parse flight request correctly', () => {
    expect(parseFlightRequest("NYC to LHR")).toBeDefined();
  });
});
```

E2E tests use ElizaOS test interface:

```typescript
// E2E test example (e2e/flight-booking.test.ts)
export class FlightBookingTestSuite implements TestSuite {
  name = 'flight_booking_test_suite';
  tests = [
    {
      name: 'flight_search_workflow',
      fn: async (runtime) => {
        // Test complete flight booking workflow
      },
    },
  ];
}
```

## Configuration

Customize Easeflyt by modifying:

- `src/index.ts` - Main entry point and runtime configuration
- `src/character.ts` - AI character personality and behavior
- `file.ts` - Flight booking action implementation
- `types.ts` - Flight plan schema and validation
- `templates.ts` - AI prompt templates for flight planning

## Environment Variables

Required environment variables:

```bash
# Ollama API endpoint for local AI models
OLLAMA_API_ENDPOINT=http://localhost:11434

# Duffel API Access Token for flight booking
DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here
```

Optional fallback providers:
```bash
# OpenAI API Key (fallback)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API Key (fallback)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.
